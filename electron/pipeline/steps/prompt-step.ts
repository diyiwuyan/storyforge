// ============================================================
// Step 4: 提示词生成 (Prompt Generation)
// ============================================================

import { BaseStep } from '../base-step';
import { StepId, StepContext, StepResult, Segment } from '../types';
import { createLLMWithFallback } from '../../providers/llm/factory';
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

    // Create LLM provider (with automatic fallback if backup configured)
    const llm = createLLMWithFallback();

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

    // Build character consistency instructions
    let characterConsistencyRule = `
7. 角色一致性策略（重要！）：
   - 在第一个分镜中详细定义主角外观：年龄、性别、发型发色、服装色彩、体型特征
   - 后续每个分镜必须重复相同的人物描述（如 "a 30-year-old East Asian man with short black hair, wearing a navy blue shirt"）
   - 不要用模糊表述如 "same character"，要用具体外观特征重复
   - 如果文案中有多个角色，每个角色都要有固定且一致的描述
`;
    if (ctx.config.referenceImagePath) {
      characterConsistencyRule += `   - 本视频有人像参考图，请确保主角特征与参考图一致
`;
    }

    // Build the prompt for all segments at once for consistency
    // Use custom image prompt if provided, otherwise use default
    const systemPrompt = ctx.config.customPrompts?.imagePrompt || `你是一个专业的 AI 绘图提示词工程师。请为以下短视频的每个分镜场景生成英文绘图提示词（prompt）。

画风要求：${styleDisplayName}（${styleSuffix}）

视觉风格锚定（全部分镜必须统一）：
cinematic photography, warm golden-hour lighting, soft bokeh background, film grain, 35mm lens, shallow depth of field, high detail

生成规则：
1. 每个 prompt 用英文描述画面内容，80-120 词，尽可能具体详细
2. 包含：主体外观、场景环境、动作姿态、光线方向、镜头构图（特写/中景/远景）、情绪氛围
3. 所有 prompt 的色调、光线、摄影风格必须统一，确保视觉连贯性
4. 不要包含任何文字/水印/UI 元素，只描述视觉画面
5. 每个 prompt 末尾自动附加画风后缀
6. 每个场景附带 "negativePrompt" 字段，包含要排除的元素，不超过 30 词
${characterConsistencyRule}
请严格以 JSON 数组格式输出（不要包含 markdown 代码块标记）：
[{"prompt":"第1个分镜的英文绘图提示词","negativePrompt":"需要排除的元素"},{"prompt":"第2个分镜的英文绘图提示词","negativePrompt":"需要排除的元素"},...]

以下是各分镜的口播文本：`;

    // Include visual hints from storyboard if available
    const segmentTexts = segments
      .map((seg, i) => {
        let line = `分镜${i + 1}：${seg.text}`;
        if (seg.visual) line += `\n   画面描述参考：${seg.visual}`;
        if (seg.mood) line += `\n   情绪：${seg.mood}`;
        return line;
      })
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
