import { describe, expect, it } from 'vitest';
import {
  compileRenderPasses,
  createRenderPassPlan,
  getEnabledRenderPasses,
  readFiniteNumber,
  readFiniteNumberPair,
  readUniformSourceValue
} from '../../../../../src/platform/gpu/application/passes';
import { PASS_SPECS } from '../../../../../src/platform/gpu/domain/pass-specs';
import { buildUniforms } from '../../../../../src/platform/gpu/application/uniform-builder';
import { getPreset } from '../../../../../src/platform/gpu/application/catalog';
import type { PipelineUniforms } from '../../../../../src/platform/gpu/domain/uniforms';

const WEBGPU_UNIFORM_TYPE_BYTES: Record<string, number> = {
  'f32': 4,
  'vec2<f32>': 8
};

const WEBGPU_UNIFORM_TYPE_ALIGNMENT: Record<string, number> = {
  'f32': 4,
  'vec2<f32>': 8
};

function alignTo(offset: number, alignment: number): number {
  return Math.ceil(offset / alignment) * alignment;
}

function pass(id: string): { id: string } {
  return { id };
}

function buildFixtureUniforms(presetId = 'vibrant'): PipelineUniforms {
  const preset = getPreset(presetId)!;

  return buildUniforms({
    preset,
    nativeWidth: 160,
    nativeHeight: 144,
    outputWidth: 640,
    outputHeight: 576,
    brightness: 1
  });
}

function compileWebGpuContractPasses() {
  return compileRenderPasses({
    backendName: 'webgpu-test',
    compile: (manifestPass) => ({
      shaderFile: manifestPass.webgpuShader,
      layout: manifestPass.webgpuUniformLayout,
      uniformData: (uniforms: PipelineUniforms) => {
        const output = new Float32Array(
          manifestPass.webgpuUniformLayout.byteLength / Float32Array.BYTES_PER_ELEMENT
        );

        for (const member of manifestPass.webgpuUniformLayout.members) {
          const outputIndex = member.offsetBytes / Float32Array.BYTES_PER_ELEMENT;
          const value = readUniformSourceValue(uniforms, member.source);

          if (member.type === 'vec2<f32>') {
            const [x, y] = readFiniteNumberPair(value, `member ${member.name}`);
            output[outputIndex] = x;
            output[outputIndex + 1] = y;
          } else {
            output[outputIndex] = readFiniteNumber(value, `member ${member.name}`);
          }
        }

        return output;
      }
    })
  });
}

describe('compileRenderPasses', () => {
  it('resolves enabled passes from representative presets', () => {
    const cases: Array<{ presetId: string; expectedPassIds: string[] }> = [
      { presetId: 'performance', expectedPassIds: ['pixel-upscale'] },
      { presetId: 'vibrant', expectedPassIds: ['pixel-upscale', 'unsharp-mask', 'color-elevation'] },
      { presetId: 'pixel', expectedPassIds: ['pixel-upscale', 'color-elevation', 'crt-lcd'] },
      { presetId: 'vintage', expectedPassIds: ['pixel-upscale', 'color-elevation', 'crt-lcd'] },
      { presetId: 'hi-def', expectedPassIds: ['pixel-upscale', 'unsharp-mask', 'color-elevation'] }
    ];
    const compiledPasses = compileWebGpuContractPasses();

    for (const { presetId, expectedPassIds } of cases) {
      const preset = getPreset(presetId)!;
      const uniforms = buildFixtureUniforms(presetId);

      expect(getEnabledRenderPasses(compiledPasses, uniforms, preset).map((candidate) => candidate.passId)).toEqual(expectedPassIds);
    }
  });

  it('derives pass order and backend state from the manifest once', () => {
    const compiledPasses = compileWebGpuContractPasses();
    const contractOrder = [...PASS_SPECS].sort((left, right) => left.order - right.order);

    expect(compiledPasses.map((candidate) => candidate.passId)).toEqual(contractOrder.map((candidate) => candidate.id));
    expect(compiledPasses.map((candidate) => candidate.backend.shaderFile)).toEqual(
      contractOrder.map((candidate) => candidate.webgpuShader)
    );
  });

  it('keeps compiled WebGPU uniform payload sizes aligned to declared layout sizes', () => {
    const uniforms = buildFixtureUniforms();

    for (const pass of compileWebGpuContractPasses()) {
      const payload = pass.backend.uniformData(uniforms);
      expect(payload.byteLength).toBe(pass.backend.layout.byteLength);

      let offset = 0;
      const maxAlignment = pass.backend.layout.members.reduce(
        (nextAlignment, member) => Math.max(nextAlignment, WEBGPU_UNIFORM_TYPE_ALIGNMENT[member.type]),
        4
      );

      for (const member of pass.backend.layout.members) {
        const alignedOffset = alignTo(offset, WEBGPU_UNIFORM_TYPE_ALIGNMENT[member.type]);

        expect(member.byteLength).toBe(WEBGPU_UNIFORM_TYPE_BYTES[member.type]);
        expect(member.offsetBytes).toBe(alignedOffset);
        expect(member.offsetBytes).toBeGreaterThanOrEqual(offset);
        expect(member.offsetBytes).toBeLessThanOrEqual(alignedOffset);
        offset = alignedOffset + member.byteLength;
      }

      expect(pass.backend.layout.byteLength).toBe(alignTo(offset, maxAlignment));
      expect(pass.backend.layout.byteLength % 4).toBe(0);
    }
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
