import { describe, expect, it } from 'vitest';
import { PRESET_POLICY, getUiPresets, resolvePreset } from '@/index';
import { BUILT_IN_PRESET_CATALOG, BUILT_IN_PRESETS } from '@/domain/presets';
import {
  getPackageDefaultPreset,
  getPreset,
  getRendererDefaultPreset
} from '@/application/catalog';

describe('preset catalog', () => {
  it('exports built-in catalog and policy through the package entrypoint without mutable registration', () => {
    expect(BUILT_IN_PRESET_CATALOG.packageDefaultPresetId).toBe(PRESET_POLICY.packageDefaultId);
    expect(BUILT_IN_PRESET_CATALOG.rendererDefaultPresetId).toBe(PRESET_POLICY.rendererDefaultId);
    expect(getPreset(PRESET_POLICY.rendererDefaultId)).toBeDefined();
    expect(getUiPresets().map((preset) => preset.id)).not.toContain(PRESET_POLICY.performancePresetId);
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
});
