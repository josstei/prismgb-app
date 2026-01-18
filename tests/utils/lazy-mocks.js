/**
 * Lazy Mock Initialization
 *
 * Provides on-demand mock creation to reduce test setup time.
 * Mocks are created only when first accessed and cached.
 */

import { vi, beforeEach, afterEach } from 'vitest';

// Cache for lazy-initialized mocks
const mockCache = new Map();

// Cleanup callbacks
const cleanupCallbacks = [];

/**
 * Creates a lazy mock that initializes on first access
 * @param {string} name - Mock identifier
 * @param {Function} factory - Factory function to create the mock
 * @returns {Function} Getter function for the mock
 */
export function lazyMock(name, factory) {
  return () => {
    if (!mockCache.has(name)) {
      const mock = factory();
      mockCache.set(name, mock);
    }
    return mockCache.get(name);
  };
}

/**
 * Clears a specific mock from cache
 * @param {string} name - Mock identifier
 */
export function clearMock(name) {
  const mock = mockCache.get(name);
  if (mock?._reset) {
    mock._reset();
  }
  mockCache.delete(name);
}

/**
 * Clears all cached mocks
 */
export function clearAllMocks() {
  mockCache.forEach((mock) => {
    if (mock?._reset) {
      mock._reset();
    }
  });
  mockCache.clear();
}

/**
 * Resets all cached mocks without clearing cache
 */
export function resetAllMocks() {
  mockCache.forEach((mock) => {
    if (mock?._reset) {
      mock._reset();
    }
  });
}

/**
 * Gets the current cache size
 */
export function getCacheSize() {
  return mockCache.size;
}

/**
 * Checks if a mock is cached
 */
export function isMockCached(name) {
  return mockCache.has(name);
}

// ==========================================
// Lazy Global Mocks
// ==========================================

let mediaDevicesMockInstalled = false;
let canvasMockInstalled = false;
let animationFrameMockInstalled = false;

/**
 * Lazy MediaDevices mock - only installs when needed
 */
export function getMediaDevicesMock() {
  if (!mediaDevicesMockInstalled) {
    const mock = {
      enumerateDevices: vi.fn().mockResolvedValue([]),
      getUserMedia: vi.fn().mockResolvedValue(null),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      _deviceChangeListeners: [],
      _reset() {
        this.enumerateDevices.mockResolvedValue([]);
        this.getUserMedia.mockResolvedValue(null);
        this._deviceChangeListeners.length = 0;
        vi.clearAllMocks();
      },
    };

    Object.defineProperty(navigator, 'mediaDevices', {
      value: mock,
      writable: true,
      configurable: true,
    });

    mockCache.set('mediaDevices', mock);
    mediaDevicesMockInstalled = true;

    cleanupCallbacks.push(() => {
      mediaDevicesMockInstalled = false;
    });
  }

  return mockCache.get('mediaDevices');
}

/**
 * Lazy Canvas mock - only installs when needed
 */
export function getCanvasMock() {
  if (!canvasMockInstalled) {
    const mockContext = {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray(4),
        width: 1,
        height: 1,
      })),
      putImageData: vi.fn(),
      imageSmoothingEnabled: false,
      fillStyle: '#000000',
      _reset() {
        vi.clearAllMocks();
      },
    };

    const originalGetContext = HTMLCanvasElement.prototype.getContext;

    HTMLCanvasElement.prototype.getContext = vi.fn(function(type, options) {
      if (type === '2d') {
        return mockContext;
      }
      // Allow WebGL to be handled separately
      return originalGetContext?.call(this, type, options) || null;
    });

    HTMLCanvasElement.prototype.toBlob = vi.fn((callback, type, quality) => {
      const blob = new Blob(['mock'], { type: type || 'image/png' });
      setTimeout(() => callback(blob), 0);
    });

    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,mock');

    mockCache.set('canvasContext', mockContext);
    canvasMockInstalled = true;

    cleanupCallbacks.push(() => {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
      canvasMockInstalled = false;
    });
  }

  return mockCache.get('canvasContext');
}

/**
 * Lazy Animation Frame mock
 */
