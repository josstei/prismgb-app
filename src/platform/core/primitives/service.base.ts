import { ManagedLifecycleHost } from './managed-lifecycle-host.js';
import { getEventHandlerBindings } from './event-decorator.js';
import type { DisposableBag, DisposableFunction, DisposableKey, EventTargetLike } from './disposable-bag.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerLike {
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface EventBusLike {
  publish(event: string, payload?: unknown): void;
  publishAsync?(event: string, payload?: unknown): Promise<void>;
  subscribe(event: string, handler: (...args: unknown[]) => void | Promise<void>): DisposableFunction;
  unsubscribe?(event: string, handler: (...args: unknown[]) => void): void;
}

export interface LoggerFactoryLike {
  create(name: string): LoggerLike;
}

export interface StorageServiceLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): boolean;
  removeItem(key: string): void;
}

function isEventBusLike(value: unknown): value is EventBusLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { subscribe?: unknown }).subscribe === 'function'
  );
}

export class BaseService {
  protected logger!: LoggerLike;
  protected readonly lifecycle: ManagedLifecycleHost;
  protected readonly disposables: DisposableBag;
  private readonly _eventBus: EventBusLike | null;
  private readonly _serviceName: string;

  constructor(dependencies: object, serviceName: string | null = null) {
    const name = serviceName || this.constructor.name;
    const dependencyMap = dependencies as Record<string, unknown>;

    Object.assign(this, dependencyMap);

    const loggerFactory = dependencyMap.loggerFactory as LoggerFactoryLike | undefined;
    if (loggerFactory) {
      this.logger = loggerFactory.create(name);
    }

    this.lifecycle = new ManagedLifecycleHost();
    this.disposables = this.lifecycle.disposables;
    this._eventBus = isEventBusLike(dependencyMap.eventBus) ? dependencyMap.eventBus : null;
    this._serviceName = name;
  }

  listen(event: string, handler: (...args: unknown[]) => void | Promise<void>): DisposableFunction {
    if (!this._eventBus) {
      this.logger?.warn(`Cannot subscribe to "${event}" - eventBus not available`);
      return () => {};
    }

    const unsubscribe = this._eventBus.subscribe(event, handler);
    return this.disposables.add(unsubscribe);
  }

  protected bindEventHandlers(): void {
    const bindings = getEventHandlerBindings(this.constructor);
    const handlers = this as unknown as Record<string | symbol, (payload: unknown) => void | Promise<void>>;
    for (const { channel, methodKey } of bindings) {
      this.listen(channel, (payload: unknown) => handlers[methodKey](payload));
    }
  }

  subscribe(
    target: EventTargetLike,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): DisposableFunction {
    return this.lifecycle.subscribeEvent(target, type, listener, options);
  }

  timeout<TArgs extends unknown[]>(
    handler: (...args: TArgs) => void,
    delay: number,
    ...args: TArgs
  ): DisposableFunction {
    return this.lifecycle.timeout(handler, delay, ...args);
  }

  interval<TArgs extends unknown[]>(
    handler: (...args: TArgs) => void,
    delay: number,
    ...args: TArgs
  ): DisposableFunction {
    return this.lifecycle.interval(handler, delay, ...args);
  }

  animationFrame(handler: FrameRequestCallback): DisposableFunction {
    return this.lifecycle.animationFrame(handler);
  }

  schedule<TArgs extends unknown[]>(
    key: DisposableKey,
    handler: (...args: TArgs) => void,
    delay: number,
    ...args: TArgs
  ): DisposableFunction {
    return this.lifecycle.schedule(key, handler, delay, ...args);
  }

  scheduleInterval<TArgs extends unknown[]>(
    key: DisposableKey,
    handler: (...args: TArgs) => void,
    delay: number,
    ...args: TArgs
  ): DisposableFunction {
    return this.lifecycle.scheduleInterval(key, handler, delay, ...args);
  }

  cancelScheduled(key: DisposableKey): void | Promise<void> {
    return this.lifecycle.cancelScheduled(key);
  }

  dispose(): void | Promise<void> {
    return this.lifecycle.dispose();
  }
}
