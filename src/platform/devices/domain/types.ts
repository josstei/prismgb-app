import type { DeviceInfoPayload, DeviceStatusPayload } from './payload.schemas.js';
export type { DeviceInfoPayload, DeviceStatusPayload } from './payload.schemas.js';

export type DeviceId = string;

export type DeviceMatchReason = 'usb' | 'label';

export type DeviceMediaFallbackStrategy = 'audio-simple' | 'video-only' | 'strict';

export type DeviceConstraintMap = Record<string, unknown>;

export type DeviceAcquisitionConstraintDetail = 'full' | 'simple' | 'minimal';

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

export interface DeviceNativeResolution {
  width: number;
  height: number;
}

export interface DeviceCanvasResolution extends DeviceNativeResolution {
  scale: number;
}

export interface DeviceStreamProfile {
  hasVideo: boolean;
  audioSupport: boolean;
  canvasScale: number;
  nativeResolution: DeviceNativeResolution;
  canvasResolution: DeviceCanvasResolution;
  frameRate: number;
  fallbackStrategy: DeviceMediaFallbackStrategy;
  pixelPerfect: boolean;
  supportedResolutions: readonly DeviceResolution[];
  supportedFrameRates: readonly number[];
}

export interface DeviceAcquisitionAttempt {
  strategy: string;
  detail: DeviceAcquisitionConstraintDetail;
  includeAudio: boolean;
  includeVideo: boolean;
  audioConstraints: DeviceConstraintMap | null;
  videoConstraints: DeviceConstraintMap | null;
}

export interface DeviceAcquisitionProfile {
  allowFallback: boolean;
  fallbackStrategy: DeviceMediaFallbackStrategy;
  attempts: readonly DeviceAcquisitionAttempt[];
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

export type DeviceInfo = DeviceInfoPayload;
export type DeviceStatus = DeviceStatusPayload;
