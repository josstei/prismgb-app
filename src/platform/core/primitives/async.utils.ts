/**
 * Domain-agnostic async control-flow utilities.
 */

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
