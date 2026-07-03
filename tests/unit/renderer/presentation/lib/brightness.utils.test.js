/**
 * Brightness Utils Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { sliderToBrightness, brightnessToSlider } from '@renderer/presentation/lib/brightness.utils';

describe('brightness.utils', () => {
  describe('sliderToBrightness', () => {
    it('should convert slider 0 to brightness 0.5', () => {
      expect(sliderToBrightness(0)).toBe(0.5);
    });

    it('should convert slider 50 to brightness 1.0 (normal)', () => {
      expect(sliderToBrightness(50)).toBe(1.0);
    });

    it('should convert slider 100 to brightness 1.5', () => {
      expect(sliderToBrightness(100)).toBe(1.5);
    });

    it('should handle intermediate values', () => {
      expect(sliderToBrightness(25)).toBe(0.75);
      expect(sliderToBrightness(75)).toBe(1.25);
    });
  });

  describe('brightnessToSlider', () => {
    it('should convert brightness 0.5 to slider 0', () => {
      expect(brightnessToSlider(0.5)).toBe(0);
    });

    it('should convert brightness 1.0 to slider 50', () => {
      expect(brightnessToSlider(1.0)).toBe(50);
    });

    it('should convert brightness 1.5 to slider 100', () => {
      expect(brightnessToSlider(1.5)).toBe(100);
    });

    it('should handle intermediate values and round correctly', () => {
      expect(brightnessToSlider(0.75)).toBe(25);
      expect(brightnessToSlider(1.25)).toBe(75);
    });

    it('should round to nearest integer', () => {
      expect(brightnessToSlider(0.755)).toBe(26);
      expect(brightnessToSlider(1.004)).toBe(50);
    });
  });

  describe('roundtrip conversion', () => {
    it('should maintain value through slider -> brightness -> slider', () => {
      const testValues = [0, 25, 50, 75, 100];
      testValues.forEach(slider => {
        const brightness = sliderToBrightness(slider);
        const result = brightnessToSlider(brightness);
        expect(result).toBe(slider);
      });
    });
  });
});
