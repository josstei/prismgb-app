import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_PRESET_CATALOG,
  BUILT_IN_PRESETS,
  PRESET_POLICY,
  getAllPresets,
  getPackageDefaultPreset,
  getPreset,
  getRendererDefaultPreset,
  getUiPresets,
  resolvePreset
} from '@/index';
import { createShaderPresetCatalog } from '@/application/preset-catalog';

describe('preset catalog', () => {
  it('exports built-in catalog and policy through the package entrypoint without mutable registration', () => {
    expect(BUILT_IN_PRESET_CATALOG.packageDefaultPresetId).toBe(PRESET_POLICY.packageDefaultId);
    expect(BUILT_IN_PRESET_CATALOG.rendererDefaultPresetId).toBe(PRESET_POLICY.rendererDefaultId);
    expect(getPreset(PRESET_POLICY.rendererDefaultId)).toBeDefined();
    expect(getUiPresets().map((preset) => preset.id)).not.toContain(PRESET_POLICY.performancePresetId);
  });

  it('returns all built-in presets with descriptions', () => {
    const presets = getAllPresets();

    expect(presets.length).toBe(BUILT_IN_PRESETS.length);
    expect(presets.map((preset) => preset.id)).toContain('true-color');
    expect(presets.map((preset) => preset.id)).toContain('vibrant');
    expect(presets.map((preset) => preset.id)).toContain('vintage');
    for (const preset of presets) {
      expect(preset.description.length).toBeGreaterThan(0);
    }
  });

  it('resolves presets by id and returns undefined for unknown ids', () => {
    expect(getPreset('true-color')?.name).toBe('True Color');
    expect(getPreset('unknown-preset')).toBeUndefined();
  });

  it('keeps package and renderer defaults distinct', () => {
    expect(getPackageDefaultPreset().id).toBe(PRESET_POLICY.packageDefaultId);
    expect(getRendererDefaultPreset().id).toBe(PRESET_POLICY.rendererDefaultId);
    expect(PRESET_POLICY.rendererDefaultId).not.toBe(PRESET_POLICY.packageDefaultId);
  });

  it('returns UI summaries in built-in catalog order', () => {
    const uiPresets = getUiPresets();
    const builtInVisiblePresetIds = BUILT_IN_PRESETS
      .filter((entry) => entry.visibleInUI !== false)
      .map((entry) => entry.preset.id);

    expect(uiPresets.map((preset) => preset.id)).toEqual(builtInVisiblePresetIds);
    for (const preset of uiPresets) {
      expect(preset).toEqual({
        id: expect.any(String),
        name: expect.any(String),
        description: expect.any(String)
      });
    }
  });

  it('resolves unknown renderer selections to the renderer default', () => {
    expect(resolvePreset('vintage').id).toBe('vintage');
    expect(resolvePreset('missing-preset').id).toBe(PRESET_POLICY.rendererDefaultId);
    expect(resolvePreset(null).id).toBe(PRESET_POLICY.rendererDefaultId);
  });

  it('validates custom catalog default and UI references', () => {
    const catalog = createShaderPresetCatalog({
      presets: [getPackageDefaultPreset(), getRendererDefaultPreset()],
      packageDefaultPresetId: PRESET_POLICY.packageDefaultId,
      rendererDefaultPresetId: PRESET_POLICY.rendererDefaultId,
      uiPresetIds: [PRESET_POLICY.rendererDefaultId]
    });

    expect(getUiPresets(catalog)).toEqual([
      {
        id: PRESET_POLICY.rendererDefaultId,
        name: getRendererDefaultPreset().name,
        description: getRendererDefaultPreset().description
      }
    ]);
  });

  it('deep-freezes custom catalog presets', () => {
    const preset = {
      ...getPackageDefaultPreset(),
      id: 'custom-preset',
      color: {
        ...getPackageDefaultPreset().color,
        brightness: 1.25
      }
    };
    const catalog = createShaderPresetCatalog({
      presets: [preset],
      packageDefaultPresetId: preset.id,
      rendererDefaultPresetId: preset.id,
      uiPresetIds: [preset.id]
    });

    expect(Object.isFrozen(catalog.presets[0])).toBe(true);
    expect(Object.isFrozen(catalog.presets[0].color)).toBe(true);
    expect(Object.isFrozen(catalog.presets[0].unsharp)).toBe(true);
    expect(Object.isFrozen(catalog.presets[0].crt)).toBe(true);
    expect(Object.isFrozen(catalog.presets[0].upscale)).toBe(true);

    preset.color.brightness = 0.25;
    expect(catalog.presets[0].color.brightness).toBe(1.25);
  });

  it('rejects malformed custom catalogs', () => {
    expect(() => createShaderPresetCatalog({
      presets: [getPackageDefaultPreset()],
      packageDefaultPresetId: PRESET_POLICY.packageDefaultId,
      rendererDefaultPresetId: 'missing',
      uiPresetIds: []
    })).toThrow("Renderer default preset 'missing' not found");
  });

  it('rejects duplicate preset ids', () => {
    const preset = getPackageDefaultPreset();
    expect(() => createShaderPresetCatalog({
      presets: [preset, preset],
      packageDefaultPresetId: preset.id,
      rendererDefaultPresetId: preset.id,
      uiPresetIds: [preset.id]
    })).toThrow("Duplicate preset 'true-color' found");
  });
});
