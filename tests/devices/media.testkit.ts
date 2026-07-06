import { vi } from 'vitest';
import { installMediaMocks } from '../support/mocks/browser-api.installers.js';
import {
  createFixtureDeviceInfoPayload,
  createFixtureDeviceStatus,
  createFixtureFrameData,
  getDeviceFixtureProfile
} from '@platform/devices/testkit';
import type {
  DeviceInfoPayload,
  DeviceStatusPayload,
  ObservedUsbDevice
} from '@platform/devices';

const CHROMATIC_PROFILE = getDeviceFixtureProfile();

export const CHROMATIC_DESCRIPTOR = CHROMATIC_PROFILE.descriptor;
export const CHROMATIC_FIXTURE = CHROMATIC_PROFILE.fixture;

export const CHROMATIC_SPECS = CHROMATIC_PROFILE.specs;
export const CHROMATIC_VIDEO_DEVICE_INFO = CHROMATIC_PROFILE.videoDevice;
export const CHROMATIC_AUDIO_DEVICE_INFO = CHROMATIC_PROFILE.audioDevice;
export const CHROMATIC_VIDEO_TRACK_SETTINGS = CHROMATIC_PROFILE.trackSettings.video;
export const CHROMATIC_AUDIO_TRACK_SETTINGS = CHROMATIC_PROFILE.trackSettings.audio ?? (() => {
  throw new Error('Chromatic fixture must expose audio track settings');
})();
export const CHROMATIC_STREAM_CAPABILITIES = Object.freeze({
  ...CHROMATIC_PROFILE.streamProfile,
  hasVideo: true,
  hasAudio: true
});

export function createChromaticUsbDevice(overrides: Partial<ObservedUsbDevice> = {}): ObservedUsbDevice {
  return {
    ...CHROMATIC_PROFILE.usbDeviceInfo,
    ...overrides
  };
}

export function createChromaticDeviceInfoPayload(
  overrides: Partial<DeviceInfoPayload> = {}
): DeviceInfoPayload {
  return createFixtureDeviceInfoPayload(CHROMATIC_DESCRIPTOR, overrides);
}

export function createChromaticDeviceStatusPayload(
  connected = true,
  deviceOverrides: Partial<DeviceInfoPayload> = {}
): DeviceStatusPayload {
  return createFixtureDeviceStatus(CHROMATIC_DESCRIPTOR, connected, deviceOverrides);
}

export function createChromaticFrameData(overrides: Partial<{ width: number; height: number }> = {}) {
  return createFixtureFrameData(CHROMATIC_DESCRIPTOR, overrides);
}

if (!CHROMATIC_FIXTURE.audio || !CHROMATIC_FIXTURE.audioDeviceId) {
  throw new Error('Chromatic fixture must define paired audio metadata');
}

type ListenerStore = Map<string, Set<EventListenerOrEventListenerObject>>;

function addListener(store: ListenerStore, event: string, handler: EventListenerOrEventListenerObject): void {
  const handlers = store.get(event) ?? new Set<EventListenerOrEventListenerObject>();
  handlers.add(handler);
  store.set(event, handlers);
}

function removeListener(store: ListenerStore, event: string, handler: EventListenerOrEventListenerObject): void {
  store.get(event)?.delete(handler);
}

function dispatchToListener(listener: EventListenerOrEventListenerObject, event: Event): void {
  if (typeof listener === 'function') {
    listener(event);
  } else {
    listener.handleEvent(event);
  }
}

function dispatchListeners(store: ListenerStore, event: Event): boolean {
  store.get(event.type)?.forEach((handler) => dispatchToListener(handler, event));
  return true;
}

export type MediaDeviceInfoDouble = MediaDeviceInfo & {
  toJSON(): {
    deviceId: string;
    groupId: string;
    kind: MediaDeviceKind;
    label: string;
  };
};

export type MediaStreamTrackDouble = MediaStreamTrack;

export type MediaStreamDouble = MediaStream;

export interface MediaDeviceInfoOptions {
  deviceId?: string;
  groupId?: string;
  kind?: MediaDeviceKind;
  label?: string;
}

