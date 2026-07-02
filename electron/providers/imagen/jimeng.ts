// ============================================================
// Jimeng (Volcengine) Imagen Provider
// ============================================================
//
// Uses the Volcengine Visual Intelligence API for image generation.
// This is the backend that powers the "Jimeng AI" (即梦) service.
//
// API Docs: https://www.volcengine.com/docs/6791/
// ============================================================

import fs from 'fs';
import path from 'path';
import { ImagenProvider, ImagenOptions, ImagenResult } from './base';

const API_ENDPOINT = 'https://visual.volcengineapi.com/v1/aigc/generate';
const DEFAULT_MODEL = 'jimeng-2.1-pro';

/**
 * Image generation provider backed by the Volcengine / Jimeng API.
 *
 * Authentication uses a Bearer API key. The API returns base64-encoded
 * image data which is decoded and written to disk.
 */
export class JimengProvider implements ImagenProvider {
  readonly name = 'Jimeng';
  private readonly apiKey: string;
  private readonly defaultModel: string;

  constructor(apiKey: string, defaultModel?: string) {
    if (!apiKey) {
      throw new Error('[JimengProvider] apiKey is required');
    }
    this.apiKey = apiKey;
    this.defaultModel = defaultModel ?? DEFAULT_MODEL;
  }

  async generate(options: ImagenOptions, savePath: string): Promise<ImagenResult> {
    const width = options.width ?? 1024;
    const height = options.height ?? 1024;

    const body: Record<string, unknown> = {
      req_key: 'jimeng_high_aes_general_v21_L',
      prompt: options.prompt,
      model_version: options.model ?? this.defaultModel,
      width,
      height,
      return_url: false,   // Request base64 data instead of URL
      num: 1,
    };

    if (options.negativePrompt) {
      body.negative_prompt = options.negativePrompt;
    }
    if (options.seed !== undefined) {
      body.seed = options.seed;
    }

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
        `[JimengProvider] API request failed (${res.status}): ${text}`
      );
    }

    const json = await res.json() as {
      code?: number;
      message?: string;
      data?: {
        binary_data_base64?: string[];
        image_urls?: string[];
      };
    };

    if (json.code !== undefined && json.code !== 0) {
      throw new Error(
        `[JimengProvider] API error (code ${json.code}): ${json.message ?? 'unknown'}`
      );
    }

    // Ensure the output directory exists
    const dir = path.dirname(savePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Prefer base64 data, fall back to URL download
    const b64Data = json.data?.binary_data_base64?.[0];
    if (b64Data) {
      const buffer = Buffer.from(b64Data, 'base64');
      fs.writeFileSync(savePath, buffer);
      return { imagePath: savePath };
    }

    const imageUrl = json.data?.image_urls?.[0];
    if (imageUrl) {
      await this.downloadFile(imageUrl, savePath);
      return { imagePath: savePath };
    }

    throw new Error(
      '[JimengProvider] Response contains neither base64 data nor image URL'
    );
  }

  /** Download a file from a URL and save it to disk. */
  private async downloadFile(url: string, dest: string): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `[JimengProvider] Failed to download image (${res.status})`
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(dest, Buffer.from(arrayBuffer));
  }
}
