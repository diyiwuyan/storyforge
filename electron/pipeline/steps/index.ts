// ============================================================
// Pipeline Steps — Registration Entry Point
// ============================================================

import { stepRegistry } from '../step-registry';
import { ReviewStep } from './review-step';
import { RewriteStep } from './rewrite-step';
import { StoryboardStep } from './storyboard-step';
import { PromptStep } from './prompt-step';
import { ImagenStep } from './imagen-step';
import { TTSStep } from './tts-step';
import { CapcutStep } from './capcut-step';

/**
 * Register all 7 pipeline steps into the global step registry.
 *
 * Call this once during application initialization (e.g. in main/index.ts)
 * before starting any pipeline execution.
 */
export function registerAllSteps(): void {
  stepRegistry.register(new ReviewStep());
  stepRegistry.register(new RewriteStep());
  stepRegistry.register(new StoryboardStep());
  stepRegistry.register(new PromptStep());
  stepRegistry.register(new ImagenStep());
  stepRegistry.register(new TTSStep());
  stepRegistry.register(new CapcutStep());
}

// Re-export step classes for direct use / testing
export { ReviewStep } from './review-step';
export { RewriteStep } from './rewrite-step';
export { StoryboardStep } from './storyboard-step';
export { PromptStep } from './prompt-step';
export { ImagenStep } from './imagen-step';
export { TTSStep } from './tts-step';
export { CapcutStep } from './capcut-step';
