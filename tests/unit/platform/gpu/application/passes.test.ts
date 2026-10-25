import { describe, expect, it } from 'vitest';
import { createRenderPassPlan, getEnabledRenderPasses } from '../../../../../src/platform/gpu/application/passes';
import { PASS_SPECS } from '../../../../../src/platform/gpu/domain/pass-specs';
import { buildUniforms } from '../../../../../src/platform/gpu/application/uniform-builder';
import { getPreset } from '../../../../../src/platform/gpu/application/catalog';

function pass(id: string): { id: string } {
  return { id };
}

describe('render pass enablement', () => {
  it.each([
    ['performance', ['pixel-upscale']],
    ['true-color', ['pixel-upscale', 'color-elevation']],
    ['vibrant', ['pixel-upscale', 'unsharp-mask', 'color-elevation']],
    ['pixel', ['pixel-upscale', 'color-elevation', 'crt-lcd']],
    ['vintage', ['pixel-upscale', 'color-elevation', 'crt-lcd']],
    ['hi-def', ['pixel-upscale', 'unsharp-mask', 'color-elevation']]
  ])('preserves the enabled passes for %s', (presetId, expectedPassIds) => {
    const uniforms = buildUniforms({
      preset: getPreset(presetId as string)!, nativeWidth: 160, nativeHeight: 144,
      outputWidth: 640, outputHeight: 576, brightness: 1
    });
    expect(getEnabledRenderPasses(PASS_SPECS, uniforms).map((pass) => pass.id)).toEqual(expectedPassIds);
  });
});

describe('createRenderPassPlan', () => {
  it('alternates intermediate targets across every enabled pass', () => {
    const plan = createRenderPassPlan([
      pass('pixel-upscale'),
      pass('unsharp-mask'),
      pass('color-elevation'),
      pass('crt-lcd')
    ]);

    expect(plan.steps.map((step) => ({
      pass: step.pass.id,
      source: step.source,
      target: step.target
    }))).toEqual([
      { pass: 'pixel-upscale', source: { kind: 'source' }, target: { kind: 'intermediate', index: 0 } },
      { pass: 'unsharp-mask', source: { kind: 'intermediate', index: 0 }, target: { kind: 'intermediate', index: 1 } },
      { pass: 'color-elevation', source: { kind: 'intermediate', index: 1 }, target: { kind: 'intermediate', index: 0 } },
      { pass: 'crt-lcd', source: { kind: 'intermediate', index: 0 }, target: { kind: 'intermediate', index: 1 } }
    ]);
    expect(plan.presentSource).toEqual({ kind: 'intermediate', index: 1 });
  });

  it('presents from the last written intermediate', () => {
    const plan = createRenderPassPlan([
      pass('pixel-upscale'),
      pass('color-elevation')
    ]);

    expect(plan.steps.at(-1)?.target).toEqual({ kind: 'intermediate', index: 1 });
    expect(plan.presentSource).toEqual({ kind: 'intermediate', index: 1 });
  });

  it('presents the source directly when there are no enabled passes', () => {
    const plan = createRenderPassPlan([]);

    expect(plan.steps).toEqual([]);
    expect(plan.presentSource).toEqual({ kind: 'source' });
  });

  it('fails closed when no intermediate target is available', () => {
    expect(() => createRenderPassPlan([pass('pixel-upscale')], 0)).toThrow(
      'Render pass plan requires at least one intermediate target'
    );
  });
});
