/**
 * Render Presets Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PRESET_ID,
  getPresetById,
  getPresetsForUI,
  buildUniformsFromPreset
} from '@renderer/features/streaming/rendering/presets/render-presets.config.js';

describe('RenderPresets', () => {
  describe('DEFAULT_PRESET_ID', () => {
    it('should be vibrant', () => {
      expect(DEFAULT_PRESET_ID).toBe('vibrant');
    });
  });

  describe('getPresetById', () => {
    it('should return TRUE_COLOR preset with lowercase hyphenated id', () => {
      const preset = getPresetById('true-color');

      expect(preset).toBeDefined();
      expect(preset.id).toBe('true-color');
      expect(preset.name).toBe('True Color');
    });

    it('should return VIBRANT preset', () => {
      const preset = getPresetById('vibrant');

      expect(preset).toBeDefined();
      expect(preset.id).toBe('vibrant');
      expect(preset.name).toBe('Vibrant');
    });

    it('should return HI_DEF preset with hyphenated id', () => {
      const preset = getPresetById('hi-def');

      expect(preset).toBeDefined();
      expect(preset.id).toBe('hi-def');
      expect(preset.name).toBe('Hi-Def');
    });

    it('should return VINTAGE preset', () => {
      const preset = getPresetById('vintage');

      expect(preset).toBeDefined();
      expect(preset.id).toBe('vintage');
      expect(preset.name).toBe('Vintage');
    });

    it('should return PIXEL preset', () => {
      const preset = getPresetById('pixel');

      expect(preset).toBeDefined();
      expect(preset.id).toBe('pixel');
      expect(preset.name).toBe('Pixel');
    });

    it('should return PERFORMANCE preset', () => {
      const preset = getPresetById('performance');

      expect(preset).toBeDefined();
      expect(preset.id).toBe('performance');
      expect(preset.name).toBe('Performance');
    });

    it('should return null for unknown preset', () => {
      const preset = getPresetById('unknown');

      expect(preset).toBeNull();
    });

    it('should return null for null input', () => {
      const preset = getPresetById(null);

      expect(preset).toBeNull();
    });

    it('should return null for undefined input', () => {
      const preset = getPresetById(undefined);

      expect(preset).toBeNull();
    });

    it('should handle uppercase input', () => {
      const preset = getPresetById('VIBRANT');

      expect(preset).toBeDefined();
      expect(preset.id).toBe('vibrant');
    });

    it('should handle mixed case input', () => {
      const preset = getPresetById('True-Color');

      expect(preset).toBeDefined();
      expect(preset.id).toBe('true-color');
    });
  });

  describe('getPresetsForUI', () => {
    it('should return array of presets for UI rendering', () => {
      const presets = getPresetsForUI();

      expect(Array.isArray(presets)).toBe(true);
      expect(presets.length).toBe(6);
    });

    it('should contain required fields for each preset', () => {
      const presets = getPresetsForUI();

      presets.forEach(preset => {
        expect(preset).toHaveProperty('id');
        expect(preset).toHaveProperty('name');
        expect(preset).toHaveProperty('description');
        expect(typeof preset.id).toBe('string');
        expect(typeof preset.name).toBe('string');
        expect(typeof preset.description).toBe('string');
      });
    });

    it('should not include shader configuration details', () => {
      const presets = getPresetsForUI();

      presets.forEach(preset => {
        expect(preset).not.toHaveProperty('upscale');
        expect(preset).not.toHaveProperty('unsharp');
        expect(preset).not.toHaveProperty('color');
        expect(preset).not.toHaveProperty('crt');
      });
    });

    it('should include all preset ids', () => {
      const presets = getPresetsForUI();
      const ids = presets.map(p => p.id);

      expect(ids).toContain('true-color');
      expect(ids).toContain('vibrant');
      expect(ids).toContain('hi-def');
      expect(ids).toContain('vintage');
      expect(ids).toContain('pixel');
      expect(ids).toContain('performance');
    });
  });

  describe('buildUniformsFromPreset', () => {
    const scaleFactor = 4;
    const outputWidth = 640;
    const outputHeight = 576;

    it('should build uniforms for TRUE_COLOR preset', () => {
      const preset = getPresetById('true-color');
      const uniforms = buildUniformsFromPreset(preset, scaleFactor, outputWidth, outputHeight);

      expect(uniforms).toHaveProperty('upscale');
      expect(uniforms).toHaveProperty('unsharp');
      expect(uniforms).toHaveProperty('color');
      expect(uniforms).toHaveProperty('crt');
    });

    it('should set correct upscale uniforms', () => {
      const preset = getPresetById('vibrant');
      const uniforms = buildUniformsFromPreset(preset, scaleFactor, outputWidth, outputHeight);

      expect(uniforms.upscale.sourceSize).toEqual([160, 144]);
      expect(uniforms.upscale.targetSize).toEqual([outputWidth, outputHeight]);
      expect(uniforms.upscale.scaleFactor).toBe(scaleFactor);
    });

    it('should set unsharp uniforms from preset', () => {
      const preset = getPresetById('vibrant');
      const uniforms = buildUniformsFromPreset(preset, scaleFactor, outputWidth, outputHeight);

      expect(uniforms.unsharp.enabled).toBe(true);
      expect(uniforms.unsharp.strength).toBe(0.3);
      expect(uniforms.unsharp.texelSize).toEqual([1.0 / outputWidth, 1.0 / outputHeight]);
      expect(uniforms.unsharp.scaleFactor).toBe(scaleFactor);
    });

    it('should set color uniforms from preset', () => {
      const preset = getPresetById('vibrant');
      const uniforms = buildUniformsFromPreset(preset, scaleFactor, outputWidth, outputHeight);

      expect(uniforms.color.enabled).toBe(true);
      expect(uniforms.color.gamma).toBe(0.88);
      expect(uniforms.color.saturation).toBe(1.2);
      expect(uniforms.color.greenBias).toBe(0.02);
      expect(uniforms.color.brightness).toBe(1.05);
      expect(uniforms.color.contrast).toBe(1.1);
    });

    it('should set CRT uniforms from preset', () => {
      const preset = getPresetById('vintage');
      const uniforms = buildUniformsFromPreset(preset, scaleFactor, outputWidth, outputHeight);

      expect(uniforms.crt.enabled).toBe(true);
      expect(uniforms.crt.resolution).toEqual([outputWidth, outputHeight]);
      expect(uniforms.crt.scanlineStrength).toBe(0.25);
      expect(uniforms.crt.pixelMaskStrength).toBe(0.0);
      expect(uniforms.crt.bloomStrength).toBe(0.1);
      expect(uniforms.crt.curvature).toBe(0.02);
      expect(uniforms.crt.vignetteStrength).toBe(0.15);
      expect(uniforms.crt.scaleFactor).toBe(scaleFactor);
    });

    it('should disable effects for PERFORMANCE preset', () => {
      const preset = getPresetById('performance');
      const uniforms = buildUniformsFromPreset(preset, scaleFactor, outputWidth, outputHeight);

      expect(uniforms.unsharp.enabled).toBe(false);
      expect(uniforms.color.enabled).toBe(false);
      expect(uniforms.crt.enabled).toBe(false);
    });

    it('should handle different output dimensions', () => {
      const preset = getPresetById('true-color');
      const uniforms = buildUniformsFromPreset(preset, 8, 1280, 1152);

      expect(uniforms.upscale.targetSize).toEqual([1280, 1152]);
      expect(uniforms.upscale.scaleFactor).toBe(8);
      expect(uniforms.unsharp.texelSize).toEqual([1.0 / 1280, 1.0 / 1152]);
      expect(uniforms.crt.resolution).toEqual([1280, 1152]);
    });
  });

  describe('Preset Structure Validation', () => {
    const presetIds = ['true-color', 'vibrant', 'hi-def', 'vintage', 'pixel', 'performance'];

    presetIds.forEach(id => {
      describe(`${id} preset`, () => {
        it('should have valid upscale config', () => {
          const preset = getPresetById(id);

          expect(preset.upscale).toBeDefined();
          expect(typeof preset.upscale.enabled).toBe('boolean');
        });

        it('should have valid unsharp config', () => {
          const preset = getPresetById(id);

          expect(preset.unsharp).toBeDefined();
          expect(typeof preset.unsharp.enabled).toBe('boolean');
          expect(typeof preset.unsharp.strength).toBe('number');
          expect(preset.unsharp.strength).toBeGreaterThanOrEqual(0);
          expect(preset.unsharp.strength).toBeLessThanOrEqual(1.5);
        });

        it('should have valid color config', () => {
          const preset = getPresetById(id);

          expect(preset.color).toBeDefined();
          expect(typeof preset.color.enabled).toBe('boolean');
          expect(typeof preset.color.gamma).toBe('number');
          expect(typeof preset.color.saturation).toBe('number');
          expect(typeof preset.color.greenBias).toBe('number');
          expect(typeof preset.color.brightness).toBe('number');
          expect(typeof preset.color.contrast).toBe('number');
        });

        it('should have valid crt config', () => {
          const preset = getPresetById(id);

          expect(preset.crt).toBeDefined();
          expect(typeof preset.crt.enabled).toBe('boolean');
          expect(typeof preset.crt.scanlineStrength).toBe('number');
          expect(typeof preset.crt.pixelMaskStrength).toBe('number');
          expect(typeof preset.crt.bloomStrength).toBe('number');
          expect(typeof preset.crt.curvature).toBe('number');
          expect(typeof preset.crt.vignetteStrength).toBe('number');
        });
      });
    });
  });
});
