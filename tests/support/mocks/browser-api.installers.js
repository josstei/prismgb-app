import { vi } from 'vitest';

/**
 * Lightweight cleanup stack used by mock installers.
 */
function createCleanupStack() {
  const cleanups = [];

  return {
    add(cleanup) {
      cleanups.push(cleanup);
    },
    cleanup() {
      while (cleanups.length > 0) {
        const cleanup = cleanups.pop();
        cleanup();
      }
    },
  };
}

/**
 * Restores a property on a target by its descriptor.
 */
function installProperty(target, key, value) {
  const stack = createCleanupStack();
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  const hadProperty = Object.prototype.hasOwnProperty.call(target, key);

  vi.stubGlobal(key, value);

  stack.add(() => {
    try {
      if (descriptor) {
        Object.defineProperty(target, key, descriptor);
      } else if (hadProperty) {
        Reflect.deleteProperty(target, key);
      } else {
        Reflect.deleteProperty(target, key);
      }
    } catch {
      Reflect.deleteProperty(target, key);
    }
  });

  return stack;
}

/**
 * Canonical RAF installer.
 */
function installAnimationFrameMockInternal() {
  const stack = createCleanupStack();

  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

  const mockRequestAnimationFrame = vi.fn((callback) => {
    return setTimeout(() => {
      callback(performance.now());
    }, 16);
  });

  const mockCancelAnimationFrame = vi.fn((id) => {
    clearTimeout(id);
  });

  vi.stubGlobal('requestAnimationFrame', mockRequestAnimationFrame);
  vi.stubGlobal('cancelAnimationFrame', mockCancelAnimationFrame);

  stack.add(() => {
    if (typeof originalRequestAnimationFrame === 'undefined') {
      Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
      Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
      return;
    }
    vi.stubGlobal('requestAnimationFrame', originalRequestAnimationFrame);
    vi.stubGlobal(
      'cancelAnimationFrame',
      typeof originalCancelAnimationFrame === 'undefined'
        ? () => undefined
        : originalCancelAnimationFrame
    );
  });

  return {
    ...stack,
    requestAnimationFrame: mockRequestAnimationFrame,
    cancelAnimationFrame: mockCancelAnimationFrame,
  };
}

/**
 * Canonical video-frame installer.
 */
function installVideoFrameCallbacksMockInternal() {
  const stack = createCleanupStack();

  const originalRequest = HTMLVideoElement.prototype.requestVideoFrameCallback;
  const originalCancel = HTMLVideoElement.prototype.cancelVideoFrameCallback;

  const mockRequestVideoFrameCallback = vi.fn((callback) => {
    const now = performance.now();
    return setTimeout(() => callback(now, { presentationTime: now }), 0);
  });

  const mockCancelVideoFrameCallback = vi.fn((id) => {
    clearTimeout(id);
  });

  Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', {
    configurable: true,
    writable: true,
    value: mockRequestVideoFrameCallback,
  });

  Object.defineProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', {
    configurable: true,
    writable: true,
    value: mockCancelVideoFrameCallback,
  });

  stack.add(() => {
    if (typeof originalRequest === 'undefined') {
      delete HTMLVideoElement.prototype.requestVideoFrameCallback;
    } else {
      Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', {
        configurable: true,
        writable: true,
        value: originalRequest,
      });
    }

    if (typeof originalCancel === 'undefined') {
      delete HTMLVideoElement.prototype.cancelVideoFrameCallback;
    } else {
      Object.defineProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', {
        configurable: true,
        writable: true,
        value: originalCancel,
      });
    }
  });

  return {
    ...stack,
    requestVideoFrameCallback: mockRequestVideoFrameCallback,
    cancelVideoFrameCallback: mockCancelVideoFrameCallback,
  };
}

/**
 * Canonical canvas and drawing context installer.
 */
