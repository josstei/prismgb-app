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
  const eventHistory = [];

  const eventBus = {
    publish: vi.fn((event, data) => {
      eventHistory.push({ event, data, timestamp: Date.now() });
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
    }),

    _getLastEventOfType(eventName) {
      for (let i = eventHistory.length - 1; i >= 0; i--) {
        if (eventHistory[i].event === eventName) {
          return eventHistory[i];
        }
      }
      return null;
    },

    _wereEventsInOrder(eventNames) {
      const publishedEvents = eventHistory.map((e) => e.event);
      let lastIndex = -1;
      for (const name of eventNames) {
        const index = publishedEvents.indexOf(name, lastIndex + 1);
        if (index === -1) return false;
        lastIndex = index;
      }
      return true;
    },

    _reset() {
      listeners.clear();
      eventHistory.length = 0;
      vi.clearAllMocks();
    }
  };

  return eventBus;
}
