import { vi } from 'vitest';
import { installMediaMocks } from '../support/mocks/browser-api.installers.js';
import {
  CHROMATIC_AUDIO_DEVICE_INFO,
  CHROMATIC_AUDIO_TRACK_SETTINGS,
  CHROMATIC_DESCRIPTOR,
  CHROMATIC_FIXTURE,
  CHROMATIC_SPECS,
  CHROMATIC_STREAM_CAPABILITIES,
  CHROMATIC_VIDEO_DEVICE_INFO,
  CHROMATIC_VIDEO_TRACK_SETTINGS,
  createChromaticFrameData
} from './chromatic-manifest.testkit';

export type MediaDeviceInfoDouble = MediaDeviceInfo & {
  toJSON(): {
    deviceId: string;
    groupId: string;
    kind: MediaDeviceKind;
    label: string;
  };
};

export type MediaStreamTrackDouble = MediaStreamTrack & {
  _eventListeners: Map<string, EventListenerOrEventListenerObject[]>;
};

export type MediaStreamDouble = MediaStream & {
  _tracks: MediaStreamTrack[];
  _setTracks(nextTracks: MediaStreamTrack[]): void;
};

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

function defaultCapabilities(kind: 'audio' | 'video'): MediaTrackCapabilities {
  if (kind === 'audio') {
    return {
      deviceId: CHROMATIC_AUDIO_DEVICE_INFO.deviceId,
      groupId: CHROMATIC_AUDIO_DEVICE_INFO.groupId,
      sampleRate: {
        min: CHROMATIC_AUDIO_TRACK_SETTINGS.sampleRate,
        max: CHROMATIC_AUDIO_TRACK_SETTINGS.sampleRate
      },
      channelCount: {
        min: CHROMATIC_AUDIO_TRACK_SETTINGS.channelCount,
        max: CHROMATIC_AUDIO_TRACK_SETTINGS.channelCount
      },
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
    width: { min: width, max: width },
    height: { min: height, max: height },
    frameRate: {
      min: Math.min(...CHROMATIC_FIXTURE.supportedFrameRates),
      max: Math.max(...CHROMATIC_FIXTURE.supportedFrameRates)
    },
    aspectRatio: {
      min: CHROMATIC_DESCRIPTOR.display.aspectRatio,
      max: CHROMATIC_DESCRIPTOR.display.aspectRatio
    },
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
  const eventListeners = new Map<string, EventListenerOrEventListenerObject[]>();
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
    addEventListener: vi.fn((event: string, handler: EventListenerOrEventListenerObject) => {
      if (!eventListeners.has(event)) {
        eventListeners.set(event, []);
      }
      eventListeners.get(event)?.push(handler);
    }),
    removeEventListener: vi.fn((event: string, handler: EventListenerOrEventListenerObject) => {
      const handlers = eventListeners.get(event);
      if (!handlers) {
        return;
      }
      const index = handlers.indexOf(handler);
      if (index >= 0) {
        handlers.splice(index, 1);
      }
    }),
    dispatchEvent: vi.fn((event: Event) => {
      const handlers = eventListeners.get(event.type) ?? [];
      for (const handler of handlers) {
        if (typeof handler === 'function') {
          handler(event);
        } else {
          handler.handleEvent(event);
        }
      }
      return true;
    }),
    _eventListeners: eventListeners
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
  const eventListeners = new Map<string, EventListenerOrEventListenerObject[]>();

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
    addEventListener: vi.fn((event: string, handler: EventListenerOrEventListenerObject) => {
      if (!eventListeners.has(event)) {
        eventListeners.set(event, []);
      }
      eventListeners.get(event)?.push(handler);
    }),
    removeEventListener: vi.fn((event: string, handler: EventListenerOrEventListenerObject) => {
      const handlers = eventListeners.get(event);
      if (!handlers) {
        return;
      }
      const index = handlers.indexOf(handler);
      if (index >= 0) {
        handlers.splice(index, 1);
      }
    }),
    dispatchEvent: vi.fn((event: Event) => {
      const handlers = eventListeners.get(event.type) ?? [];
      for (const handler of handlers) {
        if (typeof handler === 'function') {
          handler(event);
        } else {
          handler.handleEvent(event);
        }
      }
      return true;
    }),
    _tracks: tracks,
    _setTracks(nextTracks: MediaStreamTrack[]) {
      tracks.splice(0, tracks.length, ...nextTracks);
    }
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

export function createChromaticStreamCapabilities(overrides: Record<string, unknown> = {}) {
  return {
    ...CHROMATIC_STREAM_CAPABILITIES,
    ...overrides
  };
}

export function createMockVideoTrack(options: Record<string, unknown> = {}) {
  const width = Number(options.width ?? CHROMATIC_SPECS.nativeWidth);
  const height = Number(options.height ?? CHROMATIC_SPECS.nativeHeight);
  const frameRate = Number(options.frameRate ?? CHROMATIC_SPECS.defaultFrameRate);
  const deviceId = String(options.deviceId ?? CHROMATIC_SPECS.deviceId);
  const label = String(options.label ?? CHROMATIC_SPECS.label);

  return createMediaTrackMock({
    kind: 'video',
    label,
    settings: {
      deviceId,
      width,
      height,
      frameRate,
      aspectRatio: width / height,
      facingMode: 'environment'
    },
    capabilities: {
      deviceId,
      width: { min: width, max: width },
      height: { min: height, max: height },
      frameRate: {
        min: Math.min(...CHROMATIC_SPECS.frameRates),
        max: Math.max(...CHROMATIC_SPECS.frameRates)
      },
      aspectRatio: { min: width / height, max: width / height },
      facingMode: ['environment']
    },
    constraints: {
      deviceId: { exact: deviceId },
      width: { exact: width },
      height: { exact: height },
      frameRate: { ideal: frameRate }
    }
  });
}

export function createMockStream(options: Record<string, unknown> = {}) {
  return createChromaticMediaStream({
    includeAudio: false,
    tracks: [createMockVideoTrack(options) as unknown as MediaStreamTrack]
  });
}

export function createMockDeviceInfo(options: MediaDeviceInfoOptions = {}) {
  return createChromaticVideoDeviceInfo(options);
}

export class MockDevice {
  specs: Record<string, unknown>;
  deviceInfo: MediaDeviceInfoDouble;
  isConnected = true;
  activeStream: MediaStream | null = null;
  private frameInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: Record<string, unknown> = {}) {
    this.specs = { ...CHROMATIC_SPECS, ...options };
    this.deviceInfo = createMockDeviceInfo({
      deviceId: String(options.deviceId ?? CHROMATIC_SPECS.deviceId),
      label: String(options.label ?? CHROMATIC_SPECS.label)
    });
  }

  getDeviceInfo() {
    return this.deviceInfo;
  }

  connect() {
    this.isConnected = true;
    return this;
  }

  disconnect() {
    this.isConnected = false;
    this.stopStream();
    return this;
  }

  getStream(constraints: Record<string, unknown> = {}) {
    if (!this.isConnected) {
      return Promise.reject(new Error('Device not connected'));
    }

    this.activeStream = createMockStream({
      width: this.specs.nativeWidth,
      height: this.specs.nativeHeight,
      frameRate: constraints.frameRate ?? this.specs.defaultFrameRate,
      deviceId: this.deviceInfo.deviceId,
      label: this.deviceInfo.label
    });

    return Promise.resolve(this.activeStream);
  }

  stopStream() {
    if (this.activeStream) {
      this.activeStream.getTracks().forEach((track) => track.stop());
      this.activeStream = null;
    }
    this.stopFrameGeneration();
  }

  startFrameGeneration(callback: (frame: ReturnType<typeof createChromaticFrameData>) => void, fps = 60) {
    this.stopFrameGeneration();
    const interval = 1000 / fps;

    this.frameInterval = setInterval(() => {
      callback(this.generateFrame());
    }, interval);
  }

  _stopFrameGeneration() {
    this.stopFrameGeneration();
  }

  private stopFrameGeneration() {
    if (this.frameInterval) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
    }
  }

  private generateFrame() {
    return createChromaticFrameData({
      width: Number(this.specs.nativeWidth ?? CHROMATIC_SPECS.nativeWidth),
      height: Number(this.specs.nativeHeight ?? CHROMATIC_SPECS.nativeHeight)
    });
  }

  getCapabilities() {
    return createChromaticStreamCapabilities({
      canvasScale: 4,
      deviceName: this.specs.label ?? CHROMATIC_SPECS.label
    });
  }
}

export class MockDeviceManager {
  devices = new Map<string, MockDevice>();
  private deviceChangeListeners: EventListenerOrEventListenerObject[] = [];
  private mediaMock: { cleanup(): void } | null = null;

  addDevice(device: MockDevice) {
    this.devices.set(device.deviceInfo.deviceId, device);
    this.notifyDeviceChange(device);
    return this;
  }

  removeDevice(deviceId: string) {
    const device = this.devices.get(deviceId);
    if (device) {
      device.disconnect();
      this.devices.delete(deviceId);
      this.notifyDeviceChange(device);
    }
    return this;
  }

  getDevices() {
    return Array.from(this.devices.values())
      .filter((device) => device.isConnected)
      .map((device) => device.getDeviceInfo());
  }

  getDevice(deviceId: string) {
    return this.devices.get(deviceId);
  }

  setupMediaDevicesMock() {
    this.mediaMock?.cleanup();
    this.deviceChangeListeners = [];
    this.mediaMock = installMediaMocks({
      enumerateDevices: async () => this.getDevices(),
      getUserMedia: async (constraints: MediaStreamConstraints) => {
        const videoConstraints = constraints.video;
        let deviceId: string | null = null;

        if (videoConstraints && typeof videoConstraints === 'object') {
          const candidate = videoConstraints.deviceId;
          if (candidate && typeof candidate === 'object' && 'exact' in candidate) {
            deviceId = String(candidate.exact);
          } else if (candidate) {
            deviceId = String(candidate);
          }
        }

        const device = deviceId
          ? this.devices.get(deviceId)
          : Array.from(this.devices.values()).find((candidate) => candidate.isConnected);

        if (!device?.isConnected) {
          const error = new Error('Requested device not found');
          error.name = 'NotFoundError';
          throw error;
        }

        return device.getStream(
          videoConstraints && typeof videoConstraints === 'object'
            ? videoConstraints as Record<string, unknown>
            : {}
        );
      },
      addEventListener: (event: string, listener: EventListenerOrEventListenerObject) => {
        if (event === 'devicechange') {
          this.deviceChangeListeners.push(listener);
        }
      },
      removeEventListener: (event: string, listener: EventListenerOrEventListenerObject) => {
        if (event !== 'devicechange') {
          return;
        }
        const index = this.deviceChangeListeners.indexOf(listener);
        if (index >= 0) {
          this.deviceChangeListeners.splice(index, 1);
        }
      }
    });

    return this;
  }

  private notifyDeviceChange(device?: MockDevice) {
    const event = { type: 'devicechange', device: device?.getDeviceInfo() } as unknown as Event;
    this.deviceChangeListeners.forEach((listener) => dispatchToMediaListener(listener, event));
  }

  static createChromatic(options: Record<string, unknown> = {}) {
    return new MockDevice({
      ...CHROMATIC_SPECS,
      ...options
    });
  }

  reset() {
    this.mediaMock?.cleanup();
    this.mediaMock = null;
    this.devices.forEach((device) => device.disconnect());
    this.devices.clear();
    this.deviceChangeListeners = [];
    return this;
  }
}

function dispatchToMediaListener(listener: EventListenerOrEventListenerObject, event: Event) {
  if (typeof listener === 'function') {
    listener(event);
  } else {
    listener.handleEvent(event);
  }
}

export const mockDeviceManager = new MockDeviceManager();

export { CHROMATIC_SPECS };
