/**
 * Stream Factory
 *
 * Creates mock streaming-related instances for testing.
 * Includes StreamingService, streams, and render pipeline mocks.
 */

import { vi } from 'vitest';
import { createMediaStream, createDeviceAdapter, AdapterState } from './device.factory.js';
import { CHROMATIC_SPECS } from '../mocks/MockDevice.js';

/**
 * Streaming service states
 */
export const StreamingState = {
  IDLE: 'idle',
  STARTING: 'starting',
  STREAMING: 'streaming',
  STOPPING: 'stopping',
  ERROR: 'error',
};

/**
 * Creates a mock StreamingService
 * @param {Object} options - Service options
 * @returns {Object} Mock StreamingService
 */
export function createStreamingService(options = {}) {
  const {
    initialState = StreamingState.IDLE,
  } = options;

  let state = initialState;
  let currentStream = null;
  let currentAdapter = null;
  let currentDeviceId = null;

  const service = {
    /**
     * Start streaming from a device
     */
    start: vi.fn(async (deviceId) => {
      if (state === StreamingState.STREAMING) {
        throw new Error('Already streaming');
      }

      state = StreamingState.STARTING;
      currentDeviceId = deviceId;

      try {
        currentAdapter = createDeviceAdapter({ deviceId });
        await currentAdapter.initialize();
        currentStream = await currentAdapter.getStream();
        state = StreamingState.STREAMING;
        return currentStream;
      } catch (error) {
        state = StreamingState.ERROR;
        throw error;
      }
    }),

    /**
     * Stop streaming
     */
    stop: vi.fn(async () => {
      if (state !== StreamingState.STREAMING) {
        return;
      }

      state = StreamingState.STOPPING;

      if (currentAdapter) {
        currentAdapter.releaseStream();
        currentAdapter.cleanup();
      }

      currentStream = null;
      currentAdapter = null;
      currentDeviceId = null;
      state = StreamingState.IDLE;
    }),

    /**
     * Check if actively streaming
     */
    isActive: vi.fn(() => state === StreamingState.STREAMING),

    /**
     * Get current stream
     */
    getStream: vi.fn(() => currentStream),

    /**
     * Get current device ID
     */
    getCurrentDeviceId: vi.fn(() => currentDeviceId),

    /**
     * Get current capabilities
     */
    getCapabilities: vi.fn(() => {
      if (!currentAdapter) return null;
      return currentAdapter.getCapabilities();
    }),

    // ==========================================
    // Test Helpers
    // ==========================================

    _getState() { return state; },
    _setState(s) { state = s; },
    _getAdapter() { return currentAdapter; },
    _setAdapter(a) { currentAdapter = a; },
    _setStream(s) { currentStream = s; },
    _reset() {
      state = StreamingState.IDLE;
      currentStream = null;
      currentAdapter = null;
      currentDeviceId = null;
      vi.clearAllMocks();
    },
  };

  return service;
}

/**
 * Creates a mock RenderPipeline
 * @param {Object} options - Pipeline options
 * @returns {Object} Mock RenderPipeline
 */
export function createRenderPipeline(options = {}) {
  const {
    width = CHROMATIC_SPECS.nativeWidth * 4,
    height = CHROMATIC_SPECS.nativeHeight * 4,
  } = options;

  let isRunning = false;
  let frameCount = 0;
  let lastFrameTime = 0;

  const pipeline = {
    /**
     * Initialize pipeline
     */
    initialize: vi.fn(async () => {
      return true;
    }),

    /**
     * Start rendering
     */
    start: vi.fn(() => {
      isRunning = true;
      frameCount = 0;
      lastFrameTime = performance.now();
    }),

    /**
     * Stop rendering
     */
    stop: vi.fn(() => {
      isRunning = false;
    }),

    /**
     * Render a frame
     */
    render: vi.fn(() => {
      if (!isRunning) return;
      frameCount++;
      lastFrameTime = performance.now();
    }),

    /**
     * Get render stats
     */
    getStats: vi.fn(() => ({
      frameCount,
      lastFrameTime,
      isRunning,
      width,
      height,
    })),

    /**
     * Resize output
     */
    resize: vi.fn((w, h) => {
      // Updates internal dimensions
    }),

    /**
     * Cleanup
     */
    dispose: vi.fn(() => {
      isRunning = false;
      frameCount = 0;
    }),

    // Test helpers
    _isRunning() { return isRunning; },
    _getFrameCount() { return frameCount; },
    _reset() {
      isRunning = false;
      frameCount = 0;
      lastFrameTime = 0;
      vi.clearAllMocks();
    },
  };

  return pipeline;
}

