// ============================================================
// Image Generation Provider Interface
// ============================================================

export interface ImagenOptions {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  model?: string;
  steps?: number;
  seed?: number;
}

export interface ImagenResult {
  /** Absolute path to the saved image file */
  imagePath: string;
}

/**
 * Abstract interface for image generation providers.
 * Implementations: SiliconFlow, Stability AI, etc.
 */
export interface ImagenProvider {
  readonly name: string;

  /**
   * Generate an image from the given prompt and save to disk.
   * @param options - Generation parameters
   * @param savePath - Absolute path where the image should be saved
   * @returns Result containing the saved image path
   */
  generate(options: ImagenOptions, savePath: string): Promise<ImagenResult>;
}
