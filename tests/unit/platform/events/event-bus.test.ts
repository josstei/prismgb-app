import { describe, expect, it, vi } from 'vitest';
import { PlatformEventBus } from '@platform/events';
import { createLoggerFactory as createTestLoggerFactory } from '../../../factories/index.js';

describe('Main EventBus', () => {
  it('logs handler errors without emitting renderer handler-error events', () => {
    const loggerFactory = createTestLoggerFactory();
    const eventBus = new PlatformEventBus({ loggerFactory });
    const logger = loggerFactory._getLogger('EventBus');
    const error = new Error('main handler failed');
    const handlerErrorSubscriber = vi.fn();

    eventBus.subscribe('device:connection-changed', () => {
      throw error;
    });
    eventBus.subscribe('system:handler-error', handlerErrorSubscriber);

    expect(() => eventBus.publish('device:connection-changed')).not.toThrow();
    expect(logger.error).toHaveBeenCalledWith(
      'Error in event handler for "device:connection-changed":',
      error
    );
    expect(handlerErrorSubscriber).not.toHaveBeenCalled();
  });
});
