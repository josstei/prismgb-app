/**
 * EventBus - Global event publisher/subscriber
 * Similar to Spring's ApplicationEventPublisher pattern
 * Uses eventemitter3 for efficient event handling
 */

import EventEmitter from 'eventemitter3';

/**
 * EventBus provides a global publish/subscribe mechanism for application events
 * Usage in DI container:
 *   eventBus: asClass(EventBus).singleton()
 *
 * Usage in services:
 *   constructor({ eventBus }) {
 *     this.eventBus = eventBus;
 *     this.eventBus.subscribe('device:connected', this.handleDeviceConnected.bind(this));
 *   }
 */
class EventBus {
  constructor({ loggerFactory } = {}) {
    this.emitter = new EventEmitter();
    this.logger = loggerFactory?.create('EventBus');
  }

  /**
   * Publish an event to all subscribers
   * @param {string} eventName - The name of the event
   * @param {*} data - Event data payload
   */
  publish(eventName, data) {
    this.emitter.emit(eventName, data);
  }

  /**
   * Subscribe to an event
   * @param {string} eventName - The name of the event to subscribe to
   * @param {Function} handler - The callback function to handle the event
   * @returns {Function} Unsubscribe function
   */
  subscribe(eventName, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('Handler must be a function');
    }

    this.emitter.on(eventName, handler);

    // Return unsubscribe function
    return () => this.unsubscribe(eventName, handler);
  }

  /**
   * Unsubscribe from an event
   * @param {string} eventName - The name of the event
   * @param {Function} handler - The handler function to remove
   */
  unsubscribe(eventName, handler) {
    this.emitter.off(eventName, handler);
  }
}

export default EventBus;
