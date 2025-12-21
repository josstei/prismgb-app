/**
 * PerformanceMetricsService Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PerformanceMetricsService } from '@app/renderer/application/performance/performance-metrics.service.js';

describe('PerformanceMetricsService', () => {
  let service;
  let mockLogger;

  beforeEach(() => {
    vi.useFakeTimers();

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    service = new PerformanceMetricsService({
      loggerFactory: { create: vi.fn(() => mockLogger) }
    });
  });

  afterEach(() => {
    service.stopPeriodicSnapshots();
    service.clearPendingRequests();
    vi.useRealTimers();
    delete globalThis.metricsAPI;
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(service._pendingTimeouts).toBeInstanceOf(Set);
      expect(service._intervalId).toBeNull();
      expect(service._timeoutId).toBeNull();
    });
  });

  describe('requestSnapshot', () => {
    it('should log snapshot immediately when no delay specified', () => {
      service.requestSnapshot({ label: 'test-snapshot' });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('test-snapshot')
      );
    });

    it('should use default label when none provided', () => {
      service.requestSnapshot({});

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('snapshot')
      );
    });

    it('should handle undefined payload', () => {
      service.requestSnapshot();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('snapshot')
      );
    });

    it('should delay snapshot when delayMs is specified', () => {
      service.requestSnapshot({ label: 'delayed', delayMs: 1000 });

      expect(mockLogger.debug).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('delayed')
      );
    });

    it('should track pending timeouts', () => {
      service.requestSnapshot({ label: 'pending', delayMs: 5000 });

      expect(service._pendingTimeouts.size).toBe(1);

      vi.advanceTimersByTime(5000);

      expect(service._pendingTimeouts.size).toBe(0);
    });

    it('should handle multiple delayed requests', () => {
      service.requestSnapshot({ label: 'first', delayMs: 1000 });
      service.requestSnapshot({ label: 'second', delayMs: 2000 });

      expect(service._pendingTimeouts.size).toBe(2);

      vi.advanceTimersByTime(2000);

      expect(service._pendingTimeouts.size).toBe(0);
      expect(mockLogger.debug).toHaveBeenCalledTimes(2);
    });
  });

  describe('startPeriodicSnapshots', () => {
    it('should start periodic snapshots after initial delay', () => {
      service.startPeriodicSnapshots();

      expect(mockLogger.debug).not.toHaveBeenCalled();

      vi.advanceTimersByTime(2000);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('periodic')
      );
    });

    it('should continue logging at interval after initial delay', () => {
      service.startPeriodicSnapshots();

      vi.advanceTimersByTime(2000);
      expect(mockLogger.debug).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(10000);
      expect(mockLogger.debug).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(10000);
      expect(mockLogger.debug).toHaveBeenCalledTimes(3);
    });

    it('should not start if already running (timeout phase)', () => {
      service.startPeriodicSnapshots();
      service.startPeriodicSnapshots();

      vi.advanceTimersByTime(2000);

      expect(mockLogger.debug).toHaveBeenCalledTimes(1);
    });

    it('should not start if already running (interval phase)', () => {
      service.startPeriodicSnapshots();
      vi.advanceTimersByTime(2000);

      service.startPeriodicSnapshots();

      vi.advanceTimersByTime(10000);

      expect(mockLogger.debug).toHaveBeenCalledTimes(2);
    });
  });

  describe('stopPeriodicSnapshots', () => {
    it('should stop timeout before interval starts', () => {
      service.startPeriodicSnapshots();
      service.stopPeriodicSnapshots();

      vi.advanceTimersByTime(2000);

      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should stop interval after it starts', () => {
      service.startPeriodicSnapshots();
      vi.advanceTimersByTime(2000);

      service.stopPeriodicSnapshots();

      vi.advanceTimersByTime(10000);

      expect(mockLogger.debug).toHaveBeenCalledTimes(1);
    });

    it('should handle being called when not running', () => {
      expect(() => service.stopPeriodicSnapshots()).not.toThrow();
    });

    it('should reset internal state', () => {
      service.startPeriodicSnapshots();
      vi.advanceTimersByTime(2000);

      service.stopPeriodicSnapshots();

      expect(service._timeoutId).toBeNull();
      expect(service._intervalId).toBeNull();
    });
  });

  describe('clearPendingRequests', () => {
    it('should clear all pending delayed requests', () => {
      service.requestSnapshot({ label: 'one', delayMs: 5000 });
      service.requestSnapshot({ label: 'two', delayMs: 10000 });

      expect(service._pendingTimeouts.size).toBe(2);

      service.clearPendingRequests();

      expect(service._pendingTimeouts.size).toBe(0);

      vi.advanceTimersByTime(10000);
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should handle empty pending set', () => {
      expect(() => service.clearPendingRequests()).not.toThrow();
    });
  });

  describe('_logSnapshot with metricsAPI', () => {
    it('should log unavailable when metricsAPI is missing', () => {
      service._logSnapshot('test');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('unavailable')
      );
    });

    it('should log unavailable when getProcessMetrics is missing', () => {
      globalThis.metricsAPI = {};

      service._logSnapshot('test');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('unavailable')
      );
    });

    it('should log metrics when API returns success', async () => {
      globalThis.metricsAPI = {
        getProcessMetrics: vi.fn().mockResolvedValue({
          success: true,
          totalMB: '150.5',
          processes: [
            { type: 'Renderer', memoryMB: '80.0' },
            { type: 'GPU', memoryMB: '50.0' }
          ]
        })
      };

      service._logSnapshot('test-label');

      await vi.runAllTimersAsync();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('test-label')
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('150.5 MB')
      );
    });

    it('should handle missing renderer process', async () => {
      globalThis.metricsAPI = {
        getProcessMetrics: vi.fn().mockResolvedValue({
          success: true,
          totalMB: '50.0',
          processes: [{ type: 'GPU', memoryMB: '50.0' }]
        })
      };

      service._logSnapshot('test');

      await vi.runAllTimersAsync();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('renderer n/a')
      );
    });

    it('should handle missing GPU process', async () => {
      globalThis.metricsAPI = {
        getProcessMetrics: vi.fn().mockResolvedValue({
          success: true,
          totalMB: '80.0',
          processes: [{ type: 'Renderer', memoryMB: '80.0' }]
        })
      };

      service._logSnapshot('test');

      await vi.runAllTimersAsync();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('gpu n/a')
      );
    });

    it('should log error when API returns failure', async () => {
      globalThis.metricsAPI = {
        getProcessMetrics: vi.fn().mockResolvedValue({
          success: false,
          error: 'Failed'
        })
      };

      service._logSnapshot('test');

      await vi.runAllTimersAsync();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('error')
      );
    });

    it('should handle API promise rejection', async () => {
      globalThis.metricsAPI = {
        getProcessMetrics: vi.fn().mockRejectedValue(new Error('IPC error'))
      };

      service._logSnapshot('test');

      await vi.runAllTimersAsync();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('error')
      );
    });

    it('should handle null snapshot response', async () => {
      globalThis.metricsAPI = {
        getProcessMetrics: vi.fn().mockResolvedValue(null)
      };

      service._logSnapshot('test');

      await vi.runAllTimersAsync();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('error')
      );
    });
  });
});
