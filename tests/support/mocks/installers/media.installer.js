import { vi } from 'vitest';
import { createCleanupStack, installTargetProperty } from '../runtime-property.installers.js';
import { installProperty } from './install-property.helper.js';

/**
 * Canonical mediaDevices installer with media stream helpers.
 */
export function installMediaMocks(options = {}) {
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

/**
 * Canonical MediaRecorder installer for recording-service tests.
 */
export function installMediaRecorderMock(options = {}) {
  const isTypeSupported = options.isTypeSupported ?? vi.fn(() => true);
  const MockMediaRecorder = options.MediaRecorderClass ?? class MockMediaRecorder {
    static isTypeSupported = isTypeSupported;

    constructor(stream, recorderOptions) {
      this.stream = stream;
      this.options = recorderOptions;
      this.state = 'inactive';
      this._listeners = {};
      this._ondataavailable = null;
      this._onerror = null;
      this._onstop = null;

      this.addEventListener = vi.fn((event, cb) => {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(cb);
      });

      this.removeEventListener = vi.fn((event, cb) => {
        if (this._listeners[event]) {
          this._listeners[event] = this._listeners[event].filter(l => l !== cb);
        }
      });

      this.dispatchEvent = vi.fn((eventObj) => {
        const type = eventObj.type;
        const listeners = this._listeners[type] || [];
        listeners.forEach(l => l(eventObj));
      });

      Object.defineProperty(this, 'ondataavailable', {
        get() {
          return (event) => {
            const list = this._listeners['dataavailable'] || [];
            list.forEach(l => l(event));
            if (this._ondataavailable) this._ondataavailable(event);
          };
        },
        set(cb) {
          this._ondataavailable = cb;
        },
        configurable: true
      });

      Object.defineProperty(this, 'onerror', {
        get() {
          return (event) => {
            const list = this._listeners['error'] || [];
            list.forEach(l => l(event));
            if (this._onerror) this._onerror(event);
          };
        },
        set(cb) {
          this._onerror = cb;
        },
        configurable: true
      });

      Object.defineProperty(this, 'onstop', {
        get() {
          return (event) => {
            const list = this._listeners['stop'] || [];
            list.forEach(l => l(event));
            if (this._onstop) this._onstop(event);
          };
        },
        set(cb) {
          this._onstop = cb;
        },
        configurable: true
      });

      this.start = vi.fn(() => {
        this.state = 'recording';
      });
      this.stop = vi.fn(() => {
        this.state = 'inactive';
        this.dispatchEvent({ type: 'stop' });
      });
      this.requestData = vi.fn();
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
export function installNavigatorMock(...args) {
  const value = args.length === 0 ? {} : args[0];

  return {
    ...installTargetProperty(globalThis, 'navigator', value),
    navigator: value,
  };
}
