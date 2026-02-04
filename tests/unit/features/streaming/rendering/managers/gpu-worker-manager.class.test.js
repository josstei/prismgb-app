import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GpuWorkerManager } from '@renderer/features/streaming/rendering/gpu/managers/gpu-worker-manager.class.js';

// Mock worker protocol
vi.mock('@renderer/features/streaming/rendering/workers/streaming-worker-protocol.config.js', () => ({
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
    global.Worker = vi.fn().mockImplementation(() => mockWorker);
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
});
