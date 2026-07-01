import { describe, expect, it, vi } from 'vitest';

vi.mock('@/infrastructure/capabilities.browser', () => {
  throw new Error('browser capabilities imported');
});

vi.mock('@/infrastructure/webgpu.renderer', () => {
  throw new Error('webgpu renderer imported');
});

vi.mock('@/worker/client', () => {
  throw new Error('worker client imported');
});

describe('@prismgb/gpu root export safety', () => {
  it('keeps root imports domain/catalog only', async () => {
    const gpu = await import('@prismgb/gpu');

    expect(gpu.getRendererDefaultPreset().id).toBe('vibrant');
    expect(gpu.buildUniforms).toEqual(expect.any(Function));
    expect(gpu.createGpuRenderer).toBeUndefined();
    expect(gpu.detectBrowserGpuCapabilities).toBeUndefined();
    expect(gpu.WorkerRendererClient).toBeUndefined();
  });
});
