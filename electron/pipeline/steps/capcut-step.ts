// ============================================================
// Step 7: 剪映打包 (CapCut Draft Assembly)
// ============================================================

import { BaseStep } from '../base-step';
import { StepId, StepContext, StepResult } from '../types';
import { DraftBuilder, BuildInput, SegmentInput } from '../../capcut/draft-builder';
import { DraftWriter } from '../../capcut/draft-writer';
import { getSettings } from '../../store/settings';
import { getBGMManager } from '../../bgm/bgm-manager';

/**
 * CapcutStep assembles all generated assets (images, audio) into
 * a CapCut/剪映 draft that can be opened directly in the editor.
 *
 * Inputs:
 * - segments[].imagePath (from imagen step)
 * - segments[].text and duration (from storyboard step)
 * - audioPath and audioDuration (from tts step)
 * - config.aspectRatio for canvas dimensions
 *
 * Output:
 * - draftPath: the path to the generated CapCut draft folder
 */
export class CapcutStep extends BaseStep {
  readonly id: StepId = 'capcut';
  readonly name = '剪映打包';
  readonly description = '将图片和音频打包为剪映草稿，可直接导入剪映编辑';
  readonly dependencies: StepId[] = ['imagen', 'tts'];

  async execute(ctx: StepContext): Promise<StepResult> {
    ctx.onProgress(0, '准备打包剪映草稿...');

    // Validate inputs
    const segments = ctx.data.segments;
    const audioPath = ctx.data.audioPath;
    const audioDuration = ctx.data.audioDuration;

    if (!segments || segments.length === 0) {
      throw new Error('缺少分镜数据（segments），请先执行之前的步骤');
    }

    if (!audioPath) {
      throw new Error('缺少配音文件路径（audioPath），请先执行 TTS 配音步骤');
    }

    if (!audioDuration || audioDuration <= 0) {
      throw new Error('配音时长无效（audioDuration），请重新执行 TTS 配音步骤');
    }

    // Filter segments that have valid images
    const validSegments = segments.filter(seg => seg.imagePath);
    if (validSegments.length === 0) {
      throw new Error('没有成功生成图片的分镜，无法打包剪映草稿');
    }

    // Check cancellation
    if (ctx.signal.aborted) {
      throw new Error('已取消');
    }

    ctx.onProgress(20, '计算画布尺寸和时间轴...');

    // Determine canvas dimensions from aspect ratio
    const { canvasWidth, canvasHeight } = this.getCanvasDimensions(ctx.config.aspectRatio);

    // Adjust segment durations to match audio duration
    const adjustedSegments = this.adjustDurations(validSegments, audioDuration);

    // Check cancellation
    if (ctx.signal.aborted) {
      throw new Error('已取消');
    }

    ctx.onProgress(40, '构建剪映草稿数据结构...');

    // Build segment inputs for DraftBuilder
    const segmentInputs: SegmentInput[] = adjustedSegments.map(seg => ({
      text: seg.text,
      imagePath: seg.imagePath!,
      duration: seg.duration!,
    }));

    // Resolve BGM path if a bgmId is configured
    let bgmPath: string | undefined;
    if (ctx.config.bgmId) {
      const bgmManager = getBGMManager();
      const bgm = bgmManager.getBGM(ctx.config.bgmId);
      if (bgm) {
        bgmPath = bgm.filePath;
      }
    }

    // Construct build input
    const title = ctx.data.rewrittenTitle || ctx.config.name || '未命名项目';
    const buildInput: BuildInput = {
      title,
      segments: segmentInputs,
      audioPath,
      audioDuration,
      canvasWidth,
      canvasHeight,
      bgmPath,
    };

    // Build draft content
    const builder = new DraftBuilder();
    const draftContent = builder.build(buildInput);

    // Check cancellation
    if (ctx.signal.aborted) {
      throw new Error('已取消');
    }

    ctx.onProgress(70, '写入剪映草稿文件...');

    // Write the draft to the CapCut drafts directory
    const settings = getSettings();
    const customDraftsDir = settings.capcutDraftsDir;

    const writer = new DraftWriter();
    const draftPath = await writer.write(draftContent, title, customDraftsDir);

    // Check cancellation
    if (ctx.signal.aborted) {
      throw new Error('已取消');
    }

    ctx.onProgress(100, `剪映草稿已生成: ${title}`);

    return {
      data: {
        draftPath,
      },
    };
  }

  /**
   * Get canvas dimensions based on aspect ratio.
   */
  private getCanvasDimensions(aspectRatio: '9:16' | '16:9'): {
    canvasWidth: number;
    canvasHeight: number;
  } {
    const { CANVAS_DIMENSIONS } = require('../../shared/style-constants');
    const dims = CANVAS_DIMENSIONS[aspectRatio] ?? CANVAS_DIMENSIONS['9:16'];
    return { canvasWidth: dims.width, canvasHeight: dims.height };
  }

  /**
   * Adjust segment durations proportionally so that the total image
   * duration matches the audio duration.
   *
   * This ensures the voiceover and visuals stay in sync.
   */
  private adjustDurations(
    segments: Array<{ index: number; text: string; imagePath?: string; imagePrompt?: string; duration?: number }>,
    audioDuration: number
  ): Array<{ index: number; text: string; imagePath?: string; imagePrompt?: string; duration: number }> {
    // Calculate total original duration
    const totalOriginalDuration = segments.reduce(
      (sum, seg) => sum + (seg.duration ?? 5),
      0
    );

    // Scale factor to match audio duration
    const scaleFactor = audioDuration / totalOriginalDuration;

    return segments.map(seg => {
      const originalDuration = seg.duration ?? 5;
      // Scale and ensure minimum 2 seconds per segment
      const adjustedDuration = Math.max(2, Math.round(originalDuration * scaleFactor * 10) / 10);

      return {
        ...seg,
        duration: adjustedDuration,
      };
    });
  }
}
