// ============================================================
// MiniMax TTS Provider
// ============================================================
//
// Uses the MiniMax T2A v2 (Text-to-Audio) API.
// API docs: https://www.minimaxi.com/document/T2A%20V2
//
// Authentication:
//   Header: Authorization: Bearer {apiKey}
//
// The API may return audio data in multiple formats:
//   1. data.audio as base64 string (data.audio_type === "base64")
//   2. data.audio as hex string (data.audio_type === "hex")
//   3. data.audio_url as a download URL (stream mode)
//
// Preset voice types (for future UI selection):
//   male-qn-qingse     — 青涩男声 (default)
//   male-qn-jingying   — 精英男声
//   male-qn-badao      — 霸道男声
//   female-shaonv      — 少女声
//   female-yujie       — 御姐声
//   female-chengshu    — 成熟女声
//   preschool_male     — 预设正太音
//   english_radiant    — English Radiant
// ============================================================

import fs from 'fs';
import path from 'path';
import { TTSProvider, TTSOptions, TTSResult } from './base';

/** MiniMax T2A v2 API endpoint */
const MINIMAX_TTS_ENDPOINT = 'https://api.minimax.chat/v1/t2a_v2';

/** Default model */
const DEFAULT_MODEL = 'speech-02-hd';

/** Default voice ID */
const DEFAULT_VOICE = 'male-qn-qingse';

/** Maximum text length per request */
const MAX_TEXT_LENGTH = 5000;

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 60_000;

/** Download timeout for URL-based responses */
const DOWNLOAD_TIMEOUT_MS = 60_000;

export interface MiniMaxTTSConfig {
  /** MiniMax API key */
  apiKey: string;
  /** Model name, defaults to 'speech-02-hd' */
  model?: string;
}

interface MiniMaxTTSRequestBody {
  model: string;
  text: string;
  voice_setting: {
    voice_id: string;
    speed: number;
    vol?: number;
    pitch?: number;
  };
  audio_setting?: {
    sample_rate?: number;
    bitrate?: number;
    format?: string;
  };
}

interface MiniMaxTTSResponse {
  data?: {
    audio?: string;       // base64 or hex encoded audio
    audio_type?: string;  // "base64" | "hex" | "url"
    audio_url?: string;   // download URL (stream mode)
    status?: number;
  };
  base_resp?: {
    status_code: number;
    status_msg: string;
  };
  extra_info?: {
    audio_length?: number;  // duration in milliseconds
  };
}

/**
 * TTS provider for MiniMax.
 *
 * Requires an API key from the MiniMax platform.
 * Handles multiple response formats: base64, hex, and URL download.
 */
