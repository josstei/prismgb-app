import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startWorkerRendererService, type WorkerRendererServiceScope } from '../../../../../src/platform/gpu/worker/service';
import { createWorkerMessage, WorkerMessageType, WorkerResponseType } from '../../../../../src/platform/gpu/worker/protocol';
import type { RenderPreset } from '../../../../../src/platform/gpu/domain/types';

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

function createWorkerScopeHarness() {
  const postedMessages: Array<[unknown, Transferable[]?]> = [];
  const scope: WorkerRendererServiceScope = {
    onmessage: null,
    postMessage: vi.fn((message, transfer) => {
      postedMessages.push([message, transfer]);
    }),
    close: vi.fn()
  };

  startWorkerRendererService(scope);

  return {
    scope,
    postedMessages,
    closeMock: scope.close
  };
}

async function sendWorkerMessage(scope: WorkerRendererServiceScope, message: unknown): Promise<void> {
  const result = scope.onmessage?.({ data: message } as MessageEvent<unknown>);
  if (result && typeof result.then === 'function') {
    await result;
  }
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
    vi.clearAllMocks();
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

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('initializes through createGpuRenderer and reports the actual initialized backend', async () => {
    const harness = createWorkerScopeHarness();
    const offscreenCanvas = createOnePixelCanvasFixture();

    await sendWorkerMessage(
      harness.scope,
      createWorkerMessage(WorkerMessageType.INIT, {
        canvas: offscreenCanvas,
        config: configPayload()
      })
    );

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
    expect(harness.postedMessages.at(-1)?.[0]).toMatchObject({
      type: WorkerResponseType.READY,
      payload: { backend: 'webgpu' }
    });
  });

  it('forwards frame rendering and posts FRAME_RENDERED', async () => {
    const harness = createWorkerScopeHarness();

    await sendWorkerMessage(
      harness.scope,
      createWorkerMessage(WorkerMessageType.INIT, {
        canvas: createOnePixelCanvasFixture(),
        config: configPayload()
      })
    );

    const frameBitmap = createBitmap();
    await sendWorkerMessage(
      harness.scope,
      createWorkerMessage(WorkerMessageType.FRAME, {
        imageBitmap: frameBitmap
      })
    );

    expect(mockRenderer.renderFrame).toHaveBeenCalledWith(frameBitmap);
    expect(harness.postedMessages.at(-1)?.[0]).toMatchObject({
      type: WorkerResponseType.FRAME_RENDERED
    });
  });

  it('handles setBrightness command', async () => {
    const harness = createWorkerScopeHarness();

    await sendWorkerMessage(
      harness.scope,
      createWorkerMessage(WorkerMessageType.INIT, {
        canvas: createOnePixelCanvasFixture(),
        config: configPayload()
      })
    );

    await sendWorkerMessage(
      harness.scope,
      createWorkerMessage(WorkerMessageType.SET_BRIGHTNESS, {
        brightness: 1.5
      })
    );

    expect(mockRenderer.setBrightness).toHaveBeenCalledWith(1.5);
  });

  it('reports interval fps from worker-rendered frames instead of renderer instantaneous fps', async () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const harness = createWorkerScopeHarness();

    await sendWorkerMessage(
      harness.scope,
      createWorkerMessage(WorkerMessageType.INIT, {
        canvas: createOnePixelCanvasFixture(),
        config: configPayload()
      })
    );

    now = 100;
    await sendWorkerMessage(
      harness.scope,
      createWorkerMessage(WorkerMessageType.FRAME, {
        imageBitmap: createBitmap('frame-1')
      })
    );

    now = 1100;
    await sendWorkerMessage(
      harness.scope,
      createWorkerMessage(WorkerMessageType.FRAME, {
        imageBitmap: createBitmap('frame-2')
      })
    );

    const statsMessage = harness.postedMessages.find(
      (entry) => (entry[0] as { type?: string })?.type === WorkerResponseType.STATS
    );
    expect(statsMessage?.[0]).toMatchObject({
      type: WorkerResponseType.STATS,
      payload: {
        fps: 2,
        frameTime: 0,
        gpuTime: undefined,
        uploadTime: undefined
      }
    });
  });

  it('updates renderer preset from set-preset command', async () => {
    const harness = createWorkerScopeHarness();
    const customPreset = {
      ...defaultPreset,
      id: 'authentic'
    };

    await sendWorkerMessage(
      harness.scope,
      createWorkerMessage(WorkerMessageType.INIT, {
        canvas: createOnePixelCanvasFixture(),
        config: configPayload()
      })
    );
    await sendWorkerMessage(
      harness.scope,
      createWorkerMessage(WorkerMessageType.SET_PRESET, {
        presetId: 'authentic',
        preset: customPreset as unknown as RenderPreset
      })
    );

    expect(mockRenderer.setPreset).toHaveBeenCalledWith(customPreset);
  });

  it('routes capture requests through renderer captureFrame', async () => {
    const harness = createWorkerScopeHarness();
    const queuedFrame = createBitmap('queued');
    mockRenderer.captureFrame.mockResolvedValueOnce(queuedFrame);

    await sendWorkerMessage(
      harness.scope,
      createWorkerMessage(WorkerMessageType.INIT, {
        canvas: createOnePixelCanvasFixture(),
        config: configPayload()
      })
    );
    await sendWorkerMessage(
      harness.scope,
      createWorkerMessage(WorkerMessageType.REQUEST_CAPTURE)
    );
    await sendWorkerMessage(
      harness.scope,
      createWorkerMessage(WorkerMessageType.FRAME, {
        imageBitmap: createBitmap()
      })
    );

    await sendWorkerMessage(
      harness.scope,
      createWorkerMessage(WorkerMessageType.CAPTURE)
    );

    expect(mockRenderer.captureFrame).toHaveBeenCalledTimes(1);
    const captureMessage = harness.postedMessages.find(
      (entry) => (entry[0] as { type?: string })?.type === WorkerResponseType.CAPTURE_READY
    );
    expect(captureMessage?.[0]).toMatchObject({
      type: WorkerResponseType.CAPTURE_READY,
      payload: { bitmap: queuedFrame }
    });
  });

  it('releases and destroys worker renderer', async () => {
    const harness = createWorkerScopeHarness();
    await sendWorkerMessage(
      harness.scope,
      createWorkerMessage(WorkerMessageType.INIT, {
        canvas: createOnePixelCanvasFixture(),
        config: configPayload()
      })
    );

    await sendWorkerMessage(harness.scope, createWorkerMessage(WorkerMessageType.RELEASE));
    expect(mockRenderer.dispose).toHaveBeenCalled();
    expect(harness.postedMessages.at(-1)?.[0]).toMatchObject({ type: WorkerResponseType.RELEASED });

    await sendWorkerMessage(harness.scope, createWorkerMessage(WorkerMessageType.DESTROY));
    expect(harness.postedMessages.at(-1)?.[0]).toMatchObject({ type: WorkerResponseType.DESTROYED });
    expect(harness.closeMock).toHaveBeenCalled();
  });
});
