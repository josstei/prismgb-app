import { describe, it, expect, vi } from 'vitest';
import { throttle, debounce, abortableDelay, raceWithTimeout } from '@platform/core';

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

describe('abortableDelay', () => {
  it('resolves true after the delay', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const pending = abortableDelay(50, controller.signal);
      await vi.advanceTimersByTimeAsync(50);
      await expect(pending).resolves.toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves false immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(abortableDelay(50, controller.signal)).resolves.toBe(false);
  });

  it('resolves false when aborted mid-delay and clears the timer', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const pending = abortableDelay(50, controller.signal);
      controller.abort();
      await expect(pending).resolves.toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('raceWithTimeout', () => {
  it("reports 'completed' when the promise resolves first", async () => {
    await expect(raceWithTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('completed');
  });

  it("reports 'failed' when the promise rejects first", async () => {
    await expect(raceWithTimeout(Promise.reject(new Error('nope')), 1000)).resolves.toBe('failed');
  });

  it("reports 'timed-out' when the timeout elapses first", async () => {
    vi.useFakeTimers();
    try {
      const pending = raceWithTimeout(new Promise(() => {}), 100);
      await vi.advanceTimersByTimeAsync(100);
      await expect(pending).resolves.toBe('timed-out');
    } finally {
      vi.useRealTimers();
    }
  });
});
