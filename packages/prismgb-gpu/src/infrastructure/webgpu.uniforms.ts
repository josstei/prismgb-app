import { buildRenderPassEnablementPredicate, getRenderPassEnablement } from '../application/render-pass-enablement';
import type { PipelineUniforms } from '../domain/uniforms';
import type { RenderPreset } from '../domain/types';
import {
  getManifestNumber,
  getManifestString,
  isRecord,
  normalizeUniformBlock,
  normalizeUniformValueSource,
  readUniformSourceValue,
  RENDER_PASS_DEFINITIONS,
  toSamplerPolicy,
  type RenderPassRuntimeBase,
  type UniformValueSource
} from '../domain/render-passes';
import type { RenderPassDefinition } from '../domain/render-passes';

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

export interface WebGPURenderPass extends RenderPassRuntimeBase {
  isEnabled(uniforms: PipelineUniforms, preset: RenderPreset): boolean;
  webgpu: {
    shaderFile: string;
    layout: WebGPUUniformLayout;
    uniformData(uniforms: PipelineUniforms): Float32Array;
  };
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

export function getWebGPUUniformLayout(pass: RenderPassDefinition): WebGPUUniformLayout {
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

function isNumberPair(value: unknown): value is readonly [number, number] {
  return Array.isArray(value) &&
    value.length === 2 &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item));
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

export function buildWebGPUUniformDataBuilder(
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

function createWebGPURenderPasses(): readonly WebGPURenderPass[] {
  return RENDER_PASS_DEFINITIONS.map((pass) => {
    const layout = getWebGPUUniformLayout(pass);

    return {
      passId: pass.id,
      order: pass.order,
      enabledWhen: getRenderPassEnablement(pass),
      outputsToCanvas: pass.outputsToCanvas ?? false,
      sampler: toSamplerPolicy(pass.sampler),
      isEnabled: buildRenderPassEnablementPredicate(pass),
      webgpu: {
        shaderFile: pass.webgpuShader,
        layout: { ...layout },
        uniformData: buildWebGPUUniformDataBuilder(layout)
      }
    };
  });
}

export const WEBGPU_RENDER_PASSES = createWebGPURenderPasses();
