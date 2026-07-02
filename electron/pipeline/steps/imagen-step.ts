// ============================================================
// Step 5: 批量生图 (Image Generation)
// ============================================================

import fs from 'fs';
import path from 'path';
import { BaseStep } from '../base-step';
import { StepId, StepContext, StepResult, Segment } from '../types';
import { ImagenProvider } from '../../providers/imagen/base';
import {
  createImagenProvider,
  createSmartFallback,
  FallbackProviderEntry,
} from '../../providers/imagen/factory';
import { createLLMProvider } from '../../providers/llm/factory';
import { LLMProvider } from '../../providers/llm/base';
import { getSettings } from '../../store/settings';

/** Maximum concurrent image generation requests */
const MAX_CONCURRENCY = 3;

/**
 * ImagenStep generates images for each storyboard segment
 * using the configured image generation provider.
 *
 * Features:
 * - Resume capability: skips segments that already have images on disk
 * - Parallel execution: up to 3 concurrent generation requests
 * - Fault tolerance: individual failures don't block other images
 * - SmartFallback: when fallback providers are configured, wraps all
 *   engines in a 5-level degradation chain (retry -> sanitize ->
 *   LLM rewrite -> switch engine -> placeholder image)
 */
export class ImagenStep extends BaseStep {
  readonly id: StepId = 'imagen';
  readonly name = '批量生图';
  readonly description = '为每个分镜生成 AI 配图';
  readonly dependencies: StepId[] = ['prompt'];

  /**
   * Can skip if all segments already have valid image files on disk.
   */
  canSkip(ctx: StepContext): boolean {
    const segments = ctx.data.segments;
    if (!segments || segments.length === 0) return false;

    return segments.every(seg => {
      if (!seg.imagePath) return false;
      return fs.existsSync(seg.imagePath);
    });
  }

