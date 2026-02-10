import { describe, it, expect } from 'vitest';
import { UniformContext } from '@/application/uniform-context';
import type { IPreset } from '@/domain/presets';

const testPreset: IPreset = {
  id: 'test',
  name: 'Test',
  description: 'Test preset',
  upscale: { enabled: true },
  unsharp: { enabled: true, strength: 0.5 },
  color: {
    enabled: true,
    gamma: 0.9,
    saturation: 1.1,
    greenBias: 0.02,
    brightness: 1.0,
    contrast: 1.0
  },
  crt: {
    enabled: false,
    scanlineStrength: 0,
    pixelMaskStrength: 0,
    bloomStrength: 0,
    curvature: 0,
    vignetteStrength: 0
  }
};

const alternatePreset: IPreset = {
  ...testPreset,
  id: 'alternate',
  name: 'Alternate',
  color: { ...testPreset.color, gamma: 1.0, saturation: 1.5 }
};

describe('UniformContext', () => {
  it('should build uniforms on first access', () => {
    const ctx = new UniformContext({
      preset: testPreset,
      nativeWidth: 160,
      nativeHeight: 144,
      outputWidth: 640,
      outputHeight: 576
    });

    const uniforms = ctx.uniforms;
    expect(uniforms.upscale.scaleFactor).toBe(4);
    expect(uniforms.color.gamma).toBe(0.9);
  });

  it('should cache uniforms on repeated access', () => {
    const ctx = new UniformContext({
      preset: testPreset,
      nativeWidth: 160,
      nativeHeight: 144,
      outputWidth: 640,
      outputHeight: 576
    });

    const first = ctx.uniforms;
    const second = ctx.uniforms;
    expect(first).toBe(second);
    expect(ctx.isDirty).toBe(false);
  });

  it('should invalidate when preset changes', () => {
    const ctx = new UniformContext({
      preset: testPreset,
      nativeWidth: 160,
      nativeHeight: 144,
      outputWidth: 640,
      outputHeight: 576
    });

    ctx.uniforms;
    ctx.setPreset(alternatePreset);
    expect(ctx.isDirty).toBe(true);

    const uniforms = ctx.uniforms;
    expect(uniforms.color.saturation).toBe(1.5);
  });

  it('should invalidate when brightness changes', () => {
    const ctx = new UniformContext({
      preset: testPreset,
      nativeWidth: 160,
      nativeHeight: 144,
      outputWidth: 640,
      outputHeight: 576
    });

    ctx.uniforms;
    ctx.setBrightness(0.8);
    expect(ctx.isDirty).toBe(true);
    expect(ctx.uniforms.color.brightness).toBeCloseTo(0.8);
  });

  it('should clamp brightness to 0-2 range', () => {
    const ctx = new UniformContext({
      preset: testPreset,
      nativeWidth: 160,
      nativeHeight: 144,
      outputWidth: 640,
      outputHeight: 576
    });

    ctx.setBrightness(-1);
    expect(ctx.brightness).toBe(0);

    ctx.setBrightness(5);
    expect(ctx.brightness).toBe(2);
  });

  it('should invalidate when output size changes', () => {
    const ctx = new UniformContext({
      preset: testPreset,
      nativeWidth: 160,
      nativeHeight: 144,
      outputWidth: 640,
      outputHeight: 576
    });

    ctx.uniforms;
    ctx.setOutputSize(1280, 1152);
    expect(ctx.isDirty).toBe(true);
    expect(ctx.uniforms.upscale.scaleFactor).toBe(8);
  });

  it('should allow manual invalidation', () => {
    const ctx = new UniformContext({
      preset: testPreset,
      nativeWidth: 160,
      nativeHeight: 144,
      outputWidth: 640,
      outputHeight: 576
    });

    ctx.uniforms;
    expect(ctx.isDirty).toBe(false);

    ctx.invalidate();
    expect(ctx.isDirty).toBe(true);
  });

  it('should expose readonly properties', () => {
    const ctx = new UniformContext({
      preset: testPreset,
      nativeWidth: 160,
      nativeHeight: 144,
      outputWidth: 640,
      outputHeight: 576,
      brightness: 0.9
    });

    expect(ctx.preset).toBe(testPreset);
    expect(ctx.brightness).toBe(0.9);
    expect(ctx.outputWidth).toBe(640);
    expect(ctx.outputHeight).toBe(576);
  });
});
