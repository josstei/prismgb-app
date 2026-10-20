import { injectable, inject } from 'inversify';
import { PlatformEventBus } from '@platform/events';
import { EventChannels } from '@platform/events';
import type { LoggerFactory } from '@platform/core';
import { TOKENS } from '@renderer/application/di/tokens';

@injectable()
class EventBus extends PlatformEventBus {
  constructor(@inject(TOKENS.loggerFactory) loggerFactory: LoggerFactory) {
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
