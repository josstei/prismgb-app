/**
 * EventBus Unit Tests
 *
 * Tests for publish/subscribe event system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus } from '@renderer/infrastructure/events/event-bus.js';
import { createMockLoggerFactory } from '../../../../mocks/index.js';

describe('EventBus', () => {
  let eventBus;
  let mockLoggerFactory;

  beforeEach(() => {
    mockLoggerFactory = createMockLoggerFactory();
    eventBus = new EventBus({ loggerFactory: mockLoggerFactory });
  });

  describe('Constructor', () => {
    it('should create EventBus without logger', () => {
      const bus = new EventBus();
      expect(bus).toBeDefined();
      expect(bus.emitter).toBeDefined();
    });

    it('should create EventBus with logger factory', () => {
      const bus = new EventBus({ loggerFactory: mockLoggerFactory });
      expect(bus).toBeDefined();
    });
  });

  describe('publish', () => {
    it('should publish events to subscribers', () => {
      const handler = vi.fn();
      eventBus.subscribe('test-event', handler);

      eventBus.publish('test-event', { data: 'test' });

      expect(handler).toHaveBeenCalledWith({ data: 'test' });
    });

    it('should publish to multiple subscribers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.subscribe('test-event', handler1);
      eventBus.subscribe('test-event', handler2);

      eventBus.publish('test-event', 'payload');

      expect(handler1).toHaveBeenCalledWith('payload');
      expect(handler2).toHaveBeenCalledWith('payload');
    });

    it('should not affect unrelated event subscribers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.subscribe('event-a', handler1);
      eventBus.subscribe('event-b', handler2);

      eventBus.publish('event-a', 'data');

      expect(handler1).toHaveBeenCalledWith('data');
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should handle publish with no subscribers', () => {
      // Should not throw
      expect(() => eventBus.publish('no-subscribers', 'data')).not.toThrow();
    });

    it('should handle publish with undefined data', () => {
      const handler = vi.fn();
      eventBus.subscribe('test-event', handler);

      eventBus.publish('test-event');

      expect(handler).toHaveBeenCalledWith(undefined);
    });

    it('should catch and log errors thrown by handlers', () => {
      const error = new Error('Handler error');
      const throwingHandler = vi.fn(() => {
        throw error;
      });
      eventBus.subscribe('error-event', throwingHandler);

      // Should not throw
      expect(() => eventBus.publish('error-event', 'data')).not.toThrow();

      expect(throwingHandler).toHaveBeenCalledWith('data');
      // Get the logger that was created for EventBus
      const logger = mockLoggerFactory.create.mock.results[0].value;
      expect(logger.error).toHaveBeenCalledWith(
        'Error in event handler for "error-event":',
        error
      );
    });

    it('should handle errors when no logger is configured', () => {
      const busWithoutLogger = new EventBus();
      const throwingHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      busWithoutLogger.subscribe('error-event', throwingHandler);

      // Should not throw even without logger
      expect(() => busWithoutLogger.publish('error-event', 'data')).not.toThrow();
    });
  });

  describe('subscribe', () => {
    it('should return an unsubscribe function', () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.subscribe('test-event', handler);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should throw for non-function handler', () => {
      expect(() => eventBus.subscribe('test-event', 'not-a-function'))
        .toThrow('Handler must be a function');

      expect(() => eventBus.subscribe('test-event', null))
        .toThrow('Handler must be a function');

      expect(() => eventBus.subscribe('test-event', {}))
        .toThrow('Handler must be a function');
    });

    it('should allow same handler for different events', () => {
      const handler = vi.fn();

      eventBus.subscribe('event-a', handler);
      eventBus.subscribe('event-b', handler);

      eventBus.publish('event-a', 'a');
      eventBus.publish('event-b', 'b');

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith('a');
      expect(handler).toHaveBeenCalledWith('b');
    });

    it('should allow multiple subscriptions of same handler to same event', () => {
      const handler = vi.fn();

      eventBus.subscribe('test-event', handler);
      eventBus.subscribe('test-event', handler);

      eventBus.publish('test-event', 'data');

      // Both subscriptions should fire
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('unsubscribe', () => {
    it('should remove handler via returned function', () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.subscribe('test-event', handler);

      eventBus.publish('test-event', 'before');
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();

      eventBus.publish('test-event', 'after');
      expect(handler).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('should remove handler via unsubscribe method', () => {
      const handler = vi.fn();
      eventBus.subscribe('test-event', handler);

      eventBus.publish('test-event', 'before');
      expect(handler).toHaveBeenCalledTimes(1);

      eventBus.unsubscribe('test-event', handler);

      eventBus.publish('test-event', 'after');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should only remove specific handler', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.subscribe('test-event', handler1);
      eventBus.subscribe('test-event', handler2);

      eventBus.unsubscribe('test-event', handler1);

      eventBus.publish('test-event', 'data');

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledWith('data');
    });

    it('should handle unsubscribe of non-existent handler', () => {
      const handler = vi.fn();

      // Should not throw
      expect(() => eventBus.unsubscribe('test-event', handler)).not.toThrow();
    });
  });

  describe('Event Patterns', () => {
    it('should support namespaced events', () => {
      const deviceHandler = vi.fn();
      const streamHandler = vi.fn();

      eventBus.subscribe('device:connected', deviceHandler);
      eventBus.subscribe('stream:started', streamHandler);

      eventBus.publish('device:connected', { deviceId: '123' });

      expect(deviceHandler).toHaveBeenCalledWith({ deviceId: '123' });
      expect(streamHandler).not.toHaveBeenCalled();
    });

    it('should handle complex event payloads', () => {
      const handler = vi.fn();
      eventBus.subscribe('complex-event', handler);

      const payload = {
        type: 'test',
        data: {
          nested: {
            value: 42,
          },
        },
        array: [1, 2, 3],
        timestamp: Date.now(),
      };

      eventBus.publish('complex-event', payload);

      expect(handler).toHaveBeenCalledWith(payload);
    });
  });

  describe('Performance', () => {
    it('should handle rapid publish/subscribe cycles', () => {
      const handler = vi.fn();
      eventBus.subscribe('perf-event', handler);

      const start = performance.now();

      for (let i = 0; i < 10000; i++) {
        eventBus.publish('perf-event', { index: i });
      }

      const duration = performance.now() - start;

      expect(handler).toHaveBeenCalledTimes(10000);
      expect(duration).toBeLessThan(500); // Should complete in under 500ms
    });

    it('should handle many subscribers efficiently', () => {
      const handlers = Array.from({ length: 100 }, () => vi.fn());

      handlers.forEach(handler => {
        eventBus.subscribe('many-subscribers', handler);
      });

      const start = performance.now();

      for (let i = 0; i < 1000; i++) {
        eventBus.publish('many-subscribers', { index: i });
      }

      const duration = performance.now() - start;

      handlers.forEach(handler => {
        expect(handler).toHaveBeenCalledTimes(1000);
      });

      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Memory Management', () => {
    it('should not leak memory when unsubscribing', () => {
      const handlers = [];

      // Add and remove many handlers
      for (let i = 0; i < 100; i++) {
        const handler = vi.fn();
        handlers.push(handler);
        const unsub = eventBus.subscribe('leak-test', handler);
        unsub();
      }

      // Publish should not call any handlers
      eventBus.publish('leak-test', 'data');

      handlers.forEach(handler => {
        expect(handler).not.toHaveBeenCalled();
      });
    });
  });
});
