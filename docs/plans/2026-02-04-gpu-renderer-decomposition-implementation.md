# GPU Renderer Decomposition Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Decompose the 839-line `StreamingGpuRendererService` into focused, testable components to enable performance optimization, new shader presets, and future RetroArch shader support.

**Architecture:** Extract infrastructure concerns (worker management, frame buffering) into dedicated manager classes. Introduce a pipeline abstraction (`IRenderPipeline`) for shader execution, with `NativeRenderPipeline` wrapping existing built-in shaders. The main service becomes a thin orchestrator delegating to injected components.

**Tech Stack:** Vitest for testing, custom ServiceContainer for DI, EventBus for cross-service communication, BaseService for dependency injection patterns.

---

## Phase 1: Extract Infrastructure

This phase extracts `GpuFrameBuffer` and `GpuWorkerManager` from the current service. Each task is self-contained with tests.

---

### Task 1: Create GpuFrameBuffer Class

**Files:**
- Create: `src/renderer/features/streaming/rendering/gpu/managers/gpu-frame-buffer.class.js`
- Test: `tests/unit/features/streaming/rendering/managers/gpu-frame-buffer.class.test.js`

**Step 1: Write the failing test for GpuFrameBuffer construction**

```javascript
// tests/unit/features/streaming/rendering/managers/gpu-frame-buffer.class.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GpuFrameBuffer } from '@renderer/features/streaming/rendering/gpu/managers/gpu-frame-buffer.class.js';

describe('GpuFrameBuffer', () => {
  let buffer;
  let mockLogger;
  let mockLoggerFactory;

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
  });

  describe('constructor', () => {
    it('should create buffer with default size of 3', () => {
      buffer = new GpuFrameBuffer({ loggerFactory: mockLoggerFactory });

      expect(buffer.getCapacity()).toBe(3);
      expect(buffer.getSize()).toBe(0);
    });

    it('should create buffer with custom size', () => {
      buffer = new GpuFrameBuffer({
        loggerFactory: mockLoggerFactory,
        bufferSize: 5
      });

      expect(buffer.getCapacity()).toBe(5);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:run -- tests/unit/features/streaming/rendering/managers/gpu-frame-buffer.class.test.js`
Expected: FAIL with "Cannot find module"

**Step 3: Create the managers directory and initial class**

```javascript
// src/renderer/features/streaming/rendering/gpu/managers/gpu-frame-buffer.class.js
/**
 * GpuFrameBuffer
 *
 * Manages a triple-buffer queue for GPU frame rendering.
 * Prevents frame drops by throttling submission when the queue is full.
 * Tracks metrics for performance monitoring.
 */
export class GpuFrameBuffer {
  /**
   * @param {Object} dependencies
   * @param {Object} dependencies.loggerFactory - Logger factory
   * @param {number} [dependencies.bufferSize=3] - Maximum pending frames (triple buffering)
   */
  constructor({ loggerFactory, bufferSize = 3 }) {
    this._logger = loggerFactory?.create('GpuFrameBuffer');
    this._capacity = bufferSize;
    this._queue = [];

    // Metrics
    this._totalEnqueued = 0;
    this._totalDropped = 0;
    this._enqueueTimes = [];
  }

  /**
   * Get buffer capacity
   * @returns {number}
   */
  getCapacity() {
    return this._capacity;
  }

  /**
   * Get current queue size
   * @returns {number}
   */
  getSize() {
    return this._queue.length;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:run -- tests/unit/features/streaming/rendering/managers/gpu-frame-buffer.class.test.js`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add src/renderer/features/streaming/rendering/gpu/managers/gpu-frame-buffer.class.js tests/unit/features/streaming/rendering/managers/gpu-frame-buffer.class.test.js
