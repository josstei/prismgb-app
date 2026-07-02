import type {
  RenderPassDefinition,
  RenderPassEnablement,
  RenderPassRuntimeBase,
  UniformBlock,
  UniformValueSource
} from '../domain/pass-specs';
import { RENDER_PASS_DEFINITIONS } from '../domain/pass-specs';
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
  kind: 'intermediate';
  index: number;
};

export type RenderPassPlanStep<TPass> = {
  pass: TPass;
  source: RenderPlanSource;
  target: RenderPlanTarget;
};

export type RenderPassPlan<TPass> = {
  steps: readonly RenderPassPlanStep<TPass>[];
  presentSource: RenderPlanSource;
};

export function compileRenderPasses<TBackendState>(
  compiler: BackendPassCompiler<TBackendState>
): readonly CompiledRenderPass<TBackendState>[] {
  return RENDER_PASS_DEFINITIONS.map((pass) => ({
    passId: pass.id,
    order: pass.order,
    enabledWhen: pass.enabledWhen,
    sampler: pass.sampler,
    isEnabled: buildRenderPassEnablementPredicate(pass),
    backend: compiler.compile(pass)
  }));
}

export function readUniformField(
  uniforms: PipelineUniforms,
  uniformBlock: UniformBlock,
  fieldName: string
): unknown {
  const blockValues = uniforms[uniformBlock];
  const record = blockValues as unknown as Record<string, unknown>;

  if (!Object.prototype.hasOwnProperty.call(record, fieldName)) {
    throw new Error(`Render pass spec references missing uniform field '${uniformBlock}.${fieldName}'`);
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

export function getRenderPassEnablement(pass: RenderPassDefinition): RenderPassEnablement {
  return pass.enabledWhen;
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

export function createRenderPassPlan<TPass>(
  passes: readonly TPass[],
  intermediateCount = 2
): RenderPassPlan<TPass> {
  if (intermediateCount < 1) {
    throw new Error('Render pass plan requires at least one intermediate target');
  }

  let currentSource: RenderPlanSource = { kind: 'source' };
  let outputIndex = 0;
  const steps: RenderPassPlanStep<TPass>[] = [];

  for (const pass of passes) {
    const target: RenderPlanTarget = { kind: 'intermediate', index: outputIndex };

    steps.push({
      pass,
      source: currentSource,
      target
    });

    currentSource = target;
    outputIndex = (outputIndex + 1) % intermediateCount;
  }

  return {
    steps,
    presentSource: currentSource
  };
}
