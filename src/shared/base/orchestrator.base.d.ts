import type { LoggerLike } from './service.base.js';

interface EventBusLike {
  subscribe(event: string, handler: (...args: unknown[]) => void): () => void;
  publish(event: string, data?: unknown): void;
}

export class BaseOrchestrator {
  protected logger: LoggerLike;
  protected eventBus?: EventBusLike;
  isInitialized: boolean;
  constructor(dependencies: object, requiredDeps?: string[], name?: string);
  initialize(): Promise<void>;
  cleanup(): Promise<void>;
  subscribeWithCleanup(eventMap: Record<string, (...args: unknown[]) => void>): void;
  onInitialize(): Promise<void>;
  onCleanup(): Promise<void>;
}

/* eslint-disable no-redeclare */
export interface BaseOrchestrator extends Record<string, unknown> {}
/* eslint-enable no-redeclare */
