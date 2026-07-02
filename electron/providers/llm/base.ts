// ============================================================
// LLM Provider Interface
// ============================================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Abstract interface for Large Language Model providers.
 * Implementations: DeepSeek, OpenAI, Qwen, etc.
 */
export interface LLMProvider {
  readonly name: string;

  /**
   * Send a chat completion request.
   * @param messages - Conversation messages
   * @param options - Optional generation parameters
   * @returns The assistant's response
   */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
}
