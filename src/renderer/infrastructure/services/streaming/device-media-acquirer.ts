import { BaseService, getErrorMessage } from '@prismgb/core';
import type { LoggerFactoryLike } from '@prismgb/core';
import type { DeviceDescriptor, DeviceResolution } from '@prismgb/devices';
import type { MediaDevicesPort } from '../devices/device-platform.adapters.js';

export interface DeviceStreamCapabilities {
  hasAudio: boolean;
  hasVideo: boolean;
  canvasScale: number;
  nativeResolution: { width: number; height: number };
  canvasResolution: { width: number; height: number; scale: number };
  frameRate: number;
  audioSupport: boolean;
  fallbackStrategy: string;
  pixelPerfect: boolean;
  supportedResolutions: readonly DeviceResolution[];
}

export interface DeviceMediaAcquireResult {
  stream: MediaStream;
  strategy: string;
  capabilities: DeviceStreamCapabilities;
}

type DeviceMediaAcquirerDependencies = {
  mediaDevicesPort: MediaDevicesPort;
  loggerFactory: LoggerFactoryLike;
};

type ConstraintDetail = 'full' | 'simple' | 'minimal';

type AcquisitionAttempt = {
  strategy: string;
  detail: ConstraintDetail;
  audio: boolean;
  video: boolean;
};

type TrackInfo = {
  kind: string;
  label: string;
  enabled: boolean;
  muted: boolean;
  readyState: string;
  settings: MediaTrackSettings;
};

function getConstraintValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }

  const record = value as Record<string, unknown>;
  return record.ideal ?? record.exact ?? value;
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  );
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
): { width: number; height: number; scale: number } {
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

function getTrackSettings(track: MediaStreamTrack): MediaTrackSettings {
  return typeof track.getSettings === 'function' ? track.getSettings() : {};
}

export class DeviceMediaAcquirer extends BaseService {
  private readonly mediaDevicesPort: MediaDevicesPort;
  private readonly activeStreams = new Set<MediaStream>();

  constructor(dependencies: DeviceMediaAcquirerDependencies) {
    super(dependencies, 'DeviceMediaAcquirer');
    this.mediaDevicesPort = dependencies.mediaDevicesPort;
  }

  async acquire(device: MediaDeviceInfo, descriptor: DeviceDescriptor): Promise<DeviceMediaAcquireResult> {
    if (!device.deviceId) {
      throw new Error('DeviceMediaAcquirer.acquire requires a media device ID');
    }

    const audioDeviceId = await this.resolveAudioDeviceId(device);
    if (!audioDeviceId && descriptor.capabilities.includes('audio-capture')) {
      this.logger.warn('No matching audio input found - disabling audio to avoid mic capture');
    }

    const attempts = this.getAttempts(descriptor, Boolean(audioDeviceId));
    let lastError: unknown = null;

    for (const attempt of attempts) {
      const constraints = this.buildConstraints(device, descriptor, attempt, audioDeviceId);
      try {
        this.logger.info(`Attempting stream acquisition with strategy: ${attempt.strategy}`);
        this.logger.debug('Media constraints:', constraints);
        const stream = await this.acquireStream(constraints);
        return {
          stream,
          strategy: attempt.strategy,
          capabilities: this.getCapabilities(descriptor, Boolean(audioDeviceId))
        };
      } catch (error) {
        lastError = error;
        this.logger.warn(`Stream acquisition strategy failed (${attempt.strategy}):`, getErrorMessage(error));
      }
    }

    throw new Error(
      `Stream acquisition failed for ${descriptor.name}: ${getErrorMessage(lastError, 'Unknown error')}`,
      { cause: lastError }
    );
  }

  async release(stream: MediaStream): Promise<void> {
    if (!stream) {
      return;
    }

    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch (error) {
        this.logger.warn(`Failed to stop ${track.kind} track:`, error);
      }
    }

    this.activeStreams.delete(stream);
  }

  getStreamInfo(stream: MediaStream): Record<string, unknown> | null {
    if (!stream) {
      return null;
    }

    const tracks: TrackInfo[] = stream.getTracks().map((track) => ({
      kind: track.kind,
      label: track.label,
      enabled: track.enabled,
      muted: track.muted,
      readyState: track.readyState,
      settings: getTrackSettings(track)
    }));

    return {
      id: stream.id,
      active: stream.active,
      tracks
    };
  }

  override async dispose(): Promise<void> {
    const streams = [...this.activeStreams];
    await Promise.allSettled(streams.map((stream) => this.release(stream)));
    await super.dispose();
  }

  private getAttempts(descriptor: DeviceDescriptor, hasAudioDevice: boolean): AcquisitionAttempt[] {
    const audio = hasAudioDevice && descriptor.capabilities.includes('audio-capture');
    const attempts: AcquisitionAttempt[] = [
      { strategy: 'full', detail: 'full', audio, video: true }
    ];

    if (descriptor.behavior.allowFallback) {
      attempts.push(
        { strategy: 'simple', detail: 'simple', audio, video: true },
        { strategy: 'minimal', detail: 'minimal', audio, video: true },
        { strategy: 'video-only-simple', detail: 'simple', audio: false, video: true },
        { strategy: 'video-only-minimal', detail: 'minimal', audio: false, video: true }
      );
    }

    return attempts;
  }

  private async resolveAudioDeviceId(device: MediaDeviceInfo): Promise<string | null> {
    if (!device.groupId) {
      return null;
    }

    try {
      const devices = await this.mediaDevicesPort.enumerateDevices();
      const audioDevice = devices.find((candidate) => (
        candidate.kind === 'audioinput' &&
        candidate.groupId === device.groupId &&
        Boolean(candidate.deviceId)
      ));
      return audioDevice?.deviceId ?? null;
    } catch (error) {
      this.logger.warn('Failed to enumerate audio devices:', getErrorMessage(error));
      return null;
    }
  }

  private buildConstraints(
    device: MediaDeviceInfo,
    descriptor: DeviceDescriptor,
    attempt: AcquisitionAttempt,
    audioDeviceId: string | null
  ): MediaStreamConstraints {
    return {
      audio: attempt.audio && audioDeviceId
        ? this.buildAudioConstraints(descriptor, attempt.detail, audioDeviceId)
        : false,
      video: attempt.video
        ? this.buildVideoConstraints(descriptor, attempt.detail, device.deviceId)
        : false
    };
  }

  private buildAudioConstraints(
    descriptor: DeviceDescriptor,
    detail: ConstraintDetail,
    audioDeviceId: string
  ): MediaTrackConstraints {
    const target = { deviceId: { exact: audioDeviceId } };

    if (detail === 'minimal') {
      return target;
    }

    return {
      ...(detail === 'simple' ? descriptor.media.audio.simple : descriptor.media.audio.full),
      ...target
    };
  }

  private buildVideoConstraints(
    descriptor: DeviceDescriptor,
    detail: ConstraintDetail,
    videoDeviceId: string
  ): MediaTrackConstraints {
    const target = { deviceId: { exact: videoDeviceId } };

    if (detail === 'minimal') {
      return target;
    }

    if (detail === 'simple') {
      return compactRecord({
        width: getConstraintValue(descriptor.media.video.width),
        height: getConstraintValue(descriptor.media.video.height),
        frameRate: getConstraintValue(descriptor.media.video.frameRate),
        ...target
      });
    }

    return {
      ...descriptor.media.video,
      ...target
    };
  }

  private async acquireStream(constraints: MediaStreamConstraints): Promise<MediaStream> {
    const stream = await this.mediaDevicesPort.getUserMedia(constraints);
    if (!stream?.getTracks || stream.getTracks().length === 0) {
      throw new Error('Invalid stream: no tracks available');
    }

    this.activeStreams.add(stream);
    return stream;
  }

  private getCapabilities(descriptor: DeviceDescriptor, hasAudioDevice: boolean): DeviceStreamCapabilities {
    const canvasScale = getCanvasScale(descriptor);
    return {
      hasAudio: hasAudioDevice && descriptor.capabilities.includes('audio-capture'),
      hasVideo: descriptor.capabilities.includes('video-capture'),
      canvasScale,
      nativeResolution: {
        width: descriptor.display.nativeWidth,
        height: descriptor.display.nativeHeight
      },
      canvasResolution: getResolutionByScale(descriptor, canvasScale),
      frameRate: getFrameRate(descriptor),
      audioSupport: descriptor.capabilities.includes('audio-capture'),
      fallbackStrategy: descriptor.media.fallbackStrategy,
      pixelPerfect: descriptor.display.pixelPerfect,
      supportedResolutions: descriptor.display.resolutions
    };
  }
}
