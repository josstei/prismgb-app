/**
 * Device Factory
 *
 * Creates mock device-related instances for testing.
 * Includes device runtime, device status and device info mocks.
 */

import { vi } from 'vitest';
import {
  DeviceCatalog,
  getDeviceAcquisitionProfile,
  getDeviceStreamProfile,
} from '@platform/devices';
import {
  createChromaticAudioDeviceInfo,
  createChromaticVideoDeviceInfo,
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
    dispose: vi.fn(),
    ...overrides
  };
}
