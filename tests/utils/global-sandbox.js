/**
 * Global State Sandbox
 *
 * Provides isolated global state management for tests.
 * Captures, mocks, and restores global state to prevent test pollution.
 */

import { vi, beforeEach, afterEach } from 'vitest';

/**
 * Creates a global state sandbox for isolated testing
 * @returns {Object} Sandbox instance
 */
export function createGlobalSandbox() {
  const snapshots = new Map();
  const propertyDescriptors = new Map();
  const cleanupCallbacks = [];

  const sandbox = {
    /**
     * Capture current value of global keys
     * @param {string[]} keys - Global keys to capture
     */
    capture(...keys) {
      for (const key of keys) {
        if (!snapshots.has(key)) {
          snapshots.set(key, globalThis[key]);
          // Also capture property descriptor for proper restoration
          const desc = Object.getOwnPropertyDescriptor(globalThis, key);
          if (desc) {
            propertyDescriptors.set(key, desc);
          }
        }
      }
      return this;
    },

    /**
     * Mock a global value
     * @param {string} key - Global key to mock
     * @param {*} value - Mock value
     */
    mock(key, value) {
      // Capture original if not already captured
      if (!snapshots.has(key)) {
        snapshots.set(key, globalThis[key]);
        const desc = Object.getOwnPropertyDescriptor(globalThis, key);
        if (desc) {
          propertyDescriptors.set(key, desc);
        }
      }

      // Set mock value
      try {
        Object.defineProperty(globalThis, key, {
          value,
          writable: true,
          configurable: true,
        });
      } catch {
        // Fallback for non-configurable properties
        globalThis[key] = value;
      }

      return this;
    },

    /**
     * Mock a nested property (e.g., 'navigator.mediaDevices')
     * @param {string} path - Dot-separated path
     * @param {*} value - Mock value
     */
    mockNested(path, value) {
      const parts = path.split('.');
      const lastKey = parts.pop();
      let obj = globalThis;

      // Capture the root object
      this.capture(parts[0]);

      // Navigate to parent
      for (const part of parts) {
        if (!obj[part]) {
          obj[part] = {};
        }
        obj = obj[part];
      }

      // Set the value
      const originalDescriptor = Object.getOwnPropertyDescriptor(obj, lastKey);
      try {
        Object.defineProperty(obj, lastKey, {
          value,
          writable: true,
          configurable: true,
        });
      } catch {
        obj[lastKey] = value;
      }

      // Store cleanup for nested property
      cleanupCallbacks.push(() => {
        if (originalDescriptor) {
          Object.defineProperty(obj, lastKey, originalDescriptor);
        } else {
          delete obj[lastKey];
        }
      });

      return this;
    },

    /**
     * Restore all captured global state
     */
    restore() {
      // Run cleanup callbacks first (for nested mocks)
      while (cleanupCallbacks.length > 0) {
        const cleanup = cleanupCallbacks.pop();
        try {
          cleanup();
        } catch (e) {
          // Ignore cleanup errors
        }
      }

      // Restore captured values
      for (const [key, value] of snapshots) {
        const desc = propertyDescriptors.get(key);
        try {
          if (desc) {
            Object.defineProperty(globalThis, key, desc);
          } else if (value === undefined) {
            delete globalThis[key];
          } else {
            globalThis[key] = value;
          }
        } catch {
          // Ignore restoration errors for non-configurable properties
        }
      }

      snapshots.clear();
      propertyDescriptors.clear();

      return this;
    },

    /**
     * Add custom cleanup callback
     * @param {Function} callback - Cleanup function
     */
    onCleanup(callback) {
      cleanupCallbacks.push(callback);
      return this;
    },

    /**
     * Get a captured snapshot value
     * @param {string} key - Global key
     * @returns {*} Original value
     */
    getOriginal(key) {
      return snapshots.get(key);
    },

    /**
     * Check if a key has been captured
     * @param {string} key - Global key
     * @returns {boolean}
     */
    hasCaptured(key) {
      return snapshots.has(key);
    },
  };

  return sandbox;
}

/**
 * Creates a document sandbox with common mocks
 * @returns {Object} Sandbox with pre-configured document mocks
 */
