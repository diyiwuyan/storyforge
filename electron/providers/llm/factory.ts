// ============================================================
// LLM Provider Factory
// ============================================================

import { LLMProvider } from './base';
import { ClaudeProvider } from './claude';
import { DeepSeekProvider } from './deepseek';
import { createMiniMaxProvider } from './minimax';
import { OpenAICompatibleProvider } from './openai';
import { createZhipuProvider } from './zhipu';

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
