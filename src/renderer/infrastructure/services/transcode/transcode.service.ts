import { injectable, inject } from 'inversify';
import { BaseService } from '@platform/core';
import { EventChannels } from '@platform/events';
import { createTrpcEventBridge } from '@renderer/infrastructure/services/platform/trpc-event-bridge.factory';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import { callIpc, type CallIpcResult } from '@renderer/infrastructure/ipc/call-ipc.js';
import type { LoggerFactoryLike } from '@platform/core';
import { TOKENS } from '@renderer/application/di/tokens.js';
import type {
  TranscodeCancelledPayload,
  TranscodeCompletedPayload,
  TranscodeErrorPayload,
  TranscodeFormat,
  TranscodeProgressPayload,
  TranscodeStartOptions,
  TranscodeStartPayload
} from '@platform/ipc';

const TRANSCODE_SUBSCRIPTION_LIFECYCLE = Symbol('transcodeSubscriptionLifecycle');

interface TranscodeEventBus {
  publish(event: string, payload?: unknown): void;
}

@injectable()
class TranscodeService extends BaseService {
  private _isTranscoding: boolean;
  private _activeJobId: string | null;

  constructor(
    @inject(TOKENS.eventBus) private readonly eventBus: TranscodeEventBus,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactoryLike
  ) {
    super({ loggerFactory, eventBus }, 'TranscodeService');

    this._isTranscoding = false;
    this._activeJobId = null;
  }

  protected override onInitialize(): void {
    this.logger.info('Initializing TranscodeService');

    this.disposables.replace(TRANSCODE_SUBSCRIPTION_LIFECYCLE, createTrpcEventBridge('TranscodeService', [
      () => trpcClient.transcode.onProgress.subscribe(undefined, { onData: (data) => this._handleProgress(data) }),
      () => trpcClient.transcode.onCompleted.subscribe(undefined, { onData: (data) => this._handleCompleted(data) }),
      () => trpcClient.transcode.onError.subscribe(undefined, { onData: (data) => this._handleError(data) }),
      () => trpcClient.transcode.onCancelled.subscribe(undefined, { onData: (data) => this._handleCancelled(data) })
    ], this.logger));

    this.logger.info('TranscodeService initialized');
  }

  async transcode(
    blob: Blob,
    format: TranscodeFormat,
    outputBaseName?: string,
    options: TranscodeStartOptions = {}
  ): Promise<CallIpcResult<TranscodeStartPayload>> {
    if (this._isTranscoding) {
      this.logger.warn('Transcoding already in progress');
      return { status: 'error', error: 'Transcoding already in progress' };
    }

    this.logger.info(`Starting transcode to ${format}`);

    const result = await callIpc('transcode.start', async () => {
      const arrayBuffer = await blob.arrayBuffer();
      return trpcClient.transcode.start.mutate({
        inputBuffer: arrayBuffer,
        format,
        outputFilename: outputBaseName,
        inputArgs: Array.isArray(options.inputArgs) ? options.inputArgs : undefined,
        interrupted: Boolean(options.interrupted)
      });
    }, this.logger);

    if (result.status === 'ok' && result.value.jobId) {
      this._isTranscoding = true;
      this._activeJobId = result.value.jobId;
      this.logger.info('Transcode started', { jobId: result.value.jobId, format });
      this.eventBus.publish(EventChannels.TRANSCODE.STARTED, { jobId: result.value.jobId, format });
    }

    return result;
  }

  async cancel(): Promise<CallIpcResult<void>> {
    if (!this._isTranscoding || !this._activeJobId) {
      this.logger.warn('No transcoding in progress to cancel');
      return { status: 'error', error: 'No transcoding in progress' };
    }

    this.logger.info('Cancelling transcode', { jobId: this._activeJobId });
    const jobId = this._activeJobId;
    return callIpc('transcode.cancel', () => trpcClient.transcode.cancel.mutate({ jobId }), this.logger);
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
