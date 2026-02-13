/**
 * Streaming Orchestrator
 *
 * Coordinates media stream lifecycle and rendering
 * Thin coordinator - delegates to StreamingService and specialized managers
 *
 * Responsibilities:
 * - Coordinate stream start/stop
 * - Delegate render pipeline work (GPU/Canvas2D switching, health checks)
 * - Handle stream events
 * - Coordinate device selection changes
 *
 * Performance optimizations:
 * - Delegated to RenderPipelineService: RAF/RVFC, canvas sizing, renderer switching
 * - Visibility pause/resume driven by performance state signals
 */

import { BaseOrchestrator } from '@prismgb/core';
import { EventChannels } from '@renderer/common/config/event-channels';

type StreamStartedPayload = {
  stream: MediaStream;
  settings?: { video?: unknown };
  capabilities?: unknown;
};

type SupportedDevicePayload = {
  deviceId: string;
  label?: string;
};

type StreamingServiceLike = {
  start(deviceId?: string | null): Promise<void>;
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
  handleCanvasExpired(): void;
  handlePerformanceStateChanged(state: unknown): void;
  handleFullscreenChange(): void;
  handleRenderPresetChanged(presetId: string): void;
  handlePerformanceModeChanged(enabled: boolean): void;
  startPipeline(capabilities: unknown): Promise<void>;
  stopPipeline(): void;
  cleanup(): void;
};

type GpuRecordingServiceLike = {
  isActive(): boolean;
  stop(): Promise<void>;
};

type SettingsServiceLike = {
  getAutoStreamOnConnect(): boolean;
};

type EventBusLike = {
  publish(channel: string, payload?: unknown): void;
};

type StreamingOrchestratorDependencies = {
  streamingService: StreamingServiceLike;
  appState: AppStateLike;
  streamViewService: StreamViewServiceLike;
  renderPipelineService: RenderPipelineServiceLike;
  gpuRecordingService: GpuRecordingServiceLike;
  settingsService: SettingsServiceLike;
  eventBus: EventBusLike;
  loggerFactory: { create(name: string): unknown };
};

export class StreamingOrchestrator extends BaseOrchestrator {
  static readonly dependencies = [
    'streamingService',
    'appState',
    'streamViewService',
    'renderPipelineService',
    'gpuRecordingService',
    'settingsService',
    'eventBus',
    'loggerFactory'
  ] as const;

  declare streamingService: StreamingServiceLike;
  declare appState: AppStateLike;
  declare streamViewService: StreamViewServiceLike;
  declare renderPipelineService: RenderPipelineServiceLike;
  declare gpuRecordingService: GpuRecordingServiceLike;
  declare settingsService: SettingsServiceLike;
  declare eventBus: EventBusLike;

  constructor(dependencies: StreamingOrchestratorDependencies) {
    super(
      dependencies,
      [...StreamingOrchestrator.dependencies],
      'StreamingOrchestrator'
    );
  }

  /**
   * Initialize streaming orchestrator
   */
  async onInitialize() {
    // Wire service events
    this._wireStreamEvents();
    this._wireDeviceEvents();

    // Subscribe to canvas expiration (GPU worker terminated)
    // and UI command events (decoupled from UISetupOrchestrator)
    this.subscribeWithCleanup({
      [EventChannels.RENDER.CANVAS_EXPIRED]: () => {
        this.renderPipelineService.handleCanvasExpired();
      },
      // UI command events - decoupled from UISetupOrchestrator
      [EventChannels.UI.STREAM_START_REQUESTED]: () => this.start(),
      [EventChannels.UI.STREAM_STOP_REQUESTED]: () => this.stop()
    });

    // Initialize canvas size with default resolution
    this.renderPipelineService.initialize();
  }

