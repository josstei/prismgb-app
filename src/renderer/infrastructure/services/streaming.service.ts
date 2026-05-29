import { Service } from '@prismgb/core';
/**
 * Streaming Service
 *
 * Manages media streaming with device-specific adapters
 * 100% UI-agnostic - only manages MediaStream state and emits events
 *
 * Uses a state machine to prevent race conditions in start/stop operations.
 *
 * Events emitted:
 * - 'stream:started' - Stream successfully started
 * - 'stream:stopped' - Stream stopped
 * - 'stream:error' - Stream error occurred
 */

import { BaseService } from '@prismgb/core';
import { DeviceDetectionHelper } from '@prismgb/devices';
import { EventChannels } from '@prismgb/events';
import { getErrorMessage } from '@prismgb/core';
import type {
  StreamingCapabilities,
  TypedEventBusLike
} from '@prismgb/events';
import type {
  LoggerFactoryLike
} from '@prismgb/core';

const StreamState = {
  IDLE: 'idle',
  STARTING: 'starting',
  STREAMING: 'streaming',
  STOPPING: 'stopping',
  ERROR: 'error'
};

const TRACK_ENDED_LIFECYCLE = Symbol('streamTrackEnded');

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
  capabilities: StreamingCapabilities;
};

type StreamOperationPromise = Promise<StreamStartResult | void>;

type DeviceEnumerationResult = {
  devices: MediaDeviceInfo[];
  connected: boolean;
};

type DeviceServiceLike = {
  enumerateDevices(): Promise<DeviceEnumerationResult>;
  getRegisteredStoredDeviceIds(): string[];
  discoverSupportedDevice(): Promise<MediaDeviceInfo | null>;
  registerSupportedDevice(device: MediaDeviceInfo): void;
};

type StreamingAdapterLike = {
  getStream(device: MediaDeviceInfo): Promise<MediaStream>;
  releaseStream(stream: MediaStream): Promise<void>;
  getCapabilities(device: MediaDeviceInfo): Promise<StreamingCapabilities> | StreamingCapabilities;
};

type StreamingAdapterFactoryLike = {
  getAdapterForDevice(
    device: MediaDeviceInfo,
    dependencies?: Record<string, unknown>
  ): StreamingAdapterLike;
};

