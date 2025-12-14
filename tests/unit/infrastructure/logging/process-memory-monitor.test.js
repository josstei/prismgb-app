/**
 * ProcessMemoryMonitor Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock electron before importing
vi.mock('electron', () => ({
  app: {
    getAppMetrics: vi.fn()
  }
}));

import { ProcessMemoryMonitor } from '@/infrastructure/logging/process-memory-monitor.js';
import { app } from 'electron';

describe('ProcessMemoryMonitor', () => {
  let monitor;
  let consoleSpy;

  const mockMetrics = [
    {
      type: 'Browser',
      pid: 1234,
      memory: { workingSetSize: 50000, peakWorkingSetSize: 55000 },
      cpu: { percentCPUUsage: 2.5 }
    },
    {
      type: 'Renderer',
      pid: 1235,
      memory: { workingSetSize: 100000, peakWorkingSetSize: 120000 },
      cpu: { percentCPUUsage: 5.0 }
    },
    {
      type: 'GPU',
      pid: 1236,
      memory: { workingSetSize: 75000, peakWorkingSetSize: 80000 },
      cpu: { percentCPUUsage: 3.0 }
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    app.getAppMetrics.mockReturnValue(mockMetrics);
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    monitor = new ProcessMemoryMonitor();
  });

  afterEach(() => {
    monitor.stop();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(monitor._intervalMs).toBe(10000);
      expect(monitor._initialDelayMs).toBe(2000);
      expect(monitor._isRunning).toBe(false);
    });

    it('should accept custom options', () => {
      const customMonitor = new ProcessMemoryMonitor({
        intervalMs: 5000,
        initialDelayMs: 1000
      });
      expect(customMonitor._intervalMs).toBe(5000);
      expect(customMonitor._initialDelayMs).toBe(1000);
    });
  });

  describe('start', () => {
    it('should start monitoring and log initial message', () => {
      monitor.start();

      expect(monitor.isRunning()).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Dev] Process memory monitoring enabled')
      );
    });

    it('should log metrics after initial delay', () => {
      monitor.start();

      // Before initial delay - only startup messages
      expect(app.getAppMetrics).not.toHaveBeenCalled();

      // After initial delay
      vi.advanceTimersByTime(2000);

      expect(app.getAppMetrics).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Dev Memory] Total:')
      );
    });

    it('should log metrics at regular intervals', () => {
      monitor.start();

      // Initial delay
      vi.advanceTimersByTime(2000);
      expect(app.getAppMetrics).toHaveBeenCalledTimes(1);

      // First interval
      vi.advanceTimersByTime(10000);
      expect(app.getAppMetrics).toHaveBeenCalledTimes(2);

      // Second interval
      vi.advanceTimersByTime(10000);
      expect(app.getAppMetrics).toHaveBeenCalledTimes(3);
    });

    it('should not start twice', () => {
      monitor.start();
      monitor.start();

      vi.advanceTimersByTime(2000);
      expect(app.getAppMetrics).toHaveBeenCalledTimes(1);
    });

    it('should return this for chaining', () => {
      const result = monitor.start();
      expect(result).toBe(monitor);
    });
  });

  describe('stop', () => {
    it('should stop monitoring', () => {
      monitor.start();
      vi.advanceTimersByTime(2000);

      monitor.stop();

      expect(monitor.isRunning()).toBe(false);

      // Advance time - should not log more
      const callCount = app.getAppMetrics.mock.calls.length;
      vi.advanceTimersByTime(20000);
      expect(app.getAppMetrics).toHaveBeenCalledTimes(callCount);
    });

    it('should return this for chaining', () => {
      const result = monitor.stop();
      expect(result).toBe(monitor);
    });
  });

  describe('getSnapshot', () => {
    it('should return current memory metrics snapshot', () => {
      const snapshot = monitor.getSnapshot();

      expect(snapshot).toHaveProperty('timestamp');
      expect(snapshot).toHaveProperty('totalKB');
      expect(snapshot).toHaveProperty('totalMB');
      expect(snapshot).toHaveProperty('processCount', 3);
      expect(snapshot).toHaveProperty('processes');
      expect(snapshot.processes).toHaveLength(3);
    });

    it('should calculate correct total memory', () => {
      const snapshot = monitor.getSnapshot();

      // 50000 + 100000 + 75000 = 225000 KB
      expect(snapshot.totalKB).toBe(225000);
    });

    it('should include process details', () => {
      const snapshot = monitor.getSnapshot();
      const browser = snapshot.processes.find(p => p.type === 'Browser');

      expect(browser).toBeDefined();
      expect(browser.pid).toBe(1234);
      expect(browser.memoryKB).toBe(50000);
      expect(browser.peakMemoryKB).toBe(55000);
      expect(browser.cpuPercent).toBe(2.5);
    });
  });

  describe('_formatMB', () => {
    it('should format KB to MB string', () => {
      expect(monitor._formatMB(1024)).toBe('1.0 MB');
      expect(monitor._formatMB(2048)).toBe('2.0 MB');
      expect(monitor._formatMB(1536)).toBe('1.5 MB');
    });
  });
});
