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
