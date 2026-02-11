import { LifecycleService } from './lifecycle-service.base.ts';

export class BaseOrchestrator extends LifecycleService {
  constructor(dependencies: object, requiredDeps?: string[], name?: string);
  cleanup(): Promise<void>;
  onCleanup(): Promise<void>;
  onDispose(): Promise<void>;
}

/* eslint-disable no-redeclare */
export interface BaseOrchestrator extends Record<string, unknown> {}
/* eslint-enable no-redeclare */
