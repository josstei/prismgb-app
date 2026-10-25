import { isPromiseLike } from './guards.utils.js';

export type DisposableFunction = () => void | Promise<void>;

type DisposableObject = {
  dispose: DisposableFunction;
};

export type Disposable = DisposableFunction | DisposableObject | null | undefined;
export type DisposableKey = string | symbol;

export type EventTargetLike = {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: EventListenerOptions | boolean): void;
};

type TimerHandle = ReturnType<typeof setTimeout> | number;
type AnimationFrameHandle = ReturnType<typeof requestAnimationFrame> | number;

// Only aggregates created here are flattened when overlapping owners join cleanup.
const cleanupAggregates = new WeakSet<AggregateError>();

function toDisposableFunction(disposable: Disposable): DisposableFunction | null {
  if (!disposable) {
    return null;
  }

  if (typeof disposable === 'function') {
    return disposable;
  }

  return () => disposable.dispose();
}

/** Starts all cleanup synchronously, then waits for every asynchronous result before reporting failures. */
function disposeAll(disposers: readonly DisposableFunction[]): void | Promise<void> {
  const errors = new Set<unknown>();
  const recordError = (error: unknown): void => {
    if (error instanceof AggregateError && cleanupAggregates.has(error)) {
      error.errors.forEach(recordError);
    } else {
      errors.add(error);
    }
  };
  const pending: Promise<void>[] = [];
  for (const dispose of disposers) {
    try {
      const result = dispose();
      if (isPromiseLike<void>(result)) {
        pending.push(result.catch(recordError));
      }
    } catch (error) {
      recordError(error);
    }
  }
  const reportErrors = () => {
    if (errors.size === 1) throw errors.values().next().value;
    if (errors.size > 1) {
      const aggregate = new AggregateError(errors, 'Multiple disposables failed during cleanup');
      cleanupAggregates.add(aggregate);
      throw aggregate;
    }
  };
  if (pending.length > 0) return Promise.all(pending).then(reportErrors);
  reportErrors();
}

export class DisposableBag {
  private disposables: DisposableFunction[] = [];
  private readonly managed = new Map<DisposableKey, DisposableFunction>();
  private readonly pendingCleanups = new Set<Promise<void>>();

  get size(): number {
    return this.disposables.length;
  }

  add(disposable: Disposable): DisposableFunction {
    const dispose = toDisposableFunction(disposable);
    if (!dispose) {
      return () => {};
    }

    let active = true;
    let pending: Promise<void> | undefined;
    const tracked = (): void | Promise<void> => {
      if (!active) {
        return;
      }
      active = false;
      const result = dispose();
      if (isPromiseLike<void>(result)) {
        pending = this.trackPending(Promise.resolve(result));
      }
      return pending;
    };

    this.disposables.push(tracked);

    return () => {
      this.disposables = this.disposables.filter((entry) => entry !== tracked);
      return active ? tracked() : pending;
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

  replaceGroup(key: DisposableKey, disposables: readonly Disposable[]): DisposableFunction {
    const group = disposables
      .map((entry) => toDisposableFunction(entry))
      .filter((entry): entry is DisposableFunction => entry !== null);

    return this.replace(key, () => disposeAll(group.splice(0).reverse()));
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

  private trackPending(cleanup: Promise<void>): Promise<void> {
    this.pendingCleanups.add(cleanup);
    void cleanup.then(
      () => this.pendingCleanups.delete(cleanup),
      () => this.pendingCleanups.delete(cleanup)
    );
    return cleanup;
  }

  clear(): Promise<void> {
    this.managed.clear();
    const pending = [
      ...this.disposables.toReversed(),
      ...Array.from(this.pendingCleanups, (cleanup) => () => cleanup)
    ];
    this.disposables = [];

    try {
      return this.trackPending(Promise.resolve(disposeAll(pending)));
    } catch (error) {
      return this.trackPending(Promise.reject(error));
    }
  }

  dispose(): Promise<void> {
    return this.clear();
  }
}
