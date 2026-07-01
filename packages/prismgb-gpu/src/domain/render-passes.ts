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
