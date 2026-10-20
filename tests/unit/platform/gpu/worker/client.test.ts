import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerRendererClient } from '../../../../../src/platform/gpu/worker/client';
import type { RenderWorkerResponse } from '../../../../../src/platform/gpu/worker/render-worker.contract';
import { createMockCanvas } from '@platform/gpu/testkit';

function createWorkerMock(): Worker {
  return {
    onmessage: null,
    onerror: null,
    postMessage: vi.fn(),
    terminate: vi.fn()
  } as unknown as Worker;
}

const CONFIG = {
  nativeWidth: 160,
  nativeHeight: 144,
  targetWidth: 640,
  targetHeight: 576,
  presetId: 'vibrant',
  brightness: 1.2
};

describe('WorkerRendererClient', () => {
  let worker: Worker;
  let client: WorkerRendererClient;

  const respond = (response: RenderWorkerResponse) => {
    worker.onmessage?.({ data: response } as MessageEvent);
  };

  beforeEach(() => {
    worker = createWorkerMock();
    client = new WorkerRendererClient({
      createWorker: () => worker,
      logger: {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn()
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('transfers the canvas in the init request and resolves when the worker reports ready', async () => {
    const canvas = createMockCanvas() as unknown as HTMLCanvasElement;
    const transferControlToOffscreen = vi.spyOn(canvas, 'transferControlToOffscreen');
    const initializePromise = client.initialize(canvas, CONFIG);

    respond({ type: 'ready' });
    await initializePromise;

    expect(transferControlToOffscreen).toHaveBeenCalledTimes(1);
    const offscreenCanvas = transferControlToOffscreen.mock.results[0].value;
    expect(worker.postMessage).toHaveBeenCalledWith(
      { type: 'init', canvas: offscreenCanvas, config: CONFIG },
      [offscreenCanvas]
    );
    expect(client.isReady()).toBe(true);
    expect(client.isCanvasTransferred()).toBe(true);
  });

  it('returns false instead of throwing when commands are sent before ready', () => {
    const imageBitmap = { close: vi.fn() } as unknown as ImageBitmap;

    expect(client.renderFrame(imageBitmap)).toBe(false);
    expect(client.requestCapture()).toBe(false);
    expect(worker.postMessage).not.toHaveBeenCalled();
  });

  it('rejects initialization when the worker does not report ready in time', async () => {
    vi.useFakeTimers();
    const canvas = createMockCanvas() as unknown as HTMLCanvasElement;
    const initializePromise = client.initialize(canvas, CONFIG, 50);
    const initializationExpectation = expect(initializePromise).rejects.toThrow('Worker initialization timed out');

    await vi.advanceTimersByTimeAsync(50);
    await initializationExpectation;
    expect(client.isReady()).toBe(false);
  });

  it('rejects initialization with the worker error message and dispatches the error', async () => {
    const onError = vi.fn();
    client.onMessage('error', onError);
    const canvas = createMockCanvas() as unknown as HTMLCanvasElement;
    const initializePromise = client.initialize(canvas, CONFIG);

    respond({ type: 'error', message: 'WebGPU adapter not available' });

    await expect(initializePromise).rejects.toThrow('WebGPU adapter not available');
    expect(onError).toHaveBeenCalledWith({ type: 'error', message: 'WebGPU adapter not available' });
    expect(client.isReady()).toBe(false);
  });

  it('posts accepted commands and dispatches responses to their handlers', async () => {
    const canvas = createMockCanvas() as unknown as HTMLCanvasElement;
    const onFrameRendered = vi.fn();
    const onCaptured = vi.fn();
    client.onMessage('frameRendered', onFrameRendered);
    const unsubscribeCaptured = client.onMessage('captured', onCaptured);

    const initializePromise = client.initialize(canvas, CONFIG);
    respond({ type: 'ready' });
    await initializePromise;

    const imageBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    expect(client.renderFrame(imageBitmap)).toBe(true);
    expect(client.resize(1280, 1152)).toBe(true);
    expect(client.setPreset('pixel')).toBe(true);
    expect(client.setBrightness(0.5)).toBe(true);
    expect(client.requestCapture()).toBe(true);

    expect(vi.mocked(worker.postMessage).mock.calls.slice(1)).toEqual([
      [{ type: 'frame', bitmap: imageBitmap }, [imageBitmap]],
      [{ type: 'resize', width: 1280, height: 1152 }, []],
      [{ type: 'setPreset', presetId: 'pixel' }, []],
      [{ type: 'setBrightness', brightness: 0.5 }, []],
      [{ type: 'capture' }, []]
    ]);

    const captured = { close: vi.fn() } as unknown as ImageBitmap;
    respond({ type: 'frameRendered' });
    respond({ type: 'captured', bitmap: captured });
    unsubscribeCaptured();
    respond({ type: 'captured', bitmap: captured });

    expect(onFrameRendered).toHaveBeenCalledWith({ type: 'frameRendered' });
    expect(onCaptured).toHaveBeenCalledTimes(1);
    expect(onCaptured).toHaveBeenCalledWith({ type: 'captured', bitmap: captured });
  });

  it('stops sending after a worker error', async () => {
    const canvas = createMockCanvas() as unknown as HTMLCanvasElement;
    const initializePromise = client.initialize(canvas, CONFIG);
    respond({ type: 'ready' });
    await initializePromise;

    respond({ type: 'error', message: 'render failed' });

    expect(client.isReady()).toBe(false);
    expect(client.renderFrame({ close: vi.fn() } as unknown as ImageBitmap)).toBe(false);
  });

  it('terminates the worker without posting further messages', async () => {
    const canvas = createMockCanvas() as unknown as HTMLCanvasElement;
    const initializePromise = client.initialize(canvas, CONFIG);
    respond({ type: 'ready' });
    await initializePromise;

    client.terminate();

    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(worker.onmessage).toBeNull();
    expect(client.isReady()).toBe(false);
    expect(client.isCanvasTransferred()).toBe(false);
  });
});
