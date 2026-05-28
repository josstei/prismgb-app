import {
  DisposableBag,
  type Disposable,
  type DisposableFunction,
  type DisposableKey
} from '@prismgb/core';

type EventTargetLike = {
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
};

export type PresentationLifecycleToken = {
  isActive(): boolean;
  dispose(): void | Promise<void>;
};

export class PresentationComponent {
  protected readonly _disposables = new DisposableBag();

  protected listen(
    target: EventTargetLike | null,
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): DisposableFunction {
    if (!target) {
      return () => {};
    }

    if (options === undefined) {
      target.addEventListener(type, handler);
      return this._disposables.add(() => target.removeEventListener(type, handler));
    }

    return this._disposables.addEvent(target, type, handler, options);
  }

  protected timeout(handler: () => void, delay: number, ...args: unknown[]): DisposableFunction {
    let disposeTimeout = () => {};
    const handle = setTimeout(() => {
      disposeTimeout();
      handler();
    }, delay, ...args);
    disposeTimeout = this._disposables.addTimeout(handle);
    return disposeTimeout;
  }

  protected interval(handler: () => void, delay: number, ...args: unknown[]): DisposableFunction {
    const handle = setInterval(handler, delay, ...args);
    return this._disposables.addInterval(handle);
  }

  protected animationFrame(handler: FrameRequestCallback): DisposableFunction {
    const handle = requestAnimationFrame(handler);
    return this._disposables.addAnimationFrame(handle);
  }

  protected observe(observer: { disconnect(): void }): DisposableFunction {
    return this._disposables.addObserver(observer);
  }

  protected track(disposable: Disposable): DisposableFunction {
    return this._disposables.add(disposable);
  }

  protected replaceManaged(key: DisposableKey, disposable: Disposable): DisposableFunction {
    return this._disposables.replace(key, disposable);
  }

  protected replaceManagedAsync(key: DisposableKey, disposable: Disposable): Promise<DisposableFunction> {
    return this._disposables.replaceAsync(key, disposable);
  }

  protected cancelManaged(key: DisposableKey): void | Promise<void> {
    return this._disposables.cancel(key);
  }

  protected createLifecycleToken(key: DisposableKey): PresentationLifecycleToken {
    let active = true;
    const dispose = this.replaceManaged(key, () => {
      active = false;
    });

    return {
      isActive: () => active,
      dispose
    };
  }

  protected replaceTimeout(
    key: DisposableKey,
    handler: (...args: unknown[]) => void,
    delay: number,
    ...args: unknown[]
  ): DisposableFunction {
    let managedDisposer: DisposableFunction = () => {};
    const handle = setTimeout(() => {
      managedDisposer();
      handler(...args);
    }, delay);

    managedDisposer = this.replaceManaged(key, () => clearTimeout(handle));
    return managedDisposer;
  }

  protected replaceAnimationFrame(key: DisposableKey, handler: FrameRequestCallback): DisposableFunction {
    let managedDisposer: DisposableFunction = () => {};
    const handle = requestAnimationFrame((time) => {
      managedDisposer();
      handler(time);
    });

    managedDisposer = this.replaceManaged(key, () => cancelAnimationFrame(handle));
    return managedDisposer;
  }

  protected trackSubscription(
    unsubscribe: (() => void) | null | undefined,
    onError?: (error: unknown) => void
  ): DisposableFunction {
    if (typeof unsubscribe !== 'function') {
      return () => {};
    }

    return this.track(() => {
      try {
        unsubscribe();
      } catch (error) {
        onError?.(error);
      }
    });
  }

  protected onDisposeError(_error: unknown): void {}

  dispose(): void | Promise<void> {
    return this._disposables.clear().catch((error) => this.onDisposeError(error));
  }
}
