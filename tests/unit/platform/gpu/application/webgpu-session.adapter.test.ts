import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebGpuSessionAdapter } from '../../../../../src/platform/gpu/application/webgpu-session.adapter';
import type { GpuVideoRendererSessionOptions } from '../../../../../src/platform/gpu/application/video-session.factory';
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

function createLogger() {
  return { error: vi.fn(), info: vi.fn() };
}

function startSession(options: Partial<GpuVideoRendererSessionOptions> = {}) {
  const worker = createWorkerMock();
  const canvas = Object.assign(createMockCanvas(), { clientWidth: 480, clientHeight: 432 });
  const transferControlToOffscreen = vi.spyOn(canvas, 'transferControlToOffscreen');
  const respond = (response: RenderWorkerResponse) => {
    worker.onmessage?.({ data: response } as MessageEvent);
  };
  const sessionPromise = WebGpuSessionAdapter.create({
    canvas: canvas as unknown as HTMLCanvasElement,
    nativeResolution: { width: 160, height: 144 },
    createWorker: () => worker,
    logger: createLogger(),
    ...options
  });

  return { sessionPromise, worker, respond, transferControlToOffscreen };
}

async function createReadySession(options: Partial<GpuVideoRendererSessionOptions> = {}) {
  const started = startSession(options);
  started.respond({ type: 'ready' });
  const session = await started.sessionPromise;
  vi.mocked(started.worker.postMessage).mockClear();

  return { ...started, session };
}

function posted(worker: Worker) {
  return vi.mocked(worker.postMessage).mock.calls;
}

function createBitmap() {
  return { close: vi.fn() } as unknown as ImageBitmap;
}

const video = { readyState: 2, HAVE_CURRENT_DATA: 2 } as HTMLVideoElement;

