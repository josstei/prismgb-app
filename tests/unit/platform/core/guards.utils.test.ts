import { describe, expect, it } from 'vitest';
import { getErrorMessage, isPromiseLike } from '@platform/core';

describe('getErrorMessage', () => {
  it('normalizes unknown catch values to a message', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
    expect(getErrorMessage({ message: 'plain object' })).toBe('plain object');
    expect(getErrorMessage('string failure')).toBe('string failure');
    expect(getErrorMessage(new Error(''), 'fallback')).toBe('fallback');
    expect(getErrorMessage({ message: '' }, 'fallback')).toBe('fallback');
    expect(getErrorMessage(null, 'fallback')).toBe('fallback');
  });

  it('ignores non-string messages', () => {
    expect(getErrorMessage({ message: 42 })).toBe('Unknown error');
  });
});

describe('isPromiseLike', () => {
  it('detects thenables only', () => {
    expect(isPromiseLike(Promise.resolve())).toBe(true);
    expect(isPromiseLike({ then: () => {} })).toBe(true);
    expect(isPromiseLike({ then: 1 })).toBe(false);
    expect(isPromiseLike(null)).toBe(false);
    expect(isPromiseLike(() => {})).toBe(false);
  });
});
