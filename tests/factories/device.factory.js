/**
 * Device Factory
 *
 * Creates mock device-related instances for testing.
 * Includes DeviceService, DeviceAdapter, and DeviceInfo mocks.
 */

import { vi } from 'vitest';
import { CHROMATIC_SPECS } from '../mocks/MockDevice.js';

/**
 * Device adapter states
 */
export const AdapterState = {
  UNINITIALIZED: 'uninitialized',
  INITIALIZING: 'initializing',
  READY: 'ready',
  STREAMING: 'streaming',
  ERROR: 'error',
  DISPOSED: 'disposed',
};

/**
 * Creates a mock DeviceInfo object
 * @param {Object} overrides - Property overrides
 * @returns {Object} DeviceInfo object
 */
export function createDeviceInfo(overrides = {}) {
  return {
    deviceId: `device-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    label: 'Chromatic',
    kind: 'videoinput',
    groupId: `group-${Date.now()}`,
    ...overrides,
  };
}

/**
 * Creates a mock video track
 * @param {Object} options - Track options
 * @returns {Object} Mock video track
 */
export function createVideoTrack(options = {}) {
  const {
    width = CHROMATIC_SPECS.nativeWidth,
    height = CHROMATIC_SPECS.nativeHeight,
    frameRate = CHROMATIC_SPECS.defaultFrameRate,
    deviceId = 'mock-device-id',
    label = 'Chromatic',
  } = options;

  let enabled = true;
  let readyState = 'live';

  const track = {
    id: `track-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    kind: 'video',
    label,
    get enabled() { return enabled; },
    set enabled(v) { enabled = v; },
    get readyState() { return readyState; },
    muted: false,

    getSettings: vi.fn(() => ({
      deviceId,
      width,
      height,
      frameRate,
      aspectRatio: width / height,
    })),

    getCapabilities: vi.fn(() => ({
      deviceId,
      width: { min: width, max: width },
      height: { min: height, max: height },
      frameRate: { min: 30, max: 60 },
    })),

    getConstraints: vi.fn(() => ({
      deviceId: { exact: deviceId },
      width: { exact: width },
      height: { exact: height },
    })),

    applyConstraints: vi.fn().mockResolvedValue(),

    clone: vi.fn(() => createVideoTrack(options)),

    stop: vi.fn(() => {
      readyState = 'ended';
      enabled = false;
    }),

    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };

  return track;
}

/**
 * Creates a mock MediaStream
 * @param {Object} options - Stream options
 * @returns {Object} Mock MediaStream
 */
export function createMediaStream(options = {}) {
  const videoTrack = createVideoTrack(options);
  const tracks = [videoTrack];

  return {
    id: `stream-${Date.now()}`,
    active: true,
    _tracks: tracks,

    getTracks: vi.fn(() => [...tracks]),
    getVideoTracks: vi.fn(() => tracks.filter(t => t.kind === 'video')),
    getAudioTracks: vi.fn(() => tracks.filter(t => t.kind === 'audio')),

    addTrack: vi.fn((track) => tracks.push(track)),
    removeTrack: vi.fn((track) => {
      const index = tracks.indexOf(track);
      if (index > -1) tracks.splice(index, 1);
    }),

    clone: vi.fn(() => createMediaStream(options)),

    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),

    // Test helpers
    _videoTrack: videoTrack,
  };
}

/**
 * Creates a mock DeviceAdapter
 * @param {Object} options - Adapter options
 * @returns {Object} Mock DeviceAdapter
 */
