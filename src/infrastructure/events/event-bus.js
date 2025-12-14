/**
 * EventBus - Global event publisher/subscriber
 * Similar to Spring's ApplicationEventPublisher pattern
 * Uses eventemitter3 for efficient event handling
 */

import EventEmitter from 'eventemitter3';
import { EventChannels } from './event-channels.js';

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
    try {
      this.emitter.emit(eventName, data);
    } catch (error) {
      this.logger?.error(`Error in event handler for "${eventName}":`, error);
      this._emitHandlerError(eventName, error);
    }
  }

  /**
   * Emit error event for telemetry/monitoring when a handler fails
   * Guarded against recursion if the error handler itself fails
   * @param {string} eventName - The event that caused the error
   * @param {Error} error - The error thrown by the handler
   * @private
   */
  _emitHandlerError(eventName, error) {
    // Guard against recursion
    if (eventName === EventChannels.SYSTEM.HANDLER_ERROR) return;

    try {
      this.emitter.emit(EventChannels.SYSTEM.HANDLER_ERROR, {
        eventName,
        error: { name: error.name, message: error.message, stack: error.stack }
      });
    } catch {
      this.logger?.error('Error handler failed - suppressing to prevent recursion');
    }
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
