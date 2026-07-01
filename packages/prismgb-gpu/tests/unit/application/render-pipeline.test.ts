import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCanvas2DRenderPipeline } from '@/application/canvas2d-render-pipeline';
import { createRenderPipeline } from '@/application/render-pipeline';
import { WebGL2Pipeline } from '@/infrastructure/webgl2/webgl2-pipeline';
import { createMockCanvas, createRenderCapabilitiesFixture } from '@prismgb/gpu/testkit';

function createCanvas2DRenderFixture() {
  const canvas2dContext = {
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    imageSmoothingEnabled: true
  };
  const canvas = createMockCanvas(160, 144, { '2d': canvas2dContext });

  vi.spyOn(canvas, 'getContext');
  return canvas;
}

describe('render pipeline runtime', () => {
  beforeEach(() => {
    vi.stubGlobal('performance', {
      now: vi.fn(() => 0)
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates an explicit Canvas2D pipeline without probing browser capabilities', async () => {
    const canvas = createCanvas2DRenderFixture();
    const pipeline = await createCanvas2DRenderPipeline({
      canvas,
      nativeWidth: 160,
      nativeHeight: 144
    });

    expect(canvas.getContext).toHaveBeenCalledWith('2d', {
      alpha: false,
      desynchronized: true
    });
    expect(pipeline.isInitialized).toBe(true);

    await pipeline.dispose();
  });

  it('falls back to Canvas2D when no accelerated backend is available', async () => {
    const canvas = createCanvas2DRenderFixture();
    const pipeline = await createRenderPipeline({
      canvas,
      nativeWidth: 160,
      nativeHeight: 144,
      capabilities: createRenderCapabilitiesFixture({
        webgpu: false,
        webgl2: false,
        offscreenCanvas: false,
        transferControlToOffscreen: false,
        preferredBackend: 'canvas2d'
      })
    });

    expect(pipeline.isInitialized).toBe(true);
    expect(pipeline.backend).toBe('canvas2d');
    expect(canvas.getContext).toHaveBeenCalledWith('2d', {
      alpha: false,
      desynchronized: true
    });

    await pipeline.dispose();
  });

  it('rejects Canvas2D fallback when accelerated-only rendering is requested', async () => {
    const canvas = createCanvas2DRenderFixture();

    await expect(createRenderPipeline({
      canvas,
      nativeWidth: 160,
      nativeHeight: 144,
      allowCanvas2D: false,
      capabilities: createRenderCapabilitiesFixture({
        webgpu: false,
        webgl2: false,
        offscreenCanvas: false,
        transferControlToOffscreen: false,
        preferredBackend: 'webgpu'
      })
    })).rejects.toThrow('No accelerated render backend available');

    expect(canvas.getContext).not.toHaveBeenCalledWith('2d', expect.anything());
  });

  it('disposes a recoverable WebGL2 pipeline failure before falling back to Canvas2D', async () => {
    const disposeSpy = vi.spyOn(WebGL2Pipeline.prototype, 'dispose');
    const canvas = createCanvas2DRenderFixture();
    const pipeline = await createRenderPipeline({
      canvas,
      nativeWidth: 160,
      nativeHeight: 144,
      capabilities: {
        ...createRenderCapabilitiesFixture(),
        webgpu: false,
        webgl2: true,
        preferredBackend: 'webgl2'
      }
    });

    expect(disposeSpy).toHaveBeenCalledTimes(1);
    expect(canvas.getContext).toHaveBeenCalledWith('webgl2', expect.any(Object));
    expect(canvas.getContext).toHaveBeenCalledWith('2d', {
      alpha: false,
      desynchronized: true
    });
    expect(pipeline.isInitialized).toBe(true);

    await pipeline.dispose();
  });

  it('falls back when WebGPU device acquisition fails after capability detection', async () => {
    const requestDevice = vi.fn(async () => {
      throw new Error('requestDevice rejected');
    });
    vi.stubGlobal('navigator', {
      gpu: {
        requestAdapter: vi.fn(async () => ({ requestDevice }))
      }
    });
    const canvas = createCanvas2DRenderFixture();

    const pipeline = await createRenderPipeline({
      canvas,
      nativeWidth: 160,
      nativeHeight: 144,
      capabilities: {
        ...createRenderCapabilitiesFixture(),
        webgpu: true,
        webgl2: false,
        preferredBackend: 'webgpu'
      }
    });

    expect(requestDevice).toHaveBeenCalledTimes(1);
    expect(canvas.getContext).toHaveBeenCalledWith('2d', {
      alpha: false,
      desynchronized: true
    });
    expect(pipeline.isInitialized).toBe(true);

    await pipeline.dispose();
  });

  it('surfaces non-recoverable accelerated pipeline initialization failures', async () => {
    vi.spyOn(WebGL2Pipeline.prototype, 'initialize')
      .mockRejectedValueOnce(new Error("Missing WebGL2 shader source for pass 'pixel-upscale'"));
    const disposeSpy = vi.spyOn(WebGL2Pipeline.prototype, 'dispose')
      .mockResolvedValueOnce();
    const canvas = createCanvas2DRenderFixture();

    await expect(createRenderPipeline({
      canvas,
      nativeWidth: 160,
      nativeHeight: 144,
      capabilities: {
        ...createRenderCapabilitiesFixture(),
        webgpu: false,
        webgl2: true,
        preferredBackend: 'webgl2'
      }
    })).rejects.toThrow('Failed to initialize webgl2 render pipeline');

    expect(disposeSpy).toHaveBeenCalledTimes(1);
    expect(canvas.getContext).not.toHaveBeenCalledWith('2d', expect.anything());
  });
});
