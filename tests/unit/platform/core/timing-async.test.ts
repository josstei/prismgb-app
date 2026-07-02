import { describe, it, expect, vi } from 'vitest';
import { throttle, debounce, createDeferred } from '@platform/core';

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

describe('debounce', () => {
  it('invokes on the trailing edge with the latest arguments', () => {
    vi.useFakeTimers();
    try {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);
      debounced('a');
      debounced('b');
      expect(fn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenLastCalledWith('b');
    } finally {
      vi.useRealTimers();
    }
  });

  it('restarts the delay on each call', () => {
    vi.useFakeTimers();
    try {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);
      debounced('a');
      vi.advanceTimersByTime(60);
      debounced('b');
      vi.advanceTimersByTime(60);
      expect(fn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(40);
      expect(fn).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancel() drops the pending invocation', () => {
    vi.useFakeTimers();
    try {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);
      debounced('a');
      debounced.cancel();
      vi.advanceTimersByTime(100);
      expect(fn).not.toHaveBeenCalled();
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
