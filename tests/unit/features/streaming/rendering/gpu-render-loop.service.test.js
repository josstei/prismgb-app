/**
 * StreamingGpuRenderLoopService Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StreamingGpuRenderLoopService } from '@renderer/infrastructure/services/streaming/gpu-render-loop.service.ts';

describe('StreamingGpuRenderLoopService', () => {
  let service;
  let mockLogger;
  let mockVideoElement;
  let mockRenderFrame;
  let mockShouldContinue;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockRenderFrame = vi.fn();
    mockShouldContinue = vi.fn(() => true);

    mockVideoElement = {
      requestVideoFrameCallback: vi.fn(),
      cancelVideoFrameCallback: vi.fn(),
      readyState: 4,
      HAVE_CURRENT_DATA: 2
    };

    service = new StreamingGpuRenderLoopService({
      loggerFactory: { create: vi.fn(() => mockLogger) }
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(service._rvfcHandle).toBeNull();
      expect(service._active).toBe(false);
    });

    it('should create logger with service name', () => {
      const mockLoggerFactory = { create: vi.fn(() => mockLogger) };
      new StreamingGpuRenderLoopService({ loggerFactory: mockLoggerFactory });

      expect(mockLoggerFactory.create).toHaveBeenCalledWith('StreamingGpuRenderLoopService');
    });
  });

  describe('start', () => {
    it('should warn and return if requestVideoFrameCallback not available', () => {
      const videoWithoutRVFC = {
        requestVideoFrameCallback: undefined
      };

      service.start({
        videoElement: videoWithoutRVFC,
        renderFrame: mockRenderFrame,
        shouldContinue: mockShouldContinue
      });

      expect(mockLogger.warn).toHaveBeenCalledWith('requestVideoFrameCallback not available');
      expect(service._active).toBe(false);
    });

    it('should warn and return if videoElement is null', () => {
      service.start({
        videoElement: null,
        renderFrame: mockRenderFrame,
        shouldContinue: mockShouldContinue
      });

      expect(mockLogger.warn).toHaveBeenCalledWith('requestVideoFrameCallback not available');
      expect(service._active).toBe(false);
    });

    it('should set active flag to true', () => {
      service.start({
        videoElement: mockVideoElement,
        renderFrame: mockRenderFrame,
        shouldContinue: mockShouldContinue
      });

      expect(service._active).toBe(true);
    });

    it('should register requestVideoFrameCallback', () => {
      service.start({
        videoElement: mockVideoElement,
        renderFrame: mockRenderFrame,
        shouldContinue: mockShouldContinue
      });

      expect(mockVideoElement.requestVideoFrameCallback).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should store RVFC handle', () => {
      const mockHandle = 42;
      mockVideoElement.requestVideoFrameCallback.mockReturnValue(mockHandle);

      service.start({
        videoElement: mockVideoElement,
        renderFrame: mockRenderFrame,
        shouldContinue: mockShouldContinue
      });

      expect(service._rvfcHandle).toBe(mockHandle);
    });
  });

  describe('render loop', () => {
    let capturedRenderLoop;

    beforeEach(() => {
      mockVideoElement.requestVideoFrameCallback.mockImplementation((callback) => {
        capturedRenderLoop = callback;
        return 1;
      });
    });

    it('should call renderFrame when frame time changes and video ready', () => {
      service.start({
        videoElement: mockVideoElement,
        renderFrame: mockRenderFrame,
        shouldContinue: mockShouldContinue
      });

      const now = 1000;
      const metadata = { mediaTime: 16.67 };

      capturedRenderLoop(now, metadata);

      expect(mockRenderFrame).toHaveBeenCalledTimes(1);
    });

    it('should use metadata.mediaTime as frameTime when available', () => {
      service.start({
        videoElement: mockVideoElement,
        renderFrame: mockRenderFrame,
        shouldContinue: mockShouldContinue
      });

      const now = 1000;
      const metadata = { mediaTime: 16.67 };

      capturedRenderLoop(now, metadata);
      expect(mockRenderFrame).toHaveBeenCalledTimes(1);

      // Same mediaTime should not trigger another render
      capturedRenderLoop(2000, { mediaTime: 16.67 });
      expect(mockRenderFrame).toHaveBeenCalledTimes(1);

      // Different mediaTime should trigger render
      capturedRenderLoop(3000, { mediaTime: 33.34 });
      expect(mockRenderFrame).toHaveBeenCalledTimes(2);
    });

    it('should fallback to now when metadata.mediaTime not available', () => {
      service.start({
        videoElement: mockVideoElement,
        renderFrame: mockRenderFrame,
        shouldContinue: mockShouldContinue
      });

      const now1 = 1000;
      const now2 = 2000;

      capturedRenderLoop(now1, {});
      expect(mockRenderFrame).toHaveBeenCalledTimes(1);

      capturedRenderLoop(now2, {});
      expect(mockRenderFrame).toHaveBeenCalledTimes(2);
    });

    it('should fallback to now when metadata is null', () => {
      service.start({
        videoElement: mockVideoElement,
        renderFrame: mockRenderFrame,
        shouldContinue: mockShouldContinue
      });

      const now = 1000;

      capturedRenderLoop(now, null);
      expect(mockRenderFrame).toHaveBeenCalledTimes(1);
    });

    it('should skip rendering when frame time unchanged', () => {
      service.start({
        videoElement: mockVideoElement,
        renderFrame: mockRenderFrame,
        shouldContinue: mockShouldContinue
      });

      const now = 1000;
      const metadata = { mediaTime: 16.67 };

      capturedRenderLoop(now, metadata);
      expect(mockRenderFrame).toHaveBeenCalledTimes(1);

      // Same frame time
      capturedRenderLoop(now, metadata);
      expect(mockRenderFrame).toHaveBeenCalledTimes(1);
    });

    it('should skip rendering when readyState < HAVE_CURRENT_DATA', () => {
      mockVideoElement.readyState = 1; // Less than HAVE_CURRENT_DATA (2)

      service.start({
        videoElement: mockVideoElement,
        renderFrame: mockRenderFrame,
        shouldContinue: mockShouldContinue
      });

      const now = 1000;
      const metadata = { mediaTime: 16.67 };

      capturedRenderLoop(now, metadata);

      expect(mockRenderFrame).not.toHaveBeenCalled();
    });

    it('should render when readyState equals HAVE_CURRENT_DATA', () => {
      mockVideoElement.readyState = 2; // HAVE_CURRENT_DATA

      service.start({
        videoElement: mockVideoElement,
        renderFrame: mockRenderFrame,
        shouldContinue: mockShouldContinue
      });

      const now = 1000;
      const metadata = { mediaTime: 16.67 };

      capturedRenderLoop(now, metadata);

      expect(mockRenderFrame).toHaveBeenCalledTimes(1);
    });

    it('should render when readyState > HAVE_CURRENT_DATA', () => {
      mockVideoElement.readyState = 4; // HAVE_ENOUGH_DATA

      service.start({
        videoElement: mockVideoElement,
        renderFrame: mockRenderFrame,
        shouldContinue: mockShouldContinue
      });

      const now = 1000;
      const metadata = { mediaTime: 16.67 };

      capturedRenderLoop(now, metadata);

      expect(mockRenderFrame).toHaveBeenCalledTimes(1);
    });

    it('should continue loop when shouldContinue returns true', () => {
      mockShouldContinue.mockReturnValue(true);
      const handle1 = 1;
      const handle2 = 2;
      let callCount = 0;
      mockVideoElement.requestVideoFrameCallback.mockImplementation((callback) => {
        capturedRenderLoop = callback;
        callCount++;
        return callCount === 1 ? handle1 : handle2;
      });

      service.start({
        videoElement: mockVideoElement,
        renderFrame: mockRenderFrame,
        shouldContinue: mockShouldContinue
      });

      expect(service._rvfcHandle).toBe(handle1);
      expect(mockVideoElement.requestVideoFrameCallback).toHaveBeenCalledTimes(1);

      capturedRenderLoop(1000, { mediaTime: 16.67 });

      expect(mockShouldContinue).toHaveBeenCalledTimes(1);
      expect(mockVideoElement.requestVideoFrameCallback).toHaveBeenCalledTimes(2);
      expect(service._rvfcHandle).toBe(handle2);
    });

    it('should stop loop when shouldContinue returns false', () => {
      mockShouldContinue.mockReturnValue(false);

      service.start({
        videoElement: mockVideoElement,
        renderFrame: mockRenderFrame,
        shouldContinue: mockShouldContinue
      });

      expect(mockVideoElement.requestVideoFrameCallback).toHaveBeenCalledTimes(1);

      capturedRenderLoop(1000, { mediaTime: 16.67 });

      expect(mockShouldContinue).toHaveBeenCalledTimes(1);
      expect(mockVideoElement.requestVideoFrameCallback).toHaveBeenCalledTimes(1);
    });

    it('should not render when active flag is false', () => {
      service.start({
        videoElement: mockVideoElement,
        renderFrame: mockRenderFrame,
        shouldContinue: mockShouldContinue
      });

      service._active = false;

      capturedRenderLoop(1000, { mediaTime: 16.67 });

      expect(mockRenderFrame).not.toHaveBeenCalled();
      expect(mockShouldContinue).not.toHaveBeenCalled();
    });

    it('should not continue loop when active flag is false', () => {
      service.start({
        videoElement: mockVideoElement,
        renderFrame: mockRenderFrame,
        shouldContinue: mockShouldContinue
      });

      service._active = false;

      capturedRenderLoop(1000, { mediaTime: 16.67 });

      expect(mockVideoElement.requestVideoFrameCallback).toHaveBeenCalledTimes(1); // Only initial call
    });

    it('should call shouldContinue immediately after renderFrame (fire-and-forget pattern)', () => {
      // renderFrame is now fire-and-forget - backpressure handled by triple buffering
      // shouldContinue should be called synchronously after renderFrame
      service.start({
        videoElement: mockVideoElement,
        renderFrame: mockRenderFrame,
        shouldContinue: mockShouldContinue
      });

      capturedRenderLoop(1000, { mediaTime: 16.67 });

      // Both should be called in same tick (synchronously)
      expect(mockRenderFrame).toHaveBeenCalledTimes(1);
      expect(mockShouldContinue).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop', () => {
    it('should set active flag to false', () => {
      service._active = true;

      service.stop(mockVideoElement);

      expect(service._active).toBe(false);
    });

    it('should cancel RVFC handle when present', () => {
      service._rvfcHandle = 42;

      service.stop(mockVideoElement);

      expect(mockVideoElement.cancelVideoFrameCallback).toHaveBeenCalledWith(42);
      expect(service._rvfcHandle).toBeNull();
    });

    it('should not cancel when handle is null', () => {
      service._rvfcHandle = null;

      service.stop(mockVideoElement);

      expect(mockVideoElement.cancelVideoFrameCallback).not.toHaveBeenCalled();
    });

    it('should handle missing cancelVideoFrameCallback gracefully', () => {
      service._rvfcHandle = 42;
      const videoWithoutCancel = {
        cancelVideoFrameCallback: undefined
      };

      service.stop(videoWithoutCancel);

      expect(service._active).toBe(false);
      expect(service._rvfcHandle).toBeNull(); // Always cleared for consistent state
    });

    it('should handle null videoElement gracefully', () => {
      service._rvfcHandle = 42;

      service.stop(null);

      expect(service._active).toBe(false);
      expect(service._rvfcHandle).toBeNull(); // Always cleared for consistent state
    });

    it('should handle undefined videoElement gracefully', () => {
      service._rvfcHandle = 42;

      service.stop(undefined);

      expect(service._active).toBe(false);
      expect(service._rvfcHandle).toBeNull(); // Always cleared for consistent state
    });

    it('should be safe to call multiple times', () => {
      service._rvfcHandle = 42;
      service._active = true;

      service.stop(mockVideoElement);
      service.stop(mockVideoElement);

      expect(service._active).toBe(false);
      expect(service._rvfcHandle).toBeNull();
      expect(mockVideoElement.cancelVideoFrameCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanup', () => {
    it('should set active flag to false', () => {
      service._active = true;

      service.cleanup();

      expect(service._active).toBe(false);
    });

    it('should clear RVFC handle', () => {
      service._rvfcHandle = 42;

      service.cleanup();

      expect(service._rvfcHandle).toBeNull();
    });

    it('should reset all state', () => {
      service._active = true;
      service._rvfcHandle = 42;

      service.cleanup();

      expect(service._active).toBe(false);
      expect(service._rvfcHandle).toBeNull();
    });

    it('should be safe to call multiple times', () => {
      service._active = true;
      service._rvfcHandle = 42;

      service.cleanup();
      service.cleanup();

      expect(service._active).toBe(false);
      expect(service._rvfcHandle).toBeNull();
    });

    it('should not throw when called with no active state', () => {
      expect(() => service.cleanup()).not.toThrow();
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete start-render-stop lifecycle', () => {
      let capturedRenderLoop;
      mockVideoElement.requestVideoFrameCallback.mockImplementation((callback) => {
        capturedRenderLoop = callback;
        return 1;
      });

      // Start
      service.start({
        videoElement: mockVideoElement,
        renderFrame: mockRenderFrame,
        shouldContinue: mockShouldContinue
      });

      expect(service._active).toBe(true);
      expect(service._rvfcHandle).toBe(1);

      // Render a few frames
      capturedRenderLoop(1000, { mediaTime: 16.67 });
      capturedRenderLoop(2000, { mediaTime: 33.34 });
      capturedRenderLoop(3000, { mediaTime: 50.01 });

      expect(mockRenderFrame).toHaveBeenCalledTimes(3);

      // Stop
      service.stop(mockVideoElement);

      expect(service._active).toBe(false);
      expect(service._rvfcHandle).toBeNull();

      // Attempting to render after stop should be ignored
      capturedRenderLoop(4000, { mediaTime: 66.68 });
      expect(mockRenderFrame).toHaveBeenCalledTimes(3); // Still 3
    });

    it('should stop rendering when shouldContinue changes to false mid-stream', () => {
      let capturedRenderLoop;
      mockVideoElement.requestVideoFrameCallback.mockImplementation((callback) => {
        capturedRenderLoop = callback;
        return 1;
      });

      let continueFlag = true;
      mockShouldContinue.mockImplementation(() => continueFlag);

      service.start({
        videoElement: mockVideoElement,
        renderFrame: mockRenderFrame,
        shouldContinue: mockShouldContinue
      });

      // First frame renders and continues
      capturedRenderLoop(1000, { mediaTime: 16.67 });
      expect(mockRenderFrame).toHaveBeenCalledTimes(1);
      expect(mockVideoElement.requestVideoFrameCallback).toHaveBeenCalledTimes(2);

      // Change shouldContinue to false
      continueFlag = false;

      // Next frame renders but doesn't continue
      capturedRenderLoop(2000, { mediaTime: 33.34 });
      expect(mockRenderFrame).toHaveBeenCalledTimes(2);
      expect(mockVideoElement.requestVideoFrameCallback).toHaveBeenCalledTimes(2); // No new call
    });

    it('should handle video readyState transitions', () => {
      let capturedRenderLoop;
      mockVideoElement.requestVideoFrameCallback.mockImplementation((callback) => {
        capturedRenderLoop = callback;
        return 1;
      });

      service.start({
        videoElement: mockVideoElement,
        renderFrame: mockRenderFrame,
        shouldContinue: mockShouldContinue
      });

      // Video starts with enough data
      mockVideoElement.readyState = 4;
      capturedRenderLoop(1000, { mediaTime: 16.67 });
      expect(mockRenderFrame).toHaveBeenCalledTimes(1);

      // Video stalls (buffering)
      mockVideoElement.readyState = 1;
      capturedRenderLoop(2000, { mediaTime: 33.34 });
      expect(mockRenderFrame).toHaveBeenCalledTimes(1); // No new render

      // Video recovers
      mockVideoElement.readyState = 4;
      capturedRenderLoop(3000, { mediaTime: 50.01 });
      expect(mockRenderFrame).toHaveBeenCalledTimes(2); // Renders again
    });
  });
});
