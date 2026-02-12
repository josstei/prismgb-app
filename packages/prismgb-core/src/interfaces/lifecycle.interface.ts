export interface ILifecycle {
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}

export interface IEventSubscriber {
  subscribeWithCleanup(eventMap: Record<string, (...args: unknown[]) => void>): void;
}
