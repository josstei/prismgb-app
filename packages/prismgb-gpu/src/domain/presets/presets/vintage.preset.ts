import type { IPreset } from '../preset.interface';
import { PresetRegistry } from '../preset-registry';

export const vintagePreset: IPreset = {
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

PresetRegistry.register(vintagePreset);
