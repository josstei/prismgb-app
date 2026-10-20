import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePreset } from '@platform/gpu';
import { startRenderWorkerHost, type RenderWorkerScope } from '../../../../../src/platform/gpu/worker/render-worker.host';
import type {
  RenderWorkerConfig,
  RenderWorkerRequest,
  RenderWorkerResponse
} from '../../../../../src/platform/gpu/worker/render-worker.contract';

const { mockCreateDriver } = vi.hoisted(() => ({ mockCreateDriver: vi.fn() }));

vi.mock('../../../../../src/platform/gpu/infrastructure/webgpu.driver', () => ({
  WebGpuDriver: { create: mockCreateDriver }
}));

const renderer = {
  renderFrame: vi.fn(),
  resize: vi.fn(),
  captureFrame: vi.fn(),
  setPreset: vi.fn(),
  setBrightness: vi.fn()
};

const CONFIG: RenderWorkerConfig = {
  nativeWidth: 160,
  nativeHeight: 144,
  targetWidth: 640,
  targetHeight: 576,
  presetId: 'vintage',
  brightness: 1.3
};

function createBitmap(id = 'frame') {
  return { id, close: vi.fn() } as unknown as ImageBitmap;
}

function createCanvas() {
  return { width: 1, height: 1, getContext: vi.fn() } as unknown as OffscreenCanvas;
}

function createHost() {
  const posted: Array<{ response: RenderWorkerResponse; transfer?: Transferable[] }> = [];
  const scope: RenderWorkerScope = {
    onmessage: null,
    postMessage: (response, transfer) => {
      posted.push({ response, transfer });
    }
  };
  startRenderWorkerHost(scope);

  const send = async (request: RenderWorkerRequest) => {
    await scope.onmessage?.({ data: request } as MessageEvent<RenderWorkerRequest>);
  };
  const responses = () => posted.map(({ response }) => response);

  return { posted, responses, send };
}

async function createInitializedHost() {
  const host = createHost();
  await host.send({ type: 'init', canvas: createCanvas(), config: CONFIG });
  host.posted.length = 0;
  return host;
}

describe('render worker host', () => {
  beforeEach(() => {
    mockCreateDriver.mockResolvedValue(renderer);
  });

  it('sizes the canvas, creates the WebGPU driver with the resolved preset and brightness, then reports ready', async () => {
    const host = createHost();
    const canvas = createCanvas();

    await host.send({ type: 'init', canvas, config: CONFIG });

    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(576);
    expect(mockCreateDriver).toHaveBeenCalledWith(canvas, {
      nativeWidth: 160,
      nativeHeight: 144,
      preset: resolvePreset('vintage'),
      brightness: 1.3
    });
    expect(host.responses()).toEqual([{ type: 'ready' }]);
  });

  it('reports an initialization failure as an error message', async () => {
    mockCreateDriver.mockRejectedValueOnce(new Error('WebGPU adapter not available'));
    const host = createHost();

    await host.send({ type: 'init', canvas: createCanvas(), config: CONFIG });

    expect(host.responses()).toEqual([{ type: 'error', message: 'WebGPU adapter not available' }]);
  });

  it('ignores frames and updates before initialization but still closes the frame', async () => {
    const host = createHost();
    const bitmap = createBitmap();

    await host.send({ type: 'frame', bitmap });
    await host.send({ type: 'resize', width: 320, height: 288 });
    await host.send({ type: 'setBrightness', brightness: 1.5 });

    expect(renderer.renderFrame).not.toHaveBeenCalled();
    expect(renderer.resize).not.toHaveBeenCalled();
    expect(renderer.setBrightness).not.toHaveBeenCalled();
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(host.responses()).toEqual([]);
  });

  it('renders each frame, closes it and reports frameRendered', async () => {
    const host = await createInitializedHost();
    const bitmap = createBitmap();

    await host.send({ type: 'frame', bitmap });

    expect(renderer.renderFrame).toHaveBeenCalledWith(bitmap);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(host.responses()).toEqual([{ type: 'frameRendered' }]);
  });

  it('reports render failures and still closes the frame', async () => {
    const host = await createInitializedHost();
    const bitmap = createBitmap();
    renderer.renderFrame.mockImplementationOnce(() => {
      throw new Error('render failed');
    });

    await host.send({ type: 'frame', bitmap });

    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(host.responses()).toEqual([{ type: 'error', message: 'render failed' }]);
  });

  it('forwards resize, preset and brightness updates to the renderer', async () => {
    const host = await createInitializedHost();

    await host.send({ type: 'resize', width: 1280, height: 1152 });
    await host.send({ type: 'setPreset', presetId: 'pixel' });
    await host.send({ type: 'setBrightness', brightness: 0.5 });

    expect(renderer.resize).toHaveBeenCalledWith(1280, 1152);
    expect(renderer.setPreset).toHaveBeenCalledWith(resolvePreset('pixel'));
    expect(renderer.setBrightness).toHaveBeenLastCalledWith(0.5);
    expect(host.responses()).toEqual([]);
  });

  it('reports a failing update as an error message', async () => {
    const host = await createInitializedHost();
    renderer.resize.mockImplementationOnce(() => {
      throw new Error('resize failed');
    });

    await host.send({ type: 'resize', width: 1280, height: 1152 });

    expect(host.responses()).toEqual([{ type: 'error', message: 'resize failed' }]);
  });

  it('captures the first frame rendered after a capture request and transfers it', async () => {
    const host = await createInitializedHost();
    const captured = createBitmap('captured');
    renderer.captureFrame.mockResolvedValueOnce(captured);

    await host.send({ type: 'capture' });
    expect(host.posted).toEqual([]);

    await host.send({ type: 'frame', bitmap: createBitmap() });
    await host.send({ type: 'frame', bitmap: createBitmap() });

    expect(renderer.captureFrame).toHaveBeenCalledTimes(1);
    expect(host.posted.map(({ response, transfer }) => [response, transfer])).toEqual([
      [{ type: 'captured', bitmap: captured }, [captured]],
      [{ type: 'frameRendered' }, []],
      [{ type: 'frameRendered' }, []]
    ]);
  });

  it('rejects a capture request before initialization', async () => {
    const host = createHost();

    await host.send({ type: 'capture' });

    expect(host.responses()).toEqual([{ type: 'error', message: 'Capture renderer not initialized' }]);
  });
});
