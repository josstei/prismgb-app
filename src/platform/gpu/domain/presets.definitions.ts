import type { RenderPreset } from './types';

export const PRESET_POLICY = Object.freeze({
  rendererDefaultId: 'vibrant',
  performancePresetId: 'performance'
} as const);

const UNSHARP_OFF = { enabled: false, strength: 0 } as const;

const CRT_OFF = {
  enabled: false,
  scanlineStrength: 0,
  pixelMaskStrength: 0,
  bloomStrength: 0,
  curvature: 0,
  vignetteStrength: 0
} as const;

const PRESETS: readonly RenderPreset[] = Object.freeze([
  {
    id: 'true-color',
    name: 'True Color',
    unsharp: UNSHARP_OFF,
    color: { enabled: true, gamma: 0.92, saturation: 1.0, greenBias: 0.03, brightness: 1.0, contrast: 1.0 },
    crt: CRT_OFF
  },
  {
    id: 'vibrant',
    name: 'Vibrant',
    unsharp: { enabled: true, strength: 0.3 },
    color: { enabled: true, gamma: 0.88, saturation: 1.2, greenBias: 0.02, brightness: 1.05, contrast: 1.1 },
    crt: CRT_OFF
  },
  {
    id: 'hi-def',
    name: 'Hi-Def',
    unsharp: { enabled: true, strength: 0.8 },
    color: { enabled: true, gamma: 0.90, saturation: 1.1, greenBias: 0.01, brightness: 1.0, contrast: 1.05 },
    crt: CRT_OFF
  },
  {
    id: 'vintage',
    name: 'Vintage',
    unsharp: UNSHARP_OFF,
    color: { enabled: true, gamma: 0.95, saturation: 1.15, greenBias: 0.02, brightness: 0.95, contrast: 1.1 },
    crt: {
      enabled: true,
      scanlineStrength: 0.25,
      pixelMaskStrength: 0.0,
      bloomStrength: 0.1,
      curvature: 0.02,
      vignetteStrength: 0.15
    }
  },
  {
    id: 'pixel',
    name: 'Pixel',
    unsharp: UNSHARP_OFF,
    color: { enabled: true, gamma: 0.90, saturation: 1.0, greenBias: 0.04, brightness: 1.0, contrast: 1.0 },
    crt: {
      enabled: true,
      scanlineStrength: 0.08,
      pixelMaskStrength: 0.2,
      bloomStrength: 0.04,
      curvature: 0,
      vignetteStrength: 0
    }
  },
  {
    id: 'performance',
    name: 'Performance',
    unsharp: UNSHARP_OFF,
    color: { enabled: false, gamma: 1.0, saturation: 1.0, greenBias: 0, brightness: 1.0, contrast: 1.0 },
    crt: CRT_OFF
  }
]);

const DEFAULT_PRESET = PRESETS.find((preset) => preset.id === PRESET_POLICY.rendererDefaultId) as RenderPreset;

const UI_PRESETS: readonly Pick<RenderPreset, 'id' | 'name'>[] = Object.freeze(
  PRESETS
    .filter((preset) => preset.id !== PRESET_POLICY.performancePresetId)
    .map(({ id, name }) => ({ id, name }))
);

export function resolvePreset(id?: string | null): RenderPreset {
  return PRESETS.find((preset) => preset.id === id) ?? DEFAULT_PRESET;
}

export function getUiPresets(): readonly Pick<RenderPreset, 'id' | 'name'>[] {
  return UI_PRESETS;
}
