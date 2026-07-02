import fs from 'fs';
import path from 'path';
import {
  StepId,
  StepStatus,
  StepState,
  StepContext,
  PipelineData,
  ProjectState,
  ProgressCallback,
  ProgressEvent,
  STEP_ORDER,
  DOWNSTREAM_MAP,
} from './types';
import { stepRegistry } from './step-registry';

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function now(): number {
  return Date.now();
}

/** Write data to a temp file then rename -- atomic on most OSes. */
function atomicWriteSync(filePath: string, data: string): void {
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, data, 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

function log(level: 'info' | 'warn' | 'error', msg: string): void {
  const ts = new Date().toISOString();
  const prefix = `[PipelineEngine][${level.toUpperCase()}] ${ts}`;
  if (level === 'error') {
    console.error(`${prefix} ${msg}`);
  } else if (level === 'warn') {
    console.warn(`${prefix} ${msg}`);
  } else {
    console.log(`${prefix} ${msg}`);
  }
}

// ------------------------------------------------------------
// PipelineEngine
// ------------------------------------------------------------

/**
 * Orchestrates the 7-step pipeline for a single project at a time.
 *
 * Responsibilities:
 * - Sequential step execution with dependency checking
 * - Pause / cancel via AbortController
 * - Atomic state persistence to state.json after every step
 * - Re-run with downstream cascade (stale marking)
 * - Progress callbacks for the renderer process
 */
export class PipelineEngine {
  /**
   * In-memory cache of project states keyed by project id.
   * Populated on first access from disk, kept in sync by persist().
   */
  private states = new Map<string, ProjectState>();

  /** AbortController for the currently running pipeline (one at a time). */
  private abortController: AbortController | null = null;

  /** The project id that is currently executing (null if idle). */
  private runningProjectId: string | null = null;

  /** External listener that receives progress / status events. */
  private progressCallback: ProgressCallback | null = null;

  // ----------------------------------------------------------
  // Public API
  // ----------------------------------------------------------

  /** Register a callback that receives all progress events. */
  onProgress(cb: ProgressCallback): void {
    this.progressCallback = cb;
  }

  /**
   * Start (or resume) the pipeline for the given project.
   *
   * Executes steps sequentially from the first non-completed step.
   * Steps that are already `completed` are skipped.
   * Steps that are `stale` are re-executed.
   */
  async start(projectId: string): Promise<void> {
    if (this.runningProjectId) {
      throw new Error(
        `Pipeline is already running for project "${this.runningProjectId}". ` +
        `Pause it first before starting another.`
      );
    }

    const state = this.loadState(projectId);
    this.runningProjectId = projectId;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    log('info', `Starting pipeline for project "${projectId}"`);

    try {
      for (const stepId of STEP_ORDER) {
        // Respect abort
        if (signal.aborted) {
          log('info', `Pipeline aborted for project "${projectId}"`);
          break;
        }

        const stepState = this.getStepState(state, stepId);

        // Skip completed steps
        if (stepState.status === 'completed') {
          log('info', `Skipping step "${stepId}" -- already completed`);
          continue;
        }

        // Skip user-skipped steps
        if (stepState.status === 'skipped') {
          log('info', `Skipping step "${stepId}" -- marked as skipped`);
          continue;
        }

        // Verify dependencies
        if (!this.areDependenciesMet(state, stepId)) {
          const msg = `Cannot run step "${stepId}": dependencies not met`;
          log('error', msg);
          this.updateStepState(state, stepId, {
            status: 'failed',
            error: msg,
          });
          this.persist(state);
          this.emitProgress(projectId, stepId, 'failed', 0, msg);
          break;
        }

        // Get the step implementation
        if (!stepRegistry.has(stepId)) {
          log('warn', `Step "${stepId}" has no registered implementation, skipping`);
          continue;
        }

        const step = stepRegistry.get(stepId);
        const projectDir = this.getProjectDir(projectId);

        // Check if the step can be skipped
        const ctx: StepContext = {
          projectId,
          projectDir,
          config: state.config,
          data: { ...state.data },
          signal,
          onProgress: (progress: number, message: string) => {
            this.updateStepState(state, stepId, { progress, message });
            this.emitProgress(projectId, stepId, 'running', progress, message);
          },
        };

        if (step.canSkip(ctx)) {
          log('info', `Step "${stepId}" reports canSkip=true, marking completed`);
          this.updateStepState(state, stepId, {
            status: 'completed',
            progress: 100,
            message: 'Skipped (output already exists)',
            completedAt: now(),
          });
          this.persist(state);
          this.emitProgress(projectId, stepId, 'completed', 100, 'Skipped');
          continue;
        }

        // Mark running
        this.updateStepState(state, stepId, {
          status: 'running',
          progress: 0,
          message: '',
          startedAt: now(),
          completedAt: undefined,
          error: undefined,
        });
        this.persist(state);
        this.emitProgress(projectId, stepId, 'running', 0, `开始执行: ${step.name}`);

        try {
          const result = await step.execute(ctx);

          // Check abort after execution (step may have completed just as abort fired)
          if (signal.aborted) {
            this.updateStepState(state, stepId, {
              status: 'paused',
              message: '已暂停',
            });
            this.persist(state);
            this.emitProgress(projectId, stepId, 'paused', stepState.progress, '已暂停');
            break;
          }

          // Merge step output into pipeline data
          Object.assign(state.data, result.data);

          this.updateStepState(state, stepId, {
            status: 'completed',
            progress: 100,
            message: '完成',
            completedAt: now(),
          });
          this.persist(state);
          this.emitProgress(projectId, stepId, 'completed', 100, '完成');
          log('info', `Step "${stepId}" completed`);
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);

          // Distinguish pause/abort from real errors
          if (signal.aborted) {
            this.updateStepState(state, stepId, {
              status: 'paused',
              message: '已暂停',
            });
            this.persist(state);
            this.emitProgress(projectId, stepId, 'paused', stepState.progress, '已暂停');
            log('info', `Step "${stepId}" paused`);
          } else {
            this.updateStepState(state, stepId, {
              status: 'failed',
              error: errorMsg,
              message: `失败: ${errorMsg}`,
            });
            this.persist(state);
            this.emitProgress(projectId, stepId, 'failed', stepState.progress, errorMsg);
            log('error', `Step "${stepId}" failed: ${errorMsg}`);
          }
          break;
        }
      }
    } finally {
      this.runningProjectId = null;
      this.abortController = null;
    }
  }

  /**
   * Pause the currently running pipeline.
   *
   * Signals the AbortController so the current step's execute()
   * can detect it via `ctx.signal.aborted` and exit gracefully.
   */
  pause(projectId: string): void {
    if (this.runningProjectId !== projectId) {
      log('warn', `pause() called but project "${projectId}" is not running`);
      return;
    }
    if (this.abortController) {
      log('info', `Pausing pipeline for project "${projectId}"`);
      this.abortController.abort();
    }
  }

  /**
   * Re-run a specific step.
   *
   * 1. Mark the target step as `pending`.
   * 2. Mark all downstream steps as `stale` (cascade rule).
   * 3. Persist state.
   * 4. Start the pipeline from that step.
   */
  async rerunStep(projectId: string, stepId: StepId): Promise<void> {
    // If a pipeline is running, abort it first
    if (this.runningProjectId === projectId) {
      this.pause(projectId);
      // Give a tick for the abort to propagate
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    const state = this.loadState(projectId);

    // Reset target step
    this.updateStepState(state, stepId, {
      status: 'pending',
      progress: 0,
      message: '',
      startedAt: undefined,
      completedAt: undefined,
      error: undefined,
    });

    // Cascade: mark downstream steps as stale
    const downstream = DOWNSTREAM_MAP[stepId];
    for (const dsId of downstream) {
      const dsState = this.getStepState(state, dsId);
      // Only mark if it was completed or stale -- don't touch pending/failed
      if (dsState.status === 'completed' || dsState.status === 'stale') {
        this.updateStepState(state, dsId, {
          status: 'stale',
          progress: 0,
          message: '上游步骤已重跑，需重新执行',
        });
      }
    }

    this.persist(state);
    log('info', `Marked step "${stepId}" for re-run, downstream stale: [${downstream.join(', ')}]`);

    // Emit events for all changed steps
    this.emitProgress(projectId, stepId, 'pending', 0, '等待执行');
    for (const dsId of downstream) {
      const dsState = this.getStepState(state, dsId);
      if (dsState.status === 'stale') {
        this.emitProgress(projectId, dsId, 'stale', 0, '上游步骤已重跑，需重新执行');
      }
    }

    // Re-start from the target step
    await this.start(projectId);
  }

  /** Return the current state for a project (from cache or disk). */
  getState(projectId: string): ProjectState {
    return this.loadState(projectId);
  }

  // ----------------------------------------------------------
  // State management (private)
  // ----------------------------------------------------------

  /**
   * Load project state from in-memory cache, falling back to
   * reading state.json from disk.
   */
  private loadState(projectId: string): ProjectState {
    // Try cache first
    const cached = this.states.get(projectId);
    if (cached) return cached;

    // Read from disk
    const stateFile = this.getStatePath(projectId);
    if (!fs.existsSync(stateFile)) {
      throw new Error(`State file not found for project "${projectId}": ${stateFile}`);
    }

    const raw = fs.readFileSync(stateFile, 'utf-8');
    let state: ProjectState;
    try {
      state = JSON.parse(raw) as ProjectState;
    } catch {
      throw new Error(`Corrupted state.json for project "${projectId}": ${stateFile}`);
    }

    // If any step was left as "running" (e.g. crash recovery), mark it paused
    for (const step of state.steps) {
      if (step.status === 'running') {
        step.status = 'paused';
        step.message = '上次运行被中断，已自动暂停';
      }
    }

    this.states.set(projectId, state);
    return state;
  }

  /** Persist state to disk using atomic write, and update cache. */
  private persist(state: ProjectState): void {
    state.updatedAt = now();
    this.states.set(state.id, state);

    const stateFile = this.getStatePath(state.id);
    const dir = path.dirname(stateFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const json = JSON.stringify(state, null, 2);
    atomicWriteSync(stateFile, json);
  }

  /** Get or create the StepState entry for a given step. */
  private getStepState(state: ProjectState, stepId: StepId): StepState {
    let entry = state.steps.find(s => s.id === stepId);
    if (!entry) {
      entry = {
        id: stepId,
        status: 'pending',
        progress: 0,
        message: '',
      };
      state.steps.push(entry);
    }
    return entry;
  }

  /** Partially update a step's state in-place. */
  private updateStepState(
    state: ProjectState,
    stepId: StepId,
    patch: Partial<StepState>,
  ): void {
    const entry = this.getStepState(state, stepId);
    Object.assign(entry, patch);
  }

  /** Check whether all dependencies for a step are completed. */
  private areDependenciesMet(state: ProjectState, stepId: StepId): boolean {
    if (!stepRegistry.has(stepId)) return true;
    const step = stepRegistry.get(stepId);
    for (const depId of step.dependencies) {
      const depState = this.getStepState(state, depId);
      if (depState.status !== 'completed' && depState.status !== 'skipped') {
        return false;
      }
    }
    return true;
  }

  // ----------------------------------------------------------
  // Paths
  // ----------------------------------------------------------

  /** Resolve the base data directory for all projects. */
  private getBaseDir(): string {
    // In Electron, use app.getPath('userData'). Outside Electron
    // (e.g. tests), fall back to ~/.storyforge.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { app } = require('electron');
      return path.join(app.getPath('userData'), 'storyforge', 'projects');
    } catch {
      const home = require('os').homedir();
      return path.join(home, '.storyforge', 'projects');
    }
  }

  /** Return the project directory for a given project id. */
  getProjectDir(projectId: string): string {
    return path.join(this.getBaseDir(), projectId);
  }

  /** Return the state.json path for a project. */
  private getStatePath(projectId: string): string {
    return path.join(this.getProjectDir(projectId), 'state.json');
  }

  // ----------------------------------------------------------
  // Event emission
  // ----------------------------------------------------------

  private emitProgress(
    projectId: string,
    stepId: StepId,
    status: StepStatus,
    progress: number,
    message: string,
  ): void {
    if (!this.progressCallback) return;
    const event: ProgressEvent = { projectId, stepId, status, progress, message };
    try {
      this.progressCallback(event);
    } catch (err) {
      log('error', `Progress callback threw: ${err}`);
    }
  }

  // ----------------------------------------------------------
  // Cache management (for ProjectManager integration)
  // ----------------------------------------------------------

  /** Insert or replace a state in the in-memory cache. */
  cacheState(state: ProjectState): void {
    this.states.set(state.id, state);
  }

  /** Remove a project from the in-memory cache. */
  evictState(projectId: string): void {
    this.states.delete(projectId);
  }
}

/** Singleton engine instance shared across the application. */
export const pipelineEngine = new PipelineEngine();
