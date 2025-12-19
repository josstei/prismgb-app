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

    this._recordingCanvas = null;
    this._recordingCtx = null;
    this._recordingStream = null;
    this._recordingFrameId = null;
    this._isGpuRecording = false;
    this._capturePending = false;
    this._recordingDroppedFrames = 0;
    this._recordingWidth = 0;
    this._recordingHeight = 0;
  }

  /**
   * Initialize capture orchestrator
   */
  async onInitialize() {
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
    this._recordingDroppedFrames = 0;

    const { width: targetWidth, height: targetHeight } = this.gpuRendererService.getTargetDimensions();

    this._recordingCanvas = document.createElement('canvas');
    this._recordingCanvas.width = targetWidth;
    this._recordingCanvas.height = targetHeight;
    this._recordingWidth = targetWidth;
    this._recordingHeight = targetHeight;
    this._recordingCtx = this._recordingCanvas.getContext('2d', { alpha: false });
    this._recordingCtx.imageSmoothingEnabled = false;

    const frameRate = this.appState.currentCapabilities?.frameRate || 60;
    this._recordingStream = this._recordingCanvas.captureStream(frameRate);

    const originalStream = this.appState.currentStream;
    if (originalStream) {
      originalStream.getAudioTracks().forEach(track => {
        this._recordingStream.addTrack(track.clone());
      });
    }

    this._isGpuRecording = true;

    this.logger.info(`Starting GPU recording at ${targetWidth}x${targetHeight}`);

    await this.captureService.startRecording(this._recordingStream);
    this._startRecordingFrameLoop();
  }

  /**
   * Calculate scaling parameters to fit a captured frame into the recording canvas.
   * Uses integer scaling for upscaling (pixel-perfect) and fractional for downscaling.
   *
   * @param {number} frameWidth - Width of captured frame (must be > 0)
   * @param {number} frameHeight - Height of captured frame (must be > 0)
   * @returns {Object|null} Scaling parameters, or null if any dimension is <= 0
   * @returns {number} return.scale - Scale factor applied (integer for upscale, fractional for downscale)
   * @returns {number} return.drawWidth - Width to draw the frame at
   * @returns {number} return.drawHeight - Height to draw the frame at
   * @returns {number} return.offsetX - X offset for centering (letterbox)
   * @returns {number} return.offsetY - Y offset for centering (pillarbox)
   * @returns {boolean} return.needsClearing - Whether canvas needs black fill before drawing
   * @private
   */
  _calculateRecordingScale(frameWidth, frameHeight) {
    const canvasWidth = this._recordingWidth;
    const canvasHeight = this._recordingHeight;

    if (frameWidth <= 0 || frameHeight <= 0 || canvasWidth <= 0 || canvasHeight <= 0) {
      this.logger.warn('Invalid dimensions for recording scale calculation');
      return null;
    }

    if (frameWidth === canvasWidth && frameHeight === canvasHeight) {
      return {
        scale: 1,
        drawWidth: canvasWidth,
        drawHeight: canvasHeight,
        offsetX: 0,
        offsetY: 0,
        needsClearing: false
      };
    }

    const scaleX = canvasWidth / frameWidth;
    const scaleY = canvasHeight / frameHeight;
    const minScale = Math.min(scaleX, scaleY);

    const scale = minScale >= 1
      ? Math.floor(minScale)
      : minScale;

    const drawWidth = Math.round(frameWidth * scale);
    const drawHeight = Math.round(frameHeight * scale);
    const offsetX = Math.round((canvasWidth - drawWidth) / 2);
    const offsetY = Math.round((canvasHeight - drawHeight) / 2);
    const needsClearing = offsetX > 0 || offsetY > 0;

    return { scale, drawWidth, drawHeight, offsetX, offsetY, needsClearing };
  }

  /**
   * Frame loop that captures GPU frames and draws to recording canvas
   * @private
   */
  _startRecordingFrameLoop() {
    const captureAndDraw = async () => {
      if (!this._isGpuRecording) return;

      if (!this._capturePending) {
        this._capturePending = true;
        let frame = null;
        try {
          frame = await this.gpuRendererService.captureFrame();

          const scaleParams = this._calculateRecordingScale(frame.width, frame.height);
          if (!scaleParams) {
            throw new Error('Invalid frame dimensions');
          }

          const { drawWidth, drawHeight, offsetX, offsetY, needsClearing } = scaleParams;

          if (needsClearing) {
            this._recordingCtx.fillStyle = '#000000';
            this._recordingCtx.fillRect(0, 0, this._recordingWidth, this._recordingHeight);
          }

          this._recordingCtx.drawImage(
            frame,
            0, 0, frame.width, frame.height,
            offsetX, offsetY, drawWidth, drawHeight
          );
        } catch (e) {
          this.logger.debug('Frame capture skipped:', e.message);
          this._recordingDroppedFrames++;
          if (this._recordingDroppedFrames >= 30) {
            this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
              message: 'Recording quality may be degraded - frames being dropped',
              type: 'warning'
            });
            this._recordingDroppedFrames = 0;
          }
        } finally {
          frame?.close();
          this._capturePending = false;
        }
      }

      this._recordingFrameId = requestAnimationFrame(captureAndDraw);
    };

    this._recordingFrameId = requestAnimationFrame(captureAndDraw);
  }

  /**
   * Stop recording and clean up GPU recording resources
   * @private
   */
  async _stopRecording() {
    this._cleanupGpuRecording();

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
  _cleanupGpuRecording() {
    if (this._recordingFrameId) {
      cancelAnimationFrame(this._recordingFrameId);
      this._recordingFrameId = null;
    }

    if (this._recordingStream) {
      this._recordingStream.getTracks().forEach(track => track.stop());
      this._recordingStream = null;
    }

    this._recordingCanvas = null;
    this._recordingCtx = null;
    this._isGpuRecording = false;
    this._capturePending = false;
    this._recordingDroppedFrames = 0;
    this._recordingWidth = 0;
    this._recordingHeight = 0;
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
      [EventChannels.CAPTURE.RECORDING_READY]: (data) => this._handleRecordingReady(data),
      [EventChannels.CAPTURE.RECORDING_ERROR]: (data) => this._handleRecordingError(data)
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
   * Handle recording error event
   * @private
   */
  _handleRecordingError(data) {
    const { error } = data;
    this.logger.error('Recording error:', error);

    this._cleanupGpuRecording();
    this.eventBus.publish(EventChannels.UI.RECORDING_STATE, { active: false });
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
      message: `Recording failed: ${error}`,
      type: 'error'
    });
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
    this._cleanupGpuRecording();
  }
}
