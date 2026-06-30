export type DeviceId = string;

export type DeviceConnectionState =
  | 'unknown'
  | 'connected'
  | 'disconnected'
  | 'error';

export type DeviceMatchReason = 'usb' | 'label' | 'none';

export type DeviceMediaFallbackStrategy = 'audio-simple' | 'video-only' | 'strict';

export type DeviceConstraintMap = Record<string, unknown>;

export interface DeviceResolution {
  label?: string;
  width: number;
  height: number;
  scale?: number | null;
}

export interface UsbIdentity {
  vendorId: number;
  productId: number;
  deviceClass?: number;
  alternateDeviceClass?: number;
  hexVendorId: `0x${string}`;
  hexProductId: `0x${string}`;
}

export interface ObservedUsbDevice {
  vendorId: number;
  productId: number;
  locationId?: number;
  deviceAddress?: number;
  deviceName?: string;
  manufacturer?: string;
  serialNumber?: string;
  deviceClass?: number;
  busNumber?: number;
}

export interface ObservedMediaDevice {
  deviceId: string;
  groupId?: string;
  kind: MediaDeviceKind;
  label: string;
}

export interface DeviceDisplayProfile {
  nativeWidth: number;
  nativeHeight: number;
  aspectRatio: number;
  aspectRatioLabel: string;
  pixelPerfect: boolean;
  resolutions: readonly DeviceResolution[];
}

export interface DeviceMediaAudioProfile {
  full: DeviceConstraintMap;
  simple: DeviceConstraintMap;
}

export interface DeviceMediaProfile {
  video: DeviceConstraintMap;
  audio: DeviceMediaAudioProfile;
  fallbackStrategy: DeviceMediaFallbackStrategy;
}

export interface DeviceBehaviorPolicy {
  showWindowOnConnectDelayMs: number;
  autoStreamOnConnect: boolean;
  allowFallback: boolean;
  requiresStrictMode: boolean;
}

export interface DeviceFixtureAudioDescriptor {
  sampleRate: number;
  channels: number;
}

export interface DeviceFixtureDescriptor {
  defaultFrameRate: number;
  supportedFrameRates: readonly number[];
  label: string;
  videoDeviceId: string;
  audioDeviceId?: string;
  groupId: string;
  audio?: DeviceFixtureAudioDescriptor;
  e2eHelper?: string;
}

export interface DeviceDescriptor {
  id: DeviceId;
  name: string;
  manufacturer: string;
  enabled: boolean;
  version: string;
  usb: UsbIdentity;
  labelPatterns: readonly string[];
  display: DeviceDisplayProfile;
  media: DeviceMediaProfile;
  capabilities: readonly string[];
  behavior: DeviceBehaviorPolicy;
  fixture?: DeviceFixtureDescriptor;
}

export interface DeviceMatch {
  matched: boolean;
  deviceId: DeviceId | null;
  descriptor: DeviceDescriptor | null;
  reason: DeviceMatchReason;
  confidence: number;
}

export interface DeviceInfo {
  id: DeviceId;
  name: string;
  manufacturer: string;
  vendorId: number;
  productId: number;
  locationId?: number;
  deviceAddress?: number;
  serialNumber?: string;
}

export interface DeviceStatus {
  state: DeviceConnectionState;
  connected: boolean;
  device: DeviceInfo | null;
  error?: string;
  updatedAt: number;
}

export interface DeviceInfoPayload {
  id: string;
  name: string;
  manufacturer: string;
  vendorId: number;
  productId: number;
  locationId?: number;
  deviceAddress?: number;
  serialNumber?: string;
}

export interface DeviceStatusPayload {
  state: DeviceConnectionState;
  connected: boolean;
  device: DeviceInfoPayload | null;
  error?: string;
}

export interface DeviceCatalogApi {
  all(): readonly DeviceDescriptor[];
  enabled(): readonly DeviceDescriptor[];
  get(id: DeviceId): DeviceDescriptor | null;
  default(): DeviceDescriptor;
  nativeResolution(id?: DeviceId): { width: number; height: number };
}
