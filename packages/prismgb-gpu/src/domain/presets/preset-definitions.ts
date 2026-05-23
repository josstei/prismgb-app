import type { IPreset } from './preset.interface';
import type { PresetRecord } from './preset-registry';

export const PRESET_POLICY = Object.freeze({ packageDefaultId: 'true-color', rendererDefaultId: 'vibrant', performancePresetId: 'performance' } as const);

const trueColorPreset: IPreset = {
  id: 'true-color',
  name: 'True Color',
  description: 'Accurate GBC colors',
  upscale: { enabled: true },
  unsharp: { enabled: false, strength: 0 },
  color: {
    enabled: true,
    gamma: 0.92,
    saturation: 1.0,
    greenBias: 0.03,
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

const vibrantPreset: IPreset = {
  id: 'vibrant',
  name: 'Vibrant',
  description: 'Boosted colors for modern displays',
  upscale: { enabled: true },
  unsharp: { enabled: true, strength: 0.3 },
  color: {
    enabled: true,
    gamma: 0.88,
    saturation: 1.2,
    greenBias: 0.02,
    brightness: 1.05,
    contrast: 1.1
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

const hiDefPreset: IPreset = {
  id: 'hi-def',
  name: 'Hi-Def',
  description: 'Maximum clarity and sharpness',
  upscale: { enabled: true },
  unsharp: { enabled: true, strength: 0.8 },
  color: {
    enabled: true,
    gamma: 0.90,
    saturation: 1.1,
    greenBias: 0.01,
    brightness: 1.0,
    contrast: 1.05
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

const vintagePreset: IPreset = {
  id: 'vintage',
  name: 'Vintage',
  description: 'CRT scanlines and glow',
  upscale: { enabled: true },
  unsharp: { enabled: false, strength: 0 },
  color: {
    enabled: true,
    gamma: 0.95,
    saturation: 1.15,
    greenBias: 0.02,
    brightness: 0.95,
    contrast: 1.1
  },
  crt: {
    enabled: true,
    scanlineStrength: 0.25,
    pixelMaskStrength: 0.0,
    bloomStrength: 0.1,
    curvature: 0.02,
    vignetteStrength: 0.15
  }
};

const pixelPreset: IPreset = {
  id: 'pixel',
  name: 'Pixel',
  description: 'Visible pixel grid overlay',
  upscale: { enabled: true },
  unsharp: { enabled: false, strength: 0 },
  color: {
    enabled: true,
    gamma: 0.90,
    saturation: 1.0,
    greenBias: 0.04,
    brightness: 1.0,
    contrast: 1.0
  },
  crt: {
    enabled: true,
    scanlineStrength: 0.08,
    pixelMaskStrength: 0.2,
    bloomStrength: 0.04,
    curvature: 0,
    vignetteStrength: 0
  }
};

const performancePreset: IPreset = {
  id: 'performance',
  name: 'Performance',
  description: 'Minimal processing for weak GPUs',
  upscale: { enabled: true },
  unsharp: { enabled: false, strength: 0 },
  color: {
    enabled: false,
    gamma: 1.0,
    saturation: 1.0,
    greenBias: 0,
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

export const BUILT_IN_PRESETS: readonly PresetRecord[] = [
  { preset: trueColorPreset, isDefault: trueColorPreset.id === PRESET_POLICY.packageDefaultId },
  { preset: vibrantPreset },
  { preset: hiDefPreset },
  { preset: vintagePreset },
  { preset: pixelPreset },
  { preset: performancePreset, visibleInUI: performancePreset.id !== PRESET_POLICY.performancePresetId }
];

export type BuiltInPreset = (typeof BUILT_IN_PRESETS)[number];
export type PresetPolicy = typeof PRESET_POLICY;
