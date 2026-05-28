import { SharedEventBus } from '@prismgb/events';
import type { EventHandler, IEventBus, UnsubscribeFn } from '@prismgb/events';

type EventBusDependencies = ConstructorParameters<typeof SharedEventBus>[0];

class EventBus extends SharedEventBus {
  constructor({ loggerFactory }: EventBusDependencies = {}) {
    super({ loggerFactory });
  }
}

export { EventBus };
export type { EventHandler, IEventBus, UnsubscribeFn };
