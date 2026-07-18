import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGpuVideoRendererSession } from '../../../../../src/platform/gpu/application/video-session';
import { createMockCanvas, createRenderCapabilitiesFixture } from '@platform/gpu/testkit';
import { WorkerResponseType, createWorkerResponse } from '../../../../../src/platform/gpu/worker/protocol';

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

describe('GpuVideoRendererSession', () => {
  beforeEach(() => {
    vi.stubGlobal('performance', {
      now: vi.fn(() => 0)
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('creates WebGPU session when webgpu is available', async () => {
    const canvas = createMockCanvas() as unknown as HTMLCanvasElement;
    const worker = createWorkerMock();

    const sessionPromise = createGpuVideoRendererSession({
      canvas,
      nativeResolution: { width: 160, height: 144 },
      preferredBackend: 'webgpu',
      createWorker: () => worker,
      capabilities: createRenderCapabilitiesFixture({
        webgpu: true,
        offscreenCanvas: true,
        transferControlToOffscreen: true,
        preferredBackend: 'webgpu'
      })
    });

    setTimeout(() => {
      worker.onmessage?.({
        data: createWorkerResponse(WorkerResponseType.READY, { backend: 'webgpu' })
      } as MessageEvent);
    }, 10);

    const session = await sessionPromise;
    expect(session.backend).toBe('webgpu');
    expect(session.isCanvasTransferred).toBe(true);

    session.setBrightness(1.2);
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'setBrightness',
        payload: { brightness: 1.2 }
      })
    );

    session.terminate();
  });

  it('invokes onCanvasExpired only when terminate requests it', async () => {
    const canvas = createMockCanvas() as unknown as HTMLCanvasElement;
    const worker = createWorkerMock();
    const onCanvasExpired = vi.fn();

    const sessionPromise = createGpuVideoRendererSession({
      canvas,
      nativeResolution: { width: 160, height: 144 },
      preferredBackend: 'webgpu',
      createWorker: () => worker,
      onCanvasExpired,
      capabilities: createRenderCapabilitiesFixture({
        webgpu: true,
        offscreenCanvas: true,
        transferControlToOffscreen: true,
        preferredBackend: 'webgpu'
      })
    });

    setTimeout(() => {
      worker.onmessage?.({
        data: createWorkerResponse(WorkerResponseType.READY, { backend: 'webgpu' })
      } as MessageEvent);
    }, 10);

    const session = await sessionPromise;

    session.terminate();
    expect(onCanvasExpired).not.toHaveBeenCalled();

    session.terminate({ emitCanvasExpired: true });
    expect(onCanvasExpired).toHaveBeenCalledTimes(1);
  });

  it('reports scaled target dimensions (not a hardcoded native width)', async () => {
    const canvas = createMockCanvas() as unknown as HTMLCanvasElement;
    const worker = createWorkerMock();

    const sessionPromise = createGpuVideoRendererSession({
      canvas,
      nativeResolution: { width: 160, height: 144 },
      preferredBackend: 'webgpu',
      createWorker: () => worker,
      capabilities: createRenderCapabilitiesFixture({
        webgpu: true,
        offscreenCanvas: true,
        transferControlToOffscreen: true,
        preferredBackend: 'webgpu'
      })
    });

    setTimeout(() => {
      worker.onmessage?.({
        data: createWorkerResponse(WorkerResponseType.READY, { backend: 'webgpu' })
      } as MessageEvent);
    }, 10);

    const session = await sessionPromise;

    session.resize(640, 576);
    expect(session.getTargetDimensions()).toEqual({ width: 640, height: 576 });

    session.terminate();
  });
});
