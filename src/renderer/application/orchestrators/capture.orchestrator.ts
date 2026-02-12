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

import { BaseOrchestrator } from '@prismgb/core';
import { EventChannels } from '@renderer/application/config/event-channels';

export class CaptureOrchestrator extends BaseOrchestrator {
  static readonly dependencies = [
    'captureService',
    'appState',
    'streamViewService',
    'gpuRendererService',
    'gpuRecordingService',
    'canvasRenderer',
    'transcodeService',
    'captureSaveService',
    'eventBus',
    'loggerFactory'
  ] as const;

  constructor(dependencies) {
    super(
      dependencies,
      [...CaptureOrchestrator.dependencies],
      'CaptureOrchestrator'
    );

    this._recordingInterrupted = false;
  }

  /**
   * Initialize capture orchestrator
   */
  async onInitialize() {
    this.subscribeWithCleanup({
      [EventChannels.CAPTURE.RECORDING_ERROR]: (data) => this._handleRecordingError(data),
      [EventChannels.CAPTURE.RECORDING_READY]: (data) => this._handleRecordingReady(data),
      // Stop recording when stream stops to prevent orphaned recording loop
      [EventChannels.STREAM.STOPPED]: () => this._handleStreamStopped(),
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
      return this.streamViewService.getCanvas();
    }

    this.logger.debug('Capturing screenshot from video element (no rendering pipeline)');
    return this.streamViewService.getVideo();
  }

  /**
   * Toggle recording (start/stop)
   * When GPU renderer active, captures rendered frames with shader effects.
   * Otherwise falls back to raw device stream.
   * Blocks new recording if transcoding is in progress.
   */
  async toggleRecording() {
    const isCurrentlyRecording = this.captureService.isRecording || this.captureService.getRecordingState?.();

    if (isCurrentlyRecording) {
      await this._stopRecording();
      return;
    }

    // Block recording if transcoding is in progress
    if (this.transcodeService?.isTranscoding?.()) {
      this.logger.warn('Cannot start recording - transcoding in progress');
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
        message: 'Cannot record while converting video',
        type: 'warning'
      });
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
      this._recordingInterrupted = false;
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
    await this.gpuRecordingService.stop();

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
   * Handle stream stopped - stop any active recording
   * Prevents orphaned GPU recording loop when stream stops
   * @private
   */
  async _handleStreamStopped() {
    const isRecording = this.captureService.isRecording || this.captureService.getRecordingState?.();
    if (isRecording) {
      this.logger.info('Stream stopped - stopping active recording');
      this._recordingInterrupted = true;
      await this._stopRecording();
    }
  }

  /**
   * Handle recording error event
   * @private
   */
  async _handleRecordingError(data) {
    const { error } = data;
    this.logger.error('Recording error:', error);

    await this.gpuRecordingService.stop();
    this._recordingInterrupted = false;
  }

  /**
   * Handle recording ready - save the recording via captureSaveService
   * @param {Object} data - Recording data { blob, filename }
   * @private
   */
  async _handleRecordingReady(data) {
    const { blob, filename } = data;

    try {
      const result = await this.captureSaveService.saveRecording(blob, filename, {
        interrupted: this._recordingInterrupted
      });
      this._recordingInterrupted = false;

      // Only show status message for direct saves (webm)
      // Transcoded saves show their own status messages
      if (result.success && !result.transcoded) {
        this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Recording saved!' });
      }
    } catch (error) {
      this.logger.error('Failed to save recording:', error);
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
        message: 'Failed to save recording. Please try again.',
        type: 'error'
      });
    }
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
    await this.gpuRecordingService.stop();
  }
}
