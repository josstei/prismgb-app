import type { RenderPreset, ShaderPresetCatalog } from './types';

export const PRESET_POLICY = Object.freeze({
  packageDefaultId: 'true-color',
  rendererDefaultId: 'vibrant',
  performancePresetId: 'performance'
} as const);

type BuiltInPresetRecord = {
  readonly preset: RenderPreset;
  readonly visibleInUI?: boolean;
};

const trueColorPreset: RenderPreset = Object.freeze({
  id: 'true-color',
  name: 'True Color',
  description: 'Accurate GBC colors',
  upscale: Object.freeze({ enabled: true }),
  unsharp: Object.freeze({ enabled: false, strength: 0 }),
  color: Object.freeze({
    enabled: true,
    gamma: 0.92,
    saturation: 1.0,
    greenBias: 0.03,
    brightness: 1.0,
    contrast: 1.0
  }),
  crt: Object.freeze({
    enabled: false,
    scanlineStrength: 0,
    pixelMaskStrength: 0,
    bloomStrength: 0,
    curvature: 0,
    vignetteStrength: 0
  })
});

const vibrantPreset: RenderPreset = Object.freeze({
  id: 'vibrant',
  name: 'Vibrant',
  description: 'Boosted colors for modern displays',
  upscale: Object.freeze({ enabled: true }),
  unsharp: Object.freeze({ enabled: true, strength: 0.3 }),
  color: Object.freeze({
    enabled: true,
    gamma: 0.88,
    saturation: 1.2,
    greenBias: 0.02,
    brightness: 1.05,
    contrast: 1.1
  }),
  crt: Object.freeze({
    enabled: false,
    scanlineStrength: 0,
    pixelMaskStrength: 0,
    bloomStrength: 0,
    curvature: 0,
    vignetteStrength: 0
  })
});

const hiDefPreset: RenderPreset = Object.freeze({
  id: 'hi-def',
  name: 'Hi-Def',
  description: 'Maximum clarity and sharpness',
  upscale: Object.freeze({ enabled: true }),
  unsharp: Object.freeze({ enabled: true, strength: 0.8 }),
  color: Object.freeze({
    enabled: true,
    gamma: 0.90,
    saturation: 1.1,
    greenBias: 0.01,
    brightness: 1.0,
    contrast: 1.05
  }),
  crt: Object.freeze({
    enabled: false,
    scanlineStrength: 0,
    pixelMaskStrength: 0,
    bloomStrength: 0,
    curvature: 0,
    vignetteStrength: 0
  })
});

const vintagePreset: RenderPreset = Object.freeze({
  id: 'vintage',
  name: 'Vintage',
  description: 'CRT scanlines and glow',
  upscale: Object.freeze({ enabled: true }),
  unsharp: Object.freeze({ enabled: false, strength: 0 }),
  color: Object.freeze({
    enabled: true,
    gamma: 0.95,
    saturation: 1.15,
    greenBias: 0.02,
    brightness: 0.95,
    contrast: 1.1
  }),
  crt: Object.freeze({
    enabled: true,
    scanlineStrength: 0.25,
    pixelMaskStrength: 0.0,
    bloomStrength: 0.1,
    curvature: 0.02,
    vignetteStrength: 0.15
  })
});

const pixelPreset: RenderPreset = Object.freeze({
  id: 'pixel',
  name: 'Pixel',
  description: 'Visible pixel grid overlay',
  upscale: Object.freeze({ enabled: true }),
  unsharp: Object.freeze({ enabled: false, strength: 0 }),
  color: Object.freeze({
    enabled: true,
    gamma: 0.90,
    saturation: 1.0,
    greenBias: 0.04,
    brightness: 1.0,
    contrast: 1.0
  }),
  crt: Object.freeze({
    enabled: true,
    scanlineStrength: 0.08,
    pixelMaskStrength: 0.2,
    bloomStrength: 0.04,
    curvature: 0,
    vignetteStrength: 0
  })
});

const performancePreset: RenderPreset = Object.freeze({
  id: 'performance',
  name: 'Performance',
  description: 'Minimal processing for weak GPUs',
  upscale: Object.freeze({ enabled: true }),
  unsharp: Object.freeze({ enabled: false, strength: 0 }),
  color: Object.freeze({
    enabled: false,
    gamma: 1.0,
    saturation: 1.0,
    greenBias: 0,
    brightness: 1.0,
    contrast: 1.0
  }),
  crt: Object.freeze({
    enabled: false,
    scanlineStrength: 0,
    pixelMaskStrength: 0,
    bloomStrength: 0,
    curvature: 0,
    vignetteStrength: 0
  })
});

export const BUILT_IN_PRESETS: readonly BuiltInPresetRecord[] = Object.freeze([
  Object.freeze({ preset: trueColorPreset }),
  Object.freeze({ preset: vibrantPreset }),
  Object.freeze({ preset: hiDefPreset }),
  Object.freeze({ preset: vintagePreset }),
  Object.freeze({ preset: pixelPreset }),
  Object.freeze({ preset: performancePreset, visibleInUI: false })
]);

export const BUILT_IN_PRESET_CATALOG: ShaderPresetCatalog = Object.freeze({
  presets: Object.freeze(BUILT_IN_PRESETS.map((entry) => entry.preset)),
  packageDefaultPresetId: PRESET_POLICY.packageDefaultId,
  rendererDefaultPresetId: PRESET_POLICY.rendererDefaultId,
  uiPresetIds: Object.freeze(
    BUILT_IN_PRESETS
      .filter((entry) => entry.visibleInUI !== false)
      .map((entry) => entry.preset.id)
  )
});
