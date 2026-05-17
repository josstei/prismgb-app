import { describe, expect, it } from 'vitest';
import { getErrorMessage, isErrorLike } from '@shared/lib/errors/error-guards.ts';

describe('error-guards', () => {
  it('detects values with string messages', () => {
    expect(isErrorLike(new Error('boom'))).toBe(true);
    expect(isErrorLike({ message: 'plain object' })).toBe(true);
    expect(isErrorLike({ message: 42 })).toBe(false);
  });

  it('normalizes unknown catch values to a message', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
    expect(getErrorMessage('string failure')).toBe('string failure');
    expect(getErrorMessage(null, 'fallback')).toBe('fallback');
  });
});
