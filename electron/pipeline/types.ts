// ============================================================
// StoryForge Pipeline Type Definitions
// ============================================================

/** Ordered step identifiers matching the 7-step pipeline. */
export type StepId = 'review' | 'rewrite' | 'storyboard' | 'prompt' | 'imagen' | 'tts' | 'capcut';

/** Lifecycle status of a single pipeline step. */
export type StepStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'stale' | 'skipped';

/** Canonical step execution order. */
export const STEP_ORDER: StepId[] = ['review', 'rewrite', 'storyboard', 'prompt', 'imagen', 'tts', 'capcut'];

/**
 * Downstream cascade map: when a step is re-run, all listed
 * downstream steps are marked `stale`.
 *
 * Note: storyboard does NOT cascade to tts because tts input
 * is the rewritten body, not the storyboard segments.
 */
export const DOWNSTREAM_MAP: Record<StepId, StepId[]> = {
  review:     ['rewrite', 'storyboard', 'prompt', 'imagen', 'tts', 'capcut'],
  rewrite:    ['storyboard', 'prompt', 'imagen', 'tts', 'capcut'],
  storyboard: ['prompt', 'imagen', 'capcut'],
  prompt:     ['imagen', 'capcut'],
  imagen:     ['capcut'],
  tts:        ['capcut'],
  capcut:     [],
};

// ------------------------------------------------------------
// Step state
// ------------------------------------------------------------

export interface StepState {
  id: StepId;
  status: StepStatus;
  progress: number;       // 0-100
  message: string;
  startedAt?: number;     // epoch ms
  completedAt?: number;   // epoch ms
  error?: string;
}

// ------------------------------------------------------------
// Domain data
// ------------------------------------------------------------

/** A single storyboard segment (one scene/shot). */
export interface Segment {
  index: number;
  text: string;             // narration / subtitle text
  imagePrompt?: string;     // painting prompt (Step 4 output)
  negativePrompt?: string;  // elements to exclude from image generation
  imagePath?: string;       // generated image path (Step 5 output)
  duration?: number;        // duration in seconds
}

/** User-provided project configuration. */
export interface ProjectConfig {
  name: string;
  originalText: string;     // raw manuscript
  track: string;            // content track: 人物故事 / 健康图书 / ...
  style: string;            // art style: 黑白摄影 / 油画 / ...
  voice: string;            // TTS voice id
  mode: 'auto' | 'semi';   // fully automatic or semi-automatic
  aspectRatio: '9:16' | '16:9';
  bgmId?: string;           // BGM library item id (optional)
  speed?: number;            // TTS speech speed (0.8-1.5, default 1.0)
  customPrompts?: {
    rewrite?: string;        // custom rewrite system prompt override
    storyboard?: string;     // custom storyboard system prompt override
    imagePrompt?: string;    // custom image prompt system prompt override
  };
  referenceImagePath?: string; // 人像参考图路径（用于主角形象一致性）
}

/** Accumulated pipeline data produced by each step. */
export interface PipelineData {
  // Step 1: review
  cleanedText?: string;

  // Step 2: rewrite
  rewrittenBody?: string;
  rewrittenTitle?: string;
  coverText?: string;
  publishText?: string;
  hashtags?: string[];
  comments?: string[];     // 评论预埋：3-5 条引导互动的评论

  // Step 3: storyboard
  segments?: Segment[];

  // Step 4: prompt  -- merged into segments[].imagePrompt

  // Step 5: imagen  -- merged into segments[].imagePath

  // Step 6: tts
  audioPath?: string;
  audioDuration?: number;
  srtPath?: string;

  // Step 7: capcut
  draftPath?: string;
}

// ------------------------------------------------------------
// Project state (persisted as state.json)
// ------------------------------------------------------------

export interface ProjectState {
  id: string;
  config: ProjectConfig;
  steps: StepState[];
  data: PipelineData;
  createdAt: number;        // epoch ms
  updatedAt: number;        // epoch ms
}

// ------------------------------------------------------------
// Execution context & results
// ------------------------------------------------------------

/** Context passed to each step's execute() method. */
export interface StepContext {
  projectId: string;
  projectDir: string;       // absolute path to project directory
  config: ProjectConfig;
  data: PipelineData;
  signal: AbortSignal;      // cancellation / pause signal
  onProgress: (progress: number, message: string) => void;
}

/** Value returned by a step on successful completion. */
export interface StepResult {
  data: Partial<PipelineData>;
}

// ------------------------------------------------------------
// Progress callback used by PipelineEngine
// ------------------------------------------------------------

export interface ProgressEvent {
  projectId: string;
  stepId: StepId;
  status: StepStatus;
  progress: number;
  message: string;
}

export type ProgressCallback = (event: ProgressEvent) => void;
