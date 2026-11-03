import { resolvePreset } from '../application/catalog';
import type {
  RenderCanvas,
  RenderPreset
} from '../domain/types';
import type { PipelineUniforms } from '../domain/uniforms';

type DeepPartial<T> = {
  [Key in keyof T]?: T[Key] extends readonly unknown[]
    ? T[Key]
    : T[Key] extends object
      ? DeepPartial<T[Key]>
      : T[Key];
};

type MockCanvasContextMap = Partial<Record<string, unknown>>;

type MockRenderCanvas = RenderCanvas & {
  transferControlToOffscreen(): OffscreenCanvas;
};

export function createRenderPresetFixture(
  overrides: DeepPartial<RenderPreset> = {}
): RenderPreset {
  const preset = resolvePreset();

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

function createMockOffscreenCanvas(
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
