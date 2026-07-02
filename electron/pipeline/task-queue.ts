// ============================================================
// Task Queue — serial task execution with queuing
// ============================================================

import { pipelineEngine } from './pipeline-engine';

export interface QueueItem {
  projectId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  addedAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export class TaskQueue {
  private queue: QueueItem[] = [];
  private isProcessing = false;
  private onQueueChanged?: (queue: QueueItem[]) => void;

  setOnQueueChanged(cb: (queue: QueueItem[]) => void): void {
    this.onQueueChanged = cb;
  }

  /** Add a project to the execution queue. */
  enqueue(projectId: string): void {
    // Avoid duplicate entries for the same project
    const existing = this.queue.find(
      q => q.projectId === projectId && (q.status === 'queued' || q.status === 'running')
    );
    if (existing) return;

    this.queue.push({
      projectId,
      status: 'queued',
      addedAt: Date.now(),
    });
    this.notifyChange();
    this.processNext();
  }

  /** Remove a queued project (cannot remove a running one). */
  dequeue(projectId: string): void {
    this.queue = this.queue.filter(
      q => q.projectId !== projectId || q.status === 'running'
    );
    this.notifyChange();
  }

  /** Get a snapshot of the current queue. */
  getQueue(): QueueItem[] {
    return [...this.queue];
  }

  /** Return the 1-based queue position for a project, or 0 if not queued. */
  getPosition(projectId: string): number {
    const queued = this.queue.filter(q => q.status === 'queued');
    const idx = queued.findIndex(q => q.projectId === projectId);
    return idx === -1 ? 0 : idx + 1;
  }

  /** Process the next queued item (single-concurrency). */
  private async processNext(): Promise<void> {
    if (this.isProcessing) return;

    const next = this.queue.find(q => q.status === 'queued');
    if (!next) return;

    this.isProcessing = true;
    next.status = 'running';
    next.startedAt = Date.now();
    this.notifyChange();

    try {
      await pipelineEngine.start(next.projectId);
      next.status = 'completed';
      next.completedAt = Date.now();
    } catch (err) {
      next.status = 'failed';
      next.error = err instanceof Error ? err.message : String(err);
      next.completedAt = Date.now();
    }

    this.isProcessing = false;
    this.notifyChange();

    // Continue with next item
    this.processNext();
  }

  private notifyChange(): void {
    this.onQueueChanged?.(this.getQueue());
  }
}

/** Singleton task queue instance. */
export const taskQueue = new TaskQueue();
