import { describe, it, expect, vi } from 'vitest';
import { callIpc } from '@renderer/infrastructure/ipc/call-ipc.js';

describe('callIpc', () => {
  it('resolves an ok result carrying the thunk value on success', async () => {
    const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const result = await callIpc('device.getStatus', () => Promise.resolve({ jobId: 'job-1' }), logger);

    expect(result).toEqual({ status: 'ok', value: { jobId: 'job-1' } });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('resolves a failed result carrying the extracted error message, and logs the label with the original error', async () => {
    const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const thrown = new Error('usb exploded');

    const result = await callIpc('device.getStatus', () => Promise.reject(thrown), logger);

    expect(result).toEqual({ status: 'error', error: 'usb exploded' });
    expect(logger.error).toHaveBeenCalledWith('device.getStatus failed', thrown);
  });

  it('falls back to a generic message when the rejection has no message', async () => {
    const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const result = await callIpc('device.getStatus', () => Promise.reject({ code: 'ENOENT' }), logger);

    expect(result).toEqual({ status: 'error', error: 'Unknown error' });
  });

  it('narrows to the value type on the ok branch and the error type on the error branch', async () => {
    const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const result = await callIpc('label', () => Promise.resolve(7), logger);

    if (result.status === 'ok') {
      const value: number = result.value;
      expect(value).toBe(7);
    } else {
      const message: string = result.error;
      throw new Error(`expected ok result, got: ${message}`);
    }
  });
});
