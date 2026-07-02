// ============================================================
// TTS Provider Factory
// ============================================================

import { TTSProvider } from './base';
import { EdgeTTSProvider } from './edge-tts';
import { VolcanoTTSProvider } from './volcano';
import { MiniMaxTTSProvider } from './minimax';

export interface TTSProviderConfig {
  provider: string;       // 'edge' | 'volcano' | 'minimax'
  voice?: string;         // default voice (unused at factory level, passed per-call)

  // Volcano Engine credentials
  appId?: string;         // Volcano app ID
  token?: string;         // Volcano access token

  // MiniMax credentials
  apiKey?: string;        // MiniMax API key
}

/**
 * Create a TTS provider instance based on configuration.
 *
 * Supported providers:
 *   - 'edge'    — Microsoft Edge TTS via edge-tts CLI (no credentials needed)
 *   - 'volcano' — Volcano Engine (ByteDance) TTS (requires appId + token)
 *   - 'minimax' — MiniMax T2A v2 TTS (requires apiKey)
 */
export function createTTSProvider(config: TTSProviderConfig): TTSProvider {
  const { provider } = config;

  switch (provider) {
    case 'edge':
      return new EdgeTTSProvider();

    case 'volcano':
      return new VolcanoTTSProvider({
        appId: config.appId ?? '',
        token: config.token ?? '',
      });

    case 'minimax':
      return new MiniMaxTTSProvider({
        apiKey: config.apiKey ?? '',
      });

    default:
      throw new Error(
        `Unknown TTS provider: "${provider}". Supported: edge, volcano, minimax`
      );
  }
}
