import manifest from './render-passes.json';
import type { PipelineUniforms } from './uniforms';

type RenderPassManifestShape = typeof manifest;
export type RenderPassDefinition = RenderPassManifestShape['passes'][number];
export type UniformBlock = keyof PipelineUniforms;

export type UniformValueSource = {
  kind: 'uniformField';
  uniformBlock: UniformBlock;
  uniformField: string;
} | {
  kind: 'constant';
  value: number;
};

export type UniformCompareOperator = '>' | '>=' | '<' | '<=' | '==' | '!=';

export type RenderPassEnablement = {
  kind: 'always';
} | {
  kind: 'uniformBoolean';
  uniformBlock: UniformBlock;
  uniformField: string;
} | {
  kind: 'uniformCompare';
  uniformBlock: UniformBlock;
  uniformField: string;
  operator: UniformCompareOperator;
  value: number;
} | {
  kind: 'all' | 'any';
  conditions: readonly RenderPassEnablement[];
};

export type SamplerPolicy = 'nearest' | 'linear';

export type RenderPassRuntimeBase = {
  passId: string;
  order: number;
  enabledWhen: RenderPassEnablement;
  outputsToCanvas: boolean;
  sampler: SamplerPolicy;
};

export const RenderPassManifest = manifest;

export const RENDER_PASS_DEFINITIONS = Object.freeze(
  [...RenderPassManifest.passes].sort((left, right) => left.order - right.order)
);

const MANIFEST_UNIFORM_BLOCKS = new Set(RenderPassManifest.passes.map((pass) => pass.uniformBlock));

export function normalizeUniformBlock(candidate: string): UniformBlock {
  if (MANIFEST_UNIFORM_BLOCKS.has(candidate)) {
    return candidate as UniformBlock;
  }

  throw new Error(`Invalid uniform block '${candidate}' in render pass manifest`);
}

export function readUniformField(
  uniforms: PipelineUniforms,
  uniformBlock: UniformBlock,
  fieldName: string
): unknown {
  const blockValues = uniforms[uniformBlock];
  const record = blockValues as unknown as Record<string, unknown>;

  if (!Object.prototype.hasOwnProperty.call(record, fieldName)) {
    throw new Error(`Render pass manifest references missing uniform field '${uniformBlock}.${fieldName}'`);
  }

  return record[fieldName];
}

export function readUniformSourceValue(
  uniforms: PipelineUniforms,
  source: UniformValueSource
): unknown {
  if (source.kind === 'constant') {
    return source.value;
  }

  return readUniformField(uniforms, source.uniformBlock, source.uniformField);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function getManifestString(
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

export function getManifestNumber(
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

export function getManifestRecord(
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

export function normalizeUniformValueSource(
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

export function toSamplerPolicy(sampler: string): SamplerPolicy {
  if (sampler === 'nearest' || sampler === 'linear') {
    return sampler;
  }

  throw new Error(`Invalid sampler policy '${sampler}'`);
}
