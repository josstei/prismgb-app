/**
 * Device Fixtures
 *
 * Centralized test data for device-related tests.
 * Use these fixtures instead of hardcoded values.
 */

import { CHROMATIC_SPECS } from '../devices/media.testkit.ts';

/**
 * Chromatic device fixture
 */
export const CHROMATIC_DEVICE = {
  deviceId: CHROMATIC_SPECS.deviceId,
  label: CHROMATIC_SPECS.label,
  kind: 'videoinput',
  groupId: CHROMATIC_SPECS.groupId,
  specs: {
    vendorId: CHROMATIC_SPECS.vendorId,
    productId: CHROMATIC_SPECS.productId,
    nativeWidth: CHROMATIC_SPECS.nativeWidth,
    nativeHeight: CHROMATIC_SPECS.nativeHeight,
    frameRates: CHROMATIC_SPECS.frameRates,
    defaultFrameRate: CHROMATIC_SPECS.defaultFrameRate,
  },
};

/**
 * Generic USB camera fixture
 */
export const GENERIC_CAMERA = {
  deviceId: 'test-generic-camera-001',
  label: 'USB 2.0 Camera',
  kind: 'videoinput',
  groupId: 'test-generic-group',
  specs: {
    nativeWidth: 640,
    nativeHeight: 480,
    frameRates: [15, 30],
    defaultFrameRate: 30,
  },
};

/**
 * Unsupported device fixture
 */
export const UNSUPPORTED_DEVICE = {
  deviceId: 'test-unsupported-device-001',
  label: 'Unknown Capture Card',
  kind: 'videoinput',
  groupId: 'test-unsupported-group',
};

/**
 * Multiple devices fixture for enumeration tests
 */
export const MULTIPLE_DEVICES = [
  CHROMATIC_DEVICE,
  GENERIC_CAMERA,
  {
    deviceId: 'test-webcam-001',
    label: 'HD Webcam',
    kind: 'videoinput',
    groupId: 'test-webcam-group',
  },
];

/**
 * Device capabilities fixture for Chromatic
 */
export const CHROMATIC_CAPABILITIES = {
  nativeResolution: {
    width: CHROMATIC_SPECS.nativeWidth,
    height: CHROMATIC_SPECS.nativeHeight,
  },
  supportedFrameRates: CHROMATIC_SPECS.frameRates,
  canvasScale: 4,
  deviceName: CHROMATIC_SPECS.label,
};

/**
 * Stream settings fixture for Chromatic
 */
export const CHROMATIC_STREAM_SETTINGS = {
  deviceId: CHROMATIC_DEVICE.deviceId,
  width: CHROMATIC_SPECS.nativeWidth,
  height: CHROMATIC_SPECS.nativeHeight,
  frameRate: CHROMATIC_SPECS.defaultFrameRate,
  aspectRatio: CHROMATIC_SPECS.nativeWidth / CHROMATIC_SPECS.nativeHeight,
};

/**
 * Track capabilities fixture
 */
export const TRACK_CAPABILITIES = {
  deviceId: CHROMATIC_DEVICE.deviceId,
  width: { min: CHROMATIC_SPECS.nativeWidth, max: CHROMATIC_SPECS.nativeWidth },
  height: { min: CHROMATIC_SPECS.nativeHeight, max: CHROMATIC_SPECS.nativeHeight },
  frameRate: { min: 30, max: 60 },
  aspectRatio: {
    min: CHROMATIC_SPECS.nativeWidth / CHROMATIC_SPECS.nativeHeight,
    max: CHROMATIC_SPECS.nativeWidth / CHROMATIC_SPECS.nativeHeight,
  },
};

/**
 * USB device info fixture (for main process)
 */
export const USB_DEVICE_INFO = {
  vendorId: CHROMATIC_SPECS.vendorId,
  productId: CHROMATIC_SPECS.productId,
  deviceName: CHROMATIC_SPECS.label,
  manufacturer: CHROMATIC_SPECS.manufacturer,
  serialNumber: 'TEST-001',
  deviceClass: CHROMATIC_SPECS.alternateDeviceClass,
};

/**
 * Creates a custom device fixture
 * @param {Object} overrides - Properties to override
 * @returns {Object} Device fixture
 */
export function createDeviceFixture(overrides = {}) {
  return {
    ...CHROMATIC_DEVICE,
    deviceId: `test-device-${Date.now()}`,
    ...overrides,
  };
}

/**
 * Creates a device list fixture
 * @param {number} count - Number of devices
 * @returns {Array} Device list
 */
export function createDeviceListFixture(count = 3) {
  return Array.from({ length: count }, (_, i) =>
    createDeviceFixture({
      deviceId: `test-device-${i + 1}`,
      label: `Test Device ${i + 1}`,
    })
  );
}

export default {
  CHROMATIC_DEVICE,
  GENERIC_CAMERA,
  UNSUPPORTED_DEVICE,
  MULTIPLE_DEVICES,
  CHROMATIC_CAPABILITIES,
  CHROMATIC_STREAM_SETTINGS,
  TRACK_CAPABILITIES,
  USB_DEVICE_INFO,
  createDeviceFixture,
  createDeviceListFixture,
};
