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
import { EventChannels } from '@renderer/infrastructure/events/event-channels.js';

export class CaptureOrchestrator extends BaseOrchestrator {
  constructor(dependencies) {
    super(
      dependencies,
      [
        'captureService',
        'appState',
        'uiController',
        'gpuRendererService',
        'gpuRecordingService',
        'canvasRenderer',
        'eventBus',
        'loggerFactory'
      ],
      'CaptureOrchestrator'
    );
  }

  /**
   * Initialize capture orchestrator
   */
  async onInitialize() {
    this.subscribeWithCleanup({
      [EventChannels.CAPTURE.RECORDING_ERROR]: (data) => this._handleRecordingError(data),
      // UI command events - decoupled from UISetupOrchestrator
      [EventChannels.UI.SCREENSHOT_REQUESTED]: () => this.takeScreenshot(),
      [EventChannels.UI.RECORDING_TOGGLE_REQUESTED]: () => this.toggleRecording()
    });
  }

  /**
   * Take screenshot
   * Uses AppState.isStreaming instead of direct orchestrator call (decoupled)
   */
  async takeScreenshot() {
    if (!this.appState.isStreaming) {
      this.logger.warn('Cannot take screenshot - not streaming');
      return;
    }

    // Trigger immediate visual feedback via events
    this.eventBus.publish(EventChannels.UI.SHUTTER_FLASH);
    this.eventBus.publish(EventChannels.CAPTURE.SCREENSHOT_TRIGGERED);

    try {
      const source = await this._getCaptureSource();
      await this.captureService.takeScreenshot(source);
    } catch (error) {
      this.logger.error('Failed to take screenshot:', error);
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Error taking screenshot', type: 'error' });
    }
  }

  /**
   * Determine capture source based on active rendering mode
   * - GPU rendering: captures from GPU worker (includes shader effects)
   * - Canvas2D rendering: captures from streamCanvas (includes effects)
   * - No rendering pipeline: captures from streamVideo (raw)
   * @returns {Promise<HTMLCanvasElement|HTMLVideoElement|ImageBitmap>}
   * @private
   */
  async _getCaptureSource() {
    if (this.gpuRendererService.isActive()) {
      this.logger.debug('Capturing screenshot from GPU renderer');
      return this.gpuRendererService.captureFrame();
    }

    if (this.canvasRenderer.isActive()) {
      this.logger.debug('Capturing screenshot from Canvas2D renderer');
      return this.uiController.elements.streamCanvas;
    }

    this.logger.debug('Capturing screenshot from video element (no rendering pipeline)');
    return this.uiController.elements.streamVideo;
  }

  /**
   * Toggle recording (start/stop)
   * When GPU renderer active, captures rendered frames with shader effects.
   * Otherwise falls back to raw device stream.
   */
  async toggleRecording() {
    const isCurrentlyRecording = this.captureService.isRecording || this.captureService.getRecordingState?.();

    if (isCurrentlyRecording) {
      await this._stopRecording();
      return;
    }

    const stream = this.appState.currentStream;
    if (!stream) {
      this.logger.warn('Cannot start recording - no active stream');
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Cannot record - not streaming', type: 'error' });
      return;
    }

    try {
      if (this.gpuRendererService.isActive()) {
        await this._startGpuRecording();
      } else {
        await this.captureService.startRecording(stream);
      }
    } catch (error) {
      this.logger.error('Failed to start recording:', error);
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Error with recording', type: 'error' });
    }
  }

  /**
   * Start recording from GPU-rendered canvas with shader effects
   * @private
   */
  async _startGpuRecording() {
    const frameRate = this.appState.currentCapabilities?.frameRate || 60;
    const recordingStream = await this.gpuRecordingService.start({
      stream: this.appState.currentStream,
      frameRate
    });

    await this.captureService.startRecording(recordingStream);
  }

  /**
   * Stop recording and clean up GPU recording resources
   * @private
   */
  async _stopRecording() {
    this.gpuRecordingService.stop();

    try {
      await this.captureService.stopRecording();
    } catch (error) {
      this.logger.error('Failed to stop recording:', error);
    }
  }

  /**
   * Clean up GPU recording resources
   * @private
   */

  /**
   * Handle recording error event
   * @private
   */
  _handleRecordingError(data) {
    const { error } = data;
    this.logger.error('Recording error:', error);

    this.gpuRecordingService.stop();
  }

  /**
   * Cleanup resources
   */
  async onCleanup() {
    if (this.captureService.getRecordingState()) {
      try {
        await this.captureService.stopRecording();
      } catch (error) {
        this.logger.error('Error stopping recording during cleanup:', error);
      }
    }
    this.gpuRecordingService.stop();
  }
}
