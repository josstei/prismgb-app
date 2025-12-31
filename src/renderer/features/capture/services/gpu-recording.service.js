/**
 * GPU Recording Service
 *
 * Encapsulates GPU-based recording pipeline (canvas, frame loop, scaling).
 * Keeps CaptureOrchestrator thin by owning all GPU recording state.
 */

import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';

class GpuRecordingService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['gpuRendererService', 'eventBus', 'loggerFactory'], 'GpuRecordingService');

    this._recordingCanvas = null;
    this._recordingCtx = null;
    this._recordingStream = null;
    this._recordingFrameId = null;
    this._isRecording = false;
    this._capturePending = false;
    this._recordingDroppedFrames = 0;
    this._recordingWidth = 0;
    this._recordingHeight = 0;

    // Performance: cached scale calculation to avoid per-frame recalculation
    this._cachedScaleParams = null;
    this._cachedFrameWidth = 0;
    this._cachedFrameHeight = 0;
    this._canvasCleared = false;
  }

  isActive() {
    return this._isRecording;
  }

  getRecordingStream() {
    return this._recordingStream;
  }

  captureFrame() {
    return this.gpuRendererService.captureFrame();
  }

  async start({ stream, frameRate }) {
    if (!stream) {
      this.logger.warn('Cannot start GPU recording - no stream provided');
      throw new Error('No stream provided');
    }

    if (this._isRecording) {
      this.logger.warn('GPU recording already active');
      throw new Error('GPU recording already active');
    }

    const { width: targetWidth, height: targetHeight } = this.gpuRendererService.getTargetDimensions();

    this._recordingCanvas = document.createElement('canvas');
    this._recordingCanvas.width = targetWidth;
    this._recordingCanvas.height = targetHeight;
    this._recordingWidth = targetWidth;
    this._recordingHeight = targetHeight;
    this._recordingCtx = this._recordingCanvas.getContext('2d', { alpha: false });
    this._recordingCtx.imageSmoothingEnabled = false;

    const fps = frameRate || 60;
    this._recordingStream = this._recordingCanvas.captureStream(fps);

    stream.getAudioTracks().forEach(track => {
      this._recordingStream.addTrack(track.clone());
    });

    this._isRecording = true;
    this._recordingDroppedFrames = 0;

    this.logger.info(`Starting GPU recording at ${targetWidth}x${targetHeight}`);

    this._startRecordingFrameLoop();

    return this._recordingStream;
  }

  stop() {
    this._cleanupGpuRecording();
  }

  dispose() {
    this._cleanupGpuRecording();
    this.logger.info('GpuRecordingService disposed');
  }

  _calculateRecordingScale(frameWidth, frameHeight) {
    // Performance: return cached result if frame dimensions unchanged
    if (this._cachedScaleParams &&
        this._cachedFrameWidth === frameWidth &&
        this._cachedFrameHeight === frameHeight) {
      return this._cachedScaleParams;
    }

    const canvasWidth = this._recordingWidth;
    const canvasHeight = this._recordingHeight;

    if (frameWidth <= 0 || frameHeight <= 0 || canvasWidth <= 0 || canvasHeight <= 0) {
      this.logger.warn('Invalid dimensions for recording scale calculation');
      return null;
    }

    let scaleParams;

    if (frameWidth === canvasWidth && frameHeight === canvasHeight) {
      scaleParams = {
        scale: 1,
        drawWidth: canvasWidth,
        drawHeight: canvasHeight,
        offsetX: 0,
        offsetY: 0,
        needsClearing: false
      };
    } else {
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

      scaleParams = { scale, drawWidth, drawHeight, offsetX, offsetY, needsClearing };
    }

    // Cache the result
    this._cachedFrameWidth = frameWidth;
    this._cachedFrameHeight = frameHeight;
    this._cachedScaleParams = scaleParams;

    return scaleParams;
  }

  _startRecordingFrameLoop() {
    const captureAndDraw = async () => {
      if (!this._isRecording) return;

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

          // Performance: only clear canvas once when dimensions require it
          if (needsClearing && !this._canvasCleared) {
            this._recordingCtx.fillStyle = '#000000';
            this._recordingCtx.fillRect(0, 0, this._recordingWidth, this._recordingHeight);
            this._canvasCleared = true;
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
            this.eventBus.publish(EventChannels.CAPTURE.RECORDING_DEGRADED, {
              droppedFrames: this._recordingDroppedFrames
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
    this._isRecording = false;
    this._capturePending = false;
    this._recordingDroppedFrames = 0;
    this._recordingWidth = 0;
    this._recordingHeight = 0;

    // Reset cache
    this._cachedScaleParams = null;
    this._cachedFrameWidth = 0;
    this._cachedFrameHeight = 0;
    this._canvasCleared = false;
  }
}

export { GpuRecordingService };
