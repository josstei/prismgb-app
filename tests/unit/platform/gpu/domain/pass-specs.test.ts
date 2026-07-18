import { describe, expect, it } from 'vitest';
import { PASS_SPECS, RENDER_PASS_DEFINITIONS } from '../../../../../src/platform/gpu/domain/pass-specs';
import { WEBGPU_RENDER_PASSES } from '../../../../../src/platform/gpu/infrastructure/webgpu.driver';
import { loadWebGpuShaders } from '../../../../../src/platform/gpu/infrastructure/shaders';
import { createPipelineUniformsFixture } from '@platform/gpu/testkit';

describe('pass-specs', () => {
  it('exposes render-pass definitions ordered by pass order', () => {
    const contractOrder = [...PASS_SPECS].sort((left, right) => left.order - right.order);

    expect(RENDER_PASS_DEFINITIONS).toHaveLength(PASS_SPECS.length);
    expect(RENDER_PASS_DEFINITIONS.map((pass) => pass.id)).toEqual(contractOrder.map((pass) => pass.id));
  });

  it('declares typed structured enablement for every pass', () => {
    for (const pass of PASS_SPECS) {
      expect(typeof pass.enabledWhen).toBe('object');
      expect(pass.enabledWhen).toEqual(expect.objectContaining({ kind: expect.any(String) }));
    }
  });

  it('routes every pass to a compiled WebGPU shader source alongside the present pass', () => {
    const webgpuShaders = Object.keys(loadWebGpuShaders().byFileName);

    for (const pass of PASS_SPECS) {
      expect(webgpuShaders).toContain(pass.webgpuShader);
    }
    // The dedicated present pass is not a render-pass spec but must be compiled.
    expect(webgpuShaders).toContain('present.wgsl');
  });

  it('packs each pass uniform buffer at the exact declared offsets and sources', () => {
    // Distinctive integer per field so any offset OR source-mapping transcription error is caught.
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

    const expectedPacking: Record<string, number[]> = {
      'pixel-upscale': [11, 12, 13, 14, 15, 0],
      'unsharp-mask': [21, 22, 23, 24],
      'color-elevation': [31, 32, 33, 34, 35, 0, 0, 0],
      'crt-lcd': [41, 42, 43, 44, 45, 46, 47, 48]
    };

    for (const pass of WEBGPU_RENDER_PASSES) {
      const packed = Array.from(pass.backend.uniformData(uniforms));
      expect(packed, `pass ${pass.passId}`).toEqual(expectedPacking[pass.passId]);
    }
  });
});
