/**
 * StreamingGpuRendererService Unit Tests
 *
 * Tests for canvas recovery and cleanup behavior
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StreamingGpuRendererService } from '@renderer/infrastructure/services/streaming/gpu-renderer.service.ts';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';

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
    CAPTURE: 'CAPTURE',
    RELEASE: 'RELEASE',
    DESTROY: 'DESTROY'
  },
  WorkerResponseType: {
    READY: 'READY',
    FRAME_RENDERED: 'FRAME_RENDERED',
    STATS: 'STATS',
    ERROR: 'ERROR',
    CAPTURE_READY: 'CAPTURE_READY',
    RELEASED: 'RELEASED',
    DESTROYED: 'DESTROYED'
  },
  createWorkerMessage: vi.fn((type, payload) => ({ type, payload }))
}));

// Mock render presets
vi.mock('@renderer/infrastructure/rendering/presets/render-presets.config.ts', () => ({
  DEFAULT_PRESET_ID: 'default',
  getPresetById: vi.fn(() => ({ id: 'default', name: 'Default' })),
  buildUniformsFromPreset: vi.fn(() => ({
    color: { brightness: 1.0 }
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

  beforeEach(() => {
    vi.useFakeTimers();

    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn(() => vi.fn())
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockLoggerFactory = {
      create: vi.fn(() => mockLogger)
    };

    mockSettingsService = {
      getGlobalBrightness: vi.fn(() => 1.0),
      getRenderPreset: vi.fn(() => 'default')
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

    // Mock Worker constructor
    global.Worker = vi.fn().mockImplementation(() => ({
      postMessage: vi.fn(),
      terminate: vi.fn(),
      onmessage: null,
      onerror: null
    }));

    service = new StreamingGpuRendererService({
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory,
      settingsService: mockSettingsService,
      gpuFrameBuffer: mockGpuFrameBuffer,
      gpuWorkerManager: mockGpuWorkerManager
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(service._worker).toBeNull();
      expect(service._isReady).toBe(false);
      expect(service._wasCanvasTransferred).toBe(false);
      expect(service._isUsingFallback).toBe(false);
    });

    it('should store manager references', () => {
      expect(service._frameBuffer).toBe(mockGpuFrameBuffer);
      expect(service._workerManager).toBe(mockGpuWorkerManager);
    });
  });

  describe('_cleanup', () => {
    it('should emit CANVAS_EXPIRED when canvas was transferred', () => {
      // Simulate canvas was transferred
      service._wasCanvasTransferred = true;
      service._worker = {
        postMessage: vi.fn(),
        terminate: vi.fn()
      };

      service._cleanup();

      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.RENDER.CANVAS_EXPIRED);
      expect(service._wasCanvasTransferred).toBe(false);
    });

    it('should NOT emit CANVAS_EXPIRED when canvas was not transferred', () => {
      service._wasCanvasTransferred = false;
      service._worker = null;

      service._cleanup();

      expect(mockEventBus.publish).not.toHaveBeenCalledWith(EventChannels.RENDER.CANVAS_EXPIRED);
    });

    it('should NOT emit CANVAS_EXPIRED when emitCanvasExpired is false', () => {
      service._wasCanvasTransferred = true;
      service._worker = {
        postMessage: vi.fn(),
        terminate: vi.fn()
      };

      service._cleanup(false);

      expect(mockEventBus.publish).not.toHaveBeenCalledWith(EventChannels.RENDER.CANVAS_EXPIRED);
      // Note: _wasCanvasTransferred is NOT reset when emitCanvasExpired is false
      expect(service._wasCanvasTransferred).toBe(true);
    });

    it('should terminate worker and clear references', () => {
      const mockWorker = {
        postMessage: vi.fn(),
        terminate: vi.fn()
      };
      service._worker = mockWorker;
      service._isReady = true;
      service._pendingFrames = 5;
      service._canvas = { id: 'canvas' };
      service._offscreenCanvas = { id: 'offscreen' };

      service._cleanup();

      expect(mockWorker.postMessage).toHaveBeenCalled();
      expect(mockWorker.terminate).toHaveBeenCalled();
      expect(service._worker).toBeNull();
      expect(service._isReady).toBe(false);
      expect(service._pendingFrames).toBe(0);
      expect(service._canvas).toBeNull();
      expect(service._offscreenCanvas).toBeNull();
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
  });

  describe('terminateAndReset', () => {
    it('should emit CANVAS_EXPIRED after cleanup', () => {
      service._wasCanvasTransferred = true;
      service._worker = {
        postMessage: vi.fn(),
        terminate: vi.fn()
      };

      service.terminateAndReset();

      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.RENDER.CANVAS_EXPIRED);
      expect(service._wasCanvasTransferred).toBe(false);
    });

    it('should do nothing if no worker and canvas not transferred', () => {
      service._worker = null;
      service._wasCanvasTransferred = false;

      service.terminateAndReset();

      expect(mockEventBus.publish).not.toHaveBeenCalled();
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

    it('should clear ready timeout if pending', () => {
      vi.useFakeTimers();
      service._readyTimeoutId = setTimeout(() => {}, 5000);
      const timeoutId = service._readyTimeoutId;

      service.cleanup();

      expect(service._readyTimeoutId).toBeNull();
      vi.useRealTimers();
    });

    it('should clear ready promise resolvers', () => {
      service._readyResolve = vi.fn();
      service._readyReject = vi.fn();

      service.cleanup();

      expect(service._readyResolve).toBeNull();
      expect(service._readyReject).toBeNull();
    });
  });

  describe('isCanvasTransferred', () => {
    it('should return current canvas transfer state', () => {
      service._wasCanvasTransferred = false;
      expect(service.isCanvasTransferred()).toBe(false);

      service._wasCanvasTransferred = true;
      expect(service.isCanvasTransferred()).toBe(true);
    });
  });

  describe('canvas recovery scenario', () => {
    it('should allow orchestrator to recreate canvas after init failure', async () => {
      // This test verifies the full recovery flow:
      // 1. Canvas gets transferred
      // 2. Init fails (worker timeout, etc.)
      // 3. _cleanup() emits CANVAS_EXPIRED
      // 4. Orchestrator can now recreate canvas and try again

      // Simulate successful canvas transfer
      service._wasCanvasTransferred = true;
      service._worker = {
        postMessage: vi.fn(),
        terminate: vi.fn()
      };

      // Simulate init failure triggering cleanup
      service._cleanup();

      // Verify CANVAS_EXPIRED was emitted
      expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.RENDER.CANVAS_EXPIRED);

      // Verify service state is reset for fresh init
      expect(service._wasCanvasTransferred).toBe(false);
      expect(service._worker).toBeNull();
      expect(service._canvas).toBeNull();

      // Now a fresh canvas can be passed to initialize()
      // The orchestrator listens for CANVAS_EXPIRED and creates a new canvas element
    });
  });
});
