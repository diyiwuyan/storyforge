// ============================================================
// Image Generation Provider Factory
// ============================================================

import { ImagenProvider } from './base';
import { JimengProvider } from './jimeng';
import { ModelScopeProvider } from './modelscope';
import { ReplicateProvider } from './replicate';
import { SiliconFlowProvider } from './siliconflow';
import { AgnesImagenProvider } from './agnes';
import { SmartFallback } from './smart-fallback';
import { LLMProvider } from '../llm/base';

export interface ImagenProviderConfig {
  provider: string;   // 'siliconflow' | 'replicate' | 'jimeng' | 'modelscope' | 'agnes'
  apiKey: string;
  model?: string;
}

/**
 * Create an image generation provider instance based on configuration.
 */
export function createImagenProvider(config: ImagenProviderConfig): ImagenProvider {
  const { provider, apiKey, model } = config;

  switch (provider) {
    case 'siliconflow':
      return new SiliconFlowProvider(apiKey, model);

    case 'replicate':
      return new ReplicateProvider(apiKey, model);

    case 'jimeng':
      return new JimengProvider(apiKey, model);

    case 'modelscope':
      return new ModelScopeProvider(apiKey, model);

    case 'agnes':
      return new AgnesImagenProvider(apiKey, model);

    default:
      throw new Error(
        `Unknown imagen provider: "${provider}". Supported: siliconflow, replicate, jimeng, modelscope, agnes`
      );
  }
}

/**
 * Configuration for a single provider in the SmartFallback chain.
 */
export interface FallbackProviderEntry {
  provider: string;
  apiKey: string;
  model?: string;
}

/**
 * Create a SmartFallback instance that wraps multiple providers with
 * the 5-level degradation strategy.
 *
 * @param entries     Ordered list of provider configurations to try
 * @param llmProvider Optional LLM used for Level-3 prompt rewriting
 * @returns A SmartFallback that implements ImagenProvider
 */
export function createSmartFallback(
  entries: FallbackProviderEntry[],
  llmProvider?: LLMProvider
): SmartFallback {
  if (entries.length === 0) {
    throw new Error('[createSmartFallback] At least one provider entry is required');
  }

  const providers = entries.map((entry) => createImagenProvider(entry));
  return new SmartFallback(providers, llmProvider);
}
