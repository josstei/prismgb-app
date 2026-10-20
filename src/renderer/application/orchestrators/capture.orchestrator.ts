import { injectable, inject } from 'inversify';
import { BaseOrchestrator, getErrorMessage, type LoggerFactory } from '@platform/core';
import { EventChannels } from '@renderer/lib/events/event-channels';
import { OnEvent, type EventBus } from '@renderer/lib/events/event-bus';
import type {
  RecordingDegradedPayload,
  RecordingErrorPayload,
  RecordingReadyPayload
} from '@renderer/lib/events/event-payloads';
import { downloadFile } from '@renderer/lib/file-download.utils';
import { TOKENS } from '@renderer/application/di/tokens';
import { isStreamingCapabilities } from '@renderer/infrastructure/services/streaming/streaming.contract';
import type { AppState } from '@renderer/application/state/app-state';
import type { CaptureService } from '@renderer/infrastructure/services/capture/capture.service';
import type { CaptureSaveService } from '@renderer/infrastructure/services/capture/capture-save.service';
import type { CaptureGpuRecordingService } from '@renderer/infrastructure/services/gpu/gpu-recording.service';
import type { StreamingRenderService } from '@renderer/infrastructure/services/streaming/streaming-render.service';
import type { StreamingViewService } from '@renderer/infrastructure/services/streaming/streaming-view.service';
import type { TranscodeService } from '@renderer/infrastructure/services/transcode/transcode.service';

@injectable()
export class CaptureOrchestrator extends BaseOrchestrator {
  private _recordingInterrupted: boolean;

  constructor(
    @inject(TOKENS.captureService) private readonly captureService: CaptureService,
    @inject(TOKENS.appState) private readonly appState: Pick<AppState, 'isStreaming' | 'currentStream' | 'currentCapabilities'>,
    @inject(TOKENS.streamViewService) private readonly streamViewService: Pick<StreamingViewService, 'getVideo'>,
    @inject(TOKENS.streamingRenderService) private readonly streamingRenderService: Pick<StreamingRenderService, 'isActive' | 'captureFrame'>,
    @inject(TOKENS.gpuRecordingService) private readonly gpuRecordingService: Pick<CaptureGpuRecordingService, 'start' | 'stop'>,
    @inject(TOKENS.transcodeService) private readonly transcodeService: Pick<TranscodeService, 'isTranscoding'>,
    @inject(TOKENS.captureSaveService) private readonly captureSaveService: Pick<CaptureSaveService, 'saveRecording'>,
    @inject(TOKENS.eventBus) private readonly eventBus: EventBus,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactory
  ) {
    super(loggerFactory, 'CaptureOrchestrator', eventBus);

    this._recordingInterrupted = false;
  }

  @OnEvent(EventChannels.UI.SCREENSHOT_REQUESTED)
  async takeScreenshot(): Promise<void> {
    if (!this.appState.isStreaming) {
      this.logger.warn('Cannot take screenshot - not streaming');
      return;
    }

    this.eventBus.publish(EventChannels.CAPTURE.SCREENSHOT_TRIGGERED);

    try {
      const source = await this._getCaptureSource();
      const { blob, filename } = await this.captureService.takeScreenshot(source);
      await downloadFile(blob, filename);
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Screenshot saved!' });
    } catch (error) {
      this.logger.error('Failed to take screenshot:', getErrorMessage(error, 'Screenshot failed'));
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Error taking screenshot', type: 'error' });
    }
  }

  // An active renderer session (WebGPU or Canvas2D) captures the shaded frame; otherwise capture the raw video.
  async _getCaptureSource(): Promise<HTMLVideoElement | ImageBitmap> {
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

  // An active renderer records its shaded frames; otherwise the raw device stream is recorded.
  @OnEvent(EventChannels.UI.RECORDING_TOGGLE_REQUESTED)
  async toggleRecording(): Promise<void> {
    if (this._isRecordingActive()) {
      await this._stopRecording();
      return;
    }

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
    return this.captureService.isRecording || Boolean(this.captureService.getRecordingState());
  }

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

  async _stopRecording(): Promise<void> {
    await this.gpuRecordingService.stop();

    try {
      await this.captureService.stopRecording();
    } catch (error) {
      this.logger.error('Failed to stop recording:', getErrorMessage(error, 'Failed to stop recording'));
    }
  }

  // Stopping here prevents an orphaned GPU recording loop once the stream is gone.
  @OnEvent(EventChannels.STREAM.STOPPED)
  async _handleStreamStopped(): Promise<void> {
    if (this._isRecordingActive()) {
      this.logger.info('Stream stopped - stopping active recording');
      this._recordingInterrupted = true;
      await this._stopRecording();
    }
  }

  @OnEvent(EventChannels.CAPTURE.RECORDING_STARTED)
  _handleRecordingStarted(): void {
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Recording started' });
  }

  @OnEvent(EventChannels.CAPTURE.RECORDING_DEGRADED)
  _handleRecordingDegraded(data: RecordingDegradedPayload): void {
    const message = `Recording quality degraded: ${data.droppedFrames ?? 0} frames dropped`;
    this.logger.warn('Recording degraded:', message);
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message, type: 'warning' });
  }

  @OnEvent(EventChannels.CAPTURE.RECORDING_ERROR)
  async _handleRecordingError(data: RecordingErrorPayload): Promise<void> {
    const message = getErrorMessage(data.error ?? data.message, 'Recording failed');
    this.logger.error('Recording error:', message);
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
      message: `Recording failed: ${data.error}`,
      type: 'error'
    });

    await this.gpuRecordingService.stop();
    this._recordingInterrupted = false;
  }

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

      // Transcoded saves publish their own status messages.
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

  async onCleanup(): Promise<void> {
    if (this._isRecordingActive()) {
      try {
        this._recordingInterrupted = true;
        await this._stopRecording();
      } catch (error) {
        this.logger.error('Error stopping recording during cleanup:', getErrorMessage(error, 'Failed to stop recording'));
      }
    } else {
      await this.gpuRecordingService.stop();
    }
  }
}