git commit -m "feat(streaming): add GpuFrameBuffer class skeleton"
```

---

### Task 2: Implement GpuFrameBuffer Queue Operations

**Files:**
- Modify: `src/renderer/features/streaming/rendering/gpu/managers/gpu-frame-buffer.class.js`
- Modify: `tests/unit/features/streaming/rendering/managers/gpu-frame-buffer.class.test.js`

**Step 1: Write failing tests for enqueue/dequeue**

Add to the existing test file:

```javascript
  describe('enqueue', () => {
    beforeEach(() => {
      buffer = new GpuFrameBuffer({ loggerFactory: mockLoggerFactory });
    });

    it('should add frame to queue and return true', () => {
      const frame = { imageBitmap: {}, uniforms: {} };

      const result = buffer.enqueue(frame);

      expect(result).toBe(true);
      expect(buffer.getSize()).toBe(1);
    });

    it('should reject frame when queue is full and return false', () => {
      const frame = { imageBitmap: {}, uniforms: {} };

      // Fill the buffer (default capacity = 3)
      buffer.enqueue(frame);
      buffer.enqueue(frame);
      buffer.enqueue(frame);

      // This should be rejected
      const result = buffer.enqueue(frame);

      expect(result).toBe(false);
      expect(buffer.getSize()).toBe(3);
    });
  });

  describe('dequeue', () => {
    beforeEach(() => {
      buffer = new GpuFrameBuffer({ loggerFactory: mockLoggerFactory });
    });

    it('should return oldest frame (FIFO order)', () => {
      const frame1 = { id: 1 };
      const frame2 = { id: 2 };

      buffer.enqueue(frame1);
      buffer.enqueue(frame2);

      const result = buffer.dequeue();

      expect(result).toEqual(frame1);
      expect(buffer.getSize()).toBe(1);
    });

    it('should return null when queue is empty', () => {
      const result = buffer.dequeue();

      expect(result).toBeNull();
    });
  });

  describe('isFull', () => {
    beforeEach(() => {
      buffer = new GpuFrameBuffer({ loggerFactory: mockLoggerFactory });
    });

    it('should return false when queue has space', () => {
      buffer.enqueue({ id: 1 });

      expect(buffer.isFull()).toBe(false);
    });

    it('should return true when queue is at capacity', () => {
      buffer.enqueue({ id: 1 });
      buffer.enqueue({ id: 2 });
      buffer.enqueue({ id: 3 });

      expect(buffer.isFull()).toBe(true);
    });
  });

  describe('flush', () => {
    beforeEach(() => {
      buffer = new GpuFrameBuffer({ loggerFactory: mockLoggerFactory });
    });

    it('should clear all frames from queue', () => {
      buffer.enqueue({ id: 1 });
      buffer.enqueue({ id: 2 });

      buffer.flush();

      expect(buffer.getSize()).toBe(0);
      expect(buffer.isFull()).toBe(false);
    });
  });
```

**Step 2: Run test to verify it fails**

Run: `npm run test:run -- tests/unit/features/streaming/rendering/managers/gpu-frame-buffer.class.test.js`
Expected: FAIL with "enqueue is not a function"

**Step 3: Implement queue operations**

Add to `gpu-frame-buffer.class.js`:

```javascript
  /**
   * Add a frame to the queue
   * @param {Object} frame - Frame data { imageBitmap, uniforms }
   * @returns {boolean} True if enqueued, false if dropped due to full buffer
   */
  enqueue(frame) {
    if (this._queue.length >= this._capacity) {
      this._totalDropped++;
      return false;
    }

    this._queue.push({
      frame,
      enqueueTime: performance.now()
    });
    this._totalEnqueued++;
    return true;
  }

  /**
   * Remove and return the oldest frame from the queue
   * @returns {Object|null} Frame data or null if empty
   */
  dequeue() {
    const entry = this._queue.shift();
    if (!entry) {
      return null;
    }

    // Track latency for metrics
    const latency = performance.now() - entry.enqueueTime;
    this._enqueueTimes.push(latency);

    // Keep only last 60 samples for rolling average
    if (this._enqueueTimes.length > 60) {
      this._enqueueTimes.shift();
    }

    return entry.frame;
  }

  /**
   * Check if the buffer is full
   * @returns {boolean} True if at capacity
   */
  isFull() {
    return this._queue.length >= this._capacity;
  }

  /**
   * Clear all pending frames
   */
  flush() {
    this._queue = [];
    this._logger?.debug('Frame buffer flushed');
  }
