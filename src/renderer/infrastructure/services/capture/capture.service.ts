/**
 * Capture Service
 *
 * Handles screenshot and recording functionality
 * 100% UI-agnostic - emits events instead of calling UI directly
 *
 * Events emitted:
 * - 'capture:screenshot-ready' - Screenshot captured and ready to save
 * - 'capture:recording-started' - Recording started
 * - 'capture:recording-stopped' - Recording stopped
 * - 'capture:recording-ready' - Recording ready to save
 * - 'capture:recording-error' - Recording failed (codec error, disk full, etc.)
 */

import { BaseService } from '@shared/base/service.base.js';
import type { EventBusLike, LoggerLike } from '@shared/base/service.base.js';
import { FilenameGenerator } from '@shared/lib/filename-generator.utils';
import { EventChannels } from '@shared/events/event-channels.js';

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

class CaptureService extends BaseService {
  declare protected readonly eventBus: EventBusLike;
  declare protected readonly logger: LoggerLike;

  isRecording: boolean;
  mediaRecorder: MediaRecorder | null;
  recordedChunks: Blob[];
  _isDisposing: boolean;

  constructor(dependencies: CaptureDependencies) {
    super(dependencies, ['eventBus', 'loggerFactory'], 'CaptureService');

    // Recording state
    this.isRecording = false;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this._isDisposing = false;
  }

  async takeScreenshot(source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap) {
    // Determine source type and validate
    const isVideo = source instanceof HTMLVideoElement;
    const isCanvas = source instanceof HTMLCanvasElement;
    // ImageBitmap may not be defined in all environments (e.g., happy-dom test env)
    const isBitmap = typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap;

    if (!source) {
      this.logger.warn('Cannot take screenshot - no source provided');
      throw new Error('Invalid source');
    }

    // Validate based on type
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

    // If none of the known types match, the source is invalid
    if (!isVideo && !isCanvas && !isBitmap) {
      this.logger.warn('Cannot take screenshot - unsupported source type');
      throw new Error('Invalid source type');
    }

    try {
      // Determine dimensions based on source type
      let width, height;
      if (isVideo) {
        width = source.videoWidth;
        height = source.videoHeight;
      } else {
        // Both canvas and ImageBitmap have width/height properties
        width = source.width;
        height = source.height;
      }

      // Note: Canvas is created here for image processing (pixel extraction and PNG encoding),
      // not for UI rendering. This is a legitimate DOM operation in a service layer for
      // converting video frames/bitmaps to exportable image blobs.
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to create 2D canvas context');
      }
      ctx.drawImage(source, 0, 0);

      // Close ImageBitmap after drawing to release memory
      if (isBitmap) {
        source.close();
      }

      // Convert to blob
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

      // Emit event
      this.eventBus.publish(EventChannels.CAPTURE.SCREENSHOT_READY, { blob, filename });

      return { blob, filename };
    } catch (error) {
      this.logger.error('Error taking screenshot:', error);
      throw error;
    }
  }

  async startRecording(stream: MediaStream) {
    if (!stream) {
      this.logger.warn('Cannot start recording - no stream provided');
      throw new Error('No stream provided');
    }

    if (this.isRecording) {
      this.logger.warn('Already recording');
      throw new Error('Already recording');
    }

    try {
      // Create media recorder - try codecs in order of preference (vp9 preferred per config)
      const codecs = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
      const mimeType = codecs.find(codec => MediaRecorder.isTypeSupported(codec)) || 'video/webm';

      const options = { mimeType };

      this.mediaRecorder = new MediaRecorder(stream, options);
      this.recordedChunks = [];

      // Collect recorded chunks
      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      // Handle recording stop
      this.mediaRecorder.onstop = () => {
        this._handleRecordingStop();
      };

      // Handle recording errors (disk full, codec failure, etc.)
      this.mediaRecorder.onerror = (event: MediaRecorderErrorEvent) => {
        this._handleRecordingError(event);
      };

      this.mediaRecorder.start(1000);
      this.isRecording = true;

      this.logger.info('Recording started');

      // Emit event
      this.eventBus.publish(EventChannels.CAPTURE.RECORDING_STARTED);
    } catch (error) {
      this.logger.error('Error starting recording:', error);
      throw error;
    }
  }

  async stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) {
      this.logger.warn('Not currently recording');
      throw new Error('Not recording');
    }

    try {
      this.mediaRecorder.stop();
      this.isRecording = false;

      this.logger.info('Recording stopped');

      // Emit event
      this.eventBus.publish(EventChannels.CAPTURE.RECORDING_STOPPED);
    } catch (error) {
      this.logger.error('Error stopping recording:', error);
      throw error;
    }
  }

  async toggleRecording(stream: MediaStream) {
    return this.isRecording ? this.stopRecording() : this.startRecording(stream);
  }

  getRecordingState() {
    return this.isRecording;
  }

  _handleRecordingStop() {
    // Skip processing if we're disposing (avoid race with async onstop)
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

    // Emit event
    this.eventBus.publish(EventChannels.CAPTURE.RECORDING_READY, { blob, filename });

    // Clear recorded chunks
    this.recordedChunks = [];
  }

  _handleRecordingError(event: MediaRecorderErrorEvent) {
    if (this._isDisposing) {
      return;
    }

    const error = event.error || new Error('Recording failed');
    this.logger.error('Recording error:', error);

    // Reset recording state
    this.isRecording = false;
    this.recordedChunks = [];

    // Emit error event so UI can recover
    this.eventBus.publish(EventChannels.CAPTURE.RECORDING_ERROR, {
      error: error.message || 'Recording failed',
      name: error.name || 'RecordingError'
    });
  }

  /**
   * Dispose of resources and stop any active recording
   * Called during cleanup to ensure no resources are leaked.
   */
  dispose() {
    this.logger.debug('Disposing CaptureService');

    // Set disposing flag to prevent async onstop from processing
    this._isDisposing = true;

    // Stop any active recording
    if (this.isRecording && this.mediaRecorder) {
      // Nullify event handlers before stopping to prevent callback races
      this.mediaRecorder.ondataavailable = null;
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.onerror = null;

      try {
        this.mediaRecorder.stop();
      } catch (error) {
        this.logger.error('Error stopping recording during dispose:', error);
      }
    }

    // Clear references
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;
  }
}

export { CaptureService };