  /**
   * Start streaming
   * Uses AppState.deviceConnected instead of direct orchestrator call (decoupled)
   * @param {string} deviceId - Optional device ID
   */
  async start(deviceId: string | null = null): Promise<void> {
    if (!this.appState.deviceConnected) {
      this.logger.warn('Cannot start stream - device not connected');
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Please connect your device first', type: 'warning' });
      return;
    }

    try {
      await this.streamingService.start(deviceId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to start stream:', error);
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: `Error: ${message}`, type: 'error' });
      this.eventBus.publish(EventChannels.UI.OVERLAY_ERROR, { message });
    }
  }

  /**
   * Stop streaming
   * @returns {Promise<void>} Resolves when stream is stopped
   */
  async stop(): Promise<void> {
    try {
      await this.streamingService.stop();
    } catch (error: unknown) {
      this.logger.error('Error stopping stream:', error);
      // Re-throw to allow caller to handle if needed
      throw error;
    }
  }

  /**
   * Get current stream
   */
  getStream(): MediaStream | null {
    return this.streamingService.getStream();
  }

  /**
   * Check if streaming is active
   */
  isActive(): boolean {
    return this.streamingService.isActive();
  }

  /**
   * Wire stream events from StreamingService
   * @private
   */
  _wireStreamEvents(): void {
    this.subscribeWithCleanup({
      [EventChannels.STREAM.STARTED]: (data) => this._handleStreamStarted(data as StreamStartedPayload),
      [EventChannels.STREAM.STOPPED]: () => this._handleStreamStopped(),
      [EventChannels.STREAM.ERROR]: (error) => this._handleStreamError(error),
      [EventChannels.SETTINGS.RENDER_PRESET_CHANGED]: (presetId) => this._handleRenderPresetChanged(String(presetId)),
      [EventChannels.PERFORMANCE.RENDER_MODE_CHANGED]: (enabled) => this._handlePerformanceModeChanged(Boolean(enabled)),
      [EventChannels.PERFORMANCE.STATE_CHANGED]: (state) => this._handlePerformanceStateChanged(state),
      [EventChannels.UI.WINDOW_RESIZED]: () => this._handleWindowResized()
    });
  }

  _handlePerformanceStateChanged(state: unknown): void {
    this.renderPipelineService.handlePerformanceStateChanged(state);
  }

  /**
   * Handle window resized event from Electron.
   * Fires after window has finished resizing (not during animation).
   * Triggers immediate canvas resize with accurate dimensions.
   * @private
   */
  _handleWindowResized(): void {
    this.renderPipelineService.handleFullscreenChange();
  }

  /**
   * Handle render preset change event
   * @param {string} presetId - New preset ID
   * @private
   */
  _handleRenderPresetChanged(presetId: string): void {
    this.renderPipelineService.handleRenderPresetChanged(presetId);
  }

  /**
   * Handle performance mode toggle
   * When enabled: terminates GPU worker and uses Canvas2D for minimal resource usage
   * When disabled: allows GPU rendering on next stream start
   * @param {boolean} enabled - Whether performance mode is enabled
   * @private
   */
  _handlePerformanceModeChanged(enabled: boolean): void {
    this.renderPipelineService.handlePerformanceModeChanged(enabled);
  }

  /**
   * Wire device events
   * @private
   */
  _wireDeviceEvents(): void {
    this.subscribeWithCleanup({
      [EventChannels.DEVICE.DISCONNECTED_DURING_SESSION]: () => this._handleDeviceDisconnectedDuringStream(),
      [EventChannels.DEVICE.SUPPORTED_DEVICE_AVAILABLE]: (data) => this._handleSupportedDeviceAvailable(data as SupportedDevicePayload)
    });
  }

  /**
   * Handle stream started event
   * @private
   */
  async _handleStreamStarted(data: StreamStartedPayload): Promise<void> {
    const { stream, settings, capabilities } = data;

    this.logger.info('Stream started event received');

    // Note: App state automatically derives isStreaming from StreamingService
    // No need to manually update appState.setStreaming() anymore

    this.streamViewService.attachMutedStream(stream);

    // Update UI for streaming mode via event
    this.eventBus.publish(EventChannels.UI.STREAMING_MODE, { enabled: true });

    // Display stream info via event
    if (settings && settings.video) {
      this.eventBus.publish(EventChannels.UI.STREAM_INFO, { settings: settings.video });
    }

    // Verify actual frame delivery (detects powered-off devices)
    try {
      await this.renderPipelineService.startPipeline(capabilities);

      // Update status via event
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Streaming from camera' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Stream unhealthy:', message);

      // Show user-friendly message
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
        message: 'Device not sending video. Is it powered on?',
        type: 'warning'
      });
      this.eventBus.publish(EventChannels.UI.OVERLAY_ERROR, {
        message: 'Device not sending video. Please ensure the device is powered on.'
      });

      // Stop the unhealthy stream
      await this.streamingService.stop().catch((stopError: unknown) => {
        this.logger.error('Error stopping unhealthy stream:', stopError);
      });
    }
  }

  /**
   * Handle stream stopped event
   * @private
   */
  async _handleStreamStopped(): Promise<void> {
    this.logger.info('Stream stopped event received');

    // Stop GPU recording BEFORE releasing GPU resources to avoid Skia race condition
    // Must await to ensure in-flight captures complete before GPU cleanup
    if (this.gpuRecordingService.isActive()) {
      this.logger.info('Stopping GPU recording before pipeline cleanup');
      await this.gpuRecordingService.stop();
    }

    // Stop rendering (GPU or Canvas2D)
    this.renderPipelineService.stopPipeline();
    this.streamViewService.clearStream();

    // Note: App state automatically derives isStreaming from StreamingService
    // No need to manually update appState.setStreaming() anymore

    // Update UI via events
    this.eventBus.publish(EventChannels.UI.STREAMING_MODE, { enabled: false });

    // Update overlay message based on device connection state via event
    // Uses AppState.deviceConnected instead of direct orchestrator call (decoupled)
    this.eventBus.publish(EventChannels.UI.OVERLAY_MESSAGE, { deviceConnected: this.appState.deviceConnected });
  }

  /**
   * Handle stream error event
   * @private
   */
  _handleStreamError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error('Stream error:', error);
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: `Error: ${message}`, type: 'error' });
    this.eventBus.publish(EventChannels.UI.OVERLAY_ERROR, { message });
  }

  /**
   * Handle device disconnected during active stream
   * @private
   */
  async _handleDeviceDisconnectedDuringStream(): Promise<void> {
    if (this.appState.isStreaming) {
      this.logger.warn('Device disconnected during stream - stopping');
      await this.streamingService.stop().catch((error: unknown) => {
        this.logger.error('Error stopping stream after device disconnect:', error);
      });
    }
  }

  /**
   * Handle supported device available event for auto-stream on connect
   * Triggered when browser enumeration detects a new supported device
   * Bypasses appState.deviceConnected check since browser enumeration confirmed device exists
   * @param {Object} data - Device data with deviceId and label
   * @private
   */
  async _handleSupportedDeviceAvailable(data: SupportedDevicePayload): Promise<void> {
    if (this.settingsService.getAutoStreamOnConnect() && !this.streamingService.isActive()) {
      this.logger.info(`Auto-starting stream - device available: ${data.label}`);
      try {
        await this.streamingService.start(data.deviceId);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error('Failed to auto-start stream:', error);
        this.eventBus.publish(EventChannels.UI.OVERLAY_ERROR, { message });
      }
    }
  }

  /**
   * Cleanup resources
   * Note: EventBus subscriptions are automatically cleaned up by BaseOrchestrator
   */
  async onCleanup(): Promise<void> {
    this.renderPipelineService.cleanup();

    if (this.streamingService.isActive()) {
      try {
        await this.streamingService.stop();
      } catch (error: unknown) {
        this.logger.error('Error stopping stream during cleanup:', error);
      }
    }
  }
}
