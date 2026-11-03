import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformEventBus } from '@platform/events';

describe('PlatformEventBus', () => {
  let eventBus: PlatformEventBus;
  const logger = { error: vi.fn() };

  beforeEach(() => {
    logger.error.mockClear();
    eventBus = new PlatformEventBus({ loggerFactory: { create: () => logger } });
  });

  it('delivers the payload to each subscriber of the published event', () => {
    const first = vi.fn();
    const second = vi.fn();
    const unrelated = vi.fn();
    const payload = { nested: { value: 42 } };
    eventBus.subscribe('device:connected', first);
    eventBus.subscribe('device:connected', second);
    eventBus.subscribe('stream:started', unrelated);

    eventBus.publish('device:connected', payload);

    expect(first).toHaveBeenCalledExactlyOnceWith(payload);
    expect(second).toHaveBeenCalledExactlyOnceWith(payload);
    expect(unrelated).not.toHaveBeenCalled();
  });

  it('supports events without payloads or subscribers', async () => {
    const handler = vi.fn();
    eventBus.subscribe('stopped', handler);
    eventBus.publish('stopped');
    expect(handler).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(() => eventBus.publish('unknown')).not.toThrow();
    await expect(eventBus.publishAsync('unknown')).resolves.toBeUndefined();
  });

  it('disposes duplicate subscriptions independently and idempotently', () => {
    const handler = vi.fn();
    const first = eventBus.subscribe('changed', handler);
    const second = eventBus.subscribe('changed', handler);
    const unrelated = eventBus.subscribe('other', handler);
    eventBus.publish('changed', 'both');

    second();
    second();
    eventBus.publish('changed', 'first');
    eventBus.publish('other', 'other');
    first();
    unrelated();
    eventBus.publish('changed', 'none');

    expect(handler.mock.calls).toEqual([['both'], ['both'], ['first'], ['other']]);
    expect(eventBus.emitter.eventNames()).toEqual([]);
  });

  it('releases listeners across repeated subscribe/dispose cycles', () => {
    const handler = vi.fn();
    for (let index = 0; index < 100; index++) {
      const dispose = eventBus.subscribe('changed', handler);
      dispose();
    }
    eventBus.publish('changed');
    expect(handler).not.toHaveBeenCalled();
    expect(eventBus.emitter.eventNames()).toEqual([]);
  });

  it.each(['not-a-function', null, {}])('rejects invalid handlers: %j', (handler) => {
    expect(() => eventBus.subscribe('changed', handler as unknown as () => void))
      .toThrow('Handler must be a function');
  });

  it('logs synchronous failures while continuing to deliver to other subscribers', () => {
    const failure = new Error('handler failed');
    const next = vi.fn();
    eventBus.subscribe('changed', () => { throw failure; });
    eventBus.subscribe('changed', next);

    expect(() => eventBus.publish('changed', 'payload')).not.toThrow();

    expect(logger.error).toHaveBeenCalledExactlyOnceWith('Error in event handler for "changed":', failure);
    expect(next).toHaveBeenCalledExactlyOnceWith('payload');
  });

  it('normalizes non-Error failures and works without a logger', () => {
    eventBus.subscribe('changed', () => { throw 'failed'; });
    eventBus.publish('changed');
    expect(logger.error).toHaveBeenCalledExactlyOnceWith('Error in event handler for "changed":', new Error('failed'));

    const withoutLogger = new PlatformEventBus();
    withoutLogger.subscribe('changed', () => { throw new Error('failed'); });
    expect(() => withoutLogger.publish('changed')).not.toThrow();
  });

  it('handles asynchronous failures from synchronous publication', async () => {
    const failure = new Error('asynchronous handler failed');
    eventBus.subscribe('changed', async () => { throw failure; });

    eventBus.publish('changed');
    await Promise.resolve();

    expect(logger.error).toHaveBeenCalledExactlyOnceWith('Error in event handler for "changed":', failure);
  });

  it('waits for all asynchronous handlers even when one fails', async () => {
    let complete!: () => void;
    const pending = new Promise<void>((resolve) => { complete = resolve; });
    const failure = new Error('save failed');
    const settled = vi.fn();
    const delayedHandler = vi.fn(() => pending);
    eventBus.subscribe('flush', async () => { throw failure; });
    eventBus.subscribe('flush', delayedHandler);

    const publication = eventBus.publishAsync('flush', 'payload').then(settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    expect(delayedHandler).toHaveBeenCalledExactlyOnceWith('payload');

    complete();
    await publication;
    expect(settled).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledExactlyOnceWith('Error in event handler for "flush":', failure);
  });
});