export function getAnimationFrameMock() {
  if (!animationFrameMockInstalled) {
    const originalRAF = global.requestAnimationFrame;
    const originalCAF = global.cancelAnimationFrame;

    global.requestAnimationFrame = vi.fn((cb) => {
      return setTimeout(() => cb(performance.now()), 16);
    });

    global.cancelAnimationFrame = vi.fn((id) => {
      clearTimeout(id);
    });

    animationFrameMockInstalled = true;

    cleanupCallbacks.push(() => {
      global.requestAnimationFrame = originalRAF;
      global.cancelAnimationFrame = originalCAF;
      animationFrameMockInstalled = false;
    });
  }

  return {
    requestAnimationFrame: global.requestAnimationFrame,
    cancelAnimationFrame: global.cancelAnimationFrame,
  };
}

/**
 * Lazy Video element mock
 */
export function getVideoElementMock() {
  const key = 'videoElement';

  if (!mockCache.has(key)) {
    HTMLVideoElement.prototype.requestVideoFrameCallback = vi.fn((callback) => {
      return requestAnimationFrame(() => callback(performance.now(), {}));
    });

    HTMLVideoElement.prototype.cancelVideoFrameCallback = vi.fn((id) => {
      cancelAnimationFrame(id);
    });

    mockCache.set(key, true);
  }

  return true;
}

/**
 * Lazy Performance API mock
 */
export function getPerformanceMock() {
  const key = 'performance';

  if (!mockCache.has(key)) {
    if (!global.performance.mark) {
      global.performance.mark = vi.fn();
    }
    if (!global.performance.measure) {
      global.performance.measure = vi.fn();
    }
    if (!global.performance.getEntriesByName) {
      global.performance.getEntriesByName = vi.fn(() => [{ duration: 0 }]);
    }

    mockCache.set(key, global.performance);
  }

  return mockCache.get(key);
}

/**
 * Lazy MediaStream mock
 */
export function getMediaStreamMock() {
  const key = 'MediaStream';

  if (!mockCache.has(key)) {
    global.MediaStream = class MockMediaStream {
      constructor(tracks = []) {
        this.id = `mock-stream-${Date.now()}`;
        this._tracks = tracks;
        this.active = true;
      }

      getTracks() { return this._tracks; }
      getVideoTracks() { return this._tracks.filter(t => t.kind === 'video'); }
      getAudioTracks() { return this._tracks.filter(t => t.kind === 'audio'); }
      addTrack(track) { this._tracks.push(track); }
      removeTrack(track) {
        const i = this._tracks.indexOf(track);
        if (i > -1) this._tracks.splice(i, 1);
      }
    };

    mockCache.set(key, global.MediaStream);
  }

  return mockCache.get(key);
}

/**
 * Lazy MediaStreamTrack mock
 */
export function getMediaStreamTrackMock() {
  const key = 'MediaStreamTrack';

  if (!mockCache.has(key)) {
    global.MediaStreamTrack = class MockMediaStreamTrack {
      constructor(kind = 'video') {
        this.id = `mock-track-${Date.now()}`;
        this.kind = kind;
        this.enabled = true;
        this.readyState = 'live';
        this.muted = false;
        this._settings = {};
        this._capabilities = {};
      }

      getSettings() { return this._settings; }
      getCapabilities() { return this._capabilities; }
      applyConstraints() { return Promise.resolve(); }
      stop() { this.readyState = 'ended'; }
      clone() {
        const c = new MockMediaStreamTrack(this.kind);
        c._settings = { ...this._settings };
        return c;
      }
    };

    mockCache.set(key, global.MediaStreamTrack);
  }

  return mockCache.get(key);
}

// ==========================================
// Auto-cleanup hooks
// ==========================================

/**
 * Installs automatic cleanup hooks for tests
 */
export function installCleanupHooks() {
  beforeEach(() => {
    resetAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });
}

/**
 * Runs all cleanup callbacks (for manual cleanup)
 */
export function runCleanup() {
  while (cleanupCallbacks.length > 0) {
    const cleanup = cleanupCallbacks.pop();
    try {
      cleanup();
    } catch (e) {
      // Ignore cleanup errors
    }
  }
  clearAllMocks();
}

export default {
  lazyMock,
  clearMock,
  clearAllMocks,
  resetAllMocks,
  getCacheSize,
  isMockCached,
  getMediaDevicesMock,
  getCanvasMock,
  getAnimationFrameMock,
  getVideoElementMock,
  getPerformanceMock,
  getMediaStreamMock,
  getMediaStreamTrackMock,
  installCleanupHooks,
  runCleanup,
};
