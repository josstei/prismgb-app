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
