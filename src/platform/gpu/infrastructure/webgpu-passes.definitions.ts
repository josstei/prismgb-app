import pixelUpscaleWgsl from './shaders/webgpu/pixel-upscale.wgsl?raw';
import unsharpMaskWgsl from './shaders/webgpu/unsharp-mask.wgsl?raw';
import colorElevationWgsl from './shaders/webgpu/color-elevation.wgsl?raw';
import crtLcdWgsl from './shaders/webgpu/crt-lcd.wgsl?raw';
import presentWgsl from './shaders/webgpu/present.wgsl?raw';
import { calculateScaleFactor } from '../domain/scale.utils';
import type { RenderPreset } from '../domain/types';

interface UpscaleUniforms {
  inputSize: [number, number];
  outputSize: [number, number];
  scaleFactor: number;
}

interface UnsharpUniforms {
  enabled: boolean;
  texelSize: [number, number];
  strength: number;
  scaleFactor: number;
}

interface ColorUniforms {
  enabled: boolean;
  gamma: number;
  saturation: number;
  greenBias: number;
  brightness: number;
  contrast: number;
}

interface CRTUniforms {
  enabled: boolean;
  resolution: [number, number];
  scaleFactor: number;
  scanlineStrength: number;
  pixelMaskStrength: number;
  bloomStrength: number;
  curvature: number;
  vignetteStrength: number;
}

export interface PipelineUniforms {
  upscale: UpscaleUniforms;
  unsharp: UnsharpUniforms;
  color: ColorUniforms;
  crt: CRTUniforms;
}

interface UniformInputs {
  preset: RenderPreset;
  nativeWidth: number;
  nativeHeight: number;
  outputWidth: number;
  outputHeight: number;
  brightness: number;
}

export function buildUniforms(inputs: UniformInputs): PipelineUniforms {
  const { preset, nativeWidth, nativeHeight, outputWidth, outputHeight, brightness } = inputs;

  const scaleFactor = calculateScaleFactor(nativeWidth, nativeHeight, outputWidth, outputHeight);
  const scaledWidth = nativeWidth * scaleFactor;
  const scaledHeight = nativeHeight * scaleFactor;

  return {
    upscale: {
      inputSize: [nativeWidth, nativeHeight],
      outputSize: [scaledWidth, scaledHeight],
      scaleFactor
    },
    unsharp: {
      enabled: preset.unsharp.enabled,
      texelSize: [1 / scaledWidth, 1 / scaledHeight],
      strength: preset.unsharp.enabled ? preset.unsharp.strength : 0,
      scaleFactor
    },
    color: {
      enabled: preset.color.enabled,
      gamma: preset.color.enabled ? preset.color.gamma : 1.0,
      saturation: preset.color.enabled ? preset.color.saturation : 1.0,
      greenBias: preset.color.enabled ? preset.color.greenBias : 0,
      brightness: preset.color.enabled ? preset.color.brightness * brightness : brightness,
      contrast: preset.color.enabled ? preset.color.contrast : 1.0
    },
    crt: {
      enabled: preset.crt.enabled,
      resolution: [scaledWidth, scaledHeight],
      scaleFactor,
      scanlineStrength: preset.crt.enabled ? preset.crt.scanlineStrength : 0,
      pixelMaskStrength: preset.crt.enabled ? preset.crt.pixelMaskStrength : 0,
      bloomStrength: preset.crt.enabled ? preset.crt.bloomStrength : 0,
      curvature: preset.crt.enabled ? preset.crt.curvature : 0,
      vignetteStrength: preset.crt.enabled ? preset.crt.vignetteStrength : 0
    }
  };
}

const FULLSCREEN_VERTEX_WGSL = `
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var positions = array<vec2<f32>, 4>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(1.0, 1.0)
  );

  var uvs = array<vec2<f32>, 4>(
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 0.0)
  );

  var output: VertexOutput;
  output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
  output.uv = uvs[vertexIndex];
  return output;
}
`;

function withFullscreenVertex(fragmentSource: string): string {
  return `${FULLSCREEN_VERTEX_WGSL}\n${fragmentSource}`;
}

export const PRESENT_SHADER = withFullscreenVertex(presentWgsl);

export type WebGpuPass = {
  readonly id: string;
  readonly shader: string;
  readonly sampler: 'nearest' | 'linear';
  readonly byteLength: number;
  isEnabled(uniforms: PipelineUniforms): boolean;
  pack(uniforms: PipelineUniforms): Float32Array<ArrayBuffer>;
};

// Each pack() mirrors its WGSL uniform struct field by field, padded to byteLength.
export const WEBGPU_PASSES: readonly WebGpuPass[] = [
  {
    id: 'pixel-upscale',
    shader: withFullscreenVertex(pixelUpscaleWgsl),
    sampler: 'nearest',
    byteLength: 24,
    isEnabled: () => true,
    pack: ({ upscale }) => new Float32Array([
      upscale.inputSize[0], upscale.inputSize[1],
      upscale.outputSize[0], upscale.outputSize[1],
      upscale.scaleFactor, 0
    ])
  },
  {
    id: 'unsharp-mask',
    shader: withFullscreenVertex(unsharpMaskWgsl),
    sampler: 'linear',
    byteLength: 16,
    isEnabled: ({ unsharp }) => unsharp.enabled && unsharp.strength > 0,
    pack: ({ unsharp }) => new Float32Array([
      unsharp.texelSize[0], unsharp.texelSize[1],
      unsharp.strength, unsharp.scaleFactor
    ])
  },
  {
    id: 'color-elevation',
    shader: withFullscreenVertex(colorElevationWgsl),
    sampler: 'linear',
    byteLength: 32,
    isEnabled: ({ color }) => color.enabled,
    pack: ({ color }) => new Float32Array([
      color.gamma, color.saturation, color.greenBias, color.brightness, color.contrast,
      0, 0, 0
    ])
  },
  {
    id: 'crt-lcd',
    shader: withFullscreenVertex(crtLcdWgsl),
    sampler: 'linear',
    byteLength: 32,
    isEnabled: ({ crt }) => (
      crt.scanlineStrength > 0
      || crt.pixelMaskStrength > 0
      || crt.bloomStrength > 0
      || crt.curvature > 0
      || crt.vignetteStrength > 0
    ),
    pack: ({ crt }) => new Float32Array([
      crt.resolution[0], crt.resolution[1],
      crt.scaleFactor,
      crt.scanlineStrength, crt.pixelMaskStrength, crt.bloomStrength, crt.curvature, crt.vignetteStrength
    ])
  }
];
