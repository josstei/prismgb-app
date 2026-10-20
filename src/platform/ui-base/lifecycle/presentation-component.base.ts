import {
  DisposableBag,
  type Disposable,
  type DisposableFunction,
  type DisposableKey
} from '@platform/core';
import { applyOptions as assignOptions } from './apply-options.utils';


export type PresentationLifecycleToken = {
  isActive(): boolean;
  dispose(): void | Promise<void>;
};

export class PresentationComponent {
  readonly disposables = new DisposableBag();

  protected listen(
    target: EventTarget | null,
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): DisposableFunction {
    return this.disposables.listen(target, type, handler, options);
  }

  protected timeout(handler: () => void, delay: number): DisposableFunction {
    return this.disposables.timeout(handler, delay);
  }

  protected observe(observer: { disconnect(): void }): DisposableFunction {
    return this.disposables.add(() => observer.disconnect());
  }

  protected track(disposable: Disposable): DisposableFunction {
    return this.disposables.add(disposable);
  }

  protected replaceManaged(key: DisposableKey, disposable: Disposable): DisposableFunction {
    return this.disposables.replace(key, disposable);
  }

  protected cancelManaged(key: DisposableKey): void | Promise<void> {
    return this.disposables.cancel(key);
  }

  protected replaceManagedGroup(key: DisposableKey, disposables: readonly Disposable[]): DisposableFunction {
    return this.disposables.replaceGroup(key, disposables);
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

  protected replaceTimeout(key: DisposableKey, handler: () => void, delay: number): DisposableFunction {
    return this.disposables.schedule(key, handler, delay);
  }

  protected replaceAnimationFrame(key: DisposableKey, handler: FrameRequestCallback): DisposableFunction {
    return this.disposables.scheduleFrame(key, handler);
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

  protected applyOptions<TOptions extends object>(defaults: Partial<TOptions>, options: TOptions): void {
    assignOptions(this, defaults, options);
  }

  protected onDisposeError(_error: unknown): void {}

  dispose(): void | Promise<void> {
    return this.disposables.dispose().catch((error) => this.onDisposeError(error));
  }
}
