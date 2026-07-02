// ============================================================
// TTS (Text-to-Speech) Provider Interface
// ============================================================

export interface TTSOptions {
  text: string;
  voice?: string;      // e.g. 'zh-CN-YunxiNeural'
  speed?: number;      // 1.0 = normal, 0.5 = half speed, 2.0 = double speed
}

export interface TTSResult {
  /** Absolute path to the generated audio file */
  audioPath: string;
  /** Duration of the audio in seconds */
  duration: number;
}

/**
 * Abstract interface for Text-to-Speech providers.
 * Implementations: Edge TTS, Azure TTS, etc.
 */
export interface TTSProvider {
  readonly name: string;

  /**
   * Synthesize speech from text and save to disk.
   * @param options - TTS parameters
   * @param savePath - Absolute path where the audio file should be saved
   * @returns Result with the audio path and duration
   */
  synthesize(options: TTSOptions, savePath: string): Promise<TTSResult>;
}
