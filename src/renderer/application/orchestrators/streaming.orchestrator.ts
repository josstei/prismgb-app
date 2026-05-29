import { Service } from '@prismgb/core';
import { BaseOrchestrator } from '@prismgb/core';
import { EventChannels } from '@prismgb/events';
import type { LoggerLike } from '@prismgb/core';
import type { TypedEventBusLike } from '@prismgb/events';
import { getErrorMessage } from '@prismgb/core';
import {
  isPerformanceStatePayload,
  isStreamStartedPayload,
  isSupportedDeviceAvailablePayload
} from '@renderer/infrastructure/streaming/streaming-contracts.js';
import type {
  PerformanceStatePayload,
  StreamingCapabilities
} from '@renderer/infrastructure/streaming/streaming-contracts.js';

type LoggerFactoryLike = {
  create(name: string): LoggerLike;
};

type StreamingServiceLike = {
  start(deviceId?: string | null): Promise<unknown>;
  stop(): Promise<void>;
  getStream(): MediaStream | null;
  isActive(): boolean;
};

type AppStateLike = {
  deviceConnected: boolean;
  isStreaming: boolean;
};

type StreamViewServiceLike = {
  attachMutedStream(stream: MediaStream): void;
  clearStream(): void;
};

type RenderPipelineServiceLike = {
  initialize(): void;
  handleCanvasExpired(): Promise<void>;
  handlePerformanceStateChanged(state: PerformanceStatePayload): void;
  handleFullscreenChange(): void;
  handleRenderPresetChanged(presetId: string): void;
  handlePerformanceModeChanged(enabled: boolean): Promise<void>;
  startPipeline(capabilities: StreamingCapabilities): Promise<void>;
  stopPipeline(): void;
  cleanup(): Promise<void>;
};

type GpuRecordingServiceLike = {
  isActive(): boolean;
  stop(): Promise<void>;
};

type SettingsServiceLike = {
  getBooleanSetting(name: string): boolean;
};

type StreamingOrchestratorDependencies = {
  streamingService: StreamingServiceLike;
  appState: AppStateLike;
  streamViewService: StreamViewServiceLike;
  renderPipelineService: RenderPipelineServiceLike;
  gpuRecordingService: GpuRecordingServiceLike;
  settingsService: SettingsServiceLike;
  eventBus: TypedEventBusLike;
  loggerFactory: LoggerFactoryLike;
};

function getStreamErrorMessage(payload: unknown): string {
  if (typeof payload === 'object' && payload !== null) {
    if ('message' in payload && typeof payload.message === 'string' && payload.message.length > 0) {
      return payload.message;
    }

    if ('error' in payload) {
      return getErrorMessage(payload.error, 'Stream error');
    }
  }

  return getErrorMessage(payload, 'Stream error');
}

@Service({
  "token": "streamingOrchestrator",
  "dependencies": [
    "streamingService",
    "appState",
    "streamViewService",
    "renderPipelineService",
    "gpuRecordingService",
    "settingsService",
    "eventBus",
    "loggerFactory"
  ]
})
export class StreamingOrchestrator extends BaseOrchestrator {
  private readonly streamingService: StreamingServiceLike;
  private readonly appState: AppStateLike;
  private readonly streamViewService: StreamViewServiceLike;
  private readonly renderPipelineService: RenderPipelineServiceLike;
  private readonly gpuRecordingService: GpuRecordingServiceLike;
  private readonly settingsService: SettingsServiceLike;
  protected readonly eventBus: TypedEventBusLike;

  constructor(dependencies: StreamingOrchestratorDependencies) {
    super(
      dependencies,
      'StreamingOrchestrator'
    );
    this.streamingService = dependencies.streamingService;
    this.appState = dependencies.appState;
    this.streamViewService = dependencies.streamViewService;
    this.renderPipelineService = dependencies.renderPipelineService;
    this.gpuRecordingService = dependencies.gpuRecordingService;
    this.settingsService = dependencies.settingsService;
    this.eventBus = dependencies.eventBus;
  }

  async onInitialize(): Promise<void> {
    this._wireStreamEvents();
    this._wireDeviceEvents();

    this.subscribeWithCleanup({
      [EventChannels.RENDER.CANVAS_EXPIRED]: () => this.renderPipelineService.handleCanvasExpired(),
      [EventChannels.UI.STREAM_START_REQUESTED]: () => this.start(),
      [EventChannels.UI.STREAM_STOP_REQUESTED]: () => this.stop()
    });

    this.renderPipelineService.initialize();
  }

