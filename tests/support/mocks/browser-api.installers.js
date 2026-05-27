import { vi } from 'vitest';
import { createCleanupStack, installTargetProperty } from './runtime-property.installers.js';

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

function installWindowProperty(key, value) {
  const target = globalThis.window;

  if (!target) {
    throw new Error(`Cannot install window.${String(key)} mock without a window global`);
  }

  return installTargetProperty(target, key, value);
}

function installMissingWindowMockInternal() {
  const stack = createCleanupStack();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');

  Reflect.deleteProperty(globalThis, 'window');

  stack.add(() => {
    if (descriptor) {
      Object.defineProperty(globalThis, 'window', descriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  });

  return stack;
}

/**
 * Canonical RAF installer.
 */
function installAnimationFrameMockInternal(options = {}) {
  const stack = createCleanupStack();

  const mockRequestAnimationFrame = options.requestAnimationFrame ?? vi.fn((callback) => {
    return setTimeout(() => {
      callback(performance.now());
    }, 16);
  });

  const mockCancelAnimationFrame = options.cancelAnimationFrame ?? vi.fn((id) => {
    clearTimeout(id);
  });

  [
    installProperty(globalThis, 'requestAnimationFrame', mockRequestAnimationFrame),
    installProperty(globalThis, 'cancelAnimationFrame', mockCancelAnimationFrame),
  ].forEach((propertyStack) => stack.add(() => propertyStack.cleanup()));

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
 * Canonical devicePixelRatio installer.
 */
function installDevicePixelRatioMockInternal(value = 1) {
  const stack = installProperty(globalThis, 'devicePixelRatio', value);

  return {
    ...stack,
    devicePixelRatio: value,
  };
}

/**
 * Canonical Worker constructor installer.
 */
function installWorkerMockInternal(options = {}) {
  const workers = [];
  const createWorker = options.createWorker ?? (() => ({
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null,
    onerror: null,
  }));

  const mockWorkerConstructor = options.Worker ?? vi.fn(function Worker(...args) {
    const worker = createWorker(...args);
    workers.push(worker);
    return worker;
  });

  return {
    ...installProperty(globalThis, 'Worker', mockWorkerConstructor),
    Worker: mockWorkerConstructor,
    workers,
    getLatestWorker: () => workers[workers.length - 1] ?? null,
  };
}

/**
 * Canonical createImageBitmap installer.
 */
function installCreateImageBitmapMockInternal(options = {}) {
  const imageBitmap = options.imageBitmap ?? { close: vi.fn() };
  const mockCreateImageBitmap = options.createImageBitmap ?? vi.fn().mockResolvedValue(imageBitmap);
  const stack = installProperty(globalThis, 'createImageBitmap', mockCreateImageBitmap);

  return {
    ...stack,
    createImageBitmap: mockCreateImageBitmap,
    imageBitmap,
  };
}

/**
 * Canonical worker scope installer for tests that import worker entry modules.
 */
function installWorkerScopeMockInternal(options = {}) {
  const postedMessages = options.postedMessages ?? [];
  const close = options.close ?? vi.fn();
  const postMessage = options.postMessage ?? vi.fn((...args) => {
    postedMessages.push(args);
  });
  const scope = options.scope ?? {
    onmessage: null,
    postMessage,
    close,
  };
  const stack = installTargetProperty(globalThis, 'self', scope);

  return {
    ...stack,
    scope,
    postedMessages,
    postMessage,
    close,
  };
}

function installDocumentPropertyMockInternal(key, value) {
  if (!globalThis.document) {
    throw new Error(`Cannot install document.${String(key)} mock without a document global`);
  }
  return installTargetProperty(globalThis.document, key, value);
}

function installWindowPropertyMockInternal(key, value) {
  if (!globalThis.window) {
    throw new Error(`Cannot install window.${String(key)} mock without a window global`);
  }
  return installTargetProperty(globalThis.window, key, value);
}

/**
 * Canonical window.getComputedStyle installer.
 */
function installGetComputedStyleMockInternal(implementation = () => ({})) {
  const mockGetComputedStyle = vi.fn(implementation);
  const stack = installWindowProperty('getComputedStyle', mockGetComputedStyle);

  return {
    ...stack,
    getComputedStyle: mockGetComputedStyle,
  };
}

/**
 * Canonical document.createElement installer.
 */
function installDocumentCreateElementMockInternal(options = {}) {
  const documentTarget = globalThis.document;

  if (!documentTarget) {
    throw new Error('Cannot install document.createElement mock without a document global');
  }

  const createElement = options.createElement ?? vi.fn(() => (
    options.element ?? {
      id: '',
      className: '',
      style: {},
    }
  ));
  const shouldInstallBodyMethods = Object.prototype.hasOwnProperty.call(options, 'appendChild') || Object.prototype.hasOwnProperty.call(options, 'removeChild');
  const bodyTarget = shouldInstallBodyMethods ? (options.body ?? documentTarget.body) : null;
  let appendChild;
  let removeChild;

  if (shouldInstallBodyMethods) {
    if (!bodyTarget) {
      throw new Error('Cannot install document.body mock without document.body');
    }

    appendChild = options.appendChild;
    removeChild = options.removeChild;
  }

  const stack = createCleanupStack();
  const createElementStack = installTargetProperty(documentTarget, 'createElement', createElement);
  stack.add(() => createElementStack.cleanup());

  if (shouldInstallBodyMethods) {
    if (appendChild) {
      const appendChildStack = installTargetProperty(bodyTarget, 'appendChild', appendChild);
      stack.add(() => appendChildStack.cleanup());
    }

    if (removeChild) {
      const removeChildStack = installTargetProperty(bodyTarget, 'removeChild', removeChild);
      stack.add(() => removeChildStack.cleanup());
    }
  }

  return {
    ...stack,
    createElement,
    appendChild,
    removeChild,
  };
}

/**
 * Canonical fullscreen document installer.
 */
function installFullscreenDocumentMockInternal(options = {}) {
  const requestFullscreen = options.requestFullscreen ?? vi.fn().mockResolvedValue(undefined);
  const documentElement = options.documentElement ?? {
    requestFullscreen,
  };
  const body = options.body ?? {
    classList: {
      add: vi.fn(),
      remove: vi.fn(),
    },
  };
  const exitFullscreen = options.exitFullscreen ?? vi.fn().mockResolvedValue(undefined);
  const addEventListener = options.addEventListener ?? vi.fn();
  const removeEventListener = options.removeEventListener ?? vi.fn();
  const documentMock = options.document ?? {
    fullscreenElement: options.fullscreenElement ?? null,
    documentElement,
    exitFullscreen,
    addEventListener,
    removeEventListener,
    body,
  };
  const stack = installProperty(globalThis, 'document', documentMock);

  return {
    ...stack,
    document: documentMock,
    documentElement,
    body,
    requestFullscreen,
    exitFullscreen,
    addEventListener,
    removeEventListener,
  };
}

/**
 * Canonical blob download installer for URL object URLs and anchor clicks.
 */
function installBlobDownloadMockInternal(options = {}) {
  const stack = createCleanupStack();
  const windowTarget = globalThis.window;
  const documentTarget = globalThis.document;

  if (!windowTarget) {
    throw new Error('Cannot install blob download mock without a window global');
  }
  if (!documentTarget?.body) {
    throw new Error('Cannot install blob download mock without document.body');
  }

  if (!windowTarget.URL) {
    const urlStack = installWindowProperty('URL', {});
    stack.add(() => urlStack.cleanup());
  }

  const objectUrl = options.objectUrl ?? 'blob:test';
  const anchor = options.anchor ?? {
    href: '',
    download: '',
    click: vi.fn(),
    style: {},
  };
  const createObjectURL = options.createObjectURL ?? vi.fn(() => objectUrl);
  const revokeObjectURL = options.revokeObjectURL ?? vi.fn();
  const createElement = options.createElement ?? vi.fn(() => anchor);
  const appendChild = options.appendChild ?? vi.fn((node) => node);
  const removeChild = options.removeChild ?? vi.fn((node) => node);

  [
    installTargetProperty(windowTarget.URL, 'createObjectURL', createObjectURL),
    installTargetProperty(windowTarget.URL, 'revokeObjectURL', revokeObjectURL),
    installTargetProperty(documentTarget, 'createElement', createElement),
    installTargetProperty(documentTarget.body, 'appendChild', appendChild),
    installTargetProperty(documentTarget.body, 'removeChild', removeChild),
  ].forEach((propertyStack) => stack.add(() => propertyStack.cleanup()));

  return {
    ...stack,
    anchor,
    objectUrl,
    createObjectURL,
    revokeObjectURL,
    createElement,
    appendChild,
    removeChild,
  };
}

/**
 * Canonical Blob constructor installer for tests that need deterministic size/type.
 */
function installBlobMockInternal(options = {}) {
  const MockBlob = options.BlobClass ?? class MockBlob {
    constructor(parts = [], blobOptions = {}) {
      this.parts = parts;
      this.type = blobOptions.type || options.defaultType || 'application/octet-stream';
      this.size = options.size ?? 1000;
    }
  };
  const stack = installProperty(globalThis, 'Blob', MockBlob);

  return {
    ...stack,
    Blob: MockBlob,
  };
}

/**
 * Canonical clipboard installer for Testing Library/user-event tests.
 */
function installClipboardMockInternal(options = {}) {
  const stack = createCleanupStack();
  const clipboardData = { text: options.text ?? '' };
  const clipboard = {
    writeText: options.writeText ?? vi.fn(async (text) => {
      clipboardData.text = String(text);
    }),
    readText: options.readText ?? vi.fn(async () => clipboardData.text),
    write: options.write ?? vi.fn(async () => undefined),
    read: options.read ?? vi.fn(async () => []),
    ...(options.clipboard ?? {}),
  };

  if (typeof globalThis.navigator === 'undefined') {
    const navigatorStack = installTargetProperty(globalThis, 'navigator', { clipboard });
    stack.add(() => navigatorStack.cleanup());
  } else {
    const clipboardStack = installTargetProperty(globalThis.navigator, 'clipboard', clipboard);
    stack.add(() => clipboardStack.cleanup());
  }

  return {
    ...stack,
    clipboard,
    clipboardData,
    writeText: clipboard.writeText,
    readText: clipboard.readText,
    write: clipboard.write,
    read: clipboard.read,
    setText(text) {
      clipboardData.text = String(text);
    },
    getText() {
      return clipboardData.text;
    },
  };
}

/**
 * Canonical MediaRecorder installer for recording-service tests.
 */
function installMediaRecorderMockInternal(options = {}) {
  const isTypeSupported = options.isTypeSupported ?? vi.fn(() => true);
  const MockMediaRecorder = options.MediaRecorderClass ?? class MockMediaRecorder {
    static isTypeSupported = isTypeSupported;

    constructor(stream, recorderOptions) {
      this.stream = stream;
      this.options = recorderOptions;
      this.state = 'inactive';
      this.ondataavailable = null;
      this.onerror = null;
      this.onstop = null;
      this.start = vi.fn(() => {
        this.state = 'recording';
      });
      this.stop = vi.fn(() => {
        this.state = 'inactive';
      });
    }
  };

  if (!MockMediaRecorder.isTypeSupported) {
    MockMediaRecorder.isTypeSupported = isTypeSupported;
  }

  const stack = installProperty(globalThis, 'MediaRecorder', MockMediaRecorder);

  return {
    ...stack,
    MediaRecorder: MockMediaRecorder,
    isTypeSupported: MockMediaRecorder.isTypeSupported,
  };
}

/**
 * Canonical navigator installer for browser adapter availability tests.
 */
function installNavigatorMockInternal(...args) {
  const value = args.length === 0 ? {} : args[0];

  return {
    ...installTargetProperty(globalThis, 'navigator', value),
    navigator: value,
  };
}

/**
 * Canonical window.matchMedia installer.
 */
function installMatchMediaMockInternal(options = {}) {
  const mediaQuery = options.mediaQuery ?? {
    matches: options.matches ?? false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const mockMatchMedia = vi.fn((query) => {
    if (typeof options.matchMedia === 'function') {
      return options.matchMedia(query, mediaQuery);
    }
    return mediaQuery;
  });
  const stack = installWindowProperty('matchMedia', mockMatchMedia);

  return {
    ...stack,
    matchMedia: mockMatchMedia,
    mediaQuery,
  };
}

/**
 * Canonical installer for tests that need MutationObserver absent.
 */
function installMissingMutationObserverMockInternal() {
  const stack = createCleanupStack();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'MutationObserver');

  Reflect.deleteProperty(globalThis, 'MutationObserver');

  stack.add(() => {
    if (descriptor) {
      Object.defineProperty(globalThis, 'MutationObserver', descriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'MutationObserver');
    }
  });

  return stack;
}

/**
 * Canonical localStorage installer with in-memory backing.
 */
function installLocalStorageMockInternal(options = {}) {
  const storageData = { ...(options.initialData || {}) };
  const behavior = {
    getItem: options.getItem,
    setItem: options.setItem,
    removeItem: options.removeItem,
    key: options.key,
    length: options.length,
  };
  const defaults = {
    getItem: (key) => storageData[key] ?? null,
    setItem: (key, value) => {
      storageData[key] = value;
    },
    removeItem: (key) => {
      delete storageData[key];
    },
    key: (index) => Object.keys(storageData)[index],
    length: () => Object.keys(storageData).length,
  };
  const context = {
    storageData,
    defaults,
  };
  const localStorage = options.localStorage ?? {
    getItem: vi.fn((key) => {
      if (typeof behavior.getItem === 'function') {
        return behavior.getItem(key, context);
      }
      return defaults.getItem(key);
    }),
    setItem: vi.fn((key, value) => {
      if (typeof behavior.setItem === 'function') {
        return behavior.setItem(key, value, context);
      }
      return defaults.setItem(key, value);
    }),
    removeItem: vi.fn((key) => {
      if (typeof behavior.removeItem === 'function') {
        return behavior.removeItem(key, context);
      }
      return defaults.removeItem(key);
    }),
    key: vi.fn((index) => {
      if (typeof behavior.key === 'function') {
        return behavior.key(index, context);
      }
      return defaults.key(index);
    }),
    get length() {
      if (typeof behavior.length === 'function') {
        return behavior.length(context);
      }
      if (typeof behavior.length === 'number') {
        return behavior.length;
      }
      return defaults.length();
    },
  };
  const stack = installProperty(globalThis, 'localStorage', localStorage);

  return {
    ...stack,
    localStorage,
    storageData,
    getItem: localStorage.getItem,
    setItem: localStorage.setItem,
    removeItem: localStorage.removeItem,
    key: localStorage.key,
    setGetItemImplementation(implementation) {
      behavior.getItem = implementation;
    },
    setSetItemImplementation(implementation) {
      behavior.setItem = implementation;
    },
    setRemoveItemImplementation(implementation) {
      behavior.removeItem = implementation;
    },
    setKeyImplementation(implementation) {
      behavior.key = implementation;
    },
    setLengthImplementation(implementation) {
      behavior.length = implementation;
    },
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
    getSupportedConstraints,
    addEventListener,
    removeEventListener,
  } = options;

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
    getSupportedConstraints: vi.fn(() => {
      if (typeof getSupportedConstraints === 'function') {
        return getSupportedConstraints();
      }
      return getSupportedConstraints ?? {};
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

  let installedMediaDevices = mockMediaDevices;

  if (typeof globalThis.navigator === 'undefined') {
    const navigatorStack = installTargetProperty(globalThis, 'navigator', {
      mediaDevices: mockMediaDevices,
    });
    stack.add(() => navigatorStack.cleanup());
  } else if (globalThis.navigator.mediaDevices && typeof globalThis.navigator.mediaDevices === 'object') {
    installedMediaDevices = globalThis.navigator.mediaDevices;
    Object.entries(mockMediaDevices).forEach(([key, value]) => {
      const mediaDevicesStack = installTargetProperty(installedMediaDevices, key, value);
      stack.add(() => mediaDevicesStack.cleanup());
    });
  } else {
    const mediaDevicesStack = installTargetProperty(globalThis.navigator, 'mediaDevices', mockMediaDevices);
    stack.add(() => mediaDevicesStack.cleanup());
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

  const mediaStreamStack = installProperty(globalThis, 'MediaStream', NavigatorMediaStream);
  const mediaStreamTrackStack = installProperty(globalThis, 'MediaStreamTrack', NavigatorMediaStreamTrack);
  stack.add(() => {
    mediaStreamStack.cleanup();
    mediaStreamTrackStack.cleanup();
  });

  return {
    ...stack,
    mediaDevices: installedMediaDevices,
    NavigatorMediaStream,
    NavigatorMediaStreamTrack,
  };
}

export {
  createCleanupStack,
  installTargetProperty,
  installAnimationFrameMock,
  installBlobMock,
  installBlobDownloadMock,
  installCanvasMocks,
  installClipboardMock,
  installCreateImageBitmapMock,
  installDevicePixelRatioMock,
  installDocumentPropertyMock,
  installDocumentCreateElementMock,
  installFullscreenDocumentMock,
  installGetComputedStyleMock,
  installLocalStorageMock,
  installMatchMediaMock,
  installMediaRecorderMock,
  installMediaMocks,
  installMissingMutationObserverMock,
  installMissingWindowMock,
  installNavigatorMock,
  installResizeObserverMock,
  installVideoFrameCallbacksMock,
  installPerformanceApiMock,
  installWorkerMock,
  installWorkerScopeMock,
  installWindowPropertyMock,
};

export const installRafMock = installAnimationFrameMock;
export const installBrowserBlobMock = installBlobMock;
export const installDownloadMock = installBlobDownloadMock;
export const installCanvasMock = installCanvasMocks;
export const installComputedStyleMock = installGetComputedStyleMock;
export const installVideoFrameMock = installVideoFrameCallbacksMock;

function installAnimationFrameMock(options) {
  return installAnimationFrameMockInternal(options);
}

function installBlobMock(options) {
  return installBlobMockInternal(options);
}

function installBlobDownloadMock(options) {
  return installBlobDownloadMockInternal(options);
}

function installCanvasMocks(options) {
  return installCanvasMocksInternal(options);
}

function installClipboardMock(options) {
  return installClipboardMockInternal(options);
}

function installCreateImageBitmapMock(options) {
  return installCreateImageBitmapMockInternal(options);
}

function installDevicePixelRatioMock(value) {
  return installDevicePixelRatioMockInternal(value);
}

function installDocumentCreateElementMock(options) {
  return installDocumentCreateElementMockInternal(options);
}

function installDocumentPropertyMock(key, value) {
  return installDocumentPropertyMockInternal(key, value);
}

function installFullscreenDocumentMock(options) {
  return installFullscreenDocumentMockInternal(options);
}

function installGetComputedStyleMock(implementation) {
  return installGetComputedStyleMockInternal(implementation);
}

function installLocalStorageMock(options) {
  return installLocalStorageMockInternal(options);
}

function installMatchMediaMock(options) {
  return installMatchMediaMockInternal(options);
}

function installMediaRecorderMock(options) {
  return installMediaRecorderMockInternal(options);
}

function installMediaMocks(options) {
  return installMediaMocksInternal(options);
}

function installMissingWindowMock() {
  return installMissingWindowMockInternal();
}

function installNavigatorMock(...args) {
  return installNavigatorMockInternal(...args);
}

function installMissingMutationObserverMock() {
  return installMissingMutationObserverMockInternal();
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

function installWorkerMock(options) {
  return installWorkerMockInternal(options);
}

function installWorkerScopeMock(options) {
  return installWorkerScopeMockInternal(options);
}

function installWindowPropertyMock(key, value) {
  return installWindowPropertyMockInternal(key, value);
}
