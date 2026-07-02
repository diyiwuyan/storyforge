// ============================================================
// Replicate Imagen Provider
// ============================================================

import fs from 'fs';
import path from 'path';
import { ImagenProvider, ImagenOptions, ImagenResult } from './base';

const API_BASE = 'https://api.replicate.com/v1';
const DEFAULT_MODEL = 'black-forest-labs/flux-schnell';

/** Maximum number of polling attempts before giving up. */
const MAX_POLL_ATTEMPTS = 120;
/** Delay between polling attempts in milliseconds. */
const POLL_INTERVAL_MS = 2000;

/**
 * Image generation provider backed by the Replicate platform.
 *
 * Replicate uses an asynchronous prediction model:
 *   1. Create a prediction via POST /predictions
 *   2. Poll GET /predictions/{id} until status is "succeeded"
 *   3. Download the generated image from the output URL
 *
 * Supports Flux, Stable Diffusion, SDXL, and any model
 * hosted on the Replicate platform.
 */
export class ReplicateProvider implements ImagenProvider {
  readonly name = 'Replicate';
  private readonly apiToken: string;
  private readonly defaultModel: string;

  constructor(apiToken: string, defaultModel?: string) {
    if (!apiToken) {
      throw new Error('[ReplicateProvider] apiToken is required');
    }
    this.apiToken = apiToken;
    this.defaultModel = defaultModel ?? DEFAULT_MODEL;
  }

  async generate(options: ImagenOptions, savePath: string): Promise<ImagenResult> {
    const model = options.model ?? this.defaultModel;
    const width = options.width ?? 1024;
    const height = options.height ?? 1024;

    // Build the input payload.
    // Most Replicate image models accept these standard fields.
    const input: Record<string, unknown> = {
      prompt: options.prompt,
      width,
      height,
    };

    if (options.negativePrompt) {
      input.negative_prompt = options.negativePrompt;
    }
    if (options.steps !== undefined) {
      input.num_inference_steps = options.steps;
    }
    if (options.seed !== undefined) {
      input.seed = options.seed;
    }

    // --- Step 1: Create prediction ---
    const prediction = await this.createPrediction(model, input);
    const predictionId = prediction.id;

    if (!predictionId) {
      throw new Error('[ReplicateProvider] Failed to create prediction: no id returned');
    }

    // --- Step 2: Poll until complete ---
    const result = await this.pollPrediction(predictionId);

    // --- Step 3: Download the image ---
    const imageUrl = this.extractImageUrl(result);
    if (!imageUrl) {
      throw new Error(
        '[ReplicateProvider] Prediction succeeded but no image URL in output'
      );
    }

    // Ensure the output directory exists
    const dir = path.dirname(savePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await this.downloadFile(imageUrl, savePath);

    return { imagePath: savePath };
  }

  // ----------------------------------------------------------------
  // Private helpers
  // ----------------------------------------------------------------

  private async createPrediction(
    model: string,
    input: Record<string, unknown>
  ): Promise<{ id?: string; status?: string; output?: unknown }> {
    const url = `${API_BASE}/models/${model}/predictions`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiToken}`,
        'Prefer': 'wait',  // Ask server to hold response if result is fast
      },
      body: JSON.stringify({ input }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `[ReplicateProvider] Failed to create prediction (${res.status}): ${text}`
      );
    }

    return res.json() as Promise<{ id?: string; status?: string; output?: unknown }>;
  }

  private async pollPrediction(
    predictionId: string
  ): Promise<{ status?: string; output?: unknown; error?: string }> {
    const url = `${API_BASE}/predictions/${predictionId}`;

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
        },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(
          `[ReplicateProvider] Failed to poll prediction (${res.status}): ${text}`
        );
      }

      const data = await res.json() as {
        status?: string;
        output?: unknown;
        error?: string;
      };

      if (data.status === 'succeeded') {
        return data;
      }

      if (data.status === 'failed' || data.status === 'canceled') {
        throw new Error(
          `[ReplicateProvider] Prediction ${data.status}: ${data.error ?? 'unknown error'}`
        );
      }

      // Still processing -- wait before next poll
      await this.sleep(POLL_INTERVAL_MS);
    }

    throw new Error(
      `[ReplicateProvider] Prediction timed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000}s`
    );
  }

  /**
   * Extract the image URL from prediction output.
   * Replicate models return output in various shapes:
   *   - string (single URL)
   *   - string[] (array of URLs)
   *   - { url: string } or similar
   */
  private extractImageUrl(result: { output?: unknown }): string | null {
    const output = result.output;

    if (typeof output === 'string') {
      return output;
    }
    if (Array.isArray(output) && typeof output[0] === 'string') {
      return output[0];
    }
    if (output && typeof output === 'object' && 'url' in output) {
      return (output as { url: string }).url;
    }

    return null;
  }

  /** Download a file from a URL and save it to disk. */
  private async downloadFile(url: string, dest: string): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `[ReplicateProvider] Failed to download image (${res.status})`
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(dest, Buffer.from(arrayBuffer));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
