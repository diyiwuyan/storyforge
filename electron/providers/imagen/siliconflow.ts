// ============================================================
// SiliconFlow Imagen Provider
// ============================================================

import fs from 'fs';
import path from 'path';
import { ImagenProvider, ImagenOptions, ImagenResult } from './base';

const API_ENDPOINT = 'https://api.siliconflow.cn/v1/images/generations';
const DEFAULT_MODEL = 'stabilityai/stable-diffusion-3-5-large';

/**
 * Image generation provider backed by the SiliconFlow API.
 *
 * Supports Stable Diffusion, Flux, and other models available
 * on the SiliconFlow platform.  The API returns base64-encoded
 * image data which is decoded and written to disk.
 */
export class SiliconFlowProvider implements ImagenProvider {
  readonly name = 'SiliconFlow';
  private readonly apiKey: string;
  private readonly defaultModel: string;

  constructor(apiKey: string, defaultModel?: string) {
    if (!apiKey) {
      throw new Error('[SiliconFlowProvider] apiKey is required');
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
      image_size: `${width}x${height}`,
      batch_size: 1,
    };

    if (options.negativePrompt) {
      body.negative_prompt = options.negativePrompt;
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
        `[SiliconFlowProvider] API request failed (${res.status}): ${text}`
      );
    }

    const json = await res.json() as {
      images?: { url?: string; b64_json?: string }[];
      data?: { url?: string; b64_json?: string }[];
    };

    // SiliconFlow may return results under `images` or `data`
    const items = json.images ?? json.data;
    const item = items?.[0];
    if (!item) {
      throw new Error('[SiliconFlowProvider] No image returned in response');
    }

    // Ensure the output directory exists
    const dir = path.dirname(savePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (item.b64_json) {
      // Decode base64 and write to disk
      const buffer = Buffer.from(item.b64_json, 'base64');
      fs.writeFileSync(savePath, buffer);
    } else if (item.url) {
      // Download the image from the returned URL
      await this.downloadFile(item.url, savePath);
    } else {
      throw new Error(
        '[SiliconFlowProvider] Response contains neither b64_json nor url'
      );
    }

    return { imagePath: savePath };
  }

  /** Download a file from a URL and save it to disk. */
  private async downloadFile(url: string, dest: string): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `[SiliconFlowProvider] Failed to download image (${res.status})`
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(dest, Buffer.from(arrayBuffer));
  }
}
