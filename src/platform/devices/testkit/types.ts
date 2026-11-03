/** Fixture projections belong to the testkit, not the runtime device contract. */
import type {
  DeviceDescriptor, DeviceFixtureDescriptor, DeviceId, DeviceInfoPayload,
  DeviceStreamProfile, ObservedUsbDevice
} from '../domain/types.js';

export interface ObservedMediaDevice {
  deviceId: string;
  groupId?: string;
  kind: MediaDeviceKind;
  label: string;
}

export interface DeviceFixtureTrackSettings {
  video: MediaTrackSettings;
  audio?: MediaTrackSettings;
}

export interface DeviceFixtureFrameData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  timestamp: number;
}

export interface DeviceFixtureSpecs {
  id: DeviceId;
  vendorId: number;
  productId: number;
  deviceClass?: number;
  alternateDeviceClass?: number;
  hexVendorId: `0x${string}`;
  hexProductId: `0x${string}`;
  name: string;
  label: string;
  manufacturer: string;
  nativeWidth: number;
  nativeHeight: number;
  aspectRatio: number;
  frameRates: readonly number[];
  supportedFrameRates: readonly number[];
  defaultFrameRate: number;
  audioSampleRate: number;
  audioChannels: number;
  deviceId: string;
  audioDeviceId: string;
  groupId: string;
  labelPatterns: readonly string[];
}

export interface DeviceFixtureProfile {
  descriptor: DeviceDescriptor;
  fixture: DeviceFixtureDescriptor;
  specs: DeviceFixtureSpecs;
  usbDeviceInfo: ObservedUsbDevice;
  deviceInfoPayload: DeviceInfoPayload;
  videoDevice: ObservedMediaDevice;
  audioDevice: ObservedMediaDevice | null;
  trackSettings: DeviceFixtureTrackSettings;
  streamProfile: DeviceStreamProfile;
}
