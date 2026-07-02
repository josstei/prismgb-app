/**
 * Domain-agnostic async control-flow utilities.
 */

/** A promise paired with its externally-callable resolve/reject handles. */
export interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
}

/**
 * Create a {@link Deferred}: a promise whose `resolve`/`reject` are exposed for
 * settlement from outside the executor.
 */
export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolveFn, rejectFn) => {
    resolve = resolveFn;
    reject = rejectFn;
  });
  return { promise, resolve, reject };
}

/** Outcome of racing a promise against a timeout. */
export type TimedRaceOutcome = 'completed' | 'failed' | 'timed-out';

/**
 * Resolve `true` after `durationMs`, or `false` immediately when `signal`
 * aborts first; never rejects.
 */
export function abortableDelay(durationMs: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      signal.removeEventListener('abort', handleAbort);
      resolve(true);
    }, durationMs);
    const handleAbort = (): void => {
      clearTimeout(timeoutId);
      resolve(false);
    };

    signal.addEventListener('abort', handleAbort, { once: true });
  });
}

/**
 * Race `promise` against a timeout, reporting how the race settled without
 * rethrowing rejections.
 */
export function raceWithTimeout(promise: Promise<unknown>, timeoutMs: number): Promise<TimedRaceOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: TimedRaceOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(outcome);
    };
    const timeoutId = setTimeout(() => finish('timed-out'), timeoutMs);
    void promise.then(() => finish('completed'), () => finish('failed'));
  });
}
