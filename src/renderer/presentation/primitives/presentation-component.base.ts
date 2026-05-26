import { DisposableBag } from '@shared/base/disposable-bag.js';

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

type LifecycleKey = string | symbol;

type LifecycleDisposable =
  | (() => void)
  | {
      dispose?: () => void;
      unsubscribe?: () => void;
      abort?: () => void;
    }
  | null
  | undefined;

export class PresentationComponent {
  protected readonly _disposables = new DisposableBag();
  private readonly _managedDisposables = new Map<LifecycleKey, () => void>();

  protected listen(
    target: EventTargetLike | null,
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): () => void {
    if (!target) {
      return () => {};
    }

    if (options === undefined) {
      target.addEventListener(type, handler);
      return this._disposables.add(() => target.removeEventListener(type, handler));
    }

    return this._disposables.addEvent(target, type, handler, options);
  }

  protected timeout(handler: () => void, delay: number, ...args: unknown[]) {
    let disposeTimeout = () => {};
    const handle = setTimeout(() => {
      disposeTimeout();
      handler();
    }, delay, ...args);
    disposeTimeout = this._disposables.addTimeout(handle);
    return disposeTimeout;
  }

  protected interval(handler: () => void, delay: number, ...args: unknown[]) {
    const handle = setInterval(handler, delay, ...args);
    return this._disposables.addInterval(handle);
  }

  protected animationFrame(handler: FrameRequestCallback) {
    const handle = requestAnimationFrame(handler);
    return this._disposables.addAnimationFrame(handle);
  }

  protected observe(observer: { disconnect(): void }) {
    return this._disposables.addObserver(observer);
  }

  protected track(disposable: LifecycleDisposable) {
    return this._disposables.add(disposable);
  }

  protected replaceManaged(key: LifecycleKey, disposer: (() => void) | null | undefined) {
    this.cancelManaged(key);

    if (typeof disposer !== 'function') {
      return () => {};
    }

    let active = true;
    const managedDisposer = () => {
      if (!active) {
        return;
      }
      active = false;
      disposer();
      if (this._managedDisposables.get(key) === managedDisposer) {
        this._managedDisposables.delete(key);
      }
    };

    this._managedDisposables.set(key, managedDisposer);
    return managedDisposer;
  }

  protected cancelManaged(key: LifecycleKey) {
    this._managedDisposables.get(key)?.();
  }

  protected replaceTimeout(
    key: LifecycleKey,
    handler: (...args: unknown[]) => void,
    delay: number,
    ...args: unknown[]
  ) {
    let managedDisposer = () => {};
    const timeoutDisposer = this.timeout(() => {
      managedDisposer();
      handler(...args);
    }, delay);

    managedDisposer = this.replaceManaged(key, timeoutDisposer);
    return managedDisposer;
  }

  protected replaceAnimationFrame(key: LifecycleKey, handler: FrameRequestCallback) {
    let managedDisposer = () => {};
    const frameDisposer = this.animationFrame((time) => {
      managedDisposer();
      handler(time);
    });

    managedDisposer = this.replaceManaged(key, frameDisposer);
    return managedDisposer;
  }

  protected trackSubscription(
    unsubscribe: (() => void) | null | undefined,
    onError?: (error: unknown) => void
  ) {
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

  private _clearManagedDisposables() {
    const managedDisposers = [...this._managedDisposables.values()];
    this._managedDisposables.clear();
    for (const dispose of managedDisposers) {
      dispose();
    }
  }

  dispose(): void {
    this._clearManagedDisposables();
    void this._disposables.clear().catch((error) => this.onDisposeError(error));
  }
}
