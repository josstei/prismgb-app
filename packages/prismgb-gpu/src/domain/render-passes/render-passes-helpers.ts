import { RenderPassContract, type RenderPassDefinition } from './render-passes.contract';
import type { PipelineUniforms } from '../shaders';
import type { IPreset } from '../presets';

export type WebGPUUniformNumericType = 'f32' | 'vec2<f32>';

export interface WebGPUUniformMember {
  name: string;
  type: WebGPUUniformNumericType;
  offsetBytes: number;
  byteLength: number;
}

export interface WebGPUUniformLayout {
  passId: string;
  uniformBlock: string;
  byteLength: number;
  members: readonly WebGPUUniformMember[];
}

type UniformSetterMethod = 'setUniform1i' | 'setUniform1f' | 'setUniform2f';

export interface WebGLUniformBinding {
  name: string;
  method: UniformSetterMethod;
}

export type WebGLUniformScalar = number;
export type WebGLUniformVec2 = readonly [number, number];
export type WebGLUniformValue = WebGLUniformScalar | WebGLUniformVec2;

export interface WebGLUniformBindingWithValue extends WebGLUniformBinding {
  readValue: (uniforms: PipelineUniforms) => WebGLUniformValue;
}

export interface RenderPassHelpers {
  passId: string;
  order: number;
  enabledWhen?: RenderPassEnablement;
  outputsToCanvas: boolean;
  sampler: 'nearest' | 'linear';

  isEnabled(uniforms: PipelineUniforms, preset: IPreset): boolean;

  webgpu: {
    shaderFile: string;
    layout: WebGPUUniformLayout;
    uniformData(uniforms: PipelineUniforms): Float32Array;
  };

  webgl: {
    vertexShaderFile: string;
    fragmentShaderFile: string;
    textureUniform: WebGLUniformBindingWithValue;
    additionalUniforms: readonly WebGLUniformBindingWithValue[];
  };
}

export interface WebGLPassProgram {
  setUniform1i(name: string, value: number): void;
  setUniform1f(name: string, value: number): void;
  setUniform2f(name: string, x: number, y: number): void;
}

type UniformCompareOperator = '>' | '>=' | '<' | '<=' | '==' | '!=';

type UniformBlock = keyof PipelineUniforms;

type RenderPassEnablementAlways = {
  kind: 'always';
};

type RenderPassEnablementUniformBoolean = {
  kind: 'uniformBoolean';
  uniformBlock: UniformBlock;
  uniformField: string;
};

type RenderPassEnablementUniformCompare = {
  kind: 'uniformCompare';
  uniformBlock: UniformBlock;
  uniformField: string;
  operator: UniformCompareOperator;
  value: number;
};

type RenderPassEnablementComposite = {
  kind: 'all' | 'any';
  conditions: readonly RenderPassEnablement[];
};

type RenderPassEnablement = RenderPassEnablementAlways
  | RenderPassEnablementUniformBoolean
  | RenderPassEnablementUniformCompare
  | RenderPassEnablementComposite;

function evaluateRenderPassEnablement(
  enablement: RenderPassEnablement,
  uniforms: PipelineUniforms,
  _preset: IPreset
): boolean {
  switch (enablement.kind) {
    case 'always':
      return true;

    case 'uniformBoolean': {
      const value = readUniformField(uniforms, enablement.uniformBlock, enablement.uniformField);
      if (typeof value !== 'boolean') {
        throw new Error(
          `Enablement condition for block '${enablement.uniformBlock}' field '${enablement.uniformField}'`
          + ` must be boolean, got '${typeof value}'`
        );
      }
      return value;
    }

    case 'uniformCompare': {
      const value = readUniformField(uniforms, enablement.uniformBlock, enablement.uniformField);
      if (typeof value !== 'number') {
        throw new Error(
          `Enablement condition for block '${enablement.uniformBlock}' field '${enablement.uniformField}'`
          + ` must be number, got '${typeof value}'`
        );
      }

      switch (enablement.operator) {
        case '>':
          return value > enablement.value;
        case '>=':
          return value >= enablement.value;
        case '<':
          return value < enablement.value;
        case '<=':
          return value <= enablement.value;
        case '==':
          return value === enablement.value;
        case '!=':
          return value !== enablement.value;
      }
    }

    case 'all':
      return enablement.conditions.every((condition) => (
        evaluateRenderPassEnablement(condition, uniforms, _preset)
      ));

    case 'any':
      return enablement.conditions.some((condition) => (
        evaluateRenderPassEnablement(condition, uniforms, _preset)
      ));

    default:
      throw new Error('Unsupported enablement condition');
  }
}

