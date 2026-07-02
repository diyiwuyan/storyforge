// ============================================================
// Application Settings Store (electron-store)
// ============================================================

import Store from 'electron-store';

/** Configuration for a single fallback image provider. */
export interface ImagenFallbackEntry {
  provider: string;  // 'siliconflow' | 'replicate' | 'jimeng' | 'modelscope'
  apiKey: string;
  model?: string;
}

/** Per-engine API key & model configuration. */
export interface ProviderKeyEntry {
  apiKey: string;
  model?: string;
}

/** Configuration for LLM backup/fallback provider. */
export interface LLMBackupEntry {
  provider: string;  // same values as llm.provider
  apiKey: string;
  model?: string;
}

export interface AppSettings {
  llm: {
    provider: string;  // 'deepseek' | 'openai' | 'qwen' | 'claude' | 'zhipu' | 'minimax' | 'agnes'
    apiKey: string;
    model?: string;
    /** Optional backup provider — used automatically when the primary API fails. */
    backup?: LLMBackupEntry;
  };
  imagen: {
    provider: string;  // 'siliconflow' | 'replicate' | 'jimeng' | 'modelscope' | 'agnes'
    apiKey: string;
    model?: string;
    /**
     * Per-engine API key & model overrides.
     * Key = provider name, Value = { apiKey, model? }.
     * When an engine is selected (either in Settings or ImageLab),
     * the system first checks providerKeys[engine]; if absent,
     * falls back to the top-level apiKey / model.
     */
    providerKeys?: Record<string, ProviderKeyEntry>;
    /**
     * Optional ordered list of additional fallback providers.
     * When configured (and containing at least one entry), the
     * pipeline wraps these together with the primary provider
     * in a SmartFallback chain with 5-level degradation.
     *
     * If empty or absent, the primary provider is used directly
     * (preserving backward compatibility).
     */
    fallbackProviders?: ImagenFallbackEntry[];
  };
  tts: {
    provider: string;  // 'edge' | 'volcano' | 'minimax'
    voice: string;     // 默认 zh-CN-YunxiNeural
    // Volcano Engine credentials
    appId?: string;    // Volcano app ID
    token?: string;    // Volcano access token
    // MiniMax credentials
    apiKey?: string;   // MiniMax API key
  };
  asr?: {
    provider: string;  // 'whisper'
    apiKey: string;
  };
  capcutDraftsDir?: string;
}

const store = new Store<AppSettings>({
  defaults: {
    llm: { provider: 'deepseek', apiKey: '' },
    imagen: { provider: 'siliconflow', apiKey: '' },
    tts: { provider: 'edge', voice: 'zh-CN-YunxiNeural' },
  },
});

export function getSettings(): AppSettings {
  return store.store;
}

export function setSettings(settings: Partial<AppSettings>): void {
  Object.entries(settings).forEach(([key, value]) => {
    store.set(key, value);
  });
}

/**
 * Resolve the API key and model for a specific imagen provider.
 *
 * Lookup order:
 *  1. providerKeys[providerName]  — per-engine override
 *  2. top-level imagen.apiKey / imagen.model  — legacy fallback
 *
 * This allows backward compatibility (single key for all engines)
 * while supporting per-engine keys when configured.
 */
export function resolveImagenCredentials(providerName: string): { apiKey: string; model?: string } {
  const { imagen } = getSettings();
  const entry = imagen.providerKeys?.[providerName];
  if (entry?.apiKey) {
    return { apiKey: entry.apiKey, model: entry.model };
  }
  return { apiKey: imagen.apiKey, model: imagen.model };
}

export { store };
