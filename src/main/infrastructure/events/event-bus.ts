import { SharedEventBus } from '@shared/events/event-bus.js';
import type { EventHandler, IEventBus, UnsubscribeFn } from '@shared/events/event-bus.js';

type EventBusDependencies = ConstructorParameters<typeof SharedEventBus>[0];

class EventBus extends SharedEventBus {
  constructor({ loggerFactory }: EventBusDependencies = {}) {
    super({ loggerFactory });
  }
}

export { EventBus };
export type { EventHandler, IEventBus, UnsubscribeFn };