function readUniformField(
  uniforms: PipelineUniforms,
  uniformBlock: UniformBlock,
  fieldName: string
): unknown {
  const blockValues = uniforms[uniformBlock];
  const record = blockValues as unknown as Record<string, unknown>;

  if (!Object.prototype.hasOwnProperty.call(record, fieldName)) {
    throw new Error(`Enablement condition references missing uniform field '${uniformBlock}.${fieldName}'`);
  }

  return record[fieldName];
}

function getEnablementFromManifest(pass: RenderPassDefinition): RenderPassEnablement {
  if (pass.enabledWhen) {
    return parseEnablementCondition(pass.enabledWhen);
  }

  throw new Error(`Render pass '${pass.id}' is missing enablement configuration`);
}

function parseEnablementCondition(
  input: RenderPassDefinition['enabledWhen']
): RenderPassEnablement {
  if (!input || typeof input !== 'object' || !('kind' in input)) {
    throw new Error('Invalid render pass enablement configuration');
  }

  switch (input.kind) {
    case 'always':
      return { kind: 'always' };

    case 'uniformBoolean': {
      const rawBlock = 'uniformBlock' in input ? input.uniformBlock : undefined;
      const rawField = 'uniformField' in input ? input.uniformField : undefined;
      if (typeof rawBlock !== 'string' || typeof rawField !== 'string') {
        throw new Error('Invalid uniformBoolean enablement condition');
      }

      return {
        kind: 'uniformBoolean',
        uniformBlock: normalizeUniformBlock(rawBlock),
        uniformField: rawField
      };
    }

    case 'uniformCompare': {
      const rawBlock = 'uniformBlock' in input ? input.uniformBlock : undefined;
      const rawField = 'uniformField' in input ? input.uniformField : undefined;
      const rawOperator = 'operator' in input ? input.operator : undefined;
      const rawValue = 'value' in input ? input.value : undefined;

      if (
        typeof rawBlock !== 'string'
        || typeof rawField !== 'string'
        || (typeof rawOperator !== 'string')
        || typeof rawValue !== 'number'
      ) {
        throw new Error('Invalid uniformCompare enablement condition');
      }

      if (!isSupportedCompareOperator(rawOperator)) {
        throw new Error(`Unsupported uniformCompare operator '${rawOperator}'`);
      }

      return {
        kind: 'uniformCompare',
        uniformBlock: normalizeUniformBlock(rawBlock),
        uniformField: rawField,
        operator: rawOperator,
        value: rawValue
      };
    }

    case 'all':
    case 'any': {
      const rawConditions = 'conditions' in input ? input.conditions : undefined;
      if (!Array.isArray(rawConditions)) {
        throw new Error(`Invalid ${input.kind} enablement condition`);
      }

      return {
        kind: input.kind,
        conditions: rawConditions.map((condition) => parseEnablementCondition(condition))
      };
    }

    default:
      throw new Error(`Unsupported enablement condition kind '${String(input.kind)}'`);
  }
}

const VALID_UNIFORM_BLOCKS = ['upscale', 'unsharp', 'color', 'crt'] as const;
type ManifestUniformBlock = typeof VALID_UNIFORM_BLOCKS[number];

function normalizeUniformBlock(candidate: string): UniformBlock {
  if ((VALID_UNIFORM_BLOCKS as readonly string[]).includes(candidate)) {
    return candidate as ManifestUniformBlock;
  }

  throw new Error(`Invalid uniform block '${candidate}' in render pass enablement condition`);
}

function isSupportedCompareOperator(operator: string): operator is UniformCompareOperator {
  return operator === '>' || operator === '>=' || operator === '<' || operator === '<=' || operator === '==' || operator === '!=';
}

function buildEnablementPredicate(
  pass: RenderPassDefinition
): (uniforms: PipelineUniforms, preset: IPreset) => boolean {
  const enablement = getEnablementFromManifest(pass);
  return (uniforms, preset) => evaluateRenderPassEnablement(enablement, uniforms, preset);
}

