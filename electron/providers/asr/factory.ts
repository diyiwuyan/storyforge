// ============================================================
// ASR Provider Factory
// ============================================================

import { ASRProvider } from './base';
import { WhisperASRProvider } from './whisper';

export interface ASRProviderConfig {
  provider: string;   // 'whisper'
  apiKey: string;
  baseUrl?: string;
}

/**
 * Create an ASR provider instance based on configuration.
 */
export function createASRProvider(config: ASRProviderConfig): ASRProvider {
  const { provider, apiKey, baseUrl } = config;

  switch (provider) {
    case 'whisper':
      return new WhisperASRProvider(apiKey, baseUrl);

    default:
      throw new Error(
        `Unknown ASR provider: "${provider}". Supported: whisper`
      );
  }
}
