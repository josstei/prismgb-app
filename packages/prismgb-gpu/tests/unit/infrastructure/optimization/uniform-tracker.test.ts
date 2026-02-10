import { describe, it, expect, beforeEach } from 'vitest';
import { UniformTracker } from '../../../../src/infrastructure/optimization/uniform-tracker';

describe('UniformTracker', () => {
  let tracker: UniformTracker;

  beforeEach(() => {
    tracker = new UniformTracker();
  });

  describe('hasChanged', () => {
    it('should return true on first check for a uniform', () => {
      const data = new Float32Array([1.0, 2.0, 3.0]);
      expect(tracker.hasChanged('testUniform', data)).toBe(true);
    });

    it('should return false when data has not changed', () => {
      const data = new Float32Array([1.0, 2.0, 3.0]);
      tracker.hasChanged('testUniform', data);
      expect(tracker.hasChanged('testUniform', data)).toBe(false);
    });

    it('should return true when data has changed', () => {
      const data1 = new Float32Array([1.0, 2.0, 3.0]);
      const data2 = new Float32Array([1.0, 2.0, 4.0]);
      tracker.hasChanged('testUniform', data1);
      expect(tracker.hasChanged('testUniform', data2)).toBe(true);
    });

    it('should track multiple uniforms independently', () => {
      const data1 = new Float32Array([1.0, 2.0]);
      const data2 = new Float32Array([3.0, 4.0]);

      expect(tracker.hasChanged('uniform1', data1)).toBe(true);
      expect(tracker.hasChanged('uniform2', data2)).toBe(true);

      expect(tracker.hasChanged('uniform1', data1)).toBe(false);
      expect(tracker.hasChanged('uniform2', data2)).toBe(false);
    });

    it('should reuse cached Uint8Array view when buffer matches', () => {
      const buffer = new ArrayBuffer(12);
      const data1 = new Float32Array(buffer, 0, 3);
      const data2 = new Float32Array(buffer, 0, 3);

      data1[0] = 1.0;
      data1[1] = 2.0;
      data1[2] = 3.0;

      tracker.hasChanged('testUniform', data1);

      data2[0] = 1.0;
      data2[1] = 2.0;
      data2[2] = 3.0;

      expect(tracker.hasChanged('testUniform', data2)).toBe(false);
    });

    it('should create new view when byteOffset differs', () => {
      const buffer = new ArrayBuffer(24);
      const data1 = new Float32Array(buffer, 0, 3);
      const data2 = new Float32Array(buffer, 12, 3);

      data1[0] = 1.0;
      data1[1] = 2.0;
      data1[2] = 3.0;
      data2[0] = 4.0;
      data2[1] = 5.0;
      data2[2] = 6.0;

      tracker.hasChanged('testUniform', data1);
      expect(tracker.hasChanged('testUniform', data2)).toBe(true);
    });

    it('should create new view when byteLength differs', () => {
      const buffer = new ArrayBuffer(16);
      const data1 = new Float32Array(buffer, 0, 3);
      const data2 = new Float32Array(buffer, 0, 4);

      tracker.hasChanged('testUniform', data1);
      expect(tracker.hasChanged('testUniform', data2)).toBe(true);
    });

    it('should handle Float32Array with non-zero byteOffset', () => {
      const buffer = new ArrayBuffer(24);
      const data = new Float32Array(buffer, 12, 2);
      data[0] = 5.0;
      data[1] = 6.0;

      expect(tracker.hasChanged('testUniform', data)).toBe(true);
      expect(tracker.hasChanged('testUniform', data)).toBe(false);
    });
  });

  describe('invalidate', () => {
    it('should force next check to return true for invalidated uniform', () => {
      const data = new Float32Array([1.0, 2.0, 3.0]);
      tracker.hasChanged('testUniform', data);
      expect(tracker.hasChanged('testUniform', data)).toBe(false);

      tracker.invalidate('testUniform');
      expect(tracker.hasChanged('testUniform', data)).toBe(true);
    });

    it('should not affect other uniforms', () => {
      const data1 = new Float32Array([1.0, 2.0]);
      const data2 = new Float32Array([3.0, 4.0]);

      tracker.hasChanged('uniform1', data1);
      tracker.hasChanged('uniform2', data2);

      tracker.invalidate('uniform1');

      expect(tracker.hasChanged('uniform1', data1)).toBe(true);
      expect(tracker.hasChanged('uniform2', data2)).toBe(false);
    });

    it('should handle invalidating non-existent uniform', () => {
      expect(() => tracker.invalidate('nonExistent')).not.toThrow();
    });
  });

  describe('invalidateAll', () => {
    it('should force all uniforms to return true on next check', () => {
      const data1 = new Float32Array([1.0, 2.0]);
      const data2 = new Float32Array([3.0, 4.0]);

      tracker.hasChanged('uniform1', data1);
      tracker.hasChanged('uniform2', data2);

      tracker.invalidateAll();

      expect(tracker.hasChanged('uniform1', data1)).toBe(true);
      expect(tracker.hasChanged('uniform2', data2)).toBe(true);
    });

    it('should clear cached view', () => {
      const buffer = new ArrayBuffer(12);
      const data = new Float32Array(buffer, 0, 3);
      data[0] = 1.0;

      tracker.hasChanged('testUniform', data);
      tracker.invalidateAll();

      expect(tracker.hasChanged('testUniform', data)).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return initial stats', () => {
      const stats = tracker.getStats();
      expect(stats.trackedUniforms).toBe(0);
      expect(stats.checks).toBe(0);
      expect(stats.skips).toBe(0);
      expect(stats.writes).toBe(0);
      expect(stats.skipRate).toBe('0');
    });

    it('should track checks and writes', () => {
      const data = new Float32Array([1.0, 2.0, 3.0]);
      tracker.hasChanged('testUniform', data);

      const stats = tracker.getStats();
      expect(stats.checks).toBe(1);
      expect(stats.writes).toBe(1);
      expect(stats.skips).toBe(0);
      expect(stats.trackedUniforms).toBe(1);
    });

    it('should track skips', () => {
      const data = new Float32Array([1.0, 2.0, 3.0]);
      tracker.hasChanged('testUniform', data);
      tracker.hasChanged('testUniform', data);
      tracker.hasChanged('testUniform', data);

      const stats = tracker.getStats();
      expect(stats.checks).toBe(3);
      expect(stats.writes).toBe(1);
      expect(stats.skips).toBe(2);
      expect(stats.skipRate).toBe('66.7');
    });

    it('should track multiple uniforms', () => {
      const data1 = new Float32Array([1.0]);
      const data2 = new Float32Array([2.0]);
      const data3 = new Float32Array([3.0]);

      tracker.hasChanged('uniform1', data1);
      tracker.hasChanged('uniform2', data2);
      tracker.hasChanged('uniform3', data3);

      const stats = tracker.getStats();
      expect(stats.trackedUniforms).toBe(3);
      expect(stats.checks).toBe(3);
      expect(stats.writes).toBe(3);
    });

    it('should calculate skip rate correctly', () => {
      const data = new Float32Array([1.0]);

      tracker.hasChanged('testUniform', data);
      tracker.hasChanged('testUniform', data);
      tracker.hasChanged('testUniform', data);
      tracker.hasChanged('testUniform', data);
      tracker.hasChanged('testUniform', data);

      const stats = tracker.getStats();
      expect(stats.checks).toBe(5);
      expect(stats.skips).toBe(4);
      expect(stats.skipRate).toBe('80.0');
    });

    it('should not count invalidated uniform in trackedUniforms', () => {
      const data = new Float32Array([1.0]);
      tracker.hasChanged('testUniform', data);
      tracker.invalidate('testUniform');

      const stats = tracker.getStats();
      expect(stats.trackedUniforms).toBe(0);
    });
  });

  describe('resetStats', () => {
    it('should reset all counters', () => {
      const data = new Float32Array([1.0, 2.0, 3.0]);
      tracker.hasChanged('testUniform', data);
      tracker.hasChanged('testUniform', data);

      tracker.resetStats();

      const stats = tracker.getStats();
      expect(stats.checks).toBe(0);
      expect(stats.skips).toBe(0);
      expect(stats.writes).toBe(0);
      expect(stats.skipRate).toBe('0');
    });

    it('should not affect tracked hashes', () => {
      const data = new Float32Array([1.0, 2.0, 3.0]);
      tracker.hasChanged('testUniform', data);

      tracker.resetStats();

      expect(tracker.hasChanged('testUniform', data)).toBe(false);
      const stats = tracker.getStats();
      expect(stats.checks).toBe(1);
      expect(stats.skips).toBe(1);
      expect(stats.trackedUniforms).toBe(1);
    });
  });

  describe('hash collision resistance', () => {
    it('should distinguish between different values', () => {
      const data1 = new Float32Array([1.0, 2.0, 3.0, 4.0]);
      const data2 = new Float32Array([4.0, 3.0, 2.0, 1.0]);

      tracker.hasChanged('testUniform', data1);
      expect(tracker.hasChanged('testUniform', data2)).toBe(true);
    });

    it('should handle zero values correctly', () => {
      const data1 = new Float32Array([0.0, 0.0, 0.0]);
      const data2 = new Float32Array([0.0, 0.0, 1.0]);

      tracker.hasChanged('testUniform', data1);
      expect(tracker.hasChanged('testUniform', data2)).toBe(true);
    });

    it('should handle negative values', () => {
      const data1 = new Float32Array([-1.0, -2.0, -3.0]);
      const data2 = new Float32Array([1.0, 2.0, 3.0]);

      tracker.hasChanged('testUniform', data1);
      expect(tracker.hasChanged('testUniform', data2)).toBe(true);
    });

    it('should handle NaN values', () => {
      const data1 = new Float32Array([NaN, 1.0, 2.0]);
      const data2 = new Float32Array([NaN, 1.0, 2.0]);

      tracker.hasChanged('testUniform', data1);
      expect(tracker.hasChanged('testUniform', data2)).toBe(false);
    });

    it('should handle Infinity values', () => {
      const data1 = new Float32Array([Infinity, -Infinity, 0.0]);
      const data2 = new Float32Array([Infinity, -Infinity, 1.0]);

      tracker.hasChanged('testUniform', data1);
      expect(tracker.hasChanged('testUniform', data2)).toBe(true);
    });
  });
});
