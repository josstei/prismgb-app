import type { IPreset } from '../preset.interface';
import { PresetRegistry } from '../preset-registry';

export const pixelPreset: IPreset = {
  id: 'pixel',
  name: 'Pixel',
  upscale: { enabled: true },
  unsharp: { enabled: false, strength: 0 },
  color: {
    enabled: true,
    gamma: 1.0,
    saturation: 1.0,
    greenBias: 0.04,
    brightness: 1.0,
    contrast: 1.0
  },
  crt: {
    enabled: true,
    scanlineStrength: 0,
    pixelMaskStrength: 0.5,
    bloomStrength: 0,
    curvature: 0,
    vignetteStrength: 0
  }
};

PresetRegistry.register(pixelPreset);
