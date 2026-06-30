import { DeviceManifest } from './device.manifest.js';
import type {
  DeviceBehaviorPolicy,
  DeviceCatalogApi,
  DeviceConstraintMap,
  DeviceDescriptor,
  DeviceFixtureDescriptor,
  DeviceId,
  DeviceMediaAudioProfile,
  DeviceMediaFallbackStrategy,
  DeviceMediaProfile,
  DeviceResolution
} from './contracts.js';

type ManifestDevice = typeof DeviceManifest.devices[number];
type ManifestMedia = ManifestDevice['media'] & {
  audio?: Partial<DeviceMediaAudioProfile>;
};
type JsonObject = Record<string, unknown>;

const DEFAULT_AUDIO_FULL: DeviceConstraintMap = Object.freeze({
  echoCancellation: Object.freeze({ exact: false }),
  noiseSuppression: Object.freeze({ exact: false }),
  autoGainControl: Object.freeze({ exact: false }),
  channelCount: Object.freeze({ ideal: 2 }),
  sampleSize: Object.freeze({ ideal: 16 })
});

const DEFAULT_AUDIO_SIMPLE: DeviceConstraintMap = Object.freeze({
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false
});

const DEFAULT_BEHAVIOR: Omit<DeviceBehaviorPolicy, 'allowFallback'> = Object.freeze({
  showWindowOnConnectDelayMs: 500,
  autoStreamOnConnect: true,
  requiresStrictMode: true
});

function cloneJson<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneJson(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as JsonObject).map(([key, item]) => [key, cloneJson(item)])
    ) as T;
  }

  return value;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  for (const nestedValue of Object.values(value as JsonObject)) {
    deepFreeze(nestedValue);
  }

  return Object.freeze(value);
}

function cloneAndFreeze<T>(value: T): T {
  return deepFreeze(cloneJson(value));
}

function normalizeFallbackStrategy(value: string | undefined): DeviceMediaFallbackStrategy {
  if (value === 'video-only' || value === 'strict') {
    return value;
  }

  return 'audio-simple';
}

function normalizeAudio(media: ManifestMedia): DeviceMediaAudioProfile {
  return {
    full: cloneAndFreeze(media.audio?.full ?? DEFAULT_AUDIO_FULL),
    simple: cloneAndFreeze(media.audio?.simple ?? DEFAULT_AUDIO_SIMPLE)
  };
}

function normalizeMedia(device: ManifestDevice): DeviceMediaProfile {
  const media = device.media as ManifestMedia;
  const fallbackStrategy = normalizeFallbackStrategy(device.media.fallbackStrategy);

  return deepFreeze({
    video: cloneAndFreeze(media.video),
    audio: normalizeAudio(media),
    fallbackStrategy
  });
}

function normalizeBehavior(device: ManifestDevice, media: DeviceMediaProfile): DeviceBehaviorPolicy {
  const behavior = 'behavior' in device && device.behavior && typeof device.behavior === 'object'
    ? device.behavior as Partial<DeviceBehaviorPolicy>
    : {};

  return deepFreeze({
    showWindowOnConnectDelayMs: behavior.showWindowOnConnectDelayMs ?? DEFAULT_BEHAVIOR.showWindowOnConnectDelayMs,
    autoStreamOnConnect: behavior.autoStreamOnConnect ?? DEFAULT_BEHAVIOR.autoStreamOnConnect,
    allowFallback: behavior.allowFallback ?? media.fallbackStrategy !== 'strict',
    requiresStrictMode: behavior.requiresStrictMode ?? DEFAULT_BEHAVIOR.requiresStrictMode
  });
}

function normalizeFixture(device: ManifestDevice): DeviceFixtureDescriptor | undefined {
  if (!device.fixture) {
    return undefined;
  }

  return cloneAndFreeze(device.fixture);
}

function normalizeResolutions(device: ManifestDevice): readonly DeviceResolution[] {
  return cloneAndFreeze(device.display.resolutions);
}

function toDescriptor(device: ManifestDevice): DeviceDescriptor {
  const media = normalizeMedia(device);
  const fixture = normalizeFixture(device);

  const descriptor: DeviceDescriptor = {
    id: device.id,
    name: device.name,
    manufacturer: device.manufacturer,
    enabled: device.enabled,
    version: device.version,
    usb: deepFreeze({
      ...device.usb,
      hexVendorId: device.usb.hexVendorId as `0x${string}`,
      hexProductId: device.usb.hexProductId as `0x${string}`
    }),
    labelPatterns: cloneAndFreeze(device.labelPatterns),
    display: deepFreeze({
      nativeWidth: device.display.nativeWidth,
      nativeHeight: device.display.nativeHeight,
      aspectRatio: device.display.aspectRatio,
      aspectRatioLabel: device.display.aspectRatioLabel,
      pixelPerfect: device.display.pixelPerfect,
      resolutions: normalizeResolutions(device)
    }),
    media,
    capabilities: cloneAndFreeze(device.capabilities),
    behavior: normalizeBehavior(device, media)
  };

  if (fixture) {
    descriptor.fixture = fixture;
  }

  return deepFreeze(descriptor);
}

const DEVICE_DESCRIPTORS: readonly DeviceDescriptor[] = deepFreeze(
  DeviceManifest.devices.map(toDescriptor)
);

const ENABLED_DEVICE_DESCRIPTORS: readonly DeviceDescriptor[] = deepFreeze(
  DEVICE_DESCRIPTORS.filter((device) => device.enabled)
);

const DEVICE_BY_ID = new Map<DeviceId, DeviceDescriptor>(
  DEVICE_DESCRIPTORS.map((device) => [device.id, device])
);

function getDefaultDescriptor(): DeviceDescriptor {
  const descriptor = ENABLED_DEVICE_DESCRIPTORS[0] ?? DEVICE_DESCRIPTORS[0];
  if (!descriptor) {
    throw new Error('Device manifest must define at least one device');
  }

  return descriptor;
}

export const DeviceCatalog: DeviceCatalogApi = Object.freeze<DeviceCatalogApi>({
  all() {
    return DEVICE_DESCRIPTORS;
  },

  enabled() {
    return ENABLED_DEVICE_DESCRIPTORS;
  },

  get(id: DeviceId) {
    return DEVICE_BY_ID.get(id) ?? null;
  },

  default() {
    return getDefaultDescriptor();
  },

  nativeResolution(id?: DeviceId) {
    const descriptor = id ? this.get(id) ?? getDefaultDescriptor() : getDefaultDescriptor();
    return {
      width: descriptor.display.nativeWidth,
      height: descriptor.display.nativeHeight
    };
  }
});

export const DEFAULT_DEVICE_ID: DeviceId = DeviceCatalog.default().id;
export const DEFAULT_NATIVE_RESOLUTION = Object.freeze(DeviceCatalog.nativeResolution());
