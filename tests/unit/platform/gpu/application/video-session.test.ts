import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createGpuVideoRendererSession,
  type GpuVideoRendererSessionOptions
} from '../../../../../src/platform/gpu/application/video-session';
import { createMockCanvas, createRenderCapabilitiesFixture } from '@platform/gpu/testkit';
import type { RenderWorkerResponse } from '../../../../../src/platform/gpu/worker/render-worker.contract';

function createCanvas2DRenderFixture() {
  const canvas2dContext = {
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    imageSmoothingEnabled: true
  };
  const canvas = createMockCanvas(160, 144, { '2d': canvas2dContext });
  vi.spyOn(canvas, 'getContext');
  return canvas as unknown as HTMLCanvasElement;
}

function createWorkerMock(): Worker {
  return {
    onmessage: null,
    onerror: null,
    postMessage: vi.fn(),
    terminate: vi.fn()
  } as unknown as Worker;
}

async function createWebGpuSession(options: Partial<GpuVideoRendererSessionOptions> = {}) {
  const worker = createWorkerMock();
  const respond = (response: RenderWorkerResponse) => {
    worker.onmessage?.({ data: response } as MessageEvent);
  };
  const sessionPromise = createGpuVideoRendererSession({
    canvas: Object.assign(createMockCanvas(), { clientWidth: 480, clientHeight: 432 }) as unknown as HTMLCanvasElement,
    nativeResolution: { width: 160, height: 144 },
    preferredBackend: 'webgpu',
    createWorker: () => worker,
    capabilities: createRenderCapabilitiesFixture({
      webgpu: true,
      offscreenCanvas: true,
      transferControlToOffscreen: true,
      preferredBackend: 'webgpu'
    }),
    ...options
  });

  respond({ type: 'ready' });

  return { session: await sessionPromise, worker, respond };
}

describe('GpuVideoRendererSession', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates Canvas2D session when preferredBackend is canvas2d', async () => {
    const canvas = createCanvas2DRenderFixture();
    const session = await createGpuVideoRendererSession({
      canvas,
      nativeResolution: { width: 160, height: 144 },
      preferredBackend: 'canvas2d',
      allowCanvas2D: true,
      capabilities: createRenderCapabilitiesFixture({
        webgpu: false,
        offscreenCanvas: false,
        transferControlToOffscreen: false,
        preferredBackend: 'canvas2d'
      })
    });

    expect(session.backend).toBe('canvas2d');
    expect(session.isActive).toBe(true);
    expect(session.isCanvasTransferred).toBe(false);

    const video = { readyState: 4 } as HTMLVideoElement;
    await session.renderFrame(video);
    expect(canvas.getContext).toHaveBeenCalledWith('2d', expect.any(Object));

    session.terminate();
    expect(session.isActive).toBe(false);
  });

  it('creates a WebGPU session whose init request carries the resolved preset and brightness', async () => {
    const onReady = vi.fn();
    const { session, worker } = await createWebGpuSession({ presetId: 'unknown', brightness: 1.4, onReady });

    expect(session.backend).toBe('webgpu');
    expect(session.isCanvasTransferred).toBe(true);
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    expect(vi.mocked(worker.postMessage).mock.calls[0][0]).toEqual(expect.objectContaining({
      type: 'init',
      config: {
        nativeWidth: 160,
        nativeHeight: 144,
        targetWidth: 480,
        targetHeight: 432,
        presetId: 'vibrant',
        brightness: 1.4
      }
    }));
    expect(onReady).toHaveBeenCalledWith({ backend: 'webgpu' });

    session.terminate();
  });

  it('forwards brightness and resolved preset ids to the worker', async () => {
    const { session, worker } = await createWebGpuSession();

    session.setBrightness(1.2);
    session.setPreset('missing-preset');
    session.setPreset('pixel');

    expect(vi.mocked(worker.postMessage).mock.calls.slice(1).map(([request]) => request)).toEqual([
      { type: 'setBrightness', brightness: 1.2 },
      { type: 'setPreset', presetId: 'vibrant' },
      { type: 'setPreset', presetId: 'pixel' }
    ]);

    session.terminate();
  });

  it('resolves a capture with the bitmap the worker sends back', async () => {
    const { session, worker, respond } = await createWebGpuSession();
    const captured = { close: vi.fn() } as unknown as ImageBitmap;

    const capturePromise = session.captureFrame();
    await expect(session.captureFrame()).rejects.toThrow('Capture already in progress');
    expect(vi.mocked(worker.postMessage).mock.calls.at(-1)?.[0]).toEqual({ type: 'capture' });

    respond({ type: 'captured', bitmap: captured });

    await expect(capturePromise).resolves.toBe(captured);
    session.terminate();
  });

  it('rejects a capture the worker does not answer within one second', async () => {
    const { session } = await createWebGpuSession();
    vi.useFakeTimers();

    const capturePromise = session.captureFrame();
    const expectation = expect(capturePromise).rejects.toThrow('Capture request timed out');
    await vi.advanceTimersByTimeAsync(1000);

    await expectation;
    session.terminate();
  });

  it('rejects a pending capture and reports the message when the worker fails', async () => {
    const onError = vi.fn();
    const { session, respond } = await createWebGpuSession({ onError });

    const capturePromise = session.captureFrame();
    respond({ type: 'error', message: 'render failed' });

    await expect(capturePromise).rejects.toThrow('render failed');
    expect(onError).toHaveBeenCalledWith({ message: 'render failed' });
    session.terminate();
  });

  it('invokes onCanvasExpired only when terminate requests it', async () => {
    const onCanvasExpired = vi.fn();
    const { session, worker } = await createWebGpuSession({ onCanvasExpired });

    session.terminate();
    expect(onCanvasExpired).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledTimes(1);

    session.terminate({ emitCanvasExpired: true });
    expect(onCanvasExpired).toHaveBeenCalledTimes(1);
  });

  it('reports scaled target dimensions and resizes the worker to them', async () => {
    const { session, worker } = await createWebGpuSession();

    session.resize(700, 600);

    expect(session.getTargetDimensions()).toEqual({ width: 640, height: 576 });
    expect(vi.mocked(worker.postMessage).mock.calls.at(-1)?.[0]).toEqual({ type: 'resize', width: 640, height: 576 });

    session.terminate();
  });
});
