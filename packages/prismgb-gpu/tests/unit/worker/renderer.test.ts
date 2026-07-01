import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installWorkerRenderer, type WorkerScopeLike } from '@/worker/renderer';
import { createWorkerMessage, WorkerMessageType, WorkerResponseType } from '@/worker/protocol';

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

const { mockCreateWorkerPipeline, mockResolvePreset } = vi.hoisted(() => {
  return {
    mockCreateWorkerPipeline: vi.fn(),
    mockResolvePreset: vi.fn()
  };
});

const mockPipeline = {
  backend: 'webgl2',
  render: vi.fn(),
  resize: vi.fn(),
  captureFrame: vi.fn(),
  getStats: vi.fn(),
  dispose: vi.fn(),
  setPreset: vi.fn(),
  setBrightness: vi.fn()
};

vi.mock('@/worker/pipeline', () => ({
  createWorkerPipeline: mockCreateWorkerPipeline
}));

vi.mock('@/application/preset-catalog', () => ({
  resolvePreset: mockResolvePreset
}));

function createWorkerScopeHarness() {
  const postedMessages: Array<[unknown, Transferable[]?]> = [];
  const scope: WorkerScopeLike = {
    onmessage: null,
    postMessage: vi.fn((message, transfer) => {
      postedMessages.push([message, transfer]);
    }),
    close: vi.fn()
  };

  installWorkerRenderer(scope);

  return {
    scope,
    postedMessages,
    closeMock: scope.close
  };
}

async function sendWorkerMessage(scope: WorkerScopeLike, message: unknown): Promise<void> {
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

describe('worker renderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateWorkerPipeline.mockResolvedValue(mockPipeline);
    mockResolvePreset.mockReturnValue(defaultPreset);
    mockPipeline.captureFrame.mockResolvedValue(createBitmap('captured'));
    mockPipeline.getStats.mockReturnValue({
      fps: 999,
      frameTime: 1,
      framesRendered: 999,
      framesDropped: 0
    });
    mockPipeline.dispose.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('initializes through createWorkerPipeline and reports the actual initialized backend', async () => {
    const harness = createWorkerScopeHarness();
    const offscreenCanvas = createOnePixelCanvasFixture();

    await sendWorkerMessage(
      harness.scope,
      createWorkerMessage(WorkerMessageType.INIT, {
        canvas: offscreenCanvas,
        config: configPayload()
      })
    );

    expect(mockCreateWorkerPipeline).toHaveBeenCalledWith({
      canvas: offscreenCanvas,
      backend: 'webgpu',
      nativeSize: [160, 144],
      outputSize: [640, 576],
      preset: defaultPreset
    });
    expect(harness.postedMessages.at(-1)?.[0]).toMatchObject({
      type: WorkerResponseType.READY,
      payload: { backend: 'webgl2' }
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
        imageBitmap: frameBitmap,
        uniforms: validUniforms
      })
    );

    expect(mockPipeline.render).toHaveBeenCalledWith(frameBitmap);
    expect(mockPipeline.setBrightness).toHaveBeenCalled();
    expect(harness.postedMessages.at(-1)?.[0]).toMatchObject({
      type: WorkerResponseType.FRAME_RENDERED
    });
  });

  it('reports interval fps from worker-rendered frames instead of pipeline instantaneous fps', async () => {
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
        imageBitmap: createBitmap('frame-1'),
        uniforms: validUniforms
      })
    );

    now = 1100;
    await sendWorkerMessage(
      harness.scope,
      createWorkerMessage(WorkerMessageType.FRAME, {
        imageBitmap: createBitmap('frame-2'),
        uniforms: validUniforms
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

  it('updates pipeline preset from set-preset command', async () => {
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
        preset: customPreset
      })
    );

    expect(mockPipeline.setPreset).toHaveBeenCalledWith(customPreset);
  });

  it('routes capture requests through pipeline captureFrame', async () => {
    const harness = createWorkerScopeHarness();
    const queuedFrame = createBitmap('queued');
    mockPipeline.captureFrame.mockResolvedValueOnce(queuedFrame);

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
        imageBitmap: createBitmap(),
        uniforms: validUniforms
      })
    );

    await sendWorkerMessage(
      harness.scope,
      createWorkerMessage(WorkerMessageType.CAPTURE)
    );

    expect(mockPipeline.captureFrame).toHaveBeenCalledTimes(1);
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
    expect(mockPipeline.dispose).toHaveBeenCalled();
    expect(harness.postedMessages.at(-1)?.[0]).toMatchObject({ type: WorkerResponseType.RELEASED });

    await sendWorkerMessage(harness.scope, createWorkerMessage(WorkerMessageType.DESTROY));
    expect(harness.postedMessages.at(-1)?.[0]).toMatchObject({ type: WorkerResponseType.DESTROYED });
    expect(harness.closeMock).toHaveBeenCalled();
  });
});
