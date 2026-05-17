import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebGPURenderer } from '@renderer/infrastructure/rendering/workers/webgpu-renderer.engine.ts';

const config = {
  nativeWidth: 160,
  nativeHeight: 144,
  targetWidth: 640,
  targetHeight: 576,
  scaleFactor: 4,
  api: 'webgpu',
  presetId: 'true-color'
};

describe('WebGPURenderer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('allows destroy before initialization', () => {
    const renderer = new WebGPURenderer();

    expect(() => renderer.destroy()).not.toThrow();
  });

  it('destroys the device when WebGPU canvas context creation fails', async () => {
    const destroy = vi.fn();
    const device = {
      destroy,
      lost: new Promise(() => {})
    };
    const adapter = {
      info: {
        vendor: 'test',
        architecture: 'mock',
        device: 'mock-device',
        description: 'mock adapter'
      },
      requestDevice: vi.fn(async () => device)
    };
    const gpu = {
      requestAdapter: vi.fn(async () => adapter),
      getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm')
    };
    const canvas = {
      getContext: vi.fn(() => null)
    };

    vi.stubGlobal('navigator', { gpu });

    const renderer = new WebGPURenderer();
    await expect(renderer.initialize(canvas, config)).rejects.toThrow(
      'WebGPU canvas context not available'
    );
    expect(destroy).toHaveBeenCalled();
  });
});
