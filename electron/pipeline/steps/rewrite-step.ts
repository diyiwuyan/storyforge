// ============================================================
// Step 2: 智能改写 (Rewrite)
// ============================================================

import { BaseStep } from '../base-step';
import { StepId, StepContext, StepResult } from '../types';
import { createLLMProvider } from '../../providers/llm/factory';
import { getSettings } from '../../store/settings';

/**
 * RewriteStep calls an LLM to rewrite the cleaned text into
 * a compelling short-video voiceover script, plus generate
 * a title, cover text, publish copy, and hashtags.
 */
export class RewriteStep extends BaseStep {
  readonly id: StepId = 'rewrite';
  readonly name = '智能改写';
  readonly description = '调用 AI 将文案改写为口播风格，并生成标题和发布文案';
  readonly dependencies: StepId[] = ['review'];

  async execute(ctx: StepContext): Promise<StepResult> {
    ctx.onProgress(0, '准备改写...');

    const cleanedText = ctx.data.cleanedText;
    if (!cleanedText) {
      throw new Error('缺少预审后的文案（cleanedText），请先执行文案预审步骤');
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

    ctx.onProgress(20, '构建提示词...');

    // Build system prompt based on content track (custom prompt overrides if present)
    const systemPrompt = this.buildSystemPrompt(ctx.config.track, ctx.config.customPrompts?.rewrite);
    const userPrompt = `原文：\n${cleanedText}`;

    ctx.onProgress(30, '调用 AI 改写中（可能需要 30-60 秒）...');

    // Call LLM
    const response = await llm.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], {
      temperature: 0.7,
      maxTokens: 4096,
    });

    // Check cancellation after API call
    if (ctx.signal.aborted) {
      throw new Error('已取消');
    }

    ctx.onProgress(80, '解析 AI 返回结果...');

    // Parse the JSON response
    const parsed = this.parseResponse(response.content);

    ctx.onProgress(100, '改写完成');

    return {
      data: {
        rewrittenBody: parsed.body,
        rewrittenTitle: parsed.title,
        coverText: parsed.coverText,
        publishText: parsed.publishText,
        hashtags: parsed.hashtags,
        comments: parsed.comments,
      },
    };
  }

  /**
   * Build a system prompt tailored to the content track.
   * If a custom prompt is provided, use it directly.
   */
  private buildSystemPrompt(track: string, customPrompt?: string): string {
    if (customPrompt) {
      return customPrompt;
    }

    const trackGuide = this.getTrackGuide(track);

    return `你是一个专业的短视频口播文案改写专家。请将以下文案改写为适合口播的版本。

赛道：${track}
${trackGuide}

要求：
1. 保留核心故事和情节，但用更口语化、更有感染力的方式重新表达
2. 开头要有强力 hook，能在前 3 秒抓住观众
3. 节奏紧凑，每句话都有信息量
4. 适当使用短句和反问句增强节奏感
5. 结尾要有升华或情感共鸣
6. 全文适合朗读，避免书面化表达
7. 生成 3-5 条"评论预埋"，即模拟观众视角的评论，用于发布后引导互动、提升评论量。评论要自然真实，像真实用户会说的话，避免广告感

请严格以 JSON 格式输出（不要包含 markdown 代码块标记）：
{"body":"改写后的正文","title":"视频标题（15字以内）","coverText":"封面文案（8字以内）","publishText":"发布文案（50字以内）","hashtags":["标签1","标签2","标签3"],"comments":["评论预埋1","评论预埋2","评论预埋3"]}`;
  }

  /**
   * Return track-specific writing guidance.
   */
  private getTrackGuide(track: string): string {
    const guides: Record<string, string> = {
      '人物故事': '风格指导：注重人物情感表达，用细节打动人心，营造沉浸感。',
      '健康图书': '风格指导：权威但亲和，用通俗语言解释专业知识，注重可操作性。',
      '民间故事': '风格指导：用生动的叙述还原民间传说，注重画面感和故事性，语气略带神秘。',
      '文化科普': '风格指导：深入浅出，用类比和比喻降低理解门槛，增加趣味性。',
      '绘本故事': '风格指导：温暖童趣，用简洁生动的语言讲述故事，适合家庭亲子场景。',
      '电商带货': '风格指导：突出产品卖点和使用场景，语言简练有力，制造紧迫感。',
      '心灵鸡汤': '风格指导：共情力强，直击内心，用反问和金句引发思考和情感共鸣。',
      '历史人文': '风格指导：故事性强，用悬念和转折吸引观众，语气稳重有力。',
      '情感心理': '风格指导：共情力强，直击内心，用反问和金句引发思考。',
      '科普知识': '风格指导：深入浅出，用类比和比喻降低理解门槛，增加趣味性。',
    };

    return guides[track] ?? '风格指导：自然流畅，有感染力，适合口播表达。';
  }

  /**
   * Parse the LLM JSON response. Handles possible markdown code block wrapping.
   */
  private parseResponse(content: string): {
    body: string;
    title: string;
    coverText: string;
    publishText: string;
    hashtags: string[];
    comments: string[];
  } {
    // Strip markdown code block if present
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      // Remove opening ``` (with optional language tag) and closing ```
      jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    try {
      const parsed = JSON.parse(jsonStr);

      // Validate required fields
      if (!parsed.body || typeof parsed.body !== 'string') {
        throw new Error('返回结果缺少 body 字段');
      }

      return {
        body: parsed.body,
        title: parsed.title ?? '未命名视频',
        coverText: parsed.coverText ?? '',
        publishText: parsed.publishText ?? '',
        hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
        comments: Array.isArray(parsed.comments) ? parsed.comments : [],
      };
    } catch (err: unknown) {
      // If JSON parsing fails, try to extract content heuristically
      const bodyMatch = content.match(/"body"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (bodyMatch) {
        return {
          body: bodyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
          title: this.extractField(content, 'title') ?? '未命名视频',
          coverText: this.extractField(content, 'coverText') ?? '',
          publishText: this.extractField(content, 'publishText') ?? '',
          hashtags: [],
          comments: this.extractComments(content),
        };
      }

      const errMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`AI 返回结果解析失败: ${errMsg}\n原始返回: ${content.substring(0, 500)}`);
    }
  }

  /**
   * Attempt to extract a simple string field from semi-valid JSON.
   */
  private extractField(content: string, field: string): string | null {
    const regex = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'i');
    const match = content.match(regex);
    return match ? match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : null;
  }

  /**
   * Attempt to extract the comments array from semi-valid JSON.
   * Looks for "comments":["...","..."] pattern and extracts each string element.
   */
  private extractComments(content: string): string[] {
    // Try to find the comments array
    const arrayMatch = content.match(/"comments"\s*:\s*\[([\s\S]*?)\]/);
    if (!arrayMatch) return [];

    // Extract individual string values from the array
    const items: string[] = [];
    const itemRegex = /"((?:[^"\\]|\\.)*)"/g;
    let itemMatch: RegExpExecArray | null;
    while ((itemMatch = itemRegex.exec(arrayMatch[1])) !== null) {
      const text = itemMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
      if (text.trim()) items.push(text);
    }

    return items;
  }
}
