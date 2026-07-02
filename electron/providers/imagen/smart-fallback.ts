// ============================================================
// Smart Fallback — 5-Level Image Generation Degradation Strategy
// ============================================================
//
// A production-grade replacement for the simple FallbackChain.
// Instead of blindly cycling through providers on failure, this
// applies a 5-level degradation strategy before moving to the
// next engine, maximizing the chance of producing an image.
//
// Levels:
//   1. Direct retry        — same engine, same prompt (network glitch)
//   2. Sanitize prompt     — strip sensitive words, truncate length
//   3. LLM prompt rewrite  — use an LLM to produce a safer/simpler prompt
//   4. Switch engine       — try the next configured provider
//   5. Fallback image      — generate a placeholder SVG/PNG on disk
// ============================================================

import fs from 'fs';
import path from 'path';
import { ImagenProvider, ImagenOptions, ImagenResult } from './base';
import { LLMProvider } from '../llm/base';

/** Delay between Level-1 retry attempt, in milliseconds. */
const RETRY_DELAY_MS = 1_000;

/** Maximum prompt length sent to image engines. */
const MAX_PROMPT_LENGTH = 500;

/**
 * Words that commonly trigger content-safety filters across image
 * generation APIs. These are stripped during Level-2 prompt cleaning.
 * The list intentionally casts a wide net — a false positive (removing
 * a harmless word) is far cheaper than a wasted API call.
 */
const SENSITIVE_WORDS: string[] = [
  'blood', 'gore', 'violent', 'violence',
  'nude', 'naked', 'nsfw',
  'weapon', 'gun', 'rifle', 'pistol', 'knife', 'sword',
  'dead', 'death', 'kill', 'murder', 'suicide',
  'sexy', 'erotic', 'porn', 'sexual',
  'drug', 'cocaine', 'heroin',
  'terrorist', 'terrorism', 'bomb', 'explosion',
  'torture', 'abuse',
];

/** Structured record of a single degradation attempt. */
interface FallbackAttempt {
  level: number;
  provider: string;
  error: string;
}

/**
 * SmartFallback wraps multiple ImagenProviders and applies a 5-level
 * degradation strategy to maximize the probability of returning a
 * usable image, even under adverse conditions (network flakes,
 * content-filter rejections, quota exhaustion).
 *
 * It implements the `ImagenProvider` interface itself, so it can be
 * used as a drop-in replacement anywhere a single provider is expected.
 */
export class SmartFallback implements ImagenProvider {
  readonly name = 'SmartFallback';

  private readonly providers: ImagenProvider[];
  private readonly llmProvider: LLMProvider | undefined;

  /**
   * @param providers  Ordered list of imagen providers to try.
   * @param llmProvider  Optional LLM used for Level-3 prompt rewriting.
   */
  constructor(providers: ImagenProvider[], llmProvider?: LLMProvider) {
    if (providers.length === 0) {
      throw new Error('[SmartFallback] At least one provider is required');
    }
    this.providers = providers;
    this.llmProvider = llmProvider;
  }

  // ----------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------

