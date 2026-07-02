import { BaseService, getErrorMessage } from '@platform/core';
import { EventChannels } from '@platform/events';
import { createTrpcEventBridge } from '@renderer/infrastructure/services/platform/trpc-event-bridge.factory';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import type {
  TranscodeCancelResponse,
  TranscodeCancelledPayload,
  TranscodeCompletedPayload,
  TranscodeErrorPayload,
  TranscodeFormat,
  TranscodeProgressPayload,
  TranscodeStartOptions,
  TranscodeStartResponse
} from '@platform/ipc';

const TRANSCODE_SUBSCRIPTION_LIFECYCLE = Symbol('transcodeSubscriptionLifecycle');

interface TranscodeEventBus {
  publish(event: string, payload?: unknown): void;
}

interface TranscodeServiceDependencies {
  eventBus: TranscodeEventBus;
  loggerFactory: unknown;
}

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

    this.logger.info('Initializing TranscodeService');

    this.disposables.replace(TRANSCODE_SUBSCRIPTION_LIFECYCLE, createTrpcEventBridge('TranscodeService', [
      () => trpcClient.transcode.onProgress.subscribe(undefined, { onData: (data) => this._handleProgress(data) }),
      () => trpcClient.transcode.onCompleted.subscribe(undefined, { onData: (data) => this._handleCompleted(data) }),
      () => trpcClient.transcode.onError.subscribe(undefined, { onData: (data) => this._handleError(data) }),
      () => trpcClient.transcode.onCancelled.subscribe(undefined, { onData: (data) => this._handleCancelled(data) })
    ], this.logger));

    this._initialized = true;
    this.logger.info('TranscodeService initialized');
  }

  async transcode(
    blob: Blob,
    format: TranscodeFormat,
    outputBaseName?: string,
    options: TranscodeStartOptions = {}
  ): Promise<TranscodeStartResponse> {
    if (this._isTranscoding) {
      this.logger.warn('Transcoding already in progress');
      return { success: false, error: 'Transcoding already in progress' };
    }

    try {
      this.logger.info(`Starting transcode to ${format}`);

      const arrayBuffer = await blob.arrayBuffer();
      const result = await trpcClient.transcode.start.mutate({
        inputBuffer: arrayBuffer,
        format,
        outputFilename: outputBaseName,
        inputArgs: Array.isArray(options.inputArgs) ? options.inputArgs : undefined,
        interrupted: Boolean(options.interrupted)
      });

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
        error: getErrorMessage(error)
      };
    }
  }

  async cancel(): Promise<TranscodeCancelResponse> {
    if (!this._isTranscoding || !this._activeJobId) {
      this.logger.warn('No transcoding in progress to cancel');
      return { success: false, error: 'No transcoding in progress' };
    }

    this.logger.info('Cancelling transcode', { jobId: this._activeJobId });
    try {
      return await trpcClient.transcode.cancel.mutate({ jobId: this._activeJobId });
    } catch (error) {
      this.logger.error('Cancel transcode failed', error);
      return {
        success: false,
        error: getErrorMessage(error)
      };
    }
  }

  isTranscoding() {
    return this._isTranscoding;
  }

  isAvailable() {
    return true;
  }

  _handleProgress(data: TranscodeProgressPayload) {
    this.eventBus.publish(EventChannels.TRANSCODE.PROGRESS, data);
  }

  _handleCompleted(data: TranscodeCompletedPayload) {
    this.logger.info('Transcode completed', data);
    this._isTranscoding = false;
    this._activeJobId = null;
    this.eventBus.publish(EventChannels.TRANSCODE.COMPLETED, data);
  }

  _handleError(data: TranscodeErrorPayload) {
    this.logger.error('Transcode error', data);
    this._isTranscoding = false;
    this._activeJobId = null;
    this.eventBus.publish(EventChannels.TRANSCODE.ERROR, data);
  }

  _handleCancelled(data: TranscodeCancelledPayload) {
    this.logger.info('Transcode cancelled', data);
    this._isTranscoding = false;
    this._activeJobId = null;
    this.eventBus.publish(EventChannels.TRANSCODE.CANCELLED, data);
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