describe('WebGpuSessionAdapter', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('transfers the canvas once and resolves when the worker reports ready', async () => {
    const onReady = vi.fn();
    const logger = createLogger();
    const { sessionPromise, worker, respond, transferControlToOffscreen } = startSession({
      presetId: 'unknown',
      brightness: 1.4,
      onReady,
      logger
    });

    respond({ type: 'ready' });
    const session = await sessionPromise;

    expect(transferControlToOffscreen).toHaveBeenCalledTimes(1);
    const offscreenCanvas = transferControlToOffscreen.mock.results[0].value;
    expect(posted(worker)).toEqual([[
      {
        type: 'init',
        canvas: offscreenCanvas,
        config: {
          nativeWidth: 160,
          nativeHeight: 144,
          targetWidth: 480,
          targetHeight: 432,
          presetId: 'vibrant',
          brightness: 1.4
        }
      },
      [offscreenCanvas]
    ]]);
    expect(onReady).toHaveBeenCalledWith({ backend: 'webgpu' });
    expect(logger.info).toHaveBeenCalledWith('Render worker ready (backend: webgpu)');
    expect(session.backend).toBe('webgpu');
    expect(session.isActive).toBe(true);
    expect(session.isCanvasTransferred).toBe(true);
  });

  it('defaults brightness to 1 and targets the native size for an unsized canvas', async () => {
    const worker = createWorkerMock();
    const sessionPromise = WebGpuSessionAdapter.create({
      canvas: Object.assign(createMockCanvas(), { clientWidth: 0, clientHeight: 0 }) as unknown as HTMLCanvasElement,
      nativeResolution: { width: 160, height: 144 },
      createWorker: () => worker,
      logger: createLogger()
    });
    worker.onmessage?.({ data: { type: 'ready' } } as MessageEvent);
    const session = await sessionPromise;

    expect(posted(worker)[0][0]).toEqual(expect.objectContaining({
      config: expect.objectContaining({ targetWidth: 160, targetHeight: 144, brightness: 1 })
    }));
    expect(session.getTargetDimensions()).toEqual({ width: 160, height: 144 });
  });

  it('times out initialization after 5000 ms, reports INIT_FAILED and terminates the worker', async () => {
    vi.useFakeTimers();
    const logger = createLogger();
    const onError = vi.fn();
    const { sessionPromise, worker } = startSession({ logger, onError });
    const expectation = expect(sessionPromise).rejects.toThrow('Worker initialization timed out');

    await vi.advanceTimersByTimeAsync(4999);
    expect(worker.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    await expectation;
    expect(logger.error).toHaveBeenCalledWith('Failed to initialize worker renderer:', expect.any(Error));
    expect(onError).toHaveBeenCalledWith({ message: 'Worker initialization timed out', code: 'INIT_FAILED' });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(worker.onmessage).toBeNull();
  });

  it('rejects initialization with the message of a worker error response', async () => {
    const onError = vi.fn();
    const { sessionPromise, respond } = startSession({ onError });

    respond({ type: 'error', message: 'WebGPU adapter not available' });

    await expect(sessionPromise).rejects.toThrow('WebGPU adapter not available');
    expect(onError.mock.calls).toEqual([
      [{ message: 'WebGPU adapter not available' }],
      [{ message: 'WebGPU adapter not available', code: 'INIT_FAILED' }]
    ]);
  });

  it('resolves when the worker answers ready synchronously while init is posted', async () => {
    const worker = createWorkerMock();
    vi.mocked(worker.postMessage).mockImplementation(() => {
      worker.onmessage?.({ data: { type: 'ready' } } as MessageEvent);
    });

    const session = await WebGpuSessionAdapter.create({
      canvas: Object.assign(createMockCanvas(), { clientWidth: 480, clientHeight: 432 }) as unknown as HTMLCanvasElement,
      nativeResolution: { width: 160, height: 144 },
      createWorker: () => worker,
      logger: createLogger()
    });

    expect(session.isActive).toBe(true);
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it('rejects initialization when the worker itself fails', async () => {
    const { sessionPromise, worker } = startSession();

    worker.onerror?.({ message: 'Worker script failed' } as ErrorEvent);

    await expect(sessionPromise).rejects.toThrow('Worker script failed');
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('posts frames with the bitmap transferred and keeps at most two in flight', async () => {
    const bitmaps = [createBitmap(), createBitmap(), createBitmap()];
    const createImageBitmap = vi.fn(async () => bitmaps[createImageBitmap.mock.calls.length - 1]);
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    const { session, worker, respond } = await createReadySession();

    await session.renderFrame(video);
    await session.renderFrame(video);
    await session.renderFrame(video);
    expect(posted(worker)).toEqual([
      [{ type: 'frame', bitmap: bitmaps[0] }, [bitmaps[0]]],
      [{ type: 'frame', bitmap: bitmaps[1] }, [bitmaps[1]]]
    ]);

    respond({ type: 'frameRendered' });
    await session.renderFrame(video);

    expect(posted(worker)[2]).toEqual([{ type: 'frame', bitmap: bitmaps[2] }, [bitmaps[2]]]);
    expect(createImageBitmap).toHaveBeenCalledWith(video, {
      resizeWidth: 160,
      resizeHeight: 144,
      resizeQuality: 'medium',
      colorSpaceConversion: 'none'
    });
  });

  it('skips frames while the video has no current data', async () => {
    const createImageBitmap = vi.fn();
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    const { session, worker } = await createReadySession();

    await session.renderFrame({ readyState: 1, HAVE_CURRENT_DATA: 2 } as HTMLVideoElement);

    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(worker.postMessage).not.toHaveBeenCalled();
  });

  it('closes a frame that could not be posted because the worker failed meanwhile', async () => {
    const bitmap = createBitmap();
    let resolveBitmap: (value: ImageBitmap) => void = () => undefined;
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise((resolve) => {
      resolveBitmap = resolve;
    })));
    const { session, worker, respond } = await createReadySession();

    const rendering = session.renderFrame(video);
    respond({ type: 'error', message: 'render failed' });
    resolveBitmap(bitmap);
    await rendering;

    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).not.toHaveBeenCalled();
  });

  it('forwards brightness and resolved preset ids to the worker', async () => {
    const { session, worker } = await createReadySession();

    session.setBrightness(1.2);
    session.setPreset('missing-preset');
    session.setPreset('pixel');

    expect(posted(worker).map(([request]) => request)).toEqual([
      { type: 'setBrightness', brightness: 1.2 },
      { type: 'setPreset', presetId: 'vibrant' },
      { type: 'setPreset', presetId: 'pixel' }
    ]);
  });

  it('reports scaled target dimensions and resizes the worker to them', async () => {
    const { session, worker } = await createReadySession();

    session.resize(700, 600);

    expect(session.getTargetDimensions()).toEqual({ width: 640, height: 576 });
    expect(posted(worker)).toEqual([[{ type: 'resize', width: 640, height: 576 }, []]]);
  });

  it('resolves a capture with the bitmap the worker sends back', async () => {
    const { session, worker, respond } = await createReadySession();
    const captured = createBitmap();

    const capturePromise = session.captureFrame();
    await expect(session.captureFrame()).rejects.toThrow('Capture already in progress');
    expect(posted(worker)).toEqual([[{ type: 'capture' }, []]]);

    respond({ type: 'captured', bitmap: captured });

    await expect(capturePromise).resolves.toBe(captured);
  });

  it('rejects a capture the worker does not answer within one second', async () => {
    const { session } = await createReadySession();
    vi.useFakeTimers();

    const capturePromise = session.captureFrame();
    const expectation = expect(capturePromise).rejects.toThrow('Capture request timed out');
    await vi.advanceTimersByTimeAsync(1000);

    await expectation;
  });

  it('closes a captured bitmap that arrives after its capture timed out', async () => {
    const { session, respond } = await createReadySession();
    vi.useFakeTimers();
    const late = createBitmap();

    const expectation = expect(session.captureFrame()).rejects.toThrow('Capture request timed out');
    await vi.advanceTimersByTimeAsync(1000);
    await expectation;
    respond({ type: 'captured', bitmap: late });

    expect(late.close).toHaveBeenCalledTimes(1);
  });

  it('rejects a pending capture, reports the message and stops sending after a worker error', async () => {
    const onError = vi.fn();
    const logger = createLogger();
    const createImageBitmap = vi.fn();
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    const { session, worker, respond } = await createReadySession({ onError, logger });

    const capturePromise = session.captureFrame();
    respond({ type: 'error', message: 'render failed' });

    await expect(capturePromise).rejects.toThrow('render failed');
    expect(onError).toHaveBeenCalledWith({ message: 'render failed' });
    expect(logger.error).toHaveBeenCalledWith('Render worker error:', 'render failed');

    vi.mocked(worker.postMessage).mockClear();
    await session.renderFrame(video);
    session.resize(700, 600);
    session.setPreset('pixel');
    session.setBrightness(0.5);

    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(worker.postMessage).not.toHaveBeenCalled();
    await expect(session.captureFrame()).rejects.toThrow('Worker renderer client not ready');
  });

  it('terminates the worker without posting, rejecting a pending capture', async () => {
    const { session, worker } = await createReadySession();
    const capturePromise = session.captureFrame();
    vi.mocked(worker.postMessage).mockClear();

    session.terminate();

    await expect(capturePromise).rejects.toThrow('Session terminated');
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(worker.onmessage).toBeNull();
    expect(session.isActive).toBe(false);
    await expect(session.captureFrame()).rejects.toThrow('Session is not active');
  });

  it('invokes onCanvasExpired only when terminate requests it', async () => {
    const onCanvasExpired = vi.fn();
    const { session, worker } = await createReadySession({ onCanvasExpired });

    session.terminate();
    expect(onCanvasExpired).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledTimes(1);

    session.terminate({ emitCanvasExpired: true });
    expect(onCanvasExpired).toHaveBeenCalledTimes(1);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});
