import {
  ManagedLifecycleHost,
  type DisposableFunction,
  type DisposableKey,
  type EventTargetLike
} from '@platform/core';


export type PresentationLifecycleToken = {
  isActive(): boolean;
  dispose(): void | Promise<void>;
};

export class PresentationComponent extends ManagedLifecycleHost {

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
      return this.track(() => target.removeEventListener(type, handler));
    }

    return this.subscribeEvent(target, type, handler, options);
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
    return this.schedule(key, handler, delay, ...args);
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

  override dispose(): void | Promise<void> {
    return this.disposables.clear().catch((error) => {
      this.onDisposeError(error);
      throw error;
    });
  }
}
