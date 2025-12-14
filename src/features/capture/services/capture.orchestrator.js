/**
 * Capture Orchestrator
 *
 * Coordinates screenshot and video recording operations
 * Thin coordinator - delegates to CaptureService, does not contain business logic
 *
 * Responsibilities:
 * - Coordinate screenshot capture
 * - Coordinate recording start/stop
 * - Handle capture events
 * - Manage file saving
 */

import { BaseOrchestrator } from '@shared/base/orchestrator.js';
import { TIMING } from '@shared/config/constants.js';
import { downloadFile } from '@shared/lib/file-download.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

export class CaptureOrchestrator extends BaseOrchestrator {
  constructor(dependencies) {
    super(
      dependencies,
      ['captureService', 'appState', 'uiController', 'gpuRendererService', 'canvasRenderer', 'eventBus', 'loggerFactory'],
      'CaptureOrchestrator'
    );

    this.gpuRendererService = dependencies.gpuRendererService;
    this.canvasRenderer = dependencies.canvasRenderer;
  }

  /**
   * Initialize capture orchestrator
   */
  async onInitialize() {
    // Wire capture events
    this._wireCaptureEvents();
  }

  /**
   * Take screenshot
   * Uses AppState.isStreaming instead of direct orchestrator call (decoupled)
   * Captures from the appropriate source based on rendering mode:
   * - GPU rendering: captures from GPU worker (includes shader effects)
   * - Canvas2D rendering: captures from streamCanvas (includes effects)
   * - No rendering pipeline: captures from streamVideo (raw)
   */
  async takeScreenshot() {
    if (!this.appState.isStreaming) {
      this.logger.warn('Cannot take screenshot - not streaming');
      return;
    }

    // Trigger immediate visual feedback via events
    this.eventBus.publish(EventChannels.UI.SHUTTER_FLASH);
    this.eventBus.publish(EventChannels.UI.BUTTON_FEEDBACK, {
      elementKey: 'screenshotBtn',
      className: 'capturing',
      duration: TIMING.BUTTON_FEEDBACK_MS
    });

    try {
      // Determine capture source based on active rendering mode
      let source;

      if (this.gpuRendererService.isActive()) {
        // GPU rendering active - capture from worker (includes shader effects)
        this.logger.debug('Capturing screenshot from GPU renderer');
        source = await this.gpuRendererService.captureFrame();
      } else if (this.canvasRenderer.isActive()) {
        // Canvas2D rendering active - capture from canvas (includes effects)
        this.logger.debug('Capturing screenshot from Canvas2D renderer');
        source = this.uiController.elements.streamCanvas;
      } else {
        // No rendering pipeline - capture from video element (raw)
        this.logger.debug('Capturing screenshot from video element (no rendering pipeline)');
        source = this.uiController.elements.streamVideo;
      }

      await this.captureService.takeScreenshot(source);
    } catch (error) {
      this.logger.error('Failed to take screenshot:', error);
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Error taking screenshot', type: 'error' });
    }
  }

  /**
   * Toggle recording (start/stop)
   * Uses AppState.currentStream instead of direct orchestrator call (decoupled)
   */
  async toggleRecording() {
    // When stopping, stream is not needed (captureService handles this internally)
    // When starting, validate stream exists to prevent cryptic errors downstream
    const isCurrentlyRecording = this.captureService.isRecording || this.captureService.getRecordingState?.();
    const stream = this.appState.currentStream;

    if (!isCurrentlyRecording && !stream) {
      this.logger.warn('Cannot start recording - no active stream');
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Cannot record - not streaming', type: 'error' });
      return;
    }

    try {
      await this.captureService.toggleRecording(stream);
    } catch (error) {
      this.logger.error('Failed to toggle recording:', error);
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Error with recording', type: 'error' });
    }
  }

  /**
   * Wire capture events from CaptureService
   * @private
   */
  _wireCaptureEvents() {
    this.subscribeWithCleanup({
      [EventChannels.CAPTURE.SCREENSHOT_READY]: (data) => this._handleScreenshotReady(data),
      [EventChannels.CAPTURE.RECORDING_STARTED]: () => this._handleRecordingStarted(),
      [EventChannels.CAPTURE.RECORDING_STOPPED]: () => this._handleRecordingStopped(),
      [EventChannels.CAPTURE.RECORDING_READY]: (data) => this._handleRecordingReady(data)
    });
  }

  /**
   * Handle screenshot ready event
   * @private
   */
  _handleScreenshotReady(data) {
    const { blob, filename } = data;

    // Auto-save screenshot
    downloadFile(blob, filename);

    // Update UI via event
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Screenshot saved!' });
  }

  /**
   * Handle recording started event
   * @private
   */
  _handleRecordingStarted() {
    // Trigger immediate visual feedback for recording start via events
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_POP);
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Recording started' });
    this.eventBus.publish(EventChannels.UI.RECORDING_STATE, { active: true });
  }

  /**
   * Handle recording stopped event
   * @private
   */
  _handleRecordingStopped() {
    // Trigger immediate visual feedback for recording stop via events
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_PRESS);
    this.eventBus.publish(EventChannels.UI.RECORDING_STATE, { active: false });
  }

  /**
   * Handle recording ready event
   * @private
   */
  _handleRecordingReady(data) {
    const { blob, filename } = data;

    // Auto-save recording
    downloadFile(blob, filename);

    // Update UI via event
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Recording saved!' });
  }

  /**
   * Cleanup resources
   * Note: EventBus subscriptions are automatically cleaned up by BaseOrchestrator
   */
  async onCleanup() {
    // Stop recording if active
    if (this.captureService.getRecordingState()) {
      try {
        await this.captureService.stopRecording();
      } catch (error) {
        this.logger.error('Error stopping recording during cleanup:', error);
      }
    }
  }
}
