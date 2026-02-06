import type { IPreset } from '../preset.interface';
import { PresetRegistry } from '../preset-registry';

export const hiDefPreset: IPreset = {
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

PresetRegistry.register(hiDefPreset);
