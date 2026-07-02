// ============================================================
// LLM Provider Factory
// ============================================================

import { LLMProvider, ChatMessage, ChatOptions, ChatResponse } from './base';
import { ClaudeProvider } from './claude';
import { DeepSeekProvider } from './deepseek';
import { createMiniMaxProvider } from './minimax';
import { OpenAICompatibleProvider } from './openai';
import { createZhipuProvider } from './zhipu';
import { getSettings } from '../../store/settings';

export interface LLMProviderConfig {
  provider: string;   // 'deepseek' | 'openai' | 'qwen' | 'claude' | 'zhipu' | 'minimax' | 'agnes'
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

/**
 * Create an LLM provider instance based on configuration.
 */
export function createLLMProvider(config: LLMProviderConfig): LLMProvider {
  const { provider, apiKey, model, baseUrl } = config;

  switch (provider) {
    case 'deepseek':
      return new DeepSeekProvider(apiKey);

    case 'openai':
      return new OpenAICompatibleProvider(apiKey, {
        baseUrl: baseUrl ?? 'https://api.openai.com/v1',
        model: model ?? 'gpt-4o-mini',
        name: 'OpenAI',
      });

    case 'qwen':
      return new OpenAICompatibleProvider(apiKey, {
        baseUrl: baseUrl ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        model: model ?? 'qwen-plus',
        name: 'Qwen',
      });

    case 'claude':
      return new ClaudeProvider(apiKey, model);

    case 'zhipu':
      return createZhipuProvider(apiKey, model);

    case 'minimax':
      return createMiniMaxProvider(apiKey, model);

    case 'agnes':
      return new OpenAICompatibleProvider(apiKey, {
        baseUrl: baseUrl ?? 'https://apihub.agnes-ai.com/v1',
        model: model ?? 'agnes-2.0-flash',
        name: 'Agnes AI',
      });

    default:
      throw new Error(
        `Unknown LLM provider: "${provider}". Supported: deepseek, openai, qwen, claude, zhipu, minimax, agnes`
      );
  }
}

// ============================================================
// LLM with Automatic Fallback
// ============================================================

/**
 * A wrapper LLMProvider that automatically falls back to a backup
 * provider when the primary one fails.
 */
class FallbackLLMProvider implements LLMProvider {
  readonly name: string;

  constructor(
    private readonly primary: LLMProvider,
    private readonly backup: LLMProvider,
  ) {
    this.name = `${primary.name} → ${backup.name}`;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    try {
      return await this.primary.chat(messages, options);
    } catch (primaryErr: unknown) {
      const errMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      console.warn(
        `[FallbackLLM] 主模型 ${this.primary.name} 调用失败: ${errMsg}，正在切换到备用模型 ${this.backup.name}...`,
      );
      try {
        return await this.backup.chat(messages, options);
      } catch (backupErr: unknown) {
        const backupMsg = backupErr instanceof Error ? backupErr.message : String(backupErr);
        throw new Error(
          `主模型（${this.primary.name}）失败: ${errMsg}\n备用模型（${this.backup.name}）也失败: ${backupMsg}`,
        );
      }
    }
  }
}

/**
 * Create an LLM provider that reads settings and, if a backup is
 * configured, wraps the primary + backup in a FallbackLLMProvider.
 *
 * Pipeline steps should call this instead of plain `createLLMProvider`.
 */
export function createLLMWithFallback(): LLMProvider {
  const settings = getSettings();

  const primary = createLLMProvider({
    provider: settings.llm.provider,
    apiKey: settings.llm.apiKey,
    model: settings.llm.model,
  });

  const backup = settings.llm.backup;
  if (backup && backup.provider && backup.apiKey) {
    const backupProvider = createLLMProvider({
      provider: backup.provider,
      apiKey: backup.apiKey,
      model: backup.model,
    });
    return new FallbackLLMProvider(primary, backupProvider);
  }

  return primary;
}
