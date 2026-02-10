import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BindGroupCache } from '../../../../src/infrastructure/webgpu/bind-group-cache.js';

const mockBindGroup = {} as GPUBindGroup;
const mockDevice = {
  createBindGroup: vi.fn().mockReturnValue(mockBindGroup)
} as unknown as GPUDevice;
const mockPipeline = {
  label: 'test-pipeline',
  getBindGroupLayout: vi.fn().mockReturnValue({})
} as unknown as GPURenderPipeline;
const mockBuffer = {} as GPUBuffer;
const mockTexture = {
  label: 'test-texture',
  createView: vi.fn().mockReturnValue({})
} as unknown as GPUTexture;
const mockSampler = {} as GPUSampler;

describe('BindGroupCache', () => {
  let cache: BindGroupCache;

  beforeEach(() => {
    cache = new BindGroupCache();
    vi.clearAllMocks();
  });

  describe('existing functionality', () => {
    it('should create and cache bind groups', () => {
      const bindGroup = cache.getOrCreate(
        mockDevice,
        mockPipeline,
        mockBuffer,
        mockTexture,
        mockSampler
      );

      expect(bindGroup).toBe(mockBindGroup);
      expect(mockDevice.createBindGroup).toHaveBeenCalledTimes(1);
    });

    it('should return cached bind group on subsequent calls', () => {
      cache.getOrCreate(mockDevice, mockPipeline, mockBuffer, mockTexture, mockSampler);
      const bindGroup = cache.getOrCreate(
        mockDevice,
        mockPipeline,
        mockBuffer,
        mockTexture,
        mockSampler
      );

      expect(bindGroup).toBe(mockBindGroup);
      expect(mockDevice.createBindGroup).toHaveBeenCalledTimes(1);
    });

    it('should clear cache and increment version on invalidate', () => {
      cache.getOrCreate(mockDevice, mockPipeline, mockBuffer, mockTexture, mockSampler);
      const initialStats = cache.getStats();

      cache.invalidate();

      const newBindGroup = cache.getOrCreate(
        mockDevice,
        mockPipeline,
        mockBuffer,
        mockTexture,
        mockSampler
      );

      expect(newBindGroup).toBe(mockBindGroup);
      expect(mockDevice.createBindGroup).toHaveBeenCalledTimes(2);
      expect(cache.getStats().version).toBe(initialStats.version + 1);
      expect(cache.getStats().size).toBe(1);
    });
  });

  describe('stats tracking', () => {
    it('should track cache misses when creating new bind groups', () => {
      cache.getOrCreate(mockDevice, mockPipeline, mockBuffer, mockTexture, mockSampler);

      const stats = cache.getStats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(0);
      expect(stats.size).toBe(1);
    });

    it('should track cache hits when returning cached bind groups', () => {
      cache.getOrCreate(mockDevice, mockPipeline, mockBuffer, mockTexture, mockSampler);
      cache.getOrCreate(mockDevice, mockPipeline, mockBuffer, mockTexture, mockSampler);

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should calculate hit rate correctly', () => {
      cache.getOrCreate(mockDevice, mockPipeline, mockBuffer, mockTexture, mockSampler);
      cache.getOrCreate(mockDevice, mockPipeline, mockBuffer, mockTexture, mockSampler);
      cache.getOrCreate(mockDevice, mockPipeline, mockBuffer, mockTexture, mockSampler);

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe('66.67%');
    });

    it('should return 0.00% hit rate when no accesses', () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toBe('0.00%');
    });

    it('should return correct version in stats', () => {
      const stats1 = cache.getStats();
      expect(stats1.version).toBe(0);

      cache.invalidate();

      const stats2 = cache.getStats();
      expect(stats2.version).toBe(1);
    });

    it('should reset hit and miss counters', () => {
      cache.getOrCreate(mockDevice, mockPipeline, mockBuffer, mockTexture, mockSampler);
      cache.getOrCreate(mockDevice, mockPipeline, mockBuffer, mockTexture, mockSampler);

      expect(cache.getStats().hits).toBe(1);
      expect(cache.getStats().misses).toBe(1);

      cache.resetStats();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(1);
      expect(stats.version).toBe(0);
    });

    it('should track multiple different bind groups', () => {
      const mockTexture2 = {
        label: 'test-texture-2',
        createView: vi.fn().mockReturnValue({})
      } as unknown as GPUTexture;

      cache.getOrCreate(mockDevice, mockPipeline, mockBuffer, mockTexture, mockSampler);
      cache.getOrCreate(mockDevice, mockPipeline, mockBuffer, mockTexture2, mockSampler);
      cache.getOrCreate(mockDevice, mockPipeline, mockBuffer, mockTexture, mockSampler);

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(2);
    });

    it('should preserve stats through invalidation', () => {
      cache.getOrCreate(mockDevice, mockPipeline, mockBuffer, mockTexture, mockSampler);
      cache.getOrCreate(mockDevice, mockPipeline, mockBuffer, mockTexture, mockSampler);

      cache.invalidate();

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.size).toBe(0);
      expect(stats.version).toBe(1);
    });
  });
});
