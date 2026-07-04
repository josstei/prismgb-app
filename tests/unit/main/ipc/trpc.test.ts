import { describe, it, expect, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { rethrowAsTrpcError } from '@main/ipc/trpc.js';

describe('rethrowAsTrpcError', () => {
  it('returns the run result unchanged on success', async () => {
    const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const result = await rethrowAsTrpcError('Failed to do thing', logger, () => ({ value: 42 }));
    expect(result).toEqual({ value: 42 });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('awaits an async run function and returns its resolved value', async () => {
    const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const result = await rethrowAsTrpcError('Failed to do thing', logger, async () => ({ value: 'async' }));
    expect(result).toEqual({ value: 'async' });
  });

  it('logs the label with the original error and throws an INTERNAL_SERVER_ERROR TRPCError carrying the original message', async () => {
    const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const thrown = new Error('usb exploded');

    await expect(
      rethrowAsTrpcError('Failed to get device status', logger, () => {
        throw thrown;
      })
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'usb exploded' });

    expect(logger.error).toHaveBeenCalledWith('Failed to get device status', thrown);
  });

  it('throws a real TRPCError instance', async () => {
    const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };

    let caught: unknown;
    try {
      await rethrowAsTrpcError('Failed', logger, () => {
        throw new Error('boom');
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(TRPCError);
  });

  it('falls back to a generic message when the thrown value has no message', async () => {
    const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };

    await expect(
      rethrowAsTrpcError('Failed', logger, () => {
        throw { code: 'ENOENT' };
      })
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'Unknown error' });
  });
});
