export {
  DEFAULT_DEVICE_ID,
  DEFAULT_NATIVE_RESOLUTION,
  DeviceCatalog,
  getDeviceAcquisitionProfile,
  getDeviceStreamProfile
} from './domain/catalog.js';
export {
  matchByLabel,
  matchByUsb,
  matchDevice
} from './domain/matching.js';
export {
  toDeviceInfo,
  toDeviceInfoPayload,
  toDeviceStatusPayload
} from './domain/payloads.js';
export type {
  DeviceBehaviorPolicy,
  DeviceAcquisitionAttempt,
  DeviceAcquisitionConstraintDetail,
  DeviceAcquisitionProfile,
  DeviceCanvasResolution,
  DeviceCatalogApi,
  DeviceConnectionState,
  DeviceConstraintMap,
  DeviceDescriptor,
  DeviceDisplayProfile,
  DeviceFixtureAudioDescriptor,
  DeviceFixtureDescriptor,
  DeviceFixtureSpecs,
  DeviceId,
  DeviceInfo,
  DeviceInfoPayload,
  DeviceMatch,
  DeviceMatchReason,
  DeviceMediaAudioProfile,
  DeviceMediaFallbackStrategy,
  DeviceMediaProfile,
  DeviceNativeResolution,
  DeviceResolution,
  DeviceStatus,
  DeviceStatusPayload,
  DeviceStreamProfile,
  ObservedMediaDevice,
  ObservedUsbDevice,
  UsbIdentity
} from './domain/types.js';
