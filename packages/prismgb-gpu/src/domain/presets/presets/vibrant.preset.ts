import type { IPreset } from '../preset.interface';
import { PresetRegistry } from '../preset-registry';

export const vibrantPreset: IPreset = {
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

PresetRegistry.register(vibrantPreset);
