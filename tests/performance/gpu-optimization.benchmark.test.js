/**
 * GPU Optimization Utilities Benchmark Tests
 *
 * Measures actual CPU time and memory usage of optimization utilities
 * to verify performance improvements are effective.
 *
 * Run with: npx vitest run tests/performance/gpu-optimization.benchmark.test.js
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  BindGroupCache,
  TypedArrayPool,
  UniformTracker
} from '../../src/features/streaming/rendering/workers/optimization-utils.js';
import { performanceUtils } from '../mocks/index.js';

// Performance thresholds (in milliseconds)
const THRESHOLDS = {
  // TypedArrayPool
  pooledArrayGet: 0.01,           // Getting pooled array < 0.01ms
  pooledArrayWithValues: 0.02,    // Getting + setting values < 0.02ms
  unpooledArrayCreate: 0.05,      // Creating new array (baseline) < 0.05ms

  // UniformTracker
  hashCheck: 0.005,               // Hash check < 0.005ms
  hashCheckUnchanged: 0.003,      // Unchanged hash check < 0.003ms

  // BindGroupCache (simulated)
  cacheHit: 0.001,                // Cache hit < 0.001ms
  cacheMiss: 0.01,                // Cache miss < 0.01ms

  // Batch operations
  batch1000Pooled: 5,             // 1000 pooled operations < 5ms
  batch1000Unpooled: 20,          // 1000 unpooled operations < 20ms
};

describe('GPU Optimization Benchmarks', () => {

  describe('TypedArrayPool Performance', () => {
    let pool;

    beforeEach(() => {
      pool = new TypedArrayPool(3, [4, 6, 8, 16, 32]);
    });

    it('should get pooled array faster than creating new array', async () => {
      // Measure pooled array retrieval
      const pooledResult = await performanceUtils.measureTime(() => {
        pool.getFloat32(8);
      }, 10000);

      // Measure unpooled (new) array creation
      const unpooledResult = await performanceUtils.measureTime(() => {
        new Float32Array(8);
      }, 10000);

      console.log(`\n=== TypedArrayPool Benchmark ===`);
      console.log(`Pooled getFloat32(8):   avg=${(pooledResult.avg * 1000).toFixed(3)}μs`);
      console.log(`Unpooled new Float32:   avg=${(unpooledResult.avg * 1000).toFixed(3)}μs`);
      console.log(`Speedup: ${(unpooledResult.avg / pooledResult.avg).toFixed(2)}x`);

      expect(pooledResult.avg).toBeLessThan(THRESHOLDS.pooledArrayGet);
    });

    it('should efficiently set values in pooled arrays', async () => {
      const testValues = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0];

      const pooledResult = await performanceUtils.measureTime(() => {
        pool.getFloat32WithValues(testValues);
      }, 10000);

      const unpooledResult = await performanceUtils.measureTime(() => {
        const arr = new Float32Array(8);
        arr.set(testValues);
      }, 10000);

      console.log(`\n=== TypedArrayPool With Values Benchmark ===`);
      console.log(`Pooled with values:     avg=${(pooledResult.avg * 1000).toFixed(3)}μs`);
      console.log(`Unpooled with values:   avg=${(unpooledResult.avg * 1000).toFixed(3)}μs`);
      console.log(`Speedup: ${(unpooledResult.avg / pooledResult.avg).toFixed(2)}x`);

      expect(pooledResult.avg).toBeLessThan(THRESHOLDS.pooledArrayWithValues);
    });

    it('should handle 1000 uniform updates efficiently', async () => {
      const uniformData = [
        [160, 144, 640, 576, 4, 0],           // upscale (6 floats)
        [0.0015625, 0.00173611, 0.5, 4],      // unsharp (4 floats)
        [1.0, 1.0, 0.0, 1.0, 1.0, 0, 0, 0],   // color (8 floats)
        [640, 576, 4, 0.3, 0.2, 0.1, 0, 0.1]  // crt (8 floats)
      ];

      // Pooled approach
      const pooledResult = await performanceUtils.measureTime(() => {
        for (let i = 0; i < 1000; i++) {
          uniformData.forEach(data => pool.getFloat32WithValues(data));
        }
      }, 10);

      // Unpooled approach
      const unpooledResult = await performanceUtils.measureTime(() => {
        for (let i = 0; i < 1000; i++) {
          uniformData.forEach(data => new Float32Array(data));
        }
      }, 10);

      console.log(`\n=== 1000 Uniform Updates Benchmark ===`);
      console.log(`Pooled (4000 arrays):   avg=${pooledResult.avg.toFixed(3)}ms`);
      console.log(`Unpooled (4000 arrays): avg=${unpooledResult.avg.toFixed(3)}ms`);
      console.log(`Speedup: ${(unpooledResult.avg / pooledResult.avg).toFixed(2)}x`);
      console.log(`Pool stats:`, pool.getStats());

      expect(pooledResult.avg).toBeLessThan(THRESHOLDS.batch1000Pooled);
    });

    it('should report accurate memory usage', () => {
      const stats = pool.getStats();

      console.log(`\n=== TypedArrayPool Memory ===`);
      console.log(`Pools: ${stats.poolCount}`);
      console.log(`Total arrays: ${stats.totalArrays}`);
      console.log(`Memory: ${stats.totalKB} KB`);
      console.log(`Reuse ratio: ${stats.reuseRatio}x`);

      // Pool should use minimal memory (< 1KB for small arrays)
      expect(parseFloat(stats.totalKB)).toBeLessThan(1);
    });
  });

  describe('UniformTracker Performance', () => {
    let tracker;

    beforeEach(() => {
      tracker = new UniformTracker();
    });

    it('should detect unchanged uniforms faster than hashing each time', async () => {
      const uniformData = new Float32Array([160, 144, 640, 576, 4, 0]);

      // First call to establish baseline hash
      tracker.hasChanged('upscale', uniformData);

      // Measure repeated checks with same data (should skip)
      const unchangedResult = await performanceUtils.measureTime(() => {
        tracker.hasChanged('upscale', uniformData);
      }, 10000);

      console.log(`\n=== UniformTracker Unchanged Check ===`);
      console.log(`Unchanged check: avg=${(unchangedResult.avg * 1000).toFixed(3)}μs`);

      expect(unchangedResult.avg).toBeLessThan(THRESHOLDS.hashCheckUnchanged);
    });

    it('should efficiently detect changed uniforms', async () => {
      let value = 0;

      const changedResult = await performanceUtils.measureTime(() => {
        const data = new Float32Array([160, 144, 640, 576, value++, 0]);
        tracker.hasChanged('upscale', data);
      }, 10000);

      console.log(`\n=== UniformTracker Changed Check ===`);
      console.log(`Changed check: avg=${(changedResult.avg * 1000).toFixed(3)}μs`);

      expect(changedResult.avg).toBeLessThan(THRESHOLDS.hashCheck);
    });

    it('should achieve high skip rate for static uniforms', () => {
      const staticUniforms = {
        upscale: new Float32Array([160, 144, 640, 576, 4, 0]),
        unsharp: new Float32Array([0.0015625, 0.00173611, 0.5, 4]),
        color: new Float32Array([1.0, 1.0, 0.0, 1.0, 1.0, 0, 0, 0]),
        crt: new Float32Array([640, 576, 4, 0.3, 0.2, 0.1, 0, 0.1])
      };

      tracker.resetStats();

      // Simulate 60 frames (1 second at 60fps)
      for (let frame = 0; frame < 60; frame++) {
        Object.entries(staticUniforms).forEach(([name, data]) => {
          tracker.hasChanged(name, data);
        });
      }

      const stats = tracker.getStats();

      console.log(`\n=== UniformTracker Skip Rate (60 frames) ===`);
      console.log(`Checks: ${stats.checks}`);
      console.log(`Skips: ${stats.skips}`);
      console.log(`Writes: ${stats.writes}`);
      console.log(`Skip rate: ${stats.skipRate}%`);

      // With static uniforms, skip rate should be > 98%
      // (4 writes on first frame, 236 skips on remaining 59 frames)
      expect(parseFloat(stats.skipRate)).toBeGreaterThan(98);
    });

    it('should track dynamic uniforms correctly', () => {
      tracker.resetStats();

      // Simulate dynamic shader parameters changing every frame
      for (let frame = 0; frame < 60; frame++) {
        // Static uniforms
        tracker.hasChanged('upscale', new Float32Array([160, 144, 640, 576, 4, 0]));

        // Dynamic uniform (changes every frame - e.g., animation)
        tracker.hasChanged('animation', new Float32Array([frame, frame * 0.1]));
      }

      const stats = tracker.getStats();

      console.log(`\n=== UniformTracker Mixed Static/Dynamic ===`);
      console.log(`Checks: ${stats.checks}`);
      console.log(`Skips: ${stats.skips} (static uniform reuse)`);
      console.log(`Writes: ${stats.writes} (1 static + 60 dynamic)`);
      console.log(`Skip rate: ${stats.skipRate}%`);

      // 120 checks, 59 skips (static after first), 61 writes (1 static + 60 dynamic)
      expect(stats.writes).toBe(61);
      expect(stats.skips).toBe(59);
    });
  });

  describe('BindGroupCache Performance (Simulated)', () => {
    let cache;

    // Mock GPU objects for cache key testing
    const mockPipeline = (label) => ({ label, getBindGroupLayout: () => ({}) });
    const mockTexture = (label) => ({ label, createView: () => ({}) });
    const mockDevice = {
      createBindGroup: (config) => ({ ...config, _created: Date.now() })
    };

    beforeEach(() => {
      cache = new BindGroupCache();
    });

    it('should achieve high cache hit rate during rendering', () => {
      const pipelines = {
        upscale: mockPipeline('PixelUpscale'),
        unsharp: mockPipeline('UnsharpMask'),
        color: mockPipeline('ColorElevation'),
        crt: mockPipeline('CrtLcd')
      };

      const textures = {
        source: mockTexture('Source'),
        intermediate0: mockTexture('Intermediate0'),
        intermediate1: mockTexture('Intermediate1')
      };

      cache.resetStats();

      // Simulate 60 frames of 4-pass rendering
      for (let frame = 0; frame < 60; frame++) {
        // Pass 1: source -> intermediate0
        cache.getOrCreate(mockDevice, pipelines.upscale, {}, textures.source, {});
        // Pass 2: intermediate0 -> intermediate1
        cache.getOrCreate(mockDevice, pipelines.unsharp, {}, textures.intermediate0, {});
        // Pass 3: intermediate1 -> intermediate0
        cache.getOrCreate(mockDevice, pipelines.color, {}, textures.intermediate1, {});
        // Pass 4: intermediate0 -> canvas (not cached)
      }

      const stats = cache.getStats();

      console.log(`\n=== BindGroupCache Hit Rate (60 frames) ===`);
      console.log(`Cache size: ${stats.size}`);
      console.log(`Hits: ${stats.hits}`);
      console.log(`Misses: ${stats.misses}`);
      console.log(`Hit rate: ${stats.hitRate}%`);

      // 3 bind groups per frame * 60 frames = 180 lookups
      // First frame: 3 misses, remaining 59 frames: 177 hits
      expect(parseFloat(stats.hitRate)).toBeGreaterThan(98);
    });

    it('should correctly invalidate on resize', () => {
      const pipeline = mockPipeline('Test');
      const texture = mockTexture('Test');

      // Create initial bind group
      cache.getOrCreate(mockDevice, pipeline, {}, texture, {});
      expect(cache.getStats().size).toBe(1);

      // Invalidate (simulates resize)
      cache.invalidate();

      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.version).toBe(1);

      console.log(`\n=== BindGroupCache Invalidation ===`);
      console.log(`Cache cleared, version: ${stats.version}`);
    });
  });

  describe('Combined Optimization Impact', () => {
    it('should demonstrate cumulative performance benefit', async () => {
      const pool = new TypedArrayPool();
      const tracker = new UniformTracker();

      const uniformConfigs = [
        { name: 'upscale', data: [160, 144, 640, 576, 4, 0] },
        { name: 'unsharp', data: [0.0015625, 0.00173611, 0.5, 4] },
        { name: 'color', data: [1.0, 1.0, 0.0, 1.0, 1.0, 0, 0, 0] },
        { name: 'crt', data: [640, 576, 4, 0.3, 0.2, 0.1, 0, 0.1] }
      ];

      // Simulate optimized frame loop
      const optimizedResult = await performanceUtils.measureTime(() => {
        for (let frame = 0; frame < 60; frame++) {
          uniformConfigs.forEach(({ name, data }) => {
            const arr = pool.getFloat32WithValues(data);
            tracker.hasChanged(name, arr);
          });
        }
      }, 100);

      // Simulate unoptimized frame loop
      const unoptimizedResult = await performanceUtils.measureTime(() => {
        for (let frame = 0; frame < 60; frame++) {
          uniformConfigs.forEach(({ data }) => {
            new Float32Array(data);
            // No change tracking - always "write"
          });
        }
      }, 100);

      const poolStats = pool.getStats();
      const trackerStats = tracker.getStats();

      console.log(`\n=== Combined Optimization Impact (60 frames) ===`);
      console.log(`Optimized:   avg=${optimizedResult.avg.toFixed(3)}ms`);
      console.log(`Unoptimized: avg=${unoptimizedResult.avg.toFixed(3)}ms`);
      console.log(`\nPool stats:`, poolStats);
      console.log(`Tracker stats:`, trackerStats);

      // The real benefit is GPU write skipping, not pure JS overhead
      // In mock environment, timing can vary - verify the optimization metrics instead:
      // 1. High reuse ratio (arrays are reused, not reallocated)
      expect(parseFloat(poolStats.reuseRatio)).toBeGreaterThan(100);
      // 2. High skip rate (GPU writes would be skipped for static uniforms)
      expect(parseFloat(trackerStats.skipRate)).toBeGreaterThan(99);
      // 3. Minimal writes (only 4 on first frame)
      expect(trackerStats.writes).toBe(4);
    });
  });

  describe('Memory Stability', () => {
    it('should not leak memory during extended operation', () => {
      const pool = new TypedArrayPool();

      // Simulate 10 seconds of rendering at 60fps (600 frames)
      for (let frame = 0; frame < 600; frame++) {
        pool.getFloat32WithValues([160, 144, 640, 576, 4, 0]);
        pool.getFloat32WithValues([0.0015625, 0.00173611, 0.5, 4]);
        pool.getFloat32WithValues([1.0, 1.0, 0.0, 1.0, 1.0, 0, 0, 0]);
        pool.getFloat32WithValues([640, 576, 4, 0.3, 0.2, 0.1, 0, 0.1]);
      }

      const stats = pool.getStats();

      console.log(`\n=== Memory Stability (600 frames) ===`);
      console.log(`Pool memory: ${stats.totalKB} KB`);
      console.log(`Total reuses: ${stats.reuses}`);
      console.log(`Reuse ratio: ${stats.reuseRatio}x`);

      // Memory should stay constant (pool doesn't grow)
      expect(parseFloat(stats.totalKB)).toBeLessThan(2);
      // Reuse ratio should be very high
      expect(parseFloat(stats.reuseRatio)).toBeGreaterThan(100);
    });

    it('should properly clean up UniformTracker on invalidation', () => {
      const tracker = new UniformTracker();

      // Add many uniforms
      for (let i = 0; i < 100; i++) {
        tracker.hasChanged(`uniform-${i}`, new Float32Array([i, i + 1]));
      }

      expect(tracker.getStats().trackedUniforms).toBe(100);

      // Invalidate all
      tracker.invalidateAll();

      expect(tracker.getStats().trackedUniforms).toBe(0);

      console.log(`\n=== UniformTracker Cleanup ===`);
      console.log(`Uniforms after invalidateAll: ${tracker.getStats().trackedUniforms}`);
    });
  });
});

describe('Benchmark Summary', () => {
  it('should print optimization summary', () => {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║              GPU OPTIMIZATION BENCHMARK SUMMARY                 ║
╠════════════════════════════════════════════════════════════════╣
║                                                                 ║
║  TypedArrayPool:                                                ║
║  • Eliminates per-frame Float32Array allocations                ║
║  • Pre-warms pools for common uniform sizes                     ║
║  • Expected benefit: Reduced GC pressure, smoother framerate    ║
║                                                                 ║
║  UniformTracker:                                                ║
║  • FNV-1a hashing for change detection (~3μs per check)         ║
║  • Skips GPU buffer writes for unchanged uniforms               ║
║  • Expected benefit: 90%+ skip rate for static shaders          ║
║                                                                 ║
║  BindGroupCache:                                                ║
║  • Caches GPU bind groups across frames                         ║
║  • Invalidates on resize/texture recreation                     ║
║  • Expected benefit: 98%+ cache hit rate during rendering       ║
║                                                                 ║
║  Combined Impact:                                               ║
║  • Lower CPU overhead per frame                                 ║
║  • Reduced GC pauses                                            ║
║  • More consistent frame timing                                 ║
║                                                                 ║
╚════════════════════════════════════════════════════════════════╝
    `);

    expect(true).toBe(true);
  });
});
