/**
 * StreamingCanvasRenderer Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StreamingCanvasRenderer } from '@renderer/features/streaming/rendering/streaming-canvas-renderer.class.js';

describe('StreamingCanvasRenderer', () => {
  let renderer;
  let mockLogger;
  let mockCanvas;
  let mockVideo;
  let mockContext;
  let mockAnimationCache;

  beforeEach(() => {
    vi.useFakeTimers();

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockAnimationCache = {
      registerAnimation: vi.fn(),
      cancelAnimation: vi.fn(),
      cancelAllAnimations: vi.fn()
    };

    mockContext = {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
      imageSmoothingEnabled: true,
      mozImageSmoothingEnabled: true,
      webkitImageSmoothingEnabled: true,
      msImageSmoothingEnabled: true,
      setTransform: vi.fn()
    };

    // Mock devicePixelRatio (default to 1)
    vi.stubGlobal('devicePixelRatio', 1);

    mockCanvas = {
      width: 0,
      height: 0,
      style: {},
      getContext: vi.fn(() => mockContext)
    };

    mockVideo = {
      srcObject: null,
      readyState: 4,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      requestVideoFrameCallback: vi.fn(),
      cancelVideoFrameCallback: vi.fn(),
      HAVE_CURRENT_DATA: 2,
      HAVE_ENOUGH_DATA: 4
    };

    // Mock HTMLVideoElement prototype for requestVideoFrameCallback check
    Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', {
      value: vi.fn(),
      writable: true,
      configurable: true
    });

    renderer = new StreamingCanvasRenderer(mockLogger, mockAnimationCache);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(renderer._cachedContext).toBeNull();
      expect(renderer._cachedCanvas).toBeNull();
      expect(renderer._renderLoopActive).toBe(false);
      expect(renderer._lastFrameTime).toBe(-1);
      expect(renderer._rvfcHandle).toBeNull();
    });

    it('should initialize HiDPI tracking values', () => {
      expect(renderer._displayWidth).toBe(0);
      expect(renderer._displayHeight).toBe(0);
      expect(renderer._devicePixelRatio).toBe(1);
    });
  });

  describe('startRendering', () => {
    it('should cache canvas context on first call', () => {
      const isStreamingFn = vi.fn(() => true);
      const isHiddenFn = vi.fn(() => false);

      renderer.startRendering(mockVideo, mockCanvas, isStreamingFn, isHiddenFn);

      expect(mockCanvas.getContext).toHaveBeenCalledWith('2d', {
        alpha: false,
        desynchronized: true,
        willReadFrequently: false
      });
      expect(renderer._cachedCanvas).toBe(mockCanvas);
      expect(renderer._cachedContext).toBe(mockContext);
    });

    it('should disable image smoothing on context', () => {
      const isStreamingFn = vi.fn(() => true);
      const isHiddenFn = vi.fn(() => false);

      renderer.startRendering(mockVideo, mockCanvas, isStreamingFn, isHiddenFn);

      expect(mockContext.imageSmoothingEnabled).toBe(false);
    });

    it('should apply DPR transform for HiDPI rendering', () => {
      vi.stubGlobal('devicePixelRatio', 2);
      const isStreamingFn = vi.fn(() => true);
      const isHiddenFn = vi.fn(() => false);

      renderer.startRendering(mockVideo, mockCanvas, isStreamingFn, isHiddenFn);

      expect(mockContext.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
      expect(renderer._devicePixelRatio).toBe(2);
    });

    it('should use requestVideoFrameCallback when available', () => {
      const isStreamingFn = vi.fn(() => true);
      const isHiddenFn = vi.fn(() => false);
      mockVideo.readyState = 4; // HAVE_ENOUGH_DATA

      renderer.startRendering(mockVideo, mockCanvas, isStreamingFn, isHiddenFn);

      expect(mockVideo.requestVideoFrameCallback).toHaveBeenCalled();
    });

    it('should set up video loadeddata event listener', () => {
      const isStreamingFn = vi.fn(() => true);
      const isHiddenFn = vi.fn(() => false);
      mockVideo.readyState = 0; // Not ready

      renderer.startRendering(mockVideo, mockCanvas, isStreamingFn, isHiddenFn);

      expect(mockVideo.addEventListener).toHaveBeenCalledWith(
        'loadeddata',
        expect.any(Function),
        { once: true }
      );
    });
  });

  describe('stopRendering', () => {
    it('should stop render loop', () => {
      renderer._renderLoopActive = true;

      renderer.stopRendering(mockVideo);

      expect(renderer._renderLoopActive).toBe(false);
    });

    it('should cancel RVFC handle if active', () => {
      renderer._rvfcHandle = 123;

      renderer.stopRendering(mockVideo);

      expect(mockVideo.cancelVideoFrameCallback).toHaveBeenCalledWith(123);
      expect(renderer._rvfcHandle).toBeNull();
    });

    it('should cancel animation via animationCache', () => {
      renderer.stopRendering(mockVideo);

      expect(mockAnimationCache.cancelAnimation).toHaveBeenCalledWith('canvasRender');
    });

    it('should log debug message', () => {
      renderer.stopRendering(mockVideo);

      expect(mockLogger.debug).toHaveBeenCalledWith('Canvas rendering stopped');
    });
  });

  describe('clearCanvas', () => {
    it('should fill canvas with black background', () => {
      renderer.clearCanvas(mockCanvas);

      expect(mockContext.fillStyle).toBe('#000000');
      expect(mockContext.fillRect).toHaveBeenCalledWith(0, 0, 0, 0);
    });

    it('should log debug message', () => {
      renderer.clearCanvas(mockCanvas);

      expect(mockLogger.debug).toHaveBeenCalledWith('Canvas cleared');
    });
  });

  describe('resize', () => {
    it('should update canvas backing store dimensions with DPR scaling', () => {
      mockCanvas.width = 100;
      mockCanvas.height = 100;

      renderer.resize(mockCanvas, 200, 150);

      // With DPR=1, backing store equals display dimensions
      expect(mockCanvas.width).toBe(200);
      expect(mockCanvas.height).toBe(150);
      expect(mockCanvas.style.width).toBe('200px');
      expect(mockCanvas.style.height).toBe('150px');
    });

    it('should scale backing store by devicePixelRatio on HiDPI displays', () => {
      vi.stubGlobal('devicePixelRatio', 2);
      renderer._cachedContext = mockContext;

      renderer.resize(mockCanvas, 200, 150);

      // Backing store should be display * DPR
      expect(mockCanvas.width).toBe(400);
      expect(mockCanvas.height).toBe(300);
      // CSS dimensions remain at display size
      expect(mockCanvas.style.width).toBe('200px');
      expect(mockCanvas.style.height).toBe('150px');
    });

    it('should store display dimensions and DPR', () => {
      vi.stubGlobal('devicePixelRatio', 2);
      renderer._cachedContext = mockContext;

      renderer.resize(mockCanvas, 200, 150);

      expect(renderer._displayWidth).toBe(200);
      expect(renderer._displayHeight).toBe(150);
      expect(renderer._devicePixelRatio).toBe(2);
    });

    it('should apply DPR transform after resize', () => {
      vi.stubGlobal('devicePixelRatio', 2);
      renderer._cachedContext = mockContext;

      renderer.resize(mockCanvas, 200, 150);

      expect(mockContext.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    });

    it('should not update canvas if dimensions and DPR unchanged', () => {
      vi.stubGlobal('devicePixelRatio', 1);
      mockCanvas.width = 200;
      mockCanvas.height = 150;
      renderer._devicePixelRatio = 1;

      renderer.resize(mockCanvas, 200, 150);

      // Should not log since dimensions unchanged
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should update when DPR changes even if display dimensions unchanged', () => {
      renderer._cachedContext = mockContext;
      mockCanvas.width = 200;
      mockCanvas.height = 150;
      renderer._devicePixelRatio = 1;

      // Simulate DPR change (e.g., window moved to different display)
      vi.stubGlobal('devicePixelRatio', 2);

      renderer.resize(mockCanvas, 200, 150);

      // Should resize because DPR changed
      expect(mockCanvas.width).toBe(400);
      expect(mockCanvas.height).toBe(300);
    });

    it('should re-disable image smoothing after resize', () => {
      renderer._cachedContext = mockContext;
      mockContext.imageSmoothingEnabled = true;

      renderer.resize(mockCanvas, 200, 150);

      expect(mockContext.imageSmoothingEnabled).toBe(false);
    });

    it('should log debug message with backing store info on resize', () => {
      vi.stubGlobal('devicePixelRatio', 2);
      renderer._cachedContext = mockContext;

      renderer.resize(mockCanvas, 200, 150);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Canvas resized to 200x150 (backing: 400x300, DPR: 2)'
      );
    });
  });

  describe('cleanup', () => {
    it('should stop render loop', () => {
      renderer._renderLoopActive = true;

      renderer.cleanup();

      expect(renderer._renderLoopActive).toBe(false);
    });

    it('should cancel all animations', () => {
      renderer.cleanup();

      expect(mockAnimationCache.cancelAllAnimations).toHaveBeenCalled();
    });

    it('should clear cached values', () => {
      renderer._cachedContext = mockContext;
      renderer._cachedCanvas = mockCanvas;
      renderer._rvfcHandle = 123;

      renderer.cleanup();

      expect(renderer._cachedContext).toBeNull();
      expect(renderer._cachedCanvas).toBeNull();
      expect(renderer._rvfcHandle).toBeNull();
    });

    it('should reset HiDPI tracking values', () => {
      renderer._displayWidth = 200;
      renderer._displayHeight = 150;
      renderer._devicePixelRatio = 2;

      renderer.cleanup();

      expect(renderer._displayWidth).toBe(0);
      expect(renderer._displayHeight).toBe(0);
      expect(renderer._devicePixelRatio).toBe(1);
    });

    it('should cancel RVFC handle during cleanup', () => {
      renderer._rvfcHandle = 123;
      renderer._currentVideoElement = mockVideo;

      renderer.cleanup();

      expect(mockVideo.cancelVideoFrameCallback).toHaveBeenCalledWith(123);
    });

    it('should handle cleanup when no RVFC handle exists', () => {
      renderer._rvfcHandle = null;

      expect(() => renderer.cleanup()).not.toThrow();
    });

    it('should remove loadeddata listener during cleanup', () => {
      renderer._loadedDataHandler = vi.fn();
      renderer._currentVideoElement = mockVideo;

      renderer.cleanup();

      expect(mockVideo.removeEventListener).toHaveBeenCalledWith('loadeddata', expect.any(Function));
    });
  });

  describe('isActive', () => {
    it('should return false when render loop is inactive', () => {
      renderer._renderLoopActive = false;

      expect(renderer.isActive()).toBe(false);
    });

    it('should return true when render loop is active', () => {
      renderer._renderLoopActive = true;

      expect(renderer.isActive()).toBe(true);
    });
  });

  describe('resetCanvasState', () => {
    it('should reset all cached canvas state', () => {
      renderer._cachedContext = mockContext;
      renderer._cachedCanvas = mockCanvas;
      renderer._displayWidth = 200;
      renderer._displayHeight = 150;
      renderer._devicePixelRatio = 2;
      renderer._lastFrameTime = 1000;

      renderer.resetCanvasState();

      expect(renderer._cachedContext).toBeNull();
      expect(renderer._cachedCanvas).toBeNull();
      expect(renderer._displayWidth).toBe(0);
      expect(renderer._displayHeight).toBe(0);
      expect(renderer._devicePixelRatio).toBe(1);
      expect(renderer._lastFrameTime).toBe(-1);
    });
  });

  describe('_disableImageSmoothing', () => {
    it('should disable image smoothing on context', () => {
      mockContext.imageSmoothingEnabled = true;

      renderer._disableImageSmoothing(mockContext);

      expect(mockContext.imageSmoothingEnabled).toBe(false);
    });

    it('should handle null context gracefully', () => {
      expect(() => renderer._disableImageSmoothing(null)).not.toThrow();
    });

    it('should handle undefined context gracefully', () => {
      expect(() => renderer._disableImageSmoothing(undefined)).not.toThrow();
    });
  });

  describe('_removeLoadedDataListener', () => {
    it('should remove loadeddata listener when handler exists', () => {
      renderer._loadedDataHandler = vi.fn();
      renderer._currentVideoElement = mockVideo;

      renderer._removeLoadedDataListener();

      expect(mockVideo.removeEventListener).toHaveBeenCalledWith('loadeddata', expect.any(Function));
      expect(renderer._loadedDataHandler).toBeNull();
    });

    it('should not throw when handler is null', () => {
      renderer._loadedDataHandler = null;
      renderer._currentVideoElement = mockVideo;

      expect(() => renderer._removeLoadedDataListener()).not.toThrow();
    });

    it('should not throw when video element is null', () => {
      renderer._loadedDataHandler = vi.fn();
      renderer._currentVideoElement = null;

      expect(() => renderer._removeLoadedDataListener()).not.toThrow();
    });
  });

  describe('stopRendering - edge cases', () => {
    it('should handle null video element gracefully', () => {
      renderer._rvfcHandle = 123;

      expect(() => renderer.stopRendering(null)).not.toThrow();
      expect(renderer._renderLoopActive).toBe(false);
    });

    it('should handle video element without cancelVideoFrameCallback', () => {
      const videoWithoutRVFC = {
        cancelVideoFrameCallback: undefined
      };
      renderer._rvfcHandle = 123;

      expect(() => renderer.stopRendering(videoWithoutRVFC)).not.toThrow();
    });

    it('should clear current video element reference', () => {
      renderer._currentVideoElement = mockVideo;

      renderer.stopRendering(mockVideo);

      expect(renderer._currentVideoElement).toBeNull();
    });
  });

  describe('startRendering - edge cases', () => {
    it('should reuse cached context for same canvas', () => {
      const isStreamingFn = vi.fn(() => true);
      const isHiddenFn = vi.fn(() => false);

      renderer.startRendering(mockVideo, mockCanvas, isStreamingFn, isHiddenFn);
      const firstContext = renderer._cachedContext;

      mockCanvas.getContext.mockClear();
      renderer.startRendering(mockVideo, mockCanvas, isStreamingFn, isHiddenFn);

      expect(mockCanvas.getContext).not.toHaveBeenCalled();
      expect(renderer._cachedContext).toBe(firstContext);
    });

    it('should create new context when canvas changes', () => {
      const isStreamingFn = vi.fn(() => true);
      const isHiddenFn = vi.fn(() => false);

      renderer.startRendering(mockVideo, mockCanvas, isStreamingFn, isHiddenFn);
      const firstContext = renderer._cachedContext;

      const newCanvas = {
        width: 0,
        height: 0,
        style: {},
        getContext: vi.fn(() => ({ ...mockContext }))
      };

      renderer.startRendering(mockVideo, newCanvas, isStreamingFn, isHiddenFn);

      expect(newCanvas.getContext).toHaveBeenCalled();
      expect(renderer._cachedContext).not.toBe(firstContext);
      expect(renderer._cachedCanvas).toBe(newCanvas);
    });

    it('should reset last frame time on start', () => {
      const isStreamingFn = vi.fn(() => true);
      const isHiddenFn = vi.fn(() => false);
      renderer._lastFrameTime = 1000;

      renderer.startRendering(mockVideo, mockCanvas, isStreamingFn, isHiddenFn);

      expect(renderer._lastFrameTime).toBe(-1);
    });

    it('should set render loop active flag', () => {
      const isStreamingFn = vi.fn(() => true);
      const isHiddenFn = vi.fn(() => false);
      renderer._renderLoopActive = false;

      renderer.startRendering(mockVideo, mockCanvas, isStreamingFn, isHiddenFn);

      expect(renderer._renderLoopActive).toBe(true);
    });

    it('should clean up existing loadeddata listener before adding new one', () => {
      const isStreamingFn = vi.fn(() => true);
      const isHiddenFn = vi.fn(() => false);
      const oldHandler = vi.fn();
      renderer._loadedDataHandler = oldHandler;
      renderer._currentVideoElement = mockVideo;

      renderer.startRendering(mockVideo, mockCanvas, isStreamingFn, isHiddenFn);

      expect(mockVideo.removeEventListener).toHaveBeenCalledWith('loadeddata', oldHandler);
    });
  });

  describe('Frame rendering behavior', () => {
    it('should use display dimensions when rendering frames', () => {
      let callbackInvoked = false;
      const isStreamingFn = vi.fn(() => callbackInvoked); // Return false after first call to prevent infinite recursion
      const isHiddenFn = vi.fn(() => false);
      mockVideo.readyState = 4; // HAVE_ENOUGH_DATA

      renderer._displayWidth = 320;
      renderer._displayHeight = 288;
      mockCanvas.width = 640; // backing store (2x DPR)
      mockCanvas.height = 576;

      // We need to simulate the render callback being invoked once
      mockVideo.requestVideoFrameCallback.mockImplementation((callback) => {
        if (!callbackInvoked) {
          callbackInvoked = true;
          const mockMetadata = { mediaTime: 1.0 };
          callback(1000, mockMetadata);
        }
        return 1;
      });

      renderer.startRendering(mockVideo, mockCanvas, isStreamingFn, isHiddenFn);

      // Should draw using display dimensions, not backing store dimensions
      expect(mockContext.drawImage).toHaveBeenCalledWith(mockVideo, 0, 0, 320, 288);
    });
  });
});
