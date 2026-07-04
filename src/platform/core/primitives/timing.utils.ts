/**
 * Domain-agnostic timing utilities.
 */

/**
 * Leading-edge throttle: invokes `fn` immediately, then ignores further calls
 * until `intervalMs` has elapsed since the last invocation.
 */
export function throttle<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  intervalMs: number
): (...args: TArgs) => void {
  let lastInvocation = 0;
  return (...args: TArgs): void => {
    const now = Date.now();
    if (now - lastInvocation >= intervalMs) {
      lastInvocation = now;
      fn(...args);
    }
  };
}

/** A debounced callable that can drop its pending trailing invocation. */
export interface DebouncedFunction<TArgs extends unknown[]> {
  (...args: TArgs): void;
  cancel(): void;
}

/**
 * Trailing-edge debounce: postpones `fn` until `delayMs` has elapsed since
 * the most recent call; `cancel()` drops any pending invocation.
 */
export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delayMs: number
): DebouncedFunction<TArgs> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: TArgs): void => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delayMs);
  };

  debounced.cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced;
}
