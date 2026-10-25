import { ManagedLifecycleHost } from './managed-lifecycle-host.js';
import { getEventHandlerBindings } from './event-decorator.js';
import type { DisposableBag, DisposableFunction, DisposableKey } from './disposable-bag.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerLike {
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface EventPublisherLike {
  publish(event: string, payload?: unknown): void;
}

export interface EventBusLike extends EventPublisherLike {
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

export interface LifecycleDependencies {
  eventBus?: EventBusLike | null;
  loggerFactory?: LoggerFactoryLike | null;
}

export class BaseService {
  protected logger!: LoggerLike;
  readonly disposables: DisposableBag;
  private readonly _lifecycle: ManagedLifecycleHost;
  protected _initialized: boolean;
  private _initialization: Promise<void> | null = null;
  private readonly _eventBus: EventBusLike | null;
  private readonly _serviceName: string;

  constructor({ loggerFactory, eventBus }: LifecycleDependencies, serviceName: string | null = null) {
    const name = serviceName || this.constructor.name;
    if (loggerFactory) {
      this.logger = loggerFactory.create(name);
    }

    this._lifecycle = new ManagedLifecycleHost();
    this.disposables = this._lifecycle.disposables;
    this._initialized = false;
    this._eventBus = eventBus ?? null;
    this._serviceName = name;
  }

  initialize(..._args: unknown[]): void | Promise<void> {
    if (this._initialized) {
      this.logger?.warn(`${this._serviceName} already initialized`);
      return;
    }

    if (this._initialization) return this._initialization;
    const result = this.onInitialize();
    if (result instanceof Promise) {
      this._initialization = result.then(() => {
        this._initialized = true;
      }).catch(async (error: unknown) => {
        await this._lifecycle.dispose().catch((cleanupError: unknown) => {
          this.logger?.error(`${this._serviceName} initialization rollback failed`, cleanupError);
        });
        throw error;
      }).finally(() => { this._initialization = null; });
      return this._initialization;
    }

    this._initialized = true;
  }

  protected onInitialize(): void | Promise<void> {}

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

  timeout<TArgs extends unknown[]>(
    handler: (...args: TArgs) => void,
    delay: number,
    ...args: TArgs
  ): DisposableFunction {
    return this._lifecycle.timeout(handler, delay, ...args);
  }

  interval<TArgs extends unknown[]>(
    handler: (...args: TArgs) => void,
    delay: number,
    ...args: TArgs
  ): DisposableFunction {
    return this._lifecycle.interval(handler, delay, ...args);
  }

  schedule<TArgs extends unknown[]>(
    key: DisposableKey,
    handler: (...args: TArgs) => void,
    delay: number,
    ...args: TArgs
  ): DisposableFunction {
    return this._lifecycle.schedule(key, handler, delay, ...args);
  }

  scheduleInterval<TArgs extends unknown[]>(
    key: DisposableKey,
    handler: (...args: TArgs) => void,
    delay: number,
    ...args: TArgs
  ): DisposableFunction {
    return this._lifecycle.scheduleInterval(key, handler, delay, ...args);
  }

  cancelScheduled(key: DisposableKey): void | Promise<void> {
    return this._lifecycle.cancelScheduled(key);
  }

  dispose(): void | Promise<void> {
    this._initialized = false;
    return this._lifecycle.dispose();
  }
}