const WEBGPU_UNIFORM_LAYOUTS: Record<string, WebGPUUniformLayout> = {
  upscale: {
    passId: 'pixel-upscale',
    uniformBlock: 'upscale',
    byteLength: 24,
    members: [
      { name: 'inputSize', type: 'vec2<f32>', offsetBytes: 0, byteLength: 8 },
      { name: 'outputSize', type: 'vec2<f32>', offsetBytes: 8, byteLength: 8 },
      { name: 'scaleFactor', type: 'f32', offsetBytes: 16, byteLength: 4 },
      { name: '_padding', type: 'f32', offsetBytes: 20, byteLength: 4 }
    ]
  },
  unsharp: {
    passId: 'unsharp-mask',
    uniformBlock: 'unsharp',
    byteLength: 16,
    members: [
      { name: 'texelSize', type: 'vec2<f32>', offsetBytes: 0, byteLength: 8 },
      { name: 'strength', type: 'f32', offsetBytes: 8, byteLength: 4 },
      { name: 'scaleFactor', type: 'f32', offsetBytes: 12, byteLength: 4 }
    ]
  },
  color: {
    passId: 'color-elevation',
    uniformBlock: 'color',
    byteLength: 32,
    members: [
      { name: 'gamma', type: 'f32', offsetBytes: 0, byteLength: 4 },
      { name: 'saturation', type: 'f32', offsetBytes: 4, byteLength: 4 },
      { name: 'greenBias', type: 'f32', offsetBytes: 8, byteLength: 4 },
      { name: 'brightness', type: 'f32', offsetBytes: 12, byteLength: 4 },
      { name: 'contrast', type: 'f32', offsetBytes: 16, byteLength: 4 },
      { name: '_padding1', type: 'f32', offsetBytes: 20, byteLength: 4 },
      { name: '_padding2', type: 'f32', offsetBytes: 24, byteLength: 4 },
      { name: '_padding3', type: 'f32', offsetBytes: 28, byteLength: 4 }
    ]
  },
  crt: {
    passId: 'crt-lcd',
    uniformBlock: 'crt',
    byteLength: 32,
    members: [
      { name: 'resolution', type: 'vec2<f32>', offsetBytes: 0, byteLength: 8 },
      { name: 'scaleFactor', type: 'f32', offsetBytes: 8, byteLength: 4 },
      { name: 'scanlineStrength', type: 'f32', offsetBytes: 12, byteLength: 4 },
      { name: 'pixelMaskStrength', type: 'f32', offsetBytes: 16, byteLength: 4 },
      { name: 'bloomStrength', type: 'f32', offsetBytes: 20, byteLength: 4 },
      { name: 'curvature', type: 'f32', offsetBytes: 24, byteLength: 4 },
      { name: 'vignetteStrength', type: 'f32', offsetBytes: 28, byteLength: 4 }
    ]
  }
};

const WEBGL_UNIFORM_BINDINGS: Record<
  string,
  {
    textureUniform: WebGLUniformBindingWithValue;
    additionalUniforms: readonly WebGLUniformBindingWithValue[];
  }
> = {
  upscale: {
    textureUniform: { name: 'uSourceTex', method: 'setUniform1i', readValue: () => 0 },
    additionalUniforms: [
      {
        name: 'uSourceSize',
        method: 'setUniform2f',
        readValue: (uniforms) => uniforms.upscale.inputSize
      },
      {
        name: 'uTargetSize',
        method: 'setUniform2f',
        readValue: (uniforms) => uniforms.upscale.outputSize
      },
      {
        name: 'uScaleFactor',
        method: 'setUniform1f',
        readValue: (uniforms) => uniforms.upscale.scaleFactor
      }
    ]
  },
  unsharp: {
    textureUniform: { name: 'uInputTex', method: 'setUniform1i', readValue: () => 0 },
    additionalUniforms: [
      {
        name: 'uTexelSize',
        method: 'setUniform2f',
        readValue: (uniforms) => uniforms.unsharp.texelSize
      },
      { name: 'uStrength', method: 'setUniform1f', readValue: (uniforms) => uniforms.unsharp.strength },
      { name: 'uScaleFactor', method: 'setUniform1f', readValue: (uniforms) => uniforms.unsharp.scaleFactor }
    ]
  },
  color: {
    textureUniform: { name: 'uInputTex', method: 'setUniform1i', readValue: () => 0 },
    additionalUniforms: [
      { name: 'uGamma', method: 'setUniform1f', readValue: (uniforms) => uniforms.color.gamma },
      { name: 'uSaturation', method: 'setUniform1f', readValue: (uniforms) => uniforms.color.saturation },
      { name: 'uGreenBias', method: 'setUniform1f', readValue: (uniforms) => uniforms.color.greenBias },
      { name: 'uBrightness', method: 'setUniform1f', readValue: (uniforms) => uniforms.color.brightness },
      { name: 'uContrast', method: 'setUniform1f', readValue: (uniforms) => uniforms.color.contrast }
    ]
  },
  crt: {
    textureUniform: { name: 'uInputTex', method: 'setUniform1i', readValue: () => 0 },
    additionalUniforms: [
      {
        name: 'uResolution',
        method: 'setUniform2f',
        readValue: (uniforms) => uniforms.crt.resolution
      },
      { name: 'uScaleFactor', method: 'setUniform1f', readValue: (uniforms) => uniforms.crt.scaleFactor },
      { name: 'uScanlineStrength', method: 'setUniform1f', readValue: (uniforms) => uniforms.crt.scanlineStrength },
      { name: 'uPixelMaskStrength', method: 'setUniform1f', readValue: (uniforms) => uniforms.crt.pixelMaskStrength },
      { name: 'uBloomStrength', method: 'setUniform1f', readValue: (uniforms) => uniforms.crt.bloomStrength },
      { name: 'uCurvature', method: 'setUniform1f', readValue: (uniforms) => uniforms.crt.curvature },
      { name: 'uVignetteStrength', method: 'setUniform1f', readValue: (uniforms) => uniforms.crt.vignetteStrength }
    ]
  }
};

