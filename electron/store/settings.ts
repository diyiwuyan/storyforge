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

export interface AppSettings {
  llm: {
    provider: string;  // 'deepseek' | 'openai' | 'qwen' | 'claude' | 'zhipu' | 'minimax'
    apiKey: string;
    model?: string;
  };
  imagen: {
    provider: string;  // 'siliconflow' | 'replicate' | 'jimeng' | 'modelscope'
    apiKey: string;
    model?: string;
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

export { store };
