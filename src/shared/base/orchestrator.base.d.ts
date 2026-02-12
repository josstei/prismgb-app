import { LifecycleService } from './lifecycle-service.base';
import type { ServiceDependencies } from './service.base.js';

export class BaseOrchestrator<TDependencies extends ServiceDependencies = ServiceDependencies>
  extends LifecycleService<TDependencies> {
  constructor(
    dependencies: TDependencies,
    requiredDeps?: ReadonlyArray<Extract<keyof TDependencies, string>>,
    name?: string
  );
  cleanup(): Promise<void>;
  onCleanup(): Promise<void>;
  onDispose(): Promise<void>;
}

/* eslint-disable no-redeclare */
export interface BaseOrchestrator<TDependencies extends ServiceDependencies = ServiceDependencies>
  extends TDependencies {}
/* eslint-enable no-redeclare */
