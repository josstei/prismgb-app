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
