import type { PresetRecord } from './preset-registry';
import { hiDefPreset } from './presets/hi-def.preset';
import { performancePreset } from './presets/performance.preset';
import { pixelPreset } from './presets/pixel.preset';
import { trueColorPreset } from './presets/true-color.preset';
import { vintagePreset } from './presets/vintage.preset';
import { vibrantPreset } from './presets/vibrant.preset';

export const BUILT_IN_PRESETS: readonly PresetRecord[] = [
  { preset: trueColorPreset, isDefault: true },
  { preset: vibrantPreset },
  { preset: hiDefPreset },
  { preset: vintagePreset },
  { preset: pixelPreset },
  { preset: performancePreset, visibleInUI: false }
];

export type BuiltInPreset = (typeof BUILT_IN_PRESETS)[number];
