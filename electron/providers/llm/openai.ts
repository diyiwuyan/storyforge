// ============================================================
// OpenAI-Compatible LLM Provider
// ============================================================

import { LLMProvider, ChatMessage, ChatOptions, ChatResponse } from './base';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

export interface OpenAICompatibleConfig {
  /** Base URL of the OpenAI-compatible API (without trailing slash). */
  baseUrl?: string;
  /** Default model to use when not specified per-call. */
  model?: string;
  /** Human-readable name for logging. */
  name?: string;
}

/**
 * Generic LLM provider for any API that follows the OpenAI
 * chat completions contract.
 *
 * Works with OpenAI, Qwen (dashscope), Kimi (moonshot), and
 * any other provider that exposes `/chat/completions`.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(apiKey: string, config?: OpenAICompatibleConfig) {
    if (!apiKey) {
      throw new Error('[OpenAICompatibleProvider] apiKey is required');
    }
    this.apiKey = apiKey;
    this.baseUrl = (config?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.defaultModel = config?.model ?? DEFAULT_MODEL;
    this.name = config?.name ?? 'OpenAI';
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const url = `${this.baseUrl}/chat/completions`;

    const body = {
      model: this.defaultModel,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
    };

    // Use a 120-second timeout (some providers like Agnes AI can be slow)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (fetchErr: unknown) {
      clearTimeout(timeoutId);
      if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
        throw new Error(`[${this.name}] API 请求超时（120 秒），请检查网络或更换服务商`);
      }
      throw new Error(`[${this.name}] 网络请求失败: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `[${this.name}Provider] API request failed (${res.status}): ${text}`
      );
    }

    const json = await res.json() as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error(
        `[${this.name}Provider] Unexpected response shape: missing choices[0].message.content`
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
