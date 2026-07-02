import { isPromiseLike } from './guards.utils.js';

export type DisposableFunction = () => void | Promise<void>;

type DisposableObject = {
  dispose?: DisposableFunction;
  unsubscribe?: DisposableFunction;
  abort?: DisposableFunction;
};

export type Disposable = DisposableFunction | DisposableObject | null | undefined;
export type DisposableKey = string | symbol;

export type EventTargetLike = {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: EventListenerOptions | boolean): void;
};

type TimerHandle = ReturnType<typeof setTimeout> | number;
type AnimationFrameHandle = ReturnType<typeof requestAnimationFrame> | number;


function toDisposableFunction(disposable: Disposable): DisposableFunction | null {
  if (!disposable) {
    return null;
  }

  if (typeof disposable === 'function') {
    return disposable;
  }

  if (typeof disposable.dispose === 'function') {
    return () => disposable.dispose?.();
  }

  if (typeof disposable.unsubscribe === 'function') {
    return () => disposable.unsubscribe?.();
  }

  if (typeof disposable.abort === 'function') {
    return () => disposable.abort?.();
  }

  return null;
}

export class DisposableBag {
  private disposables: DisposableFunction[] = [];
  private readonly managed = new Map<DisposableKey, DisposableFunction>();

  get size(): number {
    return this.disposables.length;
  }

  add(disposable: Disposable): DisposableFunction {
    const dispose = toDisposableFunction(disposable);
    if (!dispose) {
      return () => {};
    }

    let active = true;
    const tracked = (): void | Promise<void> => {
      if (!active) {
        return;
      }
      active = false;
      return dispose();
    };

    this.disposables.push(tracked);

    return () => {
      this.disposables = this.disposables.filter((entry) => entry !== tracked);
      return tracked();
    };
  }

  replace(key: DisposableKey, disposable: Disposable): DisposableFunction {
    const cancelled = this.cancel(key);
    if (isPromiseLike<void>(cancelled)) throw new Error('DisposableBag.replace() cannot replace pending async cleanup; use replaceAsync()');
    return this.setManaged(key, disposable);
  }

  async replaceAsync(key: DisposableKey, disposable: Disposable): Promise<DisposableFunction> {
    await this.cancel(key);
    return this.setManaged(key, disposable);
  }

  private setManaged(key: DisposableKey, disposable: Disposable): DisposableFunction {
    const release = this.add(disposable);
    const managedRelease = () => {
      if (this.managed.get(key) === managedRelease) {
        this.managed.delete(key);
      }
      return release();
    };
    this.managed.set(key, managedRelease);
    return managedRelease;
  }

  cancel(key: DisposableKey): void | Promise<void> {
    const dispose = this.managed.get(key);
    this.managed.delete(key);
    return dispose?.();
  }

  addEvent(
    target: EventTargetLike,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): DisposableFunction {
    target.addEventListener(type, listener, options);
    return this.add(() => target.removeEventListener(type, listener, options));
  }

  addTimeout(handle: TimerHandle): DisposableFunction {
    return this.add(() => clearTimeout(handle));
  }

  addInterval(handle: TimerHandle): DisposableFunction {
    return this.add(() => clearInterval(handle));
  }

  addAnimationFrame(handle: AnimationFrameHandle): DisposableFunction {
    return this.add(() => cancelAnimationFrame(handle));
  }

  addObserver(observer: { disconnect(): void }): DisposableFunction {
    return this.add(() => observer.disconnect());
  }

  clear(): Promise<void> {
    this.managed.clear();
    const pending = [...this.disposables].reverse();
    this.disposables = [];

    const errors: unknown[] = [];
    const asyncDisposals: Promise<void>[] = [];

    for (const dispose of pending) {
      try {
        const result = dispose();
        if (isPromiseLike<void>(result)) {
          asyncDisposals.push(result.catch((error) => {
            errors.push(error);
          }));
        }
      } catch (error) {
        errors.push(error);
      }
    }

    return Promise.all(asyncDisposals).then(() => {
      if (errors.length === 1) {
        throw errors[0];
      }
      if (errors.length > 1) {
        throw new AggregateError(errors, 'Multiple disposables failed during cleanup');
      }
    });
  }

  dispose(): Promise<void> {
    return this.clear();
  }
}
