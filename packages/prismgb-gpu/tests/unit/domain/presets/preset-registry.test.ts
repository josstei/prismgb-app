import { describe, it, expect } from 'vitest';
import { PresetRegistry, BUILT_IN_PRESETS } from '@/domain/presets';

PresetRegistry.registerMany(BUILT_IN_PRESETS);

const phase2BulkPreset = {
  id: 'phase2-custom-for-test',
  name: 'Phase 2 Test Preset',
  description: 'Preset used only for registry behavior tests',
  upscale: { enabled: true },
  unsharp: { enabled: false, strength: 0 },
  color: {
    enabled: true,
    gamma: 1,
    saturation: 1,
    greenBias: 0,
    brightness: 1,
    contrast: 1
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

describe('PresetRegistry', () => {
  describe('getAll', () => {
    it('should return all registered presets', () => {
      const presets = PresetRegistry.getAll();

      expect(presets.length).toBeGreaterThanOrEqual(6);
      expect(presets.map(p => p.id)).toContain('true-color');
      expect(presets.map(p => p.id)).toContain('vibrant');
      expect(presets.map(p => p.id)).toContain('vintage');
    });

    it('should have description field on all presets', () => {
      const presets = PresetRegistry.getAll();

      presets.forEach(preset => {
        expect(preset).toHaveProperty('description');
        expect(typeof preset.description).toBe('string');
        expect(preset.description.length).toBeGreaterThan(0);
      });
    });
  });

  describe('get', () => {
    it('should return preset by id', () => {
      const preset = PresetRegistry.get('true-color');

      expect(preset).toBeDefined();
      expect(preset?.name).toBe('True Color');
    });

    it('should return undefined for unknown id', () => {
      const preset = PresetRegistry.get('unknown-preset');

      expect(preset).toBeUndefined();
    });
  });

  describe('getDefault', () => {
    it('should return the default preset', () => {
      const preset = PresetRegistry.getDefault();

      expect(preset).toBeDefined();
      expect(preset.id).toBe('true-color');
    });
  });

  describe('getForUI', () => {
    it('should return presets formatted for UI', () => {
      const presets = PresetRegistry.getForUI();

      expect(presets.length).toBeGreaterThan(0);
      expect(presets[0]).toHaveProperty('id');
      expect(presets[0]).toHaveProperty('name');
      expect(presets[0]).toHaveProperty('description');
    });

    it('should include description field for all presets', () => {
      const presets = PresetRegistry.getForUI();

      presets.forEach(preset => {
        expect(preset.description).toBeDefined();
        expect(typeof preset.description).toBe('string');
        expect(preset.description.length).toBeGreaterThan(0);
      });
    });
  });

  describe('registerMany', () => {
    it('accepts plain preset registrations without metadata', () => {
      const metadataLessPreset = {
        ...phase2BulkPreset,
        id: `${phase2BulkPreset.id}-plain`
      };

      PresetRegistry.registerMany([metadataLessPreset]);
      expect(PresetRegistry.get(metadataLessPreset.id)).toEqual(metadataLessPreset);
    });

    it('applies default and UI visibility metadata in bulk', () => {
      const hiddenPresetId = `${phase2BulkPreset.id}-hidden`;

      PresetRegistry.registerMany([
        {
          preset: { ...phase2BulkPreset, id: `${phase2BulkPreset.id}-metadata` },
          isDefault: false,
          visibleInUI: false
        },
        {
          preset: { ...phase2BulkPreset, id: hiddenPresetId },
          isDefault: true,
          visibleInUI: true
        }
      ]);

      const uiPresets = PresetRegistry.getForUI().map((preset) => preset.id);
      expect(uiPresets).toContain(hiddenPresetId);
      expect(uiPresets).not.toContain(`${phase2BulkPreset.id}-metadata`);

      expect(PresetRegistry.getDefault().id).toBe(hiddenPresetId);

      PresetRegistry.setDefault('true-color');
      expect(PresetRegistry.getDefault().id).toBe('true-color');
    });
  });
});
