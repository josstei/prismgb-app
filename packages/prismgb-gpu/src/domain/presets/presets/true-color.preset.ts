import type { IPreset } from '../preset.interface';
import { PresetRegistry } from '../preset-registry';

export const trueColorPreset: IPreset = {
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

PresetRegistry.register(trueColorPreset);