export interface MediaTrackOptions {
  id?: string;
  kind?: 'audio' | 'video';
  label?: string;
  enabled?: boolean;
  muted?: boolean;
  readyState?: MediaStreamTrackState;
  settings?: MediaTrackSettings;
  capabilities?: MediaTrackCapabilities;
  constraints?: MediaTrackConstraints;
}

export interface MediaStreamOptions {
  id?: string;
  active?: boolean;
  tracks?: MediaStreamTrack[];
  videoTracks?: MediaStreamTrack[];
  audioTracks?: MediaStreamTrack[];
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function createMediaDeviceInfo(options: MediaDeviceInfoOptions = {}): MediaDeviceInfoDouble {
  const device = {
    deviceId: options.deviceId ?? CHROMATIC_VIDEO_DEVICE_INFO.deviceId,
    groupId: options.groupId ?? CHROMATIC_VIDEO_DEVICE_INFO.groupId,
    kind: options.kind ?? CHROMATIC_VIDEO_DEVICE_INFO.kind,
    label: options.label ?? CHROMATIC_VIDEO_DEVICE_INFO.label
  };

  return {
    ...device,
    toJSON: () => ({ ...device })
  } as MediaDeviceInfoDouble;
}

export function createChromaticVideoDeviceInfo(
  overrides: MediaDeviceInfoOptions = {}
): MediaDeviceInfoDouble {
  return createMediaDeviceInfo({
    ...CHROMATIC_VIDEO_DEVICE_INFO,
    ...overrides
  });
}

export function createChromaticAudioDeviceInfo(
  overrides: MediaDeviceInfoOptions = {}
): MediaDeviceInfoDouble {
  return createMediaDeviceInfo({
    ...CHROMATIC_AUDIO_DEVICE_INFO,
    ...overrides
  });
}

function defaultSettings(kind: 'audio' | 'video'): MediaTrackSettings {
  return kind === 'audio'
    ? { ...CHROMATIC_AUDIO_TRACK_SETTINGS }
    : { ...CHROMATIC_VIDEO_TRACK_SETTINGS };
}

const range = (value: number) => ({ min: value, max: value });

function defaultCapabilities(kind: 'audio' | 'video'): MediaTrackCapabilities {
  if (kind === 'audio') {
    return {
      deviceId: CHROMATIC_AUDIO_DEVICE_INFO.deviceId,
      groupId: CHROMATIC_AUDIO_DEVICE_INFO.groupId,
      sampleRate: range(CHROMATIC_AUDIO_TRACK_SETTINGS.sampleRate),
      channelCount: range(CHROMATIC_AUDIO_TRACK_SETTINGS.channelCount),
      echoCancellation: [false],
      noiseSuppression: [false],
      autoGainControl: [false]
    } as MediaTrackCapabilities;
  }

  const width = CHROMATIC_VIDEO_TRACK_SETTINGS.width;
  const height = CHROMATIC_VIDEO_TRACK_SETTINGS.height;

  return {
    deviceId: CHROMATIC_VIDEO_DEVICE_INFO.deviceId,
    groupId: CHROMATIC_VIDEO_DEVICE_INFO.groupId,
    width: range(width),
    height: range(height),
    frameRate: {
      min: Math.min(...CHROMATIC_FIXTURE.supportedFrameRates),
      max: Math.max(...CHROMATIC_FIXTURE.supportedFrameRates)
    },
    aspectRatio: range(CHROMATIC_DESCRIPTOR.display.aspectRatio),
    facingMode: ['environment']
  } as MediaTrackCapabilities;
}

function defaultConstraints(kind: 'audio' | 'video'): MediaTrackConstraints {
  if (kind === 'audio') {
    return {
      deviceId: { exact: CHROMATIC_AUDIO_DEVICE_INFO.deviceId },
      sampleRate: { ideal: CHROMATIC_AUDIO_TRACK_SETTINGS.sampleRate },
      channelCount: { ideal: CHROMATIC_AUDIO_TRACK_SETTINGS.channelCount },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    };
  }

  return {
    deviceId: { exact: CHROMATIC_VIDEO_DEVICE_INFO.deviceId },
    width: { exact: CHROMATIC_VIDEO_TRACK_SETTINGS.width },
    height: { exact: CHROMATIC_VIDEO_TRACK_SETTINGS.height },
    frameRate: { ideal: CHROMATIC_VIDEO_TRACK_SETTINGS.frameRate }
  };
}

export function createMediaStreamTrack(options: MediaTrackOptions = {}): MediaStreamTrackDouble {
  const kind = options.kind ?? 'video';
  const settings = {
    ...defaultSettings(kind),
    ...options.settings
  };
  const capabilities = {
    ...defaultCapabilities(kind),
    ...options.capabilities
  };
  const constraints = {
    ...defaultConstraints(kind),
    ...options.constraints
  };
  const eventListeners: ListenerStore = new Map();
  let enabled = options.enabled ?? true;
  let readyState = options.readyState ?? 'live';

  const track = {
    id: options.id ?? `mock-${kind}-track-${Date.now()}-${randomSuffix()}`,
    kind,
    label: options.label ?? (kind === 'audio' ? CHROMATIC_AUDIO_DEVICE_INFO.label : CHROMATIC_VIDEO_DEVICE_INFO.label),
    muted: options.muted ?? false,
    contentHint: '',
    get enabled() {
      return enabled;
    },
    set enabled(value: boolean) {
      enabled = value;
    },
    get readyState() {
      return readyState;
    },
    getSettings: vi.fn(() => ({ ...settings })),
    getCapabilities: vi.fn(() => ({ ...capabilities })),
    getConstraints: vi.fn(() => ({ ...constraints })),
    applyConstraints: vi.fn(async () => undefined),
    clone: vi.fn(() => createMediaStreamTrack({ ...options, id: `cloned-${kind}-track-${randomSuffix()}` })),
    stop: vi.fn(() => {
      readyState = 'ended';
      enabled = false;
    }),
    addEventListener: vi.fn((event: string, handler: EventListenerOrEventListenerObject) =>
      addListener(eventListeners, event, handler)
    ),
    removeEventListener: vi.fn((event: string, handler: EventListenerOrEventListenerObject) =>
      removeListener(eventListeners, event, handler)
    ),
    dispatchEvent: vi.fn((event: Event) => dispatchListeners(eventListeners, event))
  };

  return track as unknown as MediaStreamTrackDouble;
}

export function createMediaTrackMock(overrides: Record<string, unknown> = {}) {
  const {
    getSettings,
    getCapabilities,
    getConstraints,
    applyConstraints,
    clone,
    stop,
    addEventListener,
    removeEventListener,
    dispatchEvent,
    ...trackOptions
  } = overrides;
  const track = createMediaStreamTrack(trackOptions as MediaTrackOptions);

  return {
    ...track,
    ...overrides,
    getSettings: getSettings ?? track.getSettings,
    getCapabilities: getCapabilities ?? track.getCapabilities,
    getConstraints: getConstraints ?? track.getConstraints,
    applyConstraints: applyConstraints ?? track.applyConstraints,
    clone: clone ?? vi.fn(() => ({ id: 'cloned-track' })),
    stop: stop ?? track.stop,
    addEventListener: addEventListener ?? track.addEventListener,
    removeEventListener: removeEventListener ?? track.removeEventListener,
    dispatchEvent: dispatchEvent ?? track.dispatchEvent
  };
}

export function createChromaticVideoTrack(options: MediaTrackOptions = {}): MediaStreamTrackDouble {
  return createMediaStreamTrack({
    kind: 'video',
    label: CHROMATIC_VIDEO_DEVICE_INFO.label,
    settings: CHROMATIC_VIDEO_TRACK_SETTINGS,
    ...options
  });
}

export function createChromaticAudioTrack(options: MediaTrackOptions = {}): MediaStreamTrackDouble {
  return createMediaStreamTrack({
    kind: 'audio',
    label: CHROMATIC_AUDIO_DEVICE_INFO.label,
    settings: CHROMATIC_AUDIO_TRACK_SETTINGS,
    ...options
  });
}

export function createMediaStream(options: MediaStreamOptions = {}): MediaStreamDouble {
  const tracks = options.tracks
    ? [...options.tracks]
    : [...(options.videoTracks ?? []), ...(options.audioTracks ?? [])];
  const eventListeners: ListenerStore = new Map();

  const stream = {
    id: options.id ?? `mock-stream-${Date.now()}-${randomSuffix()}`,
    active: options.active ?? true,
    getTracks: vi.fn(() => [...tracks]),
    getVideoTracks: vi.fn(() => tracks.filter((track) => track.kind === 'video')),
    getAudioTracks: vi.fn(() => tracks.filter((track) => track.kind === 'audio')),
    addTrack: vi.fn((track: MediaStreamTrack) => {
      tracks.push(track);
    }),
    removeTrack: vi.fn((track: MediaStreamTrack) => {
      const index = tracks.indexOf(track);
      if (index >= 0) {
        tracks.splice(index, 1);
      }
    }),
    clone: vi.fn(() => createMediaStream({ ...options, tracks })),
    addEventListener: vi.fn((event: string, handler: EventListenerOrEventListenerObject) =>
      addListener(eventListeners, event, handler)
    ),
    removeEventListener: vi.fn((event: string, handler: EventListenerOrEventListenerObject) =>
      removeListener(eventListeners, event, handler)
    ),
    dispatchEvent: vi.fn((event: Event) => dispatchListeners(eventListeners, event))
  };

  return stream as unknown as MediaStreamDouble;
}

export function createChromaticMediaStream(options: MediaStreamOptions & { includeAudio?: boolean } = {}): MediaStreamDouble {
  const videoTrack = createChromaticVideoTrack();
  const audioTracks = options.includeAudio === false ? [] : [createChromaticAudioTrack()];

  return createMediaStream({
    ...options,
    tracks: options.tracks ?? [videoTrack, ...audioTracks]
  });
}

export function createChromaticMediaDevices(options: { includeAudio?: boolean } = {}): MediaDeviceInfoDouble[] {
  const devices = [createChromaticVideoDeviceInfo()];
  if (options.includeAudio !== false) {
    devices.push(createChromaticAudioDeviceInfo());
  }

  return devices;
}

type ChromaticStreamCapabilities = typeof CHROMATIC_STREAM_CAPABILITIES;

export function createChromaticStreamCapabilities<TOverrides extends Record<string, unknown> = Record<string, never>>(
  overrides?: TOverrides
): ChromaticStreamCapabilities & TOverrides {
  return {
    ...CHROMATIC_STREAM_CAPABILITIES,
    ...(overrides ?? {})
  } as ChromaticStreamCapabilities & TOverrides;
}

export type ManifestStreamCapabilities = ReturnType<typeof createChromaticStreamCapabilities> & {
  deviceName: string;
};

export interface ManifestMediaEnvironmentOptions {
  connected?: boolean;
}

export interface ManifestMediaEnvironment {
  readonly videoDevice: MediaDeviceInfoDouble;
  readonly audioDevice: MediaDeviceInfoDouble;
  install(): ManifestMediaEnvironment;
  cleanup(): void;
  connect(): ManifestMediaEnvironment;
  disconnect(): ManifestMediaEnvironment;
  addMediaDevice(device: MediaDeviceInfo): ManifestMediaEnvironment;
  getCapabilities(overrides?: Record<string, unknown>): ManifestStreamCapabilities;
  createStream(constraints?: MediaStreamConstraints): Promise<MediaStreamDouble>;
  stopStreams(): ManifestMediaEnvironment;
  startFrameGeneration(callback: (frame: ReturnType<typeof createChromaticFrameData>) => void, fps?: number): void;
  stopFrameGeneration(): void;
  snapshot(): {
    connected: boolean;
    devices: MediaDeviceInfoDouble[];
    activeStreamCount: number;
    listenerCount: number;
  };
}

type MediaMockHandle = {
  cleanup(): void;
};

function createNotFoundError(): Error {
  const error = new Error('Requested device not found');
  error.name = 'NotFoundError';
  return error;
}

function toMediaDeviceInfoDouble(device: MediaDeviceInfo): MediaDeviceInfoDouble {
  return createMediaDeviceInfo({
    deviceId: device.deviceId,
    groupId: device.groupId,
    kind: device.kind,
    label: device.label
  });
}

function exactDeviceIdFromConstraint(constraint: unknown): string | null {
  if (!constraint) {
    return null;
  }

  if (typeof constraint === 'string') {
    return constraint;
  }

  if (typeof constraint === 'object' && 'exact' in constraint) {
    const exact = (constraint as { exact?: unknown }).exact;
    return exact === undefined ? null : String(exact);
  }

  return null;
}

function requestedDeviceIdFromConstraints(constraints: boolean | MediaTrackConstraints | undefined): string | null {
  if (!constraints || typeof constraints !== 'object') {
    return null;
  }

  return exactDeviceIdFromConstraint(constraints.deviceId);
}

function requestedFrameRateFromConstraints(constraints: boolean | MediaTrackConstraints | undefined): number {
  if (!constraints || typeof constraints !== 'object' || !constraints.frameRate) {
    return CHROMATIC_SPECS.defaultFrameRate;
  }

  const frameRate = constraints.frameRate;
  if (typeof frameRate === 'number') {
    return frameRate;
  }

  if (typeof frameRate === 'object') {
    const candidate = 'exact' in frameRate ? frameRate.exact : frameRate.ideal;
    return typeof candidate === 'number' ? candidate : CHROMATIC_SPECS.defaultFrameRate;
  }

  return CHROMATIC_SPECS.defaultFrameRate;
}

function withoutDevice(devices: MediaDeviceInfoDouble[], deviceId: string): MediaDeviceInfoDouble[] {
  return devices.filter((device) => device.deviceId !== deviceId);
}

export function createManifestMediaEnvironment(
  options: ManifestMediaEnvironmentOptions = {}
): ManifestMediaEnvironment {
  let connected = options.connected ?? true;
  let devices = createChromaticMediaDevices();
  let mediaMock: MediaMockHandle | null = null;
  let frameInterval: ReturnType<typeof setInterval> | null = null;
  const activeStreams = new Set<MediaStreamDouble>();
  const deviceChangeListeners = new Set<EventListenerOrEventListenerObject>();
  const videoDevice = createChromaticVideoDeviceInfo();
  const audioDevice = createChromaticAudioDeviceInfo();

  const visibleDevices = () => connected ? [...devices] : [];
  const dispatchDeviceChange = (device?: MediaDeviceInfo): void => {
    const event = { type: 'devicechange', device } as unknown as Event;
    deviceChangeListeners.forEach((listener) => dispatchToListener(listener, event));
  };

  const resolveDevice = (
    kind: MediaDeviceKind,
    constraints: boolean | MediaTrackConstraints | undefined
  ): MediaDeviceInfoDouble | null => {
    if (constraints === false) {
      return null;
    }

    const candidates = visibleDevices().filter((device) => device.kind === kind);
    const requestedDeviceId = requestedDeviceIdFromConstraints(constraints);
    const device = requestedDeviceId
      ? candidates.find((candidate) => candidate.deviceId === requestedDeviceId)
      : candidates[0] ?? null;

    if (!device) {
      throw createNotFoundError();
    }

    return device;
  };

  const createDefaultStream = (constraints: MediaStreamConstraints = {}): MediaStreamDouble => {
    const tracks: MediaStreamTrack[] = [];
    const videoDevice = resolveDevice('videoinput', constraints.video);
    const audioDevice = constraints.audio === false
      ? null
      : resolveDevice('audioinput', constraints.audio);

    if (videoDevice) {
      const frameRate = requestedFrameRateFromConstraints(constraints.video);
      tracks.push(createChromaticVideoTrack({
        label: videoDevice.label,
        settings: {
          ...CHROMATIC_VIDEO_TRACK_SETTINGS,
          deviceId: videoDevice.deviceId,
          groupId: videoDevice.groupId,
          frameRate
        },
        constraints: {
          deviceId: { exact: videoDevice.deviceId },
          width: { exact: CHROMATIC_VIDEO_TRACK_SETTINGS.width },
          height: { exact: CHROMATIC_VIDEO_TRACK_SETTINGS.height },
          frameRate: { ideal: frameRate }
        }
      }));
    }

    if (audioDevice) {
      tracks.push(createChromaticAudioTrack({
        label: audioDevice.label,
        settings: {
          ...CHROMATIC_AUDIO_TRACK_SETTINGS,
          deviceId: audioDevice.deviceId,
          groupId: audioDevice.groupId
        },
        constraints: {
          deviceId: { exact: audioDevice.deviceId },
          sampleRate: { ideal: CHROMATIC_AUDIO_TRACK_SETTINGS.sampleRate },
          channelCount: { ideal: CHROMATIC_AUDIO_TRACK_SETTINGS.channelCount },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      }));
    }

    const stream = createMediaStream({ tracks });
    activeStreams.add(stream);
    return stream;
  };

  const environment: ManifestMediaEnvironment = {
    videoDevice,
    audioDevice,
    install() {
      mediaMock?.cleanup();
      deviceChangeListeners.clear();
      mediaMock = installMediaMocks({
        enumerateDevices: async () => visibleDevices(),
        getUserMedia: async (constraints: MediaStreamConstraints = {}) => {
          if (!connected) {
            throw createNotFoundError();
          }

          return createDefaultStream(constraints);
        },
        addEventListener: (event: string, listener: EventListenerOrEventListenerObject) => {
          if (event === 'devicechange') {
            deviceChangeListeners.add(listener);
          }
        },
        removeEventListener: (event: string, listener: EventListenerOrEventListenerObject) => {
          if (event === 'devicechange') {
            deviceChangeListeners.delete(listener);
          }
        }
      }) as MediaMockHandle;
      return environment;
    },
    cleanup() {
      environment.stopStreams();
      environment.stopFrameGeneration();
      mediaMock?.cleanup();
      mediaMock = null;
      deviceChangeListeners.clear();
    },
    connect() {
      connected = true;
      dispatchDeviceChange();
      return environment;
    },
    disconnect() {
      connected = false;
      environment.stopStreams();
      dispatchDeviceChange();
      return environment;
    },
    addMediaDevice(device: MediaDeviceInfo) {
      devices = [...withoutDevice(devices, device.deviceId), toMediaDeviceInfoDouble(device)];
      dispatchDeviceChange(device);
      return environment;
    },
    getCapabilities(overrides: Record<string, unknown> = {}): ManifestStreamCapabilities {
      return createChromaticStreamCapabilities({
        deviceName: videoDevice.label,
        ...overrides
      });
    },
    async createStream(constraints: MediaStreamConstraints = { video: true, audio: true }) {
      if (!connected) {
        throw createNotFoundError();
      }

      return createDefaultStream(constraints);
    },
    stopStreams() {
      activeStreams.forEach((stream) => {
        stream.getTracks().forEach((track) => track.stop());
      });
      activeStreams.clear();
      return environment;
    },
    startFrameGeneration(callback: (frame: ReturnType<typeof createChromaticFrameData>) => void, fps = CHROMATIC_SPECS.defaultFrameRate) {
      environment.stopFrameGeneration();
      frameInterval = setInterval(() => {
        callback(createChromaticFrameData());
      }, 1000 / fps);
    },
    stopFrameGeneration() {
      if (frameInterval) {
        clearInterval(frameInterval);
        frameInterval = null;
      }
    },
    snapshot() {
      return {
        connected,
        devices: visibleDevices(),
        activeStreamCount: activeStreams.size,
        listenerCount: deviceChangeListeners.size
      };
    }
  };

  return environment;
}
