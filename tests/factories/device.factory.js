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
  return {
    resolveStreamingTarget: vi.fn().mockResolvedValue(streamingTarget),
    ...overrides
  };
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