function toSamplerPolicy(sampler: string): RenderPassHelpers['sampler'] {
  if (sampler === 'nearest' || sampler === 'linear') {
    return sampler;
  }

  throw new Error(`Invalid sampler policy '${sampler}'`);
}

function getWebGPUDataBuilder(block: string): (uniforms: PipelineUniforms) => Float32Array {
  if (block === 'upscale') {
    return (uniforms) => new Float32Array([
      uniforms.upscale.inputSize[0],
      uniforms.upscale.inputSize[1],
      uniforms.upscale.outputSize[0],
      uniforms.upscale.outputSize[1],
      uniforms.upscale.scaleFactor,
      0
    ]);
  }

  if (block === 'unsharp') {
    return (uniforms) => new Float32Array([
      uniforms.unsharp.texelSize[0],
      uniforms.unsharp.texelSize[1],
      uniforms.unsharp.strength,
      uniforms.unsharp.scaleFactor
    ]);
  }

  if (block === 'color') {
    return (uniforms) => new Float32Array([
      uniforms.color.gamma,
      uniforms.color.saturation,
      uniforms.color.greenBias,
      uniforms.color.brightness,
      uniforms.color.contrast,
      0,
      0,
      0
    ]);
  }

  if (block === 'crt') {
    return (uniforms) => new Float32Array([
      uniforms.crt.resolution[0],
      uniforms.crt.resolution[1],
      uniforms.crt.scaleFactor,
      uniforms.crt.scanlineStrength,
      uniforms.crt.pixelMaskStrength,
      uniforms.crt.bloomStrength,
      uniforms.crt.curvature,
      uniforms.crt.vignetteStrength
    ]);
  }

  return () => new Float32Array([]);
}

export function getEnabledRenderPasses(
  uniforms: PipelineUniforms,
  preset: IPreset
): RenderPassHelpers[] {
  return RENDER_PASS_HELPERS.filter((pass) => isRenderPassEnabled(pass, uniforms, preset));
}

export function isRenderPassEnabled(
  pass: RenderPassHelpers,
  uniforms: PipelineUniforms,
  preset: IPreset
): boolean {
  return pass.isEnabled(uniforms, preset);
}

export function applyWebGLPassUniforms(
  program: WebGLPassProgram,
  pass: RenderPassHelpers,
  uniforms: PipelineUniforms
): void {
  const applyBinding = (binding: WebGLUniformBindingWithValue): void => {
    const value = binding.readValue(uniforms);

    if (binding.method === 'setUniform1i') {
      program.setUniform1i(binding.name, value as number);
      return;
    }

    if (binding.method === 'setUniform1f') {
      program.setUniform1f(binding.name, value as number);
      return;
    }

    const [x, y] = value as WebGLUniformVec2;
    program.setUniform2f(binding.name, x, y);
  };

  applyBinding(pass.webgl.textureUniform);
  for (const binding of pass.webgl.additionalUniforms) {
    applyBinding(binding);
  }
}

function createPassHelpers(): readonly RenderPassHelpers[] {
  const sortedPasses = [...RenderPassContract.passes].sort((left, right) => left.order - right.order);

  return sortedPasses.map((pass) => {
    const layout = WEBGPU_UNIFORM_LAYOUTS[pass.uniformBlock];
    const webgl = WEBGL_UNIFORM_BINDINGS[pass.uniformBlock];

    if (!layout || !webgl) {
      throw new Error(`Missing helper definitions for pass '${pass.id}'`);
    }

    const isEnabled = buildEnablementPredicate(pass);
    const enablement = getEnablementFromManifest(pass);
    const buildData = getWebGPUDataBuilder(pass.uniformBlock);

    return {
      passId: pass.id,
      order: pass.order,
      enabledWhen: enablement,
      outputsToCanvas: pass.outputsToCanvas ?? false,
      sampler: toSamplerPolicy(pass.sampler),
      isEnabled,
      webgpu: {
        shaderFile: pass.webgpuShader,
        layout: {
          ...layout
        },
        uniformData: buildData
      },
      webgl: {
        vertexShaderFile: pass.webgl2VertexShader,
        fragmentShaderFile: pass.webgl2FragmentShader,
        textureUniform: webgl.textureUniform,
        additionalUniforms: webgl.additionalUniforms
      }
    };
  });
}

export const RENDER_PASS_HELPERS = createPassHelpers();

export const RENDER_PASS_HELPERS_BY_ID = Object.fromEntries(
  RENDER_PASS_HELPERS.map((pass) => [pass.passId, pass])
) as Record<string, RenderPassHelpers>;
