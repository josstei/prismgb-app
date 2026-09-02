import { getRendererDefaultPreset } from '../application/catalog';
import type {
  RenderCapabilities,
  RenderCanvas,
  RenderPreset,
  RenderStats
} from '../domain/types';
import type { PipelineUniforms } from '../domain/uniforms';
import { WorkerRendererClient } from '../worker/client';
import { WorkerResponseType } from '../worker/protocol';
import type {
  WorkerResponsePayloadMap,
  WorkerResponseTypeValue
} from '../worker/protocol';

type DeepPartial<T> = {
  [Key in keyof T]?: T[Key] extends readonly unknown[]
    ? T[Key]
    : T[Key] extends object
      ? DeepPartial<T[Key]>
      : T[Key];
};

export type MockCanvasContextMap = Partial<Record<string, unknown>>;

export type MockRenderCanvas = RenderCanvas & {
  transferControlToOffscreen(): OffscreenCanvas;
};

export type WorkerRendererClientMock = WorkerRendererClient & {
  emit<K extends WorkerResponseTypeValue>(type: K, payload: WorkerResponsePayloadMap[K]): void;
};

export function createRenderStatsFixture(overrides: Partial<RenderStats> = {}): RenderStats {
  return {
    fps: 0,
    frameTime: 0,
    framesRendered: 0,
    framesDropped: 0,
    ...overrides
  };
}

export function createRenderCapabilitiesFixture(
  overrides: Partial<RenderCapabilities> = {}
): RenderCapabilities {
  return {
    webgpu: false,
    offscreenCanvas: true,
    transferControlToOffscreen: true,
    preferredBackend: 'canvas2d',
    maxTextureSize: 4096,
    ...overrides
  };
}

export function createRenderPresetFixture(
  overrides: DeepPartial<RenderPreset> = {}
): RenderPreset {
  const preset = getRendererDefaultPreset();

  return {
    ...preset,
    ...overrides,
    upscale: {
      ...preset.upscale,
      ...overrides.upscale
    },
    unsharp: {
      ...preset.unsharp,
      ...overrides.unsharp
    },
    color: {
      ...preset.color,
      ...overrides.color
    },
    crt: {
      ...preset.crt,
      ...overrides.crt
    }
  };
}

export function createPipelineUniformsFixture(
  overrides: DeepPartial<PipelineUniforms> = {}
): PipelineUniforms {
  const uniforms: PipelineUniforms = {
    upscale: {
      inputSize: [160, 144],
      outputSize: [640, 576],
      scaleFactor: 4
    },
    unsharp: {
      enabled: true,
      texelSize: [1 / 640, 1 / 576],
      strength: 0.3,
      scaleFactor: 4
    },
    color: {
      enabled: true,
      gamma: 0.88,
      saturation: 1.2,
      greenBias: 0.02,
      brightness: 1.05,
      contrast: 1.1
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

  return {
    upscale: {
      ...uniforms.upscale,
      ...overrides.upscale
    },
    unsharp: {
      ...uniforms.unsharp,
      ...overrides.unsharp
    },
    color: {
      ...uniforms.color,
      ...overrides.color
    },
    crt: {
      ...uniforms.crt,
      ...overrides.crt
    }
  };
}

export function createMockOffscreenCanvas(
  width = 160,
  height = 144,
  contexts: MockCanvasContextMap = {}
): OffscreenCanvas {
  return {
    width,
    height,
    getContext: (contextType: string) => contexts[contextType] ?? null
  } as unknown as OffscreenCanvas;
}

export function createMockCanvas(
  width = 160,
  height = 144,
  contexts: MockCanvasContextMap = {}
): MockRenderCanvas {
  const offscreenCanvas = createMockOffscreenCanvas(width, height, contexts);

  return {
    width,
    height,
    getContext: (contextType: string) => contexts[contextType] ?? null,
    transferControlToOffscreen: () => offscreenCanvas
  };
}

export function createWorkerRendererClientMock(
  overrides: Partial<WorkerRendererClientMock> = {}
): WorkerRendererClientMock {
  const handlers = new Map<WorkerResponseTypeValue, (payload: unknown) => void>();

  const onMessage = <K extends WorkerResponseTypeValue>(
    type: K,
    handler: (payload: WorkerResponsePayloadMap[K]) => void
  ): (() => void) => {
    handlers.set(type, handler as (payload: unknown) => void);

    return () => {
      handlers.delete(type);
    };
  };
  const mock = {
    isReady: () => false,
    isCanvasTransferred: () => false,
    initialize: async () => true,
    renderFrame: () => true,
    setPreset: () => true,
    resize: () => true,
    requestCapture: () => true,
    requestCapturedFrame: () => true,
    onMessage,
    onReady: (handler) => onMessage(WorkerResponseType.READY, handler),
    onFrameRendered: (handler) => onMessage(WorkerResponseType.FRAME_RENDERED, handler),
    onStats: (handler) => onMessage(WorkerResponseType.STATS, handler),
    onError: (handler) => onMessage(WorkerResponseType.ERROR, handler),
    onCaptureRequested: (handler) => onMessage(WorkerResponseType.CAPTURE_REQUESTED, handler),
    onCaptureReady: (handler) => onMessage(WorkerResponseType.CAPTURE_READY, handler),
    onReleased: (handler) => onMessage(WorkerResponseType.RELEASED, handler),
    onDestroyed: (handler) => onMessage(WorkerResponseType.DESTROYED, handler),
    releaseResources: () => undefined,
    terminate: () => undefined,
    dispose: () => undefined,
    emit: <K extends WorkerResponseTypeValue>(type: K, payload: WorkerResponsePayloadMap[K]) => {
      handlers.get(type)?.(payload);
    }
  } satisfies Omit<WorkerRendererClientMock, keyof WorkerRendererClient> & Partial<WorkerRendererClientMock>;

  return {
    ...mock,
    ...overrides
  } as WorkerRendererClientMock;
}
