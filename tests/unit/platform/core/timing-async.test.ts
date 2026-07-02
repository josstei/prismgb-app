import { describe, it, expect, vi } from 'vitest';
import { throttle, createDeferred } from '@prismgb/core';

describe('throttle', () => {
  it('invokes on the leading edge and suppresses until the interval elapses', () => {
    vi.useFakeTimers();
    try {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled('a');
      throttled('b');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenLastCalledWith('a');

      vi.advanceTimersByTime(100);
      throttled('c');
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenLastCalledWith('c');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('createDeferred', () => {
  it('resolves from outside the executor', async () => {
    const deferred = createDeferred<number>();
    deferred.resolve(42);
    await expect(deferred.promise).resolves.toBe(42);
  });

  it('rejects from outside the executor', async () => {
    const deferred = createDeferred<void>();
    deferred.reject(new Error('nope'));
    await expect(deferred.promise).rejects.toThrow('nope');
  });
});
