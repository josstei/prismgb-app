type CleanupCallback = (() => void) | null | undefined;
type CleanupErrorHandler = (error: unknown) => void;

export function cleanupCallbacks(
  callbacks: readonly CleanupCallback[],
  onError?: CleanupErrorHandler
): void {
  for (const callback of callbacks) {
    if (typeof callback !== 'function') {
      continue;
    }

    try {
      callback();
    } catch (error) {
      onError?.(error);
    }
  }
}

export function cleanupTimeouts(timeouts: readonly (ReturnType<typeof setTimeout> | null | undefined)[]): void {
  for (const timeoutId of timeouts) {
    if (timeoutId === null || timeoutId === undefined) {
      continue;
    }

    clearTimeout(timeoutId);
  }
}
