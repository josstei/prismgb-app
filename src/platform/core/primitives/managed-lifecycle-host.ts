import {
  DisposableBag,
  type Disposable,
  type DisposableFunction,
  type DisposableKey,
  type EventTargetLike
} from './disposable-bag.js';

/** Shared resource ownership for services, orchestrators and presentation components. */
export class ManagedLifecycleHost {
  constructor(readonly disposables: DisposableBag = new DisposableBag()) {}

  subscribeEvent(
    target: EventTargetLike,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): DisposableFunction {
    return this.disposables.addEvent(target, type, listener, options);
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
    release = this.disposables.addTimeout(handle);
    return release;
  }

  observe(observer: { disconnect(): void }): DisposableFunction {
    return this.disposables.addObserver(observer);
  }

  track(disposable: Disposable): DisposableFunction {
    return this.disposables.add(disposable);
  }

  replaceManaged(key: DisposableKey, disposable: Disposable): DisposableFunction {
    return this.disposables.replace(key, disposable);
  }

  cancelManaged(key: DisposableKey): void | Promise<void> {
    return this.disposables.cancel(key);
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
    release = this.disposables.replace(key, () => clearTimeout(handle));
    return release;
  }

  scheduleInterval<TArgs extends unknown[]>(
    key: DisposableKey,
    handler: (...args: TArgs) => void,
    delay: number,
    ...args: TArgs
  ): DisposableFunction {
    const handle = setInterval(handler, delay, ...args);
    return this.disposables.replace(key, () => clearInterval(handle));
  }

  replaceManagedGroup(key: DisposableKey, disposables: readonly Disposable[]): DisposableFunction {
    return this.disposables.replaceGroup(key, disposables);
  }

  dispose(): void | Promise<void> {
    return this.disposables.clear();
  }
}
