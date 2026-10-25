import { describe, expect, it } from 'vitest';
import { PASS_SPECS } from '../../../../../src/platform/gpu/domain/pass-specs';
import { loadWebGpuShaders } from '../../../../../src/platform/gpu/infrastructure/shaders';

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
