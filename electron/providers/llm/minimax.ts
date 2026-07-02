// ============================================================
// MiniMax LLM Provider
// ============================================================
//
// MiniMax exposes an OpenAI-compatible chat completions API.
// This thin wrapper provides sensible defaults so users only
// need to supply an API key.
//
// API Docs: https://platform.minimaxi.com/document
// ============================================================

import { LLMProvider } from './base';
import { OpenAICompatibleProvider } from './openai';

const MINIMAX_BASE_URL = 'https://api.minimax.chat/v1';
const DEFAULT_MODEL = 'MiniMax-Text-01';

/**
 * Create a MiniMax LLM provider.
 *
 * Under the hood this uses {@link OpenAICompatibleProvider} since
 * MiniMax follows the OpenAI chat completions contract.
 */
export function createMiniMaxProvider(apiKey: string, model?: string): LLMProvider {
  return new OpenAICompatibleProvider(apiKey, {
    baseUrl: MINIMAX_BASE_URL,
    model: model ?? DEFAULT_MODEL,
    name: 'MiniMax',
  });
}
