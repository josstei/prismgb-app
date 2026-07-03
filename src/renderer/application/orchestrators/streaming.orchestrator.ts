import { injectable, inject } from 'inversify';
import { BaseOrchestrator } from '@platform/core';
import { EventChannels, OnEvent } from '@platform/events';
import type { LoggerFactoryLike } from '@platform/core';
import type { StreamErrorPayload, TypedEventBusLike } from '@platform/events';
import { getErrorMessage } from '@platform/core';
import { TOKENS } from '@renderer/application/di/tokens.js';
import type {
  PerformanceStatePayload,
  StreamStartedPayload,
  StreamingCapabilities,
  SupportedDeviceAvailablePayload
} from '@renderer/infrastructure/services/streaming/streaming-contracts.js';
import type { AppState } from '@renderer/application/state/app-state.js';


type StreamingServiceLike = {
  start(deviceId?: string | null): Promise<unknown>;
  stop(): Promise<void>;
  getStream(): MediaStream | null;
  isActive(): boolean;
};

type AppStateLike = Pick<AppState, 'deviceConnected' | 'isStreaming'>;

type StreamViewServiceLike = {
  attachMutedStream(stream: MediaStream): void;
  clearStream(): void;
};

type StreamingRenderServiceLike = {
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

@injectable()
export class StreamingOrchestrator extends BaseOrchestrator {
  constructor(
    @inject(TOKENS.streamingService) private readonly streamingService: StreamingServiceLike,
    @inject(TOKENS.appState) private readonly appState: AppStateLike,
    @inject(TOKENS.streamViewService) private readonly streamViewService: StreamViewServiceLike,
    @inject(TOKENS.streamingRenderService) private readonly streamingRenderService: StreamingRenderServiceLike,
    @inject(TOKENS.gpuRecordingService) private readonly gpuRecordingService: GpuRecordingServiceLike,
    @inject(TOKENS.settingsService) private readonly settingsService: SettingsServiceLike,
    @inject(TOKENS.eventBus) protected readonly eventBus: TypedEventBusLike,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactoryLike
  ) {
    super({ loggerFactory, eventBus }, 'StreamingOrchestrator');
  }

  async onInitialize(): Promise<void> {
    this.streamingRenderService.initialize();
  }

  @OnEvent(EventChannels.RENDER.CANVAS_EXPIRED)
  private _handleCanvasExpired(): Promise<void> {
    return this.streamingRenderService.handleCanvasExpired();
  }

  @OnEvent(EventChannels.UI.STREAM_START_REQUESTED)
  private _handleStreamStartRequested(): Promise<void> {
    return this.start();
  }

  @OnEvent(EventChannels.UI.STREAM_STOP_REQUESTED)
  private _handleStreamStopRequested(): Promise<void> {
    return this.stop();
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

  @OnEvent(EventChannels.PERFORMANCE.STATE_CHANGED)
  _handlePerformanceStateChanged(state: PerformanceStatePayload): void {
    this.streamingRenderService.handlePerformanceStateChanged(state);
  }

  @OnEvent(EventChannels.UI.WINDOW_RESIZED)
  _handleWindowResized(): void {
    this.streamingRenderService.handleFullscreenChange();
  }

  @OnEvent(EventChannels.SETTINGS.RENDER_PRESET_CHANGED)
  _handleRenderPresetChanged(presetId: unknown): void {
    if (typeof presetId !== 'string') {
      this.logger.warn('Ignoring invalid render preset payload', presetId);
      return;
    }

    this.streamingRenderService.handleRenderPresetChanged(presetId);
  }

  @OnEvent(EventChannels.PERFORMANCE.RENDER_MODE_CHANGED)
  async _handlePerformanceModeChanged(enabled: boolean): Promise<void> {
    await this.streamingRenderService.handlePerformanceModeChanged(enabled);
  }

  @OnEvent(EventChannels.STREAM.STARTED)
  async _handleStreamStarted(data: StreamStartedPayload): Promise<void> {
    const { stream, settings, capabilities } = data;

    this.logger.info('Stream started event received');

    this.streamViewService.attachMutedStream(stream);

    this.eventBus.publish(EventChannels.UI.STREAMING_MODE, { enabled: true });

    if (settings && settings.video) {
      this.eventBus.publish(EventChannels.UI.STREAM_INFO, { settings: settings.video });
    }

    try {
      await this.streamingRenderService.startPipeline(capabilities);

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

  @OnEvent(EventChannels.STREAM.STOPPED)
  async _handleStreamStopped(): Promise<void> {
    this.logger.info('Stream stopped event received');

    // Stop GPU recording BEFORE releasing GPU resources to avoid Skia race condition
    // Must await to ensure in-flight captures complete before GPU cleanup
    if (this.gpuRecordingService.isActive()) {
      this.logger.info('Stopping GPU recording before pipeline cleanup');
      await this.gpuRecordingService.stop();
    }

    this.streamingRenderService.stopPipeline();
    this.streamViewService.clearStream();

    this.eventBus.publish(EventChannels.UI.STREAMING_MODE, { enabled: false });

    this.eventBus.publish(EventChannels.UI.OVERLAY_MESSAGE, { deviceConnected: this.appState.deviceConnected });
  }

  @OnEvent(EventChannels.STREAM.ERROR)
  _handleStreamError(error: StreamErrorPayload): void {
    const message = getStreamErrorMessage(error);

    this.logger.error('Stream error:', error);
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: `Error: ${message}`, type: 'error' });
    this.eventBus.publish(EventChannels.UI.OVERLAY_ERROR, { message });
  }

  @OnEvent(EventChannels.DEVICE.DISCONNECTED_DURING_SESSION)
  async _handleDeviceDisconnectedDuringStream(): Promise<void> {
    if (this.appState.isStreaming) {
      this.logger.warn('Device disconnected during stream - stopping');
      await this.streamingService.stop().catch((error: unknown) => {
        this.logger.error('Error stopping stream after device disconnect:', getErrorMessage(error, 'Failed to stop stream'));
      });
    }
  }

  @OnEvent(EventChannels.DEVICE.SUPPORTED_DEVICE_AVAILABLE)
  async _handleSupportedDeviceAvailable(data: SupportedDeviceAvailablePayload): Promise<void> {
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
    await this.streamingRenderService.cleanup();

    if (this.streamingService.isActive()) {
      try {
        await this.streamingService.stop();
      } catch (error) {
        this.logger.error('Error stopping stream during cleanup:', getErrorMessage(error, 'Failed to stop stream'));
      }
    }
  }
}
