import type { IPreset } from '../preset.interface';
import { PresetRegistry } from '../preset-registry';

export const performancePreset: IPreset = {
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

PresetRegistry.register(performancePreset);
