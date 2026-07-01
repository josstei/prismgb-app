import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectBrowserGpuCapabilities } from '@/infrastructure/capabilities.browser';

describe('detectBrowserGpuCapabilities', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

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
      offscreenCanvas: false,
      transferControlToOffscreen: false,
      preferredBackend: 'canvas2d',
      maxTextureSize: 4096,
      webgpuLimits: undefined
    });
  });
});
