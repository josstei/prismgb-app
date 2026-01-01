/**
 * PerformanceCache Unit Tests
 *
 * Tests for LRU cache, TTL expiration, and specialized caches
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PerformanceCache,
  AnimationCache
} from '../../../src/shared/utils/performance-cache.utils.js';

/**
 * ResolutionCache - Test-only class for resolution calculations
 */
class ResolutionCache extends PerformanceCache {
  constructor() {
    super({ maxSize: 50, defaultTTL: 300000 }); // 5 minute TTL
  }

  getScaled(nativeWidth, nativeHeight, scale) {
    const key = PerformanceCache.generateKey('scaled', nativeWidth, nativeHeight, scale);
    return this.getOrCompute(key, () => ({
      width: nativeWidth * scale,
      height: nativeHeight * scale,
      scale
    }));
  }

  getScaleToFit(nativeWidth, nativeHeight, containerWidth, containerHeight, options = {}) {
    const key = PerformanceCache.generateKey('scaleToFit',
      nativeWidth, nativeHeight, containerWidth, containerHeight, options);

    return this.getOrCompute(key, () => {
      const { minScale = 1, maxScale = Infinity } = options;
      const scaleX = Math.floor(containerWidth / nativeWidth);
      const scaleY = Math.floor(containerHeight / nativeHeight);
      const scale = Math.min(scaleX, scaleY);
      return Math.max(minScale, Math.min(maxScale, scale));
    });
  }

  getNearestResolution(targetWidth, targetHeight, resolutions, defaultRes) {
    if (!resolutions || resolutions.length === 0) {
      return defaultRes;
    }

    const key = PerformanceCache.generateKey('nearest',
      targetWidth, targetHeight, resolutions.length);

    return this.getOrCompute(key, () => {
      let nearest = resolutions[0];
      let minDistance = Infinity;

      for (const resolution of resolutions) {
        const dx = resolution.width - targetWidth;
        const dy = resolution.height - targetHeight;
        const distanceSquared = dx * dx + dy * dy;

        if (distanceSquared < minDistance) {
          minDistance = distanceSquared;
          nearest = resolution;
        }
      }

      return nearest;
    });
  }
}

describe('PerformanceCache', () => {
  let cache;

  beforeEach(() => {
    cache = new PerformanceCache({ maxSize: 5, defaultTTL: 1000 });
  });

  describe('Basic Operations', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for missing keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should correctly check if key exists', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should delete entries', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.delete('nonexistent')).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.size).toBe(0);
    });

    it('should report correct size', () => {
      expect(cache.size).toBe(0);
      cache.set('key1', 'value1');
      expect(cache.size).toBe(1);
      cache.set('key2', 'value2');
      expect(cache.size).toBe(2);
    });
  });

  describe('LRU Eviction', () => {
    it('should evict oldest entry when at capacity', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4');
      cache.set('key5', 'value5');

      // Cache is now full (5 items)
      expect(cache.size).toBe(5);

      // Add one more - should evict key1
      cache.set('key6', 'value6');
      expect(cache.size).toBe(5);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key6')).toBe('value6');
    });

    it('should move accessed items to end (LRU behavior)', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4');
      cache.set('key5', 'value5');

      // Access key1 to make it recently used
      cache.get('key1');

      // Add new item - should evict key2 (now oldest)
      cache.set('key6', 'value6');
      expect(cache.get('key1')).toBe('value1'); // Still exists
      expect(cache.get('key2')).toBeUndefined(); // Evicted
    });
  });

  describe('TTL Expiration', () => {
    it('should expire entries after TTL', async () => {
      const shortTTLCache = new PerformanceCache({ maxSize: 10, defaultTTL: 50 });
      shortTTLCache.set('key1', 'value1');

      expect(shortTTLCache.get('key1')).toBe('value1');

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 60));

      expect(shortTTLCache.get('key1')).toBeUndefined();
    });

    it('should respect custom TTL per entry', async () => {
      cache.set('short', 'value', 50); // 50ms TTL
      cache.set('long', 'value', 5000); // 5s TTL

      await new Promise(resolve => setTimeout(resolve, 60));

      expect(cache.get('short')).toBeUndefined();
      expect(cache.get('long')).toBe('value');
    });

    it('should not expire entries with TTL of 0', async () => {
      cache.set('permanent', 'value', 0);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(cache.get('permanent')).toBe('value');
    });

    it('should clear expired entries', async () => {
      const shortTTLCache = new PerformanceCache({ maxSize: 10, defaultTTL: 50 });
      shortTTLCache.set('key1', 'value1');
      shortTTLCache.set('key2', 'value2');

      await new Promise(resolve => setTimeout(resolve, 60));

      const cleared = shortTTLCache.clearExpired();
      expect(cleared).toBe(2);
      expect(shortTTLCache.size).toBe(0);
    });
  });

  describe('Memoization (getOrCompute)', () => {
    it('should compute and cache value on miss', () => {
      const compute = vi.fn(() => 'computed');

      const result = cache.getOrCompute('key1', compute);

      expect(result).toBe('computed');
      expect(compute).toHaveBeenCalledTimes(1);
    });

    it('should return cached value on hit without recomputing', () => {
      const compute = vi.fn(() => 'computed');

      cache.getOrCompute('key1', compute);
      const result = cache.getOrCompute('key1', compute);

      expect(result).toBe('computed');
      expect(compute).toHaveBeenCalledTimes(1); // Only called once
    });
  });

  describe('Statistics', () => {
    it('should track hits and misses', () => {
      cache.set('key1', 'value1');

      cache.get('key1'); // Hit
      cache.get('key1'); // Hit
      cache.get('nonexistent'); // Miss
      cache.get('nonexistent'); // Miss
      cache.get('nonexistent'); // Miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(3);
      expect(stats.hitRate).toBe('40.00%');
    });

    it('should report correct size and maxSize', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(5);
    });
  });

  describe('Key Generation', () => {
    it('should generate consistent keys from arguments', () => {
      const key1 = PerformanceCache.generateKey('prefix', 100, 200);
      const key2 = PerformanceCache.generateKey('prefix', 100, 200);
      const key3 = PerformanceCache.generateKey('prefix', 100, 300);

      expect(key1).toBe(key2);
      expect(key1).not.toBe(key3);
    });

    it('should handle object arguments', () => {
      const key1 = PerformanceCache.generateKey('prefix', { a: 1 });
      const key2 = PerformanceCache.generateKey('prefix', { a: 1 });

      expect(key1).toBe(key2);
    });

    it('should handle null and undefined', () => {
      const key1 = PerformanceCache.generateKey('prefix', null, undefined);
      expect(key1).toContain('null');
    });
  });
});

