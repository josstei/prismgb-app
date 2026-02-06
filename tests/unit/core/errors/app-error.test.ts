import { describe, it, expect } from 'vitest';
import { AppError, ErrorCode } from '../../../../src/core/errors';

describe('AppError', () => {
  it('should create error with code and message', () => {
    const error = new AppError(ErrorCode.DEVICE_NOT_FOUND, 'Device not found');

    expect(error.code).toBe(ErrorCode.DEVICE_NOT_FOUND);
    expect(error.message).toBe('Device not found');
    expect(error.name).toBe('AppError');
  });

  it('should include cause if provided', () => {
    const cause = new Error('Original error');
    const error = new AppError(ErrorCode.STREAM_ERROR, 'Stream failed', cause);

    expect(error.cause).toBe(cause);
  });

  it('should be instanceof Error', () => {
    const error = new AppError(ErrorCode.UNKNOWN, 'Unknown error');

    expect(error instanceof Error).toBe(true);
    expect(error instanceof AppError).toBe(true);
  });

  it('should format error label correctly', () => {
    const error = new AppError(ErrorCode.DEVICE_NOT_FOUND, 'Device not found');

    expect(error.toLabel()).toBe('[DEVICE_NOT_FOUND] Device not found');
  });
});
