// ============================================================
// ModelScope (魔搭社区) Imagen Provider
// ============================================================
//
// Uses the Alibaba Cloud DashScope API (same backend as Tongyi Wanxiang).
// ModelScope offers 50 free image generations per day.
//
// API Docs: https://help.aliyun.com/zh/model-studio/developer-reference/flux-api
//
// Workflow (async):
//   1. POST task to /services/aigc/text2image/image-synthesis
//   2. Poll GET /tasks/{task_id} until status is SUCCEEDED
//   3. Download image from output.results[0].url
// ============================================================

import fs from 'fs';
import path from 'path';
import { ImagenProvider, ImagenOptions, ImagenResult } from './base';

const API_BASE = 'https://dashscope.aliyuncs.com/api/v1';
const SUBMIT_ENDPOINT = `${API_BASE}/services/aigc/text2image/image-synthesis`;
const TASK_ENDPOINT = `${API_BASE}/tasks`;
const DEFAULT_MODEL = 'flux-schnell';

/** Maximum number of polling attempts (2s interval => 120s timeout). */
const MAX_POLL_ATTEMPTS = 60;
/** Delay between polling attempts in milliseconds. */
const POLL_INTERVAL_MS = 2_000;

/** DashScope task statuses */
type TaskStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'UNKNOWN';

interface SubmitResponse {
  request_id?: string;
  output?: {
    task_id?: string;
    task_status?: TaskStatus;
  };
  code?: string;
  message?: string;
}

interface TaskResponse {
  request_id?: string;
  output?: {
    task_id?: string;
    task_status?: TaskStatus;
    results?: Array<{ url?: string; b64_image?: string }>;
    task_metrics?: {
      TOTAL?: number;
      SUCCEEDED?: number;
      FAILED?: number;
    };
    code?: string;
    message?: string;
  };
  code?: string;
  message?: string;
  usage?: {
    image_count?: number;
  };
}

/**
 * Image generation provider backed by ModelScope / DashScope.
 *
 * ModelScope provides 50 free image generations per day through the
 * DashScope-compatible API. Supports Flux Schnell, Flux Dev, and
 * Wanx models.
 *
 * The API is asynchronous:
 *   1. Submit a task and receive a task_id
 *   2. Poll the task endpoint until status is SUCCEEDED
 *   3. Download the generated image from the result URL
 */
export class ModelScopeProvider implements ImagenProvider {
  readonly name = 'ModelScope';
  private readonly apiKey: string;
  private readonly defaultModel: string;

  constructor(apiKey: string, defaultModel?: string) {
    if (!apiKey) {
      throw new Error('[ModelScopeProvider] apiKey is required');
    }
    this.apiKey = apiKey;
    this.defaultModel = defaultModel ?? DEFAULT_MODEL;
  }

