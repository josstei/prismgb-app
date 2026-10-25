import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectBrowserGpuCapabilities } from '../../../../../src/platform/gpu/infrastructure/capabilities.browser';

describe('detectBrowserGpuCapabilities', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns Canvas2D fallback capabilities when browser GPU APIs are unavailable', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', undefined);
    vi.stubGlobal('OffscreenCanvas', undefined);

    const capabilities = await detectBrowserGpuCapabilities();

    expect(capabilities).toEqual({
      webgpu: false,
      transferControlToOffscreen: false
    });
  });

  it('checks device creation and releases the probe before enabling worker rendering', async () => {
    const destroy = vi.fn();
    const requestDevice = vi.fn(async () => ({ destroy }));
    vi.stubGlobal('navigator', { gpu: { requestAdapter: vi.fn(async () => ({ requestDevice })) } });
    vi.stubGlobal('OffscreenCanvas', class {});
    const transfer = vi.fn();
    vi.stubGlobal('document', { createElement: () => ({ transferControlToOffscreen: transfer }) });

    await expect(detectBrowserGpuCapabilities()).resolves.toEqual({
      webgpu: true,
      transferControlToOffscreen: true
    });
    expect(requestDevice).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
    expect(transfer).toHaveBeenCalledOnce();
  });

  it('keeps Canvas2D available when the GPU device or canvas transfer fails', async () => {
    vi.stubGlobal('navigator', { gpu: { requestAdapter: async () => ({ requestDevice: async () => { throw new Error('device unavailable'); } }) } });
    vi.stubGlobal('OffscreenCanvas', class {});
    vi.stubGlobal('document', { createElement: () => ({ transferControlToOffscreen() { throw new Error('transfer unavailable'); } }) });

    await expect(detectBrowserGpuCapabilities()).resolves.toEqual({
      webgpu: false,
      transferControlToOffscreen: false
    });
  });
});
