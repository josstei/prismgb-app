import type { PipelineUniforms } from './uniforms';

export type UniformBlock = keyof PipelineUniforms;

export type UniformValueSource =
  | {
      readonly kind: 'uniformField';
      readonly uniformBlock: UniformBlock;
      readonly uniformField: string;
    }
  | {
      readonly kind: 'constant';
      readonly value: number;
    };

export type UniformCompareOperator = '>' | '>=' | '<' | '<=' | '==' | '!=';

export type RenderPassEnablement =
  | { readonly kind: 'always' }
  | {
      readonly kind: 'uniformBoolean';
      readonly uniformBlock: UniformBlock;
      readonly uniformField: string;
    }
  | {
      readonly kind: 'uniformCompare';
      readonly uniformBlock: UniformBlock;
      readonly uniformField: string;
      readonly operator: UniformCompareOperator;
      readonly value: number;
    }
  | {
      readonly kind: 'all' | 'any';
      readonly conditions: readonly RenderPassEnablement[];
    };

export type SamplerPolicy = 'nearest' | 'linear';

export type WebGpuUniformType = 'f32' | 'vec2<f32>';

export type WebGpuUniformMemberSpec = {
  readonly name: string;
  readonly type: WebGpuUniformType;
  readonly offsetBytes: number;
  readonly byteLength: number;
  readonly source: UniformValueSource;
};

export type WebGpuUniformLayoutSpec = {
  readonly byteLength: number;
  readonly members: readonly WebGpuUniformMemberSpec[];
};

export type RenderPassSpec = {
  readonly id: string;
  readonly order: number;
  readonly enabledWhen: RenderPassEnablement;
  readonly webgpuShader: string;
  readonly uniformBlock: UniformBlock;
  readonly webgpuUniformLayout: WebGpuUniformLayoutSpec;
  readonly sampler: SamplerPolicy;
  readonly outputsToCanvas: boolean;
};

export type RenderPassDefinition = RenderPassSpec;

export type RenderPassRuntimeBase = {
  passId: string;
  order: number;
  enabledWhen: RenderPassEnablement;
  outputsToCanvas: boolean;
  sampler: SamplerPolicy;
};

function field(uniformBlock: UniformBlock, uniformField: string): UniformValueSource {
  return { kind: 'uniformField', uniformBlock, uniformField };
}

function constant(value: number): UniformValueSource {
  return { kind: 'constant', value };
}

