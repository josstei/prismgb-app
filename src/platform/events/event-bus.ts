import EventEmitter from 'eventemitter3';
import { isPromiseLike } from '@platform/core';

type EventHandler<T = unknown> = (data: T) => void | Promise<void>;

interface EventBusLogger {
  error(message: string, error: Error): void;
}

interface EventBusDependencies {
  loggerFactory?: {
    create(name: string): EventBusLogger;
  };
}

export class PlatformEventBus {
  readonly emitter: EventEmitter<string, unknown>;
  private readonly logger: EventBusLogger | undefined;

  constructor({ loggerFactory }: EventBusDependencies = {}) {
    this.emitter = new EventEmitter();
    this.logger = loggerFactory?.create('EventBus');
  }

  publish<T = unknown>(event: string, data?: T): void {
    this.emitter.emit(event, data);
  }

  async publishAsync<T = unknown>(event: string, data?: T): Promise<void> {
    await Promise.all(this.emitter.listeners(event).map((handler) => handler(data)));
  }

  subscribe<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    if (typeof handler !== 'function') {
      throw new TypeError('Handler must be a function');
    }

    const sourceHandler = handler as EventHandler<unknown>;
    const wrappedHandler = (data: unknown) => this.invokeHandler(event, sourceHandler, data);
    this.emitter.on(event, wrappedHandler);

    return () => { this.emitter.off(event, wrappedHandler); };
  }

  private invokeHandler(event: string, handler: EventHandler<unknown>, data: unknown): void | Promise<void> {
    try {
      const result = handler(data);
      if (isPromiseLike<void>(result)) {
        return result.catch((error) => this.handleHandlerError(event, error));
      }
    } catch (error) {
      this.handleHandlerError(event, error);
    }
  }

  private handleHandlerError(event: string, error: unknown): void {
    const handlerError = error instanceof Error ? error : new Error(String(error));
    this.logger?.error(`Error in event handler for "${event}":`, handlerError);
  }
}
