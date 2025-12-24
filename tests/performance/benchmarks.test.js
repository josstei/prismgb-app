/**
 * Performance Benchmark Tests
 *
 * Measures performance of critical paths to ensure optimizations
 * are effective and catch performance regressions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResolutionCalculator } from '../utilities/ResolutionCalculator.js';
import {
  PerformanceCache,
  AnimationCache
} from '../../src/shared/utils/performance-cache.js';
import {
  MockDevice,
  MockDeviceManager,
  CHROMATIC_SPECS,
  createMockStream,
  performanceUtils,
} from '../mocks/index.js';

// Performance thresholds (in milliseconds)
const THRESHOLDS = {
  resolutionCalcCached: 0.1,      // Cached resolution calc < 0.1ms
  resolutionCalcUncached: 1,     // Uncached resolution calc < 1ms
  cacheOperations: 0.05,          // Cache get/set < 0.05ms
  eventBusPublish: 0.1,           // Event publish < 0.1ms
  mockStreamCreation: 5,          // Mock stream creation < 5ms
  batchOperations1000: 50,        // 1000 operations < 50ms
};

describe('Performance Benchmarks', () => {
  beforeEach(() => {
    ResolutionCalculator.clearCache();
  });

  afterEach(() => {
    ResolutionCalculator.clearCache();
  });

  describe('ResolutionCalculator Performance', () => {
    const calc = new ResolutionCalculator(160, 144);

    it('should calculate scaled resolution under threshold (cached)', async () => {
      // Warm up cache
      calc.calculateScaled(4);

      const result = await performanceUtils.measureTime(
        () => calc.calculateScaled(4),
        1000
      );

      console.log(`Cached calculateScaled: avg=${result.avg.toFixed(4)}ms, min=${result.min.toFixed(4)}ms, max=${result.max.toFixed(4)}ms`);

      expect(result.avg).toBeLessThan(THRESHOLDS.resolutionCalcCached);
    });

    it('should calculate scaled resolution under threshold (uncached)', async () => {
      const uncachedCalc = new ResolutionCalculator(160, 144, { useCache: false });

      const result = await performanceUtils.measureTime(
        () => uncachedCalc.calculateScaled(4),
        1000
      );

      console.log(`Uncached calculateScaled: avg=${result.avg.toFixed(4)}ms`);

      expect(result.avg).toBeLessThan(THRESHOLDS.resolutionCalcUncached);
    });

    it('should handle 10000 resolution calculations efficiently', async () => {
      const scales = [1, 2, 3, 4, 5, 6, 7, 8];

      const result = await performanceUtils.measureTime(() => {
        for (let i = 0; i < 1250; i++) {
          scales.forEach(scale => calc.calculateScaled(scale));
        }
      }, 1);

      console.log(`10000 resolution calculations: ${result.total.toFixed(2)}ms`);

      // 10000 calculations should complete in under 100ms
      expect(result.total).toBeLessThan(100);
    });

    it('should demonstrate cache hit rate for repeated lookups', () => {
      const calc = new ResolutionCalculator(160, 144, { useCache: true });

      // Prime the cache
      calc.calculateScaled(4);
      calc.calculateScaleToFit(800, 600);

      // Get stats before
      const statsBefore = ResolutionCalculator.getCacheStats();

      // Perform many lookups (should all be cache hits)
      const iterations = 1000;
      for (let i = 0; i < iterations; i++) {
        calc.calculateScaled(4);
        calc.calculateScaleToFit(800, 600);
      }

      const statsAfter = ResolutionCalculator.getCacheStats();
      const newHits = statsAfter.hits - statsBefore.hits;

      console.log(`Cache hits for ${iterations * 2} operations: ${newHits} (${(newHits / (iterations * 2) * 100).toFixed(1)}% hit rate)`);

      // Should have high cache hit rate
      expect(newHits).toBeGreaterThan(iterations * 1.5); // At least 75% hit rate
    });
  });

  describe('PerformanceCache Performance', () => {
    let cache;

    beforeEach(() => {
      cache = new PerformanceCache({ maxSize: 1000, defaultTTL: 60000 });
    });

    it('should get/set under threshold', async () => {
      // Pre-populate
      for (let i = 0; i < 500; i++) {
        cache.set(`key-${i}`, { value: i });
      }

      const result = await performanceUtils.measureTime(() => {
        cache.set('test-key', { value: 'test' });
        cache.get('test-key');
      }, 10000);

      console.log(`Cache get/set: avg=${result.avg.toFixed(5)}ms`);

      expect(result.avg).toBeLessThan(THRESHOLDS.cacheOperations);
    });

    it('should handle LRU eviction efficiently', async () => {
      const smallCache = new PerformanceCache({ maxSize: 100, defaultTTL: 60000 });

      const result = await performanceUtils.measureTime(() => {
        // This will cause constant evictions
        for (let i = 0; i < 200; i++) {
          smallCache.set(`key-${i}`, { value: i });
        }
      }, 100);

      console.log(`LRU eviction (200 items, 100 capacity): avg=${result.avg.toFixed(2)}ms`);

      // 200 set operations with evictions should complete quickly
      expect(result.avg).toBeLessThan(10);
    });

    it('should memoize computations efficiently', async () => {
      let computeCount = 0;
      const expensiveCompute = () => {
        computeCount++;
        let sum = 0;
        for (let i = 0; i < 1000; i++) sum += i;
        return sum;
      };

      const result = await performanceUtils.measureTime(() => {
        for (let i = 0; i < 1000; i++) {
          cache.getOrCompute('memoized', expensiveCompute);
        }
      }, 1);

      console.log(`1000 memoized calls: ${result.total.toFixed(2)}ms, compute called: ${computeCount} time(s)`);

      expect(computeCount).toBe(1); // Should only compute once
      expect(result.total).toBeLessThan(50);
    });
  });

  describe('AnimationCache Performance', () => {
    let animCache;

    beforeEach(() => {
      animCache = new AnimationCache();
    });

    it('should register/cancel animations efficiently', async () => {
      const result = await performanceUtils.measureTime(() => {
        for (let i = 0; i < 100; i++) {
          animCache.registerAnimation(`anim-${i}`, i);
        }
        animCache.cancelAllAnimations();
      }, 100);

      console.log(`100 animation register/cancel cycles: avg=${result.avg.toFixed(3)}ms`);

      expect(result.avg).toBeLessThan(5);
    });
  });

  describe('MockDevice Performance', () => {
    it('should create mock streams quickly', async () => {
      const device = new MockDevice();

      const result = await performanceUtils.measureTime(
        async () => await device.getStream(),
        100
      );

      console.log(`Mock stream creation: avg=${result.avg.toFixed(3)}ms`);

      expect(result.avg).toBeLessThan(THRESHOLDS.mockStreamCreation);
    });

    it('should generate frames at target rate', async () => {
      // Use fake timers for deterministic frame generation testing
      vi.useFakeTimers();

      const device = new MockDevice();
      const frames = [];
      const targetFps = 60;
      const duration = 1000; // 1 second test

      device.startFrameGeneration((frame) => {
        frames.push(frame);
      }, targetFps);

      // Advance time by the duration
      vi.advanceTimersByTime(duration);

      device._stopFrameGeneration();

      // Restore real timers
      vi.useRealTimers();

      const expectedFrames = (targetFps * duration) / 1000;

      console.log(`Frame generation: ${frames.length} frames in ${duration}ms (expected ${expectedFrames})`);

      // With fake timers, we should get very close to expected (allow ±5% for interval edge cases)
      expect(frames.length).toBeGreaterThanOrEqual(expectedFrames * 0.95);
      expect(frames.length).toBeLessThanOrEqual(expectedFrames * 1.05);
    });
  });

  describe('Batch Operations', () => {
    it('should handle 1000 mixed operations under threshold', async () => {
      const cache = new PerformanceCache({ maxSize: 200 });
      const calc = new ResolutionCalculator(160, 144);

      const result = await performanceUtils.measureTime(() => {
        for (let i = 0; i < 1000; i++) {
          // Mix of operations
          cache.set(`key-${i % 100}`, { value: i });
          cache.get(`key-${(i + 50) % 100}`);
          calc.calculateScaled((i % 8) + 1);
          calc.calculateScaleToFit(800 + (i % 200), 600 + (i % 150));
        }
      }, 10);

      console.log(`1000 mixed operations: avg=${result.avg.toFixed(2)}ms`);

      expect(result.avg).toBeLessThan(THRESHOLDS.batchOperations1000);
    });
  });

  describe('Memory Usage Patterns', () => {
    it('should not grow unbounded with repeated operations', () => {
      const cache = new PerformanceCache({ maxSize: 100 });

      // Perform many operations
      for (let round = 0; round < 10; round++) {
        for (let i = 0; i < 1000; i++) {
          cache.set(`key-${i}`, { data: new Array(100).fill(i) });
        }
      }

      // Cache should stay at maxSize
      expect(cache.size).toBeLessThanOrEqual(100);
    });

    it('should clean up expired entries', async () => {
      const cache = new PerformanceCache({ maxSize: 1000, defaultTTL: 50 });

      // Add entries
      for (let i = 0; i < 100; i++) {
        cache.set(`key-${i}`, { value: i });
      }

      expect(cache.size).toBe(100);

      // Wait for expiration
      await new Promise(r => setTimeout(r, 60));

      // Clear expired
      const cleared = cache.clearExpired();

      console.log(`Cleared ${cleared} expired entries`);

      expect(cleared).toBe(100);
      expect(cache.size).toBe(0);
    });
  });

  describe('Stress Tests', () => {
    it('should handle rapid subscribe/unsubscribe cycles', () => {
      const cache = new PerformanceCache({ maxSize: 50 });
      const iterations = 5000;

      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        const key = `stress-${i % 100}`;
        cache.set(key, { iteration: i });
        if (i % 2 === 0) {
          cache.get(key);
        }
        if (i % 10 === 0) {
          cache.delete(`stress-${(i + 50) % 100}`);
        }
      }

      const duration = performance.now() - start;

      console.log(`${iterations} stress operations: ${duration.toFixed(2)}ms (${(iterations / duration * 1000).toFixed(0)} ops/sec)`);

      // Should handle 5000 operations in under 200ms
      expect(duration).toBeLessThan(200);
    });

    it('should maintain performance under concurrent-like access', async () => {
      const cache = new PerformanceCache({ maxSize: 500 });

      // Simulate concurrent access patterns
      const operations = [];

      for (let i = 0; i < 100; i++) {
        operations.push(
          performanceUtils.measureTime(() => {
            for (let j = 0; j < 100; j++) {
              cache.set(`concurrent-${i}-${j}`, { value: j });
              cache.get(`concurrent-${(i + 1) % 100}-${j}`);
            }
          }, 1)
        );
      }

      const results = await Promise.all(operations);
      const totalTime = results.reduce((sum, r) => sum + r.total, 0);
      const avgTime = totalTime / results.length;

      console.log(`Concurrent-like access pattern: avg=${avgTime.toFixed(2)}ms per batch`);

      expect(avgTime).toBeLessThan(50);
    });
  });
});

describe('Cache Hit Rate Analysis', () => {
  it('should achieve high hit rate for repeated access patterns', () => {
    // Use ResolutionCalculator which has built-in caching
    const calculator = new ResolutionCalculator(160, 144);

    // Simulate typical usage pattern
    const scales = [1, 2, 4, 4, 4, 4, 8, 4, 4, 2, 4, 4]; // 4x is most common

    // Clear cache and get baseline stats
    ResolutionCalculator.clearCache();
    const statsBefore = ResolutionCalculator.getCacheStats();

    // Run pattern multiple times
    for (let round = 0; round < 100; round++) {
      scales.forEach(scale => {
        calculator.calculateScaled(scale);
      });
    }

    const statsAfter = ResolutionCalculator.getCacheStats();

    // Calculate hit rate for just this test's operations
    const hits = statsAfter.hits - statsBefore.hits;
    const misses = statsAfter.misses - statsBefore.misses;
    const total = hits + misses;
    const hitRate = total > 0 ? (hits / total * 100) : 0;

    console.log(`Cache stats after 1200 operations: hits=${hits}, misses=${misses}, hitRate=${hitRate.toFixed(2)}%`);

    // Should have very high hit rate (>95%) for repeated patterns
    // We expect 4 unique scales (1, 2, 4, 8) = 4 misses initially
    // Then 1200 - 4 = 1196 hits, giving ~99.67% hit rate
    expect(hitRate).toBeGreaterThan(95);
  });
});