  async execute(ctx: StepContext): Promise<StepResult> {
    ctx.onProgress(0, '准备批量生图...');

    const segments = ctx.data.segments;
    if (!segments || segments.length === 0) {
      throw new Error('缺少分镜数据（segments），请先执行提示词生成步骤');
    }

    // Verify all segments have imagePrompt
    const segmentsWithPrompt = segments.filter(seg => seg.imagePrompt);
    if (segmentsWithPrompt.length === 0) {
      throw new Error('所有分镜均缺少绘图提示词（imagePrompt），请先执行提示词生成步骤');
    }

    // Check cancellation
    if (ctx.signal.aborted) {
      throw new Error('已取消');
    }

    ctx.onProgress(5, '初始化生图服务...');

    // Build the provider — SmartFallback when fallbacks are configured,
    // otherwise a single direct provider for backward compatibility.
    const provider = this.buildProvider();

    // Determine image dimensions based on aspect ratio
    const { width, height } = this.getImageDimensions(ctx.config.aspectRatio);

    // Prepare output directory
    const imagesDir = path.join(ctx.projectDir, 'images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    // Check cancellation
    if (ctx.signal.aborted) {
      throw new Error('已取消');
    }

    // Process segments with concurrency control
    const updatedSegments: Segment[] = [...segments];
    const errors: Array<{ index: number; error: string }> = [];
    let completedCount = 0;
    const totalCount = segmentsWithPrompt.length;

    // Create a queue of segments that need generation
    const queue: Segment[] = segmentsWithPrompt.filter(seg => {
      const targetPath = path.join(imagesDir, `segment_${seg.index}.png`);
      // Skip if image already exists (resume capability)
      if (seg.imagePath && fs.existsSync(seg.imagePath)) {
        completedCount++;
        return false;
      }
      if (fs.existsSync(targetPath)) {
        // Image exists but segment.imagePath not set — fix it
        updatedSegments[seg.index] = { ...updatedSegments[seg.index], imagePath: targetPath };
        completedCount++;
        return false;
      }
      return true;
    });

    if (queue.length === 0) {
      ctx.onProgress(100, '所有图片已存在，跳过生成');
      return { data: { segments: updatedSegments } };
    }

    ctx.onProgress(10, `需要生成 ${queue.length} 张图片（已跳过 ${completedCount} 张）...`);

    // Process in batches of MAX_CONCURRENCY
    for (let i = 0; i < queue.length; i += MAX_CONCURRENCY) {
      // Check cancellation before each batch
      if (ctx.signal.aborted) {
        throw new Error('已取消');
      }

      const batch = queue.slice(i, i + MAX_CONCURRENCY);

      const batchPromises = batch.map(async (seg) => {
        const savePath = path.join(imagesDir, `segment_${seg.index}.png`);

        try {
          const result = await provider.generate(
            {
              prompt: seg.imagePrompt!,
              width,
              height,
            },
            savePath
          );

          // Update the segment with the generated image path
          updatedSegments[seg.index] = { ...updatedSegments[seg.index], imagePath: result.imagePath };
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          errors.push({ index: seg.index, error: errMsg });
          console.error(`[ImagenStep] Failed to generate image for segment ${seg.index}: ${errMsg}`);
        }

        completedCount++;
        const progress = Math.round(10 + (completedCount / totalCount) * 85);
        ctx.onProgress(progress, `生成进度：${completedCount}/${totalCount}`);
      });

      await Promise.all(batchPromises);
    }

    // Report results
    const successCount = totalCount - errors.length;

    if (errors.length > 0 && successCount === 0) {
      throw new Error(
        `所有图片生成失败。第一个错误: ${errors[0].error}`
      );
    }

    if (errors.length > 0) {
      ctx.onProgress(95, `生图完成，${successCount} 成功，${errors.length} 失败`);
      console.warn(
        `[ImagenStep] ${errors.length} images failed:`,
        errors.map(e => `segment_${e.index}: ${e.error}`).join('; ')
      );
    }

    ctx.onProgress(100, `批量生图完成：${successCount}/${totalCount} 张`);

    return {
      data: {
        segments: updatedSegments,
      },
    };
  }

  // ----------------------------------------------------------------
  // Provider construction
  // ----------------------------------------------------------------

  /**
   * Build the appropriate image generation provider based on settings.
   *
   * When `imagen.fallbackProviders` is configured and non-empty, the
   * primary provider is combined with all fallback entries into a
   * SmartFallback chain.  An LLM provider is also instantiated (if
   * configured) to enable Level-3 prompt rewriting.
   *
   * Otherwise, a single direct provider is created (preserving the
   * original behavior for users who have not configured fallbacks).
   */
  private buildProvider(): ImagenProvider {
    const settings = getSettings();
    const { provider, apiKey, model, fallbackProviders } = settings.imagen;

    // Simple path: no fallback list configured
    if (!fallbackProviders || fallbackProviders.length === 0) {
      return createImagenProvider({ provider, apiKey, model });
    }

    // Build the ordered entry list: primary first, then fallbacks
    const entries: FallbackProviderEntry[] = [
      { provider, apiKey, model },
      ...fallbackProviders,
    ];

    // Try to create an LLM provider for Level-3 prompt rewriting.
    // If LLM is not configured (no API key), SmartFallback will
    // simply skip Level 3 — it is optional.
    let llmProvider: LLMProvider | undefined;
    try {
      if (settings.llm.apiKey) {
        llmProvider = createLLMProvider({
          provider: settings.llm.provider,
          apiKey: settings.llm.apiKey,
          model: settings.llm.model,
        });
      }
    } catch (err) {
      console.warn(
        '[ImagenStep] Could not create LLM provider for prompt rewriting, Level-3 will be skipped:',
        err instanceof Error ? err.message : String(err)
      );
    }

    console.log(
      `[ImagenStep] Using SmartFallback with ${entries.length} provider(s)` +
      `${llmProvider ? ' + LLM prompt rewriting' : ''}`
    );

    return createSmartFallback(entries, llmProvider);
  }

  /**
   * Get image dimensions based on the configured aspect ratio.
   */
  private getImageDimensions(aspectRatio: '9:16' | '16:9'): { width: number; height: number } {
    const { IMAGE_DIMENSIONS, DEFAULT_IMAGE_DIMENSIONS } = require('../../shared/style-constants');
    return IMAGE_DIMENSIONS[aspectRatio] ?? DEFAULT_IMAGE_DIMENSIONS;
  }
}