```

**Step 4: Run test to verify it passes**

Run: `npm run test:run -- tests/unit/features/streaming/rendering/managers/gpu-frame-buffer.class.test.js`
Expected: PASS (10 tests)

**Step 5: Commit**

```bash
git add src/renderer/features/streaming/rendering/gpu/managers/gpu-frame-buffer.class.js tests/unit/features/streaming/rendering/managers/gpu-frame-buffer.class.test.js
git commit -m "feat(streaming): implement GpuFrameBuffer queue operations"
```

---

### Task 3: Implement GpuFrameBuffer Metrics

**Files:**
- Modify: `src/renderer/features/streaming/rendering/gpu/managers/gpu-frame-buffer.class.js`
- Modify: `tests/unit/features/streaming/rendering/managers/gpu-frame-buffer.class.test.js`

**Step 1: Write failing tests for metrics**

Add to the existing test file:

```javascript
  describe('getMetrics', () => {
    beforeEach(() => {
      buffer = new GpuFrameBuffer({ loggerFactory: mockLoggerFactory });
    });

    it('should return zero metrics for empty buffer', () => {
      const metrics = buffer.getMetrics();

      expect(metrics).toEqual({
        queued: 0,
        dropped: 0,
        avgLatency: 0
      });
    });

    it('should track dropped frames', () => {
      // Fill buffer
      buffer.enqueue({ id: 1 });
      buffer.enqueue({ id: 2 });
      buffer.enqueue({ id: 3 });

      // Try to add more (should be dropped)
      buffer.enqueue({ id: 4 });
      buffer.enqueue({ id: 5 });

      const metrics = buffer.getMetrics();

      expect(metrics.queued).toBe(3);
      expect(metrics.dropped).toBe(2);
    });

    it('should calculate average latency after dequeue', () => {
      buffer.enqueue({ id: 1 });
      buffer.dequeue();

      const metrics = buffer.getMetrics();

      expect(metrics.avgLatency).toBeGreaterThanOrEqual(0);
    });
  });

  describe('resetMetrics', () => {
    beforeEach(() => {
      buffer = new GpuFrameBuffer({ loggerFactory: mockLoggerFactory });
    });

    it('should reset all counters', () => {
      buffer.enqueue({ id: 1 });
      buffer.enqueue({ id: 2 });
      buffer.enqueue({ id: 3 });
      buffer.enqueue({ id: 4 }); // dropped
      buffer.dequeue();

      buffer.resetMetrics();

      const metrics = buffer.getMetrics();
      expect(metrics.dropped).toBe(0);
      expect(metrics.avgLatency).toBe(0);
    });
  });
```

**Step 2: Run test to verify it fails**

Run: `npm run test:run -- tests/unit/features/streaming/rendering/managers/gpu-frame-buffer.class.test.js`
Expected: FAIL with "getMetrics is not a function"

**Step 3: Implement metrics methods**

Add to `gpu-frame-buffer.class.js`:

```javascript
  /**
   * Get buffer metrics for performance monitoring
   * @returns {{ queued: number, dropped: number, avgLatency: number }}
   */
  getMetrics() {
    const avgLatency = this._enqueueTimes.length > 0
      ? this._enqueueTimes.reduce((a, b) => a + b, 0) / this._enqueueTimes.length
      : 0;

    return {
      queued: this._queue.length,
      dropped: this._totalDropped,
      avgLatency: Math.round(avgLatency * 100) / 100
    };
  }

  /**
   * Reset metrics counters (useful for diagnostics reset)
   */
  resetMetrics() {
    this._totalDropped = 0;
    this._enqueueTimes = [];
    this._logger?.debug('Frame buffer metrics reset');
  }
```

**Step 4: Run test to verify it passes**

Run: `npm run test:run -- tests/unit/features/streaming/rendering/managers/gpu-frame-buffer.class.test.js`
Expected: PASS (15 tests)

**Step 5: Commit**

```bash
git add src/renderer/features/streaming/rendering/gpu/managers/gpu-frame-buffer.class.js tests/unit/features/streaming/rendering/managers/gpu-frame-buffer.class.test.js
git commit -m "feat(streaming): implement GpuFrameBuffer metrics"
```

---

### Task 4: Create GpuWorkerManager Class

**Files:**
- Create: `src/renderer/features/streaming/rendering/gpu/managers/gpu-worker-manager.class.js`
- Test: `tests/unit/features/streaming/rendering/managers/gpu-worker-manager.class.test.js`

**Step 1: Write the failing test for GpuWorkerManager construction**

```javascript
// tests/unit/features/streaming/rendering/managers/gpu-worker-manager.class.test.js
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
```

**Step 2: Run test to verify it fails**

Run: `npm run test:run -- tests/unit/features/streaming/rendering/managers/gpu-worker-manager.class.test.js`
Expected: FAIL with "Cannot find module"

**Step 3: Create the initial class**

```javascript
// src/renderer/features/streaming/rendering/gpu/managers/gpu-worker-manager.class.js
/**
 * GpuWorkerManager
 *
 * Manages the lifecycle of the GPU render worker.
 * Handles worker creation, message routing, capability detection,
 * and graceful termination.
 */

