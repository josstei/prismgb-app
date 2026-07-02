import { describe, expect, it, vi } from 'vitest';

vi.mock('@/infrastructure/capabilities.browser', () => {
  throw new Error('browser capabilities imported');
});

vi.mock('@/infrastructure/webgpu.driver', () => {
  throw new Error('webgpu driver imported');
});

vi.mock('@/worker/client', () => {
  throw new Error('worker client imported');
});

describe('@prismgb/gpu root export safety', () => {
  it('keeps root imports domain/catalog only', async () => {
    const gpu = await import('@prismgb/gpu');

    expect(gpu.resolvePreset(null).id).toBe('vibrant');
    expect(gpu.getUiPresets).toEqual(expect.any(Function));
    expect(gpu.resolvePreset).toEqual(expect.any(Function));
    expect(gpu.PRESET_POLICY).toBeDefined();
    // Internal implementation details are no longer on the contracted root surface.
    expect(gpu.buildUniforms).toBeUndefined();
    expect(gpu.calculateScaleFactor).toBeUndefined();
    expect(gpu.createShaderPresetCatalog).toBeUndefined();
    expect(gpu.getAllPresets).toBeUndefined();
    expect(gpu.getPackageDefaultPreset).toBeUndefined();
    expect(gpu.getRendererDefaultPreset).toBeUndefined();
    expect(gpu.getPreset).toBeUndefined();
    expect(gpu.BUILT_IN_PRESETS).toBeUndefined();
    expect(gpu.BUILT_IN_PRESET_CATALOG).toBeUndefined();
    expect(gpu.createGpuRenderer).toBeUndefined();
    expect(gpu.detectBrowserGpuCapabilities).toBeUndefined();
    expect(gpu.WorkerRendererClient).toBeUndefined();
  });
});
