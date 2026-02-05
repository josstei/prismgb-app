import type { IPreset } from '../preset.interface';
import { PresetRegistry } from '../preset-registry';

export const vibrantPreset: IPreset = {
  id: 'vibrant',
  name: 'Vibrant',
  upscale: { enabled: true },
  unsharp: { enabled: true, strength: 0.3 },
  color: {
    enabled: true,
    gamma: 1.0,
    saturation: 1.25,
    greenBias: 0.04,
    brightness: 1.05,
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

PresetRegistry.register(vibrantPreset);
