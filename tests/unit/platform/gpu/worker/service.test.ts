import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Comlink from 'comlink';
import { startWorkerRendererService } from '../../../../../src/platform/gpu/worker/runtime';
import {
  CANVAS_HANDOFF_MESSAGE,
  CONTROL_PORT_MESSAGE,
  WorkerMessageType,
  WorkerResponseType,
  createWorkerMessage,
  type WorkerControlApi
} from '../../../../../src/platform/gpu/worker/protocol';
import { FakeWorker, flush, type WorkerServiceScope } from './golden-harness';

const defaultPreset = {
  id: 'vibrant',
  name: 'Vibrant',
  description: 'Brightened color and contrast',
  unsharp: {
    enabled: false,
    strength: 0,
    radius: 1.0,
    threshold: 0.2
  },
  color: {
    enabled: true,
    gamma: 1.0,
    saturation: 1.0,
    greenBias: 0,
    brightness: 1.4,
    contrast: 1.0
  },
  crt: {
    enabled: false,
    scanlineStrength: 0,
    pixelMaskStrength: 0,
    bloomStrength: 0,
    curvature: 0,
    vignetteStrength: 0
  }
};

const validUniforms = {
  upscale: {
    inputSize: [160, 144],
    outputSize: [640, 576],
    scaleFactor: 4
  },
  unsharp: {
    enabled: false,
    texelSize: [0.003125, 0.0034722],
    strength: 0,
    scaleFactor: 4
  },
  color: {
    enabled: true,
    gamma: 1,
    saturation: 1,
    greenBias: 0,
    brightness: 2.0,
    contrast: 1
  },
  crt: {
    enabled: false,
    resolution: [640, 576],
    scaleFactor: 4,
    scanlineStrength: 0,
    pixelMaskStrength: 0,
    bloomStrength: 0,
    curvature: 0,
    vignetteStrength: 0
  }
};

const { mockCreateGpuRenderer, mockResolvePreset } = vi.hoisted(() => {
  return {
    mockCreateGpuRenderer: vi.fn(),
    mockResolvePreset: vi.fn()
  };
});

const mockRenderer = {
  backend: 'webgpu',
  renderFrame: vi.fn(),
  resize: vi.fn(),
  captureFrame: vi.fn(),
  getStats: vi.fn(),
  dispose: vi.fn(),
  setPreset: vi.fn(),
  setBrightness: vi.fn()
};

vi.mock('../../../../../src/platform/gpu/application/renderer.service', () => ({
  createGpuRenderer: mockCreateGpuRenderer
}));

vi.mock('../../../../../src/platform/gpu/application/catalog', () => ({
  resolvePreset: mockResolvePreset
}));

/**
 * Starts the service against a {@link FakeWorker} and wraps the announced
 * control MessagePort with a comlink `Remote`, mirroring how the real
 * `WorkerRendererClient` obtains `WorkerControlApi`. Every raw message the
 * service posts (the control-port handoff plus the frame-plane FRAME_RENDERED
 * and STATS responses) is retained in `postedMessages` for assertions.
 */
async function startService(): Promise<{
  worker: FakeWorker;
  proxy: Comlink.Remote<WorkerControlApi>;
  postedMessages: unknown[];
}> {
  const worker = new FakeWorker();
  const postedMessages: unknown[] = [];
  let proxy!: Comlink.Remote<WorkerControlApi>;
  worker.onmessage = (event) => {
    postedMessages.push(event.data);
    const data = event.data as { channel?: string; port?: MessagePort };
    if (data?.channel === CONTROL_PORT_MESSAGE && data.port) {
      proxy = Comlink.wrap<WorkerControlApi>(data.port);
    }
  };
  startWorkerRendererService(worker.scope as unknown as WorkerServiceScope);
  await flush();
  return { worker, proxy, postedMessages };
}

async function handOffCanvas(worker: FakeWorker, canvas: OffscreenCanvas): Promise<void> {
  worker.postMessage({ channel: CANVAS_HANDOFF_MESSAGE, canvas });
  await flush();
}

async function sendFrame(worker: FakeWorker, imageBitmap: ImageBitmap): Promise<void> {
  worker.postMessage(createWorkerMessage(WorkerMessageType.FRAME, { imageBitmap }));
  await flush();
}

function configPayload() {
  return {
    nativeWidth: 160,
    nativeHeight: 144,
    targetWidth: 640,
    targetHeight: 576,
    scaleFactor: 4,
    backend: 'webgpu' as const,
    presetId: 'vibrant'
  };
}

function createBitmap(id = 'frame') {
  return {
    id,
    close: vi.fn()
  } as unknown as ImageBitmap;
}

function createOnePixelCanvasFixture() {
  return {
    width: 1,
    height: 1,
    getContext: vi.fn()
  } as unknown as OffscreenCanvas;
}