import {
  WorkerMessageType,
  WorkerResponseType,
  createWorkerMessage
} from '../../workers/streaming-worker-protocol.config.js';

export class GpuWorkerManager {
  /**
   * @param {Object} dependencies
   * @param {Object} dependencies.loggerFactory - Logger factory
   * @param {Object} dependencies.eventBus - Event bus for publishing events
   */
  constructor({ loggerFactory, eventBus }) {
    this._logger = loggerFactory?.create('GpuWorkerManager');
    this._eventBus = eventBus;

    // Worker state
    this._worker = null;
    this._isReady = false;
    this._capabilities = null;

    // Canvas state
    this._canvas = null;
    this._offscreenCanvas = null;
    this._wasCanvasTransferred = false;

    // Message handlers registered by consumers
    this._messageHandlers = new Map();

    // Ready promise resolvers
    this._readyResolve = null;
    this._readyReject = null;
    this._readyTimeoutId = null;
  }

  /**
   * Check if worker is ready to receive commands
   * @returns {boolean}
   */
  isReady() {
    return this._isReady;
  }

  /**
   * Get detected GPU capabilities
   * @returns {Object|null}
   */
  getCapabilities() {
    return this._capabilities;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:run -- tests/unit/features/streaming/rendering/managers/gpu-worker-manager.class.test.js`
Expected: PASS (1 test)

**Step 5: Commit**

```bash
git add src/renderer/features/streaming/rendering/gpu/managers/gpu-worker-manager.class.js tests/unit/features/streaming/rendering/managers/gpu-worker-manager.class.test.js
git commit -m "feat(streaming): add GpuWorkerManager class skeleton"
```

---

### Task 5: Implement GpuWorkerManager Initialization

**Files:**
- Modify: `src/renderer/features/streaming/rendering/gpu/managers/gpu-worker-manager.class.js`
- Modify: `tests/unit/features/streaming/rendering/managers/gpu-worker-manager.class.test.js`

**Step 1: Write failing tests for initialization**

Add to the existing test file:

```javascript
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
```

**Step 2: Run test to verify it fails**

Run: `npm run test:run -- tests/unit/features/streaming/rendering/managers/gpu-worker-manager.class.test.js`
Expected: FAIL with "initialize is not a function"

**Step 3: Implement initialization**

Add to `gpu-worker-manager.class.js`:

```javascript
  /**
   * Check if canvas control was transferred (irreversible)
   * @returns {boolean}
   */
  isCanvasTransferred() {
    return this._wasCanvasTransferred;
  }

  /**
   * Initialize the worker with a canvas
   * @param {HTMLCanvasElement} canvasElement - Canvas to render to
   * @param {Object} config - Renderer configuration
   * @param {number} [timeout=5000] - Initialization timeout in ms
   * @returns {Promise<boolean>} True if initialization successful
   */
  async initialize(canvasElement, config, timeout = 5000) {
    // Check if we can reuse existing setup
    if (this._canvas === canvasElement && this._wasCanvasTransferred) {
      if (this._worker && this._isReady) {
        this._logger?.info('Reusing existing worker setup');
        return true;
      }

      if (this._worker && !this._isReady) {
        // Worker exists but not ready - send reinit
        return this._reinitialize(config, timeout);
      }

      // Canvas transferred but worker gone - unrecoverable
      this._logger?.error('Canvas was transferred but worker terminated');
      return false;
    }

    // Store canvas reference
    this._canvas = canvasElement;

    // Transfer canvas control to offscreen (irreversible)
    this._offscreenCanvas = canvasElement.transferControlToOffscreen();
    this._wasCanvasTransferred = true;

    // Create the render worker
    this._worker = new Worker(
      new URL('../../workers/streaming-render.worker.js', import.meta.url),
      { type: 'module' }
    );

    // Set up message handlers
    this._worker.onmessage = (event) => this._handleMessage(event);
    this._worker.onerror = (error) => this._handleError(error);

    // Send init message
    const message = createWorkerMessage(WorkerMessageType.INIT, {
      canvas: this._offscreenCanvas,
      config
    });
    this._worker.postMessage(message, [this._offscreenCanvas]);

    // Wait for ready
    await this._waitForReady(timeout);

    this._logger?.info(`Worker initialized with ${config.api}`);
    return true;
  }

  /**
   * Reinitialize GPU resources without canvas transfer
   * @private
   */
  async _reinitialize(config, timeout) {
    const message = createWorkerMessage(WorkerMessageType.INIT, { config });
    this._worker.postMessage(message);
    await this._waitForReady(timeout);
    return true;
  }

  /**
   * Wait for worker to report ready
   * @private
   */
  _waitForReady(timeout) {
    if (this._isReady) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this._readyResolve = resolve;
      this._readyReject = reject;

      this._readyTimeoutId = setTimeout(() => {
        this._readyResolve = null;
        this._readyReject = null;
        this._readyTimeoutId = null;
        reject(new Error('Worker initialization timed out'));
      }, timeout);
    });
  }

  /**
   * Handle incoming worker messages
   * @private
   */
  _handleMessage(event) {
    const { type, payload } = event.data;

    switch (type) {
      case WorkerResponseType.READY:
        this._isReady = true;
        this._capabilities = payload;
        this._resolveReady();
        this._logger?.info(`Worker ready (API: ${payload.api})`);
        break;

      case WorkerResponseType.ERROR:
        this._logger?.error('Worker error:', payload.message);
        this._isReady = false;
        if (this._readyReject) {
          this._readyReject(new Error(payload.message));
          this._readyResolve = null;
          this._readyReject = null;
          if (this._readyTimeoutId !== null) {
            clearTimeout(this._readyTimeoutId);
            this._readyTimeoutId = null;
          }
        }
        break;

      default:
        // Forward to registered handlers
        const handler = this._messageHandlers.get(type);
        if (handler) {
          handler(payload);
        }
    }
  }

  /**
   * Handle worker errors
   * @private
   */
  _handleError(error) {
    this._logger?.error('Worker error:', error.message);
    this._isReady = false;

    if (this._readyReject) {
      this._readyReject(new Error(error.message));
      this._readyResolve = null;
      this._readyReject = null;
      if (this._readyTimeoutId !== null) {
        clearTimeout(this._readyTimeoutId);
        this._readyTimeoutId = null;
      }
    }
  }

  /**
   * Resolve pending ready promise
   * @private
   */
  _resolveReady() {
    if (this._readyTimeoutId !== null) {
      clearTimeout(this._readyTimeoutId);
      this._readyTimeoutId = null;
    }

    if (this._readyResolve) {
      this._readyResolve();
      this._readyResolve = null;
      this._readyReject = null;
    }
  }
