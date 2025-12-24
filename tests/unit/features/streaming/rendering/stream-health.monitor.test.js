/**
 * StreamHealthMonitor Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StreamHealthMonitor } from '@renderer/features/streaming/rendering/stream-health.monitor.js';

describe('StreamHealthMonitor', () => {
  let monitor;
  let mockLogger;
  let mockVideoElement;

  beforeEach(() => {
    vi.useFakeTimers();

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockVideoElement = {
      requestVideoFrameCallback: vi.fn(),
      cancelVideoFrameCallback: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    monitor = new StreamHealthMonitor(mockLogger);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(monitor._isMonitoring).toBe(false);
      expect(monitor._timeoutMs).toBe(4000);
      expect(monitor._timeoutHandle).toBeNull();
      expect(monitor._rvfcHandle).toBeNull();
      expect(monitor._firstFrameReceived).toBe(false);
      expect(monitor._onHealthy).toBeNull();
      expect(monitor._onUnhealthy).toBeNull();
      expect(monitor._videoElement).toBeNull();
    });
  });

  describe('startMonitoring', () => {
    it('should start monitoring with RVFC', () => {
      const onHealthy = vi.fn();
      const onUnhealthy = vi.fn();

      mockVideoElement.requestVideoFrameCallback.mockReturnValue(123);

      monitor.startMonitoring(mockVideoElement, onHealthy, onUnhealthy, 4000);

      expect(monitor._isMonitoring).toBe(true);
      expect(monitor._videoElement).toBe(mockVideoElement);
      expect(monitor._onHealthy).toBe(onHealthy);
      expect(monitor._onUnhealthy).toBe(onUnhealthy);
      expect(mockVideoElement.requestVideoFrameCallback).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('Stream health monitoring started (timeout: 4000ms)');
    });

    it('should fallback to timeupdate when RVFC not available', () => {
      const onHealthy = vi.fn();
      const onUnhealthy = vi.fn();
      const videoWithoutRvfc = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };

      monitor.startMonitoring(videoWithoutRvfc, onHealthy, onUnhealthy);

      expect(videoWithoutRvfc.addEventListener).toHaveBeenCalledWith(
        'timeupdate',
        expect.any(Function),
        { once: true }
      );
    });

    it('should stop existing monitoring before starting new', () => {
      const onHealthy = vi.fn();
      const onUnhealthy = vi.fn();

      mockVideoElement.requestVideoFrameCallback.mockReturnValue(123);

      monitor.startMonitoring(mockVideoElement, onHealthy, onUnhealthy);
      monitor._isMonitoring = true;

      // Start new monitoring
      monitor.startMonitoring(mockVideoElement, vi.fn(), vi.fn());

      expect(mockLogger.debug).toHaveBeenCalledWith('Stream health monitoring stopped');
    });

    it('should use custom timeout', () => {
      const onHealthy = vi.fn();
      const onUnhealthy = vi.fn();

      monitor.startMonitoring(mockVideoElement, onHealthy, onUnhealthy, 2000);

      expect(monitor._timeoutMs).toBe(2000);
      expect(mockLogger.debug).toHaveBeenCalledWith('Stream health monitoring started (timeout: 2000ms)');
    });
  });

  describe('_handleFrameCallback', () => {
    it('should call onHealthy when first frame received', () => {
      const onHealthy = vi.fn();
      const onUnhealthy = vi.fn();
      const metadata = { mediaTime: 123.456 };

      mockVideoElement.requestVideoFrameCallback.mockReturnValue(1);

      monitor.startMonitoring(mockVideoElement, onHealthy, onUnhealthy);

      // Simulate RVFC callback
      monitor._handleFrameCallback(100, metadata);

      expect(monitor._firstFrameReceived).toBe(true);
      expect(onHealthy).toHaveBeenCalledWith({ frameTime: 123.456 });
      expect(mockLogger.info).toHaveBeenCalledWith('First frame received - stream is healthy');
    });

    it('should use current time when mediaTime not available', () => {
      const onHealthy = vi.fn();

      mockVideoElement.requestVideoFrameCallback.mockReturnValue(1);

      monitor.startMonitoring(mockVideoElement, onHealthy, vi.fn());

      // Simulate RVFC callback without metadata
      monitor._handleFrameCallback(500, null);

      expect(onHealthy).toHaveBeenCalledWith({ frameTime: 500 });
    });

    it('should not call onHealthy if already received frame', () => {
      const onHealthy = vi.fn();

      mockVideoElement.requestVideoFrameCallback.mockReturnValue(1);

      monitor.startMonitoring(mockVideoElement, onHealthy, vi.fn());
      monitor._firstFrameReceived = true;

      monitor._handleFrameCallback(100, {});

      expect(onHealthy).not.toHaveBeenCalled();
    });

    it('should not call onHealthy if not monitoring', () => {
      const onHealthy = vi.fn();

      mockVideoElement.requestVideoFrameCallback.mockReturnValue(1);

      monitor.startMonitoring(mockVideoElement, onHealthy, vi.fn());
      monitor._isMonitoring = false;

      monitor._handleFrameCallback(100, {});

      expect(onHealthy).not.toHaveBeenCalled();
    });

    it('should clear timeout when frame received', () => {
      const onHealthy = vi.fn();

      mockVideoElement.requestVideoFrameCallback.mockReturnValue(1);

      monitor.startMonitoring(mockVideoElement, onHealthy, vi.fn());

      expect(monitor._timeoutHandle).not.toBeNull();

      monitor._handleFrameCallback(100, {});

      expect(monitor._timeoutHandle).toBeNull();
    });
  });

  describe('_handleTimeout', () => {
    it('should call onUnhealthy when timeout expires', () => {
      const onHealthy = vi.fn();
      const onUnhealthy = vi.fn();

      mockVideoElement.requestVideoFrameCallback.mockReturnValue(1);

      monitor.startMonitoring(mockVideoElement, onHealthy, onUnhealthy, 4000);

      // Fast-forward past timeout
      vi.advanceTimersByTime(4000);

      expect(onUnhealthy).toHaveBeenCalledWith({
        timeoutMs: 4000,
        reason: 'NO_FRAMES_RECEIVED'
      });
      expect(mockLogger.warn).toHaveBeenCalledWith('No frames received in 4000ms - device may be powered off');
    });

    it('should not call onUnhealthy if frame already received', () => {
      const onUnhealthy = vi.fn();

      mockVideoElement.requestVideoFrameCallback.mockReturnValue(1);

      monitor.startMonitoring(mockVideoElement, vi.fn(), onUnhealthy, 4000);
      monitor._firstFrameReceived = true;

      vi.advanceTimersByTime(4000);

      expect(onUnhealthy).not.toHaveBeenCalled();
    });

    it('should cancel RVFC when timeout expires', () => {
      mockVideoElement.requestVideoFrameCallback.mockReturnValue(42);

      monitor.startMonitoring(mockVideoElement, vi.fn(), vi.fn(), 4000);

      vi.advanceTimersByTime(4000);

      expect(mockVideoElement.cancelVideoFrameCallback).toHaveBeenCalledWith(42);
    });
  });

  describe('stopMonitoring', () => {
    it('should stop monitoring and cleanup', () => {
      mockVideoElement.requestVideoFrameCallback.mockReturnValue(123);

      monitor.startMonitoring(mockVideoElement, vi.fn(), vi.fn());

      monitor.stopMonitoring();

      expect(monitor._isMonitoring).toBe(false);
      expect(monitor._videoElement).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith('Stream health monitoring stopped');
    });

    it('should do nothing if not monitoring', () => {
      monitor.stopMonitoring();

      expect(mockLogger.debug).not.toHaveBeenCalledWith('Stream health monitoring stopped');
    });

    it('should cancel pending RVFC', () => {
      mockVideoElement.requestVideoFrameCallback.mockReturnValue(456);

      monitor.startMonitoring(mockVideoElement, vi.fn(), vi.fn());
      monitor.stopMonitoring();

      expect(mockVideoElement.cancelVideoFrameCallback).toHaveBeenCalledWith(456);
    });

    it('should clear pending timeout', () => {
      mockVideoElement.requestVideoFrameCallback.mockReturnValue(1);

      monitor.startMonitoring(mockVideoElement, vi.fn(), vi.fn());

      expect(monitor._timeoutHandle).not.toBeNull();

      monitor.stopMonitoring();

      expect(monitor._timeoutHandle).toBeNull();
    });
  });

  describe('isMonitoring', () => {
    it('should return true when monitoring', () => {
      mockVideoElement.requestVideoFrameCallback.mockReturnValue(1);

      monitor.startMonitoring(mockVideoElement, vi.fn(), vi.fn());

      expect(monitor.isMonitoring()).toBe(true);
    });

    it('should return false when not monitoring', () => {
      expect(monitor.isMonitoring()).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should call stopMonitoring', () => {
      mockVideoElement.requestVideoFrameCallback.mockReturnValue(1);

      monitor.startMonitoring(mockVideoElement, vi.fn(), vi.fn());
      monitor.cleanup();

      expect(monitor._isMonitoring).toBe(false);
    });
  });

  describe('_handleTimeUpdate (fallback)', () => {
    it('should detect playback via timeupdate event', () => {
      const onHealthy = vi.fn();
      const videoWithoutRvfc = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };

      monitor.startMonitoring(videoWithoutRvfc, onHealthy, vi.fn());

      // Simulate timeupdate callback
      monitor._handleTimeUpdate();

      expect(monitor._firstFrameReceived).toBe(true);
      expect(onHealthy).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Playback detected via timeupdate - stream is healthy');
    });
  });
});