  async start(deviceId: string | null = null): Promise<void> {
    if (!this.appState.deviceConnected) {
      this.logger.warn('Cannot start stream - device not connected');
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Please connect your device first', type: 'warning' });
      return;
    }

    try {
      await this.streamingService.start(deviceId);
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to start stream');
      this.logger.error('Failed to start stream:', error);
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: `Error: ${message}`, type: 'error' });
      this.eventBus.publish(EventChannels.UI.OVERLAY_ERROR, { message });
    }
  }

  async stop(): Promise<void> {
    try {
      await this.streamingService.stop();
    } catch (error) {
      this.logger.error('Error stopping stream:', error);
      throw error;
    }
  }

  getStream(): MediaStream | null {
    return this.streamingService.getStream();
  }

  isActive(): boolean {
    return this.streamingService.isActive();
  }

  private _wireStreamEvents(): void {
    this.subscribeWithCleanup({
      [EventChannels.STREAM.STARTED]: (data: unknown) => this._handleStreamStarted(data),
      [EventChannels.STREAM.STOPPED]: () => this._handleStreamStopped(),
      [EventChannels.STREAM.ERROR]: (error: unknown) => this._handleStreamError(error),
      [EventChannels.SETTINGS.RENDER_PRESET_CHANGED]: (presetId: unknown) => this._handleRenderPresetChanged(presetId),
      [EventChannels.PERFORMANCE.RENDER_MODE_CHANGED]: (enabled: unknown) => this._handlePerformanceModeChanged(enabled),
      [EventChannels.PERFORMANCE.STATE_CHANGED]: (state: unknown) => this._handlePerformanceStateChanged(state),
      [EventChannels.UI.WINDOW_RESIZED]: () => this._handleWindowResized()
    });
  }

  _handlePerformanceStateChanged(state: unknown): void {
    if (!isPerformanceStatePayload(state)) {
      this.logger.warn('Ignoring invalid performance state payload', state);
      return;
    }

    this.renderPipelineService.handlePerformanceStateChanged(state);
  }

  _handleWindowResized(): void {
    this.renderPipelineService.handleFullscreenChange();
  }

  _handleRenderPresetChanged(presetId: unknown): void {
    if (typeof presetId !== 'string') {
      this.logger.warn('Ignoring invalid render preset payload', presetId);
      return;
    }

    this.renderPipelineService.handleRenderPresetChanged(presetId);
  }

  async _handlePerformanceModeChanged(enabled: unknown): Promise<void> {
    if (typeof enabled !== 'boolean') {
      this.logger.warn('Ignoring invalid performance mode payload', enabled);
      return;
    }

    await this.renderPipelineService.handlePerformanceModeChanged(enabled);
  }

  private _wireDeviceEvents(): void {
    this.subscribeWithCleanup({
      [EventChannels.DEVICE.DISCONNECTED_DURING_SESSION]: () => this._handleDeviceDisconnectedDuringStream(),
      [EventChannels.DEVICE.SUPPORTED_DEVICE_AVAILABLE]: (data: unknown) => this._handleSupportedDeviceAvailable(data)
    });
  }

  async _handleStreamStarted(data: unknown): Promise<void> {
    if (!isStreamStartedPayload(data)) {
      this.logger.error('Ignoring invalid stream started payload', data);
      this.eventBus.publish(EventChannels.UI.OVERLAY_ERROR, { message: 'Unable to start rendering stream.' });
      return;
    }

    const { stream, settings, capabilities } = data;

    this.logger.info('Stream started event received');

    this.streamViewService.attachMutedStream(stream);

    this.eventBus.publish(EventChannels.UI.STREAMING_MODE, { enabled: true });

    if (settings && settings.video) {
      this.eventBus.publish(EventChannels.UI.STREAM_INFO, { settings: settings.video });
    }

    try {
      await this.renderPipelineService.startPipeline(capabilities);

      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Streaming from camera' });
    } catch (error) {
      this.logger.error('Stream unhealthy:', getErrorMessage(error, 'No frames received'));

      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
        message: 'Device not sending video. Is it powered on?',
        type: 'warning'
      });
      this.eventBus.publish(EventChannels.UI.OVERLAY_ERROR, {
        message: 'Device not sending video. Please ensure the device is powered on.'
      });

      await this.streamingService.stop().catch((stopError: unknown) => {
        this.logger.error('Error stopping unhealthy stream:', getErrorMessage(stopError, 'Failed to stop stream'));
      });
    }
  }

  async _handleStreamStopped(): Promise<void> {
    this.logger.info('Stream stopped event received');

    // Stop GPU recording BEFORE releasing GPU resources to avoid Skia race condition
    // Must await to ensure in-flight captures complete before GPU cleanup
    if (this.gpuRecordingService.isActive()) {
      this.logger.info('Stopping GPU recording before pipeline cleanup');
      await this.gpuRecordingService.stop();
    }

    this.renderPipelineService.stopPipeline();
    this.streamViewService.clearStream();

    this.eventBus.publish(EventChannels.UI.STREAMING_MODE, { enabled: false });

    this.eventBus.publish(EventChannels.UI.OVERLAY_MESSAGE, { deviceConnected: this.appState.deviceConnected });
  }

  _handleStreamError(error: unknown): void {
    const message = getStreamErrorMessage(error);

    this.logger.error('Stream error:', error);
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: `Error: ${message}`, type: 'error' });
    this.eventBus.publish(EventChannels.UI.OVERLAY_ERROR, { message });
  }

  async _handleDeviceDisconnectedDuringStream(): Promise<void> {
    if (this.appState.isStreaming) {
      this.logger.warn('Device disconnected during stream - stopping');
      await this.streamingService.stop().catch((error: unknown) => {
        this.logger.error('Error stopping stream after device disconnect:', getErrorMessage(error, 'Failed to stop stream'));
      });
    }
  }

  async _handleSupportedDeviceAvailable(data: unknown): Promise<void> {
    if (!isSupportedDeviceAvailablePayload(data)) {
      this.logger.warn('Ignoring invalid supported device payload', data);
      return;
    }

    if (this.settingsService.getBooleanSetting('autoStreamOnConnect') && !this.streamingService.isActive()) {
      const deviceLabel = data.device.label || data.device.deviceId;
      this.logger.info(`Auto-starting stream - device available: ${deviceLabel}`);
      try {
        await this.streamingService.start(data.device.deviceId);
      } catch (error) {
        const message = getErrorMessage(error, 'Failed to auto-start stream');
        this.logger.error('Failed to auto-start stream:', error);
        this.eventBus.publish(EventChannels.UI.OVERLAY_ERROR, { message });
      }
    }
  }

  async onCleanup(): Promise<void> {
    await this.renderPipelineService.cleanup();

    if (this.streamingService.isActive()) {
      try {
        await this.streamingService.stop();
      } catch (error) {
        this.logger.error('Error stopping stream during cleanup:', getErrorMessage(error, 'Failed to stop stream'));
      }
    }
  }
}
