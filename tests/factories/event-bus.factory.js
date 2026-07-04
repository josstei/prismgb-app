/**
 * EventBus Factory
 *
 * Creates mock EventBus instances with enhanced testing capabilities.
 * Supports event recording, filtering, and contract validation.
 */

import { vi } from 'vitest';

/**
 * Creates a mock EventBus with full testing support
 * @param {Object} [options] - Factory options
 * @param {boolean} [options.recordEvents] - Whether to record all events (default: true)
 * @param {Function} [options.onPublish] - Callback for each publish
 * @param {Function} [options.onSubscribe] - Callback for each subscribe
 * @param {Function} [options.onHandlerError] - Callback when a subscriber throws
 * @param {string} [options.handlerErrorEvent] - Optional event to publish instead of rethrowing
 * @param {Function} [options.createHandlerErrorPayload] - Optional handler-error payload mapper
 * @returns {Object} Mock EventBus instance
 */
export function createEventBus(options = {}) {
  const {
    recordEvents = true,
    onPublish = null,
    onSubscribe = null,
    onHandlerError = null,
    handlerErrorEvent = null,
    createHandlerErrorPayload = (eventName, error) => ({
      eventName,
      error: { name: error.name, message: error.message, stack: error.stack },
    }),
  } = options;

  const listeners = new Map();
  const eventHistory = [];
  const subscriptionHistory = [];

  const normalizeError = (error) => error instanceof Error ? error : new Error(String(error));

  const eventBus = {
    /**
     * Publish an event with data
     */
    publish: vi.fn((event, data) => {
      if (recordEvents) {
        eventHistory.push({
          event,
          data,
          timestamp: Date.now(),
        });
      }

      onPublish?.(event, data);

      const eventListeners = [...(listeners.get(event) || [])];
      for (const { callback, once } of eventListeners) {
        try {
          callback(data);
        } catch (error) {
          const handlerError = normalizeError(error);
          onHandlerError?.(event, handlerError);
          if (!handlerErrorEvent || event === handlerErrorEvent) {
            throw handlerError;
          }
          eventBus.publish(handlerErrorEvent, createHandlerErrorPayload(event, handlerError));
        } finally {
          if (once) {
            eventBus.unsubscribe(event, callback);
          }
        }
      }
    }),

    /**
     * Publish an event asynchronously
     */
    publishAsync: vi.fn((...args) => {
      eventBus.publish(...args);
      return Promise.resolve();
    }),

    /**
     * Subscribe to an event
     */
    subscribe: vi.fn((event, callback, options = {}) => {
      const { once = false } = options;

      if (!listeners.has(event)) {
        listeners.set(event, []);
      }

      const subscription = { callback, once };
      listeners.get(event).push(subscription);

      if (recordEvents) {
        subscriptionHistory.push({
          event,
          action: 'subscribe',
          timestamp: Date.now(),
        });
      }

      onSubscribe?.(event, callback);

      // Return unsubscribe function
      return vi.fn(() => {
        eventBus.unsubscribe(event, callback);
      });
    }),

    /**
     * Subscribe to an event once
     */
    subscribeOnce: vi.fn((event, callback) => {
      return eventBus.subscribe(event, callback, { once: true });
    }),

    /**
     * Unsubscribe from an event
     */
    unsubscribe: vi.fn((event, callback) => {
      const eventListeners = listeners.get(event);
      if (eventListeners) {
        const index = eventListeners.findIndex(l => l.callback === callback);
        if (index > -1) {
          eventListeners.splice(index, 1);
          if (recordEvents) {
            subscriptionHistory.push({
              event,
              action: 'unsubscribe',
              timestamp: Date.now(),
            });
          }
        }
      }
    }),

    /**
     * Check if event has listeners
     */
    hasListeners: vi.fn((event) => {
      return (listeners.get(event) || []).length > 0;
    }),

    // ==========================================
    // Test Helpers
    // ==========================================

    /**
     * Get listener count for an event
     */
    _getListenerCount(event) {
      return (listeners.get(event) || []).length;
    },

    /**
     * Get total listener count across all events
     */
    _getTotalListenerCount() {
      let count = 0;
      listeners.forEach(arr => count += arr.length);
      return count;
    },

    /**
     * Get all events published
     */
    _getEventHistory() {
      return [...eventHistory];
    },

    /**
     * Get events filtered by name
     */
    _getEventsOfType(eventName) {
      return eventHistory.filter(e => e.event === eventName);
    },

    /**
     * Get the last event published
     */
    _getLastEvent() {
      return eventHistory[eventHistory.length - 1] || null;
    },

    /**
     * Get the last event of a specific type
     */
    _getLastEventOfType(eventName) {
      for (let i = eventHistory.length - 1; i >= 0; i--) {
        if (eventHistory[i].event === eventName) {
          return eventHistory[i];
        }
      }
      return null;
    },

    /**
     * Check if an event was published
     */
    _wasEventPublished(eventName) {
      return eventHistory.some(e => e.event === eventName);
    },

    /**
     * Check event order
     */
    _wereEventsInOrder(eventNames) {
      const publishedEvents = eventHistory.map(e => e.event);
      let lastIndex = -1;

      for (const name of eventNames) {
        const index = publishedEvents.indexOf(name, lastIndex + 1);
        if (index === -1) return false;
        lastIndex = index;
      }

      return true;
    },

    /**
     * Manually trigger event listeners (without recording)
     */
    _trigger(event, data) {
      const eventListeners = listeners.get(event) || [];
      eventListeners.forEach(({ callback }) => callback(data));
    },

    /**
     * Clear all listeners
     */
    _clearListeners() {
      listeners.clear();
    },

    /**
     * Clear event history
     */
    _clearHistory() {
      eventHistory.length = 0;
      subscriptionHistory.length = 0;
    },

    /**
     * Full reset
     */
    _reset() {
      listeners.clear();
      eventHistory.length = 0;
      subscriptionHistory.length = 0;
      vi.clearAllMocks();
    },

    /**
     * Get raw listeners map
     */
    _listeners: listeners,

    /**
     * Get subscription history
     */
    _subscriptionHistory: subscriptionHistory,
  };

  return eventBus;
}
