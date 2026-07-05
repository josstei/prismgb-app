import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadFile } from '@renderer/lib/file-download.utils';
import { installBlobDownloadMock } from '../../../support/mocks/browser-api.installers.js';

describe('fileDownload', () => {
  let downloadMock: ReturnType<typeof installBlobDownloadMock>;
  let mockAnchor: ReturnType<typeof installBlobDownloadMock>['anchor'];

  beforeEach(() => {
    vi.useFakeTimers();
    downloadMock = installBlobDownloadMock({ objectUrl: 'blob:test' });
    mockAnchor = downloadMock.anchor;
  });

  afterEach(() => {
    downloadMock.cleanup();
    vi.useRealTimers();
  });

  it('should create object URL from blob', async () => {
    const blob = new Blob(['test']);
    downloadFile(blob, 'test.txt');
    expect(downloadMock.createObjectURL).toHaveBeenCalledWith(blob);
  });

  it('should set anchor href and download attributes', async () => {
    const blob = new Blob(['test']);
    downloadFile(blob, 'test.txt');
    expect(mockAnchor.href).toBe('blob:test');
    expect(mockAnchor.download).toBe('test.txt');
  });

  it('should click the anchor to trigger download', async () => {
    const blob = new Blob(['test']);
    downloadFile(blob, 'test.txt');
    expect(mockAnchor.click).toHaveBeenCalled();
  });

  it('should cleanup after download with delay', async () => {
    const blob = new Blob(['test']);
    const promise = downloadFile(blob, 'test.txt');

    expect(downloadMock.removeChild).toHaveBeenCalledWith(mockAnchor);
    expect(downloadMock.revokeObjectURL).not.toHaveBeenCalled();
    await expect(promise).resolves.toBeUndefined();

    await vi.advanceTimersByTimeAsync(5000);

    expect(downloadMock.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('should return a promise that resolves after download starts', async () => {
    const blob = new Blob(['test']);
    const promise = downloadFile(blob, 'test.txt');

    expect(promise).toBeInstanceOf(Promise);

    await expect(promise).resolves.toBeUndefined();
    expect(downloadMock.revokeObjectURL).not.toHaveBeenCalled();
  });
});
