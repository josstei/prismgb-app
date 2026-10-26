import {
  DisposableBag,
  type Disposable,
  type DisposableFunction,
  type DisposableKey
} from './disposable-bag.js';

export type EventTargetLike = {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: EventListenerOptions | boolean): void;
};

/** Shared resource ownership for services, orchestrators and presentation components. */
export class ManagedLifecycleHost {
  constructor(readonly disposables: DisposableBag = new DisposableBag()) {}

  subscribeEvent(
    target: EventTargetLike,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): DisposableFunction {
    target.addEventListener(type, listener, options);
    return this.track(() => target.removeEventListener(type, listener, options));
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
    release = this.track(() => clearTimeout(handle));
    return release;
  }

  observe(observer: { disconnect(): void }): DisposableFunction {
    return this.track(() => observer.disconnect());
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
