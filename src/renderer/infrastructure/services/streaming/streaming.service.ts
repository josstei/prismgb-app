/**
 * Streaming Service
 *
 * Manages media streaming through the catalog-backed device runtime
 * 100% UI-agnostic - only manages MediaStream state and emits events
 *
 * Uses a state machine to prevent race conditions in start/stop operations.
 *
 * Events emitted:
 * - 'stream:started' - Stream successfully started
 * - 'stream:stopped' - Stream stopped
 * - 'stream:error' - Stream error occurred
 */

import { injectable, inject } from 'inversify';
import { BaseService } from '@platform/core';
import { EventChannels } from '@platform/events';
import { getErrorMessage } from '@platform/core';
import type {
  TypedEventBusLike
} from '@platform/events';
import type {
  LoggerFactoryLike
} from '@platform/core';
import { StreamTrackMonitor } from './stream-track.monitor.js';
import type {
  DeviceMediaAcquirer,
  DeviceStreamCapabilities
} from './device-media-acquirer.service.js';
import type { DeviceStreamingTarget } from '../devices/device-runtime.service.js';
import { TOKENS } from '@renderer/application/di/tokens.js';

const StreamState = {
  IDLE: 'idle',
  STARTING: 'starting',
  STREAMING: 'streaming',
  STOPPING: 'stopping',
  ERROR: 'error'
};

type StreamLifecycleState = (typeof StreamState)[keyof typeof StreamState];

type StreamSettingsSnapshot = {
  video: Record<string, unknown> | null;
  audio: Record<string, unknown> | null;
  hasAudio: boolean;
};

type StreamStartResult = {
  stream: MediaStream;
  device: MediaDeviceInfo;
  settings: StreamSettingsSnapshot | null;
  capabilities: DeviceStreamCapabilities;
  strategy: string;
};

type StreamOperationPromise = Promise<StreamStartResult | void>;

type RendererDeviceRuntimeLike = {
  resolveStreamingTarget(deviceId?: string | null): Promise<DeviceStreamingTarget>;
};

function toSettingsPayload(
  settings: MediaTrackSettings | undefined
): Record<string, unknown> | null {
  if (!settings) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(settings).filter(([, value]) => value !== undefined)
  );
}

@injectable()
export class StreamingService extends BaseService {
  private readonly _trackMonitor: StreamTrackMonitor;

  private _state: StreamLifecycleState;
  private _operationPromise: StreamOperationPromise | null;
  currentStream: MediaStream | null;
  currentDevice: MediaDeviceInfo | null;
  currentCapabilities: DeviceStreamCapabilities | null;

  constructor(
    @inject(TOKENS.rendererDeviceRuntime) private readonly rendererDeviceRuntime: RendererDeviceRuntimeLike,
    @inject(TOKENS.deviceMediaAcquirer) private readonly deviceMediaAcquirer: DeviceMediaAcquirer,
    @inject(TOKENS.eventBus) private readonly eventBus: TypedEventBusLike,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactoryLike
  ) {
    super({ loggerFactory, eventBus }, 'StreamingService');

    this._trackMonitor = new StreamTrackMonitor(this.logger);
    // State machine
    this._state = StreamState.IDLE;
    this._operationPromise = null;

    // Stream state
    this.currentStream = null;
    this.currentDevice = null;
    this.currentCapabilities = null;
  }

  get isStreaming(): boolean {
    return this._state === StreamState.STREAMING;
  }

  async start(deviceId: string | null = null): Promise<StreamStartResult> {
    // If already starting, return the existing operation
    if (this._state === StreamState.STARTING && this._operationPromise) {
      this.logger.debug('Start already in progress, reusing promise');
      return this._operationPromise as Promise<StreamStartResult>;
    }

    // If stopping, wait for it to complete first
    if (this._state === StreamState.STOPPING && this._operationPromise) {
      this.logger.debug('Waiting for stop to complete before starting');
      await this._operationPromise;
    }

    // If already streaming, stop first
    if (this._state === StreamState.STREAMING) {
      await this.stop();
    }

    // Check if we can transition to starting
    if (this._state !== StreamState.IDLE && this._state !== StreamState.ERROR) {
      throw new Error(`Cannot start from state: ${this._state}`);
    }

    // Clean up any partial state from previous ERROR before starting
    if (this._state === StreamState.ERROR) {
      await this._cleanupPartialState();
    }

    this._state = StreamState.STARTING;
    this._operationPromise = this._performStart(deviceId);

    try {
      const result = await this._operationPromise as StreamStartResult;
      this._state = StreamState.STREAMING;
      return result;
    } catch (error) {
      this._state = StreamState.ERROR;
      throw error;
    } finally {
      this._operationPromise = null;
    }
  }

