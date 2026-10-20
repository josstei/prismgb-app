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
