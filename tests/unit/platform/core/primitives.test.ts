import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getErrorMessage, isErrorLike } from '../../../../src/platform/core/primitives/error.utils';
import { escapeHtml, generateEntityId, throttle, debounce, abortableDelay, raceWithTimeout } from '@platform/core';

describe('error-guards', () => {
  it('detects values with string messages', () => {
    const plainErrorLike: { message: string } = { message: 'plain object' };
    const numericMessage: { message: number } = { message: 42 };

    expect(isErrorLike(new Error('boom'))).toBe(true);
    expect(isErrorLike(plainErrorLike)).toBe(true);
    expect(isErrorLike(numericMessage)).toBe(false);
  });

  it('normalizes unknown catch values to a message', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
    expect(getErrorMessage('string failure')).toBe('string failure');
    expect(getErrorMessage(new Error(''), 'fallback')).toBe('fallback');
    expect(getErrorMessage({ message: '' }, 'fallback')).toBe('fallback');
    expect(getErrorMessage(null, 'fallback')).toBe('fallback');
  });
});

/**
 * String Utils Unit Tests
 */


type EscapeHtmlInput = Parameters<typeof escapeHtml>[0];
type EscapeCase = readonly [label: string, input: EscapeHtmlInput, expected: string];
type EmptyEscapeCase = readonly [label: string, input: EscapeHtmlInput];
type EntityIdCase = readonly [label: string, prefix: string | undefined, pattern: RegExp];

describe('String Utils', () => {
  describe('escapeHtml', () => {
    const escapeCases: EscapeCase[] = [
      ['ampersand', 'foo & bar', 'foo &amp; bar'],
      ['less than', 'foo < bar', 'foo &lt; bar'],
      ['greater than', 'foo > bar', 'foo &gt; bar'],
      ['double quotes', 'foo "bar" baz', 'foo &quot;bar&quot; baz'],
      ['single quotes', "foo 'bar' baz", 'foo &#39;bar&#39; baz'],
      ['multiple special characters', '<script>alert("xss")</script>', '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'],
      ['all special characters in one string', '&<>"\'', '&amp;&lt;&gt;&quot;&#39;']
    ];

    it.each(escapeCases)('should escape %s', (_label, input, expected) => {
      expect(escapeHtml(input)).toBe(expected);
    });

    const emptyInputCases: EmptyEscapeCase[] = [
      ['null', null],
      ['undefined', undefined],
      ['empty string', ''],
      ['falsy number', 0],
      ['falsy boolean', false]
    ];

    it.each(emptyInputCases)('should return empty string for %s input', (_label, input) => {
      expect(escapeHtml(input)).toBe('');
    });

    it('should convert numbers to string before escaping', () => {
      expect(escapeHtml(123)).toBe('123');
    });

    it('should handle string with no special characters', () => {
      expect(escapeHtml('hello world')).toBe('hello world');
    });
  });

  describe('generateEntityId', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const entityIdCases: EntityIdCase[] = [
      ['default prefix', undefined, /^id_\d+_[a-z0-9]+$/],
      ['custom prefix', 'note', /^note_\d+_[a-z0-9]+$/]
    ];

    it.each(entityIdCases)('should generate id with %s', (_label, prefix, pattern) => {
      expect(generateEntityId(prefix)).toMatch(pattern);
    });

    it('should include timestamp in id', () => {
      const timestamp = Date.now();
      const id = generateEntityId('test');
      expect(id).toContain(`test_${timestamp}_`);
    });

    it('should generate unique ids', () => {
      vi.useRealTimers();

      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateEntityId('item'));
      }
      expect(ids.size).toBe(100);
    });

    it('should generate id with random suffix of correct length', () => {
      const id = generateEntityId('prefix');
      const parts = id.split('_');
      expect(parts).toHaveLength(3);
      expect(parts[2].length).toBe(7);
    });
  });
});

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
