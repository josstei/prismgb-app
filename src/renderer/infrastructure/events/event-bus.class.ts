import { SharedEventBus } from '@platform/events';
import { EventChannels } from '@platform/events';

type EventBusLoggerFactory = { create(name: string): { error(message: string, error: Error): void } };
type EventBusDependencies = { loggerFactory?: EventBusLoggerFactory };

class EventBus extends SharedEventBus {
  constructor({ loggerFactory }: EventBusDependencies = {}) {
    super({
      loggerFactory,
      handlerErrorEvent: EventChannels.SYSTEM.HANDLER_ERROR,
      createHandlerErrorPayload: (eventName, error) => ({
        eventName,
        error: { name: error.name, message: error.message, stack: error.stack }
      })
    });
  }
}

export { EventBus };
