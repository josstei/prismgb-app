import { vi } from 'vitest';
import { createMediaRecorderMock } from '../../../factories/capture.factory.js';
import { createCleanupStack, installTargetProperty } from '../runtime-property.installers.js';

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


  return {
    ...stack,
    mediaDevices: installedMediaDevices,
  };
}

/**
 * Canonical MediaRecorder installer for recording-service tests.
 */
export function installMediaRecorderMock() {
  class MockMediaRecorder {
    static isTypeSupported = vi.fn(() => true);

    constructor(stream, options) {
      Object.defineProperties(this, Object.getOwnPropertyDescriptors(
        createMediaRecorderMock({ stream, options, state: 'inactive' })
      ));
      this.start.mockImplementation(() => { this.state = 'recording'; });
      this.stop.mockImplementation(() => {
        this.state = 'inactive';
        this.dispatchEvent({ type: 'stop' });
      });
    }
  }
  return {
    ...installTargetProperty(globalThis, 'MediaRecorder', MockMediaRecorder),
    MediaRecorder: MockMediaRecorder,
    isTypeSupported: MockMediaRecorder.isTypeSupported
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