export class MiniMaxTTSProvider implements TTSProvider {
  readonly name = 'MiniMaxTTS';

  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: MiniMaxTTSConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
  }

  async synthesize(options: TTSOptions, savePath: string): Promise<TTSResult> {
    // Validate credentials
    if (!this.apiKey) {
      throw new Error(
        '[MiniMaxTTSProvider] Missing API key. ' +
        'Set tts.apiKey in settings to use MiniMax TTS.'
      );
    }

    const text = options.text?.trim();
    if (!text) {
      throw new Error('[MiniMaxTTSProvider] Text is empty');
    }

    if (text.length > MAX_TEXT_LENGTH) {
      throw new Error(
        `[MiniMaxTTSProvider] Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters ` +
        `(got ${text.length}). Please split the text into smaller chunks.`
      );
    }

    const voice = options.voice ?? DEFAULT_VOICE;
    const speed = options.speed ?? 1.0;

    // Build request body
    const body: MiniMaxTTSRequestBody = {
      model: this.model,
      text,
      voice_setting: {
        voice_id: voice,
        speed,
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3',
      },
    };

    // Make the API request and get audio buffer
    const { audioBuffer, durationMs } = await this.callAPI(body);

    // Ensure the output directory exists
    const dir = path.dirname(savePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write the audio file
    fs.writeFileSync(savePath, audioBuffer);

    // Verify the file was created
    if (!fs.existsSync(savePath)) {
      throw new Error(`[MiniMaxTTSProvider] Output file not created: ${savePath}`);
    }

    // Prefer API-provided duration; fall back to file-size estimation
    let duration: number;
    if (durationMs && durationMs > 0) {
      duration = Math.round((durationMs / 1000) * 10) / 10;
    } else {
      // MP3 at 128kbps = 16,000 bytes/sec
      const stat = fs.statSync(savePath);
      duration = Math.round((stat.size / 16000) * 10) / 10;
    }

    return {
      audioPath: savePath,
      duration,
    };
  }

  /**
   * Call the MiniMax T2A v2 API and return the decoded audio buffer
   * along with optional duration metadata.
   * @throws Error with descriptive message on any failure
   */
  private async callAPI(
    body: MiniMaxTTSRequestBody
  ): Promise<{ audioBuffer: Buffer; durationMs?: number }> {
    let response: Response;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      response = await fetch(MINIMAX_TTS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(
          `[MiniMaxTTSProvider] Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
        );
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[MiniMaxTTSProvider] Network error: ${msg}`);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown');
      throw new Error(
        `[MiniMaxTTSProvider] HTTP ${response.status}: ${errorText}`
      );
    }

    const result = (await response.json()) as MiniMaxTTSResponse;

    // Check for API-level errors
    if (result.base_resp && result.base_resp.status_code !== 0) {
      throw new Error(
        `[MiniMaxTTSProvider] API error: ${result.base_resp.status_msg} ` +
        `(code: ${result.base_resp.status_code})`
      );
    }

    if (!result.data) {
      throw new Error('[MiniMaxTTSProvider] API returned no data field');
    }

    const durationMs = result.extra_info?.audio_length;

    // Handle multiple response formats
    const audioType = result.data.audio_type ?? 'base64';

    // Format 1: base64-encoded audio in data.audio
    if (audioType === 'base64' && result.data.audio) {
      const audioBuffer = Buffer.from(result.data.audio, 'base64');
      if (audioBuffer.length === 0) {
        throw new Error('[MiniMaxTTSProvider] Decoded base64 audio buffer is empty');
      }
      return { audioBuffer, durationMs };
    }

    // Format 2: hex-encoded audio in data.audio
    if (audioType === 'hex' && result.data.audio) {
      const audioBuffer = Buffer.from(result.data.audio, 'hex');
      if (audioBuffer.length === 0) {
        throw new Error('[MiniMaxTTSProvider] Decoded hex audio buffer is empty');
      }
      return { audioBuffer, durationMs };
    }

    // Format 3: URL to download audio (stream mode)
    if (audioType === 'url' && result.data.audio_url) {
      const audioBuffer = await this.downloadAudio(result.data.audio_url);
      return { audioBuffer, durationMs };
    }

    // Fallback: if data.audio exists, try base64 decode (most common)
    if (result.data.audio) {
      const audioBuffer = Buffer.from(result.data.audio, 'base64');
      if (audioBuffer.length === 0) {
        throw new Error('[MiniMaxTTSProvider] Decoded fallback audio buffer is empty');
      }
      return { audioBuffer, durationMs };
    }

    // Format 4: audio_url without audio_type
    if (result.data.audio_url) {
      const audioBuffer = await this.downloadAudio(result.data.audio_url);
      return { audioBuffer, durationMs };
    }

    throw new Error(
      `[MiniMaxTTSProvider] API returned no audio data. ` +
      `audio_type=${audioType}, has_audio=${!!result.data.audio}, has_url=${!!result.data.audio_url}`
    );
  }

  /**
   * Download audio from a URL (used for stream-mode responses).
   */
  private async downloadAudio(url: string): Promise<Buffer> {
    let response: Response;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

      response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeout);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(
          `[MiniMaxTTSProvider] Audio download timed out after ${DOWNLOAD_TIMEOUT_MS / 1000}s`
        );
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[MiniMaxTTSProvider] Audio download failed: ${msg}`);
    }

    if (!response.ok) {
      throw new Error(
        `[MiniMaxTTSProvider] Audio download HTTP ${response.status}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0) {
      throw new Error('[MiniMaxTTSProvider] Downloaded audio buffer is empty');
    }

    return buffer;
  }
}
