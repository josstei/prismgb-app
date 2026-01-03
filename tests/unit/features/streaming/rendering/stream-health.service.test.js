/**
 * StreamingHealthService Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StreamingHealthService } from '@renderer/features/streaming/rendering/streaming-health.service.js';

describe('StreamingHealthService', () => {
  let service;
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

    service = new StreamingHealthService(mockLogger);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(service._isMonitoring).toBe(false);
      expect(service._timeoutMs).toBe(4000);
      expect(service._timeoutHandle).toBeNull();
      expect(service._rvfcHandle).toBeNull();
      expect(service._firstFrameReceived).toBe(false);
      expect(service._onHealthy).toBeNull();
      expect(service._onUnhealthy).toBeNull();
      expect(service._videoElement).toBeNull();
    });
  });

  describe('startMonitoring', () => {
    it('should start monitoring with RVFC', () => {
      const onHealthy = vi.fn();
      const onUnhealthy = vi.fn();

      mockVideoElement.requestVideoFrameCallback.mockReturnValue(123);

      service.startMonitoring(mockVideoElement, onHealthy, onUnhealthy, 4000);

      expect(service._isMonitoring).toBe(true);
      expect(service._videoElement).toBe(mockVideoElement);
      expect(service._onHealthy).toBe(onHealthy);
      expect(service._onUnhealthy).toBe(onUnhealthy);
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

      service.startMonitoring(videoWithoutRvfc, onHealthy, onUnhealthy);

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

      service.startMonitoring(mockVideoElement, onHealthy, onUnhealthy);
      service._isMonitoring = true;

      // Start new monitoring
      service.startMonitoring(mockVideoElement, vi.fn(), vi.fn());

      expect(mockLogger.debug).toHaveBeenCalledWith('Stream health monitoring stopped');
    });

    it('should use custom timeout', () => {
      const onHealthy = vi.fn();
      const onUnhealthy = vi.fn();

      service.startMonitoring(mockVideoElement, onHealthy, onUnhealthy, 2000);

      expect(service._timeoutMs).toBe(2000);
      expect(mockLogger.debug).toHaveBeenCalledWith('Stream health monitoring started (timeout: 2000ms)');
    });
  });

  describe('_handleFrameCallback', () => {
    it('should call onHealthy when first frame received', () => {
      const onHealthy = vi.fn();
      const onUnhealthy = vi.fn();
      const metadata = { mediaTime: 123.456 };

      mockVideoElement.requestVideoFrameCallback.mockReturnValue(1);

      service.startMonitoring(mockVideoElement, onHealthy, onUnhealthy);

      // Simulate RVFC callback
      service._handleFrameCallback(100, metadata);

      expect(service._firstFrameReceived).toBe(true);
      expect(onHealthy).toHaveBeenCalledWith({ frameTime: 123.456 });
      expect(mockLogger.info).toHaveBeenCalledWith('First frame received - stream is healthy');
    });

    it('should use current time when mediaTime not available', () => {
      const onHealthy = vi.fn();

      mockVideoElement.requestVideoFrameCallback.mockReturnValue(1);

      service.startMonitoring(mockVideoElement, onHealthy, vi.fn());

      // Simulate RVFC callback without metadata
      service._handleFrameCallback(500, null);

      expect(onHealthy).toHaveBeenCalledWith({ frameTime: 500 });
    });

    it('should not call onHealthy if already received frame', () => {
      const onHealthy = vi.fn();

      mockVideoElement.requestVideoFrameCallback.mockReturnValue(1);

      service.startMonitoring(mockVideoElement, onHealthy, vi.fn());
      service._firstFrameReceived = true;

      service._handleFrameCallback(100, {});

      expect(onHealthy).not.toHaveBeenCalled();
    });

    it('should not call onHealthy if not monitoring', () => {
      const onHealthy = vi.fn();

      mockVideoElement.requestVideoFrameCallback.mockReturnValue(1);

      service.startMonitoring(mockVideoElement, onHealthy, vi.fn());
      service._isMonitoring = false;

      service._handleFrameCallback(100, {});

      expect(onHealthy).not.toHaveBeenCalled();
    });

    it('should clear timeout when frame received', () => {
      const onHealthy = vi.fn();

      mockVideoElement.requestVideoFrameCallback.mockReturnValue(1);

      service.startMonitoring(mockVideoElement, onHealthy, vi.fn());

      expect(service._timeoutHandle).not.toBeNull();

      service._handleFrameCallback(100, {});

      expect(service._timeoutHandle).toBeNull();
    });
  });

  describe('_handleTimeout', () => {
    it('should call onUnhealthy when timeout expires', () => {
      const onHealthy = vi.fn();
      const onUnhealthy = vi.fn();

      mockVideoElement.requestVideoFrameCallback.mockReturnValue(1);

      service.startMonitoring(mockVideoElement, onHealthy, onUnhealthy, 4000);

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

      service.startMonitoring(mockVideoElement, vi.fn(), onUnhealthy, 4000);
      service._firstFrameReceived = true;

      vi.advanceTimersByTime(4000);

      expect(onUnhealthy).not.toHaveBeenCalled();
    });

    it('should cancel RVFC when timeout expires', () => {
      mockVideoElement.requestVideoFrameCallback.mockReturnValue(42);

      service.startMonitoring(mockVideoElement, vi.fn(), vi.fn(), 4000);

      vi.advanceTimersByTime(4000);

      expect(mockVideoElement.cancelVideoFrameCallback).toHaveBeenCalledWith(42);
    });
  });

  describe('stopMonitoring', () => {
    it('should stop monitoring and cleanup', () => {
      mockVideoElement.requestVideoFrameCallback.mockReturnValue(123);

      service.startMonitoring(mockVideoElement, vi.fn(), vi.fn());

      service.stopMonitoring();

      expect(service._isMonitoring).toBe(false);
      expect(service._videoElement).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith('Stream health monitoring stopped');
    });

    it('should do nothing if not monitoring', () => {
      service.stopMonitoring();

      expect(mockLogger.debug).not.toHaveBeenCalledWith('Stream health monitoring stopped');
    });

    it('should cancel pending RVFC', () => {
      mockVideoElement.requestVideoFrameCallback.mockReturnValue(456);

      service.startMonitoring(mockVideoElement, vi.fn(), vi.fn());
      service.stopMonitoring();

      expect(mockVideoElement.cancelVideoFrameCallback).toHaveBeenCalledWith(456);
    });

    it('should clear pending timeout', () => {
      mockVideoElement.requestVideoFrameCallback.mockReturnValue(1);

      service.startMonitoring(mockVideoElement, vi.fn(), vi.fn());

      expect(service._timeoutHandle).not.toBeNull();

      service.stopMonitoring();

      expect(service._timeoutHandle).toBeNull();
    });
  });

  describe('isMonitoring', () => {
    it('should return true when monitoring', () => {
      mockVideoElement.requestVideoFrameCallback.mockReturnValue(1);

      service.startMonitoring(mockVideoElement, vi.fn(), vi.fn());

      expect(service.isMonitoring()).toBe(true);
    });

    it('should return false when not monitoring', () => {
      expect(service.isMonitoring()).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should call stopMonitoring', () => {
      mockVideoElement.requestVideoFrameCallback.mockReturnValue(1);

      service.startMonitoring(mockVideoElement, vi.fn(), vi.fn());
      service.cleanup();

      expect(service._isMonitoring).toBe(false);
    });
  });

  describe('_handleTimeUpdate (fallback)', () => {
    it('should detect playback via timeupdate event', () => {
      const onHealthy = vi.fn();
      const videoWithoutRvfc = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };

      service.startMonitoring(videoWithoutRvfc, onHealthy, vi.fn());

      // Simulate timeupdate callback
      service._handleTimeUpdate();

      expect(service._firstFrameReceived).toBe(true);
      expect(onHealthy).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Playback detected via timeupdate - stream is healthy');
    });
  });
});
