// ============================================================
// ZhipuAI (GLM) LLM Provider
// ============================================================
//
// ZhipuAI exposes an OpenAI-compatible chat completions API.
// This thin wrapper provides sensible defaults so users only
// need to supply an API key.
//
// API Docs: https://open.bigmodel.cn/dev/api
// ============================================================

import { LLMProvider } from './base';
import { OpenAICompatibleProvider } from './openai';

const ZHIPU_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';
const DEFAULT_MODEL = 'glm-4-flash';

/**
 * Create a ZhipuAI (GLM) LLM provider.
 *
 * Under the hood this uses {@link OpenAICompatibleProvider} since
 * ZhipuAI follows the OpenAI chat completions contract.
 */
export function createZhipuProvider(apiKey: string, model?: string): LLMProvider {
  return new OpenAICompatibleProvider(apiKey, {
    baseUrl: ZHIPU_BASE_URL,
    model: model ?? DEFAULT_MODEL,
    name: 'ZhipuAI',
  });
}
