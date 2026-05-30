import { IDeviceAdapter } from '@prismgb/devices';
import { AcquisitionContext } from '@renderer/infrastructure/services/streaming/acquisition/acquisition-context';

import type { LoggerLike, EventBusLike } from '@prismgb/core';

interface ConstraintBuilderLike {
  build(context: AcquisitionContext, detailLevel: string, options?: Record<string, unknown>): MediaStreamConstraints;
}

interface StreamLifecycleLike {
  acquireStream(constraints: MediaStreamConstraints, options?: Record<string, unknown>): Promise<MediaStream>;
  releaseStream(stream: MediaStream): Promise<void>;
  getStreamInfo(stream: MediaStream): Record<string, unknown>;
}

interface MediaProfile {
  audio?: Record<string, unknown>;
  video?: Record<string, unknown>;
}

interface BaseDeviceAdapterDependencies {
  eventBus?: EventBusLike;
  logger?: LoggerLike;
  constraintBuilder?: ConstraintBuilderLike;
  streamLifecycle?: StreamLifecycleLike;
}

/**
 * Base device adapter with common functionality for media stream acquisition
 * Subclasses should override getStream() for device-specific acquisition logic.
 * @extends IDeviceAdapter
 */
export class BaseDeviceAdapter extends IDeviceAdapter {
  eventBus: EventBusLike | undefined;
  logger: LoggerLike | undefined;
  constraintBuilder: ConstraintBuilderLike | undefined;
  streamLifecycle: StreamLifecycleLike | undefined;
  deviceInfo: MediaDeviceInfo | null;
  profile: MediaProfile | null;
  currentStream: MediaStream | null;

  constructor(dependencies: BaseDeviceAdapterDependencies = {}) {
    super();

    this.eventBus = dependencies.eventBus;
    this.logger = dependencies.logger;
    this.constraintBuilder = dependencies.constraintBuilder;
    this.streamLifecycle = dependencies.streamLifecycle;

    this.deviceInfo = null;
    this.profile = null;
    this.currentStream = null;
  }

  async initialize(deviceInfo: MediaDeviceInfo): Promise<void> {
    this.deviceInfo = deviceInfo;
    this._log('info', 'Adapter initialized for device:', deviceInfo);
  }

  async getStream(options = {}) {
    if (!this.profile) {
      throw new Error('Adapter not properly initialized - missing profile');
    }

    if (!this.deviceInfo?.deviceId) {
      throw new Error('Adapter not properly initialized - missing deviceInfo');
    }

    // Create acquisition context with device identity
    const context = new AcquisitionContext({
      deviceId: this.deviceInfo.deviceId,
      groupId: this.deviceInfo.groupId || null,
      profile: this.profile
    });

    const constraints = this.constraintBuilder!.build(context, 'full', options);
    this.currentStream = await this.streamLifecycle!.acquireStream(constraints, options);

    return this.currentStream;
  }

  async releaseStream(stream: MediaStream): Promise<void> {
    if (stream) {
      await this.streamLifecycle?.releaseStream(stream);
    }
    if (stream === this.currentStream) {
      this.currentStream = null;
    }
  }

  getCapabilities() {
    return {
      hasAudio: !!this.profile?.audio,
      hasVideo: !!this.profile?.video,
      supportsFallback: false
    };
  }

  getProfile() {
    return this.profile;
  }

  async cleanup() {
    if (this.currentStream) {
      await this.releaseStream(this.currentStream);
    }
    this.deviceInfo = null;
    this.profile = null;
  }

  _log(level: keyof LoggerLike, message: string, ...args: unknown[]) {
    if (this.logger?.[level]) {
      this.logger[level](message, ...args);
    }
  }
}
