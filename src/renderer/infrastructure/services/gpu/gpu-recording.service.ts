/**
 * GPU Recording Service
 *
 * Encapsulates GPU-based recording pipeline (canvas, frame loop, scaling).
 * Keeps CaptureOrchestrator thin by owning all GPU recording state.
 */

import { injectable, inject } from 'inversify';
import { BaseService, raceWithTimeout } from '@platform/core';
import type { LoggerFactoryLike, TimedRaceOutcome } from '@platform/core';
import { EventChannels } from '@platform/events';
import type { TypedEventBusLike } from '@platform/events';
import { getErrorMessage } from '@platform/core';
import type {
  GpuRecordingStartOptions,
  GpuRendererServiceLike,
  RecordingScaleParams
} from '@renderer/infrastructure/services/streaming/streaming.contract.js';
import { TOKENS } from '@renderer/application/di/tokens.js';

const RECORDING_FRAME_LIFECYCLE = Symbol('gpuRecordingFrame');

@injectable()
class CaptureGpuRecordingService extends BaseService {
  private _recordingCanvas: HTMLCanvasElement | null;
  private _recordingCtx: CanvasRenderingContext2D | null;
  private _recordingStream: MediaStream | null;
  private _isRecording: boolean;
  private _isCapturePending: boolean;
  private _recordingDroppedFrames: number;
  private _recordingWidth: number;
  private _recordingHeight: number;
  private _cachedScaleParams: RecordingScaleParams | null;
  private _cachedFrameWidth: number;
  private _cachedFrameHeight: number;
  private _isCanvasCleared: boolean;
  private _isDraining: boolean;
  private _lastCapturePromise: Promise<ImageBitmap> | null;

  constructor(
    @inject(TOKENS.streamingRenderService) private readonly gpuRendererService: GpuRendererServiceLike,
    @inject(TOKENS.eventBus) private readonly eventBus: TypedEventBusLike,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactoryLike
  ) {
    super({ loggerFactory, eventBus }, 'CaptureGpuRecordingService');

    this._recordingCanvas = null;
    this._recordingCtx = null;
    this._recordingStream = null;
    this._isRecording = false;
    this._isCapturePending = false;
    this._recordingDroppedFrames = 0;
    this._recordingWidth = 0;
    this._recordingHeight = 0;

    // Performance: cached scale calculation to avoid per-frame recalculation
    this._cachedScaleParams = null;
    this._cachedFrameWidth = 0;
    this._cachedFrameHeight = 0;
    this._isCanvasCleared = false;

    // Draining state: track in-flight capture to await before cleanup
    this._isDraining = false;
    this._lastCapturePromise = null;
  }

  isActive(): boolean {
    return this._isRecording;
  }

  getRecordingStream(): MediaStream | null {
    return this._recordingStream;
  }

  captureFrame(): Promise<ImageBitmap> {
    return this.gpuRendererService.captureFrame();
  }

  async start({ stream, frameRate }: GpuRecordingStartOptions): Promise<MediaStream> {
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
    const recordingContext = this._recordingCanvas.getContext('2d', { alpha: false });
    if (!recordingContext) {
      this._recordingCanvas = null;
      this._recordingWidth = 0;
      this._recordingHeight = 0;
      throw new Error('Unable to create GPU recording canvas context');
    }

    this._recordingCtx = recordingContext;
    recordingContext.imageSmoothingEnabled = false;

    const fps = frameRate || 60;
    const recordingStream = this._recordingCanvas.captureStream(fps);
    this._recordingStream = recordingStream;

    for (const track of stream.getAudioTracks()) {
      recordingStream.addTrack(track.clone());
    }

    this._isRecording = true;
    this._recordingDroppedFrames = 0;

    this.logger.info(`Starting GPU recording at ${targetWidth}x${targetHeight}`);

    this._startRecordingFrameLoop();

    return recordingStream;
  }