/**
 * Creates a mock Canvas with 2D context
 * @param {Object} options - Canvas options
 * @returns {Object} Mock canvas
 */
export function createMockCanvas(options = {}) {
  const {
    width = 640,
    height = 576,
  } = options;

  const drawCalls = [];

  const ctx = {
    drawImage: vi.fn((...args) => {
      drawCalls.push({ method: 'drawImage', args });
    }),
    fillRect: vi.fn((...args) => {
      drawCalls.push({ method: 'fillRect', args });
    }),
    clearRect: vi.fn((...args) => {
      drawCalls.push({ method: 'clearRect', args });
    }),
    getImageData: vi.fn((x, y, w, h) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    })),
    putImageData: vi.fn(),
    imageSmoothingEnabled: false,
    fillStyle: '#000000',
    _drawCalls: drawCalls,
    _clearDrawCalls: () => { drawCalls.length = 0; },
  };

  const canvas = {
    width,
    height,
    getContext: vi.fn((type, opts) => {
      if (type === '2d') return ctx;
      return null;
    }),
    toBlob: vi.fn((callback, type, quality) => {
      const blob = new Blob(['mock-image'], { type: type || 'image/png' });
      setTimeout(() => callback(blob), 0);
    }),
    toDataURL: vi.fn((type, quality) => {
      return `data:${type || 'image/png'};base64,mockData`;
    }),
    _ctx: ctx,
  };

  return canvas;
}

/**
 * Creates a mock Video element
 * @param {Object} options - Video options
 * @returns {Object} Mock video element
 */
export function createMockVideo(options = {}) {
  const {
    width = CHROMATIC_SPECS.nativeWidth,
    height = CHROMATIC_SPECS.nativeHeight,
  } = options;

  let srcObject = null;
  const eventListeners = new Map();

  const video = {
    get videoWidth() { return width; },
    get videoHeight() { return height; },
    get srcObject() { return srcObject; },
    set srcObject(v) { srcObject = v; },
    readyState: 4,
    HAVE_NOTHING: 0,
    HAVE_METADATA: 1,
    HAVE_CURRENT_DATA: 2,
    HAVE_FUTURE_DATA: 3,
    HAVE_ENOUGH_DATA: 4,

    play: vi.fn().mockResolvedValue(),
    pause: vi.fn(),
    load: vi.fn(),

    addEventListener: vi.fn((event, handler) => {
      if (!eventListeners.has(event)) {
        eventListeners.set(event, []);
      }
      eventListeners.get(event).push(handler);
    }),

    removeEventListener: vi.fn((event, handler) => {
      const handlers = eventListeners.get(event);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) handlers.splice(index, 1);
      }
    }),

    requestVideoFrameCallback: vi.fn((callback) => {
      return setTimeout(() => callback(performance.now(), {}), 16);
    }),

    cancelVideoFrameCallback: vi.fn((id) => {
      clearTimeout(id);
    }),

    // Test helpers
    _triggerEvent(event, data) {
      const handlers = eventListeners.get(event) || [];
      handlers.forEach(h => h(data));
    },
    _eventListeners: eventListeners,
    _reset() {
      srcObject = null;
      eventListeners.clear();
      vi.clearAllMocks();
    },
  };

  return video;
}

export default {
  createStreamingService,
  createRenderPipeline,
  createMockCanvas,
  createMockVideo,
  StreamingState,
};
