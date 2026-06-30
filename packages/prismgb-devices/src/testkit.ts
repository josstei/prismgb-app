import {
  DeviceCatalog,
  getDeviceStreamProfile
} from './catalog.js';
import {
  toDeviceInfo,
  toDeviceInfoPayload
} from './payloads.js';
import type {
  DeviceDescriptor,
  DeviceFixtureFrameData,
  DeviceFixtureProfile,
  DeviceFixtureTrackSettings,
  DeviceId,
  DeviceInfoPayload,
  DeviceStatusPayload,
  ObservedMediaDevice,
  ObservedUsbDevice
} from './contracts.js';

type FixtureSource = DeviceId | DeviceDescriptor | undefined;

type FrameDataOverrides = Partial<{
  width: number;
  height: number;
  timestamp: number;
  fill: number;
}>;

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  for (const nestedValue of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nestedValue);
  }

  return Object.freeze(value);
}

function resolveDescriptor(source?: FixtureSource): DeviceDescriptor {
  if (typeof source === 'object') {
    return source;
  }

  return source ? DeviceCatalog.get(source) ?? DeviceCatalog.default() : DeviceCatalog.default();
}

function descriptorWithFixture(source?: FixtureSource): DeviceDescriptor {
  const descriptor = resolveDescriptor(source);
  if (descriptor.fixture) {
    return descriptor;
  }

  const fixtureBacked = DeviceCatalog.enabled().find((candidate) => candidate.fixture);
  if (!fixtureBacked?.fixture) {
    throw new Error('Device catalog must expose a fixture-backed device for tests');
  }

  return fixtureBacked;
}

function fixtureTimestamp(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function getDeviceFixtureProfile(source?: FixtureSource): DeviceFixtureProfile {
  const descriptor = descriptorWithFixture(source);
  const fixture = descriptor.fixture;
  if (!fixture) {
    throw new Error(`Device ${descriptor.id} does not define fixture metadata`);
  }

  if (!fixture.audio || !fixture.audioDeviceId) {
    throw new Error(`Device ${descriptor.id} fixture must define paired audio metadata`);
  }

  const audioLabel = `${fixture.label} Audio`;
  const usbDeviceInfo: ObservedUsbDevice = {
    vendorId: descriptor.usb.vendorId,
    productId: descriptor.usb.productId,
    deviceClass: descriptor.usb.deviceClass,
    deviceName: fixture.label,
    manufacturer: descriptor.manufacturer,
    serialNumber: 'MOCK-001'
  };
  const deviceInfoPayload = toDeviceInfoPayload(toDeviceInfo(descriptor, usbDeviceInfo));
  const videoDevice: ObservedMediaDevice = {
    deviceId: fixture.videoDeviceId,
    groupId: fixture.groupId,
    kind: 'videoinput',
    label: fixture.label
  };
  const audioDevice: ObservedMediaDevice = {
    deviceId: fixture.audioDeviceId,
    groupId: fixture.groupId,
    kind: 'audioinput',
    label: audioLabel
  };
  const trackSettings = createFixtureTrackSettings(descriptor);

  return deepFreeze({
    descriptor,
    fixture,
    specs: {
      id: descriptor.id,
      vendorId: descriptor.usb.vendorId,
      productId: descriptor.usb.productId,
      deviceClass: descriptor.usb.deviceClass,
      alternateDeviceClass: descriptor.usb.alternateDeviceClass,
      hexVendorId: descriptor.usb.hexVendorId,
      hexProductId: descriptor.usb.hexProductId,
      name: fixture.label,
      label: fixture.label,
      manufacturer: descriptor.manufacturer,
      nativeWidth: descriptor.display.nativeWidth,
      nativeHeight: descriptor.display.nativeHeight,
      aspectRatio: descriptor.display.aspectRatio,
      frameRates: [...fixture.supportedFrameRates],
      supportedFrameRates: [...fixture.supportedFrameRates],
      defaultFrameRate: fixture.defaultFrameRate,
      audioSampleRate: fixture.audio.sampleRate,
      audioChannels: fixture.audio.channels,
      deviceId: fixture.videoDeviceId,
      audioDeviceId: fixture.audioDeviceId,
      groupId: fixture.groupId,
      labelPatterns: [...descriptor.labelPatterns]
    },
    usbDeviceInfo,
    deviceInfoPayload,
    videoDevice,
    audioDevice,
    trackSettings,
    streamProfile: getDeviceStreamProfile(descriptor)
  });
}

export function createFixtureMediaDevices(
  source?: FixtureSource,
  options: { includeAudio?: boolean } = {}
): readonly ObservedMediaDevice[] {
  const profile = getDeviceFixtureProfile(source);
  return deepFreeze(
    options.includeAudio === false || !profile.audioDevice
      ? [profile.videoDevice]
      : [profile.videoDevice, profile.audioDevice]
  );
}

export function createFixtureTrackSettings(source?: FixtureSource): DeviceFixtureTrackSettings {
  const descriptor = descriptorWithFixture(source);
  const fixture = descriptor.fixture;
  if (!fixture) {
    throw new Error(`Device ${descriptor.id} does not define fixture metadata`);
  }

  const settings: DeviceFixtureTrackSettings = {
    video: {
      deviceId: fixture.videoDeviceId,
      groupId: fixture.groupId,
      width: descriptor.display.nativeWidth,
      height: descriptor.display.nativeHeight,
      frameRate: fixture.defaultFrameRate,
      aspectRatio: descriptor.display.aspectRatio,
      facingMode: 'environment'
    }
  };

  if (fixture.audio && fixture.audioDeviceId) {
    settings.audio = {
      deviceId: fixture.audioDeviceId,
      groupId: fixture.groupId,
      sampleRate: fixture.audio.sampleRate,
      channelCount: fixture.audio.channels,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    };
  }

  return deepFreeze(settings);
}

export function createFixtureDeviceInfoPayload(
  source?: FixtureSource,
  overrides: Partial<DeviceInfoPayload> = {}
): DeviceInfoPayload {
  return {
    ...getDeviceFixtureProfile(source).deviceInfoPayload,
    ...overrides
  };
}

export function createFixtureDeviceStatus(
  source?: FixtureSource,
  connected = true,
  deviceOverrides: Partial<DeviceInfoPayload> = {}
): DeviceStatusPayload {
  return {
    state: connected ? 'connected' : 'disconnected',
    connected,
    device: connected ? createFixtureDeviceInfoPayload(source, deviceOverrides) : null
  };
}

export function createFixtureFrameData(
  source?: FixtureSource,
  overrides: FrameDataOverrides = {}
): DeviceFixtureFrameData {
  const descriptor = descriptorWithFixture(source);
  const width = overrides.width ?? descriptor.display.nativeWidth;
  const height = overrides.height ?? descriptor.display.nativeHeight;
  const fill = overrides.fill ?? 128;

  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4).fill(fill),
    timestamp: overrides.timestamp ?? fixtureTimestamp()
  };
}

export type {
  DeviceFixtureFrameData,
  DeviceFixtureProfile,
  DeviceFixtureSpecs,
  DeviceFixtureTrackSettings
} from './contracts.js';
