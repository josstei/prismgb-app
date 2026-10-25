import { vi } from 'vitest';

/**
 * Synchronous event dispatch with Vitest call history and subscription spies.
 * @param {{ onSubscribe?: ((event: string, callback: (data: any) => any) => void) | null }} [options]
 */
export function createEventBus({ onSubscribe = null } = {}) {
  const listeners = new Map();

  const eventBus = {
    publish: vi.fn((event, data = undefined) => {
      for (const callback of [...(listeners.get(event) || [])]) {
        try {
          callback(data);
        } catch (error) {
          throw error instanceof Error ? error : new Error(String(error));
        }
      }
    }),
    publishAsync: vi.fn((...args) => {
      eventBus.publish(...args);
      return Promise.resolve();
    }),
    subscribe: vi.fn(/** @returns {import('@platform/core').DisposableFunction} */ (event, callback) => {
      const eventListeners = listeners.get(event) ?? [];
      eventListeners.push(callback);
      listeners.set(event, eventListeners);
      onSubscribe?.(event, callback);

      return vi.fn(() => {
        const index = eventListeners.indexOf(callback);
        if (index !== -1) eventListeners.splice(index, 1);
      });
    }),
    _getLastEventOfType(eventName) {
      const call = eventBus.publish.mock.calls.findLast(([event]) => event === eventName);
      return call ? { event: call[0], data: call[1] } : null;
    },
    _wereEventsInOrder(eventNames) {
      const publishedEvents = eventBus.publish.mock.calls.map(([event]) => event);
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
      vi.clearAllMocks();
    }
  };

  return eventBus;
}
