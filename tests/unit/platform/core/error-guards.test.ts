import { describe, expect, it } from 'vitest';
import { getErrorMessage, isErrorLike } from '@platform/core';

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
