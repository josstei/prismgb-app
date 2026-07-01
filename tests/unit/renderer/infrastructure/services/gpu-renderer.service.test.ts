// @ts-nocheck
/**
 * StreamingGpuRendererService Unit Tests
 *
 * Tests for canvas recovery, cleanup behavior, initialization,
 * frame rendering, preset management, capture, and resize.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StreamingGpuRendererService } from '@renderer/infrastructure/services/gpu/gpu-renderer.service';
import { EventChannels } from '@prismgb/events';
import { PRESET_POLICY, buildUniforms } from '@prismgb/gpu';
import {
  createBitmapMock,
  createEventBus,
  createLoggerFactory,
  createMockVideo,
  createOffscreenCanvasElementMock,
  createWorkerRendererClientMock,
  createSettingsServiceMock
} from '../../../../factories/index.js';
import { installCreateImageBitmapMock } from '../../../../support/mocks/browser-api.installers.js';

// Mock the capability detector
vi.mock('@renderer/infrastructure/rendering/capability-detector.utils.ts', () => ({
  CapabilityDetector: {
    detect: vi.fn().mockResolvedValue({
      preferredBackend: 'webgl2',
      webgpu: false,
      webgl2: true,
      offscreenCanvas: true,
      transferControlToOffscreen: true
    }),
    describeCapabilities: vi.fn(() => 'WebGL2 available'),
    isGPURenderingAvailable: vi.fn(() => true),
    isWorkerRenderingAvailable: vi.fn(() => true)
  }
}));

// Mock render presets
vi.mock('@prismgb/gpu', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    buildUniforms: vi.fn(() => ({
      upscale: { inputSize: [160, 144], outputSize: [640, 576], scaleFactor: 4 },
      unsharp: { enabled: true, strength: 0.5, texelSize: [1/640, 1/576], scaleFactor: 4 },
      color: { enabled: true, gamma: 0.9, saturation: 1.0, greenBias: 0.02, brightness: 1.0, contrast: 1.0 },
      crt: { enabled: false, resolution: [640, 576], scaleFactor: 4, scanlineStrength: 0, pixelMaskStrength: 0, bloomStrength: 0, curvature: 0, vignetteStrength: 0 }
    }))
  };
});

describe('StreamingGpuRendererService', () => {
  let service;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;
  let mockSettingsService;
  let mockWorkerRendererClient;
  let createImageBitmapMock;

  beforeEach(() => {
    vi.useFakeTimers();

    mockEventBus = createEventBus();
    mockLoggerFactory = createLoggerFactory();

    mockSettingsService = createSettingsServiceMock({
      values: {
        canvasScale: 1.0,
        renderPreset: 'default'
      }
    });

    mockWorkerRendererClient = createWorkerRendererClientMock();

    service = new StreamingGpuRendererService({
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory,
      settingsService: mockSettingsService,
      workerRendererClient: mockWorkerRendererClient
    });
    mockLogger = mockLoggerFactory._getLogger('StreamingGpuRendererService');
  });

  afterEach(() => {
    createImageBitmapMock?.cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(service._pendingFrames).toBe(0);
      expect(service._isUsingFallback).toBe(false);
      expect(service._isDestroying).toBe(false);
    });

    it('should store client references', () => {
      expect(service._workerClient).toBe(mockWorkerRendererClient);
    });
  });

  describe('initialize', () => {
    it('should delegate worker creation to WorkerRendererClient', async () => {
      const canvasElement = createOffscreenCanvasElementMock();

      const result = await service.initialize(canvasElement);

      expect(result).toBe(true);
      expect(mockWorkerRendererClient.initialize).toHaveBeenCalledWith(
        canvasElement,
        expect.objectContaining({
          nativeWidth: 160,
          nativeHeight: 144,
          backend: 'webgl2'
        }),
        5000
      );
    });

    it('should derive worker sizing from provided native resolution', async () => {
      const canvasElement = createOffscreenCanvasElementMock({ clientWidth: 960, clientHeight: 720 });

      const result = await service.initialize(canvasElement, { width: 320, height: 240 });

      expect(result).toBe(true);
      expect(mockWorkerRendererClient.initialize).toHaveBeenCalledWith(
        canvasElement,
        expect.objectContaining({
          nativeWidth: 320,
          nativeHeight: 240,
          targetWidth: 960,
          targetHeight: 720,
          scaleFactor: 3
        }),
        5000
      );
    });

    it('should register message handlers before initializing worker', async () => {
      const canvasElement = createOffscreenCanvasElementMock();

      await service.initialize(canvasElement);

      expect(mockWorkerRendererClient.onReady).toHaveBeenCalled();
    });

    it('should return false when GPU rendering not available', async () => {
      const { CapabilityDetector } = await import('@renderer/infrastructure/rendering/capability-detector.utils.ts');
      CapabilityDetector.isGPURenderingAvailable.mockReturnValueOnce(false);

      const canvasElement = createOffscreenCanvasElementMock();
      const result = await service.initialize(canvasElement);

      expect(result).toBe(false);
      expect(service._isUsingFallback).toBe(true);
    });

    it('should return false when worker client initialization fails', async () => {
      mockWorkerRendererClient.initialize.mockResolvedValueOnce(false);

      const canvasElement = createOffscreenCanvasElementMock();
      const result = await service.initialize(canvasElement);

      expect(result).toBe(false);
      expect(service._isUsingFallback).toBe(true);
    });

    it('should handle initialization error gracefully', async () => {
      mockWorkerRendererClient.initialize.mockRejectedValueOnce(new Error('Worker timeout'));

      const canvasElement = createOffscreenCanvasElementMock();
      const result = await service.initialize(canvasElement);

      expect(result).toBe(false);
      expect(service._isUsingFallback).toBe(true);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should subscribe to brightness changes', async () => {
      const canvasElement = createOffscreenCanvasElementMock();
      await service.initialize(canvasElement);

      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.SETTINGS.BRIGHTNESS_CHANGED,
        expect.any(Function)
      );
    });

    it('should publish capability detection event', async () => {
      const canvasElement = createOffscreenCanvasElementMock();
      await service.initialize(canvasElement);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.RENDER.CAPABILITY_DETECTED,
        expect.any(Object)
      );
    });
  });

  describe('renderFrame', () => {
    it('should skip when worker not ready', async () => {
      mockWorkerRendererClient.isReady.mockReturnValue(false);

      const videoElement = createMockVideo();
      await service.renderFrame(videoElement);

      expect(mockWorkerRendererClient.renderFrame).not.toHaveBeenCalled();
    });

    it('should skip when too many pending frames', async () => {
      mockWorkerRendererClient.isReady.mockReturnValue(true);
      service._pendingFrames = 2;

      const videoElement = createMockVideo();
      await service.renderFrame(videoElement);

      expect(mockWorkerRendererClient.renderFrame).not.toHaveBeenCalled();
    });

    it('should skip when video not ready', async () => {
      mockWorkerRendererClient.isReady.mockReturnValue(true);

      const videoElement = createMockVideo({ readyState: 1 });
      await service.renderFrame(videoElement);

      expect(mockWorkerRendererClient.renderFrame).not.toHaveBeenCalled();
    });

    it('should send frame via worker client', async () => {
      mockWorkerRendererClient.isReady.mockReturnValue(true);
      const mockBitmap = createBitmapMock({ close: vi.fn() });
      createImageBitmapMock = installCreateImageBitmapMock({ imageBitmap: mockBitmap });

      service._currentPreset = { id: 'default' };
      service._currentPresetId = 'default';

      const videoElement = createMockVideo();
      await service.renderFrame(videoElement);

      expect(mockWorkerRendererClient.renderFrame).toHaveBeenCalledWith(
        mockBitmap,
        expect.objectContaining({ color: expect.any(Object) })
      );
      expect(service._pendingFrames).toBe(1);
    });

    it('should close frame bitmap when worker rejects the frame command', async () => {
      mockWorkerRendererClient.isReady.mockReturnValue(true);
      mockWorkerRendererClient.renderFrame.mockReturnValueOnce(false);
      const close = vi.fn();
      const mockBitmap = createBitmapMock({ close });
      createImageBitmapMock = installCreateImageBitmapMock({ imageBitmap: mockBitmap });

      service._currentPreset = { id: 'default' };
      service._currentPresetId = 'default';

      const videoElement = createMockVideo();
      await service.renderFrame(videoElement);

      expect(mockWorkerRendererClient.renderFrame).toHaveBeenCalledWith(
        mockBitmap,
        expect.objectContaining({ color: expect.any(Object) })
      );
      expect(service._pendingFrames).toBe(0);
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('should create frame bitmaps at the active native resolution', async () => {
      const mockBitmap = createBitmapMock({ close: vi.fn() });
      createImageBitmapMock = installCreateImageBitmapMock({ imageBitmap: mockBitmap });

      await service.initialize(
        createOffscreenCanvasElementMock({ clientWidth: 960, clientHeight: 720 }),
        { width: 320, height: 240 }
      );

      mockWorkerRendererClient.isReady.mockReturnValue(true);
      service._currentPreset = { id: 'default' };
      service._currentPresetId = 'default';

      const videoElement = createMockVideo();
      await service.renderFrame(videoElement);

      expect(createImageBitmapMock.createImageBitmap).toHaveBeenCalledWith(
        videoElement,
        expect.objectContaining({
          resizeWidth: 320,
          resizeHeight: 240,
          resizeQuality: 'pixelated'
        })
      );
    });

    it('should track backpressure when frames skipped', async () => {
      mockWorkerRendererClient.isReady.mockReturnValue(true);
      service._pendingFrames = 2;
      service._lastBackpressureLog = 0;

      vi.spyOn(performance, 'now').mockReturnValue(6000);

      const videoElement = createMockVideo();
      await service.renderFrame(videoElement);

      expect(service._skippedFrames).toBe(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('GPU backpressure'));
    });
  });

  describe('setPreset', () => {
    it('should update current preset', () => {
      mockWorkerRendererClient.isReady.mockReturnValue(true);

      service.setPreset('true-color');

      expect(service._currentPresetId).toBe('true-color');
      expect(mockWorkerRendererClient.setPreset).toHaveBeenCalledWith(
        'true-color',
        expect.objectContaining({ id: 'true-color' })
      );
    });

    it('should skip if preset already set', () => {
      service._currentPresetId = 'true-color';

      service.setPreset('true-color');

      expect(mockWorkerRendererClient.setPreset).not.toHaveBeenCalled();
    });

    it('should warn for unknown preset', async () => {
      service.setPreset('nonexistent');

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Unknown preset'));
    });

    it('should normalize unknown saved preset to renderer default during initialization', async () => {
      mockSettingsService.getStringSetting.mockReturnValueOnce('missing-preset');

      await service.initialize(createOffscreenCanvasElementMock());

      expect(service._currentPresetId).toBe(PRESET_POLICY.rendererDefaultId);
      expect(mockWorkerRendererClient.initialize).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ presetId: PRESET_POLICY.rendererDefaultId }),
        5000
      );
    });

    it('should not send command when worker not ready', () => {
      mockWorkerRendererClient.isReady.mockReturnValue(false);

      service.setPreset('true-color');

      expect(mockWorkerRendererClient.setPreset).not.toHaveBeenCalled();
    });
  });

  describe('resize', () => {
    it('should calculate scale factor and notify worker', () => {
      mockWorkerRendererClient.isReady.mockReturnValue(true);

      service.resize(640, 576);

      expect(service._scaleFactor).toBe(4);
      expect(service._targetWidth).toBe(640);
      expect(service._targetHeight).toBe(576);
      expect(mockWorkerRendererClient.resize).toHaveBeenCalledWith(640, 576, 4);
    });

    it('should calculate resize scale from active native resolution', () => {
      mockWorkerRendererClient.isReady.mockReturnValue(true);
      service._nativeResolution = { width: 320, height: 240 };

      service.resize(960, 720);

      expect(service._scaleFactor).toBe(3);
      expect(service._targetWidth).toBe(960);
      expect(service._targetHeight).toBe(720);
      expect(mockWorkerRendererClient.resize).toHaveBeenCalledWith(960, 720, 3);
    });

    it('should not send command when worker not ready', () => {
      mockWorkerRendererClient.isReady.mockReturnValue(false);

      service.resize(640, 576);

      expect(mockWorkerRendererClient.resize).not.toHaveBeenCalled();
    });

    it('should clamp scale factor to minimum of 1', () => {
      mockWorkerRendererClient.isReady.mockReturnValue(false);

      service.resize(100, 100);

      expect(service._scaleFactor).toBe(1);
    });
  });

  describe('captureFrame', () => {
    it('should throw when destroying', async () => {
      service._isDestroying = true;

      await expect(service.captureFrame()).rejects.toThrow('GPU renderer is shutting down');
    });

    it('should throw when worker not ready', async () => {
      mockWorkerRendererClient.isReady.mockReturnValue(false);

      await expect(service.captureFrame()).rejects.toThrow('GPU renderer not ready');
    });

    it('should throw when capture already in progress', async () => {
      mockWorkerRendererClient.isReady.mockReturnValue(true);
      service._pendingCaptureResolve = vi.fn();

      await expect(service.captureFrame()).rejects.toThrow('Capture already in progress');
    });

    it('should send REQUEST_CAPTURE via worker client', async () => {
      mockWorkerRendererClient.isReady.mockReturnValue(true);

      const capturePromise = service.captureFrame();

      expect(mockWorkerRendererClient.requestCapture).toHaveBeenCalled();
      expect(service._isWaitingForCapturedFrame).toBe(true);

      service._resolvePendingCapture({ close: vi.fn() }, null);
      await capturePromise;
    });

    it('should timeout after 1 second', async () => {
      mockWorkerRendererClient.isReady.mockReturnValue(true);

      const capturePromise = service.captureFrame();

      vi.advanceTimersByTime(1000);

      await expect(capturePromise).rejects.toThrow('Capture request timed out');
    });
  });

  describe('releaseGpuResources', () => {
    it('should delegate to worker client', () => {
      mockWorkerRendererClient.isReady.mockReturnValue(true);

      service.releaseGpuResources();

      expect(mockWorkerRendererClient.releaseResources).toHaveBeenCalled();
      expect(service._pendingFrames).toBe(0);
    });

    it('should skip when worker not ready', () => {
      mockWorkerRendererClient.isReady.mockReturnValue(false);

      service.releaseGpuResources();

      expect(mockWorkerRendererClient.releaseResources).not.toHaveBeenCalled();
    });

    it('should reset backpressure diagnostics', () => {
      mockWorkerRendererClient.isReady.mockReturnValue(true);
      service._skippedFrames = 10;
      service._lastBackpressureLog = 5000;

      service.releaseGpuResources();

      expect(service._skippedFrames).toBe(0);
      expect(service._lastBackpressureLog).toBe(0);
    });
  });

  describe('_cleanup', () => {
    it('should emit CANVAS_EXPIRED when canvas was transferred', () => {
      mockWorkerRendererClient.isCanvasTransferred.mockReturnValue(true);

      service._cleanup();

      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.RENDER.CANVAS_EXPIRED);
    });

    it('should NOT emit CANVAS_EXPIRED when canvas was not transferred', () => {
      mockWorkerRendererClient.isCanvasTransferred.mockReturnValue(false);

      service._cleanup();

      expect(mockEventBus.publish).not.toHaveBeenCalledWith(EventChannels.RENDER.CANVAS_EXPIRED);
    });

    it('should NOT emit CANVAS_EXPIRED when emitCanvasExpired is false', () => {
      mockWorkerRendererClient.isCanvasTransferred.mockReturnValue(true);

      service._cleanup(false);

      expect(mockEventBus.publish).not.toHaveBeenCalledWith(EventChannels.RENDER.CANVAS_EXPIRED);
    });

    it('should delegate termination to worker client', () => {
      service._cleanup();

      expect(mockWorkerRendererClient.terminate).toHaveBeenCalled();
    });

    it('should reject pending capture request on cleanup', () => {
      const rejectFn = vi.fn();
      service._pendingCaptureReject = rejectFn;
      service._pendingCaptureResolve = vi.fn();

      service._cleanup();

      expect(rejectFn).toHaveBeenCalledWith(expect.any(Error));
      expect(service._pendingCaptureReject).toBeNull();
      expect(service._pendingCaptureResolve).toBeNull();
    });

    it('should unregister message handlers', () => {
      const unsub1 = vi.fn();
      const unsub2 = vi.fn();
      service._messageUnsubscribers = [unsub1, unsub2];

      service._cleanup();

      expect(unsub1).toHaveBeenCalled();
      expect(unsub2).toHaveBeenCalled();
      expect(service._messageUnsubscribers).toEqual([]);
    });

    it('should reset pending frames and backpressure', () => {
      service._pendingFrames = 5;
      service._skippedFrames = 10;
      service._lastBackpressureLog = 5000;

      service._cleanup();

      expect(service._pendingFrames).toBe(0);
      expect(service._skippedFrames).toBe(0);
      expect(service._lastBackpressureLog).toBe(0);
    });
  });

  describe('terminateAndReset', () => {
    it('should emit CANVAS_EXPIRED after cleanup', () => {
      mockWorkerRendererClient.isCanvasTransferred.mockReturnValue(true);

      service.terminateAndReset();

      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.RENDER.CANVAS_EXPIRED);
    });

    it('should do nothing if canvas not transferred', () => {
      mockWorkerRendererClient.isCanvasTransferred.mockReturnValue(false);

      service.terminateAndReset();

      expect(mockWorkerRendererClient.terminate).not.toHaveBeenCalled();
    });

    it('should suppress CANVAS_EXPIRED when emitCanvasExpired is false', () => {
      mockWorkerRendererClient.isCanvasTransferred.mockReturnValue(true);

      service.terminateAndReset(false);

      expect(mockEventBus.publish).not.toHaveBeenCalledWith(EventChannels.RENDER.CANVAS_EXPIRED);
    });
  });

  describe('cleanup (public)', () => {
    it('should unsubscribe from brightness events', async () => {
      const canvasElement = createOffscreenCanvasElementMock();
      await service.initialize(canvasElement);

      const returnedUnsubscribe = mockEventBus.subscribe.mock.results.find(
        (r) => r.value && typeof r.value === 'function'
      )?.value;

      service.cleanup();

      expect(returnedUnsubscribe).toHaveBeenCalled();
    });
  });

  describe('isActive', () => {
    it('should return true when worker ready and not using fallback', () => {
      mockWorkerRendererClient.isReady.mockReturnValue(true);
      service._isUsingFallback = false;

      expect(service.isActive()).toBe(true);
    });

    it('should return false when using fallback', () => {
      mockWorkerRendererClient.isReady.mockReturnValue(true);
      service._isUsingFallback = true;

      expect(service.isActive()).toBe(false);
    });

    it('should return false when worker not ready', () => {
      mockWorkerRendererClient.isReady.mockReturnValue(false);

      expect(service.isActive()).toBe(false);
    });
  });

  describe('isCanvasTransferred', () => {
    it('should delegate to worker client', () => {
      mockWorkerRendererClient.isCanvasTransferred.mockReturnValue(true);
      expect(service.isCanvasTransferred()).toBe(true);

      mockWorkerRendererClient.isCanvasTransferred.mockReturnValue(false);
      expect(service.isCanvasTransferred()).toBe(false);
    });
  });

  describe('getTargetDimensions', () => {
    it('should return current target dimensions', () => {
      service._targetWidth = 640;
      service._targetHeight = 576;

      expect(service.getTargetDimensions()).toEqual({ width: 640, height: 576 });
    });
  });

  describe('_getCachedUniforms', () => {
    it('should return cached uniforms when nothing changed', () => {
      const uniforms = { test: true };
      service._cachedUniforms = uniforms;
      service._cachedPresetId = 'default';
      service._currentPresetId = 'default';
      service._cachedNativeWidth = 160;
      service._cachedNativeHeight = 144;
      service._nativeResolution = { width: 160, height: 144 };
      service._cachedScaleFactor = 4;
      service._scaleFactor = 4;
      service._cachedTargetWidth = 640;
      service._targetWidth = 640;
      service._cachedTargetHeight = 576;
      service._targetHeight = 576;
      service._cachedBrightness = 1.0;
      service._globalBrightness = 1.0;

      expect(service._getCachedUniforms()).toBe(uniforms);
    });

    it('should rebuild uniforms when preset changes', () => {
      service._cachedUniforms = { old: true };
      service._cachedPresetId = 'old';
      service._currentPresetId = 'new';
      service._currentPreset = { id: 'new' };

      const result = service._getCachedUniforms();

      expect(result).not.toEqual({ old: true });
      expect(service._cachedPresetId).toBe('new');
    });

    it('should rebuild uniforms with the active native resolution', () => {
      service._nativeResolution = { width: 320, height: 240 };
      service._targetWidth = 960;
      service._targetHeight = 720;
      service._scaleFactor = 3;
      service._currentPresetId = 'default';
      service._currentPreset = { id: 'default' };

      service._getCachedUniforms();

      expect(buildUniforms).toHaveBeenCalledWith(expect.objectContaining({
        nativeWidth: 320,
        nativeHeight: 240,
        outputWidth: 960,
        outputHeight: 720
      }));
      expect(service._cachedNativeWidth).toBe(320);
      expect(service._cachedNativeHeight).toBe(240);
    });
  });

  describe('_registerMessageHandlers', () => {
    it('should register handlers for all response types', async () => {
      const canvasElement = createOffscreenCanvasElementMock();
      await service.initialize(canvasElement);

      expect(mockWorkerRendererClient.onReady).toHaveBeenCalledWith(expect.any(Function));
      expect(mockWorkerRendererClient.onFrameRendered).toHaveBeenCalledWith(expect.any(Function));
      expect(mockWorkerRendererClient.onStats).toHaveBeenCalledWith(expect.any(Function));
      expect(mockWorkerRendererClient.onError).toHaveBeenCalledWith(expect.any(Function));
      expect(mockWorkerRendererClient.onCaptureRequested).toHaveBeenCalledWith(expect.any(Function));
      expect(mockWorkerRendererClient.onCaptureReady).toHaveBeenCalledWith(expect.any(Function));
      expect(mockWorkerRendererClient.onReleased).toHaveBeenCalledWith(expect.any(Function));
      expect(mockWorkerRendererClient.onDestroyed).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('canvas recovery scenario', () => {
    it('should allow orchestrator to recreate canvas after init failure', async () => {
      mockWorkerRendererClient.isCanvasTransferred.mockReturnValue(true);

      service._cleanup();

      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.RENDER.CANVAS_EXPIRED);
      expect(mockWorkerRendererClient.terminate).toHaveBeenCalled();
    });
  });
});
