import { StepId, StepContext, StepResult } from './types';

/**
 * Abstract base class for all pipeline steps.
 *
 * Each concrete step must declare its id, human-readable name,
 * description, dependency list, and an `execute` implementation.
 */
export abstract class BaseStep {
  /** Unique step identifier used in state tracking. */
  abstract readonly id: StepId;

  /** Human-readable step name (e.g. "文案预审"). */
  abstract readonly name: string;

  /** Short description shown in the UI. */
  abstract readonly description: string;

  /** Steps that must be `completed` before this step can run. */
  abstract readonly dependencies: StepId[];

  /**
   * Execute the step's core logic.
   *
   * Implementations should:
   * - call `ctx.onProgress` periodically to report progress
   * - check `ctx.signal.aborted` before long operations
   * - throw on unrecoverable errors (the engine catches them)
   * - return a StepResult with produced data
   */
  abstract execute(ctx: StepContext): Promise<StepResult>;

  /**
   * Return `true` if this step can be skipped because its
   * output already exists (e.g. image files on disk).
   *
   * Default: never skip.
   */
  canSkip(_ctx: StepContext): boolean {
    return false;
  }
}
