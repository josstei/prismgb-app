/**
 * Transcode Service (Renderer)
 *
 * Bridges window.transcodeAPI (preload) with EventBus for renderer-side transcode handling.
 * Manages transcoding state and re-emits IPC events as EventBus events.
 *
 * Events emitted:
 * - 'transcode:started' - Transcoding started
 * - 'transcode:progress' - Transcoding progress update
 * - 'transcode:completed' - Transcoding completed successfully
 * - 'transcode:error' - Transcoding error occurred
 * - 'transcode:cancelled' - Transcoding was cancelled
 */

import { LifecycleService } from '@prismgb/core';
import { EventChannels } from '@renderer/common/config/event-channels';
import type {
  TranscodeCancelResponse,
  TranscodeCancelledPayload,
  TranscodeCompletedPayload,
  TranscodeErrorPayload,
  TranscodeFormat,
  TranscodeProgressPayload,
  TranscodeStartOptions,
  TranscodeStartResponse
} from '@prismgb/ipc';

class TranscodeService extends LifecycleService {
  static readonly dependencies = ['eventBus', 'loggerFactory'] as const;

  constructor(dependencies) {
    super(dependencies, [...TranscodeService.dependencies], 'TranscodeService');

    this._isTranscoding = false;
    this._activeJobId = null;
  }

  /**
   * Initialize the service - subscribe to IPC events via window.transcodeAPI
   */
  async initialize() {
    if (!window.transcodeAPI) {
      this.logger.warn('transcodeAPI not available - transcoding disabled');
      return;
    }

    await super.initialize();
  }

  async onInitialize() {
    // Subscribe to IPC events and republish on eventBus
    // Note: No onStarted handler - the main process doesn't emit a STARTED event.
    // The started state is determined by the successful return of transcode() call.
    this._subscriptions.push(
      window.transcodeAPI.onProgress((data) => this._handleProgress(data)),
      window.transcodeAPI.onCompleted((data) => this._handleCompleted(data)),
      window.transcodeAPI.onError((data) => this._handleError(data)),
      window.transcodeAPI.onCancelled((data) => this._handleCancelled(data))
    );
  }

  /**
   * Start transcoding a blob to a different format
   * @param {Blob} blob - The source video blob
   * @param {string} format - Target format (e.g., 'mp4', 'mov')
   * @param {string} [outputBaseName] - Base name for output file (without extension)
   * @param {Object} [options]
   * @param {string[]} [options.inputArgs] - FFmpeg input args (applied before -i)
   * @param {boolean} [options.interrupted] - Recording stopped due to stream interruption
   * @returns {Promise<{success: boolean, jobId?: string, error?: string}>}
   */
  async transcode(
    blob: Blob,
    format: TranscodeFormat,
    outputBaseName?: string,
    options: TranscodeStartOptions = {}
  ): Promise<TranscodeStartResponse> {
    if (!window.transcodeAPI) {
      this.logger.warn('transcodeAPI not available');
      return { success: false, error: 'Transcoding not available' };
    }

    if (this._isTranscoding) {
      this.logger.warn('Transcoding already in progress');
      return { success: false, error: 'Transcoding already in progress' };
    }

    try {
      this.logger.info(`Starting transcode to ${format}`);

      // Convert blob to ArrayBuffer for IPC transfer
      const arrayBuffer = await blob.arrayBuffer();

      // Call the main process transcode API
      const result = await window.transcodeAPI.start(
        arrayBuffer,
        format,
        outputBaseName,
        {
          inputArgs: Array.isArray(options.inputArgs) ? options.inputArgs : undefined,
          interrupted: Boolean(options.interrupted)
        }
      );

      if (result.success && result.jobId) {
        // Track state locally since main process doesn't emit STARTED event
        this._isTranscoding = true;
        this._activeJobId = result.jobId;
        this.logger.info('Transcode started', { jobId: result.jobId, format });
        this.eventBus.publish(EventChannels.TRANSCODE.STARTED, { jobId: result.jobId, format });
      }

      return result;
    } catch (error) {
      this.logger.error('Transcode failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Cancel the current transcoding operation
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async cancel(): Promise<TranscodeCancelResponse> {
    if (!window.transcodeAPI) {
      this.logger.warn('transcodeAPI not available');
      return { success: false, error: 'Transcoding not available' };
    }

    if (!this._isTranscoding || !this._activeJobId) {
      this.logger.warn('No transcoding in progress to cancel');
      return { success: false, error: 'No transcoding in progress' };
    }

    this.logger.info('Cancelling transcode', { jobId: this._activeJobId });
    return window.transcodeAPI.cancel(this._activeJobId);
  }

  /**
   * Check if transcoding is currently in progress
   * @returns {boolean}
   */
  isTranscoding() {
    return this._isTranscoding;
  }

  /**
   * Check if transcoding capability is available
   * Use this instead of directly checking window.transcodeAPI
   * @returns {boolean}
   */
  isAvailable() {
    return Boolean(window.transcodeAPI);
  }

  /**
   * Handle transcode progress event from IPC
   * @param {Object} data - Progress data (percent, timeRemaining, etc.)
   * @private
   */
  _handleProgress(data: TranscodeProgressPayload) {
    this.eventBus.publish(EventChannels.TRANSCODE.PROGRESS, data);
  }

  /**
   * Handle transcode completed event from IPC
   * @param {Object} data - Completion data (outputPath, duration, etc.)
   * @private
   */
  _handleCompleted(data: TranscodeCompletedPayload) {
    this.logger.info('Transcode completed', data);
    this._isTranscoding = false;
    this._activeJobId = null;
    this.eventBus.publish(EventChannels.TRANSCODE.COMPLETED, data);
  }

  /**
   * Handle transcode error event from IPC
   * @param {Object} data - Error data
   * @private
   */
  _handleError(data: TranscodeErrorPayload) {
    this.logger.error('Transcode error', data);
    this._isTranscoding = false;
    this._activeJobId = null;
    this.eventBus.publish(EventChannels.TRANSCODE.ERROR, data);
  }

  /**
   * Handle transcode cancelled event from IPC
   * @param {Object} data - Cancellation data
   * @private
   */
  _handleCancelled(data: TranscodeCancelledPayload) {
    this.logger.info('Transcode cancelled', data);
    this._isTranscoding = false;
    this._activeJobId = null;
    this.eventBus.publish(EventChannels.TRANSCODE.CANCELLED, data);
  }

  /**
   * Cleanup subscriptions and reset state
   */
  async onDispose() {
    window.transcodeAPI?.removeListeners?.();

    this._isTranscoding = false;
    this._activeJobId = null;
    this.logger.info('TranscodeService disposed');
  }
}

export { TranscodeService };
