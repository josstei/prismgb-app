import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { downloadFile } from '@renderer/lib/file-download.utils';
import { installBlobDownloadMock } from '../../../support/mocks/browser-api.installers.js';

describe('fileDownload', () => {
  let downloadMock: ReturnType<typeof installBlobDownloadMock>;
  let lifecycle: { expect: Mock<(url: string) => Promise<unknown>>; cancel: Mock<(url: string) => Promise<unknown>> };

  beforeEach(() => {
    vi.useFakeTimers();
    downloadMock = installBlobDownloadMock({ objectUrl: 'blob:test' });
    downloadMock.anchor.remove = vi.fn();
    lifecycle = { expect: vi.fn().mockResolvedValue(undefined), cancel: vi.fn().mockResolvedValue(undefined) };
  });

  afterEach(() => {
    downloadMock.cleanup();
    vi.useRealTimers();
  });

  it('registers the blob before clicking, preserving filename and delayed URL release', async () => {
    const accepted = Promise.withResolvers<void>();
    lifecycle.expect.mockReturnValue(accepted.promise);
    const blob = new Blob(['test']);
    const saving = downloadFile(blob, 'test.txt', lifecycle);
    expect(downloadMock.createObjectURL).toHaveBeenCalledWith(blob);
    expect(lifecycle.expect).toHaveBeenCalledWith('blob:test');
    expect(downloadMock.anchor.click).not.toHaveBeenCalled();

    accepted.resolve();
    await saving;
    expect(downloadMock.anchor.href).toBe('blob:test');
    expect(downloadMock.anchor.download).toBe('test.txt');
    expect(downloadMock.anchor.click).toHaveBeenCalledOnce();
    expect(downloadMock.anchor.remove).toHaveBeenCalledOnce();
    expect(downloadMock.revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(downloadMock.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('cancels the registration if the browser cannot start the download', async () => {
    downloadMock.anchor.click.mockImplementation(() => { throw new Error('Click failed'); });
    await expect(downloadFile(new Blob(['test']), 'test.txt', lifecycle)).rejects.toThrow('Click failed');
    expect(lifecycle.cancel).toHaveBeenCalledWith('blob:test');
    expect(downloadMock.anchor.remove).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(5000);
    expect(downloadMock.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('does not start a download when registration fails', async () => {
    lifecycle.expect.mockRejectedValue(new Error('Disconnected'));
    await expect(downloadFile(new Blob(['test']), 'test.txt', lifecycle)).rejects.toThrow('Disconnected');
    expect(downloadMock.anchor.click).not.toHaveBeenCalled();
    expect(lifecycle.cancel).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(downloadMock.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });
});
