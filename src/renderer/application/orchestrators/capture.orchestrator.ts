
import { BaseOrchestrator } from '@platform/core';
import { EventChannels, OnEvent } from '@platform/events';
import type { LoggerFactoryLike } from '@platform/core';
import type { RecordingErrorPayload, RecordingReadyPayload, TypedEventBusLike } from '@platform/events';
import { getErrorMessage } from '@platform/core';

import { isStreamingCapabilities } from '@renderer/infrastructure/services/streaming/streaming.contract.js';
import type {
  GpuRecordingStartOptions
} from '@renderer/infrastructure/services/streaming/streaming.contract.js';
import type { AppState } from '@renderer/application/state/app-state.js';

type CaptureSource = HTMLCanvasElement | HTMLVideoElement | ImageBitmap;

type CaptureServiceLike = {
  isRecording: boolean;
  takeScreenshot(source: CaptureSource): Promise<unknown>;
  startRecording(stream: MediaStream): Promise<void>;
  stopRecording(): Promise<void>;
};

type AppStateLike = Pick<AppState, 'isStreaming' | 'currentStream' | 'currentCapabilities'>;

type StreamViewServiceLike = {
  getCanvas(): HTMLCanvasElement | null;
  getVideo(): HTMLVideoElement | null;
};

type GpuRecordingServiceLike = {
  start(options: GpuRecordingStartOptions): Promise<MediaStream>;
  stop(): Promise<void>;
};

type TranscodeServiceLike = {
  isTranscoding(): boolean;
};

type SaveRecordingResult = {
  success?: boolean;
  transcoded?: boolean;
};

type CaptureSaveServiceLike = {
  saveRecording(
    blob: Blob,
    filename: string,
    options: { interrupted: boolean }
  ): Promise<SaveRecordingResult>;
};

type CaptureOrchestratorDependencies = {
  captureService: CaptureServiceLike;
  appState: AppStateLike;
  streamViewService: StreamViewServiceLike;
  streamingRenderService: Pick<import('@renderer/infrastructure/services/streaming/streaming.contract').GpuRendererServiceLike, 'isActive' | 'captureFrame'>;
  gpuRecordingService: GpuRecordingServiceLike;
  transcodeService: TranscodeServiceLike;
  captureSaveService: CaptureSaveServiceLike;
  eventBus: TypedEventBusLike;
  loggerFactory: LoggerFactoryLike;
};

export class CaptureOrchestrator extends BaseOrchestrator {
  private _recordingInterrupted: boolean;
  private readonly screenshots = new Set<Promise<void>>();
  private closing = false;

  private readonly captureService: CaptureServiceLike;
  private readonly appState: AppStateLike;
  private readonly streamViewService: StreamViewServiceLike;
  private readonly streamingRenderService: Pick<import('@renderer/infrastructure/services/streaming/streaming.contract').GpuRendererServiceLike, 'isActive' | 'captureFrame'>;
  private readonly gpuRecordingService: GpuRecordingServiceLike;
  private readonly transcodeService: TranscodeServiceLike;
  private readonly captureSaveService: CaptureSaveServiceLike;
  protected readonly eventBus: TypedEventBusLike;

  constructor({ captureService, appState, streamViewService, streamingRenderService, gpuRecordingService, transcodeService, captureSaveService, eventBus, loggerFactory }: CaptureOrchestratorDependencies) {
    super({ loggerFactory, eventBus }, 'CaptureOrchestrator');
    this.captureService = captureService;
    this.appState = appState;
    this.streamViewService = streamViewService;
    this.streamingRenderService = streamingRenderService;
    this.gpuRecordingService = gpuRecordingService;
    this.transcodeService = transcodeService;
    this.captureSaveService = captureSaveService;
    this.eventBus = eventBus;

    this._recordingInterrupted = false;
  }

  @OnEvent(EventChannels.UI.SCREENSHOT_REQUESTED)
  takeScreenshot(): Promise<void> {
    if (this.closing) return Promise.resolve();
    const screenshot = this.captureScreenshot();
    this.screenshots.add(screenshot);
    return screenshot.finally(() => this.screenshots.delete(screenshot));
  }

