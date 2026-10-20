import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseOrchestrator } from '@platform/core';
import { getEventHandlerBindings } from '../../../../../src/platform/core/event-decorator';
import { EventBus, OnEvent } from '@renderer/lib/events/event-bus';
import { EventChannels } from '@renderer/lib/events/event-channels';
import type { StreamStartedPayload } from '@renderer/lib/events/event-payloads';
import { createLogger, createLoggerFactory } from '../../../../factories/index.js';

describe('EventBus', () => {
  let logger: ReturnType<typeof createLogger>;
  let eventBus: EventBus;

  beforeEach(() => {
    logger = createLogger({ name: 'EventBus' });
    eventBus = new EventBus(logger);
  });

  describe('publish', () => {
    it('delivers the payload to every subscriber of the channel', () => {
      const first = vi.fn();
      const second = vi.fn();
      eventBus.subscribe(EventChannels.SETTINGS.VOLUME_CHANGED, first);
      eventBus.subscribe(EventChannels.SETTINGS.VOLUME_CHANGED, second);

      eventBus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, 42);

      expect(first).toHaveBeenCalledWith(42);
      expect(second).toHaveBeenCalledWith(42);
    });

    it('keeps namespaced channels isolated from each other', () => {
      const deviceHandler = vi.fn();
      const streamHandler = vi.fn();
      eventBus.subscribe(EventChannels.DEVICE.ENUMERATION_FAILED, deviceHandler);
      eventBus.subscribe(EventChannels.STREAM.ERROR, streamHandler);

      eventBus.publish(EventChannels.DEVICE.ENUMERATION_FAILED, { reason: 'denied' });

      expect(deviceHandler).toHaveBeenCalledWith({ reason: 'denied' });
      expect(streamHandler).not.toHaveBeenCalled();
    });

    it('does nothing when a channel has no subscribers', () => {
      expect(() => eventBus.publish(EventChannels.STREAM.STOPPED)).not.toThrow();
    });

    it('calls void-channel subscribers without a payload', () => {
      const handler = vi.fn();
      eventBus.subscribe(EventChannels.STREAM.STOPPED, handler);

      eventBus.publish(EventChannels.STREAM.STOPPED);

      expect(handler).toHaveBeenCalledWith(undefined);
    });

    it('delivers object payloads by reference', () => {
      const handler = vi.fn();
      const payload = { message: 'Screenshot saved!', type: 'success' };
      eventBus.subscribe(EventChannels.UI.STATUS_MESSAGE, handler);

      eventBus.publish(EventChannels.UI.STATUS_MESSAGE, payload);

      expect(handler.mock.calls[0][0]).toBe(payload);
    });

    it('logs a throwing handler and still notifies the remaining subscribers', () => {
      const error = new Error('Handler error');
      const after = vi.fn();
      eventBus.subscribe(EventChannels.SETTINGS.VOLUME_CHANGED, () => {
        throw error;
      });
      eventBus.subscribe(EventChannels.SETTINGS.VOLUME_CHANGED, after);

      expect(() => eventBus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, 1)).not.toThrow();

      expect(logger.error).toHaveBeenCalledWith('Error in event handler for "settings:volume-changed":', error);
      expect(after).toHaveBeenCalledWith(1);
    });

    it('normalizes non-Error throws before logging them', () => {
      eventBus.subscribe(EventChannels.SETTINGS.VOLUME_CHANGED, () => {
        throw 'boom';
      });

      eventBus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, 1);

      const [, logged] = logger.error.mock.calls[0];
      expect(logged).toBeInstanceOf(Error);
      expect(logged.message).toBe('boom');
    });

    it('logs rejected async handlers', async () => {
      const error = new Error('async failure');
      eventBus.subscribe(EventChannels.SETTINGS.VOLUME_CHANGED, async () => {
        throw error;
      });

      eventBus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, 1);
      await Promise.resolve();
      await Promise.resolve();

      expect(logger.error).toHaveBeenCalledWith('Error in event handler for "settings:volume-changed":', error);
    });

    it('swallows handler errors when no logger is configured', () => {
      const bus = new EventBus();
      bus.subscribe(EventChannels.SETTINGS.VOLUME_CHANGED, () => {
        throw new Error('Handler error');
      });

      expect(() => bus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, 1)).not.toThrow();
    });

    it('does not call listeners added during an emit until the next emit', () => {
      const late = vi.fn();
      eventBus.subscribe(EventChannels.SETTINGS.VOLUME_CHANGED, () => {
        eventBus.subscribe(EventChannels.SETTINGS.VOLUME_CHANGED, late);
      });

      eventBus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, 1);
      expect(late).not.toHaveBeenCalled();

      eventBus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, 2);
      expect(late).toHaveBeenCalledWith(2);
    });

    it('still calls listeners removed during an emit for that emit only', () => {
      const removed = vi.fn();
      let unsubscribeRemoved: () => void = () => {};
      eventBus.subscribe(EventChannels.SETTINGS.VOLUME_CHANGED, () => unsubscribeRemoved());
      unsubscribeRemoved = eventBus.subscribe(EventChannels.SETTINGS.VOLUME_CHANGED, removed);

      eventBus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, 1);
      eventBus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, 2);

      expect(removed).toHaveBeenCalledTimes(1);
      expect(removed).toHaveBeenCalledWith(1);
    });
  });

  describe('subscribe', () => {
    it('returns a disposer that stops delivery', () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.subscribe(EventChannels.SETTINGS.VOLUME_CHANGED, handler);

      eventBus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, 1);
      unsubscribe();
      eventBus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, 2);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(1);
    });

    it('treats each subscription of the same handler independently', () => {
      const handler = vi.fn();
      const unsubscribeFirst = eventBus.subscribe(EventChannels.SETTINGS.VOLUME_CHANGED, handler);
      eventBus.subscribe(EventChannels.SETTINGS.VOLUME_CHANGED, handler);
      eventBus.subscribe(EventChannels.SETTINGS.BRIGHTNESS_CHANGED, handler);

      eventBus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, 1);
      unsubscribeFirst();
      eventBus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, 2);
      eventBus.publish(EventChannels.SETTINGS.BRIGHTNESS_CHANGED, 1.2);

      expect(handler.mock.calls).toEqual([[1], [1], [2], [1.2]]);
    });

    it('tolerates calling a disposer more than once', () => {
      const unsubscribe = eventBus.subscribe(EventChannels.SETTINGS.VOLUME_CHANGED, vi.fn());

      unsubscribe();

      expect(() => unsubscribe()).not.toThrow();
    });
  });

  describe('publishAsync', () => {
    it('resolves after every async handler settles', async () => {
      const order: string[] = [];
      eventBus.subscribe(EventChannels.CAPTURE.RECORDING_STARTED, async () => {
        await Promise.resolve();
        order.push('async');
      });
      eventBus.subscribe(EventChannels.CAPTURE.RECORDING_STARTED, () => {
        order.push('sync');
      });

      await eventBus.publishAsync(EventChannels.CAPTURE.RECORDING_STARTED);

      expect(order).toEqual(['sync', 'async']);
    });

    it('resolves and logs when an async handler rejects', async () => {
      const error = new Error('async failure');
      eventBus.subscribe(EventChannels.CAPTURE.RECORDING_STARTED, async () => {
        throw error;
      });

      await expect(eventBus.publishAsync(EventChannels.CAPTURE.RECORDING_STARTED)).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith('Error in event handler for "capture:recording-started":', error);
    });
  });
});

