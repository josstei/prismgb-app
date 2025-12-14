/**
 * CanvasRenderer Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CanvasRenderer } from '@features/streaming/rendering/canvas.renderer.js';

describe('CanvasRenderer', () => {
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

    renderer = new CanvasRenderer(mockLogger, mockAnimationCache);
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
  });
});
