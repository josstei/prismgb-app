import { vi } from 'vitest';

/**
 * Creates a recording EventBus mock. Unlike the real bus, a throwing subscriber
 * rethrows so the failing test surfaces the error.
 * @param {Object} [options]
 * @param {Function} [options.onSubscribe] - Called with (event, callback) for each subscribe
 * @returns {Object} Mock EventBus instance
 */
export function createEventBus(options = {}) {
  const { onSubscribe = null } = options;

  const listeners = new Map();

  const eventBus = {
    publish: vi.fn((event, data) => {
      for (const callback of [...(listeners.get(event) || [])]) {
        callback(data);
      }
    }),

    publishAsync: vi.fn((...args) => {
      eventBus.publish(...args);
      return Promise.resolve();
    }),

    subscribe: vi.fn((event, callback) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      const subscription = (data) => callback(data);
      listeners.get(event).add(subscription);
      onSubscribe?.(event, callback);
      return vi.fn(() => {
        listeners.get(event)?.delete(subscription);
      });
    })
  };

  return eventBus;
}