describe('worker service', () => {
  beforeEach(() => {
    mockCreateGpuRenderer.mockResolvedValue(mockRenderer);
    mockResolvePreset.mockReturnValue(defaultPreset);
    mockRenderer.captureFrame.mockResolvedValue(createBitmap('captured'));
    mockRenderer.getStats.mockReturnValue({
      fps: 999,
      frameTime: 1,
      framesRendered: 999,
      framesDropped: 0
    });
    mockRenderer.dispose.mockResolvedValue(undefined);
  });

  it('initializes through createGpuRenderer and reports the actual initialized backend', async () => {
    const { worker, proxy } = await startService();
    const offscreenCanvas = createOnePixelCanvasFixture();
    await handOffCanvas(worker, offscreenCanvas);

    const ready = await proxy.initialize(configPayload());

    expect(mockCreateGpuRenderer).toHaveBeenCalledWith(expect.objectContaining({
      canvas: offscreenCanvas,
      preferredBackend: 'webgpu',
      nativeWidth: 160,
      nativeHeight: 144,
      allowCanvas2D: false,
      preset: defaultPreset
    }));
    expect(offscreenCanvas.width).toBe(640);
    expect(offscreenCanvas.height).toBe(576);
    expect(ready).toMatchObject({ backend: 'webgpu' });
  });

  it('forwards frame rendering and posts FRAME_RENDERED', async () => {
    const { worker, proxy, postedMessages } = await startService();
    await handOffCanvas(worker, createOnePixelCanvasFixture());
    await proxy.initialize(configPayload());

    const frameBitmap = createBitmap();
    await sendFrame(worker, frameBitmap);

    expect(mockRenderer.renderFrame).toHaveBeenCalledWith(frameBitmap);
    expect(postedMessages.at(-1)).toMatchObject({ type: WorkerResponseType.FRAME_RENDERED });
    expect((postedMessages.at(-1) as { payload?: unknown }).payload).toBeUndefined();
  });

  it('reports interval fps from worker-rendered frames instead of renderer instantaneous fps', async () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const { worker, proxy, postedMessages } = await startService();

    await handOffCanvas(worker, createOnePixelCanvasFixture());
    await proxy.initialize(configPayload());

    now = 100;
    await sendFrame(worker, createBitmap('frame-1'));

    now = 1100;
    await sendFrame(worker, createBitmap('frame-2'));

    const statsMessage = postedMessages.find(
      (entry) => (entry as { type?: string })?.type === WorkerResponseType.STATS
    );
    expect(statsMessage).toMatchObject({
      type: WorkerResponseType.STATS,
      payload: {
        fps: 2,
        frameTime: 0,
        gpuTime: undefined,
        uploadTime: undefined
      }
    });
  });

  it('posts STATS carrying fps, frameTime, gpuTime, and uploadTime from the driver getStats()', async () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const statsRenderer = {
      backend: 'webgpu',
      renderFrame: vi.fn(),
      resize: vi.fn(),
      captureFrame: vi.fn(),
      getStats: vi.fn(() => ({ fps: 60, frameTime: 16.6, gpuTime: 4.2, uploadTime: 1.8 })),
      dispose: vi.fn().mockResolvedValue(undefined),
      setPreset: vi.fn(),
      setBrightness: vi.fn()
    };
    mockCreateGpuRenderer.mockResolvedValueOnce(statsRenderer);

    const { worker, proxy, postedMessages } = await startService();
    await handOffCanvas(worker, createOnePixelCanvasFixture());
    await proxy.initialize(configPayload());

    now = 1000;
    await sendFrame(worker, createBitmap('stats-frame'));

    const statsMessage = postedMessages.find(
      (entry) => (entry as { type?: string })?.type === WorkerResponseType.STATS
    );
    expect(statsMessage).toMatchObject({
      type: WorkerResponseType.STATS,
      payload: {
        fps: 1,
        frameTime: 0,
        gpuTime: 4.2,
        uploadTime: 1.8
      }
    });
  });

  it('routes capture requests through renderer captureFrame', async () => {
    const { worker, proxy } = await startService();
    const queuedFrame = new Uint8Array([9, 8, 7, 6]).buffer;
    mockRenderer.captureFrame.mockResolvedValueOnce(queuedFrame);

    await handOffCanvas(worker, createOnePixelCanvasFixture());
    await proxy.initialize(configPayload());
    await proxy.requestCapture();
    await sendFrame(worker, createBitmap());

    const captured = await proxy.getCapturedFrame();

    expect(mockRenderer.captureFrame).toHaveBeenCalledTimes(1);
    expect(Array.from(new Uint8Array(captured.bitmap as unknown as ArrayBuffer))).toEqual([9, 8, 7, 6]);
  });

  it('releases and destroys worker renderer', async () => {
    const { worker, proxy } = await startService();
    const closeSpy = vi.spyOn(worker.scope, 'close');
    await handOffCanvas(worker, createOnePixelCanvasFixture());
    await proxy.initialize(configPayload());

    await proxy.release();
    expect(mockRenderer.dispose).toHaveBeenCalled();

    await proxy.destroy();
    expect(closeSpy).toHaveBeenCalled();
  });
});
