/**
 * Mock Utilities Index
 *
 * Central export for all test mocks and utilities
 */

import { vi } from 'vitest';
import {
  createAppState as createFactoryAppState,
  createEventBus as createFactoryEventBus,
  createLogger as createFactoryLogger,
  createLoggerFactory as createFactoryLoggerFactory,
} from '../factories/index.js';

// Re-export device mocks
export * from './MockDevice.js';

// Re-export enhanced MockDevice with state machine
export {
  MockDeviceStateMachine,
  DeviceState,
  createChromaticWithFSM,
} from './MockDeviceStateMachine.js';

// Re-export WebGL mock
export {
  GL,
  createWebGLContext,
  createWebGL2Context,
  installWebGLMock,
} from './webgl-context.mock.js';

/**
 * Creates a mock EventBus
 */
export function createMockEventBus(options = {}) {
  const eventBus = createFactoryEventBus(options);
  eventBus._clearAll = eventBus._clearListeners;
  return eventBus;
}

/**
 * Creates a mock Logger
 */
export function createMockLogger(name = 'test') {
  return createFactoryLogger({ name });
}

/**
 * Creates a mock LoggerFactory
 */
export function createMockLoggerFactory(options = {}) {
  const factory = createFactoryLoggerFactory(options);
  factory._clearAll = () => {
    factory._loggers.clear();
  };
  return factory;
}

/**
 * Creates a mock AppState
 */
export function createMockAppState(initialState = {}) {
  return createFactoryAppState({ initialState });
}

/**
 * Creates a mock UIController
 */
export function createMockUIController() {
  // Create mock DOM elements
  const mockCanvas = {
    width: 640,
    height: 576,
    getContext: vi.fn(() => ({
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      imageSmoothingEnabled: false,
    })),
    toBlob: vi.fn((cb) => cb(new Blob(['test']))),
    toDataURL: vi.fn(() => 'data:image/png;base64,test'),
  };

  const mockVideo = {
    srcObject: null,
    readyState: 4,
    HAVE_CURRENT_DATA: 2,
    HAVE_ENOUGH_DATA: 4,
    play: vi.fn().mockResolvedValue(),
    pause: vi.fn(),
    load: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    requestVideoFrameCallback: vi.fn((cb) => setTimeout(cb, 16)),
  };

  return {
    elements: {
      streamCanvas: mockCanvas,
      streamVideo: mockVideo,
      overlayMessage: { textContent: '', className: '' },
      streamOverlay: { classList: { add: vi.fn(), remove: vi.fn() } },
    },

    setStreamingMode: vi.fn(),
    updateOverlayMessage: vi.fn(),
    updateStatusMessage: vi.fn(),
    showErrorOverlay: vi.fn(),
    updateStreamInfo: vi.fn(),

    // Test helpers
    _mockCanvas: mockCanvas,
    _mockVideo: mockVideo,
  };
}

/**
 * Creates a mock StreamingService
 */
export function createMockStreamingService() {
  let isActive = false;
  let currentStream = null;

  return {
    start: vi.fn(async (deviceId) => {
      isActive = true;
      currentStream = { id: 'mock-stream' };
      return currentStream;
    }),

    stop: vi.fn(() => {
      isActive = false;
      currentStream = null;
    }),

    isActive: vi.fn(() => isActive),
    getStream: vi.fn(() => currentStream),

    // Test helpers
    _setActive: (value) => { isActive = value; },
    _setStream: (stream) => { currentStream = stream; },
  };
}

/**
 * Creates a mock DeviceOrchestrator
 */
export function createMockDeviceOrchestrator() {
  let deviceConnected = false;

  return {
    isDeviceConnected: vi.fn(() => deviceConnected),
    getConnectedDevice: vi.fn(() => deviceConnected ? { deviceId: 'mock-device' } : null),
    initialize: vi.fn().mockResolvedValue(),
    cleanup: vi.fn().mockResolvedValue(),

    // Test helpers
    _setDeviceConnected: (value) => { deviceConnected = value; },
  };
}

/**
 * Creates all standard dependencies for testing orchestrators/services
 */
export function createMockDependencies(overrides = {}) {
  return {
    eventBus: createMockEventBus(),
    loggerFactory: createMockLoggerFactory(),
    appState: createMockAppState(),
    uiController: createMockUIController(),
    streamingService: createMockStreamingService(),
    deviceOrchestrator: createMockDeviceOrchestrator(),
    ...overrides,
  };
}

/**
 * Performance testing utilities
 */
export const performanceUtils = {
  /**
   * Measure execution time of a function
   */
  measureTime: async (fn, iterations = 1) => {
    const times = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fn();
      times.push(performance.now() - start);
    }

    return {
      min: Math.min(...times),
      max: Math.max(...times),
      avg: times.reduce((a, b) => a + b, 0) / times.length,
      total: times.reduce((a, b) => a + b, 0),
      iterations,
      times,
    };
  },

  /**
   * Measure memory usage (if available)
   */
  measureMemory: () => {
    if (performance.memory) {
      return {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      };
    }
    return null;
  },

  /**
   * Create a deferred promise for async testing
   */
  createDeferred: () => {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  },

  /**
   * Wait for condition with timeout
   */
  waitFor: async (condition, { timeout = 5000, interval = 50 } = {}) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await condition()) return true;
      await new Promise(r => setTimeout(r, interval));
    }
    throw new Error(`waitFor timeout after ${timeout}ms`);
  },
};
