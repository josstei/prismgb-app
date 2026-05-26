import { BaseOrchestrator } from '@shared/base/orchestrator.base.js';
import { EventChannels } from '@shared/events/event-channels.js';
import type { LoggerLike } from '@shared/base/service.base.js';
import type { TypedEventBusLike } from '@shared/events/event-payloads.js';
import { getErrorMessage } from '@shared/lib/errors/error-guards.js';
import {
  isRecordingErrorPayload,
  isRecordingReadyPayload,
  isStreamingCapabilities
} from '@renderer/infrastructure/streaming/streaming-contracts.js';
import type {
  GpuRecordingStartOptions,
  GpuRendererServiceLike
} from '@renderer/infrastructure/streaming/streaming-contracts.js';

type LoggerFactoryLike = {
  create(name: string): LoggerLike;
};

type CaptureSource = HTMLCanvasElement | HTMLVideoElement | ImageBitmap;

type CaptureServiceLike = {
  isRecording: boolean;
  getRecordingState(): boolean;
  takeScreenshot(source: CaptureSource): Promise<unknown>;
  startRecording(stream: MediaStream): Promise<void>;
  stopRecording(): Promise<void>;
};

type AppStateLike = {
  isStreaming: boolean;
  currentStream: MediaStream | null;
  currentCapabilities: unknown;
};

type StreamViewServiceLike = {
  getCanvas(): HTMLCanvasElement | null;
  getVideo(): HTMLVideoElement | null;
};

type GpuRecordingServiceLike = {
  start(options: GpuRecordingStartOptions): Promise<MediaStream>;
  stop(): Promise<void>;
};

type CanvasRenderLoopServiceLike = {
  isActive(): boolean;
};

type TranscodeServiceLike = {
  isTranscoding(): boolean;
};

type SaveRecordingResult = {
  success?: boolean;
  transcoded?: boolean;
  [key: string]: unknown;
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
  gpuRendererService: GpuRendererServiceLike;
  gpuRecordingService: GpuRecordingServiceLike;
  canvasRenderLoopService: CanvasRenderLoopServiceLike;
  transcodeService: TranscodeServiceLike;
  captureSaveService: CaptureSaveServiceLike;
  eventBus: TypedEventBusLike;
  loggerFactory: LoggerFactoryLike;
};

export class CaptureOrchestrator extends BaseOrchestrator {
  private readonly captureService: CaptureServiceLike;
  private readonly appState: AppStateLike;
  private readonly streamViewService: StreamViewServiceLike;
  private readonly gpuRendererService: GpuRendererServiceLike;
  private readonly gpuRecordingService: GpuRecordingServiceLike;
  private readonly canvasRenderLoopService: CanvasRenderLoopServiceLike;
  private readonly transcodeService: TranscodeServiceLike;
  private readonly captureSaveService: CaptureSaveServiceLike;
  protected readonly eventBus: TypedEventBusLike;

  private _recordingInterrupted: boolean;

  constructor(dependencies: CaptureOrchestratorDependencies) {
    super(
      dependencies,
      [
        'captureService',
        'appState',
        'streamViewService',
        'gpuRendererService',
        'gpuRecordingService',
        'canvasRenderLoopService',
        'transcodeService',
        'captureSaveService',
        'eventBus',
        'loggerFactory'
      ],
      'CaptureOrchestrator'
    );

    this.captureService = dependencies.captureService;
    this.appState = dependencies.appState;
    this.streamViewService = dependencies.streamViewService;
    this.gpuRendererService = dependencies.gpuRendererService;
    this.gpuRecordingService = dependencies.gpuRecordingService;
    this.canvasRenderLoopService = dependencies.canvasRenderLoopService;
    this.transcodeService = dependencies.transcodeService;
    this.captureSaveService = dependencies.captureSaveService;
    this.eventBus = dependencies.eventBus;
    this._recordingInterrupted = false;
  }

  /**
   * Initialize capture orchestrator
   */
  async onInitialize(): Promise<void> {
    this.subscribeWithCleanup({
      [EventChannels.CAPTURE.RECORDING_ERROR]: (data: unknown) => this._handleRecordingError(data),
      [EventChannels.CAPTURE.RECORDING_READY]: (data: unknown) => this._handleRecordingReady(data),
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
  async takeScreenshot(): Promise<void> {
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
    if (this.gpuRendererService.isActive()) {
      this.logger.debug('Capturing screenshot from GPU renderer');
      return this.gpuRendererService.captureFrame();
    }

    if (this.canvasRenderLoopService.isActive()) {
      this.logger.debug('Capturing screenshot from Canvas2D renderer');
      const canvas = this.streamViewService.getCanvas();
      if (!canvas) {
        throw new Error('Stream canvas element is unavailable');
      }
      return canvas;
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
      if (this.gpuRendererService.isActive()) {
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
    return this.captureService.isRecording || Boolean(this.captureService.getRecordingState());
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

    await this.captureService.startRecording(recordingStream);
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
   * Clean up GPU recording resources
   * @private
   */

  /**
   * Handle stream stopped - stop any active recording
   * Prevents orphaned GPU recording loop when stream stops
   * @private
   */
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
  async _handleRecordingError(data: unknown): Promise<void> {
    if (!isRecordingErrorPayload(data)) {
      this.logger.error('Recording error event missing payload', data);
      await this.gpuRecordingService.stop();
      this._recordingInterrupted = false;
      return;
    }

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
  async _handleRecordingReady(data: unknown): Promise<void> {
    if (!isRecordingReadyPayload(data)) {
      this.logger.error('Recording ready event missing payload', data);
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
        message: 'Failed to save recording. Please try again.',
        type: 'error'
      });
      return;
    }

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
    if (this.captureService.getRecordingState()) {
      try {
        await this.captureService.stopRecording();
      } catch (error) {
        this.logger.error('Error stopping recording during cleanup:', getErrorMessage(error, 'Failed to stop recording'));
      }
    }
    await this.gpuRecordingService.stop();
  }
}
