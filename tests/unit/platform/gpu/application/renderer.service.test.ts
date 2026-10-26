import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGpuRenderer } from '../../../../../src/platform/gpu/application/renderer.service';
import { resolvePreset } from '@platform/gpu';
import { createMockCanvas } from '@platform/gpu/testkit';

afterEach(() => vi.unstubAllGlobals());

describe('renderer backend initialization', () => {
  it('initializes the requested Canvas2D backend without probing GPU capabilities', async () => {
    const context = { drawImage: vi.fn(), imageSmoothingEnabled: true };
    const canvas = createMockCanvas(160, 144, { '2d': context });
    const requestAdapter = vi.fn();
    vi.stubGlobal('navigator', { gpu: { requestAdapter } });
    const renderer = await createGpuRenderer({ canvas, nativeWidth: 160, nativeHeight: 144, preset: resolvePreset('true-color'), backend: 'canvas2d' });
    renderer.renderFrame({} as TexImageSource);
    expect(context.drawImage).toHaveBeenCalledOnce();
    expect(context.imageSmoothingEnabled).toBe(false);
    expect(requestAdapter).not.toHaveBeenCalled();
    // Resizing a canvas resets its context state; the factory-owned pipeline
    // must restore pixel-perfect sampling through the real Canvas driver.
    context.imageSmoothingEnabled = true;
    renderer.resize(320, 288);
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(288);
    expect(context.imageSmoothingEnabled).toBe(false);
    await renderer.dispose();
    expect(renderer.isActive).toBe(false);
  });

  it('reports unavailable WebGPU so the session owner can replace the canvas before fallback', async () => {
    vi.stubGlobal('navigator', {});
    const canvas = createMockCanvas();
    vi.spyOn(canvas, 'getContext');
    await expect(createGpuRenderer({ canvas, nativeWidth: 160, nativeHeight: 144, preset: resolvePreset('true-color'), backend: 'webgpu' })).rejects.toThrow('WebGPU not supported');
    expect(canvas.getContext).not.toHaveBeenCalled();
  });

  it('releases a partially initialized GPU device before rejecting', async () => {
    const device = { destroy: vi.fn(), lost: new Promise(() => {}) };
    vi.stubGlobal('navigator', { gpu: { requestAdapter: async () => ({ requestDevice: async () => device }) } });
    const canvas = createMockCanvas();
    await expect(createGpuRenderer({ canvas, nativeWidth: 160, nativeHeight: 144, preset: resolvePreset('true-color'), backend: 'webgpu' })).rejects.toThrow('WebGPU context not available');
    expect(device.destroy).toHaveBeenCalledOnce();
  });
});