type StreamingServiceDependencies = {
  deviceService: DeviceServiceLike;
  eventBus: TypedEventBusLike;
  loggerFactory: LoggerFactoryLike;
  adapterFactory: StreamingAdapterFactoryLike;
  ipcClient: Record<string, unknown>;
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

@Service({
  "token": "streamingService",
  "disposal": "dispose"
})
export class StreamingService extends BaseService {
  private readonly deviceService: DeviceServiceLike;
  protected readonly eventBus: TypedEventBusLike;
  private readonly adapterFactory: StreamingAdapterFactoryLike;
  private readonly ipcClient: Record<string, unknown>;

  private _state: StreamLifecycleState;
  private _operationPromise: StreamOperationPromise | null;
  currentStream: MediaStream | null;
  currentAdapter: StreamingAdapterLike | null;
  currentDevice: MediaDeviceInfo | null;
  currentCapabilities: StreamingCapabilities | null;

  constructor(dependencies: StreamingServiceDependencies) {
    super(dependencies, 'StreamingService');

    this.deviceService = dependencies.deviceService;
    this.eventBus = dependencies.eventBus;
    this.adapterFactory = dependencies.adapterFactory;
    this.ipcClient = dependencies.ipcClient;
    // State machine
    this._state = StreamState.IDLE;
    this._operationPromise = null;

    // Stream state
    this.currentStream = null;
    this.currentAdapter = null;
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
      // Get device
      let device: MediaDeviceInfo;
      if (deviceId) {
        device = await this._getDeviceById(deviceId);
      } else {
        device = await this._autoSelectDevice();
      }

      if (!device) {
        throw new Error('No device available for streaming');
      }

      // Get adapter for device (pass ipcClient for device adapter)
      this.currentAdapter = this.adapterFactory.getAdapterForDevice(device, {
        ipcClient: this.ipcClient
      });

      // Get stream from adapter
      this.currentStream = await this.currentAdapter.getStream(device);
      this.currentDevice = device;
      this.deviceService.registerSupportedDevice(device);

      // Get stream settings
      const settings = this._getStreamSettings();

      // Get and store capabilities
      const capabilities = await this.currentAdapter.getCapabilities(device);
      this.currentCapabilities = capabilities;

      // Monitor video track for device disconnection/power-off
      this._setupTrackMonitoring();

      this.logger.info('Stream started successfully');

      // Emit event
      this.eventBus.publish(EventChannels.STREAM.STARTED, {
        stream: this.currentStream,
        device: this.currentDevice,
        settings,
        capabilities
      });

      return { stream: this.currentStream, device: this.currentDevice, settings, capabilities };
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

    // Release stream via adapter (with error handling to ensure cleanup)
    if (this.currentAdapter && this.currentStream) {
      try {
        await this.currentAdapter.releaseStream(this.currentStream);
      } catch (error) {
        this.logger.error('Error releasing stream:', error);
        // Continue with cleanup even if release fails
      }
    }

    // Clear state (always, even if release failed)
    this.currentStream = null;
    this.currentAdapter = null;
    this.currentDevice = null;
    this.currentCapabilities = null;

    await this.eventBus.publishAsync(EventChannels.STREAM.STOPPED);

    this.logger.info('Stream stopped');
  }

  private _setupTrackMonitoring(): void {
    if (!this.currentStream) return;

    const videoTrack = this.currentStream.getVideoTracks()[0];
    if (!videoTrack) return;
    this.disposables.cancel(TRACK_ENDED_LIFECYCLE);

    // Create handler that stops the stream when track ends
    const trackEndedHandler = () => {
      this.logger.warn('Video track ended - device may have been disconnected or powered off');

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
    };

    videoTrack.addEventListener('ended', trackEndedHandler);
    this.disposables.replace(TRACK_ENDED_LIFECYCLE, () => {
      videoTrack.removeEventListener('ended', trackEndedHandler);
    });
    this.logger.debug('Track monitoring set up for video track');
  }

  private _removeTrackMonitoring(): void {
    this.disposables.cancel(TRACK_ENDED_LIFECYCLE);
    this.logger.debug('Track monitoring removed');
  }

  private async _cleanupPartialState(): Promise<void> {
    this.logger.debug('Cleaning up partial state from ERROR');

    // Remove any track monitoring that might have been set up
    this._removeTrackMonitoring();

    try {
      // Release stream if it was acquired - await to prevent race conditions
      if (this.currentAdapter && this.currentStream) {
        await this.currentAdapter.releaseStream(this.currentStream);
      }
    } catch (error) {
      this.logger.warn('Error releasing stream during partial cleanup:', error);
    } finally {
      // Always clear all state, even if release failed
      this.currentStream = null;
      this.currentAdapter = null;
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

  private async _getDeviceById(deviceId: string): Promise<MediaDeviceInfo> {
    // Use DeviceService to ensure permission warm-up and caching
    const { devices } = await this.deviceService.enumerateDevices();
    const device = devices.find((enumeratedDevice) => (
      enumeratedDevice.deviceId === deviceId &&
      enumeratedDevice.kind === 'videoinput'
    ));

    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    return device;
  }

  private async _autoSelectDevice(): Promise<MediaDeviceInfo> {
    this.logger.info('Auto-selecting device');

    const storedIds = this.deviceService.getRegisteredStoredDeviceIds();
    if (storedIds.length > 0) {
      // Try all stored device IDs in parallel for faster restoration when first IDs are stale
      try {
        const device = await Promise.any(
          storedIds.map(deviceId => this._getDeviceById(deviceId))
        );
        this.logger.info('Using stored device ID:', device.label);
        return device;
      } catch {
        // AggregateError - all stored IDs failed, fall through to label matching
        this.logger.warn('All stored device IDs not found in enumeration');
      }
    }

    const discoveredDevice = await this.deviceService.discoverSupportedDevice();
    if (discoveredDevice) {
      this.logger.info('Discovered supported device:', discoveredDevice.label);
      return discoveredDevice;
    }

    const { devices } = await this.deviceService.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    const matchedDevice = videoDevices.find(device =>
      DeviceDetectionHelper.matchesByLabel(device.label) !== null
    );

    if (matchedDevice) {
      this.logger.info('Auto-selected device by label:', matchedDevice.label);
      return matchedDevice;
    }

    const labelsHidden = videoDevices.length > 0 && videoDevices.every(device => !device.label);
    if (labelsHidden) {
      throw new Error('Chromatic camera not authorized. Please grant permission and retry.');
    }

    throw new Error('No supported device found');
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
