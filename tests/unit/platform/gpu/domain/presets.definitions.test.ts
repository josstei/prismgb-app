import { describe, expect, it } from 'vitest';
import { PRESET_POLICY, getUiPresets, resolvePreset } from '@platform/gpu';

const CRT_OFF = {
  enabled: false,
  scanlineStrength: 0,
  pixelMaskStrength: 0,
  bloomStrength: 0,
  curvature: 0,
  vignetteStrength: 0
};

describe('preset definitions', () => {
  it('keeps the renderer default and the hidden performance preset', () => {
    expect(PRESET_POLICY).toEqual({ rendererDefaultId: 'vibrant', performancePresetId: 'performance' });
  });

  it('resolves known ids and falls back to the renderer default', () => {
    expect(resolvePreset('vintage').id).toBe('vintage');
    expect(resolvePreset('performance').id).toBe('performance');

    for (const id of ['unknown-preset', '', null, undefined]) {
      expect(resolvePreset(id).id).toBe('vibrant');
    }
  });

  it('lists every preset but performance for the UI, in order, as { id, name }', () => {
    expect(getUiPresets()).toEqual([
      { id: 'true-color', name: 'True Color' },
      { id: 'vibrant', name: 'Vibrant' },
      { id: 'hi-def', name: 'Hi-Def' },
      { id: 'vintage', name: 'Vintage' },
      { id: 'pixel', name: 'Pixel' }
    ]);
  });

  it.each([
    {
      id: 'true-color',
      name: 'True Color',
      unsharp: { enabled: false, strength: 0 },
      color: { enabled: true, gamma: 0.92, saturation: 1.0, greenBias: 0.03, brightness: 1.0, contrast: 1.0 },
      crt: CRT_OFF
    },
    {
      id: 'vibrant',
      name: 'Vibrant',
      unsharp: { enabled: true, strength: 0.3 },
      color: { enabled: true, gamma: 0.88, saturation: 1.2, greenBias: 0.02, brightness: 1.05, contrast: 1.1 },
      crt: CRT_OFF
    },
    {
      id: 'hi-def',
      name: 'Hi-Def',
      unsharp: { enabled: true, strength: 0.8 },
      color: { enabled: true, gamma: 0.9, saturation: 1.1, greenBias: 0.01, brightness: 1.0, contrast: 1.05 },
      crt: CRT_OFF
    },
    {
      id: 'vintage',
      name: 'Vintage',
      unsharp: { enabled: false, strength: 0 },
      color: { enabled: true, gamma: 0.95, saturation: 1.15, greenBias: 0.02, brightness: 0.95, contrast: 1.1 },
      crt: {
        enabled: true,
        scanlineStrength: 0.25,
        pixelMaskStrength: 0,
        bloomStrength: 0.1,
        curvature: 0.02,
        vignetteStrength: 0.15
      }
    },
    {
      id: 'pixel',
      name: 'Pixel',
      unsharp: { enabled: false, strength: 0 },
      color: { enabled: true, gamma: 0.9, saturation: 1.0, greenBias: 0.04, brightness: 1.0, contrast: 1.0 },
      crt: {
        enabled: true,
        scanlineStrength: 0.08,
        pixelMaskStrength: 0.2,
        bloomStrength: 0.04,
        curvature: 0,
        vignetteStrength: 0
      }
    },
    {
      id: 'performance',
      name: 'Performance',
      unsharp: { enabled: false, strength: 0 },
      color: { enabled: false, gamma: 1.0, saturation: 1.0, greenBias: 0, brightness: 1.0, contrast: 1.0 },
      crt: CRT_OFF
    }
  ])('keeps the $id parameters', (expected) => {
    expect(resolvePreset(expected.id)).toEqual(expected);
  });
});
