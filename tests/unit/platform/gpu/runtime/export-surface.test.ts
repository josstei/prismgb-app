import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../src/platform/gpu/infrastructure/capabilities.browser', () => ({
  detectBrowserGpuCapabilities: vi.fn(async () => ({
    webgpu: true,
    transferControlToOffscreen: true
  }))
}));

describe('@platform/gpu/runtime export surface', () => {
  it('exports runtime factories and lazy browser capability detection', async () => {
    const runtime = await import('@platform/gpu/runtime');

    expect(runtime.createGpuVideoRendererSession).toEqual(expect.any(Function));
    expect(runtime.detectBrowserGpuCapabilities).toEqual(expect.any(Function));
    await expect(runtime.detectBrowserGpuCapabilities()).resolves.toEqual(expect.objectContaining({
      webgpu: true
    }));
  });
});
