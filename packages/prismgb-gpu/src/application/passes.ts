import type {
  RenderPassDefinition,
  RenderPassEnablement,
  RenderPassRuntimeBase,
  SamplerPolicy,
  UniformBlock,
  UniformCompareOperator,
  UniformValueSource
} from '../domain/render-passes';
import { RENDER_PASS_DEFINITIONS } from '../domain/render-passes';
import type { PipelineUniforms } from '../domain/uniforms';
import type { RenderPreset } from '../domain/types';

export type CompiledRenderPass<TBackendState> = RenderPassRuntimeBase & {
  readonly isEnabled: (uniforms: PipelineUniforms, preset: RenderPreset) => boolean;
  readonly backend: TBackendState;
};

export type BackendPassCompiler<TBackendState> = {
  readonly backendName: string;
  compile(pass: RenderPassDefinition): TBackendState;
};

export type EnableableRenderPass = {
  isEnabled(uniforms: PipelineUniforms, preset: RenderPreset): boolean;
};

export type RenderPlanSource = {
  kind: 'source';
} | {
  kind: 'intermediate';
  index: number;
};

export type RenderPlanTarget = {
  kind: 'canvas';
} | {
  kind: 'intermediate';
  index: number;
};

export type RenderPassPlanStep<TPass> = {
  pass: TPass;
  source: RenderPlanSource;
  target: RenderPlanTarget;
};

export type FinalCanvasCopyPlan = {
  required: boolean;
  source: RenderPlanSource;
};

export type RenderPassPlan<TPass> = {
  steps: readonly RenderPassPlanStep<TPass>[];
  finalCanvasCopy: FinalCanvasCopyPlan;
};

export type PlannedRenderPass = {
  outputsToCanvas: boolean;
};

const MANIFEST_UNIFORM_BLOCKS = new Set(RENDER_PASS_DEFINITIONS.map((pass) => pass.uniformBlock));

export function compileRenderPasses<TBackendState>(
  compiler: BackendPassCompiler<TBackendState>
): readonly CompiledRenderPass<TBackendState>[] {
  return RENDER_PASS_DEFINITIONS.map((pass) => ({
    passId: pass.id,
    order: pass.order,
    enabledWhen: getRenderPassEnablement(pass),
    outputsToCanvas: pass.outputsToCanvas ?? false,
    sampler: toSamplerPolicy(pass.sampler),
    isEnabled: buildRenderPassEnablementPredicate(pass),
    backend: compiler.compile(pass)
  }));
}

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

export function readFiniteNumber(value: unknown, context: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${context} requires numeric source`);
  }

  return value;
}

export function readFiniteNumberPair(value: unknown, context: string): readonly [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`${context} requires vec2 numeric source`);
  }

  return [
    readFiniteNumber(value[0], context),
    readFiniteNumber(value[1], context)
  ];
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

export function getRenderPassEnablement(pass: RenderPassDefinition): RenderPassEnablement {
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
        || typeof rawOperator !== 'string'
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

function isSupportedCompareOperator(operator: string): operator is UniformCompareOperator {
  return operator === '>' || operator === '>=' || operator === '<' || operator === '<=' || operator === '==' || operator === '!=';
}

export function evaluateRenderPassEnablement(
  enablement: RenderPassEnablement,
  uniforms: PipelineUniforms,
  _preset: RenderPreset
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
        default:
          throw new Error(`Unsupported uniformCompare operator '${enablement.operator}'`);
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
  }
}

export function buildRenderPassEnablementPredicate(
  pass: RenderPassDefinition
): (uniforms: PipelineUniforms, preset: RenderPreset) => boolean {
  const enablement = getRenderPassEnablement(pass);
  return (uniforms, preset) => evaluateRenderPassEnablement(enablement, uniforms, preset);
}

export function isRenderPassEnabled<T extends EnableableRenderPass>(
  pass: T,
  uniforms: PipelineUniforms,
  preset: RenderPreset
): boolean {
  return pass.isEnabled(uniforms, preset);
}

export function getEnabledRenderPasses<T extends EnableableRenderPass>(
  passes: readonly T[],
  uniforms: PipelineUniforms,
  preset: RenderPreset
): T[] {
  return passes.filter((pass) => isRenderPassEnabled(pass, uniforms, preset));
}

export function createRenderPassPlan<TPass extends PlannedRenderPass>(
  passes: readonly TPass[],
  intermediateCount = 2
): RenderPassPlan<TPass> {
  if (intermediateCount < 1) {
    throw new Error('Render pass plan requires at least one intermediate target');
  }

  let currentSource: RenderPlanSource = { kind: 'source' };
  let outputIndex = 0;
  let renderedToCanvas = false;
  const steps: RenderPassPlanStep<TPass>[] = [];

  for (const pass of passes) {
    const target: RenderPlanTarget = pass.outputsToCanvas
      ? { kind: 'canvas' }
      : { kind: 'intermediate', index: outputIndex };

    steps.push({
      pass,
      source: currentSource,
      target
    });

    if (target.kind === 'canvas') {
      renderedToCanvas = true;
      break;
    }

    currentSource = target;
    outputIndex = (outputIndex + 1) % intermediateCount;
  }

  return {
    steps,
    finalCanvasCopy: {
      required: !renderedToCanvas && currentSource.kind === 'intermediate',
      source: currentSource
    }
  };
}
