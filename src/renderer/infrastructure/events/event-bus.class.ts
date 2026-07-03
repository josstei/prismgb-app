import { injectable, inject } from 'inversify';
import { SharedEventBus } from '@platform/events';
import { EventChannels } from '@platform/events';
import type { LoggerFactoryLike } from '@platform/core';
import { TOKENS } from '@renderer/application/di/tokens.js';

@injectable()
class EventBus extends SharedEventBus {
  constructor(@inject(TOKENS.loggerFactory) loggerFactory: LoggerFactoryLike) {
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
