import type { RenderPassDefinition, WebGpuUniformLayout } from '../domain/pass-specs';
import type { PipelineUniforms } from '../domain/uniforms';

export function packUniforms(
  layout: WebGpuUniformLayout,
  uniforms: PipelineUniforms,
  output: Float32Array
): void {
  for (const member of layout.members) {
    const index = member.offsetBytes / Float32Array.BYTES_PER_ELEMENT;
    if (member.type === 'vec2<f32>') {
      const [x, y] = member.read(uniforms);
      output[index] = x;
      output[index + 1] = y;
    } else {
      output[index] = member.read(uniforms);
    }
  }
}

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

type RenderPassPlanStep<TPass> = {
  pass: TPass;
  source: RenderPlanSource;
  target: RenderPlanTarget;
};

export type RenderPassPlan<TPass> = {
  steps: readonly RenderPassPlanStep<TPass>[];
  presentSource: RenderPlanSource;
};

export function getEnabledRenderPasses<T extends Pick<RenderPassDefinition, 'isEnabled'>>(
  passes: readonly T[],
  uniforms: PipelineUniforms
): T[] {
  return passes.filter((pass) => pass.isEnabled(uniforms));
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
