import { isPromiseLike } from './guards.utils';

export type DisposableFunction = () => void | Promise<void>;

type DisposableObject = {
  dispose?: DisposableFunction;
  unsubscribe?: DisposableFunction;
  abort?: DisposableFunction;
};

export type Disposable = DisposableFunction | DisposableObject | null | undefined;
export type DisposableKey = string | symbol;

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
    if (isPromiseLike<void>(cancelled)) throw new Error('DisposableBag.replace() cannot replace pending async cleanup');

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

  replaceGroup(key: DisposableKey, disposables: readonly Disposable[]): DisposableFunction {
    const group = disposables
      .map((entry) => toDisposableFunction(entry))
      .filter((entry): entry is DisposableFunction => entry !== null);

    return this.replace(key, () => {
      const pending: Promise<void>[] = [];
      for (const dispose of group.splice(0).reverse()) {
        const result = dispose();
        if (isPromiseLike<void>(result)) {
          pending.push(result);
        }
      }
      if (pending.length > 0) {
        return Promise.all(pending).then(() => undefined);
      }
    });
  }

  /** Calls addEventListener with exactly two arguments when no options are given. */
  listen(
    target: EventTarget | null | undefined,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): DisposableFunction {
    if (!target) {
      return () => {};
    }

    if (options === undefined) {
      target.addEventListener(type, listener);
      return this.add(() => target.removeEventListener(type, listener));
    }

    target.addEventListener(type, listener, options);
    return this.add(() => target.removeEventListener(type, listener, options));
  }

  timeout(handler: () => void, delay: number): DisposableFunction {
    let release: DisposableFunction = () => {};
    const handle = setTimeout(() => {
      release();
      handler();
    }, delay);
    release = this.add(() => clearTimeout(handle));
    return release;
  }

  interval(handler: () => void, delay: number): DisposableFunction {
    const handle = setInterval(handler, delay);
    return this.add(() => clearInterval(handle));
  }

  schedule(key: DisposableKey, handler: () => void, delay: number): DisposableFunction {
    let release: DisposableFunction = () => {};
    const handle = setTimeout(() => {
      release();
      handler();
    }, delay);
    release = this.replace(key, () => clearTimeout(handle));
    return release;
  }

  scheduleInterval(key: DisposableKey, handler: () => void, delay: number): DisposableFunction {
    const handle = setInterval(handler, delay);
    return this.replace(key, () => clearInterval(handle));
  }

  scheduleFrame(key: DisposableKey, callback: FrameRequestCallback): DisposableFunction {
    let release: DisposableFunction = () => {};
    const handle = requestAnimationFrame((time) => {
      release();
      callback(time);
    });
    release = this.replace(key, () => cancelAnimationFrame(handle));
    return release;
  }

  dispose(): Promise<void> {
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
}