type SubscribeFn = (channel: string, handler: (payload: unknown) => void | Promise<void>) => () => void;

class TypedSubscriberOrchestrator extends BaseOrchestrator {
  payloads: StreamStartedPayload[] = [];

  constructor(bus: { subscribe: SubscribeFn }) {
    super(createLoggerFactory(), 'TypedSubscriberOrchestrator', bus);
  }

  @OnEvent(EventChannels.STREAM.STARTED)
  handleStreamStarted(payload: StreamStartedPayload): void {
    this.payloads.push(payload);
  }

  @OnEvent(EventChannels.STREAM.STOPPED)
  handleStreamStopped(): void {}
}

class MistypedSubscriberOrchestrator extends BaseOrchestrator {
  // @ts-expect-error handler payload parameter must match EventPayloadMap['stream:started']
  @OnEvent(EventChannels.STREAM.STARTED)
  handleStreamStarted(_payload: number): void {}
}

describe('OnEvent', () => {
  it('registers bindings against renderer event channels', () => {
    expect(getEventHandlerBindings(TypedSubscriberOrchestrator)).toEqual([
      { channel: EventChannels.STREAM.STARTED, methodKey: 'handleStreamStarted' },
      { channel: EventChannels.STREAM.STOPPED, methodKey: 'handleStreamStopped' }
    ]);
  });

  it('delivers published payloads to typed handlers once the orchestrator initializes', async () => {
    const bus = new EventBus();
    const orchestrator = new TypedSubscriberOrchestrator(bus);

    await orchestrator.initialize();
    const payload = { stream: {}, device: {}, settings: null, capabilities: {} } as StreamStartedPayload;
    bus.publish(EventChannels.STREAM.STARTED, payload);

    expect(orchestrator.payloads).toEqual([payload]);
  });

  it('keeps mistyped handler classes registered at runtime despite compile-time rejection', () => {
    expect(getEventHandlerBindings(MistypedSubscriberOrchestrator)).toHaveLength(1);
  });
});
