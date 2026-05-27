/**
 * MetricsAdapter Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MetricsAdapter } from '@renderer/infrastructure/adapters/platform/metrics.adapter.ts';
import { clearPreloadApi, createPreloadApiMock, setPreloadApi } from '../../../../../support/mocks/preload-api-globals.js';

describe('MetricsAdapter', () => {
  let adapter;

  beforeEach(() => {
    clearPreloadApi('metricsAPI');
  });

  afterEach(() => {
    clearPreloadApi('metricsAPI');
  });

  describe('constructor', () => {
    it('should initialize with globalThis.metricsAPI if available', () => {
      setPreloadApi('metricsAPI', createPreloadApiMock('metricsAPI'));
      adapter = new MetricsAdapter();
      expect(adapter._metricsAPI).toBe(globalThis.metricsAPI);
    });

    it('should fallback to window.metricsAPI if globalThis is not available', () => {
      setPreloadApi('metricsAPI', createPreloadApiMock('metricsAPI'), { exposeOnGlobalThis: false });
      adapter = new MetricsAdapter();
      expect(adapter._metricsAPI).toBe(window.metricsAPI);
    });

    it('should handle missing metricsAPI gracefully', () => {
      adapter = new MetricsAdapter();
      expect(adapter._metricsAPI).toBeUndefined();
    });
  });

  describe('isAvailable', () => {
    it('should return true when metricsAPI with getProcessMetrics exists', () => {
      setPreloadApi('metricsAPI', createPreloadApiMock('metricsAPI'));
      adapter = new MetricsAdapter();
      expect(adapter.isAvailable()).toBe(true);
    });

    it('should return false when metricsAPI is missing', () => {
      adapter = new MetricsAdapter();
      expect(adapter.isAvailable()).toBe(false);
    });

    it('should return false when metricsAPI exists but getProcessMetrics is missing', () => {
      setPreloadApi('metricsAPI', createPreloadApiMock('metricsAPI', { getProcessMetrics: undefined }));
      adapter = new MetricsAdapter();
      expect(adapter.isAvailable()).toBe(false);
    });

    it('should return false when getProcessMetrics is not a function', () => {
      setPreloadApi('metricsAPI', createPreloadApiMock('metricsAPI', { getProcessMetrics: 'not-a-function' }));
      adapter = new MetricsAdapter();
      expect(adapter.isAvailable()).toBe(false);
    });
  });

  describe('getProcessMetrics', () => {
    it('should return error object when API is not available', async () => {
      adapter = new MetricsAdapter();
      const result = await adapter.getProcessMetrics();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Metrics API not available');
    });

    it('should call metricsAPI.getProcessMetrics when available', async () => {
      const mockMetrics = {
        success: true,
        totalMB: '150.0',
        processes: [
          { type: 'Renderer', memoryMB: '80.0' }
        ]
      };

      setPreloadApi('metricsAPI', createPreloadApiMock('metricsAPI', {
        getProcessMetrics: vi.fn().mockResolvedValue(mockMetrics)
      }));

      adapter = new MetricsAdapter();
      const result = await adapter.getProcessMetrics();

      expect(globalThis.metricsAPI.getProcessMetrics).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockMetrics);
    });

    it('should handle promise rejection gracefully', async () => {
      setPreloadApi('metricsAPI', createPreloadApiMock('metricsAPI', {
        getProcessMetrics: vi.fn().mockRejectedValue(new Error('IPC error'))
      }));

      adapter = new MetricsAdapter();
      const result = await adapter.getProcessMetrics();

      expect(result.success).toBe(false);
      expect(result.error).toBe('IPC error');
    });

    it('should handle errors without message property', async () => {
      setPreloadApi('metricsAPI', createPreloadApiMock('metricsAPI', {
        getProcessMetrics: vi.fn().mockRejectedValue('string error')
      }));

      adapter = new MetricsAdapter();
      const result = await adapter.getProcessMetrics();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return successful metrics data', async () => {
      const mockMetrics = {
        success: true,
        totalMB: '200.5',
        processes: [
          { type: 'Renderer', memoryMB: '100.0' },
          { type: 'GPU', memoryMB: '80.0' },
          { type: 'Browser', memoryMB: '20.5' }
        ]
      };

      setPreloadApi('metricsAPI', createPreloadApiMock('metricsAPI', {
        getProcessMetrics: vi.fn().mockResolvedValue(mockMetrics)
      }));

      adapter = new MetricsAdapter();
      const result = await adapter.getProcessMetrics();

      expect(result.success).toBe(true);
      expect(result.totalMB).toBe('200.5');
      expect(result.processes).toHaveLength(3);
    });
  });
});
