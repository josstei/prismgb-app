import { RenderPassContract, type RenderPassDefinition } from './render-passes.contract';
import type { PipelineUniforms } from '../shaders';
import type { IPreset } from '../presets';

type UniformBlock = keyof PipelineUniforms;

export type UniformValueSource = {
  kind: 'uniformField';
  uniformBlock: UniformBlock;
  uniformField: string;
} | {
  kind: 'constant';
  value: number;
};

export type WebGPUUniformNumericType = 'f32' | 'vec2<f32>';

export interface WebGPUUniformMember {
  name: string;
  type: WebGPUUniformNumericType;
  offsetBytes: number;
  byteLength: number;
  source: UniformValueSource;
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
  source: UniformValueSource;
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
    throw new Error(`Render pass contract references missing uniform field '${uniformBlock}.${fieldName}'`);
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

const MANIFEST_UNIFORM_BLOCKS = new Set(RenderPassContract.passes.map((pass) => pass.uniformBlock));

function normalizeUniformBlock(candidate: string): UniformBlock {
  if (MANIFEST_UNIFORM_BLOCKS.has(candidate)) {
    return candidate as UniformBlock;
  }

  throw new Error(`Invalid uniform block '${candidate}' in render pass contract`);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getManifestString(
  record: Record<string, unknown>,
  key: string,
  context: string
): string {
  const value = record[key];
  if (typeof value !== 'string') {
    throw new Error(`${context} requires string '${key}'`);
  }

  return value;
}

function getManifestNumber(
  record: Record<string, unknown>,
  key: string,
  context: string
): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${context} requires finite number '${key}'`);
  }

  return value;
}

function getManifestRecord(
  record: Record<string, unknown>,
  key: string,
  context: string
): Record<string, unknown> {
  const value = record[key];
  if (!isRecord(value)) {
    throw new Error(`${context} requires object '${key}'`);
  }

  return value;
}

function normalizeUniformValueSource(
  input: unknown,
  defaultUniformBlock: string,
  context: string
): UniformValueSource {
  if (!isRecord(input)) {
    throw new Error(`${context} requires uniform value source`);
  }

  const kind = input.kind;
  if (kind === 'constant') {
    return {
      kind: 'constant',
      value: getManifestNumber(input, 'value', context)
    };
  }

  if (kind === 'uniformField') {
    const rawUniformBlock = input.uniformBlock;
    const uniformBlock = typeof rawUniformBlock === 'string'
      ? rawUniformBlock
      : defaultUniformBlock;

    return {
      kind: 'uniformField',
      uniformBlock: normalizeUniformBlock(uniformBlock),
      uniformField: getManifestString(input, 'uniformField', context)
    };
  }

  throw new Error(`${context} has unsupported uniform value source kind '${String(kind)}'`);
}

function isSupportedWebGPUUniformType(value: string): value is WebGPUUniformNumericType {
  return value === 'f32' || value === 'vec2<f32>';
}

function normalizeWebGPUUniformType(value: string, context: string): WebGPUUniformNumericType {
  if (isSupportedWebGPUUniformType(value)) {
    return value;
  }

  throw new Error(`${context} uses unsupported WebGPU uniform type '${value}'`);
}

function normalizeWebGPUUniformMember(
  input: unknown,
  defaultUniformBlock: string,
  passId: string
): WebGPUUniformMember {
  const context = `Render pass '${passId}' WebGPU uniform member`;
  if (!isRecord(input)) {
    throw new Error(`${context} must be an object`);
  }

  const name = getManifestString(input, 'name', context);
  return {
    name,
    type: normalizeWebGPUUniformType(getManifestString(input, 'type', context), context),
    offsetBytes: getManifestNumber(input, 'offsetBytes', context),
    byteLength: getManifestNumber(input, 'byteLength', context),
    source: normalizeUniformValueSource(input.source, defaultUniformBlock, `${context} '${name}'`)
  };
}

function getWebGPULayoutFromManifest(pass: RenderPassDefinition): WebGPUUniformLayout {
  const context = `Render pass '${pass.id}' WebGPU uniform layout`;
  const layout = pass.webgpuUniformLayout as unknown;
  if (!isRecord(layout)) {
    throw new Error(`${context} is missing`);
  }

  const rawMembers = layout.members;
  if (!Array.isArray(rawMembers)) {
    throw new Error(`${context} requires array 'members'`);
  }

  return {
    passId: pass.id,
    uniformBlock: normalizeUniformBlock(pass.uniformBlock),
    byteLength: getManifestNumber(layout, 'byteLength', context),
    members: rawMembers.map((member) => normalizeWebGPUUniformMember(member, pass.uniformBlock, pass.id))
  };
}

function isSupportedWebGLUniformSetter(value: string): value is UniformSetterMethod {
  return value === 'setUniform1i' || value === 'setUniform1f' || value === 'setUniform2f';
}

function normalizeWebGLUniformSetter(value: string, context: string): UniformSetterMethod {
  if (isSupportedWebGLUniformSetter(value)) {
    return value;
  }

  throw new Error(`${context} uses unsupported WebGL uniform setter '${value}'`);
}

function isNumberPair(value: unknown): value is WebGLUniformVec2 {
  return Array.isArray(value) &&
    value.length === 2 &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item));
}

function readUniformSourceValue(
  uniforms: PipelineUniforms,
  source: UniformValueSource
): unknown {
  if (source.kind === 'constant') {
    return source.value;
  }

  return readUniformField(uniforms, source.uniformBlock, source.uniformField);
}

function readWebGLBindingValue(
  uniforms: PipelineUniforms,
  binding: WebGLUniformBinding
): WebGLUniformValue {
  const value = readUniformSourceValue(uniforms, binding.source);

  if (binding.method === 'setUniform2f') {
    if (!isNumberPair(value)) {
      throw new Error(`WebGL uniform '${binding.name}' requires vec2 numeric source`);
    }

    return value;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`WebGL uniform '${binding.name}' requires numeric source`);
  }

  return value;
}

function createWebGLBindingWithValue(
  binding: WebGLUniformBinding
): WebGLUniformBindingWithValue {
  return {
    ...binding,
    readValue: (uniforms) => readWebGLBindingValue(uniforms, binding)
  };
}

function normalizeWebGLUniformBinding(
  input: unknown,
  defaultUniformBlock: string,
  passId: string
): WebGLUniformBindingWithValue {
  const context = `Render pass '${passId}' WebGL uniform binding`;
  if (!isRecord(input)) {
    throw new Error(`${context} must be an object`);
  }

  const name = getManifestString(input, 'name', context);
  const binding: WebGLUniformBinding = {
    name,
    method: normalizeWebGLUniformSetter(getManifestString(input, 'method', context), context),
    source: normalizeUniformValueSource(input.source, defaultUniformBlock, `${context} '${name}'`)
  };

  return createWebGLBindingWithValue(binding);
}

function getWebGLUniformBindingsFromManifest(
  pass: RenderPassDefinition
): {
  textureUniform: WebGLUniformBindingWithValue;
  additionalUniforms: readonly WebGLUniformBindingWithValue[];
} {
  const context = `Render pass '${pass.id}' WebGL uniform bindings`;
  const webglUniforms = pass.webgl2Uniforms as unknown;
  if (!isRecord(webglUniforms)) {
    throw new Error(`${context} are missing`);
  }

  const rawAdditional = webglUniforms.additional;
  if (!Array.isArray(rawAdditional)) {
    throw new Error(`${context} require array 'additional'`);
  }

  return {
    textureUniform: normalizeWebGLUniformBinding(
      getManifestRecord(webglUniforms, 'texture', context),
      pass.uniformBlock,
      pass.id
    ),
    additionalUniforms: rawAdditional.map((binding) => normalizeWebGLUniformBinding(
      binding,
      pass.uniformBlock,
      pass.id
    ))
  };
}

function writeWebGPUUniformMember(
  output: Float32Array,
  member: WebGPUUniformMember,
  uniforms: PipelineUniforms
): void {
  const outputIndex = member.offsetBytes / Float32Array.BYTES_PER_ELEMENT;
  if (!Number.isInteger(outputIndex)) {
    throw new Error(`WebGPU uniform member '${member.name}' offset must be 4-byte aligned`);
  }

  const value = readUniformSourceValue(uniforms, member.source);
  if (member.type === 'vec2<f32>') {
    if (!isNumberPair(value)) {
      throw new Error(`WebGPU uniform member '${member.name}' requires vec2 numeric source`);
    }

    output[outputIndex] = value[0];
    output[outputIndex + 1] = value[1];
    return;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`WebGPU uniform member '${member.name}' requires numeric source`);
  }

  output[outputIndex] = value;
}

function buildWebGPUDataBuilder(
  layout: WebGPUUniformLayout
): (uniforms: PipelineUniforms) => Float32Array {
  if (layout.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error(`WebGPU uniform layout for pass '${layout.passId}' must be 4-byte aligned`);
  }

  return (uniforms) => {
    const output = new Float32Array(layout.byteLength / Float32Array.BYTES_PER_ELEMENT);
    for (const member of layout.members) {
      writeWebGPUUniformMember(output, member, uniforms);
    }

    return output;
  };
}

function toSamplerPolicy(sampler: string): RenderPassHelpers['sampler'] {
  if (sampler === 'nearest' || sampler === 'linear') {
    return sampler;
  }

  throw new Error(`Invalid sampler policy '${sampler}'`);
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
    const layout = getWebGPULayoutFromManifest(pass);
    const webgl = getWebGLUniformBindingsFromManifest(pass);

    const isEnabled = buildEnablementPredicate(pass);
    const enablement = getEnablementFromManifest(pass);
    const buildData = buildWebGPUDataBuilder(layout);

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