  private async captureScreenshot(): Promise<void> {
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
      this.logger.error('Failed to take screenshot:', getErrorMessage(error, 'Screenshot failed'));
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
  async _getCaptureSource(): Promise<CaptureSource> {
    if (this.streamingRenderService.isActive()) {
      this.logger.debug('Capturing screenshot from renderer session');
      return this.streamingRenderService.captureFrame();
    }

    this.logger.debug('Capturing screenshot from video element (no rendering pipeline)');
    const video = this.streamViewService.getVideo();
    if (!video) {
      throw new Error('Stream video element is unavailable');
    }
    return video;
  }

  /**
   * Toggle recording (start/stop)
   * When GPU renderer active, captures rendered frames with shader effects.
   * Otherwise falls back to raw device stream.
   * Blocks new recording if transcoding is in progress.
   */
  @OnEvent(EventChannels.UI.RECORDING_TOGGLE_REQUESTED)
  async toggleRecording(): Promise<void> {
    if (this._isRecordingActive()) {
      await this._stopRecording();
      return;
    }

    // Block recording if transcoding is in progress
    if (this.transcodeService.isTranscoding()) {
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
      if (this.streamingRenderService.isActive()) {
        await this._startGpuRecording(stream);
      } else {
        await this.captureService.startRecording(stream);
      }
      this._recordingInterrupted = false;
    } catch (error) {
      this.logger.error('Failed to start recording:', getErrorMessage(error, 'Recording failed'));
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Error with recording', type: 'error' });
    }
  }

  _isRecordingActive(): boolean {
    return this.captureService.isRecording;
  }

  /**
   * Start recording from GPU-rendered canvas with shader effects
   * @private
   */
  async _startGpuRecording(stream: MediaStream): Promise<void> {
    const capabilities = this.appState.currentCapabilities;
    const frameRate = isStreamingCapabilities(capabilities) && typeof capabilities.frameRate === 'number'
      ? capabilities.frameRate
      : 60;
    const recordingStream = await this.gpuRecordingService.start({
      stream,
      frameRate
    });

    try {
      await this.captureService.startRecording(recordingStream);
    } catch (error) {
      await this.gpuRecordingService.stop();
      throw error;
    }
  }

  /**
   * Stop recording and clean up GPU recording resources
   * @private
   */
  async _stopRecording(): Promise<void> {
    await this.gpuRecordingService.stop();

    try {
      await this.captureService.stopRecording();
    } catch (error) {
      this.logger.error('Failed to stop recording:', getErrorMessage(error, 'Failed to stop recording'));
    }
  }

  /**
   * Handle stream stopped - stop any active recording
   * Prevents orphaned GPU recording loop when stream stops
   * @private
   */
  @OnEvent(EventChannels.STREAM.STOPPED)
  async _handleStreamStopped(): Promise<void> {
    if (this._isRecordingActive()) {
      this.logger.info('Stream stopped - stopping active recording');
      this._recordingInterrupted = true;
      await this._stopRecording();
    }
  }

  /**
   * Handle recording error event
   * @private
   */
  @OnEvent(EventChannels.CAPTURE.RECORDING_ERROR)
  async _handleRecordingError(data: RecordingErrorPayload): Promise<void> {
    const message = getErrorMessage(data.error ?? data.message, 'Recording failed');
    this.logger.error('Recording error:', message);

    await this.gpuRecordingService.stop();
    this._recordingInterrupted = false;
  }

  /**
   * Handle recording ready - save the recording via captureSaveService
   * @param {Object} data - Recording data { blob, filename }
   * @private
   */
  @OnEvent(EventChannels.CAPTURE.RECORDING_READY)
  async _handleRecordingReady(data: RecordingReadyPayload): Promise<void> {
    const { blob, filename } = data;

    try {
      const result = await this.captureSaveService.saveRecording(blob, filename, {
        interrupted: this._recordingInterrupted
      });
      this._recordingInterrupted = false;

      if (!result.success) {
        this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
          message: 'Failed to save recording. Please try again.',
          type: 'error'
        });
        return;
      }

      // Only show status message for direct saves (webm)
      // Transcoded saves show their own status messages
      if (!result.transcoded) {
        this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Recording saved!' });
      }
    } catch (error) {
      this.logger.error('Failed to save recording:', getErrorMessage(error, 'Failed to save recording'));
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
        message: 'Failed to save recording. Please try again.',
        type: 'error'
      });
    }
  }

  /**
   * Cleanup resources
   */
  async onCleanup(): Promise<void> {
    this.closing = true;
    if (this._isRecordingActive()) {
      this._recordingInterrupted = true;
    }
    // stopRecording also joins a stop already in progress. Keep RECORDING_READY
    // subscribed until its final data and asynchronous save have completed.
    await Promise.all([...this.screenshots, this._stopRecording()]);
  }
}
