import { BaseService, createDeferred } from '@prismgb/core';
import type { EventBusLike, LoggerLike } from '@prismgb/core';
import { FilenameGenerator } from '@renderer/lib/filename-generator.utils.js';
import { EventChannels } from '@prismgb/events';

type MediaRecorderErrorEvent = Event & {
  error?: DOMException | Error | { message?: string; name?: string };
};

type LoggerFactoryLike = {
  create(name: string): LoggerLike;
};

type CaptureDependencies = {
  eventBus: EventBusLike;
  loggerFactory: LoggerFactoryLike;
};

type StopWaiter = {
  promise: Promise<void>;
  resolve(): void;
  reject(error: unknown): void;
};

const RECORDER_LIFECYCLE = Symbol('capture-recorder-lifecycle');
const RECORDER_STOP_WAIT_LIFECYCLE = Symbol('capture-recorder-stop-wait-lifecycle');
const RECORDER_STOP_TIMEOUT_MS = 2000;

function getRecorderError(event: MediaRecorderErrorEvent): Error {
  const error = event.error;
  if (error instanceof Error) {
    return error;
  }
  if (error && typeof error.message === 'string') {
    const recorderError = new Error(error.message);
    if (typeof error.name === 'string') {
      recorderError.name = error.name;
    }
    return recorderError;
  }
  return new Error('Recording failed');
}

class CaptureService extends BaseService {
  protected readonly eventBus: EventBusLike;
  isRecording: boolean;
  mediaRecorder: MediaRecorder | null;
  recordedChunks: Blob[];
  private _isDisposing: boolean;
  private _stopWaiter: StopWaiter | null;

  constructor(dependencies: CaptureDependencies) {
    super(dependencies, 'CaptureService');

    this.eventBus = dependencies.eventBus;
    this.isRecording = false;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this._isDisposing = false;
    this._stopWaiter = null;
  }

