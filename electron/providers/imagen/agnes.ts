// ============================================================
// Agnes AI Imagen Provider
// ============================================================
//
// Agnes AI provides OpenAI-compatible image generation endpoints.
// Base URL: https://apihub.agnes-ai.com/v1
// Models:
//   - agnes-image-2.0-flash  (text-to-image, image editing)
//   - agnes-image-2.1-flash  (high-density, flexible sizes)

import fs from 'fs';
import path from 'path';
import { ImagenProvider, ImagenOptions, ImagenResult } from './base';

const API_ENDPOINT = 'https://apihub.agnes-ai.com/v1/images/generations';
const DEFAULT_MODEL = 'agnes-image-2.1-flash';

/**
 * Image generation provider backed by Agnes AI.
 *
 * Uses the OpenAI-compatible `/v1/images/generations` endpoint.
 * Supports both URL and base64 output formats.
 */
export class AgnesImagenProvider implements ImagenProvider {
  readonly name = 'Agnes AI';
  private readonly apiKey: string;
  private readonly defaultModel: string;

  constructor(apiKey: string, defaultModel?: string) {
    if (!apiKey) {
      throw new Error('[AgnesImagenProvider] apiKey is required');
    }
    this.apiKey = apiKey;
    this.defaultModel = defaultModel ?? DEFAULT_MODEL;
  }

  async generate(options: ImagenOptions, savePath: string): Promise<ImagenResult> {
    const width = options.width ?? 1024;
    const height = options.height ?? 1024;

    const body: Record<string, unknown> = {
      model: options.model ?? this.defaultModel,
      prompt: options.prompt,
      size: `${width}x${height}`,
      n: 1,
      response_format: 'b64_json',
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
        `[AgnesImagenProvider] API request failed (${res.status}): ${text}`
      );
    }

    const json = await res.json() as {
      data?: { url?: string; b64_json?: string }[];
    };

    const item = json.data?.[0];
    if (!item) {
      throw new Error('[AgnesImagenProvider] No image returned in response');
    }

    // Ensure the output directory exists
    const dir = path.dirname(savePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (item.b64_json) {
      const buffer = Buffer.from(item.b64_json, 'base64');
      fs.writeFileSync(savePath, buffer);
    } else if (item.url) {
      await this.downloadFile(item.url, savePath);
    } else {
      throw new Error(
        '[AgnesImagenProvider] Response contains neither b64_json nor url'
      );
    }

    return { imagePath: savePath };
  }

  /** Download a file from a URL and save it to disk. */
  private async downloadFile(url: string, dest: string): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `[AgnesImagenProvider] Failed to download image (${res.status})`
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(dest, Buffer.from(arrayBuffer));
  }
}