  private async _performStart(deviceId: string | null): Promise<StreamStartResult> {
    try {
      const target = await this.rendererDeviceRuntime.resolveStreamingTarget(deviceId);
      const acquisition = await this.deviceMediaAcquirer.acquire(target);

      this.currentStream = acquisition.stream;
      this.currentDevice = target.videoDevice;

      // Get stream settings
      const settings = this._getStreamSettings();

      // Get and store capabilities
      const capabilities = acquisition.capabilities;
      this.currentCapabilities = capabilities;

      // Monitor video track for device disconnection/power-off
      this._setupTrackMonitoring();

      this.logger.info('Stream started successfully');

      // Emit event
      this.eventBus.publish(EventChannels.STREAM.STARTED, {
        stream: this.currentStream,
        device: this.currentDevice,
        settings,
        capabilities,
        strategy: acquisition.strategy
      });

      return {
        stream: this.currentStream,
        device: this.currentDevice,
        settings,
        capabilities,
        strategy: acquisition.strategy
      };
    } catch (error) {
      this.logger.error('Failed to start stream:', error);
      this.eventBus.publish(EventChannels.STREAM.ERROR, {
        error,
        operation: 'start',
        deviceId: deviceId || 'auto-select',
        message: getErrorMessage(error)
      });
      throw error;
    }
  }

  async stop(): Promise<void> {
    // If already stopping, return the existing operation
    if (this._state === StreamState.STOPPING && this._operationPromise) {
      this.logger.debug('Stop already in progress, reusing promise');
      return this._operationPromise as Promise<void>;
    }

    // If starting, wait for it to complete first, then stop
    if (this._state === StreamState.STARTING && this._operationPromise) {
      this.logger.debug('Waiting for start to complete before stopping');
      try {
        await this._operationPromise;
      } catch (error) {
        this.logger.warn('Start operation failed during stop, continuing with cleanup:', getErrorMessage(error));
      }
    }

    // Nothing to stop if idle or already in error
    if (this._state === StreamState.IDLE) {
      this.logger.debug('Not streaming, nothing to stop');
      return;
    }

    this._state = StreamState.STOPPING;
    this._operationPromise = this._performStop();

    try {
      await this._operationPromise;
      this._state = StreamState.IDLE;
    } catch (error) {
      // Even on error, move to idle (cleanup happened)
      this._state = StreamState.IDLE;
      throw error;
    } finally {
      this._operationPromise = null;
    }
  }

  private async _performStop(): Promise<void> {
    this.logger.info('Stopping stream');

    // Remove track monitoring before releasing stream
    this._removeTrackMonitoring();

    // Release stream via the unified media acquirer.
    if (this.currentStream) {
      try {
        await this.deviceMediaAcquirer.release(this.currentStream);
      } catch (error) {
        this.logger.error('Error releasing stream:', error);
        // Continue with cleanup even if release fails
      }
    }

    // Clear state (always, even if release failed)
    this.currentStream = null;
    this.currentDevice = null;
    this.currentCapabilities = null;

    await this.eventBus.publishAsync(EventChannels.STREAM.STOPPED);

    this.logger.info('Stream stopped');
  }

  private _setupTrackMonitoring(): void {
    if (!this.currentStream) return;

    this._trackMonitor.start(this.currentStream, () => {
      // Emit error event to notify UI
      this.eventBus.publish(EventChannels.STREAM.ERROR, {
        error: new Error('Video track ended unexpectedly'),
        operation: 'streaming',
        message: 'Device disconnected or powered off'
      });

      // Stop the stream (will clean up and emit STOPPED event)
      this.stop().catch((error: unknown) => {
        this.logger.error('Error during track-ended cleanup:', error);
      });
    });
  }

  private _removeTrackMonitoring(): void {
    this._trackMonitor.stop();
  }

  private async _cleanupPartialState(): Promise<void> {
    this.logger.debug('Cleaning up partial state from ERROR');

    // Remove any track monitoring that might have been set up
    this._removeTrackMonitoring();

    try {
      // Release stream if it was acquired - await to prevent race conditions
      if (this.currentStream) {
        await this.deviceMediaAcquirer.release(this.currentStream);
      }
    } catch (error) {
      this.logger.warn('Error releasing stream during partial cleanup:', error);
    } finally {
      // Always clear all state, even if release failed
      this.currentStream = null;
      this.currentDevice = null;
      this.currentCapabilities = null;
    }
  }

  getStream(): MediaStream | null {
    return this.currentStream;
  }

  isActive(): boolean {
    return this.isStreaming;
  }

  private _getStreamSettings(): StreamSettingsSnapshot | null {
    if (!this.currentStream) {
      return null;
    }

    const videoTrack = this.currentStream.getVideoTracks()[0];
    const audioTracks = this.currentStream.getAudioTracks();

    return {
      video: toSettingsPayload(videoTrack?.getSettings()),
      audio: toSettingsPayload(audioTracks[0]?.getSettings()),
      hasAudio: audioTracks.length > 0
    };
  }

  /**
   * Dispose and release all resources
   * Called during application shutdown
   */
  async dispose(): Promise<void> {
    await this.stop();
    await super.dispose();
    this.logger.info('StreamingService disposed');
  }
}
