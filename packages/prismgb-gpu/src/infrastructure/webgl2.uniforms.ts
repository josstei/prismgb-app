import { buildRenderPassEnablementPredicate, getRenderPassEnablement } from '../application/render-pass-enablement';
import type { PipelineUniforms } from '../domain/uniforms';
import type { RenderPreset } from '../domain/types';
import {
  getManifestRecord,
  getManifestString,
  isRecord,
  normalizeUniformValueSource,
  readUniformSourceValue,
  RENDER_PASS_DEFINITIONS,
  toSamplerPolicy,
  type RenderPassRuntimeBase,
  type UniformValueSource
} from '../domain/render-passes';
import type { RenderPassDefinition } from '../domain/render-passes';

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

export interface WebGLPassProgram {
  setUniform1i(name: string, value: number): void;
  setUniform1f(name: string, value: number): void;
  setUniform2f(name: string, x: number, y: number): void;
}

export interface WebGL2RenderPass extends RenderPassRuntimeBase {
  isEnabled(uniforms: PipelineUniforms, preset: RenderPreset): boolean;
  webgl: {
    vertexShaderFile: string;
    fragmentShaderFile: string;
    textureUniform: WebGLUniformBindingWithValue;
    additionalUniforms: readonly WebGLUniformBindingWithValue[];
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

export function getWebGLUniformBindings(
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

export function applyWebGLPassUniforms(
  program: WebGLPassProgram,
  pass: WebGL2RenderPass,
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

function createWebGL2RenderPasses(): readonly WebGL2RenderPass[] {
  return RENDER_PASS_DEFINITIONS.map((pass) => {
    const webgl = getWebGLUniformBindings(pass);

    return {
      passId: pass.id,
      order: pass.order,
      enabledWhen: getRenderPassEnablement(pass),
      outputsToCanvas: pass.outputsToCanvas ?? false,
      sampler: toSamplerPolicy(pass.sampler),
      isEnabled: buildRenderPassEnablementPredicate(pass),
      webgl: {
        vertexShaderFile: pass.webgl2VertexShader,
        fragmentShaderFile: pass.webgl2FragmentShader,
        textureUniform: webgl.textureUniform,
        additionalUniforms: webgl.additionalUniforms
      }
    };
  });
}

export const WEBGL2_RENDER_PASSES = createWebGL2RenderPasses();
