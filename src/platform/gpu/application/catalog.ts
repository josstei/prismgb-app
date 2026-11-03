import { BUILT_IN_PRESETS, PRESET_POLICY } from '../domain/presets';
import type { RenderPreset, RenderPresetSummary } from '../domain/types';

export function getPreset(id: string): RenderPreset | undefined {
  return BUILT_IN_PRESETS.find((entry) => entry.preset.id === id)?.preset;
}

export function resolvePreset(id?: string | null): RenderPreset {
  const preset = getPreset(id || PRESET_POLICY.rendererDefaultId) ?? getPreset(PRESET_POLICY.rendererDefaultId);
  if (!preset) throw new Error(`Renderer default preset '${PRESET_POLICY.rendererDefaultId}' not found`);
  return preset;
}

export function getUiPresets(): readonly RenderPresetSummary[] {
  return BUILT_IN_PRESETS
    .filter((entry) => entry.visibleInUI !== false)
    .map(({ preset: { id, name, description } }) => ({ id, name, description }));
}
