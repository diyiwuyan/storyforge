// ============================================================
// Step 3: 影视分镜 (Storyboard)
// ============================================================

import { BaseStep } from '../base-step';
import { StepId, StepContext, StepResult, Segment } from '../types';
import { createLLMProvider } from '../../providers/llm/factory';
import { getSettings } from '../../store/settings';

/** Characters per second for duration estimation (approx. 5 chars/sec for Chinese) */
const CHARS_PER_SECOND = 5;

/** Minimum duration for a segment in seconds */
const MIN_SEGMENT_DURATION = 3;

/** Maximum duration for a segment in seconds */
const MAX_SEGMENT_DURATION = 15;

/**
 * StoryboardStep splits the rewritten body into multiple scenes/shots,
 * each representing one visual frame in the final video.
 *
 * Each segment is 30-80 characters and maps to one image.
 */
export class StoryboardStep extends BaseStep {
  readonly id: StepId = 'storyboard';
  readonly name = '影视分镜';
  readonly description = '将文案拆分为多个分镜段落，每段对应一张配图';
  readonly dependencies: StepId[] = ['rewrite'];

  async execute(ctx: StepContext): Promise<StepResult> {
    ctx.onProgress(0, '准备分镜拆解...');

    const rewrittenBody = ctx.data.rewrittenBody;
    if (!rewrittenBody) {
      throw new Error('缺少改写后的文案（rewrittenBody），请先执行智能改写步骤');
    }

    // Check cancellation
    if (ctx.signal.aborted) {
      throw new Error('已取消');
    }

    ctx.onProgress(10, '初始化 LLM 服务...');

    // Get LLM settings and create provider
    const settings = getSettings();
    const llm = createLLMProvider({
      provider: settings.llm.provider,
      apiKey: settings.llm.apiKey,
      model: settings.llm.model,
    });

    // Check cancellation
    if (ctx.signal.aborted) {
      throw new Error('已取消');
    }

    ctx.onProgress(20, '构建分镜提示词...');

    // Use custom storyboard prompt if provided, otherwise use default
    const systemPrompt = ctx.config.customPrompts?.storyboard || `你是一个专业的短视频分镜师。请将以下口播文案拆分为多个分镜段落。

要求：
1. 每个分镜段落 30-80 个字，对应视频中的一个画面
2. 按照叙事逻辑和情感节奏划分，不要在句子中间断开
3. 每个分镜要完整表达一个场景或情绪
4. 整体分镜数量根据文案长度灵活调整（通常 5-15 个分镜）
5. 保持原文内容不变，只做段落切分

请严格以 JSON 数组格式输出（不要包含 markdown 代码块标记）：
[{"text":"第一个分镜的口播文本"},{"text":"第二个分镜的口播文本"},...]`;

    ctx.onProgress(30, '调用 AI 进行分镜拆解...');

    // Call LLM
    const response = await llm.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: rewrittenBody },
    ], {
      temperature: 0.3,
      maxTokens: 4096,
    });

    // Check cancellation after API call
    if (ctx.signal.aborted) {
      throw new Error('已取消');
    }

    ctx.onProgress(70, '解析分镜结果...');

    // Parse the response
    const rawSegments = this.parseResponse(response.content);

    if (rawSegments.length === 0) {
      throw new Error('AI 未能生成有效的分镜段落');
    }

    ctx.onProgress(85, '计算各分镜时长...');

    // Build Segment objects with duration estimation
    const segments: Segment[] = rawSegments.map((seg, index) => {
      const charCount = seg.text.length;
      let duration = charCount / CHARS_PER_SECOND;

      // Clamp duration to reasonable bounds
      duration = Math.max(MIN_SEGMENT_DURATION, Math.min(MAX_SEGMENT_DURATION, duration));
      // Round to one decimal place
      duration = Math.round(duration * 10) / 10;

      return {
        index,
        text: seg.text,
        duration,
      };
    });

    ctx.onProgress(100, `分镜完成，共 ${segments.length} 个镜头`);

    return {
      data: {
        segments,
      },
    };
  }

  /**
   * Parse the LLM JSON array response.
   */
  private parseResponse(content: string): Array<{ text: string }> {
    // Strip markdown code block if present
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    try {
      const parsed = JSON.parse(jsonStr);

      if (!Array.isArray(parsed)) {
        throw new Error('返回结果不是数组格式');
      }

      // Validate and filter valid segments
      const valid = parsed.filter(
        (item: unknown): item is { text: string } =>
          typeof item === 'object' &&
          item !== null &&
          'text' in item &&
          typeof (item as any).text === 'string' &&
          (item as any).text.trim().length > 0
      );

      if (valid.length === 0) {
        throw new Error('解析后没有有效的分镜段落');
      }

      return valid.map(item => ({ text: item.text.trim() }));
    } catch (err: unknown) {
      // Attempt to salvage: look for array pattern in response
      const arrayMatch = content.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          const fallback = JSON.parse(arrayMatch[0]);
          if (Array.isArray(fallback) && fallback.length > 0) {
            return fallback
              .filter((item: any) => item?.text && typeof item.text === 'string')
              .map((item: any) => ({ text: item.text.trim() }));
          }
        } catch {
          // Fall through to error
        }
      }

      const errMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`分镜结果解析失败: ${errMsg}\n原始返回: ${content.substring(0, 500)}`);
    }
  }
}
