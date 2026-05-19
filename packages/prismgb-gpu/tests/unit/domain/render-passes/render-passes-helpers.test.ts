import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RenderPassContract } from '@/domain/render-passes/render-passes.contract';
import { RENDER_PASS_HELPERS } from '@/domain/render-passes/render-passes-helpers';

describe('RENDER_PASS_HELPERS', () => {
  it('matches contract pass metadata for each render pass', () => {
    expect(RENDER_PASS_HELPERS).toHaveLength(RenderPassContract.passes.length);

    const helpersByPassId = new Map(RENDER_PASS_HELPERS.map((entry) => [entry.passId, entry]));

    for (const pass of RenderPassContract.passes) {
      const helper = helpersByPassId.get(pass.id);
      expect(helper).toBeDefined();
      expect(helper?.passId).toBe(pass.id);
      expect(helper?.order).toBe(pass.order);
      expect(helper?.webgpu.uniformBlock).toBe(pass.uniformBlock);
      expect(helper?.webgpu.passId).toBe(pass.id);
      expect(helper?.webgl).toBeDefined();
      expect(helper?.alwaysEnabled).toBe(pass.alwaysEnabled);
      expect(helper?.enabledWhen).toBe(pass.enabledWhen);
    }
  });

  it('contains WebGPU byte layout metadata consistent with uniform upload shape', () => {
    const bytesByPass = {
      upscale: 32,
      unsharp: 16,
      color: 32,
      crt: 32
    };

    for (const [uniformBlock, expectedByteLength] of Object.entries(bytesByPass)) {
      const helper = RENDER_PASS_HELPERS.find((entry) => entry.webgpu.uniformBlock === uniformBlock);
      expect(helper).toBeDefined();
      expect(helper?.webgpu.byteLength).toBe(expectedByteLength);

      const byteLengthFromMembers = helper!.webgpu.members.reduce(
        (max, member) => Math.max(max, member.offsetBytes + member.byteLength),
        0
      );
      expect(helper?.webgpu.byteLength).toBe(byteLengthFromMembers);
    }
  });

  it('maps WebGL uniform setters to hand-written pass use sites', () => {
    const setUniformPattern = (name: string, method?: string): RegExp => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (method) {
        return new RegExp(`\\.${method}\\(\\s*['\\\"]${escaped}['\\\"]`, 'g');
      }
      return new RegExp(`setUniform\\w*\\(\\s*['\\\"]${escaped}['\\\"]`, 'g');
    };

    const source = readFileSync(
      join(process.cwd(), 'src/infrastructure/webgl2/webgl2-pipeline.ts'),
      'utf8'
    );

    for (const helper of RENDER_PASS_HELPERS) {
      const allUniforms = new Set([
        helper.webgl.samplerUniform.name,
        helper.webgl.inputUniform.name,
        ...helper.webgl.additionalUniforms.map((uniform) => uniform.name)
      ]);

      for (const uniformName of allUniforms) {
        expect(setUniformPattern(uniformName).test(source)).toBe(true);
      }

      expect(setUniformPattern(helper.webgl.samplerUniform.name, helper.webgl.samplerUniform.method).test(source)).toBe(true);
      expect(setUniformPattern(helper.webgl.inputUniform.name, helper.webgl.inputUniform.method).test(source)).toBe(true);

      for (const uniform of helper.webgl.additionalUniforms) {
        expect(setUniformPattern(uniform.name, uniform.method).test(source)).toBe(true);
      }
    }
  });
});
