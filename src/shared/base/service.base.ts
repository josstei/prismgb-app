import { validateDependencies } from './validate-deps.utils.js';
import { DisposableBag } from './disposable-bag.js';

export interface LoggerLike {
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export type ServiceDependencies = object;
type DisposableFunction = () => void | Promise<void>;
type TimerHandle = ReturnType<typeof setTimeout>;

export interface EventTargetLike {
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: EventListenerOptions | boolean
  ): void;
}

export interface EventBusLike {
  publish(event: string, payload?: unknown): void;
  subscribe(event: string, handler: (...args: unknown[]) => void): DisposableFunction;
  unsubscribe?(event: string, handler: (...args: unknown[]) => void): void;
}

interface LoggerFactoryLike {
  create(name: string): LoggerLike;
}

export class BaseService {
  [dependencyName: string]: any;

  protected logger!: LoggerLike;
  protected readonly _serviceName: string;
  protected readonly disposables: DisposableBag;

  constructor(
    dependencies: ServiceDependencies,
    requiredDeps: string[] = [],
    serviceName: string | null = null
  ) {
    const name = serviceName || this.constructor.name;
    validateDependencies(dependencies, requiredDeps, name);
    const dependencyMap = dependencies as Record<string, unknown>;

    for (const dep of requiredDeps) {
      this[dep] = dependencyMap[dep];
    }

    const loggerFactory = dependencyMap.loggerFactory as LoggerFactoryLike | undefined;
    if (loggerFactory) {
      this.logger = loggerFactory.create(name);
    }

    this.disposables = new DisposableBag();
    this._serviceName = name;
  }

  listen(event: string, handler: (...args: unknown[]) => void): DisposableFunction {
    const eventBus = this.eventBus as EventBusLike | undefined;
    if (!eventBus || typeof eventBus.subscribe !== 'function') {
      this.logger?.warn(`Cannot subscribe to "${event}" - eventBus not available`);
      return () => {};
    }

    const unsubscribe = eventBus.subscribe(event, handler);
    return this.disposables.add(unsubscribe);
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
