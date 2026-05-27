import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkerMessage, WorkerMessageType, WorkerResponseType } from '@renderer/infrastructure/rendering/workers/worker-protocol.config';
import { installWorkerScopeMock } from '../../../../../support/mocks/browser-api.installers.js';
import { createWorkerPipelineMock } from '../../../../../factories/index.js';

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

const mockPipeline = createWorkerPipelineMock();

const mockCreateWorkerPipeline = vi.fn(async () => mockPipeline);
const mockPresetGet = vi.fn(() => defaultPreset);
const mockPresetGetDefault = vi.fn(() => defaultPreset);
const workerScopeMocks = [];

vi.mock('@prismgb/gpu', async () => {
  const actual = await vi.importActual('@prismgb/gpu');
  return {
    ...actual,
    createWorkerPipeline: mockCreateWorkerPipeline,
    PresetRegistry: {
      get: mockPresetGet,
      getDefault: mockPresetGetDefault
    }
  };
});

async function loadWorkerHarness() {
  vi.resetModules();

  const workerScopeMock = installWorkerScopeMock();
  workerScopeMocks.push(workerScopeMock);

  await import('@renderer/infrastructure/rendering/workers/render.worker.ts');

  return {
    scope: workerScopeMock.scope,
    postedMessages: workerScopeMock.postedMessages,
    closeMock: workerScopeMock.close
  };
}

async function sendWorkerMessage(scope, message) {
  const result = scope.onmessage({ data: message });
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
    api: 'webgpu',
    presetId: 'vibrant'
  };
}

function createBitmap(id = 'frame') {
  return {
    id,
    close: vi.fn()
  };
}

describe('render worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    while (workerScopeMocks.length > 0) {
      workerScopeMocks.pop().cleanup();
    }
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('initializes through createWorkerPipeline and keeps protocol READY payload stable', async () => {
    const harness = await loadWorkerHarness();
    const offscreenCanvas = {
      width: 1,
      height: 1
    };

    mockPresetGet.mockReturnValue(defaultPreset);

    await sendWorkerMessage(
      harness.scope,
      createWorkerMessage(WorkerMessageType.INIT, {
        canvas: offscreenCanvas,
        config: configPayload()
      })
    );

    expect(mockCreateWorkerPipeline).toHaveBeenCalledWith({
      canvas: offscreenCanvas,
      api: 'webgpu',
      nativeSize: [160, 144],
      outputSize: [640, 576],
      preset: defaultPreset
    });
    const readyMessage = harness.postedMessages.at(-1);
    expect(readyMessage[0]).toMatchObject({
      type: WorkerResponseType.READY,
      payload: { api: 'webgpu' }
    });
  });

  it('forwards frame rendering and posts FRAME_RENDERED', async () => {
    const harness = await loadWorkerHarness();

    await sendWorkerMessage(
      harness.scope,
      createWorkerMessage(WorkerMessageType.INIT, {
        canvas: { width: 1, height: 1 },
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
    expect(harness.postedMessages.at(-1)[0]).toMatchObject({
      type: WorkerResponseType.FRAME_RENDERED
    });
  });

  it('reports interval fps from worker-rendered frames instead of pipeline instantaneous fps', async () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    mockPipeline.getStats.mockReturnValueOnce({
      fps: 999,
      frameTime: 1,
      framesRendered: 999,
      framesDropped: 0
    });

    const harness = await loadWorkerHarness();

    await sendWorkerMessage(
      harness.scope,
      createWorkerMessage(WorkerMessageType.INIT, {
        canvas: { width: 1, height: 1 },
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
      (entry) => entry[0]?.type === WorkerResponseType.STATS
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
    const harness = await loadWorkerHarness();
    const customPreset = {
      ...defaultPreset,
      id: 'authentic'
    };

    await sendWorkerMessage(
      harness.scope,
      createWorkerMessage(WorkerMessageType.INIT, {
        canvas: { width: 1, height: 1 },
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
    const harness = await loadWorkerHarness();
    const queuedFrame = { id: 'queued', close: vi.fn() };
    mockPipeline.captureFrame.mockResolvedValueOnce(queuedFrame);

    await sendWorkerMessage(
      harness.scope,
      createWorkerMessage(WorkerMessageType.INIT, {
        canvas: { width: 1, height: 1 },
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

    expect(mockPipeline.captureFrame).toHaveBeenCalled();
    expect(mockPipeline.captureFrame).toHaveBeenCalledTimes(1);
    const captureMessage = harness.postedMessages.find(
      (entry) => entry[0]?.type === WorkerResponseType.CAPTURE_READY
    );
    expect(captureMessage?.[0]).toMatchObject({
      type: WorkerResponseType.CAPTURE_READY,
      payload: { bitmap: queuedFrame }
    });
  });

  it('releases and destroys worker renderer', async () => {
    const harness = await loadWorkerHarness();
    await sendWorkerMessage(
      harness.scope,
      createWorkerMessage(WorkerMessageType.INIT, {
        canvas: { width: 1, height: 1 },
        config: configPayload()
      })
    );

    await sendWorkerMessage(harness.scope, createWorkerMessage(WorkerMessageType.RELEASE));
    expect(mockPipeline.dispose).toHaveBeenCalled();
    expect(harness.postedMessages.at(-1)[0]).toMatchObject({ type: WorkerResponseType.RELEASED });

    await sendWorkerMessage(harness.scope, createWorkerMessage(WorkerMessageType.DESTROY));
    expect(harness.postedMessages.at(-1)[0]).toMatchObject({ type: WorkerResponseType.DESTROYED });
    expect(harness.closeMock).toHaveBeenCalled();
  });
});
