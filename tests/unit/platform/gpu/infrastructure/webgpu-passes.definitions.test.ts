import { describe, expect, it } from 'vitest';
import { createPipelineUniformsFixture } from '@platform/gpu/testkit';
import { resolvePreset } from '@platform/gpu';
import {
  PRESENT_SHADER,
  WEBGPU_PASSES,
  buildUniforms
} from '../../../../../src/platform/gpu/infrastructure/webgpu-passes.definitions';

function uniformsFor(presetId: string, { outputWidth = 640, outputHeight = 576, brightness = 1 } = {}) {
  return buildUniforms({
    preset: resolvePreset(presetId),
    nativeWidth: 160,
    nativeHeight: 144,
    outputWidth,
    outputHeight,
    brightness
  });
}

describe('buildUniforms', () => {
  it('derives every block from the preset, the integer scale and the brightness', () => {
    expect(uniformsFor('vibrant')).toEqual({
      upscale: { inputSize: [160, 144], outputSize: [640, 576], scaleFactor: 4 },
      unsharp: { enabled: true, texelSize: [1 / 640, 1 / 576], strength: 0.3, scaleFactor: 4 },
      color: { enabled: true, gamma: 0.88, saturation: 1.2, greenBias: 0.02, brightness: 1.05, contrast: 1.1 },
      crt: {
        enabled: false,
        resolution: [640, 576],
        scaleFactor: 4,
        scanlineStrength: 0,
        pixelMaskStrength: 0,
        bloomStrength: 0,
        curvature: 0,
        vignetteStrength: 0
      }
    });
  });

  it('sizes the output to the largest integer multiple of the native resolution', () => {
    const uniforms = uniformsFor('vintage', { outputWidth: 700, outputHeight: 600 });

    expect(uniforms.upscale.outputSize).toEqual([640, 576]);
    expect(uniforms.crt).toEqual(expect.objectContaining({ enabled: true, resolution: [640, 576], scaleFactor: 4 }));
    expect(uniforms.unsharp.texelSize).toEqual([1 / 640, 1 / 576]);
  });

  it.each([
    { presetId: 'true-color', brightness: 1.5, expected: 1.5 },
    { presetId: 'vibrant', brightness: 2, expected: 2.1 },
    { presetId: 'performance', brightness: 1.5, expected: 1.5 }
  ])('multiplies the $presetId color brightness by $brightness', ({ presetId, brightness, expected }) => {
    expect(uniformsFor(presetId, { brightness }).color.brightness).toBeCloseTo(expected);
  });

  it('neutralizes the blocks a preset disables', () => {
    const uniforms = uniformsFor('performance');

    expect(uniforms.unsharp).toEqual(expect.objectContaining({ enabled: false, strength: 0 }));
    expect(uniforms.color).toEqual({
      enabled: false,
      gamma: 1,
      saturation: 1,
      greenBias: 0,
      brightness: 1,
      contrast: 1
    });
    expect(uniforms.crt).toEqual(expect.objectContaining({
      enabled: false,
      scanlineStrength: 0,
      pixelMaskStrength: 0,
      bloomStrength: 0,
      curvature: 0,
      vignetteStrength: 0
    }));
  });
});

describe('WEBGPU_PASSES', () => {
  it('runs the four passes in order with their samplers', () => {
    expect(WEBGPU_PASSES.map(({ id, sampler }) => [id, sampler])).toEqual([
      ['pixel-upscale', 'nearest'],
      ['unsharp-mask', 'linear'],
      ['color-elevation', 'linear'],
      ['crt-lcd', 'linear']
    ]);
  });

  it.each([
    { presetId: 'true-color', expected: ['pixel-upscale', 'color-elevation'] },
    { presetId: 'vibrant', expected: ['pixel-upscale', 'unsharp-mask', 'color-elevation'] },
    { presetId: 'hi-def', expected: ['pixel-upscale', 'unsharp-mask', 'color-elevation'] },
    { presetId: 'vintage', expected: ['pixel-upscale', 'color-elevation', 'crt-lcd'] },
    { presetId: 'pixel', expected: ['pixel-upscale', 'color-elevation', 'crt-lcd'] },
    { presetId: 'performance', expected: ['pixel-upscale'] }
  ])('enables $expected for $presetId', ({ presetId, expected }) => {
    const uniforms = uniformsFor(presetId);

    expect(WEBGPU_PASSES.filter((pass) => pass.isEnabled(uniforms)).map((pass) => pass.id)).toEqual(expected);
  });

  it('keeps unsharp off at zero strength and crt on for any single effect', () => {
    const unsharpPass = WEBGPU_PASSES.find((pass) => pass.id === 'unsharp-mask')!;
    const crtPass = WEBGPU_PASSES.find((pass) => pass.id === 'crt-lcd')!;

    expect(unsharpPass.isEnabled(createPipelineUniformsFixture({ unsharp: { enabled: true, strength: 0 } }))).toBe(false);
    expect(crtPass.isEnabled(createPipelineUniformsFixture())).toBe(false);
    for (const crt of [
      { scanlineStrength: 0.1 },
      { pixelMaskStrength: 0.1 },
      { bloomStrength: 0.1 },
      { curvature: 0.1 },
      { vignetteStrength: 0.1 }
    ]) {
      expect(crtPass.isEnabled(createPipelineUniformsFixture({ crt })), JSON.stringify(crt)).toBe(true);
    }
  });

  it('packs each uniform buffer field by field at the declared byte length', () => {
    // A distinctive value per field catches any offset or source-mapping mistake.
    const uniforms = createPipelineUniformsFixture({
      upscale: { inputSize: [11, 12], outputSize: [13, 14], scaleFactor: 15 },
      unsharp: { texelSize: [21, 22], strength: 23, scaleFactor: 24 },
      color: { gamma: 31, saturation: 32, greenBias: 33, brightness: 34, contrast: 35 },
      crt: {
        resolution: [41, 42],
        scaleFactor: 43,
        scanlineStrength: 44,
        pixelMaskStrength: 45,
        bloomStrength: 46,
        curvature: 47,
        vignetteStrength: 48
      }
    });

    const packed = Object.fromEntries(WEBGPU_PASSES.map((pass) => {
      const data = pass.pack(uniforms);
      expect(data.byteLength, pass.id).toBe(pass.byteLength);
      return [pass.id, Array.from(data)];
    }));

    expect(packed).toEqual({
      'pixel-upscale': [11, 12, 13, 14, 15, 0],
      'unsharp-mask': [21, 22, 23, 24],
      'color-elevation': [31, 32, 33, 34, 35, 0, 0, 0],
      'crt-lcd': [41, 42, 43, 44, 45, 46, 47, 48]
    });
  });

  it('prefixes every fragment shader with one shared fullscreen vertex stage', () => {
    for (const shader of [...WEBGPU_PASSES.map((pass) => pass.shader), PRESENT_SHADER]) {
      expect(shader.match(/struct VertexOutput/g)).toHaveLength(1);
      expect(shader.match(/fn vertexMain/g)).toHaveLength(1);
      expect(shader).toContain('fn fragmentMain(input: VertexOutput)');
    }
  });
});
