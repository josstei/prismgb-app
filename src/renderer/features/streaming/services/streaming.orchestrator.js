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

import { BaseOrchestrator } from '@shared/base/orchestrator.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

export class StreamingOrchestrator extends BaseOrchestrator {
  constructor(dependencies) {
    super(
      dependencies,
      ['streamingService', 'appState', 'streamViewService', 'renderPipelineService', 'eventBus', 'loggerFactory'],
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
    this.subscribeWithCleanup({
      [EventChannels.RENDER.CANVAS_EXPIRED]: () => {
        this.renderPipelineService.handleCanvasExpired();
      }
    });

    // Initialize canvas size with default resolution
    this.renderPipelineService.initialize();
  }

  /**
   * Start streaming
   * Uses AppState.deviceConnected instead of direct orchestrator call (decoupled)
   * @param {string} deviceId - Optional device ID
   */
  async start(deviceId = null) {
    if (!this.appState.deviceConnected) {
      this.logger.warn('Cannot start stream - device not connected');
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Please connect your device first', type: 'warning' });
      return;
    }

    try {
      await this.streamingService.start(deviceId);
    } catch (error) {
      this.logger.error('Failed to start stream:', error);
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: `Error: ${error.message}`, type: 'error' });
      this.eventBus.publish(EventChannels.UI.OVERLAY_ERROR, { message: error.message });
    }
  }

  /**
   * Stop streaming
   * @returns {Promise<void>} Resolves when stream is stopped
   */
  stop() {
    return this.streamingService.stop();
  }

  /**
   * Get current stream
   */
  getStream() {
    return this.streamingService.getStream();
  }

  /**
   * Check if streaming is active
   */
  isActive() {
    return this.streamingService.isActive();
  }

  /**
   * Wire stream events from StreamingService
   * @private
   */
  _wireStreamEvents() {
    this.subscribeWithCleanup({
      [EventChannels.STREAM.STARTED]: (data) => this._handleStreamStarted(data),
      [EventChannels.STREAM.STOPPED]: () => this._handleStreamStopped(),
      [EventChannels.STREAM.ERROR]: (error) => this._handleStreamError(error),
      [EventChannels.SETTINGS.RENDER_PRESET_CHANGED]: (presetId) => this._handleRenderPresetChanged(presetId),
      [EventChannels.PERFORMANCE.RENDER_MODE_CHANGED]: (enabled) => this._handlePerformanceModeChanged(enabled),
      [EventChannels.PERFORMANCE.STATE_CHANGED]: (state) => this._handlePerformanceStateChanged(state)
    });
  }

  _handlePerformanceStateChanged(state) {
    this.renderPipelineService.handlePerformanceStateChanged(state);
  }

  /**
   * Handle render preset change event
   * @param {string} presetId - New preset ID
   * @private
   */
  _handleRenderPresetChanged(presetId) {
    this.renderPipelineService.handleRenderPresetChanged(presetId);
  }

  /**
   * Handle performance mode toggle
   * When enabled: terminates GPU worker and uses Canvas2D for minimal resource usage
   * When disabled: allows GPU rendering on next stream start
   * @param {boolean} enabled - Whether performance mode is enabled
   * @private
   */
  _handlePerformanceModeChanged(enabled) {
    this.renderPipelineService.handlePerformanceModeChanged(enabled);
  }

  /**
   * Wire device events
   * @private
   */
  _wireDeviceEvents() {
    this.subscribeWithCleanup({
      [EventChannels.DEVICE.DISCONNECTED_DURING_SESSION]: () => this._handleDeviceDisconnectedDuringStream()
    });
  }

  /**
   * Handle stream started event
   * @private
   */
  async _handleStreamStarted(data) {
    const { stream, settings, capabilities } = data;

    this.logger.info('Stream started event received');

    // Note: App state automatically derives isStreaming from StreamingService
    // No need to manually update appState.setStreaming() anymore

    this.streamViewService.attachStream(stream);

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
    } catch (error) {
      this.logger.error('Stream unhealthy:', error.message);

      // Show user-friendly message
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
        message: 'Device not sending video. Is it powered on?',
        type: 'warning'
      });
      this.eventBus.publish(EventChannels.UI.OVERLAY_ERROR, {
        message: 'Device not sending video. Please ensure the device is powered on.'
      });

      // Stop the unhealthy stream
      this.streamingService.stop();
    }
  }

  /**
   * Handle stream stopped event
   * @private
   */
  _handleStreamStopped() {
    this.logger.info('Stream stopped event received');

    // Get video element reference (requires direct element access)
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
  _handleStreamError(error) {
    this.logger.error('Stream error:', error);
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: `Error: ${error.message}`, type: 'error' });
    this.eventBus.publish(EventChannels.UI.OVERLAY_ERROR, { message: error.message });
  }

  /**
   * Handle device disconnected during active stream
   * @private
   */
  _handleDeviceDisconnectedDuringStream() {
    if (this.appState.isStreaming) {
      this.logger.warn('Device disconnected during stream - stopping');
      this.streamingService.stop();
    }
  }

  /**
   * Cleanup resources
   * Note: EventBus subscriptions are automatically cleaned up by BaseOrchestrator
   */
  async onCleanup() {
    this.renderPipelineService.cleanup();

    if (this.streamingService.isActive()) {
      this.streamingService.stop();
    }
  }
}
