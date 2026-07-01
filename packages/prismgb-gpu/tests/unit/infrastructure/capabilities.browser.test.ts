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
      webgl2: false,
      offscreenCanvas: false,
      transferControlToOffscreen: false,
      preferredBackend: 'canvas2d',
      maxTextureSize: 4096,
      webgpuLimits: undefined,
      webgl2Info: undefined
    });
  });

  it('detects WebGL2 as preferred backend when WebGPU is unavailable', async () => {
    const gl = {
      MAX_TEXTURE_SIZE: 0x0D33,
      getExtension: vi.fn(() => null),
      getParameter: vi.fn((parameter) => parameter === 0x0D33 ? 8192 : 'mock')
    };
    const canvas = {
      getContext: vi.fn((type: string) => type === 'webgl2' ? gl : null),
      transferControlToOffscreen: vi.fn()
    };
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', {
      createElement: vi.fn(() => canvas)
    });
    vi.stubGlobal('OffscreenCanvas', class {});

    const capabilities = await detectBrowserGpuCapabilities();

    expect(capabilities.webgpu).toBe(false);
    expect(capabilities.webgl2).toBe(true);
    expect(capabilities.transferControlToOffscreen).toBe(true);
    expect(capabilities.preferredBackend).toBe('webgl2');
    expect(capabilities.maxTextureSize).toBe(8192);
  });
});
