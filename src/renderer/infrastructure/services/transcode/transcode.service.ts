import { injectable, inject } from 'inversify';
import { BaseService } from '@platform/core';
import { EventChannels } from '@renderer/lib/events/event-channels';
import type { EventBus } from '@renderer/lib/events/event-bus';
import { createTrpcEventBridge } from '@renderer/infrastructure/services/platform/trpc-event-bridge.factory';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import { callIpc, type CallIpcResult } from '@renderer/infrastructure/ipc/call-ipc';
import type { LoggerFactory } from '@platform/core';
import { TOKENS } from '@renderer/application/di/tokens';
import type {
  TranscodeCancelledPayload,
  TranscodeCompletedPayload,
  TranscodeErrorPayload,
  TranscodeFormat,
  TranscodeStartPayload
} from '@platform/ipc';

const TRANSCODE_SUBSCRIPTION_LIFECYCLE = Symbol('transcodeSubscriptionLifecycle');

type TranscodeEndChannel =
  | typeof EventChannels.TRANSCODE.COMPLETED
  | typeof EventChannels.TRANSCODE.ERROR
  | typeof EventChannels.TRANSCODE.CANCELLED;

@injectable()
class TranscodeService extends BaseService {
  private activeJobId: string | null = null;
  private initialized = false;

  constructor(
    @inject(TOKENS.eventBus) private readonly eventBus: EventBus,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactory
  ) {
    super(loggerFactory, 'TranscodeService');
  }

  initialize(): void {
    if (this.initialized) {
      this.logger.warn('TranscodeService already initialized');
      return;
    }

    this.logger.info('Initializing TranscodeService');

    this.disposables.replace(TRANSCODE_SUBSCRIPTION_LIFECYCLE, createTrpcEventBridge('TranscodeService', [
      () => trpcClient.transcode.onProgress.subscribe(undefined, {
        onData: (data) => this.eventBus.publish(EventChannels.TRANSCODE.PROGRESS, data)
      }),
      () => trpcClient.transcode.onCompleted.subscribe(undefined, {
        onData: (data) => {
          this.logger.info('Transcode completed', data);
          this.endJob(EventChannels.TRANSCODE.COMPLETED, data);
        }
      }),
      () => trpcClient.transcode.onError.subscribe(undefined, {
        onData: (data) => {
          this.logger.error('Transcode error', data);
          this.endJob(EventChannels.TRANSCODE.ERROR, data);
        }
      }),
      () => trpcClient.transcode.onCancelled.subscribe(undefined, {
        onData: (data) => {
          this.logger.info('Transcode cancelled', data);
          this.endJob(EventChannels.TRANSCODE.CANCELLED, data);
        }
      })
    ], this.logger));

    this.logger.info('TranscodeService initialized');
    this.initialized = true;
  }

  async transcode(
    blob: Blob,
    format: TranscodeFormat,
    outputBaseName?: string,
    options: { interrupted?: boolean } = {}
  ): Promise<CallIpcResult<TranscodeStartPayload>> {
    if (this.isTranscoding()) {
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
        interrupted: Boolean(options.interrupted)
      });
    }, this.logger);

    if (result.status === 'ok') {
      this.activeJobId = result.value.jobId;
      this.logger.info('Transcode started', { jobId: result.value.jobId, format });
      this.eventBus.publish(EventChannels.TRANSCODE.STARTED, { jobId: result.value.jobId, format });
    }

    return result;
  }

  isTranscoding(): boolean {
    return this.activeJobId !== null;
  }

  isAvailable(): boolean {
    return true;
  }

  private endJob(
    channel: TranscodeEndChannel,
    data: TranscodeCompletedPayload | TranscodeErrorPayload | TranscodeCancelledPayload
  ): void {
    this.activeJobId = null;
    this.eventBus.publish(channel, data);
  }

  override dispose(): Promise<void> {
    this.activeJobId = null;
    this.initialized = false;
    this.logger.info('TranscodeService disposed');
    return super.dispose();
  }
}

export { TranscodeService };
