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
    create: (name: string) => EventBusLogger;
  };
}

interface EventBusLogger {
  error: (message: string, error: Error) => void;
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
  private readonly logger: EventBusLogger | undefined;

  constructor({ loggerFactory }: EventBusDependencies = {}) {
    this._emitter = new EventEmitter();
    this.logger = loggerFactory?.create('EventBus');
  }

  publish<T = unknown>(event: string, data?: T): void {
    try {
      this._emitter.emit(event, data);
    } catch (error) {
      this.logger?.error(`Error in event handler for "${event}":`, error as Error);
    }
  }

  subscribe<T = unknown>(event: string, handler: EventHandler<T>): UnsubscribeFn {
    if (typeof handler !== 'function') {
      throw new TypeError('Handler must be a function');
    }
    this._emitter.on(event, handler);
    return () => this._emitter.off(event, handler);
  }

  unsubscribe<T = unknown>(event: string, handler: EventHandler<T>): void {
    this._emitter.off(event, handler);
  }
}

export { EventBus };
