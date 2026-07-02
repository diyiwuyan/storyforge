// ============================================================
// DeepSeek LLM Provider
// ============================================================

import { LLMProvider, ChatMessage, ChatOptions, ChatResponse } from './base';

const DEFAULT_MODEL = 'deepseek-chat';
const API_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';

/**
 * LLM provider backed by the DeepSeek API.
 *
 * Uses the standard OpenAI-compatible chat completions format.
 */
export class DeepSeekProvider implements LLMProvider {
  readonly name = 'DeepSeek';
  private readonly apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('[DeepSeekProvider] apiKey is required');
    }
    this.apiKey = apiKey;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const body = {
      model: DEFAULT_MODEL,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
    };

    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `[DeepSeekProvider] API request failed (${res.status}): ${text}`
      );
    }

    const json = await res.json() as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error(
        '[DeepSeekProvider] Unexpected response shape: missing choices[0].message.content'
      );
    }

    return {
      content,
      usage: json.usage ? {
        promptTokens: json.usage.prompt_tokens ?? 0,
        completionTokens: json.usage.completion_tokens ?? 0,
        totalTokens: json.usage.total_tokens ?? 0,
      } : undefined,
    };
  }
}