export function createDeviceAdapter(options = {}) {
  const {
    deviceId = 'mock-device-id',
    label = 'Chromatic',
    initialState = AdapterState.UNINITIALIZED,
  } = options;

  let state = initialState;
  let stream = null;

  const adapter = {
    deviceId,

    /**
     * Initialize the adapter
     */
    initialize: vi.fn(async () => {
      if (state !== AdapterState.UNINITIALIZED) {
        throw new Error(`Cannot initialize from state: ${state}`);
      }
      state = AdapterState.INITIALIZING;
      await Promise.resolve(); // Simulate async
      state = AdapterState.READY;
    }),

    /**
     * Get stream from device
     */
    getStream: vi.fn(async (constraints = {}) => {
      if (state !== AdapterState.READY) {
        throw new Error(`Cannot get stream from state: ${state}`);
      }
      state = AdapterState.STREAMING;
      stream = createMediaStream({ deviceId, label, ...constraints });
      return stream;
    }),

    /**
     * Release the stream
     */
    releaseStream: vi.fn(() => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
      }
      if (state === AdapterState.STREAMING) {
        state = AdapterState.READY;
      }
    }),

    /**
     * Get device capabilities
     */
    getCapabilities: vi.fn(() => ({
      nativeResolution: {
        width: CHROMATIC_SPECS.nativeWidth,
        height: CHROMATIC_SPECS.nativeHeight,
      },
      supportedFrameRates: CHROMATIC_SPECS.frameRates,
      canvasScale: 4,
      deviceName: label,
    })),

    /**
     * Get device profile
     */
    getProfile: vi.fn(() => ({
      deviceId,
      label,
      nativeWidth: CHROMATIC_SPECS.nativeWidth,
      nativeHeight: CHROMATIC_SPECS.nativeHeight,
    })),

    /**
     * Cleanup adapter
     */
    cleanup: vi.fn(() => {
      adapter.releaseStream();
      state = AdapterState.DISPOSED;
    }),

    // ==========================================
    // Test Helpers
    // ==========================================

    _getState() { return state; },
    _setState(s) { state = s; },
    _getStream() { return stream; },
    _setStream(s) { stream = s; },
    _reset() {
      state = AdapterState.UNINITIALIZED;
      stream = null;
      vi.clearAllMocks();
    },
  };

  return adapter;
}

/**
 * Creates a mock DeviceService
 * @param {Object} options - Service options
 * @returns {Object} Mock DeviceService
 */
export function createDeviceService(options = {}) {
  const {
    devices = [],
    registeredIds = [],
  } = options;

  const deviceList = devices.length > 0 ? devices : [createDeviceInfo()];

  const service = {
    /**
     * Enumerate available devices
     */
    enumerateDevices: vi.fn(async () => {
      return [...deviceList];
    }),

    /**
     * Find device by ID
     */
    findDevice: vi.fn(async (deviceId) => {
      return deviceList.find(d => d.deviceId === deviceId) || null;
    }),

    /**
     * Get registered stored device IDs
     */
    getRegisteredStoredDeviceIds: vi.fn(() => {
      return [...registeredIds];
    }),

    /**
     * Register a device ID
     */
    registerDeviceId: vi.fn((deviceId) => {
      if (!registeredIds.includes(deviceId)) {
        registeredIds.push(deviceId);
      }
    }),

    /**
     * Check if device is supported
     */
    isDeviceSupported: vi.fn((device) => {
      return device?.label?.toLowerCase().includes('chromatic') ?? false;
    }),

    // ==========================================
    // Test Helpers
    // ==========================================

    _getDevices() { return [...deviceList]; },
    _addDevice(device) { deviceList.push(device); },
    _removeDevice(deviceId) {
      const index = deviceList.findIndex(d => d.deviceId === deviceId);
      if (index > -1) deviceList.splice(index, 1);
    },
    _clearDevices() { deviceList.length = 0; },
    _reset() {
      deviceList.length = 0;
      registeredIds.length = 0;
      vi.clearAllMocks();
    },
  };

  return service;
}

/**
 * Creates a mock AdapterFactory
 * @param {Object} options - Factory options
 * @returns {Object} Mock AdapterFactory
 */
export function createAdapterFactory(options = {}) {
  const adapters = new Map();

  const factory = {
    /**
     * Create adapter for device
     */
    create: vi.fn((deviceId, label = 'Chromatic') => {
      const adapter = createDeviceAdapter({ deviceId, label });
      adapters.set(deviceId, adapter);
      return adapter;
    }),

    /**
     * Get existing adapter
     */
    get: vi.fn((deviceId) => adapters.get(deviceId) || null),

    /**
     * Remove adapter
     */
    remove: vi.fn((deviceId) => {
      const adapter = adapters.get(deviceId);
      if (adapter) {
        adapter.cleanup();
        adapters.delete(deviceId);
      }
    }),

    // Test helpers
    _adapters: adapters,
    _reset() {
      adapters.forEach(a => a.cleanup());
      adapters.clear();
      vi.clearAllMocks();
    },
  };

  return factory;
}

export default {
  createDeviceInfo,
  createVideoTrack,
  createMediaStream,
  createDeviceAdapter,
  createDeviceService,
  createAdapterFactory,
  AdapterState,
};
