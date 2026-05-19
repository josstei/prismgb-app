import type { IPreset } from '../preset.interface';

export const pixelPreset: IPreset = {
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
