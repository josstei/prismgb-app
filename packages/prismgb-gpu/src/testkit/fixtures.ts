import { getRendererDefaultPreset } from '../application/preset-catalog';
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
  WorkerMessagePayloadMap,
  WorkerMessageTypeValue,
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
    webgl2: true,
    offscreenCanvas: true,
    transferControlToOffscreen: true,
    preferredBackend: 'webgl2',
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

export function createMockWebGL2Context(): WebGL2RenderingContext {
  const activeUniforms = 0x8B86;
  const linkStatus = 0x8B82;
  const compileStatus = 0x8B81;
  const maxTextureSize = 0x0D33;

  return {
    ACTIVE_UNIFORMS: activeUniforms,
    LINK_STATUS: linkStatus,
    COMPILE_STATUS: compileStatus,
    MAX_TEXTURE_SIZE: maxTextureSize,
    VERTEX_SHADER: 0x8B31,
    FRAGMENT_SHADER: 0x8B30,
    TEXTURE_2D: 0x0DE1,
    NEAREST: 0x2600,
    LINEAR: 0x2601,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    CLAMP_TO_EDGE: 0x812F,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    FRAMEBUFFER: 0x8D40,
    READ_FRAMEBUFFER: 0x8CA8,
    DRAW_FRAMEBUFFER: 0x8CA9,
    COLOR_ATTACHMENT0: 0x8CE0,
    COLOR_BUFFER_BIT: 0x4000,
    TRIANGLES: 0x0004,
    TEXTURE0: 0x84C0,
    createShader: () => ({}),
    shaderSource: () => undefined,
    compileShader: () => undefined,
    getShaderParameter: (_shader: unknown, parameter: number) => parameter === compileStatus,
    getShaderInfoLog: () => '',
    deleteShader: () => undefined,
    createProgram: () => ({}),
    attachShader: () => undefined,
    linkProgram: () => undefined,
    getProgramParameter: (_program: unknown, parameter: number) => (
      parameter === activeUniforms ? 0 : parameter === linkStatus
    ),
    getProgramInfoLog: () => '',
    deleteProgram: () => undefined,
    getActiveUniform: () => null,
    getUniformLocation: () => null,
    useProgram: () => undefined,
    uniform1i: () => undefined,
    uniform1f: () => undefined,
    uniform2f: () => undefined,
    createVertexArray: () => ({}),
    bindVertexArray: () => undefined,
    deleteVertexArray: () => undefined,
    createTexture: () => ({}),
    bindTexture: () => undefined,
    texParameteri: () => undefined,
    texImage2D: () => undefined,
    texSubImage2D: () => undefined,
    deleteTexture: () => undefined,
    createFramebuffer: () => ({}),
    bindFramebuffer: () => undefined,
    framebufferTexture2D: () => undefined,
    deleteFramebuffer: () => undefined,
    viewport: () => undefined,
    activeTexture: () => undefined,
    drawArrays: () => undefined,
    blitFramebuffer: () => undefined,
    clearColor: () => undefined,
    clear: () => undefined,
    getParameter: (parameter: number) => parameter === maxTextureSize ? 8192 : 'mock',
    getExtension: (name: string) => name === 'WEBGL_lose_context'
      ? { loseContext: () => undefined }
      : null
  } as unknown as WebGL2RenderingContext;
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
  const sendCommand = <K extends WorkerMessageTypeValue>(
    _type: K,
    _payload?: WorkerMessagePayloadMap[K],
    _transferables: Transferable[] = []
  ): boolean => true;

  const mock = {
    isReady: () => false,
    isCanvasTransferred: () => false,
    initialize: async () => true,
    renderFrame: () => true,
    setPreset: () => true,
    resize: () => true,
    requestCapture: () => true,
    requestCapturedFrame: () => true,
    sendCommand,
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
