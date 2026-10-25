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

describe('@platform/gpu root export safety', () => {
  it('keeps root imports domain/catalog only', async () => {
    const gpu = await import('@platform/gpu');
    expect(gpu.resolvePreset(null).id).toBe('vibrant');
    expect(gpu.getUiPresets).toEqual(expect.any(Function));
    expect(gpu.resolvePreset).toEqual(expect.any(Function));
    expect(gpu.PRESET_POLICY).toBeDefined();
    expect(Object.keys(gpu).sort()).toEqual(['PRESET_POLICY', 'getUiPresets', 'resolvePreset']);
  });
});
