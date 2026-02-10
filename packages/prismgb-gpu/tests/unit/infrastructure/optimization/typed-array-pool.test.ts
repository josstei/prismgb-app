import { describe, it, expect, beforeEach } from 'vitest';
import { TypedArrayPool } from '@/infrastructure/optimization/typed-array-pool';

describe('TypedArrayPool', () => {
  describe('constructor', () => {
    it('should create pool with default depth and prewarm sizes', () => {
      const pool = new TypedArrayPool();
      const stats = pool.getStats();

      expect(stats.poolCount).toBe(5);
      expect(stats.totalArrays).toBe(15);
    });

    it('should create pool with custom depth', () => {
      const pool = new TypedArrayPool(5);
      const stats = pool.getStats();

      expect(stats.poolCount).toBe(5);
      expect(stats.totalArrays).toBe(25);
    });

    it('should prewarm specified sizes', () => {
      const pool = new TypedArrayPool(2, [10, 20]);
      const stats = pool.getStats();

      expect(stats.poolCount).toBe(2);
      expect(stats.totalArrays).toBe(4);
    });

    it('should calculate total bytes correctly for prewarmed pools', () => {
      const pool = new TypedArrayPool(2, [10]);
      const stats = pool.getStats();

      expect(stats.totalBytes).toBe(80);
      expect(stats.totalKB).toBe('0.08');
    });
  });

  describe('getFloat32', () => {
    let pool: TypedArrayPool;

    beforeEach(() => {
      pool = new TypedArrayPool(3, [4]);
    });

    it('should return Float32Array of requested size', () => {
      const array = pool.getFloat32(4);

      expect(array).toBeInstanceOf(Float32Array);
      expect(array.length).toBe(4);
    });

    it('should create new pool for non-prewarmed size', () => {
      const array = pool.getFloat32(8);
      const stats = pool.getStats();

      expect(array.length).toBe(8);
      expect(stats.poolCount).toBe(2);
    });

    it('should rotate through pooled arrays in round-robin fashion', () => {
      const array1 = pool.getFloat32(4);
      const array2 = pool.getFloat32(4);
      const array3 = pool.getFloat32(4);
      const array4 = pool.getFloat32(4);

      array1[0] = 1;
      array2[0] = 2;
      array3[0] = 3;

      expect(array4[0]).toBe(1);
    });

    it('should increment reuse counter on each allocation', () => {
      pool.getFloat32(4);
      pool.getFloat32(4);

      const stats = pool.getStats();
      expect(stats.reuses).toBe(2);
    });

    it('should throw error when exceeding MAX_POOL_TYPES for dynamic pools', () => {
      const smallPool = new TypedArrayPool(1, [1]);

      for (let i = 2; i <= 21; i++) {
        smallPool.getFloat32(i);
      }

      expect(() => smallPool.getFloat32(22)).toThrow(
        /TypedArrayPool: exceeded max pool types \(20\)/
      );
    });

    it('should allow prewarmed pools plus MAX_POOL_TYPES dynamic pools', () => {
      const pool = new TypedArrayPool(1, [1, 2, 3]);

      for (let i = 4; i <= 23; i++) {
        pool.getFloat32(i);
      }

      const stats = pool.getStats();
      expect(stats.poolCount).toBe(23);
    });

    it('should include requested size in error message', () => {
      const pool = new TypedArrayPool(1, []);

      for (let i = 1; i <= 20; i++) {
        pool.getFloat32(i);
      }

      expect(() => pool.getFloat32(999)).toThrow(/Requested size: 999/);
    });
  });

  describe('getFloat32WithValues', () => {
    let pool: TypedArrayPool;

    beforeEach(() => {
      pool = new TypedArrayPool(2, [4]);
    });

    it('should return array filled with provided values', () => {
      const values = [1.5, 2.5, 3.5, 4.5];
      const array = pool.getFloat32WithValues(values);

      expect(array).toEqual(new Float32Array(values));
    });

    it('should use pooled array of correct size', () => {
      const initialStats = pool.getStats();
      pool.getFloat32WithValues([1, 2, 3, 4]);
      const finalStats = pool.getStats();

      expect(finalStats.poolCount).toBe(initialStats.poolCount);
      expect(finalStats.reuses).toBe(initialStats.reuses + 1);
    });

    it('should create new pool for non-prewarmed size', () => {
      const array = pool.getFloat32WithValues([1, 2, 3, 4, 5, 6]);
      const stats = pool.getStats();

      expect(array.length).toBe(6);
      expect(stats.poolCount).toBe(2);
    });

    it('should overwrite previous values in pooled array', () => {
      const array1 = pool.getFloat32WithValues([10, 20, 30, 40]);
      const array2 = pool.getFloat32WithValues([50, 60, 70, 80]);
      const array3 = pool.getFloat32WithValues([90, 100, 110, 120]);

      expect(array1).toEqual(new Float32Array([90, 100, 110, 120]));
      expect(array2).toEqual(new Float32Array([50, 60, 70, 80]));
      expect(array3).toEqual(new Float32Array([90, 100, 110, 120]));
    });
  });

  describe('getStats', () => {
    it('should return complete stats structure', () => {
      const pool = new TypedArrayPool(3, [4, 8]);
      const stats = pool.getStats();

      expect(stats).toEqual({
        poolCount: 2,
        totalArrays: 6,
        totalBytes: 144,
        totalKB: '0.14',
        allocations: 6,
        reuses: 0,
        reuseRatio: '0.0'
      });
    });

    it('should increment allocations when new pools are created', () => {
      const pool = new TypedArrayPool(2, []);
      pool.getFloat32(4);

      const stats = pool.getStats();
      expect(stats.allocations).toBe(2);
    });

    it('should track reuses separately from allocations', () => {
      const pool = new TypedArrayPool(2, [4]);
      pool.getFloat32(4);
      pool.getFloat32(4);
      pool.getFloat32(4);

      const stats = pool.getStats();
      expect(stats.allocations).toBe(2);
      expect(stats.reuses).toBe(3);
    });

    it('should calculate reuse ratio correctly', () => {
      const pool = new TypedArrayPool(2, [4]);
      pool.getFloat32(4);
      pool.getFloat32(4);

      const stats = pool.getStats();
      expect(stats.reuseRatio).toBe('1.0');
    });

    it('should handle zero allocations gracefully', () => {
      const pool = new TypedArrayPool(2, []);
      const stats = pool.getStats();

      expect(stats.reuseRatio).toBe('0');
    });

    it('should calculate total bytes for multiple pool sizes', () => {
      const pool = new TypedArrayPool(2, [4, 8, 16]);
      const stats = pool.getStats();

      expect(stats.totalBytes).toBe((4 * 4 * 2) + (8 * 4 * 2) + (16 * 4 * 2));
      expect(stats.totalKB).toBe('0.22');
    });
  });

  describe('resetStats', () => {
    it('should reset allocation and reuse counters', () => {
      const pool = new TypedArrayPool(2, [4]);
      pool.getFloat32(4);
      pool.getFloat32(8);
      pool.resetStats();

      const stats = pool.getStats();
      expect(stats.allocations).toBe(0);
      expect(stats.reuses).toBe(0);
      expect(stats.reuseRatio).toBe('0');
    });

    it('should not affect pool structure', () => {
      const pool = new TypedArrayPool(2, [4]);
      pool.getFloat32(8);
      const beforeStats = pool.getStats();
      pool.resetStats();
      const afterStats = pool.getStats();

      expect(afterStats.poolCount).toBe(beforeStats.poolCount);
      expect(afterStats.totalArrays).toBe(beforeStats.totalArrays);
      expect(afterStats.totalBytes).toBe(beforeStats.totalBytes);
    });

    it('should allow stats to accumulate after reset', () => {
      const pool = new TypedArrayPool(2, [4]);
      pool.getFloat32(4);
      pool.resetStats();
      pool.getFloat32(4);

      const stats = pool.getStats();
      expect(stats.reuses).toBe(1);
    });
  });

  describe('MAX_POOL_TYPES constant', () => {
    it('should be set to 20', () => {
      expect(TypedArrayPool.MAX_POOL_TYPES).toBe(20);
    });
  });

  describe('memory efficiency', () => {
    it('should reuse arrays instead of allocating new ones', () => {
      const pool = new TypedArrayPool(3, [4]);
      const initialStats = pool.getStats();

      for (let i = 0; i < 100; i++) {
        pool.getFloat32(4);
      }

      const finalStats = pool.getStats();
      expect(finalStats.totalArrays).toBe(initialStats.totalArrays);
      expect(finalStats.reuses).toBe(100);
    });

    it('should minimize allocations with proper prewarming', () => {
      const pool = new TypedArrayPool(2, [4, 8, 16]);

      pool.getFloat32(4);
      pool.getFloat32(8);
      pool.getFloat32(16);

      const stats = pool.getStats();
      expect(stats.allocations).toBe(6);
      expect(stats.poolCount).toBe(3);
    });
  });
});
