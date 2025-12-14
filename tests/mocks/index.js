/**
 * Mock Utilities Index
 *
 * Central export for all test mocks and utilities
 */

import { vi } from 'vitest';

// Re-export device mocks
export * from './MockDevice.js';

/**
 * Creates a mock EventBus
 */
export function createMockEventBus() {
  const listeners = new Map();

  return {
    publish: vi.fn((event, data) => {
      const eventListeners = listeners.get(event) || [];
      eventListeners.forEach(callback => callback(data));
    }),

    subscribe: vi.fn((event, callback) => {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event).push(callback);

      // Return unsubscribe function
      return vi.fn(() => {
        const eventListeners = listeners.get(event);
        const index = eventListeners.indexOf(callback);
        if (index > -1) eventListeners.splice(index, 1);
      });
    }),

    unsubscribe: vi.fn((event, callback) => {
      const eventListeners = listeners.get(event);
      if (eventListeners) {
        const index = eventListeners.indexOf(callback);
        if (index > -1) eventListeners.splice(index, 1);
      }
    }),

    hasListeners: vi.fn((event) => {
      return (listeners.get(event) || []).length > 0;
    }),

    // Test helpers
    _listeners: listeners,
    _clearAll: () => listeners.clear(),
    _getListenerCount: (event) => (listeners.get(event) || []).length,
  };
}

/**
 * Creates a mock Logger
 */
export function createMockLogger(name = 'test') {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(function() { return this; }),
    name,
  };
}

/**
 * Creates a mock LoggerFactory
 */
export function createMockLoggerFactory() {
  const loggers = new Map();

  const factory = {
    // The actual EventBus uses loggerFactory.create()
    create: vi.fn((name) => {
      if (!loggers.has(name)) {
        loggers.set(name, createMockLogger(name));
      }
      return loggers.get(name);
    }),

    createLogger: vi.fn((name) => {
      if (!loggers.has(name)) {
        loggers.set(name, createMockLogger(name));
      }
      return loggers.get(name);
    }),

    getLogger: vi.fn((name) => {
      return loggers.get(name) || createMockLogger(name);
    }),

    // Test helpers
    _loggers: loggers,
    _clearAll: () => loggers.clear(),
  };

  return factory;
}

/**
 * Creates a mock AppState
 */
export function createMockAppState(initialState = {}) {
  const state = {
    isStreaming: false,
    selectedDeviceId: null,
    cinematicModeEnabled: true,
    isRecording: false,
    recordingBlob: null,
    deviceConnected: false,
    ...initialState,
  };

  return {
    // State getters
    get isStreaming() { return state.isStreaming; },
    get selectedDeviceId() { return state.selectedDeviceId; },
    get cinematicModeEnabled() { return state.cinematicModeEnabled; },
    get isRecording() { return state.isRecording; },
    get recordingBlob() { return state.recordingBlob; },
    get deviceConnected() { return state.deviceConnected; },

    // State setters
    setStreaming: vi.fn((value) => { state.isStreaming = value; }),
    setSelectedDeviceId: vi.fn((value) => { state.selectedDeviceId = value; }),
    setCinematicModeEnabled: vi.fn((value) => { state.cinematicModeEnabled = value; }),
    setRecording: vi.fn((value) => { state.isRecording = value; }),
    setRecordingBlob: vi.fn((value) => { state.recordingBlob = value; }),
    setDeviceConnected: vi.fn((value) => { state.deviceConnected = value; }),
    setCinematicMode: vi.fn((value) => { state.cinematicModeEnabled = value; }),

    // Test helpers
    _state: state,
    _reset: () => {
      state.isStreaming = false;
      state.selectedDeviceId = null;
      state.cinematicModeEnabled = true;
      state.isRecording = false;
      state.recordingBlob = null;
      state.deviceConnected = false;
    },
  };
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
