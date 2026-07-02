// ============================================================
// Step 1: 文案预审 (Review)
// ============================================================

import { BaseStep } from '../base-step';
import { StepId, StepContext, StepResult } from '../types';

/**
 * ReviewStep performs local text pre-processing:
 * - Removes excessive blank lines
 * - Strips promotional / spam content (follow, like, share, links)
 * - Normalizes whitespace
 *
 * No API calls are made; this is pure local text cleaning.
 */
export class ReviewStep extends BaseStep {
  readonly id: StepId = 'review';
  readonly name = '文案预审';
  readonly description = '清理原始文案，去除广告词和多余空行';
  readonly dependencies: StepId[] = [];

  async execute(ctx: StepContext): Promise<StepResult> {
    ctx.onProgress(0, '开始文案预审...');

    const originalText = ctx.config.originalText;
    if (!originalText || originalText.trim().length === 0) {
      throw new Error('原始文案为空，无法进行预审');
    }

    // Check cancellation
    if (ctx.signal.aborted) {
      throw new Error('已取消');
    }

    ctx.onProgress(20, '去除广告词和推广内容...');

    // Step 1: Remove promotional patterns
    let text = this.removePromotionalContent(originalText);

    // Check cancellation
    if (ctx.signal.aborted) {
      throw new Error('已取消');
    }

    ctx.onProgress(50, '清理格式和多余空行...');

    // Step 2: Normalize whitespace and blank lines
    text = this.normalizeWhitespace(text);

    // Check cancellation
    if (ctx.signal.aborted) {
      throw new Error('已取消');
    }

    ctx.onProgress(80, '最终检查...');

    // Step 3: Final trim and validation
    text = text.trim();

    if (text.length === 0) {
      throw new Error('清理后文案为空，原文可能全是广告内容');
    }

    ctx.onProgress(100, '文案预审完成');

    return {
      data: {
        cleanedText: text,
      },
    };
  }

  /**
   * Remove promotional keywords, URLs, and spam patterns.
   */
  private removePromotionalContent(text: string): string {
    // Remove URLs (http/https links)
    let result = text.replace(/https?:\/\/[^\s\u4e00-\u9fff]+/g, '');

    // Remove common promotional phrases (Chinese social media)
    const promotionalPatterns = [
      /关注[我们]*[一下]*/g,
      /点赞[一下]*/g,
      /转发[一下]*/g,
      /收藏[一下]*/g,
      /双击[一下]*/g,
      /评论区[见留言]*[一下]*/g,
      /点击[下方]*链接/g,
      /私信[我们]*/g,
      /加微信/g,
      /加V/g,
      /扫码/g,
      /免费领取/g,
      /限时[优惠免费]*/g,
      /粉丝福利/g,
      /直播间[见等]*/g,
      /#\S+#/g,           // Hashtag markers in source text (like #话题#)
      /@\S+/g,            // @ mentions
    ];

    for (const pattern of promotionalPatterns) {
      result = result.replace(pattern, '');
    }

    // Remove lines that are purely promotional (very short lines with promotional cues)
    const lines = result.split('\n');
    const filteredLines = lines.filter(line => {
      const trimmed = line.trim();
      // Keep non-empty lines that aren't just punctuation or very short promotional remnants
      if (trimmed.length === 0) return true; // preserve blank lines for now (normalize later)
      if (trimmed.length <= 2 && /^[，。！？、；：""''【】\s]+$/.test(trimmed)) return false;
      return true;
    });

    return filteredLines.join('\n');
  }

  /**
   * Normalize whitespace: collapse multiple blank lines, trim each line.
   */
  private normalizeWhitespace(text: string): string {
    // Trim each line
    const lines = text.split('\n').map(line => line.trim());

    // Collapse multiple consecutive blank lines into a single one
    const result: string[] = [];
    let prevBlank = false;

    for (const line of lines) {
      if (line.length === 0) {
        if (!prevBlank) {
          result.push('');
          prevBlank = true;
        }
        // Skip additional blank lines
      } else {
        result.push(line);
        prevBlank = false;
      }
    }

    return result.join('\n');
  }
}
