import { describe, expect, it } from 'vitest';
import { RenderPassManifest } from '@/domain/render-passes';
import { buildUniforms } from '@/application/uniform-builder';
import { getPreset } from '@/application/preset-catalog';
import { WEBGPU_RENDER_PASSES } from '@/infrastructure/webgpu.uniforms';
import { WEBGL2_RENDER_PASSES, applyWebGLPassUniforms } from '@/infrastructure/webgl2.uniforms';
import type { PipelineUniforms } from '@/domain/uniforms';

type WebGLUniformCall = {
  method: 'setUniform1i' | 'setUniform1f' | 'setUniform2f';
  name: string;
  args: number[];
};

type ContractUniformSource = {
  kind: 'constant';
  value: number;
} | {
  kind: 'uniformField';
  uniformBlock?: string;
  uniformField: string;
};

type ContractWebGLUniformBinding = {
  method: WebGLUniformCall['method'];
  name: string;
  source: ContractUniformSource;
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
    preset: getPreset('vibrant')!,
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

function readContractUniformSource(
  uniforms: PipelineUniforms,
  source: ContractUniformSource,
  defaultUniformBlock: string
): unknown {
  if (source.kind === 'constant') {
    return source.value;
  }

  const uniformBlock = source.uniformBlock ?? defaultUniformBlock;
  const blockValues = uniforms[uniformBlock as keyof PipelineUniforms] as unknown as Record<string, unknown>;
  return blockValues[source.uniformField];
}

function contractWebGLBindings(pass: typeof RenderPassManifest.passes[number]): ContractWebGLUniformBinding[] {
  return [
    pass.webgl2Uniforms.texture,
    ...pass.webgl2Uniforms.additional
  ] as ContractWebGLUniformBinding[];
}

function expectedWebGLCalls(uniforms: PipelineUniforms): WebGLUniformCall[] {
  const calls: WebGLUniformCall[] = [];
  const sortedPasses = [...RenderPassManifest.passes].sort((left, right) => left.order - right.order);

  for (const pass of sortedPasses) {
    for (const binding of contractWebGLBindings(pass)) {
      const value = readContractUniformSource(uniforms, binding.source, pass.uniformBlock);
      calls.push({
        method: binding.method,
        name: binding.name,
        args: callArgsFromBinding(binding.method, value)
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

describe('render-pass materializers', () => {
  it('matches WebGPU uniform payload byte size to declared layout size', () => {
    const uniforms = buildFixtureUniforms();

    for (const pass of WEBGPU_RENDER_PASSES) {
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

  it('derives uniform layout and WebGL binding metadata from the render-pass manifest', () => {
    for (const manifestPass of RenderPassManifest.passes) {
      const webgpuPass = WEBGPU_RENDER_PASSES.find((pass) => pass.passId === manifestPass.id)!;
      const webglPass = WEBGL2_RENDER_PASSES.find((pass) => pass.passId === manifestPass.id)!;

      expect(webgpuPass.webgpu.layout.byteLength).toBe(manifestPass.webgpuUniformLayout.byteLength);
      expect(webgpuPass.webgpu.layout.members).toEqual(
        manifestPass.webgpuUniformLayout.members.map((member) => ({
          ...member,
          source: member.source.kind === 'uniformField'
            ? {
              ...member.source,
              uniformBlock: 'uniformBlock' in member.source
                ? member.source.uniformBlock
                : manifestPass.uniformBlock
            }
            : member.source
        }))
      );
      expect([
        webglPass.webgl.textureUniform,
        ...webglPass.webgl.additionalUniforms
      ].map((binding) => ({
        method: binding.method,
        name: binding.name,
        source: binding.source
      }))).toEqual(
        contractWebGLBindings(manifestPass).map((binding) => ({
          ...binding,
          source: binding.source.kind === 'uniformField'
            ? {
              ...binding.source,
              uniformBlock: binding.source.uniformBlock ?? manifestPass.uniformBlock
            }
            : binding.source
        }))
      );
    }
  });

  it('maps all WebGL uniform setters and values from manifest bindings', () => {
    const uniforms = buildFixtureUniforms();
    const expectedCalls = expectedWebGLCalls(uniforms);
    const { calls, program } = makeWebGLProgramSpy();

    for (const pass of WEBGL2_RENDER_PASSES) {
      applyWebGLPassUniforms(program, pass, uniforms);
    }

    expect(calls).toEqual(expectedCalls);
  });
});
