import { SharedEventBus } from '@prismgb/events';

type EventBusDependencies = ConstructorParameters<typeof SharedEventBus>[0];

class EventBus extends SharedEventBus {
  constructor({ loggerFactory }: EventBusDependencies = {}) {
    super({ loggerFactory });
  }
}

export { EventBus };
