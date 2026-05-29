import { Service } from '@prismgb/core';
import { BaseService } from '@prismgb/core';
import { EventChannels } from '@prismgb/events';
import {
  createRendererPreloadEventBridge,
  RendererPreloadBridgeDescriptors
} from '@renderer/infrastructure/services/preload-event-bridge.factory';
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

interface TranscodeEventBus {
  publish(event: string, payload?: unknown): void;
}

interface TranscodeServiceDependencies {
  eventBus: TranscodeEventBus;
  loggerFactory: unknown;
}

@Service({
  "token": "transcodeService",
  "disposal": "dispose"
})
class TranscodeService extends BaseService {
  private readonly eventBus: TranscodeEventBus;
  private _isTranscoding: boolean;
  private _activeJobId: string | null;
  private _initialized: boolean;

  constructor(dependencies: TranscodeServiceDependencies) {
    super(dependencies, 'TranscodeService');

    this.eventBus = dependencies.eventBus;
    this._isTranscoding = false;
    this._activeJobId = null;
    this._initialized = false;
  }

  initialize() {
    if (this._initialized) {
      this.logger.warn('TranscodeService already initialized');
      return;
    }

    const transcodeAPI = window.transcodeAPI;
    if (!transcodeAPI) {
      this.logger.warn('transcodeAPI not available - transcoding disabled');
      return;
    }

    this.logger.info('Initializing TranscodeService');

    this.disposables.replace(RendererPreloadBridgeDescriptors.transcodeAPI.lifecycleKey, createRendererPreloadEventBridge({
      api: transcodeAPI,
      descriptor: RendererPreloadBridgeDescriptors.transcodeAPI,
      logger: this.logger,
      handlers: {
        onProgress: (data: TranscodeProgressPayload) => this._handleProgress(data),
        onCompleted: (data: TranscodeCompletedPayload) => this._handleCompleted(data),
        onError: (data: TranscodeErrorPayload) => this._handleError(data),
        onCancelled: (data: TranscodeCancelledPayload) => this._handleCancelled(data)
      }
    }));

    this._initialized = true;
    this.logger.info('TranscodeService initialized');
  }

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

      const arrayBuffer = await blob.arrayBuffer();
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

  isTranscoding() {
    return this._isTranscoding;
  }

  isAvailable() {
    return Boolean(window.transcodeAPI);
  }

  _handleProgress(data: TranscodeProgressPayload) {
    this.eventBus.publish(RendererPreloadBridgeDescriptors.transcodeAPI.events.onProgress, data);
  }

  _handleCompleted(data: TranscodeCompletedPayload) {
    this.logger.info('Transcode completed', data);
    this._isTranscoding = false;
    this._activeJobId = null;
    this.eventBus.publish(RendererPreloadBridgeDescriptors.transcodeAPI.events.onCompleted, data);
  }

  _handleError(data: TranscodeErrorPayload) {
    this.logger.error('Transcode error', data);
    this._isTranscoding = false;
    this._activeJobId = null;
    this.eventBus.publish(RendererPreloadBridgeDescriptors.transcodeAPI.events.onError, data);
  }

  _handleCancelled(data: TranscodeCancelledPayload) {
    this.logger.info('Transcode cancelled', data);
    this._isTranscoding = false;
    this._activeJobId = null;
    this.eventBus.publish(RendererPreloadBridgeDescriptors.transcodeAPI.events.onCancelled, data);
  }

  override dispose(): void | Promise<void> {
    this._isTranscoding = false;
    this._activeJobId = null;
    this._initialized = false;
    this.logger.info('TranscodeService disposed');
    return super.dispose();
  }
}

export { TranscodeService };
