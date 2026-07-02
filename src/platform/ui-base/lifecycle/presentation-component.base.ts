import {
  ManagedLifecycleHost,
  type Disposable,
  type DisposableBag,
  type DisposableFunction,
  type DisposableKey,
  type EventTargetLike
} from '@platform/core';


export type PresentationLifecycleToken = {
  isActive(): boolean;
  dispose(): void | Promise<void>;
};

export class PresentationComponent {
  protected readonly lifecycle = new ManagedLifecycleHost();

  protected get _disposables(): DisposableBag {
    return this.lifecycle.disposables;
  }

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
      return this.lifecycle.track(() => target.removeEventListener(type, handler));
    }

    return this.lifecycle.subscribeEvent(target, type, handler, options);
  }

  protected timeout(handler: () => void, delay: number, ...args: unknown[]): DisposableFunction {
    return this.lifecycle.timeout<unknown[]>(handler, delay, ...args);
  }

  protected interval(handler: () => void, delay: number, ...args: unknown[]): DisposableFunction {
    return this.lifecycle.interval<unknown[]>(handler, delay, ...args);
  }

  protected animationFrame(handler: FrameRequestCallback): DisposableFunction {
    return this.lifecycle.animationFrame(handler);
  }

  protected observe(observer: { disconnect(): void }): DisposableFunction {
    return this.lifecycle.observe(observer);
  }

  protected track(disposable: Disposable): DisposableFunction {
    return this.lifecycle.track(disposable);
  }

  protected replaceManaged(key: DisposableKey, disposable: Disposable): DisposableFunction {
    return this.lifecycle.replaceManaged(key, disposable);
  }

  protected cancelManaged(key: DisposableKey): void | Promise<void> {
    return this.lifecycle.cancelManaged(key);
  }

  protected replaceManagedGroup(key: DisposableKey, disposables: readonly Disposable[]): DisposableFunction {
    return this.lifecycle.replaceManagedGroup(key, disposables);
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
    return this.lifecycle.schedule(key, handler, delay, ...args);
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
    return this.lifecycle.dispose().catch((error) => this.onDisposeError(error));
  }
}
