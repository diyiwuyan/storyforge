// ============================================================
// Claude (Anthropic) LLM Provider
// ============================================================

import { LLMProvider, ChatMessage, ChatOptions, ChatResponse } from './base';

const API_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Message format expected by the Anthropic Messages API.
 * System messages are extracted and sent as a top-level `system` field;
 * only `user` and `assistant` roles appear in the `messages` array.
 */
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * LLM provider backed by the Anthropic Messages API.
 *
 * Key differences from the OpenAI-compatible format:
 *   - Authentication via `x-api-key` header (not Bearer token)
 *   - System prompt is a top-level field, not a message
 *   - `max_tokens` is required
 *   - Response content lives in `content[0].text`
 */
export class ClaudeProvider implements LLMProvider {
  readonly name = 'Claude';
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model?: string) {
    if (!apiKey) {
      throw new Error('[ClaudeProvider] apiKey is required');
    }
    this.apiKey = apiKey;
    this.model = model ?? DEFAULT_MODEL;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    // Separate system messages from conversation messages.
    // Anthropic expects system as a top-level string, not inside the messages array.
    const systemParts: string[] = [];
    const conversationMessages: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemParts.push(msg.content);
      } else {
        conversationMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages: conversationMessages,
      max_tokens: options?.maxTokens ?? 4096,
    };

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    if (systemParts.length > 0) {
      body.system = systemParts.join('\n\n');
    }

    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `[ClaudeProvider] API request failed (${res.status}): ${text}`
      );
    }

    const json = await res.json() as {
      content?: { type?: string; text?: string }[];
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
      };
    };

    // Extract the first text block from the content array
    const textBlock = json.content?.find((block) => block.type === 'text');
    const content = textBlock?.text;

    if (typeof content !== 'string') {
      throw new Error(
        '[ClaudeProvider] Unexpected response shape: missing content[].text'
      );
    }

    const inputTokens = json.usage?.input_tokens ?? 0;
    const outputTokens = json.usage?.output_tokens ?? 0;

    return {
      content,
      usage: json.usage ? {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
      } : undefined,
    };
  }
}
