// ============================================================
// Whisper ASR Provider (OpenAI Whisper API)
// ============================================================

import fs from 'fs';
import path from 'path';
import { ASRProvider, ASRResult, WordTimestamp } from './base';

export class WhisperASRProvider implements ASRProvider {
  readonly name = 'whisper';
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl || 'https://api.openai.com/v1';
  }

  async recognize(audioPath: string): Promise<ASRResult> {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const fileBuffer = fs.readFileSync(audioPath);
    const fileName = path.basename(audioPath);

    // Build multipart/form-data manually for Node.js compatibility
    const boundary = `----FormBoundary${Date.now().toString(36)}`;
    const parts: Buffer[] = [];

    // File field
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: audio/mpeg\r\n\r\n`
    ));
    parts.push(fileBuffer);
    parts.push(Buffer.from('\r\n'));

    // Model field
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n` +
      `whisper-1\r\n`
    ));

    // Response format field
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
      `verbose_json\r\n`
    ));

    // Timestamp granularities field
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="timestamp_granularities[]"\r\n\r\n` +
      `word\r\n`
    ));

    // Language hint (Chinese)
    parts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="language"\r\n\r\n` +
      `zh\r\n`
    ));

    // Closing boundary
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const url = `${this.baseUrl.replace(/\/+$/, '')}/audio/transcriptions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Whisper API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as WhisperVerboseResponse;

    const words: WordTimestamp[] = (data.words || []).map(w => ({
      word: w.word,
      start: w.start,
      end: w.end,
    }));

    return {
      text: data.text || '',
      words,
      duration: data.duration || 0,
    };
  }
}

/** Whisper API verbose_json response shape */
interface WhisperVerboseResponse {
  text: string;
  language: string;
  duration: number;
  words?: Array<{
    word: string;
    start: number;
    end: number;
  }>;
  segments?: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
  }>;
}