  async generate(options: ImagenOptions, savePath: string): Promise<ImagenResult> {
    const model = options.model ?? this.defaultModel;
    const width = options.width ?? 1024;
    const height = options.height ?? 1024;

    // DashScope uses "width*height" format (asterisk, not "x")
    const size = `${width}*${height}`;

    // --- Step 1: Submit the generation task ---
    const taskId = await this.submitTask(model, options.prompt, size, options);

    // --- Step 2: Poll until completion ---
    const taskResult = await this.pollTask(taskId);

    // --- Step 3: Download and save the image ---
    const imageUrl = taskResult.output?.results?.[0]?.url;
    const b64Image = taskResult.output?.results?.[0]?.b64_image;

    // Ensure the output directory exists
    const dir = path.dirname(savePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (b64Image) {
      const buffer = Buffer.from(b64Image, 'base64');
      fs.writeFileSync(savePath, buffer);
    } else if (imageUrl) {
      await this.downloadFile(imageUrl, savePath);
    } else {
      throw new Error(
        '[ModelScopeProvider] Task succeeded but no image data in results'
      );
    }

    return { imagePath: savePath };
  }

  // ----------------------------------------------------------------
  // Private helpers
  // ----------------------------------------------------------------

  /**
   * Submit an image generation task to DashScope.
   * @returns The task_id for polling
   */
  private async submitTask(
    model: string,
    prompt: string,
    size: string,
    options: ImagenOptions
  ): Promise<string> {
    const body: Record<string, unknown> = {
      model,
      input: {
        prompt,
      },
      parameters: {
        size,
        n: 1,
      },
    };

    // Add optional parameters if supported by the model
    if (options.negativePrompt) {
      (body.input as Record<string, unknown>).negative_prompt = options.negativePrompt;
    }
    if (options.seed !== undefined) {
      (body.parameters as Record<string, unknown>).seed = options.seed;
    }
    if (options.steps !== undefined) {
      (body.parameters as Record<string, unknown>).steps = options.steps;
    }

    const res = await fetch(SUBMIT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        // Enable async mode (server returns task_id immediately)
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.throwWithQuotaHint(res.status, text);
    }

    const json = (await res.json()) as SubmitResponse;

    // Check for API-level error codes
    if (json.code) {
      this.throwWithQuotaHint(0, `${json.code}: ${json.message ?? 'unknown error'}`);
    }

    const taskId = json.output?.task_id;
    if (!taskId) {
      throw new Error(
        '[ModelScopeProvider] Submit succeeded but no task_id returned'
      );
    }

    return taskId;
  }

  /**
   * Poll a task until it reaches a terminal state (SUCCEEDED / FAILED / CANCELED).
   */
  private async pollTask(taskId: string): Promise<TaskResponse> {
    const url = `${TASK_ENDPOINT}/${taskId}`;

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(
          `[ModelScopeProvider] Failed to poll task (${res.status}): ${text}`
        );
      }

      const data = (await res.json()) as TaskResponse;
      const status = data.output?.task_status;

      if (status === 'SUCCEEDED') {
        return data;
      }

      if (status === 'FAILED') {
        const errCode = data.output?.code ?? data.code ?? 'UNKNOWN';
        const errMsg = data.output?.message ?? data.message ?? 'unknown error';
        this.throwWithQuotaHint(0, `Task failed (${errCode}): ${errMsg}`);
      }

      if (status === 'CANCELED') {
        throw new Error('[ModelScopeProvider] Task was canceled');
      }

      // PENDING or RUNNING -- wait before next poll
      await this.sleep(POLL_INTERVAL_MS);
    }

    throw new Error(
      `[ModelScopeProvider] Task timed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000}s`
    );
  }

  /**
   * Throw an error with a user-friendly hint when the free quota is exhausted.
   * DashScope returns specific error codes when limits are reached.
   */
  private throwWithQuotaHint(statusCode: number, detail: string): never {
    const lowerDetail = detail.toLowerCase();

    // Common quota-exceeded indicators from DashScope
    const isQuotaError =
      statusCode === 429 ||
      lowerDetail.includes('quota') ||
      lowerDetail.includes('limit') ||
      lowerDetail.includes('throttl') ||
      lowerDetail.includes('rate') ||
      lowerDetail.includes('exceeded') ||
      lowerDetail.includes('arrearage') ||
      lowerDetail.includes('insufficient');

    if (isQuotaError) {
      throw new Error(
        `[ModelScopeProvider] 免费额度已用完或请求频率过高。` +
        `ModelScope 每天提供 50 张免费出图额度，请明天再试或升级账户。` +
        ` (${detail})`
      );
    }

    throw new Error(
      `[ModelScopeProvider] API error${statusCode ? ` (${statusCode})` : ''}: ${detail}`
    );
  }

  /** Download a file from a URL and save it to disk. */
  private async downloadFile(url: string, dest: string): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `[ModelScopeProvider] Failed to download image (${res.status})`
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(dest, Buffer.from(arrayBuffer));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