export function createDocumentSandbox() {
  const sandbox = createGlobalSandbox();
  const realDocument = globalThis.document;

  // Capture document
  sandbox.capture('document');

  // Create mock document
  const mockDocument = {
    ...realDocument,
    hidden: false,
    visibilityState: 'visible',
    createElement: vi.fn((tag) => realDocument.createElement(tag)),
    getElementById: vi.fn((id) => realDocument.getElementById(id)),
    querySelector: vi.fn((sel) => realDocument.querySelector(sel)),
    querySelectorAll: vi.fn((sel) => realDocument.querySelectorAll(sel)),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),

    // Test helpers
    _setHidden(hidden) {
      this.hidden = hidden;
      this.visibilityState = hidden ? 'hidden' : 'visible';
    },
    _triggerVisibilityChange() {
      const listeners = this.addEventListener.mock.calls
        .filter(([event]) => event === 'visibilitychange')
        .map(([, handler]) => handler);
      listeners.forEach(handler => handler());
    },
  };

  sandbox.mock('document', mockDocument);

  return {
    sandbox,
    mockDocument,
    restore: () => sandbox.restore(),
  };
}

/**
 * Creates a navigator sandbox with common mocks
 * @returns {Object} Sandbox with pre-configured navigator mocks
 */
export function createNavigatorSandbox() {
  const sandbox = createGlobalSandbox();

  // Mock mediaDevices
  const mockMediaDevices = {
    enumerateDevices: vi.fn().mockResolvedValue([]),
    getUserMedia: vi.fn().mockResolvedValue(null),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    _deviceChangeListeners: [],
    _triggerDeviceChange() {
      this._deviceChangeListeners.forEach(l => l({ type: 'devicechange' }));
    },
  };

  // Override addEventListener to track device change listeners
  mockMediaDevices.addEventListener.mockImplementation((event, listener) => {
    if (event === 'devicechange') {
      mockMediaDevices._deviceChangeListeners.push(listener);
    }
  });

  mockMediaDevices.removeEventListener.mockImplementation((event, listener) => {
    if (event === 'devicechange') {
      const idx = mockMediaDevices._deviceChangeListeners.indexOf(listener);
      if (idx > -1) mockMediaDevices._deviceChangeListeners.splice(idx, 1);
    }
  });

  sandbox.mockNested('navigator.mediaDevices', mockMediaDevices);

  return {
    sandbox,
    mockMediaDevices,
    restore: () => sandbox.restore(),
  };
}

/**
 * Creates a performance sandbox with timing mocks
 * @returns {Object} Sandbox with pre-configured performance mocks
 */
export function createPerformanceSandbox() {
  const sandbox = createGlobalSandbox();

  let mockNow = 0;
  const marks = new Map();
  const measures = [];

  const mockPerformance = {
    now: vi.fn(() => mockNow),
    mark: vi.fn((name) => {
      marks.set(name, mockNow);
    }),
    measure: vi.fn((name, startMark, endMark) => {
      const start = marks.get(startMark) || 0;
      const end = endMark ? marks.get(endMark) : mockNow;
      measures.push({ name, duration: end - start });
    }),
    getEntriesByName: vi.fn((name) => {
      return measures.filter(m => m.name === name);
    }),
    clearMarks: vi.fn(() => marks.clear()),
    clearMeasures: vi.fn(() => measures.length = 0),

    // Test helpers
    _setNow(time) { mockNow = time; },
    _advance(ms) { mockNow += ms; },
    _getMarks() { return new Map(marks); },
    _getMeasures() { return [...measures]; },
  };

  sandbox.mock('performance', mockPerformance);

  return {
    sandbox,
    mockPerformance,
    restore: () => sandbox.restore(),
    advance: (ms) => mockPerformance._advance(ms),
    setNow: (time) => mockPerformance._setNow(time),
  };
}

/**
 * Hook to automatically manage sandbox lifecycle in tests
 * @param {Function} sandboxFactory - Factory function that returns sandbox
 * @returns {Object} The created sandbox (available after beforeEach runs)
 */
export function useSandbox(sandboxFactory) {
  let sandbox = null;

  beforeEach(() => {
    sandbox = sandboxFactory();
  });

  afterEach(() => {
    sandbox?.restore?.();
    sandbox?.sandbox?.restore?.();
    sandbox = null;
  });

  return {
    get current() { return sandbox; },
  };
}

export default {
  createGlobalSandbox,
  createDocumentSandbox,
  createNavigatorSandbox,
  createPerformanceSandbox,
  useSandbox,
};
