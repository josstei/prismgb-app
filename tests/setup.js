/**
 * Global Test Setup
 *
 * Configures the test environment with mocks, globals, and utilities
 * for testing Electron renderer process code.
 */

import { vi, beforeEach, afterEach } from 'vitest';

// Mock browser APIs not available in happy-dom
global.requestAnimationFrame = vi.fn((cb) => {
  return setTimeout(() => cb(performance.now()), 16);
});

global.cancelAnimationFrame = vi.fn((id) => {
  clearTimeout(id);
});

// Mock performance API enhancements
if (!global.performance.mark) {
  global.performance.mark = vi.fn();
}
if (!global.performance.measure) {
  global.performance.measure = vi.fn();
}
if (!global.performance.getEntriesByName) {
  global.performance.getEntriesByName = vi.fn(() => [{ duration: 0 }]);
}

// Mock MediaDevices API
const mockMediaDevices = {
  enumerateDevices: vi.fn().mockResolvedValue([]),
  getUserMedia: vi.fn().mockResolvedValue(null),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

Object.defineProperty(navigator, 'mediaDevices', {
  value: mockMediaDevices,
  writable: true,
  configurable: true,
});

// Mock MediaStream
global.MediaStream = class MockMediaStream {
  constructor(tracks = []) {
    this.id = `mock-stream-${Date.now()}`;
    this._tracks = tracks;
    this.active = true;
  }

  getTracks() {
    return this._tracks;
  }

  getVideoTracks() {
    return this._tracks.filter(t => t.kind === 'video');
  }

  getAudioTracks() {
    return this._tracks.filter(t => t.kind === 'audio');
  }

  addTrack(track) {
    this._tracks.push(track);
  }

  removeTrack(track) {
    const index = this._tracks.indexOf(track);
    if (index > -1) this._tracks.splice(index, 1);
  }
};

// Mock MediaStreamTrack
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

  getSettings() {
    return this._settings;
  }

  getCapabilities() {
    return this._capabilities;
  }

  applyConstraints(constraints) {
    return Promise.resolve();
  }

  stop() {
    this.readyState = 'ended';
  }

  clone() {
    const cloned = new MockMediaStreamTrack(this.kind);
    cloned._settings = { ...this._settings };
    return cloned;
  }
};

// Mock HTMLVideoElement extensions
HTMLVideoElement.prototype.requestVideoFrameCallback = vi.fn((callback) => {
  return requestAnimationFrame(() => callback(performance.now(), {}));
});

HTMLVideoElement.prototype.cancelVideoFrameCallback = vi.fn((id) => {
  cancelAnimationFrame(id);
});

// Mock canvas context
const mockCanvasContext = {
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
  webkitImageSmoothingEnabled: false,
  mozImageSmoothingEnabled: false,
  msImageSmoothingEnabled: false,
  fillStyle: '#000000',
};

HTMLCanvasElement.prototype.getContext = vi.fn((type, options) => {
  if (type === '2d') {
    return mockCanvasContext;
  }
  return null;
});

HTMLCanvasElement.prototype.toBlob = vi.fn((callback, type, quality) => {
  const blob = new Blob(['mock-image-data'], { type: type || 'image/png' });
  setTimeout(() => callback(blob), 0);
});

HTMLCanvasElement.prototype.toDataURL = vi.fn((type, quality) => {
  return 'data:image/png;base64,mockImageData';
});

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
  mockCanvasContext.drawImage.mockClear();
  mockCanvasContext.fillRect.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Export mocks for use in tests
export {
  mockMediaDevices,
  mockCanvasContext,
};
