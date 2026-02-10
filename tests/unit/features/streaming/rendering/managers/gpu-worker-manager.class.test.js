import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GpuWorkerManager } from '@renderer/infrastructure/services/streaming/gpu-worker-manager.ts';
import { WorkerMessageType } from '@renderer/infrastructure/rendering/workers/worker-protocol.config.ts';

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
  createWorkerMessage: vi.fn((type, payload) => ({ type, payload, timestamp: 0 }))
}));

describe('GpuWorkerManager', () => {
  let manager;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;
  let mockWorker;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };
    mockLoggerFactory = {
      create: vi.fn(() => mockLogger)
    };
    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn(() => vi.fn())
    };

    // Mock Worker constructor
    mockWorker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      onmessage: null,
      onerror: null
    };
    global.Worker = vi.fn(function Worker() {
      return mockWorker;
    });
  });

  afterEach(() => {
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
      const mockCanvas = {
        transferControlToOffscreen: vi.fn().mockReturnValue({ id: 'offscreen' }),
        clientWidth: 640,
        clientHeight: 576
      };
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
      expect(global.Worker).toHaveBeenCalled();
      expect(mockWorker.postMessage).toHaveBeenCalled();
      expect(manager.isReady()).toBe(true);
    });

    it('should reject if worker fails to initialize', async () => {
      vi.useFakeTimers();

      const mockCanvas = {
        transferControlToOffscreen: vi.fn().mockReturnValue({ id: 'offscreen' }),
        clientWidth: 640,
        clientHeight: 576
      };
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
      const mockCanvas = {
        transferControlToOffscreen: vi.fn().mockReturnValue({ id: 'offscreen' }),
        clientWidth: 640,
        clientHeight: 576
      };
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
      const mockCanvas = {
        transferControlToOffscreen: vi.fn().mockReturnValue({ id: 'offscreen' }),
        clientWidth: 640,
        clientHeight: 576
      };

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

      const mockCanvas = {
        transferControlToOffscreen: vi.fn().mockReturnValue({ id: 'offscreen' })
      };

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
      const bitmap = { id: 'bitmap' };

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

      const mockCanvas = {
        transferControlToOffscreen: vi.fn().mockReturnValue({ id: 'offscreen' })
      };

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

      const mockCanvas = {
        transferControlToOffscreen: vi.fn().mockReturnValue({ id: 'offscreen' })
      };

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

  describe('re-init after release (characterization)', () => {
    let mockCanvas;

    beforeEach(async () => {
      manager = new GpuWorkerManager({
        loggerFactory: mockLoggerFactory,
        eventBus: mockEventBus
      });

      mockCanvas = {
        transferControlToOffscreen: vi.fn().mockReturnValue({ id: 'offscreen' }),
        clientWidth: 640,
        clientHeight: 576
      };

      setTimeout(() => {
        mockWorker.onmessage({
          data: { type: 'ready', payload: { api: 'webgl2' } }
        });
      }, 10);

      await manager.initialize(mockCanvas, { api: 'webgl2', presetId: 'default' });
    });

    it('should reinit without canvas transfer after release', async () => {
      manager.releaseResources();
      expect(manager.isReady()).toBe(false);
      expect(manager.isCanvasTransferred()).toBe(true);

      mockWorker.postMessage.mockClear();

      setTimeout(() => {
        mockWorker.onmessage({
          data: { type: 'ready', payload: { api: 'webgl2' } }
        });
      }, 10);

      await manager.initialize(mockCanvas, { api: 'webgl2', presetId: 'default' });

      expect(manager.isReady()).toBe(true);
      expect(mockCanvas.transferControlToOffscreen).toHaveBeenCalledTimes(1);

      const initMessage = mockWorker.postMessage.mock.calls[0][0];
      expect(initMessage.type).toBe('init');
      expect(initMessage.payload.canvas).toBeUndefined();
      expect(initMessage.payload.config).toBeDefined();
    });

    it('should not create new Worker instance on reinit', async () => {
      manager.releaseResources();

      const workerCallsBefore = global.Worker.mock.calls.length;

      setTimeout(() => {
        mockWorker.onmessage({
          data: { type: 'ready', payload: { api: 'webgl2' } }
        });
      }, 10);

      await manager.initialize(mockCanvas, { api: 'webgl2' });

      expect(global.Worker.mock.calls.length).toBe(workerCallsBefore);
    });

    it('should send INIT with config-only payload on reinit', async () => {
      manager.releaseResources();
      mockWorker.postMessage.mockClear();

      setTimeout(() => {
        mockWorker.onmessage({
          data: { type: 'ready', payload: { api: 'webgl2' } }
        });
      }, 10);

      await manager.initialize(mockCanvas, { api: 'webgl2', presetId: 'vibrant' });

      const reinitMsg = mockWorker.postMessage.mock.calls[0][0];
      expect(reinitMsg.type).toBe('init');
      expect(reinitMsg.payload).toEqual({
        config: { api: 'webgl2', presetId: 'vibrant' }
      });
    });

    it('should preserve canvas transferred flag across release/reinit cycle', async () => {
      expect(manager.isCanvasTransferred()).toBe(true);

      manager.releaseResources();
      expect(manager.isCanvasTransferred()).toBe(true);

      setTimeout(() => {
        mockWorker.onmessage({
          data: { type: 'ready', payload: { api: 'webgl2' } }
        });
      }, 10);

      await manager.initialize(mockCanvas, { api: 'webgl2' });
      expect(manager.isCanvasTransferred()).toBe(true);
    });
  });

  describe('terminate', () => {
    beforeEach(async () => {
      manager = new GpuWorkerManager({
        loggerFactory: mockLoggerFactory,
        eventBus: mockEventBus
      });

      const mockCanvas = {
        transferControlToOffscreen: vi.fn().mockReturnValue({ id: 'offscreen' })
      };

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
