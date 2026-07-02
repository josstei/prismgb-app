import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DeviceCatalog,
  getDeviceAcquisitionProfile,
  getDeviceStreamProfile
} from '@platform/devices';
import { DeviceMediaAcquirer } from '@renderer/infrastructure/services/streaming/device-media-acquirer';
import {
  createCaptureStreamMock,
  createLoggerFactory,
  createMediaTrackMock
} from '../../../../factories/index.js';
import {
  CHROMATIC_AUDIO_DEVICE_INFO,
  CHROMATIC_VIDEO_DEVICE_INFO
} from '../../../../devices/media.testkit';
import {
  createChromaticAudioDeviceInfo,
  createChromaticVideoDeviceInfo
} from '../../../../devices/media.testkit';

function createMediaDevice(overrides = {}) {
  return createChromaticVideoDeviceInfo(overrides);
}

function createAudioDevice(overrides = {}) {
  return createChromaticAudioDeviceInfo(overrides);
}

function createActiveStream(id = 'stream-1') {
  return createCaptureStreamMock({
    id,
    active: true,
    videoTracks: [createMediaTrackMock({ kind: 'video', label: 'Chromatic video' })],
    audioTracks: [createMediaTrackMock({ kind: 'audio', label: 'Chromatic audio' })]
  });
}

function createAcquirer() {
  const descriptor = DeviceCatalog.default();
  const device = createMediaDevice();
  const audioDevice = createAudioDevice();
  const target = {
    videoDevice: device,
    audioDevice,
    descriptor,
    profile: getDeviceStreamProfile(descriptor),
    acquisition: getDeviceAcquisitionProfile(descriptor)
  };
  const mediaDevicesPort = {
    enumerateDevices: vi.fn(async () => [device, audioDevice]),
    getUserMedia: vi.fn(async () => createActiveStream()),
    subscribeDeviceChange: vi.fn()
  };
  const loggerFactory = createLoggerFactory();
  const acquirer = new DeviceMediaAcquirer({
    mediaDevicesPort,
    loggerFactory
  });

  return {
    acquirer,
    mediaDevicesPort,
    loggerFactory,
    descriptor,
    device,
    audioDevice,
    target
  };
}

describe('DeviceMediaAcquirer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('builds full constraints with exact video targeting and paired audio input', async () => {
    const { acquirer, mediaDevicesPort, target } = createAcquirer();

    const result = await acquirer.acquire(target);

    expect(result.strategy).toBe('full');
    expect(mediaDevicesPort.getUserMedia).toHaveBeenCalledWith({
      audio: expect.objectContaining({
        deviceId: { exact: CHROMATIC_AUDIO_DEVICE_INFO.deviceId }
      }),
      video: expect.objectContaining({
        deviceId: { exact: CHROMATIC_VIDEO_DEVICE_INFO.deviceId },
        width: { ideal: 160 },
        height: { ideal: 144 },
        frameRate: { ideal: 60 }
      })
    });
    expect(result.capabilities.nativeResolution).toEqual({ width: 160, height: 144 });
    expect(result.capabilities.canvasResolution).toEqual({ width: 640, height: 576, scale: 4 });
    expect(result.capabilities.hasAudio).toBe(true);
  });

  it('disables audio instead of using the default microphone when no paired audio input exists', async () => {
    const { acquirer, mediaDevicesPort, target } = createAcquirer();

    await acquirer.acquire({
      ...target,
      audioDevice: null
    });

    expect(mediaDevicesPort.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({
      audio: false,
      video: expect.objectContaining({
        deviceId: { exact: CHROMATIC_VIDEO_DEVICE_INFO.deviceId }
      })
    }));
  });

  it('falls back through simple, minimal, and video-only strategies without losing video device targeting', async () => {
    const { acquirer, mediaDevicesPort, target } = createAcquirer();
    mediaDevicesPort.getUserMedia
      .mockRejectedValueOnce(new Error('full failed'))
      .mockRejectedValueOnce(new Error('simple failed'))
      .mockRejectedValueOnce(new Error('minimal failed'))
      .mockResolvedValueOnce(createActiveStream('fallback-stream'));

    const result = await acquirer.acquire(target);

    expect(result.strategy).toBe('video-only-simple');
    expect(mediaDevicesPort.getUserMedia).toHaveBeenCalledTimes(4);
    const calls = mediaDevicesPort.getUserMedia.mock.calls as unknown as Array<[MediaStreamConstraints]>;
    for (const call of calls) {
      const constraints = call[0] as MediaStreamConstraints;
      expect(constraints.video).toEqual(expect.objectContaining({
        deviceId: { exact: CHROMATIC_VIDEO_DEVICE_INFO.deviceId }
      }));
      expect(constraints.audio).not.toBe(true);
    }
  });

  it('stops every stream track during release', async () => {
    const { acquirer } = createAcquirer();
    const videoTrack = createMediaTrackMock({ kind: 'video' });
    const audioTrack = createMediaTrackMock({ kind: 'audio' });
    const stream = createCaptureStreamMock({
      videoTracks: [videoTrack],
      audioTracks: [audioTrack]
    });

    await acquirer.release(stream);

    expect(videoTrack.stop).toHaveBeenCalledTimes(1);
    expect(audioTrack.stop).toHaveBeenCalledTimes(1);
  });

  it('returns stream track diagnostics', () => {
    const { acquirer } = createAcquirer();
    const stream = createActiveStream();

    expect(acquirer.getStreamInfo(stream)).toEqual(expect.objectContaining({
      id: 'stream-1',
      active: true,
      tracks: expect.arrayContaining([
        expect.objectContaining({ kind: 'video' }),
        expect.objectContaining({ kind: 'audio' })
      ])
    }));
  });
});
