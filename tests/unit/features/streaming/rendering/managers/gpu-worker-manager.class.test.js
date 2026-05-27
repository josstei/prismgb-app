import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GpuWorkerManager } from '@renderer/infrastructure/services/streaming/gpu-worker-manager.ts';
import { WorkerMessageType } from '@renderer/infrastructure/rendering/workers/worker-protocol.config.ts';
import {
  createBitmapMock,
  createEventBus,
  createLoggerFactory,
  createMockCanvas,
  createWorkerInstanceMock
} from '../../../../../factories/index.js';
import { installWorkerMock } from '../../../../../support/mocks/browser-api.installers.js';

// Mock worker protocol
vi.mock('@renderer/infrastructure/rendering/workers/worker-protocol.config.ts', () => ({
  WorkerMessageType: {
    INIT: 'init',
    FRAME: 'frame',
    RESIZE: 'resize',
    SET_PRESET: 'setPreset',
    REQUEST_CAPTURE: 'requestCapture',
    CAPTURE: 'capture',
    RELEASE: 'release',
    DESTROY: 'destroy'
  },
  WorkerResponseType: {
    READY: 'ready',
    FRAME_RENDERED: 'frameRendered',
    STATS: 'stats',
    ERROR: 'error',
    CAPTURE_REQUESTED: 'captureRequested',
    CAPTURE_READY: 'captureReady',
    RELEASED: 'released',
    DESTROYED: 'destroyed'
  },
  createWorkerMessage: vi.fn((type, payload) => ({ type, payload, timestamp: 0 })),
  isValidWorkerResponse: vi.fn(() => true)
}));

