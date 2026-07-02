// ============================================================
// Volcano Engine TTS Provider (ByteDance)
// ============================================================
//
// Uses the Volcano Engine (火山引擎) speech synthesis API.
// API docs: https://www.volcengine.com/docs/6561/79817
//
// Authentication:
//   Header: Authorization: Bearer;{token}
//   Body:   app.appid + app.token + app.cluster
//
// Preset voice types (for future UI selection):
//   BV001  — 通用女声 (default)
//   BV002  — 通用男声
//   BV700  — 灿灿
//   BV406  — 东方浩然 (沉稳叙述)
//   BV407  — 温柔小雅
// ============================================================

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { TTSProvider, TTSOptions, TTSResult } from './base';

/** Volcano Engine TTS API endpoint */
const VOLCANO_TTS_ENDPOINT = 'https://openspeech.bytedance.com/api/v1/tts';

/** Default cluster for Volcano TTS */
const DEFAULT_CLUSTER = 'volcano_tts';

/** Default voice type (通用女声) */
const DEFAULT_VOICE = 'BV001';

/** Default encoding format */
const DEFAULT_ENCODING = 'mp3' as const;

/** Maximum text length per request (Volcano limit) */
const MAX_TEXT_LENGTH = 1024;

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 30_000;

export interface VolcanoTTSConfig {
  /** Volcano Engine app ID */
  appId: string;
  /** Volcano Engine access token */
  token: string;
  /** Cluster name, defaults to 'volcano_tts' */
  cluster?: string;
}

interface VolcanoTTSRequestBody {
  app: {
    appid: string;
    token: string;
    cluster: string;
  };
  user: {
    uid: string;
  };
  audio: {
    voice_type: string;
    encoding: string;
    speed_ratio: number;
  };
  request: {
    reqid: string;
    text: string;
    operation: 'query';
  };
}

interface VolcanoTTSResponse {
  reqid: string;
  code: number;
  message?: string;
  sequence: number;
  data?: string;  // base64-encoded audio
}

/**
 * TTS provider for Volcano Engine (ByteDance).
 *
 * Requires an app ID and access token from the Volcano Engine console.
 * The provider sends a single synchronous query request and receives
 * base64-encoded MP3 audio data.
 */
export class VolcanoTTSProvider implements TTSProvider {
  readonly name = 'VolcanoTTS';

  private readonly appId: string;
  private readonly token: string;
  private readonly cluster: string;

  constructor(config: VolcanoTTSConfig) {
    this.appId = config.appId;
    this.token = config.token;
    this.cluster = config.cluster ?? DEFAULT_CLUSTER;
  }

  async synthesize(options: TTSOptions, savePath: string): Promise<TTSResult> {
    // Validate credentials
    if (!this.appId || !this.token) {
      throw new Error(
        '[VolcanoTTSProvider] Missing credentials. ' +
        'Set tts.appId and tts.token in settings to use Volcano Engine TTS.'
      );
    }

    const text = options.text?.trim();
    if (!text) {
      throw new Error('[VolcanoTTSProvider] Text is empty');
    }

    if (text.length > MAX_TEXT_LENGTH) {
      throw new Error(
        `[VolcanoTTSProvider] Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters ` +
        `(got ${text.length}). Please split the text into smaller chunks.`
      );
    }

    const voice = options.voice ?? DEFAULT_VOICE;
    const speed = options.speed ?? 1.0;

    // Build request body
    const body: VolcanoTTSRequestBody = {
      app: {
        appid: this.appId,
        token: this.token,
        cluster: this.cluster,
      },
      user: {
        uid: 'storyforge',
      },
      audio: {
        voice_type: voice,
        encoding: DEFAULT_ENCODING,
        speed_ratio: speed,
      },
      request: {
        reqid: crypto.randomUUID(),
        text,
        operation: 'query',
      },
    };

    // Make the API request
    const audioBuffer = await this.callAPI(body);

    // Ensure the output directory exists
    const dir = path.dirname(savePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write the audio file
    fs.writeFileSync(savePath, audioBuffer);

    // Verify the file was created
    if (!fs.existsSync(savePath)) {
      throw new Error(`[VolcanoTTSProvider] Output file not created: ${savePath}`);
    }

    // Estimate duration from file size.
    // MP3 at 128kbps = 16,000 bytes/sec.
    const stat = fs.statSync(savePath);
    const estimatedDuration = stat.size / 16000;

    return {
      audioPath: savePath,
      duration: Math.round(estimatedDuration * 10) / 10,
    };
  }

  /**
   * Call the Volcano Engine TTS API and return the decoded audio buffer.
   * @throws Error with descriptive message on any failure
   */
  private async callAPI(body: VolcanoTTSRequestBody): Promise<Buffer> {
    let response: Response;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      response = await fetch(VOLCANO_TTS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer;${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(
          `[VolcanoTTSProvider] Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
        );
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[VolcanoTTSProvider] Network error: ${msg}`);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown');
      throw new Error(
        `[VolcanoTTSProvider] HTTP ${response.status}: ${errorText}`
      );
    }

    const result = (await response.json()) as VolcanoTTSResponse;

    // Volcano API: code 3000 = success
    if (result.code !== 3000) {
      const msg = result.message ?? `code=${result.code}`;
      throw new Error(
        `[VolcanoTTSProvider] API error: ${msg} (reqid: ${result.reqid})`
      );
    }

    if (!result.data) {
      throw new Error(
        `[VolcanoTTSProvider] API returned success but no audio data (reqid: ${result.reqid})`
      );
    }

    // Decode base64 to buffer
    const audioBuffer = Buffer.from(result.data, 'base64');

    if (audioBuffer.length === 0) {
      throw new Error(
        `[VolcanoTTSProvider] Decoded audio buffer is empty (reqid: ${result.reqid})`
      );
    }

    return audioBuffer;
  }
}