describe('ResolutionCache', () => {
  let cache;

  beforeEach(() => {
    cache = new ResolutionCache();
  });

  describe('getScaled', () => {
    it('should cache scaled resolution calculations', () => {
      const result1 = cache.getScaled(160, 144, 4);
      const result2 = cache.getScaled(160, 144, 4);

      expect(result1).toEqual({ width: 640, height: 576, scale: 4 });
      expect(result1).toBe(result2); // Same reference (cached)
    });

    it('should cache different scales separately', () => {
      const scale1 = cache.getScaled(160, 144, 1);
      const scale4 = cache.getScaled(160, 144, 4);

      expect(scale1).toEqual({ width: 160, height: 144, scale: 1 });
      expect(scale4).toEqual({ width: 640, height: 576, scale: 4 });
    });
  });

  describe('getScaleToFit', () => {
    it('should cache scale-to-fit calculations', () => {
      const scale1 = cache.getScaleToFit(160, 144, 800, 600);
      const scale2 = cache.getScaleToFit(160, 144, 800, 600);

      expect(scale1).toBe(4); // 800/160 = 5, 600/144 = 4.16, min = 4
      expect(scale1).toBe(scale2);
    });

    it('should respect minScale and maxScale options', () => {
      const scale = cache.getScaleToFit(160, 144, 100, 100, { minScale: 2, maxScale: 3 });

      expect(scale).toBe(2); // Would be 0 but minScale = 2
    });
  });

  describe('getNearestResolution', () => {
    it('should find nearest resolution using squared distance', () => {
      const resolutions = [
        { width: 320, height: 288 },
        { width: 640, height: 576 },
        { width: 1280, height: 1152 },
      ];

      const nearest = cache.getNearestResolution(600, 500, resolutions, { width: 160, height: 144 });

      expect(nearest).toEqual({ width: 640, height: 576 });
    });

    it('should return default for empty resolutions', () => {
      const defaultRes = { width: 160, height: 144 };
      const result = cache.getNearestResolution(600, 500, [], defaultRes);

      expect(result).toBe(defaultRes);
    });
  });
});

describe('AnimationCache', () => {
  let cache;

  beforeEach(() => {
    cache = new AnimationCache();
  });

  describe('Animation Registration', () => {
    it('should register animations', () => {
      cache.registerAnimation('render', 123);

      expect(cache.isAnimationActive('render')).toBe(true);
      expect(cache.activeCount).toBe(1);
    });

    it('should track multiple animations', () => {
      cache.registerAnimation('render', 123);
      cache.registerAnimation('ui', 456);

      expect(cache.activeCount).toBe(2);
    });
  });

  describe('Animation Cancellation', () => {
    it('should cancel a specific animation', () => {
      cache.registerAnimation('render', 123);

      const cancelled = cache.cancelAnimation('render');

      expect(cancelled).toBe(true);
      expect(cache.isAnimationActive('render')).toBe(false);
    });

    it('should return false for non-existent animation', () => {
      const cancelled = cache.cancelAnimation('nonexistent');
      expect(cancelled).toBe(false);
    });

    it('should cancel all animations', () => {
      cache.registerAnimation('render', 123);
      cache.registerAnimation('ui', 456);

      cache.cancelAllAnimations();

      expect(cache.activeCount).toBe(0);
    });
  });

  describe('Animation Runtime', () => {
    it('should track animation runtime', async () => {
      cache.registerAnimation('render', 123);

      await new Promise(r => setTimeout(r, 50));

      const runtime = cache.getAnimationRuntime('render');
      expect(runtime).toBeGreaterThanOrEqual(45); // Allow some tolerance
    });

    it('should return -1 for non-existent animation', () => {
      expect(cache.getAnimationRuntime('nonexistent')).toBe(-1);
    });
  });
});
