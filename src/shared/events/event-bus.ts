import EventEmitter from 'eventemitter3';

export type EventHandler<T = unknown> = (data: T) => void;
export type UnsubscribeFn = () => void;

interface EventBusLogger { error(message: string, error: Error): void; }
interface EventBusDependencies { loggerFactory?: { create(name: string): EventBusLogger; }; loggerName?: string; handlerErrorEvent?: string; createHandlerErrorPayload?: (eventName: string, error: Error) => unknown; }

export interface IEventBus { publish<T = unknown>(event: string, data?: T): void; subscribe<T = unknown>(event: string, handler: EventHandler<T>): UnsubscribeFn; unsubscribe<T = unknown>(event: string, handler: EventHandler<T>): void; }

export class SharedEventBus implements IEventBus {
  readonly emitter: EventEmitter<string, unknown>;
  private readonly listeners = new Map<string, Map<EventHandler<unknown>, Set<EventHandler<unknown>>>>();
  private readonly logger: EventBusLogger | undefined;
  private readonly handlerErrorEvent: string | undefined;
  private readonly createHandlerErrorPayload: ((eventName: string, error: Error) => unknown) | undefined;
  constructor({ loggerFactory, loggerName = 'EventBus', handlerErrorEvent, createHandlerErrorPayload }: EventBusDependencies = {}) {
    this.emitter = new EventEmitter();
    this.logger = loggerFactory?.create(loggerName);
    this.handlerErrorEvent = handlerErrorEvent;
    this.createHandlerErrorPayload = createHandlerErrorPayload;
  }
  publish<T = unknown>(event: string, data?: T): void {
    try {
      this.emitter.emit(event, data);
    } catch (error) {
      const handlerError = this.normalizeError(error);
      this.logger?.error(`Error in event handler for "${event}":`, handlerError);
      this.emitHandlerError(event, handlerError);
    }
  }
  subscribe<T = unknown>(event: string, handler: EventHandler<T>): UnsubscribeFn {
    if (typeof handler !== 'function') throw new TypeError('Handler must be a function');
    const sourceHandler = handler as EventHandler<unknown>, wrappedHandler = ((data: unknown) => handler(data as T)) as EventHandler<unknown>;
    const eventListeners = this.listeners.get(event) ?? new Map<EventHandler<unknown>, Set<EventHandler<unknown>>>();
    const handlerListeners = eventListeners.get(sourceHandler) ?? new Set<EventHandler<unknown>>();
    if (!this.listeners.has(event)) this.listeners.set(event, eventListeners);
    if (!eventListeners.has(sourceHandler)) eventListeners.set(sourceHandler, handlerListeners);
    handlerListeners.add(wrappedHandler);
    this.emitter.on(event, wrappedHandler);
    return () => this.removeSubscription(event, sourceHandler, wrappedHandler);
  }
  unsubscribe<T = unknown>(event: string, handler: EventHandler<T>): void {
    const sourceHandler = handler as EventHandler<unknown>, wrappedHandler = this.listeners.get(event)?.get(sourceHandler)?.values().next().value;
    if (wrappedHandler) this.removeSubscription(event, sourceHandler, wrappedHandler);
  }
  private removeSubscription(event: string, sourceHandler: EventHandler<unknown>, wrappedHandler: EventHandler<unknown>): void {
    this.emitter.off(event, wrappedHandler);
    const eventListeners = this.listeners.get(event), handlerListeners = eventListeners?.get(sourceHandler);
    handlerListeners?.delete(wrappedHandler);
    if (handlerListeners?.size === 0) eventListeners?.delete(sourceHandler);
    if (eventListeners?.size === 0) this.listeners.delete(event);
  }
  private emitHandlerError(event: string, error: Error): void {
    if (!this.handlerErrorEvent || event === this.handlerErrorEvent) return;
    try {
      this.emitter.emit(this.handlerErrorEvent, this.createHandlerErrorPayload?.(event, error) ?? { eventName: event, error });
    } catch (handlerError) {
      this.logger?.error('Error handler failed - suppressing to prevent recursion', this.normalizeError(handlerError));
    }
  }
  private normalizeError(error: unknown): Error { return error instanceof Error ? error : new Error(String(error)); }
}
