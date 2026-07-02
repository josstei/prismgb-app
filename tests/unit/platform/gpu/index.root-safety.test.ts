import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/platform/gpu/infrastructure/capabilities.browser', () => {
  throw new Error('browser capabilities imported');
});

vi.mock('../../../../src/platform/gpu/infrastructure/webgpu.driver', () => {
  throw new Error('webgpu driver imported');
});

vi.mock('../../../../src/platform/gpu/worker/client', () => {
  throw new Error('worker client imported');
});

describe('@prismgb/gpu root export safety', () => {
  it('keeps root imports domain/catalog only', async () => {
    const gpu = await import('@prismgb/gpu');
    const gpuRootSurface = gpu as unknown as Record<string, unknown>;

    expect(gpu.resolvePreset(null).id).toBe('vibrant');
    expect(gpu.getUiPresets).toEqual(expect.any(Function));
    expect(gpu.resolvePreset).toEqual(expect.any(Function));
    expect(gpu.PRESET_POLICY).toBeDefined();
    // Internal implementation details are no longer on the contracted root surface.
    expect(gpuRootSurface.buildUniforms).toBeUndefined();
    expect(gpuRootSurface.calculateScaleFactor).toBeUndefined();
    expect(gpuRootSurface.createShaderPresetCatalog).toBeUndefined();
    expect(gpuRootSurface.getAllPresets).toBeUndefined();
    expect(gpuRootSurface.getPackageDefaultPreset).toBeUndefined();
    expect(gpuRootSurface.getRendererDefaultPreset).toBeUndefined();
    expect(gpuRootSurface.getPreset).toBeUndefined();
    expect(gpuRootSurface.BUILT_IN_PRESETS).toBeUndefined();
    expect(gpuRootSurface.BUILT_IN_PRESET_CATALOG).toBeUndefined();
    expect(gpuRootSurface.createGpuRenderer).toBeUndefined();
    expect(gpuRootSurface.detectBrowserGpuCapabilities).toBeUndefined();
    expect(gpuRootSurface.WorkerRendererClient).toBeUndefined();
  });
});
