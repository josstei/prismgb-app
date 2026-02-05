import { describe, it, expect } from 'vitest';
import { PresetRegistry } from '@/domain/presets';

// Import presets to register them
import '@/domain/presets/presets/true-color.preset';
import '@/domain/presets/presets/vibrant.preset';
import '@/domain/presets/presets/hi-def.preset';
import '@/domain/presets/presets/vintage.preset';
import '@/domain/presets/presets/pixel.preset';
import '@/domain/presets/presets/performance.preset';

describe('PresetRegistry', () => {
  describe('getAll', () => {
    it('should return all registered presets', () => {
      const presets = PresetRegistry.getAll();

      expect(presets.length).toBeGreaterThanOrEqual(6);
      expect(presets.map(p => p.id)).toContain('true-color');
      expect(presets.map(p => p.id)).toContain('vibrant');
      expect(presets.map(p => p.id)).toContain('vintage');
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
    });
  });
});
