import { BUILT_IN_PRESET_CATALOG } from '../domain/presets';
import type { RenderPreset, RenderPresetSummary, ShaderPresetCatalog } from '../domain/types';


export function getPreset(
  id: string,
  catalog: ShaderPresetCatalog = BUILT_IN_PRESET_CATALOG
): RenderPreset | undefined {
  return catalog.presets.find((preset) => preset.id === id);
}

export function getPackageDefaultPreset(
  catalog: ShaderPresetCatalog = BUILT_IN_PRESET_CATALOG
): RenderPreset {
  const preset = getPreset(catalog.packageDefaultPresetId, catalog);
  if (!preset) {
    throw new Error(`Package default preset '${catalog.packageDefaultPresetId}' not found`);
  }
  return preset;
}

export function getRendererDefaultPreset(
  catalog: ShaderPresetCatalog = BUILT_IN_PRESET_CATALOG
): RenderPreset {
  const preset = getPreset(catalog.rendererDefaultPresetId, catalog);
  if (!preset) {
    throw new Error(`Renderer default preset '${catalog.rendererDefaultPresetId}' not found`);
  }
  return preset;
}

export function resolvePreset(
  id: string | null | undefined,
  catalog: ShaderPresetCatalog = BUILT_IN_PRESET_CATALOG
): RenderPreset {
  return id ? getPreset(id, catalog) ?? getRendererDefaultPreset(catalog) : getRendererDefaultPreset(catalog);
}

export function getUiPresets(
  catalog: ShaderPresetCatalog = BUILT_IN_PRESET_CATALOG
): readonly RenderPresetSummary[] {
  return catalog.uiPresetIds.map((presetId) => {
    const preset = getPreset(presetId, catalog);
    if (!preset) {
      throw new Error(`UI preset '${presetId}' not found`);
    }
    return {
      id: preset.id,
      name: preset.name,
      description: preset.description
    };
  });
}
