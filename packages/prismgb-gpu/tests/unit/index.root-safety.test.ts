import { describe, expect, it, vi } from 'vitest';

vi.mock('@/infrastructure/capabilities.browser', () => {
  throw new Error('browser capabilities imported');
});

vi.mock('@/infrastructure/webgl2/webgl2-pipeline', () => {
  throw new Error('webgl2 pipeline imported');
});

vi.mock('@/infrastructure/webgpu/webgpu-pipeline', () => {
  throw new Error('webgpu pipeline imported');
});

vi.mock('@/worker/client', () => {
  throw new Error('worker client imported');
});

describe('@prismgb/gpu root export safety', () => {
  it('keeps root imports domain/catalog only', async () => {
    const gpu = await import('@prismgb/gpu');

    expect(gpu.getRendererDefaultPreset().id).toBe('vibrant');
    expect(gpu.buildUniforms).toEqual(expect.any(Function));
    expect(gpu.createRenderPipeline).toBeUndefined();
    expect(gpu.detectBrowserGpuCapabilities).toBeUndefined();
    expect(gpu.WorkerRendererClient).toBeUndefined();
  });
});
