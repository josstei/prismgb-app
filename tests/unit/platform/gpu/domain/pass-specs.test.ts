import { describe, expect, it } from 'vitest';
import { PASS_SPECS } from '../../../../../src/platform/gpu/domain/pass-specs';
import { packUniforms } from '../../../../../src/platform/gpu/application/passes';
import { loadWebGpuShaders } from '../../../../../src/platform/gpu/infrastructure/shaders';
import { createPipelineUniformsFixture } from '@platform/gpu/testkit';

describe('pass-specs', () => {
  it('preserves shader execution order and buffer layouts', () => {
    expect(PASS_SPECS.map((pass) => [pass.id, pass.uniforms.byteLength])).toEqual([
      ['pixel-upscale', 24], ['unsharp-mask', 16], ['color-elevation', 32], ['crt-lcd', 32]
    ]);
    expect(PASS_SPECS.map((pass) => pass.uniforms.members.map((member) => member.offsetBytes))).toEqual([
      [0, 8, 16, 20], [0, 8, 12], [0, 4, 8, 12, 16, 20, 24, 28], [0, 8, 12, 16, 20, 24, 28]
    ]);
  });

  it('routes every pass to a compiled WebGPU shader source alongside the present pass', () => {
    const webgpuShaders = Object.keys(loadWebGpuShaders().byFileName);
    for (const pass of PASS_SPECS) expect(webgpuShaders).toContain(pass.webgpuShader);
    expect(webgpuShaders).toContain('present.wgsl');
  });

  it('packs distinct values at the established shader offsets, including zero padding', () => {
    const uniforms = createPipelineUniformsFixture({
      upscale: { inputSize: [11, 12], outputSize: [13, 14], scaleFactor: 15 },
      unsharp: { texelSize: [21, 22], strength: 23, scaleFactor: 24 },
      color: { gamma: 31, saturation: 32, greenBias: 33, brightness: 34, contrast: 35 },
      crt: {
        resolution: [41, 42], scaleFactor: 43, scanlineStrength: 44, pixelMaskStrength: 45,
        bloomStrength: 46, curvature: 47, vignetteStrength: 48
      }
    });
    const expectedPacking: Record<string, number[]> = {
      'pixel-upscale': [11, 12, 13, 14, 15, 0],
      'unsharp-mask': [21, 22, 23, 24],
      'color-elevation': [31, 32, 33, 34, 35, 0, 0, 0],
      'crt-lcd': [41, 42, 43, 44, 45, 46, 47, 48]
    };
    for (const pass of PASS_SPECS) {
      const packed = new Float32Array(pass.uniforms.byteLength / 4).fill(NaN);
      packUniforms(pass.uniforms, uniforms, packed);
      expect(Array.from(packed), pass.id).toEqual(expectedPacking[pass.id]);
      packUniforms(pass.uniforms, uniforms, packed);
      expect(Array.from(packed), `${pass.id} reused buffer`).toEqual(expectedPacking[pass.id]);
    }
  });
});

const EXPECTED_STRUCTS: Record<string, [string, string[]]> = {
  'pixel-upscale': ['UpscaleUniforms', ['sourceSize:vec2<f32>', 'targetSize:vec2<f32>', 'scaleFactor:f32', '_padding:f32']],
  'unsharp-mask': ['UnsharpUniforms', ['texelSize:vec2<f32>', 'strength:f32', 'scaleFactor:f32']],
  'color-elevation': ['ColorUniforms', ['gamma:f32', 'saturation:f32', 'greenBias:f32', 'brightness:f32', 'contrast:f32', '_padding1:f32', '_padding2:f32', '_padding3:f32']],
  'crt-lcd': ['CRTUniforms', ['resolution:vec2<f32>', 'scaleFactor:f32', 'scanlineStrength:f32', 'pixelMaskStrength:f32', 'bloomStrength:f32', 'curvature:f32', 'vignetteStrength:f32']]
};

describe('shaders', () => {
  it('composes one vertex prelude and the established uniform struct into each effect shader', () => {
    const shaders = loadWebGpuShaders().byFileName;
    for (const pass of PASS_SPECS) {
      const source = shaders[pass.webgpuShader];
      const [name, fields] = EXPECTED_STRUCTS[pass.id];
      expect(source.match(/struct VertexOutput/g)).toHaveLength(1);
      expect(source.match(/fn vertexMain/g)).toHaveLength(1);
      expect(source).toContain('fn fragmentMain(input: VertexOutput)');
      expect(source.match(new RegExp(`struct ${name}`, 'g'))).toHaveLength(1);
      const body = source.match(new RegExp(`struct ${name} \\{([^}]+)\\}`))![1];
      expect(body.split(',').map((field) => field.replace(/\s/g, '')).filter(Boolean)).toEqual(fields);
      expect(source).toContain(`var<uniform> uniforms: ${name};`);
    }
    expect(shaders['present.wgsl']).not.toContain('var<uniform>');
  });
});
