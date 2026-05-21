import { describe, expect, it } from 'vitest';
import { RenderPassContract } from '@/domain/render-passes/render-passes.contract';
import {
  applyWebGLPassUniforms,
  getEnabledRenderPasses,
  RENDER_PASS_HELPERS
} from '@/domain/render-passes/render-passes-helpers';
import { buildUniforms } from '@/application/uniform-builder';
import { PresetRegistry, BUILT_IN_PRESETS } from '@/domain/presets';
import { loadShaders as loadWebGPULoaders } from '@/infrastructure/webgpu/webgpu-shader-loader';
import { loadShaders as loadWebGL2Loaders } from '@/infrastructure/webgl2/webgl2-shader-loader';
import type { PipelineUniforms } from '@/domain/shaders';

PresetRegistry.registerMany(BUILT_IN_PRESETS);

type WebGLUniformCall = {
  method: 'setUniform1i' | 'setUniform1f' | 'setUniform2f';
  name: string;
  args: number[];
};

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

function buildFixtureUniforms(): PipelineUniforms {
  return buildUniforms({
    preset: PresetRegistry.get('vibrant')!,
    nativeWidth: 160,
    nativeHeight: 144,
    outputWidth: 640,
    outputHeight: 576,
    brightness: 1
  });
}

function callArgsFromBinding(bindingMethod: string, value: unknown): number[] {
  if (bindingMethod === 'setUniform2f') {
    return [...(value as [number, number])];
  }

  return [value as number];
}

function expectedWebGLCalls(uniforms: PipelineUniforms): WebGLUniformCall[] {
  const calls: WebGLUniformCall[] = [];
  for (const pass of RENDER_PASS_HELPERS) {
    const allBindings = [
      pass.webgl.textureUniform,
      ...pass.webgl.additionalUniforms
    ];

    for (const binding of allBindings) {
      calls.push({
        method: binding.method,
        name: binding.name,
        args: callArgsFromBinding(binding.method, binding.readValue(uniforms))
      });
    }
  }

  return calls;
}

function makeWebGLProgramSpy() {
  const calls: WebGLUniformCall[] = [];
  return {
    calls,
    program: {
      setUniform1i: (name: string, value: number): void => {
        calls.push({ method: 'setUniform1i', name, args: [value] });
      },
      setUniform1f: (name: string, value: number): void => {
        calls.push({ method: 'setUniform1f', name, args: [value] });
      },
      setUniform2f: (name: string, x: number, y: number): void => {
        calls.push({ method: 'setUniform2f', name, args: [x, y] });
      }
    }
  };
}

describe('RENDER_PASS_HELPERS', () => {
  it('marks the render-pass contract as enforced runtime ownership', () => {
    expect(RenderPassContract.mode).toBe('enforced');

    for (const pass of RenderPassContract.passes) {
      expect(pass.enabledWhen).toEqual(expect.objectContaining({ kind: expect.any(String) }));
      expect(typeof pass.enabledWhen).not.toBe('string');
    }
  });

  it('orders helpers by contract pass order and preserves manifest ownership', () => {
    const contractOrder = [...RenderPassContract.passes].sort((left, right) => left.order - right.order);
    const actualOrder = RENDER_PASS_HELPERS.map((pass) => pass.passId);

    expect(RENDER_PASS_HELPERS).toHaveLength(RenderPassContract.passes.length);
    expect(actualOrder).toEqual(contractOrder.map((pass) => pass.id));
  });

  it('resolves enabled passes from representative presets', () => {
    const cases: Array<{ presetId: string; expectedPassIds: string[] }> = [
      { presetId: 'performance', expectedPassIds: ['pixel-upscale'] },
      { presetId: 'vibrant', expectedPassIds: ['pixel-upscale', 'unsharp-mask', 'color-elevation'] },
      { presetId: 'pixel', expectedPassIds: ['pixel-upscale', 'color-elevation', 'crt-lcd'] },
      { presetId: 'vintage', expectedPassIds: ['pixel-upscale', 'color-elevation', 'crt-lcd'] },
      { presetId: 'hi-def', expectedPassIds: ['pixel-upscale', 'unsharp-mask', 'color-elevation'] }
    ];

    for (const { presetId, expectedPassIds } of cases) {
      const preset = PresetRegistry.get(presetId)!;
      const uniforms = buildUniforms({
        preset,
        nativeWidth: 160,
        nativeHeight: 144,
        outputWidth: 640,
        outputHeight: 576,
        brightness: 1
      });

      expect(getEnabledRenderPasses(uniforms, preset).map((pass) => pass.passId)).toEqual(expectedPassIds);
    }
  });

  it('matches WebGPU uniform payload byte size to declared layout size', () => {
    const uniforms = buildFixtureUniforms();

    for (const pass of RENDER_PASS_HELPERS) {
      const payload = pass.webgpu.uniformData(uniforms);
      expect(payload.byteLength).toBe(pass.webgpu.layout.byteLength);

      let offset = 0;
      const maxAlignment = pass.webgpu.layout.members.reduce(
        (nextAlignment, member) => Math.max(nextAlignment, WEBGPU_UNIFORM_TYPE_ALIGNMENT[member.type]),
        4
      );

      for (const member of pass.webgpu.layout.members) {
        const alignedOffset = alignTo(offset, WEBGPU_UNIFORM_TYPE_ALIGNMENT[member.type]);

        expect(member.byteLength).toBe(WEBGPU_UNIFORM_TYPE_BYTES[member.type]);
        expect(member.offsetBytes).toBe(alignedOffset);
        expect(member.offsetBytes).toBeGreaterThanOrEqual(offset);
        expect(member.offsetBytes).toBeLessThanOrEqual(alignedOffset);
        offset = alignedOffset + member.byteLength;
      }

      expect(pass.webgpu.layout.byteLength).toBe(alignTo(offset, maxAlignment));
      expect(pass.webgpu.layout.byteLength % 4).toBe(0);
    }
  });

  it('owns shader file routing through WebGPU and WebGL2 loaders', () => {
    const webgpuShaders = Object.keys(loadWebGPULoaders().byFileName).sort();
    const webgl2Shaders = Object.keys(loadWebGL2Loaders().byFileName).sort();
    const passBasedWebGLFiles = [...new Set(
      RenderPassContract.passes.flatMap((pass) => [pass.webgl2VertexShader, pass.webgl2FragmentShader])
    )].sort();
    const passBasedWebGPUFiles = RenderPassContract.passes.map((pass) => pass.webgpuShader).sort();
    const utilityShaderFiles = [...new Set(RenderPassContract.utilityShaders.map((shader) => shader.file))].sort();

    const expectedWebGL2Files = [...new Set([...passBasedWebGLFiles, ...utilityShaderFiles])].sort();

    for (const pass of RENDER_PASS_HELPERS) {
      expect(webgpuShaders).toContain(pass.webgpu.shaderFile);
      expect(webgl2Shaders).toContain(pass.webgl.vertexShaderFile);
      expect(webgl2Shaders).toContain(pass.webgl.fragmentShaderFile);
    }

    expect(webgpuShaders).toEqual(passBasedWebGPUFiles);
    expect(webgl2Shaders).toEqual(expectedWebGL2Files);
  });

  it('maps all WebGL uniform setters and values from manifest bindings', () => {
    const uniforms = buildFixtureUniforms();
    const expectedCalls = expectedWebGLCalls(uniforms);
    const { calls, program } = makeWebGLProgramSpy();

    for (const pass of RENDER_PASS_HELPERS) {
      applyWebGLPassUniforms(program, pass, uniforms);
    }

    expect(calls).toEqual(expectedCalls);
  });
});
