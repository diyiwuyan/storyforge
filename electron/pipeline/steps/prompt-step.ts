// ============================================================
// Step 4: 提示词生成 (Prompt Generation)
// ============================================================

import { BaseStep } from '../base-step';
import { StepId, StepContext, StepResult, Segment } from '../types';
import { createLLMProvider } from '../../providers/llm/factory';
import { getSettings } from '../../store/settings';
import { STYLE_MAP, DEFAULT_STYLE } from '../../shared/style-constants';

/**
 * PromptStep generates image generation prompts for each storyboard segment.
 * It calls the LLM once with all segments to produce coherent visual prompts.
 */
export class PromptStep extends BaseStep {
  readonly id: StepId = 'prompt';
  readonly name = '提示词生成';
  readonly description = '为每个分镜生成 AI 绘图提示词';
  readonly dependencies: StepId[] = ['storyboard'];

  async execute(ctx: StepContext): Promise<StepResult> {
    ctx.onProgress(0, '准备生成绘图提示词...');

    const segments = ctx.data.segments;
    if (!segments || segments.length === 0) {
      throw new Error('缺少分镜数据（segments），请先执行影视分镜步骤');
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

    // Determine style suffix
    const style = ctx.config.style;
    let styleSuffix: string;
    let styleDisplayName = style;

    if (style.startsWith('custom:')) {
      // 自定义画风：从 StyleManager 读取 promptSuffix
      const customId = style.slice('custom:'.length);
      const { getStyleManager } = await import('../../style/style-manager');
      const styleMgr = getStyleManager();
      const customStyle = styleMgr.getById(customId);
      if (customStyle) {
        styleSuffix = customStyle.promptSuffix;
        styleDisplayName = customStyle.name;
      } else {
        console.warn(`[PromptStep] 自定义画风 ${customId} 未找到，使用默认风格`);
        styleSuffix = DEFAULT_STYLE;
      }
    } else {
      styleSuffix = STYLE_MAP[style] ?? DEFAULT_STYLE;
    }

    // Check cancellation
    if (ctx.signal.aborted) {
      throw new Error('已取消');
    }

    ctx.onProgress(20, '构建提示词生成请求...');

    // Build reference image character consistency instructions if provided
    let characterConsistencyRule = '';
    if (ctx.config.referenceImagePath) {
      characterConsistencyRule = `
7. 主角形象参考描述（必须严格遵守）：
   由于本视频有固定主角形象，请在每个分镜中保持以下人物特征一致：
   - 你需要根据视频的上下文推断主角的年龄、性别、发型、肤色、体型等特征
   - 在每个分镜的 prompt 中必须包含一致的人物外观描述
   - 使用 "same character as before" 或 "consistent character appearance" 等短语强调一致性
`;
    }

    // Build the prompt for all segments at once for consistency
    // Use custom image prompt if provided, otherwise use default
    const systemPrompt = ctx.config.customPrompts?.imagePrompt || `你是一个专业的 AI 绘图提示词工程师。请为以下短视频的每个分镜场景生成英文绘图提示词（prompt）。

画风要求：${styleDisplayName}（${styleSuffix}）

生成规则：
1. 每个 prompt 用英文描述画面内容，50-100 词
2. 包含主体、场景、动作、光线、构图等元素
3. 所有 prompt 风格统一，保持视觉一致性
4. 不要包含文字内容，只描述视觉画面
5. 每个 prompt 末尾自动附加画风描述
6. 每个场景对象还需要一个 "negativePrompt" 字段，写出需要排除的元素（如 watermark, text, blurry, deformed 等），不超过 30 词
${characterConsistencyRule}
请严格以 JSON 数组格式输出（不要包含 markdown 代码块标记）：
[{"prompt":"第1个分镜的英文绘图提示词","negativePrompt":"需要排除的元素"},{"prompt":"第2个分镜的英文绘图提示词","negativePrompt":"需要排除的元素"},...]

以下是各分镜的口播文本：`;

    const segmentTexts = segments
      .map((seg, i) => `分镜${i + 1}：${seg.text}`)
      .join('\n');

    ctx.onProgress(30, `为 ${segments.length} 个分镜生成提示词中...`);

    // Call LLM
    const response = await llm.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: segmentTexts },
    ], {
      temperature: 0.7,
      maxTokens: 4096,
    });

    // Check cancellation after API call
    if (ctx.signal.aborted) {
      throw new Error('已取消');
    }

    ctx.onProgress(75, '解析提示词结果...');

    // Parse the response
    const prompts = this.parseResponse(response.content, segments.length);

    // Merge prompts into segments, appending style suffix
    const updatedSegments: Segment[] = segments.map((seg, i) => {
      const parsed = prompts[i];
      const rawPrompt = parsed?.prompt ?? `A cinematic scene depicting: ${seg.text}`;
      const negativePrompt = parsed?.negativePrompt;
      // Append style suffix if not already included
      const fullPrompt = rawPrompt.toLowerCase().includes(styleSuffix.split(',')[0].toLowerCase())
        ? rawPrompt
        : `${rawPrompt}, ${styleSuffix}`;

      return {
        ...seg,
        imagePrompt: fullPrompt,
        ...(negativePrompt ? { negativePrompt } : {}),
      };
    });

    ctx.onProgress(100, `提示词生成完成，共 ${updatedSegments.length} 条`);

    return {
      data: {
        segments: updatedSegments,
      },
    };
  }

  /**
   * Parse the LLM JSON array response containing prompts (and optional negativePrompt).
   * Returns an array of objects: { prompt: string; negativePrompt?: string } or plain strings.
   */
  private parseResponse(content: string, expectedCount: number): Array<{ prompt: string; negativePrompt?: string }> {
    // Strip markdown code block if present
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    const extractItems = (arr: any[]): Array<{ prompt: string; negativePrompt?: string }> => {
      return arr
        .map((item: any) => {
          if (typeof item === 'string') return { prompt: item };
          if (typeof item?.prompt === 'string') {
            return {
              prompt: item.prompt,
              ...(typeof item.negativePrompt === 'string' ? { negativePrompt: item.negativePrompt } : {}),
            };
          }
          return null;
        })
        .filter((p): p is { prompt: string; negativePrompt?: string } => p !== null && p.prompt.length > 0);
    };

    try {
      const parsed = JSON.parse(jsonStr);

      if (!Array.isArray(parsed)) {
        throw new Error('返回结果不是数组格式');
      }

      const prompts = extractItems(parsed);

      if (prompts.length === 0) {
        throw new Error('解析后没有有效的提示词');
      }

      // If LLM returned fewer prompts than segments, pad with generic ones
      while (prompts.length < expectedCount) {
        prompts.push({ prompt: 'A cinematic scene, detailed composition, professional lighting' });
      }

      return prompts;
    } catch (err: unknown) {
      // Attempt to salvage: look for array pattern
      const arrayMatch = content.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          const fallback = JSON.parse(arrayMatch[0]);
          if (Array.isArray(fallback)) {
            const prompts = extractItems(fallback);
            if (prompts.length > 0) {
              while (prompts.length < expectedCount) {
                prompts.push({ prompt: 'A cinematic scene, detailed composition, professional lighting' });
              }
              return prompts;
            }
          }
        } catch {
          // Fall through to error
        }
      }

      const errMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`提示词结果解析失败: ${errMsg}\n原始返回: ${content.substring(0, 500)}`);
    }
  }
}
