/**
 * ResolutionCalculator Unit Tests
 *
 * Tests for resolution calculations, scaling, and caching
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ResolutionCalculator } from '../../utilities/ResolutionCalculator.js';

// Chromatic native resolution
const NATIVE_WIDTH = 160;
const NATIVE_HEIGHT = 144;

describe('ResolutionCalculator', () => {
  let calc;

  beforeEach(() => {
    ResolutionCalculator.clearCache();
    calc = new ResolutionCalculator(NATIVE_WIDTH, NATIVE_HEIGHT);
  });

  afterEach(() => {
    ResolutionCalculator.clearCache();
  });

  describe('Constructor', () => {
    it('should create calculator with valid dimensions', () => {
      const calc = new ResolutionCalculator(160, 144);
      expect(calc.nativeWidth).toBe(160);
      expect(calc.nativeHeight).toBe(144);
    });

    it('should throw for invalid width', () => {
      expect(() => new ResolutionCalculator(0, 144)).toThrow('nativeWidth must be a positive number');
      expect(() => new ResolutionCalculator(-1, 144)).toThrow('nativeWidth must be a positive number');
      expect(() => new ResolutionCalculator('160', 144)).toThrow('nativeWidth must be a positive number');
    });

    it('should throw for invalid height', () => {
      expect(() => new ResolutionCalculator(160, 0)).toThrow('nativeHeight must be a positive number');
      expect(() => new ResolutionCalculator(160, -1)).toThrow('nativeHeight must be a positive number');
      expect(() => new ResolutionCalculator(160, null)).toThrow('nativeHeight must be a positive number');
    });

    it('should allow disabling cache', () => {
      const uncached = new ResolutionCalculator(160, 144, { useCache: false });
      expect(uncached.nativeWidth).toBe(160);
    });
  });

  describe('Properties', () => {
    it('should return correct native width', () => {
      expect(calc.nativeWidth).toBe(NATIVE_WIDTH);
    });

    it('should return correct native height', () => {
      expect(calc.nativeHeight).toBe(NATIVE_HEIGHT);
    });

    it('should calculate correct aspect ratio', () => {
      expect(calc.aspectRatio).toBeCloseTo(160 / 144, 5);
    });
  });

  describe('getNativeResolution', () => {
    it('should return native resolution object', () => {
      const native = calc.getNativeResolution();
      expect(native).toEqual({ width: NATIVE_WIDTH, height: NATIVE_HEIGHT });
    });
  });

  describe('calculateScaled', () => {
    it('should calculate 1x scale', () => {
      const result = calc.calculateScaled(1);
      expect(result).toEqual({ width: 160, height: 144, scale: 1 });
    });

    it('should calculate 2x scale', () => {
      const result = calc.calculateScaled(2);
      expect(result).toEqual({ width: 320, height: 288, scale: 2 });
    });

    it('should calculate 4x scale (default canvas scale)', () => {
      const result = calc.calculateScaled(4);
      expect(result).toEqual({ width: 640, height: 576, scale: 4 });
    });

    it('should calculate 8x scale', () => {
      const result = calc.calculateScaled(8);
      expect(result).toEqual({ width: 1280, height: 1152, scale: 8 });
    });

    it('should throw for scale < 1', () => {
      expect(() => calc.calculateScaled(0)).toThrow('Scale must be a number >= 1');
      expect(() => calc.calculateScaled(0.5)).toThrow('Scale must be a number >= 1');
      expect(() => calc.calculateScaled(-1)).toThrow('Scale must be a number >= 1');
    });

    it('should throw for non-number scale', () => {
      expect(() => calc.calculateScaled('4')).toThrow('Scale must be a number >= 1');
      expect(() => calc.calculateScaled(null)).toThrow('Scale must be a number >= 1');
    });

    it('should cache results for repeated calls', () => {
      const result1 = calc.calculateScaled(4);
      const result2 = calc.calculateScaled(4);
      // Same reference when cached
      expect(result1).toBe(result2);
    });
  });

  describe('calculateScaleToFit', () => {
    it('should fit to container constrained by width', () => {
      // 320 width container: 320/160 = 2, would give 2x
      // 1000 height container: 1000/144 = 6.94, floor = 6
      // Min of 2 and 6 = 2
      const scale = calc.calculateScaleToFit(320, 1000);
      expect(scale).toBe(2);
    });

    it('should fit to container constrained by height', () => {
      // 1000 width container: 1000/160 = 6.25, floor = 6
      // 288 height container: 288/144 = 2
      // Min of 6 and 2 = 2
      const scale = calc.calculateScaleToFit(1000, 288);
      expect(scale).toBe(2);
    });

    it('should respect minScale option', () => {
      // Would calculate to 0, but minScale = 2
      const scale = calc.calculateScaleToFit(100, 100, { minScale: 2 });
      expect(scale).toBe(2);
    });

    it('should respect maxScale option', () => {
      // Would calculate to 6, but maxScale = 4
      const scale = calc.calculateScaleToFit(1000, 1000, { maxScale: 4 });
      expect(scale).toBe(4);
    });

    it('should apply both minScale and maxScale', () => {
      const scale = calc.calculateScaleToFit(500, 500, { minScale: 2, maxScale: 3 });
      expect(scale).toBe(3);
    });

    it('should throw for invalid dimensions', () => {
      expect(() => calc.calculateScaleToFit('800', 600)).toThrow('Valid dimensions required');
      expect(() => calc.calculateScaleToFit(800, null)).toThrow('Valid dimensions required');
    });
  });

  describe('fitToContainer', () => {
    it('should return scaled dimensions that fit container', () => {
      const result = calc.fitToContainer(800, 600);
      // 800/160 = 5, 600/144 = 4.16, floor = 4
      expect(result).toEqual({ width: 640, height: 576, scale: 4 });
    });

    it('should pass options to calculateScaleToFit', () => {
      const result = calc.fitToContainer(800, 600, { maxScale: 2 });
      expect(result).toEqual({ width: 320, height: 288, scale: 2 });
    });
  });

  describe('getAspectRatioLabel', () => {
    it('should return simplified aspect ratio for Chromatic', () => {
      // 160:144 simplifies to 10:9
      const label = calc.getAspectRatioLabel();
      expect(label).toBe('10:9');
    });

    it('should handle other aspect ratios', () => {
      const widescreen = new ResolutionCalculator(1920, 1080);
      expect(widescreen.getAspectRatioLabel()).toBe('16:9');

      const standard = new ResolutionCalculator(640, 480);
      expect(standard.getAspectRatioLabel()).toBe('4:3');

      const square = new ResolutionCalculator(100, 100);
      expect(square.getAspectRatioLabel()).toBe('1:1');
    });
  });

  describe('findNearestResolution', () => {
    const resolutions = [
      { width: 160, height: 144 },   // 1x
      { width: 320, height: 288 },   // 2x
      { width: 640, height: 576 },   // 4x
      { width: 1280, height: 1152 }, // 8x
    ];

    it('should find exact match', () => {
      const nearest = calc.findNearestResolution(640, 576, resolutions);
      expect(nearest).toEqual({ width: 640, height: 576 });
    });

    it('should find closest match for between values', () => {
      const nearest = calc.findNearestResolution(500, 450, resolutions);
      expect(nearest).toEqual({ width: 640, height: 576 });
    });

    it('should find closest for small values', () => {
      const nearest = calc.findNearestResolution(100, 100, resolutions);
      expect(nearest).toEqual({ width: 160, height: 144 });
    });

    it('should find closest for large values', () => {
      const nearest = calc.findNearestResolution(2000, 2000, resolutions);
      expect(nearest).toEqual({ width: 1280, height: 1152 });
    });

    it('should return native resolution for empty array', () => {
      const nearest = calc.findNearestResolution(500, 500, []);
      expect(nearest).toEqual({ width: 160, height: 144 });
    });

    it('should return native resolution for null/undefined', () => {
      const nearest = calc.findNearestResolution(500, 500, null);
      expect(nearest).toEqual({ width: 160, height: 144 });
    });
  });

  describe('Caching Behavior', () => {
    it('should use cache for calculateScaled', () => {
      // First call computes
      calc.calculateScaled(4);

      // Get stats before second call
      const statsBefore = ResolutionCalculator.getCacheStats();
      const hitsBefore = statsBefore.hits;

      // Second call should hit cache
      calc.calculateScaled(4);

      const statsAfter = ResolutionCalculator.getCacheStats();
      expect(statsAfter.hits).toBe(hitsBefore + 1);
    });

    it('should bypass cache when useCache is false', () => {
      const uncached = new ResolutionCalculator(160, 144, { useCache: false });

      const result1 = uncached.calculateScaled(4);
      const result2 = uncached.calculateScaled(4);

      // Different objects (not cached)
      expect(result1).not.toBe(result2);
      // But same values
      expect(result1).toEqual(result2);
    });

    it('should bypass cache for calculateScaleToFit when useCache is false', () => {
      const uncached = new ResolutionCalculator(160, 144, { useCache: false });

      // Test basic calculation
      const scale1 = uncached.calculateScaleToFit(800, 600);
      expect(scale1).toBe(4); // 800/160=5, 600/144=4.16 -> min(5,4)=4

      // Test with minScale option
      const scale2 = uncached.calculateScaleToFit(100, 100, { minScale: 2 });
      expect(scale2).toBe(2);

      // Test with maxScale option
      const scale3 = uncached.calculateScaleToFit(1000, 1000, { maxScale: 3 });
      expect(scale3).toBe(3);

      // Test with both options
      const scale4 = uncached.calculateScaleToFit(500, 500, { minScale: 2, maxScale: 4 });
      expect(scale4).toBe(3); // 500/160=3.1, 500/144=3.4 -> min=3, clamped to [2,4]
    });

    it('should bypass cache for findNearestResolution when useCache is false', () => {
      const uncached = new ResolutionCalculator(160, 144, { useCache: false });
      const resolutions = [
        { width: 160, height: 144 },
        { width: 320, height: 288 },
        { width: 640, height: 576 },
        { width: 1280, height: 1152 },
      ];

      // Test exact match
      const nearest1 = uncached.findNearestResolution(640, 576, resolutions);
      expect(nearest1).toEqual({ width: 640, height: 576 });

      // Test closest match (should find 640x576)
      const nearest2 = uncached.findNearestResolution(500, 450, resolutions);
      expect(nearest2).toEqual({ width: 640, height: 576 });

      // Test small values (should find 160x144)
      const nearest3 = uncached.findNearestResolution(100, 100, resolutions);
      expect(nearest3).toEqual({ width: 160, height: 144 });

      // Test large values (should find 1280x1152)
      const nearest4 = uncached.findNearestResolution(2000, 2000, resolutions);
      expect(nearest4).toEqual({ width: 1280, height: 1152 });

      // Test single resolution array
      const nearest5 = uncached.findNearestResolution(500, 500, [{ width: 320, height: 288 }]);
      expect(nearest5).toEqual({ width: 320, height: 288 });
    });

    it('should clear cache', () => {
      calc.calculateScaled(4);
      expect(ResolutionCalculator.getCacheStats().size).toBeGreaterThan(0);

      ResolutionCalculator.clearCache();
      expect(ResolutionCalculator.getCacheStats().size).toBe(0);
    });
  });

  describe('Performance', () => {
    it('should handle rapid repeated calculations efficiently', () => {
      const iterations = 1000;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        calc.calculateScaled(4);
        calc.calculateScaleToFit(800, 600);
      }

      const duration = performance.now() - start;

      // Should complete 2000 operations in under 100ms with caching
      expect(duration).toBeLessThan(100);
    });

    it('should handle many different scale values', () => {
      const scales = [1, 2, 3, 4, 5, 6, 7, 8];
      const start = performance.now();

      for (let i = 0; i < 100; i++) {
        scales.forEach(scale => calc.calculateScaled(scale));
      }

      const duration = performance.now() - start;
      expect(duration).toBeLessThan(50);
    });
  });
});
