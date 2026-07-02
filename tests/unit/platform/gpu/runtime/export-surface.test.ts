import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../src/platform/gpu/infrastructure/capabilities.browser', () => ({
  detectBrowserGpuCapabilities: vi.fn(async () => ({
    webgpu: true,
    offscreenCanvas: true,
    transferControlToOffscreen: true,
    preferredBackend: 'webgpu',
    maxTextureSize: 4096
  }))
}));

describe('@prismgb/gpu/runtime export surface', () => {
  it('exports runtime factories and lazy browser capability detection', async () => {
    const runtime = await import('@prismgb/gpu/runtime');

    expect(runtime.createGpuVideoRendererSession).toEqual(expect.any(Function));
    expect(runtime.detectBrowserGpuCapabilities).toEqual(expect.any(Function));
    await expect(runtime.detectBrowserGpuCapabilities()).resolves.toEqual(expect.objectContaining({
      preferredBackend: 'webgpu'
    }));
  });
});
