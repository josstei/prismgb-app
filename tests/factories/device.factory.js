/**
 * Device Factory
 *
 * Creates mock device-related instances for testing.
 * Includes device directory, media stream, and device info mocks.
 */

import { vi } from 'vitest';
import {
  DeviceCatalog,
  getDeviceAcquisitionProfile,
  getDeviceStreamProfile,
} from '@prismgb/devices';
import {
  CHROMATIC_SPECS,
  createChromaticAudioDeviceInfo,
  createChromaticMediaStream,
  createChromaticVideoDeviceInfo,
  createChromaticVideoTrack,
} from '../devices/media.testkit.ts';

/**
 * Creates a mock DeviceInfo object
 * @param {Object} overrides - Property overrides
 * @returns {Object} DeviceInfo object
 */
export function createDeviceInfo(overrides = {}) {
  return createChromaticVideoDeviceInfo(overrides);
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
    deviceId = CHROMATIC_SPECS.deviceId,
    label = CHROMATIC_SPECS.label,
    settings = {},
    capabilities = {},
    constraints = {},
    ...trackOverrides
  } = options;

  return createChromaticVideoTrack({
    label,
    settings: {
      deviceId,
      width,
      height,
      frameRate,
      aspectRatio: width / height,
      ...settings
    },
    capabilities: {
      deviceId,
      width: { min: width, max: width },
      height: { min: height, max: height },
      frameRate: { min: Math.min(...CHROMATIC_SPECS.frameRates), max: Math.max(...CHROMATIC_SPECS.frameRates) },
      ...capabilities
    },
    constraints: {
      deviceId: { exact: deviceId },
      width: { exact: width },
      height: { exact: height },
      frameRate: { ideal: frameRate },
      ...constraints
    },
    ...trackOverrides
  });
}

/**
 * Creates a mock MediaStream
 * @param {Object} options - Stream options
 * @returns {Object} Mock MediaStream
 */
export function createMediaStream(options = {}) {
  const videoTrack = createVideoTrack(options);
  const stream = createChromaticMediaStream({
    ...options,
    includeAudio: false,
    tracks: [videoTrack]
  });

  return {
    ...stream,
    _videoTrack: videoTrack,
  };
}

/**
 * Creates a mock device directory.
 * @param {Object} options - Service options
 * @returns {Object} Mock device directory.
 */
export function createRendererDeviceRuntimeMock(overrides = {}) {
  const descriptor = DeviceCatalog.default();
  const videoDevice = createDeviceInfo();
  const audioDevice = createChromaticAudioDeviceInfo();
  const streamingTarget = {
    videoDevice,
    audioDevice,
    descriptor,
    profile: getDeviceStreamProfile(descriptor),
    acquisition: getDeviceAcquisitionProfile(descriptor)
  };
  const snapshot = {
    status: {
      state: 'disconnected',
      connected: false,
      device: null,
      updatedAt: 0
    },
    supportedDevices: [],
    selectedDeviceId: null,
    hasMediaPermission: false,
    lastEnumerationAt: null
  };

  const runtime = /** @type {any} */ ({
    get isConnected() {
      return runtime.snapshot().status.connected;
    },
    get selectedDevice() {
      const selectedDeviceId = runtime.selectedDeviceId;
      return selectedDeviceId
        ? runtime.snapshot().supportedDevices.find((device) => device.deviceId === selectedDeviceId) || null
        : null;
    },
    get selectedDeviceId() {
      return runtime.snapshot().selectedDeviceId;
    },
    initialize: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn(() => snapshot.status),
    refreshStatus: vi.fn().mockResolvedValue(snapshot.status),
    refresh: vi.fn().mockResolvedValue(snapshot),
    snapshot: vi.fn(() => snapshot),
    enumerateDevices: vi.fn().mockResolvedValue({ devices: snapshot.supportedDevices, connected: snapshot.status.connected }),
    resolveStreamingTarget: vi.fn().mockResolvedValue(streamingTarget),
    ...overrides
  });

  return runtime;
}

export function createDeviceStatusComponentMock(overrides = {}) {
  return {
    updateStatus: vi.fn(),
    updateOverlayMessage: vi.fn(),
    showError: vi.fn(),
    setOverlayVisible: vi.fn(),
    ...overrides
  };
}

export default {
  createDeviceInfo,
  createVideoTrack,
  createMediaStream,
  createRendererDeviceRuntimeMock,
  createDeviceStatusComponentMock,
};
