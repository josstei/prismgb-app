export interface LoggerLike {
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export type ServiceDependencies = Record<string, unknown>;
type DisposableFunction = () => void | Promise<void>;
type TimerHandle = ReturnType<typeof setTimeout>;

export interface EventTargetLike {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean): void;
}

export interface EventBusLike {
  publish(event: string, payload?: unknown): void;
  subscribe(event: string, handler: (...args: unknown[]) => void): DisposableFunction;
  unsubscribe?(event: string, handler: (...args: unknown[]) => void): void;
}

export interface DisposableBagLike {
  add(disposable: DisposableFunction): DisposableFunction;
  addEvent(
    target: EventTargetLike,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): DisposableFunction;
  addTimeout(handle: TimerHandle): DisposableFunction;
  addInterval(handle: TimerHandle): DisposableFunction;
  addAnimationFrame(handle: number): DisposableFunction;
  clear(): Promise<void>;
  dispose(): void | Promise<void>;
}

export class BaseService {
  protected logger: LoggerLike;
  protected readonly _serviceName: string;
  protected readonly disposables: DisposableBagLike;
  constructor(dependencies: object, requiredDeps?: string[], serviceName?: string | null);

  listen(event: string, handler: (...args: unknown[]) => void): DisposableFunction;
  subscribe(
    target: EventTargetLike,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): DisposableFunction;
  timeout<T extends (...args: unknown[]) => void>(
    handler: T,
    delay: number,
    ...args: Parameters<T>
  ): DisposableFunction;
  interval<T extends (...args: unknown[]) => void>(
    handler: T,
    delay: number,
    ...args: Parameters<T>
  ): DisposableFunction;
  animationFrame(callback: FrameRequestCallback): DisposableFunction;
  dispose(): void | Promise<void>;
}

export interface BaseService extends ServiceDependencies {}
