import { BUILT_IN_PRESET_CATALOG } from '../domain/presets';
import type { RenderPreset, RenderPresetSummary, ShaderPresetCatalog } from '../domain/types';

function freezePreset(preset: RenderPreset): RenderPreset {
  return Object.freeze({
    id: preset.id,
    name: preset.name,
    description: preset.description,
    upscale: Object.freeze({ ...preset.upscale }),
    unsharp: Object.freeze({ ...preset.unsharp }),
    color: Object.freeze({ ...preset.color }),
    crt: Object.freeze({ ...preset.crt })
  });
}

export function createShaderPresetCatalog(catalog: ShaderPresetCatalog): ShaderPresetCatalog {
  const presetIds = new Set<string>();
  const presets = catalog.presets.map((preset) => {
    if (presetIds.has(preset.id)) {
      throw new Error(`Duplicate preset '${preset.id}' found`);
    }
    presetIds.add(preset.id);
    return freezePreset(preset);
  });

  if (!presetIds.has(catalog.packageDefaultPresetId)) {
    throw new Error(`Package default preset '${catalog.packageDefaultPresetId}' not found`);
  }
  if (!presetIds.has(catalog.rendererDefaultPresetId)) {
    throw new Error(`Renderer default preset '${catalog.rendererDefaultPresetId}' not found`);
  }
  for (const presetId of catalog.uiPresetIds) {
    if (!presetIds.has(presetId)) {
      throw new Error(`UI preset '${presetId}' not found`);
    }
  }

  return Object.freeze({
    presets: Object.freeze(presets),
    packageDefaultPresetId: catalog.packageDefaultPresetId,
    rendererDefaultPresetId: catalog.rendererDefaultPresetId,
    uiPresetIds: Object.freeze([...catalog.uiPresetIds])
  });
}

export function getAllPresets(
  catalog: ShaderPresetCatalog = BUILT_IN_PRESET_CATALOG
): readonly RenderPreset[] {
  return catalog.presets;
}

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