```

**Step 4: Run test to verify it passes**

Run: `npm run test:run -- tests/unit/features/streaming/rendering/managers/gpu-worker-manager.class.test.js`
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add src/renderer/features/streaming/rendering/gpu/managers/gpu-worker-manager.class.js tests/unit/features/streaming/rendering/managers/gpu-worker-manager.class.test.js
git commit -m "feat(streaming): implement GpuWorkerManager initialization"
```

---

### Task 6: Implement GpuWorkerManager Command Sending

**Files:**
- Modify: `src/renderer/features/streaming/rendering/gpu/managers/gpu-worker-manager.class.js`
- Modify: `tests/unit/features/streaming/rendering/managers/gpu-worker-manager.class.test.js`

**Step 1: Write failing tests for sendCommand and onMessage**

Add to the existing test file:

```javascript
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
```

Also add the import at the top of the test file:

```javascript
import { WorkerMessageType } from '@renderer/features/streaming/rendering/workers/streaming-worker-protocol.config.js';
```

**Step 2: Run test to verify it fails**

Run: `npm run test:run -- tests/unit/features/streaming/rendering/managers/gpu-worker-manager.class.test.js`
Expected: FAIL with "sendCommand is not a function"

**Step 3: Implement command sending**

Add to `gpu-worker-manager.class.js`:

```javascript
  /**
   * Send a command to the worker
   * @param {string} type - Message type from WorkerMessageType
   * @param {Object} payload - Message payload
   * @param {Transferable[]} [transferables] - Objects to transfer ownership
   */
  sendCommand(type, payload = {}, transferables = []) {
    if (!this._isReady || !this._worker) {
      throw new Error('Worker not ready');
    }

    const message = createWorkerMessage(type, payload);

    if (transferables.length > 0) {
      this._worker.postMessage(message, transferables);
    } else {
      this._worker.postMessage(message);
    }
  }

  /**
   * Register a handler for a specific message type
   * @param {string} type - Message type to handle
   * @param {Function} handler - Handler function receiving payload
   * @returns {Function} Unsubscribe function
   */
  onMessage(type, handler) {
    this._messageHandlers.set(type, handler);

    return () => {
      this._messageHandlers.delete(type);
    };
  }
```

