
import { PlatformEventBus } from '@platform/events';
import { EventChannels } from '@platform/events';
import type { LoggerFactoryLike } from '@platform/core';

type EventBusDependencies = {
  loggerFactory: LoggerFactoryLike;
};

class EventBus extends PlatformEventBus {
  constructor({ loggerFactory }: EventBusDependencies) {
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
