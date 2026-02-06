/**
 * Main Process EventBus
 * Wraps Node.js EventEmitter for cross-service communication in main process
 */

import { EventEmitter } from 'events';

/**
 * Event handler function type
 */
export type EventHandler<T = unknown> = (data: T) => void;

/**
 * Unsubscribe function type
 */
export type UnsubscribeFn = () => void;

/**
 * EventBus dependencies
 */
interface EventBusDependencies {
  loggerFactory?: {
    create: (name: string) => {
      error: (message: string, error: Error) => void;
    };
  };
}

/**
 * EventBus interface for type-safe event communication
 */
export interface IEventBus {
  publish<T = unknown>(event: string, data?: T): void;
  subscribe<T = unknown>(event: string, handler: EventHandler<T>): UnsubscribeFn;
  unsubscribe<T = unknown>(event: string, handler: EventHandler<T>): void;
}

/**
 * Main process EventBus implementation
 * Uses Node.js EventEmitter for event-driven communication
 */
class EventBus implements IEventBus {
  private readonly _emitter: EventEmitter;
  private readonly logger?: EventBusDependencies['loggerFactory'] extends { create: (name: string) => infer L } ? L : never;

  constructor({ loggerFactory }: EventBusDependencies = {}) {
    this._emitter = new EventEmitter();
    this.logger = loggerFactory?.create('EventBus');
  }

  /**
   * Publish an event with optional data
   * @param event - Event name
   * @param data - Event payload
   */
  publish<T = unknown>(event: string, data?: T): void {
    try {
      this._emitter.emit(event, data);
    } catch (error) {
      this.logger?.error(`Error in event handler for "${event}":`, error as Error);
    }
  }

  /**
   * Subscribe to an event
   * @param event - Event name to subscribe to
   * @param handler - Event handler function
   * @returns Unsubscribe function
   */
  subscribe<T = unknown>(event: string, handler: EventHandler<T>): UnsubscribeFn {
    if (typeof handler !== 'function') {
      throw new TypeError('Handler must be a function');
    }
    this._emitter.on(event, handler);
    return () => this._emitter.off(event, handler);
  }

  /**
   * Unsubscribe from an event
   * @param event - Event name to unsubscribe from
   * @param handler - Event handler function to remove
   */
  unsubscribe<T = unknown>(event: string, handler: EventHandler<T>): void {
    this._emitter.off(event, handler);
  }
}

export { EventBus };
