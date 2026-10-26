
import { BaseService, getErrorMessage } from '@platform/core';
import type { LoggerFactoryLike } from '@platform/core';
import type {
  DeviceAcquisitionAttempt,
  DeviceConstraintMap,
  DeviceStreamProfile
} from '@platform/devices';
import type { MediaDevicesPort } from '../devices/browser-media-devices.port.js';
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

export class DeviceMediaAcquirer extends BaseService {
  private readonly activeStreams = new Set<MediaStream>();
  private readonly lifetime = new AbortController();

  private readonly mediaDevicesPort: MediaDevicesPort;

  constructor({ mediaDevicesPort, loggerFactory }: DeviceMediaAcquirerDependencies) {
    super({ loggerFactory }, 'DeviceMediaAcquirer');
    this.mediaDevicesPort = mediaDevicesPort;
  }

  async acquire(target: DeviceStreamingTarget, requestSignal?: AbortSignal): Promise<DeviceMediaAcquireResult> {
    const signal = requestSignal ? AbortSignal.any([this.lifetime.signal, requestSignal]) : this.lifetime.signal;
    signal.throwIfAborted();
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
        const stream = await this.acquireStream(constraints, signal);
        return {
          stream,
          strategy: attempt.strategy,
          capabilities: this.getCapabilities(target.profile, hasAudioDevice)
        };
      } catch (error) {
        signal.throwIfAborted();
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

  override async dispose(): Promise<void> {
    this.lifetime.abort();
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

  private acquireStream(constraints: MediaStreamConstraints, signal: AbortSignal): Promise<MediaStream> {
    return new Promise((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      // Native getUserMedia cannot be cancelled. Logical cancellation releases
      // the caller immediately; a later permission grant still has an owner.
      const acquire = async () => {
        try {
          signal.throwIfAborted();
          const stream = await this.mediaDevicesPort.getUserMedia(constraints);
          if (signal.aborted) { await this.release(stream); return; }
          if (!stream?.getTracks || stream.getTracks().length === 0) {
            throw new Error('Invalid stream: no tracks available');
          }
          this.activeStreams.add(stream);
          resolve(stream);
        } catch (error) {
          reject(error);
        } finally {
          signal.removeEventListener('abort', abort);
        }
      };
      void acquire();
    });
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
