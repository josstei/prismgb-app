import { describe, it, expect, beforeAll } from 'vitest';
import { buildUniforms, calculateScaleFactor } from '@/application/uniform-builder';
import { PresetRegistry, BUILT_IN_PRESETS } from '@/domain/presets';

PresetRegistry.registerMany(BUILT_IN_PRESETS);

describe('calculateScaleFactor', () => {
  it('should calculate integer scale factor', () => {
    expect(calculateScaleFactor(160, 144, 640, 576)).toBe(4);
    expect(calculateScaleFactor(160, 144, 480, 432)).toBe(3);
    expect(calculateScaleFactor(160, 144, 320, 288)).toBe(2);
  });

  it('should use minimum of x and y scales', () => {
    expect(calculateScaleFactor(160, 144, 800, 432)).toBe(3);
  });

  it('should return at least 1', () => {
    expect(calculateScaleFactor(160, 144, 100, 100)).toBe(1);
  });
});

describe('buildUniforms', () => {
  it('should build uniforms from preset and dimensions', () => {
    const preset = PresetRegistry.get('true-color')!;

    const uniforms = buildUniforms({
      preset,
      nativeWidth: 160,
      nativeHeight: 144,
      outputWidth: 640,
      outputHeight: 576,
      brightness: 1.0
    });

    expect(uniforms.upscale.scaleFactor).toBe(4);
    expect(uniforms.upscale.inputSize).toEqual([160, 144]);
    expect(uniforms.upscale.outputSize).toEqual([640, 576]);
    expect(uniforms.color.greenBias).toBe(0.03);
    expect(uniforms.unsharp.enabled).toBe(false);
    expect(uniforms.color.enabled).toBe(true);
    expect(uniforms.crt.enabled).toBe(false);
  });

  it('should apply brightness multiplier', () => {
    const preset = PresetRegistry.get('true-color')!;

    const uniforms = buildUniforms({
      preset,
      nativeWidth: 160,
      nativeHeight: 144,
      outputWidth: 640,
      outputHeight: 576,
      brightness: 1.5
    });

    expect(uniforms.color.brightness).toBe(1.5);
  });

  it('should disable effects when preset has them disabled', () => {
    const preset = PresetRegistry.get('performance')!;

    const uniforms = buildUniforms({
      preset,
      nativeWidth: 160,
      nativeHeight: 144,
      outputWidth: 640,
      outputHeight: 576,
      brightness: 1.0
    });

    expect(uniforms.unsharp.strength).toBe(0);
    expect(uniforms.crt.scanlineStrength).toBe(0);
    expect(uniforms.unsharp.enabled).toBe(false);
    expect(uniforms.color.enabled).toBe(false);
    expect(uniforms.crt.enabled).toBe(false);
  });

  it('should include scaleFactor in unsharp uniforms', () => {
    const preset = PresetRegistry.get('true-color')!;

    const uniforms = buildUniforms({
      preset,
      nativeWidth: 160,
      nativeHeight: 144,
      outputWidth: 640,
      outputHeight: 576,
      brightness: 1.0
    });

    expect(uniforms.unsharp.scaleFactor).toBe(4);
  });

  it('should include scaleFactor and resolution in crt uniforms', () => {
    const preset = PresetRegistry.get('vintage')!;

    const uniforms = buildUniforms({
      preset,
      nativeWidth: 160,
      nativeHeight: 144,
      outputWidth: 640,
      outputHeight: 576,
      brightness: 1.0
    });

    expect(uniforms.crt.scaleFactor).toBe(4);
    expect(uniforms.crt.resolution).toEqual([640, 576]);
    expect(uniforms.crt.enabled).toBe(true);
  });

  it('should include enabled flags from preset', () => {
    const preset = PresetRegistry.get('vintage')!;

    const uniforms = buildUniforms({
      preset,
      nativeWidth: 160,
      nativeHeight: 144,
      outputWidth: 640,
      outputHeight: 576,
      brightness: 1.0
    });

    expect(uniforms.unsharp.enabled).toBe(false);
    expect(uniforms.color.enabled).toBe(true);
    expect(uniforms.crt.enabled).toBe(true);
  });
});
