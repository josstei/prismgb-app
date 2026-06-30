import {
  DeviceCatalog,
  toDeviceInfo,
  toDeviceInfoPayload,
  toDeviceStatusPayload
} from '@prismgb/devices';
import type {
  DeviceDescriptor,
  DeviceFixtureDescriptor,
  DeviceInfoPayload,
  DeviceStatusPayload,
  ObservedUsbDevice
} from '@prismgb/devices';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  for (const nestedValue of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nestedValue);
  }

  return Object.freeze(value);
}

function descriptorWithFixture(): DeviceDescriptor {
  const descriptor = DeviceCatalog.enabled().find((candidate) => candidate.fixture);
  if (!descriptor?.fixture) {
    throw new Error('Device catalog must expose a fixture-backed device for tests');
  }

  return descriptor;
}

export const CHROMATIC_DESCRIPTOR = descriptorWithFixture();
export const CHROMATIC_FIXTURE = CHROMATIC_DESCRIPTOR.fixture as DeviceFixtureDescriptor;

if (!CHROMATIC_FIXTURE.audio || !CHROMATIC_FIXTURE.audioDeviceId) {
  throw new Error('Chromatic fixture must define paired audio metadata');
}

export const CHROMATIC_SERIAL_NUMBER = 'MOCK-001';
export const CHROMATIC_AUDIO_LABEL = `${CHROMATIC_FIXTURE.label} Audio`;

export const CHROMATIC_SPECS = deepFreeze({
  id: CHROMATIC_DESCRIPTOR.id,
  vendorId: CHROMATIC_DESCRIPTOR.usb.vendorId,
  productId: CHROMATIC_DESCRIPTOR.usb.productId,
  deviceClass: CHROMATIC_DESCRIPTOR.usb.deviceClass,
  alternateDeviceClass: CHROMATIC_DESCRIPTOR.usb.alternateDeviceClass,
  hexVendorId: CHROMATIC_DESCRIPTOR.usb.hexVendorId,
  hexProductId: CHROMATIC_DESCRIPTOR.usb.hexProductId,
  name: CHROMATIC_FIXTURE.label,
  label: CHROMATIC_FIXTURE.label,
  manufacturer: CHROMATIC_DESCRIPTOR.manufacturer,
  nativeWidth: CHROMATIC_DESCRIPTOR.display.nativeWidth,
  nativeHeight: CHROMATIC_DESCRIPTOR.display.nativeHeight,
  aspectRatio: CHROMATIC_DESCRIPTOR.display.aspectRatio,
  frameRates: [...CHROMATIC_FIXTURE.supportedFrameRates],
  supportedFrameRates: [...CHROMATIC_FIXTURE.supportedFrameRates],
  defaultFrameRate: CHROMATIC_FIXTURE.defaultFrameRate,
  audioSampleRate: CHROMATIC_FIXTURE.audio.sampleRate,
  audioChannels: CHROMATIC_FIXTURE.audio.channels,
  deviceId: CHROMATIC_FIXTURE.videoDeviceId,
  audioDeviceId: CHROMATIC_FIXTURE.audioDeviceId,
  groupId: CHROMATIC_FIXTURE.groupId,
  labelPatterns: [...CHROMATIC_DESCRIPTOR.labelPatterns]
});

export const CHROMATIC_VIDEO_DEVICE_INFO = deepFreeze({
  deviceId: CHROMATIC_FIXTURE.videoDeviceId,
  groupId: CHROMATIC_FIXTURE.groupId,
  kind: 'videoinput' as MediaDeviceKind,
  label: CHROMATIC_FIXTURE.label
});

export const CHROMATIC_AUDIO_DEVICE_INFO = deepFreeze({
  deviceId: CHROMATIC_FIXTURE.audioDeviceId,
  groupId: CHROMATIC_FIXTURE.groupId,
  kind: 'audioinput' as MediaDeviceKind,
  label: CHROMATIC_AUDIO_LABEL
});