  async takeScreenshot(source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap): Promise<{ blob: Blob; filename: string }> {
    const isVideo = source instanceof HTMLVideoElement;
    const isCanvas = source instanceof HTMLCanvasElement;
    const isBitmap = typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap;

    if (!source) {
      this.logger.warn('Cannot take screenshot - no source provided');
      throw new Error('Invalid source');
    }

    if (isVideo && !source.videoWidth) {
      this.logger.warn('Cannot take screenshot - invalid video element');
      throw new Error('Invalid video element');
    }

    if (isCanvas && !source.width) {
      this.logger.warn('Cannot take screenshot - invalid canvas element');
      throw new Error('Invalid canvas element');
    }

    if (isBitmap && !source.width) {
      this.logger.warn('Cannot take screenshot - invalid ImageBitmap');
      throw new Error('Invalid ImageBitmap');
    }

    if (!isVideo && !isCanvas && !isBitmap) {
      this.logger.warn('Cannot take screenshot - unsupported source type');
      throw new Error('Invalid source type');
    }

    try {
      let width, height;
      if (isVideo) {
        width = source.videoWidth;
        height = source.videoHeight;
      } else {
        width = source.width;
        height = source.height;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to create 2D canvas context');
      }
      ctx.drawImage(source, 0, 0);

      if (isBitmap) {
        source.close();
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Failed to create screenshot blob'));
            return;
          }
          resolve(blob);
        }, 'image/png');
      });

      const filename = FilenameGenerator.forScreenshot();

      this.logger.info('Screenshot captured:', filename);

      this.eventBus.publish(EventChannels.CAPTURE.SCREENSHOT_READY, { blob, filename });

      return { blob, filename };
    } catch (error) {
      this.logger.error('Error taking screenshot:', error);
      throw error;
    }
  }

  async startRecording(stream: MediaStream): Promise<void> {
    if (!stream) {
      this.logger.warn('Cannot start recording - no stream provided');
      throw new Error('No stream provided');
    }

    if (this.isRecording) {
      this.logger.warn('Already recording');
      throw new Error('Already recording');
    }

    try {
      const codecs = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
      const mimeType = codecs.find(codec => MediaRecorder.isTypeSupported(codec)) || 'video/webm';

      const options = { mimeType };

      if (this._stopWaiter) {
        this.logger.warn('Recording stop is still in progress');
        throw new Error('Recording is stopping');
      }

      const recorder = new MediaRecorder(stream, options);
      this.mediaRecorder = recorder;
      this.recordedChunks = [];

      this._attachRecorderLifecycle(recorder);

      recorder.start(1000);
      this.isRecording = true;

      this.logger.info('Recording started');

      this.eventBus.publish(EventChannels.CAPTURE.RECORDING_STARTED);
    } catch (error) {
      this._releaseRecorderLifecycle(this.mediaRecorder);
      this.recordedChunks = [];
      this.logger.error('Error starting recording:', error);
      throw error;
    }
  }

  async stopRecording(): Promise<void> {
    if (this._stopWaiter) {
      return this._stopWaiter.promise;
    }

    if (!this.isRecording || !this.mediaRecorder) {
      this.logger.warn('Not currently recording');
      throw new Error('Not recording');
    }

    try {
      await this._stopActiveRecorder({ emitStoppedEvent: true });
    } catch (error) {
      this.logger.error('Error stopping recording:', error);
      throw error;
    }
  }

  async toggleRecording(stream: MediaStream): Promise<void> {
    return this.isRecording ? this.stopRecording() : this.startRecording(stream);
  }

  getRecordingState(): boolean {
    return this.isRecording;
  }

  async _handleRecordingStop(): Promise<void> {
    if (this._isDisposing) {
      this.logger.debug('Skipping recording stop handler during dispose');
      return;
    }
    if (this.recordedChunks.length === 0) {
      this.logger.warn('No recorded data to save');
      return;
    }

    const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
    const filename = FilenameGenerator.forRecording();

    this.logger.info('Recording ready to save:', filename);

    await this._publishLifecycleEvent(EventChannels.CAPTURE.RECORDING_READY, { blob, filename });

    this.recordedChunks = [];
  }

  _handleRecordingError(event: MediaRecorderErrorEvent): void {
    if (this._isDisposing) {
      return;
    }

    const error = getRecorderError(event);
    this.logger.error('Recording error:', error);

    this.isRecording = false;
    this.recordedChunks = [];

    this.eventBus.publish(EventChannels.CAPTURE.RECORDING_ERROR, {
      error: error.message || 'Recording failed',
      name: error.name || 'RecordingError'
    });
  }

  private _attachRecorderLifecycle(recorder: MediaRecorder): void {
    const handleDataAvailable = (event: BlobEvent) => {
      if (event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    const handleStop = async () => {
      try {
        await this._handleRecordingStop();
        this._settleStopWaiter();
      } catch (error) {
        this.logger.error('Error processing stopped recording:', error);
        this._settleStopWaiter(error);
      } finally {
        this._releaseRecorderLifecycle(recorder);
      }
    };

    const handleError = (event: Event) => {
      const recorderError = getRecorderError(event as MediaRecorderErrorEvent);
      this._handleRecordingError(event as MediaRecorderErrorEvent);
      this._settleStopWaiter(recorderError);
      this._releaseRecorderLifecycle(recorder);
    };

    recorder.addEventListener('dataavailable', handleDataAvailable);
    recorder.addEventListener('stop', handleStop);
    recorder.addEventListener('error', handleError);

    this.disposables.replace(RECORDER_LIFECYCLE, () => {
      recorder.removeEventListener('dataavailable', handleDataAvailable);
      recorder.removeEventListener('stop', handleStop);
      recorder.removeEventListener('error', handleError);
    });
  }

  private _createStopWaiter(): StopWaiter {
    if (this._stopWaiter) {
      return this._stopWaiter;
    }

    const timeout = setTimeout(() => {
      this._settleStopWaiter(new Error('Timed out waiting for recording to stop'));
    }, RECORDER_STOP_TIMEOUT_MS);

    this.disposables.replace(RECORDER_STOP_WAIT_LIFECYCLE, () => clearTimeout(timeout));

    const deferred = createDeferred<void>();

    this._stopWaiter = {
      promise: deferred.promise,
      resolve: () => {
        this.disposables.cancel(RECORDER_STOP_WAIT_LIFECYCLE);
        deferred.resolve();
      },
      reject: (error: unknown) => {
        this.disposables.cancel(RECORDER_STOP_WAIT_LIFECYCLE);
        deferred.reject(error);
      }
    };
    return this._stopWaiter;
  }

  private _settleStopWaiter(error?: unknown): void {
    const waiter = this._stopWaiter;
    if (!waiter) {
      this.disposables.cancel(RECORDER_STOP_WAIT_LIFECYCLE);
      return;
    }

    this._stopWaiter = null;
    if (error) {
      waiter.reject(error);
      return;
    }
    waiter.resolve();
  }

  private _releaseRecorderLifecycle(recorder: MediaRecorder | null): void {
    if (!recorder || this.mediaRecorder === recorder) {
      this.disposables.cancel(RECORDER_LIFECYCLE);
      this.mediaRecorder = null;
      this.isRecording = false;
    }
  }

  private async _publishLifecycleEvent(event: string, payload?: unknown): Promise<void> {
    if (this.eventBus.publishAsync) {
      await this.eventBus.publishAsync(event, payload);
      return;
    }
    this.eventBus.publish(event, payload);
  }

  private async _stopActiveRecorder({ emitStoppedEvent }: { emitStoppedEvent: boolean }): Promise<void> {
    const recorder = this.mediaRecorder;
    if (!recorder) {
      this.isRecording = false;
      return;
    }

    if (recorder.state === 'inactive') {
      this._releaseRecorderLifecycle(recorder);
      return;
    }

    const stopWaiter = this._createStopWaiter();

    try {
      this._requestFinalRecorderData(recorder);
      recorder.stop();
      this.isRecording = false;

      if (emitStoppedEvent) {
        this.logger.info('Recording stopped');
        this.eventBus.publish(EventChannels.CAPTURE.RECORDING_STOPPED);
      }
    } catch (error) {
      this._settleStopWaiter(error);
      this._releaseRecorderLifecycle(recorder);
      throw error;
    }

    await stopWaiter.promise;
  }

  private _requestFinalRecorderData(recorder: MediaRecorder): void {
    try {
      recorder.requestData();
    } catch (error) {
      this.logger.warn('Failed to flush recording data before stop', error);
    }
  }

  override async dispose(): Promise<void> {
    this.logger.debug('Disposing CaptureService');
    this._isDisposing = true;

    if (this.mediaRecorder) {
      try {
        await this._stopActiveRecorder({ emitStoppedEvent: false });
      } catch (error) {
        this.logger.error('Error stopping recording during dispose:', error);
      }
    }

    this._settleStopWaiter();
    this._releaseRecorderLifecycle(this.mediaRecorder);
    this.recordedChunks = [];
    await super.dispose();
  }
}

export { CaptureService };
