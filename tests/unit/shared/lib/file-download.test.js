import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadFile } from '@shared/lib/file-download.js';

describe('fileDownload', () => {
  let mockAnchor;
  let originalCreateElement;
  let originalCreateObjectURL;
  let originalRevokeObjectURL;

  beforeEach(() => {
    vi.useFakeTimers();

    mockAnchor = {
      href: '',
      download: '',
      click: vi.fn()
    };

    originalCreateElement = document.createElement;
    originalCreateObjectURL = window.URL.createObjectURL;
    originalRevokeObjectURL = window.URL.revokeObjectURL;

    document.createElement = vi.fn(() => mockAnchor);
    document.body.appendChild = vi.fn();
    document.body.removeChild = vi.fn();
    window.URL.createObjectURL = vi.fn(() => 'blob:test');
    window.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.createElement = originalCreateElement;
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('should create object URL from blob', async () => {
    const blob = new Blob(['test']);
    downloadFile(blob, 'test.txt');
    expect(window.URL.createObjectURL).toHaveBeenCalledWith(blob);
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

    // Immediately after click, anchor is removed but URL not yet revoked
    expect(document.body.removeChild).toHaveBeenCalledWith(mockAnchor);
    expect(window.URL.revokeObjectURL).not.toHaveBeenCalled();

    // Advance timers to trigger delayed revocation
    await vi.advanceTimersByTimeAsync(5000);
    await promise;

    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('should return a promise that resolves after cleanup', async () => {
    const blob = new Blob(['test']);
    const promise = downloadFile(blob, 'test.txt');

    expect(promise).toBeInstanceOf(Promise);

    await vi.advanceTimersByTimeAsync(5000);
    await expect(promise).resolves.toBeUndefined();
  });
});