export const CHROMATIC_VIDEO_TRACK_SETTINGS = deepFreeze({
  deviceId: CHROMATIC_FIXTURE.videoDeviceId,
  groupId: CHROMATIC_FIXTURE.groupId,
  width: CHROMATIC_DESCRIPTOR.display.nativeWidth,
  height: CHROMATIC_DESCRIPTOR.display.nativeHeight,
  frameRate: CHROMATIC_FIXTURE.defaultFrameRate,
  aspectRatio: CHROMATIC_DESCRIPTOR.display.aspectRatio,
  facingMode: 'environment',
  resizeMode: 'none'
});

export const CHROMATIC_AUDIO_TRACK_SETTINGS = deepFreeze({
  deviceId: CHROMATIC_FIXTURE.audioDeviceId,
  groupId: CHROMATIC_FIXTURE.groupId,
  sampleRate: CHROMATIC_FIXTURE.audio.sampleRate,
  channelCount: CHROMATIC_FIXTURE.audio.channels,
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false
});

export const CHROMATIC_STREAM_CAPABILITIES = deepFreeze({
  frameRate: CHROMATIC_FIXTURE.defaultFrameRate,
  nativeResolution: {
    width: CHROMATIC_DESCRIPTOR.display.nativeWidth,
    height: CHROMATIC_DESCRIPTOR.display.nativeHeight
  },
  canvasResolution: {
    width: CHROMATIC_DESCRIPTOR.display.nativeWidth * 4,
    height: CHROMATIC_DESCRIPTOR.display.nativeHeight * 4,
    scale: 4
  },
  supportedFrameRates: [...CHROMATIC_FIXTURE.supportedFrameRates],
  hasVideo: true,
  hasAudio: true,
  audioSupport: true,
  fallbackStrategy: CHROMATIC_DESCRIPTOR.media.fallbackStrategy,
  deviceName: CHROMATIC_DESCRIPTOR.name
});

export function createChromaticUsbDeviceInfo(overrides: Partial<ObservedUsbDevice> = {}): ObservedUsbDevice {
  return {
    vendorId: CHROMATIC_DESCRIPTOR.usb.vendorId,
    productId: CHROMATIC_DESCRIPTOR.usb.productId,
    deviceClass: CHROMATIC_DESCRIPTOR.usb.deviceClass,
    deviceName: CHROMATIC_FIXTURE.label,
    manufacturer: CHROMATIC_DESCRIPTOR.manufacturer,
    serialNumber: CHROMATIC_SERIAL_NUMBER,
    ...overrides
  };
}

export function createChromaticDeviceInfoPayload(
  overrides: Partial<DeviceInfoPayload> = {}
): DeviceInfoPayload {
  const observed = createChromaticUsbDeviceInfo(overrides as Partial<ObservedUsbDevice>);
  return {
    ...toDeviceInfoPayload(toDeviceInfo(CHROMATIC_DESCRIPTOR, observed)),
    ...overrides
  };
}

export function createChromaticDeviceStatusPayload(
  connected = true,
  deviceOverrides: Partial<DeviceInfoPayload> = {}
): DeviceStatusPayload {
  return toDeviceStatusPayload({
    state: connected ? 'connected' : 'disconnected',
    connected,
    device: connected ? createChromaticDeviceInfoPayload(deviceOverrides) : null,
    updatedAt: 0
  });
}

export function createChromaticFrameData(overrides: Partial<{ width: number; height: number }> = {}) {
  const width = overrides.width ?? CHROMATIC_DESCRIPTOR.display.nativeWidth;
  const height = overrides.height ?? CHROMATIC_DESCRIPTOR.display.nativeHeight;

  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4).fill(128),
    timestamp: performance.now()
  };
}

export function mutableChromaticSpecs(overrides: Partial<Mutable<typeof CHROMATIC_SPECS>> = {}) {
  return {
    ...CHROMATIC_SPECS,
    ...overrides
  };
}