  /**
   * Stop GPU recording with draining to await in-flight captures.
   * This prevents race conditions with GPU resource cleanup.
   * @returns {Promise<void>}
   */
  async stop(): Promise<void> {
    if (!this._isRecording) {
      return;
    }

    // Enter draining state - no new captures will start
    this._isDraining = true;

    // Cancel the RAF loop first
    this.disposables.cancel(RECORDING_FRAME_LIFECYCLE);

    // Wait for any in-flight capture to complete (with timeout)
    if (this._lastCapturePromise) {
      this.logger.debug('Waiting for in-flight capture to complete...');
      const capturePromise = this._lastCapturePromise;
      const drainResult: TimedRaceOutcome = await raceWithTimeout(capturePromise, 500);

      if (drainResult === 'timed-out') {
        void capturePromise.then((bitmap) => {
          if (bitmap && typeof bitmap.close === 'function') {
            bitmap.close();
            this.logger.debug('Closed late-resolving ImageBitmap after timeout');
          }
        }).catch(() => {
          // Ignore errors - capture may have failed
        });
      } else if (drainResult === 'failed') {
        // Capture may have failed due to GPU shutdown - that's expected
        this.logger.debug('In-flight capture completed with error (expected during shutdown)');
      }
    }

    this._cleanupGpuRecording();
  }

  override dispose(): void | Promise<void> {
    this._cleanupGpuRecording();
    const disposed = super.dispose();
    this.logger.info('CaptureGpuRecordingService disposed');
    return disposed;
  }

  _calculateRecordingScale(frameWidth: number, frameHeight: number): RecordingScaleParams | null {
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

    let scaleParams: RecordingScaleParams;

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

  _startRecordingFrameLoop(): void {
    const captureAndDraw = async () => {
      this.disposables.cancel(RECORDING_FRAME_LIFECYCLE);
      // Don't start new captures if draining or stopped
      if (!this._isRecording || this._isDraining) return;

      if (!this._isCapturePending) {
        this._isCapturePending = true;
        let frame: ImageBitmap | null = null;

        // Track the capture promise for draining
        const capturePromise = this.gpuRendererService.captureFrame();
        this._lastCapturePromise = capturePromise;

        try {
          frame = await capturePromise;

          const scaleParams = this._calculateRecordingScale(frame.width, frame.height);
          if (!scaleParams) {
            throw new Error('Invalid frame dimensions');
          }

          const { drawWidth, drawHeight, offsetX, offsetY, needsClearing } = scaleParams;
          const recordingContext = this._recordingCtx;
          if (!recordingContext) {
            throw new Error('Recording canvas context is unavailable');
          }

          // Performance: only clear canvas once when dimensions require it
          if (needsClearing && !this._isCanvasCleared) {
            recordingContext.fillStyle = '#000000';
            recordingContext.fillRect(0, 0, this._recordingWidth, this._recordingHeight);
            this._isCanvasCleared = true;
          }

          recordingContext.drawImage(
            frame,
            0, 0, frame.width, frame.height,
            offsetX, offsetY, drawWidth, drawHeight
          );
        } catch (e) {
          this.logger.debug('Frame capture skipped:', getErrorMessage(e, 'Frame capture failed'));
          this._recordingDroppedFrames++;
          if (this._recordingDroppedFrames >= 30) {
            this.eventBus.publish(EventChannels.CAPTURE.RECORDING_DEGRADED, {
              reason: 'dropped_frames',
              droppedFrames: this._recordingDroppedFrames
            });
            this._recordingDroppedFrames = 0;
          }
        } finally {
          frame?.close();
          this._isCapturePending = false;
          this._lastCapturePromise = null;
        }
      }

      this._scheduleRecordingFrame(captureAndDraw);
    };

    this._scheduleRecordingFrame(captureAndDraw);
  }

  _cleanupGpuRecording(): void {
    this.disposables.cancel(RECORDING_FRAME_LIFECYCLE);

    if (this._recordingStream) {
      this._recordingStream.getTracks().forEach((track) => track.stop());
      this._recordingStream = null;
    }

    this._recordingCanvas = null;
    this._recordingCtx = null;
    this._isRecording = false;
    this._isCapturePending = false;
    this._recordingDroppedFrames = 0;
    this._recordingWidth = 0;
    this._recordingHeight = 0;

    // Reset cache
    this._cachedScaleParams = null;
    this._cachedFrameWidth = 0;
    this._cachedFrameHeight = 0;
    this._isCanvasCleared = false;

    // Reset draining state
    this._isDraining = false;
    this._lastCapturePromise = null;
  }

  private _scheduleRecordingFrame(callback: FrameRequestCallback): void {
    const recordingFrameId = requestAnimationFrame(callback);
    this.disposables.replace(RECORDING_FRAME_LIFECYCLE, () => cancelAnimationFrame(recordingFrameId));
  }
}

export { CaptureGpuRecordingService };
