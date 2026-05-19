type MaybePromise<T> = T | Promise<T>;

type DisposableFunction = () => MaybePromise<void>;

type DisposableObject = {
  dispose?: DisposableFunction;
  unsubscribe?: DisposableFunction;
  abort?: DisposableFunction;
};

type Disposable = DisposableFunction | DisposableObject | null | undefined;

type EventTargetLike = {
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

  get size(): number {
    return this.disposables.length;
  }

  add(disposable: Disposable): DisposableFunction {
    const dispose = toDisposableFunction(disposable);
    if (!dispose) {
      return () => {};
    }

    let active = true;
    const tracked = async (): Promise<void> => {
      if (!active) {
        return;
      }
      active = false;
      await dispose();
    };

    this.disposables.push(tracked);

    return () => {
      void tracked();
      this.disposables = this.disposables.filter((entry) => entry !== tracked);
    };
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

  async clear(): Promise<void> {
    const pending = [...this.disposables].reverse();
    this.disposables = [];

    const errors: unknown[] = [];
    for (const dispose of pending) {
      try {
        await dispose();
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length === 1) {
      throw errors[0];
    }

    if (errors.length > 1) {
      throw new AggregateError(errors, 'Multiple disposables failed during cleanup');
    }
  }

  async dispose(): Promise<void> {
    await this.clear();
  }
}