export const PASS_SPECS: readonly RenderPassSpec[] = [
  {
    id: 'pixel-upscale',
    order: 10,
    enabledWhen: { kind: 'always' },
    webgpuShader: 'pixel-upscale.wgsl',
    uniformBlock: 'upscale',
    webgpuUniformLayout: {
      byteLength: 24,
      members: [
        { name: 'inputSize', type: 'vec2<f32>', offsetBytes: 0, byteLength: 8, source: field('upscale', 'inputSize') },
        { name: 'outputSize', type: 'vec2<f32>', offsetBytes: 8, byteLength: 8, source: field('upscale', 'outputSize') },
        { name: 'scaleFactor', type: 'f32', offsetBytes: 16, byteLength: 4, source: field('upscale', 'scaleFactor') },
        { name: '_padding', type: 'f32', offsetBytes: 20, byteLength: 4, source: constant(0) }
      ]
    },
    sampler: 'nearest',
    outputsToCanvas: false
  },
  {
    id: 'unsharp-mask',
    order: 20,
    enabledWhen: {
      kind: 'all',
      conditions: [
        { kind: 'uniformBoolean', uniformBlock: 'unsharp', uniformField: 'enabled' },
        { kind: 'uniformCompare', uniformBlock: 'unsharp', uniformField: 'strength', operator: '>', value: 0 }
      ]
    },
    webgpuShader: 'unsharp-mask.wgsl',
    uniformBlock: 'unsharp',
    webgpuUniformLayout: {
      byteLength: 16,
      members: [
        { name: 'texelSize', type: 'vec2<f32>', offsetBytes: 0, byteLength: 8, source: field('unsharp', 'texelSize') },
        { name: 'strength', type: 'f32', offsetBytes: 8, byteLength: 4, source: field('unsharp', 'strength') },
        { name: 'scaleFactor', type: 'f32', offsetBytes: 12, byteLength: 4, source: field('unsharp', 'scaleFactor') }
      ]
    },
    sampler: 'linear',
    outputsToCanvas: false
  },
  {
    id: 'color-elevation',
    order: 30,
    enabledWhen: { kind: 'uniformBoolean', uniformBlock: 'color', uniformField: 'enabled' },
    webgpuShader: 'color-elevation.wgsl',
    uniformBlock: 'color',
    webgpuUniformLayout: {
      byteLength: 32,
      members: [
        { name: 'gamma', type: 'f32', offsetBytes: 0, byteLength: 4, source: field('color', 'gamma') },
        { name: 'saturation', type: 'f32', offsetBytes: 4, byteLength: 4, source: field('color', 'saturation') },
        { name: 'greenBias', type: 'f32', offsetBytes: 8, byteLength: 4, source: field('color', 'greenBias') },
        { name: 'brightness', type: 'f32', offsetBytes: 12, byteLength: 4, source: field('color', 'brightness') },
        { name: 'contrast', type: 'f32', offsetBytes: 16, byteLength: 4, source: field('color', 'contrast') },
        { name: '_padding1', type: 'f32', offsetBytes: 20, byteLength: 4, source: constant(0) },
        { name: '_padding2', type: 'f32', offsetBytes: 24, byteLength: 4, source: constant(0) },
        { name: '_padding3', type: 'f32', offsetBytes: 28, byteLength: 4, source: constant(0) }
      ]
    },
    sampler: 'linear',
    outputsToCanvas: false
  },
  {
    id: 'crt-lcd',
    order: 40,
    enabledWhen: {
      kind: 'any',
      conditions: [
        { kind: 'uniformCompare', uniformBlock: 'crt', uniformField: 'scanlineStrength', operator: '>', value: 0 },
        { kind: 'uniformCompare', uniformBlock: 'crt', uniformField: 'pixelMaskStrength', operator: '>', value: 0 },
        { kind: 'uniformCompare', uniformBlock: 'crt', uniformField: 'bloomStrength', operator: '>', value: 0 },
        { kind: 'uniformCompare', uniformBlock: 'crt', uniformField: 'curvature', operator: '>', value: 0 },
        { kind: 'uniformCompare', uniformBlock: 'crt', uniformField: 'vignetteStrength', operator: '>', value: 0 }
      ]
    },
    webgpuShader: 'crt-lcd.wgsl',
    uniformBlock: 'crt',
    webgpuUniformLayout: {
      byteLength: 32,
      members: [
        { name: 'resolution', type: 'vec2<f32>', offsetBytes: 0, byteLength: 8, source: field('crt', 'resolution') },
        { name: 'scaleFactor', type: 'f32', offsetBytes: 8, byteLength: 4, source: field('crt', 'scaleFactor') },
        { name: 'scanlineStrength', type: 'f32', offsetBytes: 12, byteLength: 4, source: field('crt', 'scanlineStrength') },
        { name: 'pixelMaskStrength', type: 'f32', offsetBytes: 16, byteLength: 4, source: field('crt', 'pixelMaskStrength') },
        { name: 'bloomStrength', type: 'f32', offsetBytes: 20, byteLength: 4, source: field('crt', 'bloomStrength') },
        { name: 'curvature', type: 'f32', offsetBytes: 24, byteLength: 4, source: field('crt', 'curvature') },
        { name: 'vignetteStrength', type: 'f32', offsetBytes: 28, byteLength: 4, source: field('crt', 'vignetteStrength') }
      ]
    },
    sampler: 'linear',
    outputsToCanvas: true
  }
];

export const RENDER_PASS_DEFINITIONS = Object.freeze(
  [...PASS_SPECS].sort((left, right) => left.order - right.order)
);
