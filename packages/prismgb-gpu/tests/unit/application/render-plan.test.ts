import { describe, expect, it } from 'vitest';
import { createRenderPassPlan, type PlannedRenderPass } from '@/application/render-plan';

function pass(id: string, outputsToCanvas = false): PlannedRenderPass & { id: string } {
  return { id, outputsToCanvas };
}

describe('createRenderPassPlan', () => {
  it('alternates intermediate targets until a pass outputs to canvas', () => {
    const plan = createRenderPassPlan([
      pass('pixel-upscale'),
      pass('unsharp-mask'),
      pass('color-elevation'),
      pass('crt-lcd', true)
    ]);

    expect(plan.steps.map((step) => ({
      pass: step.pass.id,
      source: step.source,
      target: step.target
    }))).toEqual([
      { pass: 'pixel-upscale', source: { kind: 'source' }, target: { kind: 'intermediate', index: 0 } },
      { pass: 'unsharp-mask', source: { kind: 'intermediate', index: 0 }, target: { kind: 'intermediate', index: 1 } },
      { pass: 'color-elevation', source: { kind: 'intermediate', index: 1 }, target: { kind: 'intermediate', index: 0 } },
      { pass: 'crt-lcd', source: { kind: 'intermediate', index: 0 }, target: { kind: 'canvas' } }
    ]);
    expect(plan.finalCanvasCopy).toEqual({
      required: false,
      source: { kind: 'intermediate', index: 0 }
    });
  });

  it('requests final canvas copy from the last intermediate when no pass outputs to canvas', () => {
    const plan = createRenderPassPlan([
      pass('pixel-upscale'),
      pass('color-elevation')
    ]);

    expect(plan.steps.at(-1)?.target).toEqual({ kind: 'intermediate', index: 1 });
    expect(plan.finalCanvasCopy).toEqual({
      required: true,
      source: { kind: 'intermediate', index: 1 }
    });
  });

  it('does not request copy when there are no enabled passes', () => {
    const plan = createRenderPassPlan([]);

    expect(plan.steps).toEqual([]);
    expect(plan.finalCanvasCopy).toEqual({
      required: false,
      source: { kind: 'source' }
    });
  });

  it('fails closed when no intermediate target is available', () => {
    expect(() => createRenderPassPlan([pass('pixel-upscale')], 0)).toThrow(
      'Render pass plan requires at least one intermediate target'
    );
  });
});
