import type { EventBusLike } from '@prismgb/core';

export interface IIPCBridge {
  readonly eventBus: EventBusLike;
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}
