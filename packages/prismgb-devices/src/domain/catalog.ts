import { deepFreeze, pruneUndefined } from '@prismgb/core';
import catalog from './catalog.json';
import type {
  DeviceAcquisitionAttempt,
  DeviceAcquisitionProfile,
  DeviceBehaviorPolicy,
  DeviceCanvasResolution,
  DeviceCatalogApi,
  DeviceConstraintMap,
  DeviceDescriptor,
  DeviceFixtureDescriptor,
  DeviceId,
  DeviceMediaAudioProfile,
  DeviceMediaFallbackStrategy,
  DeviceMediaProfile,
  DeviceNativeResolution,
  DeviceResolution,
  DeviceStreamProfile
} from './types.js';

type ManifestDevice = typeof catalog.devices[number];
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

function cloneAndFreeze<T>(value: T): T {
  return deepFreeze(cloneJson(value));
}

function getConstraintValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }

  const record = value as Record<string, unknown>;
  return record.ideal ?? record.exact ?? value;
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
  catalog.devices.map(toDescriptor)
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

function resolveDescriptor(id?: DeviceId): DeviceDescriptor {
  return id ? DEVICE_BY_ID.get(id) ?? getDefaultDescriptor() : getDefaultDescriptor();
}

function getRecommendedScales(descriptor: DeviceDescriptor): number[] {
  const scales = descriptor.display.resolutions
    .map((resolution) => resolution.scale)
    .filter((scale): scale is number => typeof scale === 'number' && Number.isFinite(scale));

  return scales.length > 0 ? scales : [1];
}

function getCanvasScale(descriptor: DeviceDescriptor): number {
  const recommendedScales = getRecommendedScales(descriptor);
  return recommendedScales.includes(4) ? 4 : recommendedScales[0] ?? 1;
}

function getResolutionByScale(
  descriptor: DeviceDescriptor,
  scale: number
): DeviceCanvasResolution {
  const resolution = descriptor.display.resolutions.find((candidate) => candidate.scale === scale);
  return resolution
    ? { width: resolution.width, height: resolution.height, scale }
    : {
        width: descriptor.display.nativeWidth * scale,
        height: descriptor.display.nativeHeight * scale,
        scale
      };
}

function getFrameRate(descriptor: DeviceDescriptor): number {
  const frameRate = getConstraintValue(descriptor.media.video.frameRate);
  return typeof frameRate === 'number' && Number.isFinite(frameRate) ? frameRate : 60;
}

function getSupportedFrameRates(descriptor: DeviceDescriptor): readonly number[] {
  const fixtureFrameRates = descriptor.fixture?.supportedFrameRates;
  if (fixtureFrameRates?.length) {
    return fixtureFrameRates;
  }

  return deepFreeze([getFrameRate(descriptor)]);
}

function getSimpleVideoConstraints(descriptor: DeviceDescriptor): DeviceConstraintMap {
  return pruneUndefined<DeviceConstraintMap>({
    width: getConstraintValue(descriptor.media.video.width),
    height: getConstraintValue(descriptor.media.video.height),
    frameRate: getConstraintValue(descriptor.media.video.frameRate)
  });
}

function getVideoConstraints(
  descriptor: DeviceDescriptor,
  detail: DeviceAcquisitionAttempt['detail']
): DeviceConstraintMap {
  if (detail === 'minimal') {
    return Object.freeze({});
  }

  return detail === 'simple'
    ? deepFreeze(getSimpleVideoConstraints(descriptor))
    : cloneAndFreeze(descriptor.media.video);
}

function getAudioConstraints(
  descriptor: DeviceDescriptor,
  detail: DeviceAcquisitionAttempt['detail']
): DeviceConstraintMap {
  if (detail === 'minimal') {
    return Object.freeze({});
  }

  return detail === 'simple'
    ? cloneAndFreeze(descriptor.media.audio.simple)
    : cloneAndFreeze(descriptor.media.audio.full);
}

function toAcquisitionAttempt(
  descriptor: DeviceDescriptor,
  strategy: string,
  detail: DeviceAcquisitionAttempt['detail'],
  includeAudio: boolean
): DeviceAcquisitionAttempt {
  return deepFreeze({
    strategy,
    detail,
    includeAudio,
    includeVideo: true,
    audioConstraints: includeAudio ? getAudioConstraints(descriptor, detail) : null,
    videoConstraints: getVideoConstraints(descriptor, detail)
  });
}

export function getDeviceStreamProfile(idOrDescriptor?: DeviceId | DeviceDescriptor): DeviceStreamProfile {
  const descriptor = typeof idOrDescriptor === 'object'
    ? idOrDescriptor
    : resolveDescriptor(idOrDescriptor);
  const canvasScale = getCanvasScale(descriptor);

  return deepFreeze({
    hasVideo: descriptor.capabilities.includes('video-capture'),
    audioSupport: descriptor.capabilities.includes('audio-capture'),
    canvasScale,
    nativeResolution: {
      width: descriptor.display.nativeWidth,
      height: descriptor.display.nativeHeight
    },
    canvasResolution: getResolutionByScale(descriptor, canvasScale),
    frameRate: getFrameRate(descriptor),
    fallbackStrategy: descriptor.media.fallbackStrategy,
    pixelPerfect: descriptor.display.pixelPerfect,
    supportedResolutions: descriptor.display.resolutions,
    supportedFrameRates: getSupportedFrameRates(descriptor)
  });
}

export function getDeviceAcquisitionProfile(idOrDescriptor?: DeviceId | DeviceDescriptor): DeviceAcquisitionProfile {
  const descriptor = typeof idOrDescriptor === 'object'
    ? idOrDescriptor
    : resolveDescriptor(idOrDescriptor);
  const includeAudio = descriptor.capabilities.includes('audio-capture');
  const attempts = [
    toAcquisitionAttempt(descriptor, 'full', 'full', includeAudio)
  ];

  if (descriptor.behavior.allowFallback) {
    attempts.push(
      toAcquisitionAttempt(descriptor, 'simple', 'simple', includeAudio),
      toAcquisitionAttempt(descriptor, 'minimal', 'minimal', includeAudio),
      toAcquisitionAttempt(descriptor, 'video-only-simple', 'simple', false),
      toAcquisitionAttempt(descriptor, 'video-only-minimal', 'minimal', false)
    );
  }

  return deepFreeze({
    allowFallback: descriptor.behavior.allowFallback,
    fallbackStrategy: descriptor.media.fallbackStrategy,
    attempts
  });
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
    const descriptor = resolveDescriptor(id);
    return {
      width: descriptor.display.nativeWidth,
      height: descriptor.display.nativeHeight
    };
  },

  streamProfile(id?: DeviceId) {
    return getDeviceStreamProfile(id);
  },

  acquisitionProfile(id?: DeviceId) {
    return getDeviceAcquisitionProfile(id);
  }
});

export const DEFAULT_DEVICE_ID: DeviceId = DeviceCatalog.default().id;
export const DEFAULT_NATIVE_RESOLUTION: DeviceNativeResolution = Object.freeze(DeviceCatalog.nativeResolution());
