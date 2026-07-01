import type { PipelineUniforms } from '../domain/uniforms';
import type { RenderPreset } from '../domain/types';
import {
  normalizeUniformBlock,
  readUniformField,
  type RenderPassDefinition,
  type RenderPassEnablement,
  type UniformCompareOperator
} from '../domain/render-passes';

export type EnableableRenderPass = {
  isEnabled(uniforms: PipelineUniforms, preset: RenderPreset): boolean;
};

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
