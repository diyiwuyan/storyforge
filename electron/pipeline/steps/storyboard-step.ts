// ============================================================
// Step 3: 影视分镜 (Storyboard)
// ============================================================

import { BaseStep } from '../base-step';
import { StepId, StepContext, StepResult, Segment } from '../types';
import { createLLMWithFallback } from '../../providers/llm/factory';

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

    // Create LLM provider (with automatic fallback if backup configured)
    const llm = createLLMWithFallback();

    // Check cancellation
    if (ctx.signal.aborted) {
      throw new Error('已取消');
    }

    ctx.onProgress(20, '构建分镜提示词...');

    // Use custom storyboard prompt if provided, otherwise use default
    const systemPrompt = ctx.config.customPrompts?.storyboard || `你是一个专业的影视分镜师，擅长将文案拆解为视频分镜。请将以下口播文案拆分为分镜序列。

要求：
1. 每个分镜对应 1-2 句话（30-80 字为宜）
2. 为每个分镜生成画面描述（用于后续 AI 配图）
3. 画面描述要具体、有画面感，适合 AI 绘图
4. 画面风格统一：电影质感 / 暖色调 / 自然光线
5. 注意情绪递进：开头抓人 → 中间展开 → 结尾升华
6. 整体分镜数量 5-15 个，根据文案长度灵活调整
7. 保持原文内容不变，只做段落切分

请严格以 JSON 数组格式输出（不要包含 markdown 代码块标记）：
[
  {
    "text": "配音文本（这句话要念出来）",
    "visual": "画面描述（英文，用于生成 AI 图片的 prompt）",
    "mood": "情绪标签（如：悑疑/温暖/震撼/平静/紧张/感动）"
  },
  ...
]`;

    ctx.onProgress(30, '调用 AI 进行分镜拆解...');

    const chatMessages: Parameters<typeof llm.chat>[0] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: rewrittenBody },
    ];
    const chatOptions = { temperature: 0.3, maxTokens: 4096 };

    // Attempt 1
    let response = await llm.chat(chatMessages, chatOptions);

    // Check cancellation after API call
    if (ctx.signal.aborted) {
      throw new Error('已取消');
    }

    ctx.onProgress(60, '解析分镜结果...');

    // Parse the response — if it fails, retry once with a hint
    let rawSegments = this.parseResponse(response.content);

    if (rawSegments.length === 0) {
      // Retry once: re-prompt the LLM asking for stricter JSON
      ctx.onProgress(65, '首次解析失败，正在重试...');
      console.warn('[Storyboard] 首次 parse 返回空，触发重试。原始返回:', response.content.substring(0, 300));

      if (ctx.signal.aborted) throw new Error('已取消');

      response = await llm.chat([
        ...chatMessages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: '上面的输出格式不正确，请严格以纯 JSON 数组格式重新输出，不要包含任何 markdown 标记或多余文字。' },
      ], chatOptions);

      if (ctx.signal.aborted) throw new Error('已取消');

      rawSegments = this.parseResponse(response.content);

      if (rawSegments.length === 0) {
        throw new Error(
          'AI 未能生成有效的分镜段落（已自动重试一次）。\n'
          + '可能原因：API Key 余额不足、模型不支持 JSON 输出、或网络波动。\n'
          + '建议：在设置中配置一个备用 LLM API，系统会在主 API 失败时自动切换。',
        );
      }
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
        visual: seg.visual,   // 画面描述（英文）
        mood: seg.mood,       // 情绪标签
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
  private parseResponse(content: string): Array<{ text: string; visual?: string; mood?: string }> {
    // Strip markdown code block if present
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    const extractItems = (arr: any[]): Array<{ text: string; visual?: string; mood?: string }> => {
      return arr
        .filter(
          (item: any) =>
            typeof item === 'object' &&
            item !== null &&
            typeof item.text === 'string' &&
            item.text.trim().length > 0
        )
        .map((item: any) => ({
          text: item.text.trim(),
          visual: typeof item.visual === 'string' ? item.visual.trim() : undefined,
          mood: typeof item.mood === 'string' ? item.mood.trim() : undefined,
        }));
    };

    try {
      const parsed = JSON.parse(jsonStr);

      if (!Array.isArray(parsed)) {
        throw new Error('返回结果不是数组格式');
      }

      const valid = extractItems(parsed);

      if (valid.length === 0) {
        throw new Error('解析后没有有效的分镜段落');
      }

      return valid;
    } catch (err: unknown) {
      // Attempt to salvage: look for array pattern in response
      const arrayMatch = content.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          const fallback = JSON.parse(arrayMatch[0]);
          if (Array.isArray(fallback)) {
            const items = extractItems(fallback);
            if (items.length > 0) return items;
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
