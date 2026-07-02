import { BaseStep } from './base-step';
import { StepId, STEP_ORDER } from './types';

/**
 * Central registry that maps step ids to their concrete instances.
 *
 * Steps register themselves at module load time via `stepRegistry.register()`.
 * The engine uses `getOrdered()` to iterate steps in pipeline order.
 */
class StepRegistry {
  private steps = new Map<StepId, BaseStep>();

  /** Register a step instance. Throws on duplicate id. */
  register(step: BaseStep): void {
    if (this.steps.has(step.id)) {
      throw new Error(`Step "${step.id}" is already registered`);
    }
    this.steps.set(step.id, step);
  }

  /** Retrieve a step by id. Throws if not registered. */
  get(id: StepId): BaseStep {
    const step = this.steps.get(id);
    if (!step) {
      throw new Error(`Step "${id}" is not registered`);
    }
    return step;
  }

  /** Return all registered steps in no particular order. */
  getAll(): BaseStep[] {
    return Array.from(this.steps.values());
  }

  /** Return steps sorted by the canonical pipeline order. */
  getOrdered(): BaseStep[] {
    return STEP_ORDER
      .filter(id => this.steps.has(id))
      .map(id => this.steps.get(id)!);
  }

  /** Check whether a step with the given id has been registered. */
  has(id: StepId): boolean {
    return this.steps.has(id);
  }
}

/** Singleton step registry shared across the application. */
export const stepRegistry = new StepRegistry();
