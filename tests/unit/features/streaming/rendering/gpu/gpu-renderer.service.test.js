/**
 * StreamingGpuRendererService Unit Tests
 *
 * Tests for canvas recovery, cleanup behavior, initialization,
 * frame rendering, preset management, capture, and resize.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StreamingGpuRendererService } from '@renderer/infrastructure/services/streaming/gpu-renderer.service.ts';
import { EventChannels } from '@shared/events/event-channels.js';
import { buildUniforms } from '@prismgb/gpu';
import { createEventBus } from '../../../../../factories/event-bus.factory.js';
import { createLoggerFactory } from '../../../../../factories/logger.factory.js';
import { installCreateImageBitmapMock } from '../../../../../support/mocks/browser-api.installers.js';

// Mock the capability detector
vi.mock('@renderer/infrastructure/rendering/capability-detector.utils.ts', () => ({
  CapabilityDetector: {
    detect: vi.fn().mockResolvedValue({
      preferredAPI: 'webgl2',
      webgpu: false,
      webgl2: true,
      offscreenCanvas: true,
      worker: true
    }),
    describeCapabilities: vi.fn(() => 'WebGL2 available'),
    isGPURenderingAvailable: vi.fn(() => true),
    isWorkerRenderingAvailable: vi.fn(() => true)
  }
}));

// Mock worker protocol
vi.mock('@renderer/infrastructure/rendering/workers/worker-protocol.config.ts', () => ({
  WorkerMessageType: {
    INIT: 'INIT',
    FRAME: 'FRAME',
    RESIZE: 'RESIZE',
    SET_PRESET: 'SET_PRESET',
    REQUEST_CAPTURE: 'REQUEST_CAPTURE',
    CAPTURE: 'CAPTURE',
    RELEASE: 'RELEASE',
    DESTROY: 'DESTROY'
  },
  WorkerResponseType: {
    READY: 'READY',
    FRAME_RENDERED: 'FRAME_RENDERED',
    STATS: 'STATS',
    ERROR: 'ERROR',
    CAPTURE_REQUESTED: 'CAPTURE_REQUESTED',
    CAPTURE_READY: 'CAPTURE_READY',
    RELEASED: 'RELEASED',
    DESTROYED: 'DESTROYED'
  },
  createWorkerMessage: vi.fn((type, payload) => ({ type, payload }))
}));

// Mock render presets
vi.mock('@prismgb/gpu', () => ({
  PresetRegistry: {
    get: vi.fn(() => ({ id: 'default', name: 'Default', description: 'Test', color: { enabled: true, brightness: 1.0 }, unsharp: { enabled: true }, crt: { enabled: false } })),
    getDefault: vi.fn(() => ({ id: 'vibrant', name: 'Vibrant', description: 'Test', color: { enabled: true, brightness: 1.0 }, unsharp: { enabled: true }, crt: { enabled: false } })),
  },
  buildUniforms: vi.fn(() => ({
    upscale: { inputSize: [160, 144], outputSize: [640, 576], scaleFactor: 4 },
    unsharp: { enabled: true, strength: 0.5, texelSize: [1/640, 1/576], scaleFactor: 4 },
    color: { enabled: true, gamma: 0.9, saturation: 1.0, greenBias: 0.02, brightness: 1.0, contrast: 1.0 },
    crt: { enabled: false, resolution: [640, 576], scaleFactor: 4, scanlineStrength: 0, pixelMaskStrength: 0, bloomStrength: 0, curvature: 0, vignetteStrength: 0 }
  }))
}));

describe('StreamingGpuRendererService', () => {
  let service;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;
  let mockSettingsService;
  let mockGpuFrameBuffer;
  let mockGpuWorkerManager;
  let createImageBitmapMock;

  beforeEach(() => {
    vi.useFakeTimers();

    mockEventBus = createEventBus();
    mockLoggerFactory = createLoggerFactory();

    mockSettingsService = {
      getNumberSetting: vi.fn(() => 1.0),
      getStringSetting: vi.fn(() => 'default')
    };

    mockGpuFrameBuffer = {
      enqueue: vi.fn(() => true),
      dequeue: vi.fn(() => null),
      isFull: vi.fn(() => false),
      flush: vi.fn(),
      getMetrics: vi.fn(() => ({ queued: 0, dropped: 0, avgLatency: 0 })),
      resetMetrics: vi.fn(),
      getCapacity: vi.fn(() => 3),
      getSize: vi.fn(() => 0)
    };

    mockGpuWorkerManager = {
      isReady: vi.fn(() => false),
      isCanvasTransferred: vi.fn(() => false),
      getCapabilities: vi.fn(() => null),
      initialize: vi.fn().mockResolvedValue(true),
      sendCommand: vi.fn(),
      onMessage: vi.fn(() => vi.fn()),
      releaseResources: vi.fn(),
      terminate: vi.fn()
    };

    service = new StreamingGpuRendererService({
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory,
      settingsService: mockSettingsService,
      gpuFrameBuffer: mockGpuFrameBuffer,
      gpuWorkerManager: mockGpuWorkerManager
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

    it('should store manager references', () => {
      expect(service._frameBuffer).toBe(mockGpuFrameBuffer);
      expect(service._workerManager).toBe(mockGpuWorkerManager);
    });
  });

  describe('initialize', () => {
    it('should delegate worker creation to GpuWorkerManager', async () => {
      const canvasElement = { clientWidth: 640, clientHeight: 576, transferControlToOffscreen: vi.fn() };

      const result = await service.initialize(canvasElement);

      expect(result).toBe(true);
      expect(mockGpuWorkerManager.initialize).toHaveBeenCalledWith(
        canvasElement,
        expect.objectContaining({
          nativeWidth: 160,
          nativeHeight: 144,
          api: 'webgl2'
        }),
        5000
      );
    });

    it('should derive worker sizing from provided native resolution', async () => {
      const canvasElement = { clientWidth: 960, clientHeight: 720, transferControlToOffscreen: vi.fn() };

      const result = await service.initialize(canvasElement, { width: 320, height: 240 });

      expect(result).toBe(true);
      expect(mockGpuWorkerManager.initialize).toHaveBeenCalledWith(
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
      const canvasElement = { clientWidth: 640, clientHeight: 576, transferControlToOffscreen: vi.fn() };

      await service.initialize(canvasElement);

      expect(mockGpuWorkerManager.onMessage).toHaveBeenCalled();
    });

    it('should return false when GPU rendering not available', async () => {
      const { CapabilityDetector } = await import('@renderer/infrastructure/rendering/capability-detector.utils.ts');
      CapabilityDetector.isGPURenderingAvailable.mockReturnValueOnce(false);

      const canvasElement = { clientWidth: 640, clientHeight: 576 };
      const result = await service.initialize(canvasElement);

      expect(result).toBe(false);
      expect(service._isUsingFallback).toBe(true);
    });

    it('should return false when worker manager initialization fails', async () => {
      mockGpuWorkerManager.initialize.mockResolvedValueOnce(false);

      const canvasElement = { clientWidth: 640, clientHeight: 576 };
      const result = await service.initialize(canvasElement);

      expect(result).toBe(false);
      expect(service._isUsingFallback).toBe(true);
    });

    it('should handle initialization error gracefully', async () => {
      mockGpuWorkerManager.initialize.mockRejectedValueOnce(new Error('Worker timeout'));

      const canvasElement = { clientWidth: 640, clientHeight: 576 };
      const result = await service.initialize(canvasElement);

      expect(result).toBe(false);
      expect(service._isUsingFallback).toBe(true);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should subscribe to brightness changes', async () => {
      const canvasElement = { clientWidth: 640, clientHeight: 576 };
      await service.initialize(canvasElement);

      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.SETTINGS.BRIGHTNESS_CHANGED,
        expect.any(Function)
      );
    });

    it('should publish capability detection event', async () => {
      const canvasElement = { clientWidth: 640, clientHeight: 576 };
      await service.initialize(canvasElement);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.RENDER.CAPABILITY_DETECTED,
        expect.any(Object)
      );
    });
  });

  describe('renderFrame', () => {
    it('should skip when worker not ready', async () => {
      mockGpuWorkerManager.isReady.mockReturnValue(false);

      const videoElement = { readyState: 4, HAVE_CURRENT_DATA: 2 };
      await service.renderFrame(videoElement);

      expect(mockGpuWorkerManager.sendCommand).not.toHaveBeenCalled();
    });

    it('should skip when too many pending frames', async () => {
      mockGpuWorkerManager.isReady.mockReturnValue(true);
      service._pendingFrames = 2;

      const videoElement = { readyState: 4, HAVE_CURRENT_DATA: 2 };
      await service.renderFrame(videoElement);

      expect(mockGpuWorkerManager.sendCommand).not.toHaveBeenCalled();
    });

    it('should skip when video not ready', async () => {
      mockGpuWorkerManager.isReady.mockReturnValue(true);

      const videoElement = { readyState: 1, HAVE_CURRENT_DATA: 2 };
      await service.renderFrame(videoElement);

      expect(mockGpuWorkerManager.sendCommand).not.toHaveBeenCalled();
    });

    it('should send frame via worker manager', async () => {
      mockGpuWorkerManager.isReady.mockReturnValue(true);
      const mockBitmap = { close: vi.fn() };
      createImageBitmapMock = installCreateImageBitmapMock({ imageBitmap: mockBitmap });

      service._currentPreset = { id: 'default' };
      service._currentPresetId = 'default';

      const videoElement = { readyState: 4, HAVE_CURRENT_DATA: 2 };
      await service.renderFrame(videoElement);

      expect(mockGpuWorkerManager.sendCommand).toHaveBeenCalledWith(
        'FRAME',
        expect.objectContaining({ imageBitmap: mockBitmap }),
        [mockBitmap]
      );
      expect(service._pendingFrames).toBe(1);
    });

    it('should create frame bitmaps at the active native resolution', async () => {
      const mockBitmap = { close: vi.fn() };
      createImageBitmapMock = installCreateImageBitmapMock({ imageBitmap: mockBitmap });

      await service.initialize(
        { clientWidth: 960, clientHeight: 720, transferControlToOffscreen: vi.fn() },
        { width: 320, height: 240 }
      );

      mockGpuWorkerManager.isReady.mockReturnValue(true);
      service._currentPreset = { id: 'default' };
      service._currentPresetId = 'default';

      const videoElement = { readyState: 4, HAVE_CURRENT_DATA: 2 };
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
      mockGpuWorkerManager.isReady.mockReturnValue(true);
      service._pendingFrames = 2;
      service._lastBackpressureLog = 0;

      vi.spyOn(performance, 'now').mockReturnValue(6000);

      const videoElement = { readyState: 4, HAVE_CURRENT_DATA: 2 };
      await service.renderFrame(videoElement);

      expect(service._skippedFrames).toBe(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('GPU backpressure'));
    });
  });

  describe('setPreset', () => {
    it('should update current preset', () => {
      mockGpuWorkerManager.isReady.mockReturnValue(true);

      service.setPreset('default');

      expect(service._currentPresetId).toBe('default');
      expect(mockGpuWorkerManager.sendCommand).toHaveBeenCalledWith(
        'SET_PRESET',
        expect.objectContaining({ presetId: 'default' })
      );
    });

    it('should skip if preset already set', () => {
      service._currentPresetId = 'default';

      service.setPreset('default');

      expect(mockGpuWorkerManager.sendCommand).not.toHaveBeenCalled();
    });

    it('should warn for unknown preset', async () => {
      const { PresetRegistry } = await import('@prismgb/gpu');
      PresetRegistry.get.mockReturnValueOnce(null);

      service.setPreset('nonexistent');

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Unknown preset'));
    });

    it('should not send command when worker not ready', () => {
      mockGpuWorkerManager.isReady.mockReturnValue(false);

      service.setPreset('default');

      expect(mockGpuWorkerManager.sendCommand).not.toHaveBeenCalled();
    });
  });

  describe('resize', () => {
    it('should calculate scale factor and notify worker', () => {
      mockGpuWorkerManager.isReady.mockReturnValue(true);

      service.resize(640, 576);

      expect(service._scaleFactor).toBe(4);
      expect(service._targetWidth).toBe(640);
      expect(service._targetHeight).toBe(576);
      expect(mockGpuWorkerManager.sendCommand).toHaveBeenCalledWith(
        'RESIZE',
        expect.objectContaining({
          width: 640,
          height: 576,
          scaleFactor: 4
        })
      );
    });

    it('should calculate resize scale from active native resolution', () => {
      mockGpuWorkerManager.isReady.mockReturnValue(true);
      service._nativeResolution = { width: 320, height: 240 };

      service.resize(960, 720);

      expect(service._scaleFactor).toBe(3);
      expect(service._targetWidth).toBe(960);
      expect(service._targetHeight).toBe(720);
      expect(mockGpuWorkerManager.sendCommand).toHaveBeenCalledWith(
        'RESIZE',
        expect.objectContaining({
          width: 960,
          height: 720,
          scaleFactor: 3
        })
      );
    });

    it('should not send command when worker not ready', () => {
      mockGpuWorkerManager.isReady.mockReturnValue(false);

      service.resize(640, 576);

      expect(mockGpuWorkerManager.sendCommand).not.toHaveBeenCalled();
    });

    it('should clamp scale factor to minimum of 1', () => {
      mockGpuWorkerManager.isReady.mockReturnValue(false);

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
      mockGpuWorkerManager.isReady.mockReturnValue(false);

      await expect(service.captureFrame()).rejects.toThrow('GPU renderer not ready');
    });

    it('should throw when capture already in progress', async () => {
      mockGpuWorkerManager.isReady.mockReturnValue(true);
      service._pendingCaptureResolve = vi.fn();

      await expect(service.captureFrame()).rejects.toThrow('Capture already in progress');
    });

    it('should send REQUEST_CAPTURE via worker manager', async () => {
      mockGpuWorkerManager.isReady.mockReturnValue(true);

      const capturePromise = service.captureFrame();

      expect(mockGpuWorkerManager.sendCommand).toHaveBeenCalledWith('REQUEST_CAPTURE');
      expect(service._isWaitingForCapturedFrame).toBe(true);

      service._resolvePendingCapture({ close: vi.fn() }, null);
      await capturePromise;
    });

    it('should timeout after 1 second', async () => {
      mockGpuWorkerManager.isReady.mockReturnValue(true);

      const capturePromise = service.captureFrame();

      vi.advanceTimersByTime(1000);

      await expect(capturePromise).rejects.toThrow('Capture request timed out');
    });
  });

  describe('releaseGpuResources', () => {
    it('should delegate to worker manager', () => {
      mockGpuWorkerManager.isReady.mockReturnValue(true);

      service.releaseGpuResources();

      expect(mockGpuWorkerManager.releaseResources).toHaveBeenCalled();
      expect(service._pendingFrames).toBe(0);
    });

    it('should skip when worker not ready', () => {
      mockGpuWorkerManager.isReady.mockReturnValue(false);

      service.releaseGpuResources();

      expect(mockGpuWorkerManager.releaseResources).not.toHaveBeenCalled();
    });

    it('should reset backpressure diagnostics', () => {
      mockGpuWorkerManager.isReady.mockReturnValue(true);
      service._skippedFrames = 10;
      service._lastBackpressureLog = 5000;

      service.releaseGpuResources();

      expect(service._skippedFrames).toBe(0);
      expect(service._lastBackpressureLog).toBe(0);
    });
  });

  describe('_cleanup', () => {
    it('should emit CANVAS_EXPIRED when canvas was transferred', () => {
      mockGpuWorkerManager.isCanvasTransferred.mockReturnValue(true);

      service._cleanup();

      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.RENDER.CANVAS_EXPIRED);
    });

    it('should NOT emit CANVAS_EXPIRED when canvas was not transferred', () => {
      mockGpuWorkerManager.isCanvasTransferred.mockReturnValue(false);

      service._cleanup();

      expect(mockEventBus.publish).not.toHaveBeenCalledWith(EventChannels.RENDER.CANVAS_EXPIRED);
    });

    it('should NOT emit CANVAS_EXPIRED when emitCanvasExpired is false', () => {
      mockGpuWorkerManager.isCanvasTransferred.mockReturnValue(true);

      service._cleanup(false);

      expect(mockEventBus.publish).not.toHaveBeenCalledWith(EventChannels.RENDER.CANVAS_EXPIRED);
    });

    it('should delegate termination to worker manager', () => {
      service._cleanup();

      expect(mockGpuWorkerManager.terminate).toHaveBeenCalled();
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
      mockGpuWorkerManager.isCanvasTransferred.mockReturnValue(true);

      service.terminateAndReset();

      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.RENDER.CANVAS_EXPIRED);
    });

    it('should do nothing if canvas not transferred', () => {
      mockGpuWorkerManager.isCanvasTransferred.mockReturnValue(false);

      service.terminateAndReset();

      expect(mockGpuWorkerManager.terminate).not.toHaveBeenCalled();
    });

    it('should suppress CANVAS_EXPIRED when emitCanvasExpired is false', () => {
      mockGpuWorkerManager.isCanvasTransferred.mockReturnValue(true);

      service.terminateAndReset(false);

      expect(mockEventBus.publish).not.toHaveBeenCalledWith(EventChannels.RENDER.CANVAS_EXPIRED);
    });
  });

  describe('cleanup (public)', () => {
    it('should unsubscribe from brightness events', () => {
      const unsubscribeFn = vi.fn();
      service._brightnessUnsubscribe = unsubscribeFn;

      service.cleanup();

      expect(unsubscribeFn).toHaveBeenCalled();
      expect(service._brightnessUnsubscribe).toBeNull();
    });
  });

  describe('isActive', () => {
    it('should return true when worker ready and not using fallback', () => {
      mockGpuWorkerManager.isReady.mockReturnValue(true);
      service._isUsingFallback = false;

      expect(service.isActive()).toBe(true);
    });

    it('should return false when using fallback', () => {
      mockGpuWorkerManager.isReady.mockReturnValue(true);
      service._isUsingFallback = true;

      expect(service.isActive()).toBe(false);
    });

    it('should return false when worker not ready', () => {
      mockGpuWorkerManager.isReady.mockReturnValue(false);

      expect(service.isActive()).toBe(false);
    });
  });

  describe('isCanvasTransferred', () => {
    it('should delegate to worker manager', () => {
      mockGpuWorkerManager.isCanvasTransferred.mockReturnValue(true);
      expect(service.isCanvasTransferred()).toBe(true);

      mockGpuWorkerManager.isCanvasTransferred.mockReturnValue(false);
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
      const canvasElement = { clientWidth: 640, clientHeight: 576 };
      await service.initialize(canvasElement);

      expect(mockGpuWorkerManager.onMessage).toHaveBeenCalledWith('READY', expect.any(Function));
      expect(mockGpuWorkerManager.onMessage).toHaveBeenCalledWith('FRAME_RENDERED', expect.any(Function));
      expect(mockGpuWorkerManager.onMessage).toHaveBeenCalledWith('STATS', expect.any(Function));
      expect(mockGpuWorkerManager.onMessage).toHaveBeenCalledWith('ERROR', expect.any(Function));
      expect(mockGpuWorkerManager.onMessage).toHaveBeenCalledWith('CAPTURE_REQUESTED', expect.any(Function));
      expect(mockGpuWorkerManager.onMessage).toHaveBeenCalledWith('CAPTURE_READY', expect.any(Function));
      expect(mockGpuWorkerManager.onMessage).toHaveBeenCalledWith('RELEASED', expect.any(Function));
      expect(mockGpuWorkerManager.onMessage).toHaveBeenCalledWith('DESTROYED', expect.any(Function));
    });
  });

  describe('canvas recovery scenario', () => {
    it('should allow orchestrator to recreate canvas after init failure', async () => {
      mockGpuWorkerManager.isCanvasTransferred.mockReturnValue(true);

      service._cleanup();

      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.RENDER.CANVAS_EXPIRED);
      expect(mockGpuWorkerManager.terminate).toHaveBeenCalled();
    });
  });
});
