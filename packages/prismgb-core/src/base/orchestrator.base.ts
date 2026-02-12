import { LifecycleService } from './lifecycle-service.base';
import type { ServiceDependencies } from './service.base';

export class BaseOrchestrator<TDependencies extends ServiceDependencies = ServiceDependencies>
  extends LifecycleService<TDependencies> {
  protected readonly _orchestratorName: string;

  constructor(
    dependencies: TDependencies,
    requiredDeps?: ReadonlyArray<Extract<keyof TDependencies, string>>,
    name?: string
  ) {
    super(dependencies, requiredDeps, name);
    this._orchestratorName = name || this.constructor.name;
  }

  async cleanup(): Promise<void> {
    await this.dispose();
  }

  async onCleanup(): Promise<void> {
    // Override in subclasses
  }

  async onDispose(): Promise<void> {
    await this.onCleanup();
  }
}

/* eslint-disable no-redeclare */
// @ts-expect-error TS2430: Intentional declaration merging — exposes injected dependencies as typed properties on subclass instances
export interface BaseOrchestrator<TDependencies extends ServiceDependencies = ServiceDependencies>
  extends TDependencies {}
/* eslint-enable no-redeclare */
