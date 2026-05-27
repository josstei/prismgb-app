import { validateDependencies } from './validate-deps.utils.js';
import { DisposableBag, type DisposableFunction, type EventTargetLike } from './disposable-bag.js';

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

export type ServiceEventDescriptor<TOwner> = readonly [string, (owner: TOwner, payload?: unknown) => void | Promise<void>];

function isEventBusLike(value: unknown): value is EventBusLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { subscribe?: unknown }).subscribe === 'function'
  );
}

export class BaseService {
  protected logger!: LoggerLike;
  protected readonly disposables: DisposableBag;
  private readonly _eventBus: EventBusLike | null;
  private readonly _serviceName: string;

  constructor(
    dependencies: object,
    requiredDeps: string[] = [],
    serviceName: string | null = null
  ) {
    const name = serviceName || this.constructor.name;
    validateDependencies(dependencies, requiredDeps, name);
    const dependencyMap = dependencies as Record<string, unknown>;

    Object.assign(this, dependencyMap);

    const loggerFactory = dependencyMap.loggerFactory as LoggerFactoryLike | undefined;
    if (loggerFactory) {
      this.logger = loggerFactory.create(name);
    }

    this.disposables = new DisposableBag();
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

  protected listenToDescriptors<TOwner extends this>(descriptors: readonly ServiceEventDescriptor<TOwner>[]): void {
    const owner = this as TOwner;
    descriptors.forEach(([event, handle]) => this.listen(event, (payload) => handle(owner, payload)));
  }

  subscribe(
    target: EventTargetLike,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): DisposableFunction {
    return this.disposables.addEvent(target, type, listener, options);
  }

  timeout<T extends (...args: unknown[]) => void>(
    handler: T,
    delay: number,
    ...args: Parameters<T>
  ): DisposableFunction {
    const handle = setTimeout(handler, delay, ...args);
    return this.disposables.addTimeout(handle);
  }

  interval<T extends (...args: unknown[]) => void>(
    handler: T,
    delay: number,
    ...args: Parameters<T>
  ): DisposableFunction {
    const handle = setInterval(handler, delay, ...args);
    return this.disposables.addInterval(handle);
  }

  animationFrame(handler: FrameRequestCallback): DisposableFunction {
    const handle = requestAnimationFrame(handler);
    return this.disposables.addAnimationFrame(handle);
  }

  dispose(): void | Promise<void> {
    return this.disposables.clear();
  }
}
