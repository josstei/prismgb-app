import { BaseService, getErrorMessage } from '@platform/core';
import type { LoggerFactoryLike } from '@platform/core';
import type {
  DeviceAcquisitionAttempt,
  DeviceConstraintMap,
  DeviceStreamProfile
} from '@platform/devices';
import type { MediaDevicesPort } from '../devices/device-platform.adapters.js';
import type { DeviceStreamingTarget } from '../devices/device-runtime.service.js';

export interface DeviceStreamCapabilities extends DeviceStreamProfile {
  hasAudio: boolean;
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

type TrackInfo = {
  kind: string;
  label: string;
  enabled: boolean;
  muted: boolean;
  readyState: string;
  settings: MediaTrackSettings;
};

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

  async acquire(target: DeviceStreamingTarget): Promise<DeviceMediaAcquireResult> {
    if (!target.videoDevice.deviceId) {
      throw new Error('DeviceMediaAcquirer.acquire requires a media device ID');
    }

    const hasAudioDevice = Boolean(target.audioDevice?.deviceId && target.profile.audioSupport);
    if (!hasAudioDevice && target.profile.audioSupport) {
      this.logger.warn('No matching audio input found - disabling audio to avoid mic capture');
    }

    let lastError: unknown = null;

    for (const attempt of target.acquisition.attempts) {
      const constraints = this.buildConstraints(target, attempt, hasAudioDevice);
      try {
        this.logger.info(`Attempting stream acquisition with strategy: ${attempt.strategy}`);
        this.logger.debug('Media constraints:', constraints);
        const stream = await this.acquireStream(constraints);
        return {
          stream,
          strategy: attempt.strategy,
          capabilities: this.getCapabilities(target.profile, hasAudioDevice)
        };
      } catch (error) {
        lastError = error;
        this.logger.warn(`Stream acquisition strategy failed (${attempt.strategy}):`, getErrorMessage(error));
      }
    }

    throw new Error(
      `Stream acquisition failed for ${target.descriptor.name}: ${getErrorMessage(lastError, 'Unknown error')}`,
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

  private buildConstraints(
    target: DeviceStreamingTarget,
    attempt: DeviceAcquisitionAttempt,
    hasAudioDevice: boolean
  ): MediaStreamConstraints {
    return {
      audio: attempt.includeAudio && hasAudioDevice && target.audioDevice?.deviceId
        ? this.withDeviceTarget(attempt.audioConstraints, target.audioDevice.deviceId)
        : false,
      video: attempt.includeVideo
        ? this.withDeviceTarget(attempt.videoConstraints, target.videoDevice.deviceId)
        : false
    };
  }

  private withDeviceTarget(
    constraints: DeviceConstraintMap | null,
    deviceId: string
  ): MediaTrackConstraints {
    return {
      ...(constraints ?? {}),
      deviceId: { exact: deviceId }
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

  private getCapabilities(
    profile: DeviceStreamProfile,
    hasAudioDevice: boolean
  ): DeviceStreamCapabilities {
    return {
      ...profile,
      hasAudio: hasAudioDevice
    };
  }
}
