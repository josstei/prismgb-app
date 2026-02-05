import type { IPreset } from '../preset.interface';
import { PresetRegistry } from '../preset-registry';

export const vintagePreset: IPreset = {
  id: 'vintage',
  name: 'Vintage',
  upscale: { enabled: true },
  unsharp: { enabled: false, strength: 0 },
  color: {
    enabled: true,
    gamma: 1.1,
    saturation: 0.9,
    greenBias: 0.04,
    brightness: 0.95,
    contrast: 1.0
  },
  crt: {
    enabled: true,
    scanlineStrength: 0.3,
    pixelMaskStrength: 0.2,
    bloomStrength: 0.15,
    curvature: 0.02,
    vignetteStrength: 0.2
  }
};

PresetRegistry.register(vintagePreset);