describe('GpuWorkerManager', () => {
  let manager;
  let mockEventBus;
  let mockLoggerFactory;
  let mockWorker;
  let workerMock;

  function createMockWorkerCanvas() {
    const canvas = createMockCanvas({
      width: 640,
      height: 576
    });
    canvas.clientWidth = 640;
    canvas.clientHeight = 576;
    canvas.transferControlToOffscreen = vi.fn(() => ({ id: 'offscreen' }));
    return canvas;
  }

  beforeEach(() => {
    mockLoggerFactory = createLoggerFactory();
    mockEventBus = createEventBus();

    mockWorker = createWorkerInstanceMock();
    workerMock = installWorkerMock({ createWorker: () => mockWorker });
  });

  afterEach(() => {
    workerMock.cleanup();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create manager in uninitialized state', () => {
      manager = new GpuWorkerManager({
        loggerFactory: mockLoggerFactory,
        eventBus: mockEventBus
      });

      expect(manager.isReady()).toBe(false);
      expect(manager.getCapabilities()).toBeNull();
    });
  });

  describe('initialize', () => {
    beforeEach(() => {
      manager = new GpuWorkerManager({
        loggerFactory: mockLoggerFactory,
        eventBus: mockEventBus
      });
    });

    it('should create worker and transfer canvas', async () => {
      const mockCanvas = createMockWorkerCanvas();
      const config = {
        nativeWidth: 160,
        nativeHeight: 144,
        api: 'webgl2',
        presetId: 'default'
      };

      // Simulate worker ready response
      setTimeout(() => {
        mockWorker.onmessage({
          data: { type: 'ready', payload: { api: 'webgl2' } }
        });
      }, 10);

      await manager.initialize(mockCanvas, config);

      expect(mockCanvas.transferControlToOffscreen).toHaveBeenCalled();
      expect(workerMock.Worker).toHaveBeenCalled();
      expect(mockWorker.postMessage).toHaveBeenCalled();
      expect(manager.isReady()).toBe(true);
    });

    it('should reject if worker fails to initialize', async () => {
      vi.useFakeTimers();

      const mockCanvas = createMockWorkerCanvas();
      const config = {
        nativeWidth: 160,
        nativeHeight: 144,
        api: 'webgl2',
        presetId: 'default'
      };

      const initPromise = manager.initialize(mockCanvas, config, 100);

      // Advance timer past timeout
      vi.advanceTimersByTime(150);

      await expect(initPromise).rejects.toThrow('Worker initialization timed out');

      vi.useRealTimers();
    });

    it('should reuse existing worker if canvas already transferred', async () => {
      const mockCanvas = createMockWorkerCanvas();
      const config = {
        nativeWidth: 160,
        nativeHeight: 144,
        api: 'webgl2',
        presetId: 'default'
      };

      // First init
      setTimeout(() => {
        mockWorker.onmessage({
          data: { type: 'ready', payload: { api: 'webgl2' } }
        });
      }, 10);
      await manager.initialize(mockCanvas, config);

      // Second init with same canvas should reuse worker
      const result = await manager.initialize(mockCanvas, config);

      expect(result).toBe(true);
      expect(mockCanvas.transferControlToOffscreen).toHaveBeenCalledTimes(1);
    });
  });

  describe('isCanvasTransferred', () => {
    beforeEach(() => {
      manager = new GpuWorkerManager({
        loggerFactory: mockLoggerFactory,
        eventBus: mockEventBus
      });
    });

    it('should return false before initialization', () => {
      expect(manager.isCanvasTransferred()).toBe(false);
    });

    it('should return true after canvas transfer', async () => {
      const mockCanvas = createMockWorkerCanvas();

      setTimeout(() => {
        mockWorker.onmessage({
          data: { type: 'ready', payload: { api: 'webgl2' } }
        });
      }, 10);

      await manager.initialize(mockCanvas, { api: 'webgl2' });

      expect(manager.isCanvasTransferred()).toBe(true);
    });
  });

  describe('sendCommand', () => {
    beforeEach(async () => {
      manager = new GpuWorkerManager({
        loggerFactory: mockLoggerFactory,
        eventBus: mockEventBus
      });

      const mockCanvas = createMockWorkerCanvas();

      setTimeout(() => {
        mockWorker.onmessage({
          data: { type: 'ready', payload: { api: 'webgl2' } }
        });
      }, 10);

      await manager.initialize(mockCanvas, { api: 'webgl2' });
    });

    it('should send message to worker', () => {
      manager.sendCommand(WorkerMessageType.FRAME, { data: 'test' });

      expect(mockWorker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: WorkerMessageType.FRAME,
          payload: { data: 'test' }
        })
      );
    });

    it('should send message with transferables', () => {
      const bitmap = createBitmapMock({ id: 'bitmap' });

      manager.sendCommand(WorkerMessageType.FRAME, { imageBitmap: bitmap }, [bitmap]);

      expect(mockWorker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: WorkerMessageType.FRAME
        }),
        [bitmap]
      );
    });

    it('should throw if not ready', () => {
      manager._isReady = false;

      expect(() => {
        manager.sendCommand(WorkerMessageType.FRAME, {});
      }).toThrow('Worker not ready');
    });
  });

  describe('onMessage', () => {
    beforeEach(async () => {
      manager = new GpuWorkerManager({
        loggerFactory: mockLoggerFactory,
        eventBus: mockEventBus
      });

      const mockCanvas = createMockWorkerCanvas();

      setTimeout(() => {
        mockWorker.onmessage({
          data: { type: 'ready', payload: { api: 'webgl2' } }
        });
      }, 10);

      await manager.initialize(mockCanvas, { api: 'webgl2' });
    });

    it('should register handler for message type', () => {
      const handler = vi.fn();

      manager.onMessage('frameRendered', handler);

      // Simulate message from worker
      mockWorker.onmessage({
        data: { type: 'frameRendered', payload: { frameId: 1 } }
      });

      expect(handler).toHaveBeenCalledWith({ frameId: 1 });
    });

    it('should return unsubscribe function', () => {
      const handler = vi.fn();

      const unsubscribe = manager.onMessage('frameRendered', handler);
      unsubscribe();

      // Simulate message from worker
      mockWorker.onmessage({
        data: { type: 'frameRendered', payload: { frameId: 1 } }
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('releaseResources', () => {
    beforeEach(async () => {
      manager = new GpuWorkerManager({
        loggerFactory: mockLoggerFactory,
        eventBus: mockEventBus
      });

      const mockCanvas = createMockWorkerCanvas();

      setTimeout(() => {
        mockWorker.onmessage({
          data: { type: 'ready', payload: { api: 'webgl2' } }
        });
      }, 10);

      await manager.initialize(mockCanvas, { api: 'webgl2' });
    });

    it('should send release message and mark as not ready', () => {
      manager.releaseResources();

      expect(mockWorker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'release' })
      );
      expect(manager.isReady()).toBe(false);
    });

    it('should preserve worker for reinit', () => {
      manager.releaseResources();

      expect(mockWorker.terminate).not.toHaveBeenCalled();
    });
  });

  describe('terminate', () => {
    beforeEach(async () => {
      manager = new GpuWorkerManager({
        loggerFactory: mockLoggerFactory,
        eventBus: mockEventBus
      });

      const mockCanvas = createMockWorkerCanvas();

      setTimeout(() => {
        mockWorker.onmessage({
          data: { type: 'ready', payload: { api: 'webgl2' } }
        });
      }, 10);

      await manager.initialize(mockCanvas, { api: 'webgl2' });
    });

    it('should send destroy message and terminate worker', () => {
      manager.terminate();

      expect(mockWorker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'destroy' })
      );
      expect(mockWorker.terminate).toHaveBeenCalled();
    });

    it('should clear all state', () => {
      manager.terminate();

      expect(manager.isReady()).toBe(false);
      expect(manager.isCanvasTransferred()).toBe(false);
    });

    it('should clear message handlers', () => {
      manager.terminate();

      // Simulate message - should not throw or call handlers
      expect(() => {
        if (mockWorker.onmessage) {
          mockWorker.onmessage({ data: { type: 'test' } });
        }
      }).not.toThrow();
    });
  });
});
