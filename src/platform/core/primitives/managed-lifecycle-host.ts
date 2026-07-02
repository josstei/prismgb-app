import {
  DisposableBag,
  type Disposable,
  type DisposableFunction,
  type DisposableKey,
  type EventTargetLike
} from './disposable-bag.js';

/**
 * Owns a DisposableBag and exposes the shared lifecycle facade — tracked
 * timers, animation frames, event listeners, observers, keyed scheduling,
 * and grouped disposal — so the layer base classes compose one
 * implementation instead of re-wrapping the bag.
 */
export class ManagedLifecycleHost {
  private readonly _disposables: DisposableBag;

  constructor(disposables: DisposableBag = new DisposableBag()) {
    this._disposables = disposables;
  }

  get disposables(): DisposableBag {
    return this._disposables;
  }

  subscribeEvent(
    target: EventTargetLike,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): DisposableFunction {
    return this._disposables.addEvent(target, type, listener, options);
  }

  timeout<TArgs extends unknown[]>(
    handler: (...args: TArgs) => void,
    delay: number,
    ...args: TArgs
  ): DisposableFunction {
    let release: DisposableFunction = () => {};
    const handle = setTimeout(() => {
      release();
      handler(...args);
    }, delay);
    release = this._disposables.addTimeout(handle);
    return release;
  }

  interval<TArgs extends unknown[]>(
    handler: (...args: TArgs) => void,
    delay: number,
    ...args: TArgs
  ): DisposableFunction {
    const handle = setInterval(handler, delay, ...args);
    return this._disposables.addInterval(handle);
  }

  animationFrame(handler: FrameRequestCallback): DisposableFunction {
    const handle = requestAnimationFrame(handler);
    return this._disposables.addAnimationFrame(handle);
  }

  observe(observer: { disconnect(): void }): DisposableFunction {
    return this._disposables.addObserver(observer);
  }

  track(disposable: Disposable): DisposableFunction {
    return this._disposables.add(disposable);
  }

  replaceManaged(key: DisposableKey, disposable: Disposable): DisposableFunction {
    return this._disposables.replace(key, disposable);
  }

  cancelManaged(key: DisposableKey): void | Promise<void> {
    return this._disposables.cancel(key);
  }

  schedule<TArgs extends unknown[]>(
    key: DisposableKey,
    handler: (...args: TArgs) => void,
    delay: number,
    ...args: TArgs
  ): DisposableFunction {
    let release: DisposableFunction = () => {};
    const handle = setTimeout(() => {
      release();
      handler(...args);
    }, delay);
    release = this._disposables.replace(key, () => clearTimeout(handle));
    return release;
  }

  scheduleInterval<TArgs extends unknown[]>(
    key: DisposableKey,
    handler: (...args: TArgs) => void,
    delay: number,
    ...args: TArgs
  ): DisposableFunction {
    const handle = setInterval(handler, delay, ...args);
    return this._disposables.replace(key, () => clearInterval(handle));
  }

  cancelScheduled(key: DisposableKey): void | Promise<void> {
    return this._disposables.cancel(key);
  }

  replaceManagedGroup(key: DisposableKey, disposables: readonly Disposable[]): DisposableFunction {
    return this._disposables.replaceGroup(key, disposables);
  }

  dispose(): Promise<void> {
    return this._disposables.clear();
  }
}
