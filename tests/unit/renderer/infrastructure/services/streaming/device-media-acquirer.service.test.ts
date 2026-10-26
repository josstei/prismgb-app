import * as serviceMocks from '../../../../../factories/index.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DeviceCatalog,
  getDeviceAcquisitionProfile,
  getDeviceStreamProfile
} from '@platform/devices';
import { DeviceMediaAcquirer } from '@renderer/infrastructure/services/streaming/device-media-acquirer.service';
import {
  createCaptureStreamMock,
  createMediaTrackMock
} from '../../../../../factories/index.js';
import { createServiceHarness } from '../../../../../support/service.harness.js';
import {
  CHROMATIC_AUDIO_DEVICE_INFO,
  CHROMATIC_VIDEO_DEVICE_INFO
} from '../../../../../devices/media.testkit';
import {
  createChromaticAudioDeviceInfo,
  createChromaticVideoDeviceInfo
} from '../../../../../devices/media.testkit';

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
  const h = createServiceHarness(DeviceMediaAcquirer, {
      loggerFactory: serviceMocks.createLoggerFactory(),
      mediaDevicesPort
    });
  const acquirer = h.subject;
  const { loggerFactory } = h.deps;

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

  it.each(['grant', 'reject'])('disposes without waiting for permission and owns a late %s', async (outcome) => {
    const { acquirer, mediaDevicesPort, target } = createAcquirer();
    const permission = Promise.withResolvers<MediaStream>();
    mediaDevicesPort.getUserMedia.mockReturnValueOnce(permission.promise);
    const acquired = expect(acquirer.acquire(target)).rejects.toMatchObject({ name: 'AbortError' });
    await acquirer.dispose();
    await acquired;
    expect(mediaDevicesPort.getUserMedia).toHaveBeenCalledOnce();
    if (outcome === 'grant') {
      const stream = createActiveStream();
      permission.resolve(stream);
      await vi.waitFor(() => stream.getTracks().forEach((track) => expect(track.stop).toHaveBeenCalledOnce()));
    } else {
      permission.reject(new Error('Permission denied after shutdown'));
      await Promise.resolve();
    }
    await expect(acquirer.acquire(target)).rejects.toMatchObject({ name: 'AbortError' });
    expect(mediaDevicesPort.getUserMedia).toHaveBeenCalledOnce();
  });

  it('cancels one permission request without closing a replacement acquisition', async () => {
    const { acquirer, mediaDevicesPort, target } = createAcquirer();
    const permission = Promise.withResolvers<MediaStream>();
    const abort = new AbortController();
    mediaDevicesPort.getUserMedia.mockReturnValueOnce(permission.promise);
    const cancelled = expect(acquirer.acquire(target, abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
    abort.abort();
    await cancelled;
    const replacement = await acquirer.acquire(target);
    const old = createActiveStream('cancelled');
    permission.resolve(old);
    await vi.waitFor(() => old.getTracks().forEach((track) => expect(track.stop).toHaveBeenCalledOnce()));
    replacement.stream.getTracks().forEach((track) => expect(track.stop).not.toHaveBeenCalled());
    await acquirer.dispose();
  });

});