**Step 4: Run test to verify it passes**

Run: `npm run test:run -- tests/unit/features/streaming/rendering/managers/gpu-worker-manager.class.test.js`
Expected: PASS (11 tests)

**Step 5: Commit**

```bash
git add src/renderer/features/streaming/rendering/gpu/managers/gpu-worker-manager.class.js tests/unit/features/streaming/rendering/managers/gpu-worker-manager.class.test.js
git commit -m "feat(streaming): implement GpuWorkerManager command sending"
```

---

### Task 7: Implement GpuWorkerManager Termination

**Files:**
- Modify: `src/renderer/features/streaming/rendering/gpu/managers/gpu-worker-manager.class.js`
- Modify: `tests/unit/features/streaming/rendering/managers/gpu-worker-manager.class.test.js`

**Step 1: Write failing tests for terminate and releaseResources**

Add to the existing test file:

```javascript
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
```

**Step 2: Run test to verify it fails**

Run: `npm run test:run -- tests/unit/features/streaming/rendering/managers/gpu-worker-manager.class.test.js`
Expected: FAIL with "releaseResources is not a function"

**Step 3: Implement termination methods**

Add to `gpu-worker-manager.class.js`:

```javascript
  /**
   * Release GPU resources while keeping worker alive
   * Allows reinit without canvas transfer
   */
  releaseResources() {
    if (!this._worker) {
      this._logger?.debug('releaseResources: No worker to release');
      return;
    }

    this._worker.postMessage(createWorkerMessage(WorkerMessageType.RELEASE));
    this._isReady = false;

    this._logger?.info('GPU resources released (worker kept alive)');
  }

  /**
   * Fully terminate the worker and reset all state
   * @param {boolean} [resetCanvasFlag=true] - Whether to reset canvas transfer flag
   */
  terminate(resetCanvasFlag = true) {
    // Clear ready timeout if pending
    if (this._readyTimeoutId !== null) {
      clearTimeout(this._readyTimeoutId);
      this._readyTimeoutId = null;
    }

    // Clear pending promises
    this._readyResolve = null;
    this._readyReject = null;

    if (this._worker) {
      // Remove handlers before termination
      this._worker.onmessage = null;
      this._worker.onerror = null;

      this._worker.postMessage(createWorkerMessage(WorkerMessageType.DESTROY));
      this._worker.terminate();
      this._worker = null;
    }

    // Clear all state
    this._isReady = false;
    this._messageHandlers.clear();
    this._canvas = null;
    this._offscreenCanvas = null;

    if (resetCanvasFlag) {
      this._wasCanvasTransferred = false;
    }

    this._logger?.info('Worker terminated');
  }
```

**Step 4: Run test to verify it passes**

Run: `npm run test:run -- tests/unit/features/streaming/rendering/managers/gpu-worker-manager.class.test.js`
Expected: PASS (17 tests)

**Step 5: Commit**

```bash
git add src/renderer/features/streaming/rendering/gpu/managers/gpu-worker-manager.class.js tests/unit/features/streaming/rendering/managers/gpu-worker-manager.class.test.js
git commit -m "feat(streaming): implement GpuWorkerManager termination"
```

---

### Task 8: Register Managers in DI Container

**Files:**
- Modify: `src/renderer/container.js`

**Step 1: Add imports for new managers**

Add after the existing streaming imports (around line 60):

```javascript
// GPU Managers
import { GpuFrameBuffer } from '@renderer/features/streaming/rendering/gpu/managers/gpu-frame-buffer.class.js';
import { GpuWorkerManager } from '@renderer/features/streaming/rendering/gpu/managers/gpu-worker-manager.class.js';
```

**Step 2: Register managers in container**

Find the streaming service registrations section and add before `StreamingGpuRendererService`:

```javascript
  // GPU Managers (new architecture)
  container.registerSingleton(
    'gpuFrameBuffer',
    function(loggerFactory) {
      return new GpuFrameBuffer({ loggerFactory });
    },
    ['loggerFactory']
  );

  container.registerSingleton(
    'gpuWorkerManager',
    function(loggerFactory, eventBus) {
      return new GpuWorkerManager({ loggerFactory, eventBus });
    },
    ['loggerFactory', 'eventBus']
  );
```