function installCanvasMocksInternal(options = {}) {
  const stack = createCleanupStack();

  const { context = {} } = options;

  const defaultContext = {
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
    ...context,
  };

  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalToBlob = HTMLCanvasElement.prototype.toBlob;
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;

  const mockGetContext = vi.fn((type) => {
    if (type === '2d') {
      return defaultContext;
    }

    if (typeof originalGetContext === 'function') {
      return originalGetContext(type);
    }

    return null;
  });

  const mockToBlob = vi.fn((callback, type, quality) => {
    const blob = new Blob([`mock-image-data:${quality ?? 'default'}`], {
      type: type || 'image/png',
    });
    setTimeout(() => callback(blob), 0);
  });

  const mockToDataURL = vi.fn((type = 'image/png', quality = 0.92) => {
    if (typeof type === 'string' && type.includes('avif')) {
      return 'data:image/avif;base64,mockImageData';
    }
    if (typeof type === 'string' && type.includes('webp')) {
      return 'data:image/webp;base64,mockImageData';
    }
    return `data:${type};base64,mockImageData${String(quality)}`;
  });

  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: mockGetContext,
  });

  Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    configurable: true,
    writable: true,
    value: mockToBlob,
  });

  Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
    configurable: true,
    writable: true,
    value: mockToDataURL,
  });

  stack.add(() => {
    if (typeof originalGetContext === 'undefined') {
      delete HTMLCanvasElement.prototype.getContext;
    } else {
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        writable: true,
        value: originalGetContext,
      });
    }

    if (typeof originalToBlob === 'undefined') {
      delete HTMLCanvasElement.prototype.toBlob;
    } else {
      Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
        configurable: true,
        writable: true,
        value: originalToBlob,
      });
    }

    if (typeof originalToDataURL === 'undefined') {
      delete HTMLCanvasElement.prototype.toDataURL;
    } else {
      Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
        configurable: true,
        writable: true,
        value: originalToDataURL,
      });
    }
  });

  return {
    ...stack,
    context: defaultContext,
  };
}

/**
 * Canonical ResizeObserver installer.
 */
function installResizeObserverMockInternal() {
  const stack = createCleanupStack();

  class MockResizeObserver {
    constructor(callback) {
      this.observe = vi.fn();
      this.unobserve = vi.fn();
      this.disconnect = vi.fn();
      this.callback = callback;
    }
  }

  const original = globalThis.ResizeObserver;
  vi.stubGlobal('ResizeObserver', MockResizeObserver);

  stack.add(() => {
    if (typeof original === 'undefined') {
      Reflect.deleteProperty(globalThis, 'ResizeObserver');
    } else {
      vi.stubGlobal('ResizeObserver', original);
    }
  });

  return {
    ...stack,
    ResizeObserver: MockResizeObserver,
  };
}

/**
 * Canonical performance API installer.
 */
function installPerformanceMocksInternal() {
  const stack = createCleanupStack();

  const performanceNow = performance.now.bind(performance);
  let now = 0;
  const marks = new Map();
  const measures = [];

  const mockPerformance = {
    now: vi.fn(() => {
      const value = now;
      now += 1;
      return value;
    }),
    mark: vi.fn((name) => {
      marks.set(name, performanceNow());
    }),
    measure: vi.fn((name, startMark, endMark) => {
      const start = marks.get(startMark) || 0;
      const end = marks.get(endMark) || performanceNow();
      measures.push({ name, duration: end - start, startMark, endMark, start, end });
    }),
    getEntriesByName: vi.fn((name) => {
      return measures.filter((measure) => measure.name === name);
    }),
    clearMarks: vi.fn(() => marks.clear()),
    clearMeasures: vi.fn(() => {
      measures.length = 0;
    }),
  };

  const previousPerformance = globalThis.performance;

  vi.stubGlobal('performance', {
    ...globalThis.performance,
    ...mockPerformance,
  });

  stack.add(() => {
    vi.stubGlobal('performance', previousPerformance);
  });

  return {
    ...stack,
    performance: mockPerformance,
  };
}

/**
 * Canonical mediaDevices installer with media stream helpers.
 */
