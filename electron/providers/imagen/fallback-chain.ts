// ============================================================
// Imagen Fallback Chain
// ============================================================

import { ImagenProvider, ImagenOptions, ImagenResult } from './base';

/**
 * Multi-engine fallback manager for image generation.
 *
 * Tries each provider in order.  If a provider throws, the error
 * is logged and the next provider in the chain is attempted.
 * Only throws if all providers fail.
 */
export class FallbackChain implements ImagenProvider {
  readonly name = 'FallbackChain';
  private readonly providers: ImagenProvider[];

  constructor(providers: ImagenProvider[]) {
    if (providers.length === 0) {
      throw new Error('[FallbackChain] At least one provider is required');
    }
    this.providers = providers;
  }

  async generate(options: ImagenOptions, savePath: string): Promise<ImagenResult> {
    let lastError: Error | null = null;

    for (const provider of this.providers) {
      try {
        const result = await provider.generate(options, savePath);
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(
          `[FallbackChain] ${provider.name} failed, trying next...`,
          lastError.message
        );
      }
    }

    throw lastError ?? new Error('[FallbackChain] All imagen providers failed');
  }
}