**Step 3: Run all tests to verify no regression**

Run: `npm run test:run`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/renderer/container.js
git commit -m "feat(di): register GpuFrameBuffer and GpuWorkerManager"
```

---

### Task 9: Integrate Managers into StreamingGpuRendererService

**Files:**
- Modify: `src/renderer/features/streaming/rendering/gpu/streaming-gpu-renderer.service.js`
- Modify: `tests/unit/features/streaming/rendering/gpu/gpu-renderer.service.test.js`

**Step 1: Update constructor to accept managers**

This task refactors the service to use the injected managers instead of inline logic. The service becomes a thin orchestrator.

First, update the test file to provide mock managers:

```javascript
// Add to beforeEach in gpu-renderer.service.test.js
mockGpuFrameBuffer = {
  enqueue: vi.fn(() => true),
  dequeue: vi.fn(() => null),
  isFull: vi.fn(() => false),
  flush: vi.fn(),
  getMetrics: vi.fn(() => ({ queued: 0, dropped: 0, avgLatency: 0 })),
  resetMetrics: vi.fn()
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

// Update service instantiation
service = new StreamingGpuRendererService({
  eventBus: mockEventBus,
  loggerFactory: mockLoggerFactory,
  settingsService: mockSettingsService,
  gpuFrameBuffer: mockGpuFrameBuffer,
  gpuWorkerManager: mockGpuWorkerManager
});
```

**Step 2: Refactor service to use managers**

Update constructor to require managers:

```javascript
constructor(dependencies) {
  super(
    dependencies,
    ['eventBus', 'loggerFactory', 'settingsService', 'gpuFrameBuffer', 'gpuWorkerManager'],
    'StreamingGpuRendererService'
  );

  this._frameBuffer = dependencies.gpuFrameBuffer;
  this._workerManager = dependencies.gpuWorkerManager;

  // ... keep remaining state that isn't in managers
}
```

**Step 3: Delegate to managers**

Replace inline worker/buffer logic with manager calls:

```javascript
// In renderFrame():
if (this._frameBuffer.isFull()) {
  // ... backpressure handling
  return;
}
this._frameBuffer.enqueue({ imageBitmap, uniforms });

// For commands:
this._workerManager.sendCommand(WorkerMessageType.FRAME, { imageBitmap, uniforms }, [imageBitmap]);
```

**Step 4: Run tests**

Run: `npm run test:run`
Expected: All tests pass (may need test updates for new dependencies)

**Step 5: Commit**

```bash
git add src/renderer/features/streaming/rendering/gpu/streaming-gpu-renderer.service.js tests/unit/features/streaming/rendering/gpu/gpu-renderer.service.test.js
git commit -m "refactor(streaming): integrate GpuFrameBuffer and GpuWorkerManager into service"
```

---

### Task 10: Validation - Full Test Suite

**Step 1: Run full test suite**

```bash
npm run test:run
```

Expected: All 2785+ tests pass

**Step 2: Run lint**

```bash
npm run lint
```

Expected: No errors

**Step 3: Manual verification (if app available)**

- Start dev server: `npm run dev`
- Verify streaming works
- Verify presets switch correctly
- Verify screenshots capture correctly

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore(streaming): complete Phase 1 - Infrastructure extraction"
```

---

## Phase 1 Complete

At this point:
- `GpuFrameBuffer` handles all frame buffering logic (~150 lines)
- `GpuWorkerManager` handles all worker lifecycle logic (~250 lines)
- `StreamingGpuRendererService` is reduced to ~400 lines (down from 839)
- Both managers are independently testable
- All existing tests pass

**Next:** Phase 2 will introduce the `IRenderPipeline` interface and `NativeRenderPipeline` implementation.

---

## Phase 2: Pipeline Abstraction (Coming Next)

Tasks to be added:
- Task 11: Create IRenderPipeline interface
- Task 12: Create NativeRenderPipeline implementation
- Task 13: Create RenderPipelineFactory
- Task 14: Integrate pipeline into service
- Task 15: Validation

---

## Phase 3: Shader Loading Infrastructure (Future)

Tasks to be added:
- Task 16: Create ShaderLoaderService in main process
- Task 17: Add IPC channels
- Task 18: Add preload API
- Task 19: Stub RetroArchRenderPipeline
- Task 20: Validation