function installMediaMocksInternal(options = {}) {
  const stack = createCleanupStack();

  const {
    devices = [],
    stream = { getTracks: () => [] },
    enumerateDevices,
    getUserMedia,
    addEventListener,
    removeEventListener,
  } = options;

  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  const deviceChangeListeners = [];
  const streamFactory = typeof getUserMedia === 'function' ? getUserMedia : () => stream;
  const enumerate = typeof enumerateDevices === 'function'
    ? enumerateDevices
    : async () => devices;

  const baseMediaDevices = {
    enumerateDevices: vi.fn(() => Promise.resolve(enumerate())),
    getUserMedia: vi.fn(async (constraints) => streamFactory(constraints)),
    addEventListener: vi.fn((event, listener) => {
      if (event === 'devicechange') {
        deviceChangeListeners.push(listener);
      }
      if (typeof addEventListener === 'function') {
        return addEventListener(event, listener);
      }
      return undefined;
    }),
    removeEventListener: vi.fn((event, listener) => {
      if (event === 'devicechange') {
        const idx = deviceChangeListeners.indexOf(listener);
        if (idx > -1) {
          deviceChangeListeners.splice(idx, 1);
        }
      }
      if (typeof removeEventListener === 'function') {
        return removeEventListener(event, listener);
      }
      return undefined;
    }),
    _deviceChangeListeners: deviceChangeListeners,
  };

  const mockMediaDevices = {
    ...baseMediaDevices,
    _emitDeviceChange: (detail = {}) => {
      deviceChangeListeners.slice().forEach((handler) => {
        handler({ type: 'devicechange', ...detail });
      });
    }
  };

  const navigatorPatch = {
    ...(globalThis.navigator || {}),
    mediaDevices: {
      ...((globalThis.navigator && globalThis.navigator.mediaDevices) || {}),
      ...mockMediaDevices,
    },
  };

  if (typeof globalThis.navigator === 'undefined') {
    vi.stubGlobal('navigator', navigatorPatch);
  } else {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      writable: true,
      value: navigatorPatch,
    });
  }

  const NavigatorMediaStream = class {
    constructor(tracks = []) {
      this.id = `mock-stream-${Math.random().toString(16).slice(2)}`;
      this._tracks = tracks;
      this.active = true;
    }

    getTracks() {
      return this._tracks;
    }

    getVideoTracks() {
      return this._tracks.filter((track) => track.kind === 'video');
    }

    getAudioTracks() {
      return this._tracks.filter((track) => track.kind === 'audio');
    }

    addTrack(track) {
      this._tracks.push(track);
    }

    removeTrack(track) {
      const index = this._tracks.indexOf(track);
      if (index > -1) {
        this._tracks.splice(index, 1);
      }
    }
  };

  const NavigatorMediaStreamTrack = class {
    constructor(kind = 'video') {
      this.id = `mock-track-${Math.random().toString(16).slice(2)}`;
      this.kind = kind;
      this.readyState = 'live';
      this.enabled = true;
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

    applyConstraints() {
      return Promise.resolve();
    }

    stop() {
      this.readyState = 'ended';
    }

    clone() {
      const cloned = new NavigatorMediaStreamTrack(this.kind);
      cloned._settings = { ...this._settings };
      cloned._capabilities = { ...this._capabilities };
      return cloned;
    }
  };

  stack.add(() => {
    if (navigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    } else if (typeof globalThis.navigator === 'undefined') {
      Reflect.deleteProperty(globalThis, 'navigator');
    } else if (globalThis.navigator) {
      delete globalThis.navigator;
    }
  });

  const mediaStreamStack = installProperty(globalThis, 'MediaStream', NavigatorMediaStream);
  const mediaStreamTrackStack = installProperty(globalThis, 'MediaStreamTrack', NavigatorMediaStreamTrack);
  stack.add(() => {
    mediaStreamStack.cleanup();
    mediaStreamTrackStack.cleanup();
  });

  return {
    ...stack,
    mediaDevices: mockMediaDevices,
    NavigatorMediaStream,
    NavigatorMediaStreamTrack,
  };
}

export {
  createCleanupStack,
  installAnimationFrameMock,
  installCanvasMocks,
  installMediaMocks,
  installResizeObserverMock,
  installVideoFrameCallbacksMock,
  installPerformanceApiMock,
};

export const installRafMock = installAnimationFrameMock;
export const installCanvasMock = installCanvasMocks;
export const installVideoFrameMock = installVideoFrameCallbacksMock;

function installAnimationFrameMock() {
  return installAnimationFrameMockInternal();
}

function installCanvasMocks(options) {
  return installCanvasMocksInternal(options);
}

function installMediaMocks(options) {
  return installMediaMocksInternal(options);
}

function installResizeObserverMock() {
  return installResizeObserverMockInternal();
}

function installVideoFrameCallbacksMock() {
  return installVideoFrameCallbacksMockInternal();
}

function installPerformanceApiMock() {
  return installPerformanceMocksInternal();
}