  async generate(options: ImagenOptions, savePath: string): Promise<ImagenResult> {
    const errors: FallbackAttempt[] = [];

    // --- Level 4 loop: iterate over providers ---
    for (const provider of this.providers) {
      // --- Level 1: direct attempt ---
      const l1Result = await this.tryGenerate(provider, options, savePath);
      if (l1Result) return l1Result;
      errors.push({ level: 1, provider: provider.name, error: this.lastError });

      // --- Level 1.5: single retry after a short pause ---
      await this.sleep(RETRY_DELAY_MS);
      const l15Result = await this.tryGenerate(provider, options, savePath);
      if (l15Result) return l15Result;
      errors.push({ level: 1, provider: provider.name, error: `retry: ${this.lastError}` });

      // --- Level 2: sanitized prompt ---
      const cleanedPrompt = this.cleanPrompt(options.prompt);
      if (cleanedPrompt !== options.prompt) {
        const l2Result = await this.tryGenerate(
          provider,
          { ...options, prompt: cleanedPrompt },
          savePath
        );
        if (l2Result) return l2Result;
        errors.push({ level: 2, provider: provider.name, error: this.lastError });
      }

      // --- Level 3: LLM prompt rewrite ---
      if (this.llmProvider) {
        const rewritten = await this.tryRewritePrompt(options.prompt);
        if (rewritten) {
          const l3Result = await this.tryGenerate(
            provider,
            { ...options, prompt: rewritten },
            savePath
          );
          if (l3Result) return l3Result;
          errors.push({ level: 3, provider: provider.name, error: this.lastError });
        } else {
          errors.push({
            level: 3,
            provider: provider.name,
            error: `LLM rewrite failed: ${this.lastError}`,
          });
        }
      }

      // --- Level 4: continue to next provider ---
      console.warn(
        `[SmartFallback] All attempts exhausted for ${provider.name}, switching engine...`
      );
    }

    // --- Level 5: generate a placeholder fallback image ---
    console.warn('[SmartFallback] All providers exhausted, generating fallback placeholder');
    try {
      return await this.generateFallbackImage(options, savePath);
    } catch (err) {
      errors.push({
        level: 5,
        provider: 'fallback',
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // If even the fallback image fails, surface a structured error
    const summary = errors
      .map((e) => `L${e.level}/${e.provider}: ${e.error}`)
      .join(' | ');
    throw new Error(`[SmartFallback] All 5 levels failed — ${summary}`);
  }

  // ----------------------------------------------------------------
  // Level 1 — direct generation attempt
  // ----------------------------------------------------------------

  /** Stores the message of the last caught error for logging. */
  private lastError = '';

  /**
   * Attempt a single generation call.
   * Returns the result on success, or `null` on failure (error captured
   * in `this.lastError`).
   */
  private async tryGenerate(
    provider: ImagenProvider,
    options: ImagenOptions,
    savePath: string
  ): Promise<ImagenResult | null> {
    try {
      return await provider.generate(options, savePath);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[SmartFallback] ${provider.name} failed: ${this.lastError}`);
      return null;
    }
  }

  // ----------------------------------------------------------------
  // Level 2 — prompt sanitization
  // ----------------------------------------------------------------

  /**
   * Clean a prompt by removing words likely to trigger content-safety
   * filters and truncating overly long text.
   *
   * Returns the original prompt unchanged if no modifications were made
   * (the caller uses this signal to skip the Level-2 attempt entirely).
   */
  private cleanPrompt(prompt: string): string {
    let cleaned = prompt;

    for (const word of SENSITIVE_WORDS) {
      // Word-boundary aware replacement to avoid mangling substrings
      // (e.g. "swordfish" should not lose "sword").  We use \b when
      // the word is purely alphabetic.
      const pattern = new RegExp(`\\b${this.escapeRegex(word)}\\b`, 'gi');
      cleaned = cleaned.replace(pattern, '');
    }

    // Collapse multiple spaces left by removals
    cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

    // Truncate if still too long
    if (cleaned.length > MAX_PROMPT_LENGTH) {
      cleaned = cleaned.substring(0, MAX_PROMPT_LENGTH).trim();
    }

    return cleaned;
  }

  /** Escape special regex characters in a literal string. */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ----------------------------------------------------------------
  // Level 3 — LLM-assisted prompt rewrite
  // ----------------------------------------------------------------

  /**
   * Use the configured LLM to rewrite the prompt into a form that is
   * more likely to pass content filters while preserving the core
   * visual concept.
   *
   * Returns the rewritten prompt on success, or `null` if the LLM
   * call itself fails.
   */
  private async tryRewritePrompt(prompt: string): Promise<string | null> {
    if (!this.llmProvider) return null;

    try {
      const response = await this.llmProvider.chat(
        [
          {
            role: 'system',
            content:
              'You are an image prompt rewriter. Rewrite the following image ' +
              'generation prompt to be simpler, safer, and more likely to ' +
              'succeed with AI image generators. Keep the core visual concept ' +
              'but remove anything that might trigger content filters. Keep ' +
              'it under 200 words. Output ONLY the rewritten prompt, nothing else.',
          },
          { role: 'user', content: prompt },
        ],
        { temperature: 0.3, maxTokens: 300 }
      );

      const rewritten = response.content.trim();
      if (!rewritten || rewritten.length < 5) {
        this.lastError = 'LLM returned empty or too-short rewrite';
        return null;
      }

      return rewritten;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      return null;
    }
  }

  // ----------------------------------------------------------------
  // Level 5 — placeholder fallback image
  // ----------------------------------------------------------------

  /**
   * Generate a minimal placeholder image when all upstream providers
   * have failed.  The image is a dark gradient background with centered
   * text indicating the failure.
   *
   * The output is an SVG file (universally renderable) saved alongside
   * the intended savePath.  If the caller explicitly expects a PNG
   * extension, we still write SVG content but name it `.svg` so
   * downstream consumers can handle it appropriately.
   */
  private async generateFallbackImage(
    options: ImagenOptions,
    savePath: string
  ): Promise<ImagenResult> {
    const width = options.width ?? 1024;
    const height = options.height ?? 1024;

    // Truncate the prompt for display inside the placeholder
    const shortPrompt = options.prompt.length > 80
      ? options.prompt.substring(0, 77) + '...'
      : options.prompt;

    // Escape XML special characters for safe SVG embedding
    const escapedPrompt = this.escapeXml(shortPrompt);

    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      '  <defs>',
      '    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">',
      '      <stop offset="0%" style="stop-color:#1a1a2e"/>',
      '      <stop offset="50%" style="stop-color:#16213e"/>',
      '      <stop offset="100%" style="stop-color:#0f3460"/>',
      '    </linearGradient>',
      '  </defs>',
      '  <rect width="100%" height="100%" fill="url(#bg)"/>',
      `  <text x="50%" y="40%" font-family="Arial, sans-serif" font-size="28" fill="#888888" text-anchor="middle" dominant-baseline="middle">`,
      '    图片生成暂时不可用',
      '  </text>',
      `  <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="18" fill="#555555" text-anchor="middle" dominant-baseline="middle">`,
      '    请稍后重试或更换提示词',
      '  </text>',
      `  <text x="50%" y="62%" font-family="Arial, sans-serif" font-size="14" fill="#444444" text-anchor="middle" dominant-baseline="middle" opacity="0.7">`,
      `    ${escapedPrompt}`,
      '  </text>',
      '</svg>',
    ].join('\n');

    // Write as .svg so downstream code can detect the format
    const svgPath = savePath.replace(/\.[^.]+$/, '.svg');

    const dir = path.dirname(svgPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(svgPath, svg, 'utf-8');

    return { imagePath: svgPath };
  }

  /** Escape characters that are special in XML/SVG text content. */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // ----------------------------------------------------------------
  // Utilities
  // ----------------------------------------------------------------

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
