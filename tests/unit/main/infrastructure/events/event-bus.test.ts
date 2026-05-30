import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@main/infrastructure/events/event-bus.js';
import { createLoggerFactory as createTestLoggerFactory } from '../../../../factories/index.js';

describe('Main EventBus', () => {
  it('publishes to subscribers and returns scoped unsubscribe functions', () => {
    const eventBus = new EventBus();
    const handler = vi.fn();
    const unsubscribeFirst = eventBus.subscribe('device:connection-changed', handler);
    eventBus.subscribe('device:connection-changed', handler);

    eventBus.publish('device:connection-changed', { connected: true });
    unsubscribeFirst();
    eventBus.publish('device:connection-changed', { connected: false });

    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler).toHaveBeenCalledWith({ connected: true });
    expect(handler).toHaveBeenLastCalledWith({ connected: false });
  });

  it('rejects non-function handlers', () => {
    const eventBus = new EventBus();
    expect(() => eventBus.subscribe('device:connection-changed', null as never)).toThrow(
      'Handler must be a function'
    );
  });

  it('logs handler errors without emitting renderer handler-error events', () => {
    const loggerFactory = createTestLoggerFactory();
    const eventBus = new EventBus({ loggerFactory });
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
