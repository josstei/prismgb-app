
import { BaseService } from '@platform/core';
import { EventChannels, type EventPayloadMap } from '@platform/events';
import { createTrpcEventBridge } from '@renderer/infrastructure/services/platform/trpc-event-bridge.factory';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import { callIpc, type CallIpcResult } from '@renderer/infrastructure/ipc/call-ipc.js';
import type { EventPublisherLike, LoggerFactoryLike } from '@platform/core';

import type {
  TranscodeFormat,
  TranscodeStartOptions,
  TranscodeStartPayload
} from '@platform/ipc';

const TRANSCODE_SUBSCRIPTION_LIFECYCLE = Symbol('transcodeSubscriptionLifecycle');
type TranscodePushChannel = typeof EventChannels.TRANSCODE.PROGRESS | typeof EventChannels.TRANSCODE.COMPLETED
  | typeof EventChannels.TRANSCODE.ERROR | typeof EventChannels.TRANSCODE.CANCELLED;
type TranscodeJob = { jobId: string | null; notifications: Array<() => void> };

type TranscodeServiceDependencies = {
  eventBus: EventPublisherLike;
  loggerFactory: LoggerFactoryLike;
};

class TranscodeService extends BaseService {
  private job: TranscodeJob | null = null;

  private readonly eventBus: EventPublisherLike;

  constructor({ eventBus, loggerFactory }: TranscodeServiceDependencies) {
    super({ loggerFactory }, 'TranscodeService');
    this.eventBus = eventBus;

  }

  protected override onInitialize(): void {
    this.logger.info('Initializing TranscodeService');

    this.disposables.replace(TRANSCODE_SUBSCRIPTION_LIFECYCLE, createTrpcEventBridge('TranscodeService', [
      () => trpcClient.transcode.onProgress.subscribe(undefined, { onData: (data) => this.handleEvent(EventChannels.TRANSCODE.PROGRESS, data) }),
      () => trpcClient.transcode.onCompleted.subscribe(undefined, { onData: (data) => this.handleEvent(EventChannels.TRANSCODE.COMPLETED, data) }),
      () => trpcClient.transcode.onError.subscribe(undefined, { onData: (data) => this.handleEvent(EventChannels.TRANSCODE.ERROR, data) }),
      () => trpcClient.transcode.onCancelled.subscribe(undefined, { onData: (data) => this.handleEvent(EventChannels.TRANSCODE.CANCELLED, data) })
    ], this.logger));

    this.logger.info('TranscodeService initialized');
  }

  async transcode(
    blob: Blob,
    format: TranscodeFormat,
    outputBaseName?: string,
    options: TranscodeStartOptions = {}
  ): Promise<CallIpcResult<TranscodeStartPayload>> {
    if (this.job) {
      this.logger.warn('Transcoding already in progress');
      return { status: 'error', error: 'Transcoding already in progress' };
    }

    const job: TranscodeJob = { jobId: null, notifications: [] };
    this.job = job;
    this.logger.info(`Starting transcode to ${format}`);

    const result = await callIpc('transcode.start', async () => {
      const arrayBuffer = await blob.arrayBuffer();
      if (this.job !== job) throw new Error('Transcode startup cancelled');
      return trpcClient.transcode.start.mutate({
        inputBuffer: arrayBuffer,
        format,
        outputFilename: outputBaseName,
        inputArgs: options.inputArgs
      });
    }, this.logger);

    if (this.job !== job) return result;
    if (result.status === 'ok' && result.value.jobId) {
      job.jobId = result.value.jobId;
      this.logger.info('Transcode started', { jobId: result.value.jobId, format });
      this.eventBus.publish(EventChannels.TRANSCODE.STARTED, { jobId: result.value.jobId, format });
      for (const notify of job.notifications.splice(0)) notify();
    } else {
      this.job = null;
    }

    return result;
  }

  async cancel(): Promise<CallIpcResult<void>> {
    if (!this.job?.jobId) {
      this.logger.warn('No transcoding in progress to cancel');
      return { status: 'error', error: 'No transcoding in progress' };
    }

    this.logger.info('Cancelling transcode', { jobId: this.job.jobId });
    const jobId = this.job.jobId;
    return callIpc('transcode.cancel', () => trpcClient.transcode.cancel.mutate({ jobId }), this.logger);
  }

  isTranscoding(): boolean {
    return this.job !== null;
  }

  private handleEvent<TChannel extends TranscodePushChannel>(channel: TChannel, data: EventPayloadMap[TChannel]): void {
    const job = this.job;
    if (!job) return;
    if (job.jobId === null) {
      // Main may finish before the start mutation replies. Replay only this job's
      // notifications after STARTED so completion cannot resurrect a busy UI.
      job.notifications.push(() => { if (this.job === job) this.handleEvent(channel, data); });
      return;
    }
    if (data.jobId !== job.jobId) return;
    if (channel !== EventChannels.TRANSCODE.PROGRESS) {
      this.job = null;
      if (channel === EventChannels.TRANSCODE.ERROR) this.logger.error('Transcode error', data);
      else this.logger.info(channel === EventChannels.TRANSCODE.COMPLETED ? 'Transcode completed' : 'Transcode cancelled', data);
    }
    this.eventBus.publish(channel, data);
  }

  override dispose(): void | Promise<void> {
    this.job = null;
    this.logger.info('TranscodeService disposed');
    return super.dispose();
  }
}

export { TranscodeService };
