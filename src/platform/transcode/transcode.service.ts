import path from 'node:path';
import fs from 'node:fs';
import { BaseService, getErrorMessage, type LoggerFactoryLike } from '@platform/core';
import { IPC_CHANNELS } from '@platform/ipc';
import type { IpcPushPublisher, IpcPushPayloadMap, IpcPushArguments } from '@platform/ipc';
import { TRANSCODE_CONFIG, type TranscodeFormat } from './transcode.config.js';
import { getFfmpegPath, getOptionalFfprobePath, validateFfmpegBinaries, type FfmpegEnvironment } from './ffmpeg-path.utils.js';
import { createTempSession, writeTempFile, cleanupSession } from './transcode-temp.utils.js';
import { TranscodeProcess, probeDuration } from './transcode-process.js';

interface TranscodeOptions {
  inputBuffer: Buffer;
  format: TranscodeFormat;
  outputFilename: string;
  inputArgs?: string[];
}

interface TranscodeEnvironment extends FfmpegEnvironment {
  downloadsDir: string;
  tempDir: string;
}

interface TranscodeServiceDependencies {
  pushPublisher: IpcPushPublisher;
  loggerFactory: LoggerFactoryLike;
  environment: TranscodeEnvironment;
}

interface ActiveJob {
  process: TranscodeProcess;
  completion: Promise<void>;
}
interface AcceptedJob {
  jobId: string;
  completion: Promise<void>;
}

/** Owns active conversion processes and their files until a terminal event or shutdown. */
export class TranscodeService extends BaseService {
  private readonly jobs = new Map<string, ActiveJob>();
  private readonly starting = new Set<Promise<AcceptedJob>>();
  private disposing = false;
  private draining = false;
  private readonly pushPublisher: IpcPushPublisher;
  private readonly environment: TranscodeEnvironment;

  constructor({ pushPublisher, loggerFactory, environment }: TranscodeServiceDependencies) {
    super({ loggerFactory }, 'TranscodeService');
    this.pushPublisher = pushPublisher;
    this.environment = environment;
  }

  protected override onInitialize(): void {
    this.disposing = false;
    this.draining = false;
    try {
      this.logger.info('FFmpeg binaries validated', validateFfmpegBinaries(this.environment));
    } catch (error) {
      // Startup remains usable when conversion binaries are unavailable.
      this.logger.error('FFmpeg binary not found', { error: getErrorMessage(error) });
    }
  }

  transcode(options: TranscodeOptions): Promise<{ jobId: string }> {
    const pending = this.startTranscode(options);
    this.starting.add(pending);
    return pending.then(({ jobId }) => ({ jobId })).finally(() => this.starting.delete(pending));
  }

  private async startTranscode({ inputBuffer, format, outputFilename, inputArgs = [] }: TranscodeOptions): Promise<AcceptedJob> {
    if (!this._initialized || this.disposing || this.draining) throw new Error('TranscodeService not initialized');
    if (!Object.hasOwn(TRANSCODE_CONFIG.formats, format)) throw new Error(`Unsupported format: ${format}`);
    if (!outputFilename || typeof outputFilename !== 'string') throw new Error('Output filename is required');

    const { sessionId, sessionDir } = createTempSession(this.environment.tempDir);
    try {
      const inputPath = await writeTempFile(sessionDir, 'input.webm', inputBuffer);
      let durationUs = 0;
      try {
        durationUs = await probeDuration(inputPath, getOptionalFfprobePath(this.environment));
      } catch {
        this.logger.debug('Duration unknown, will show spinner', { sessionId });
      }
      if (this.disposing) throw new Error('TranscodeService not initialized');

      const config = TRANSCODE_CONFIG.formats[format];
      const outputPath = path.join(this.environment.downloadsDir, `${outputFilename}.${config.extension}`);
      // Keep the existing recording intact until replacement succeeds. This file
      // shares the destination filesystem so promotion is an atomic rename.
      const stagingPath = path.join(this.environment.downloadsDir, `.${sessionId}.${config.extension}`);
      const process = new TranscodeProcess(inputPath, stagingPath, config.ffmpegArgs, durationUs, inputArgs, getFfmpegPath(this.environment));
      const completion = Promise.resolve().then(() => this.finishJob(sessionId, process, sessionDir, stagingPath, outputPath));
      this.jobs.set(sessionId, { process, completion });
      // Drain observes failures; conversion errors are also delivered immediately
      // through their correlated push without causing an unhandled rejection.
      void completion.catch(() => {});
      return { jobId: sessionId, completion };
    } catch (error) {
      cleanupSession(sessionDir, this.logger);
      throw error;
    }
  }

  cancel(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error('Job not found or already completed');
    if (!job.process.cancel()) throw new Error('Job is not running');
  }

  private async finishJob(jobId: string, process: TranscodeProcess, sessionDir: string, stagingPath: string, outputPath: string): Promise<void> {
    try {
      const outcome = await process.start((progress) => this.publish(IPC_CHANNELS.TRANSCODE.PROGRESS, { jobId, ...progress }));
      if (outcome === 'cancelled') {
        this.publish(IPC_CHANNELS.TRANSCODE.CANCELLED, { jobId });
      } else {
        fs.renameSync(stagingPath, outputPath);
        this.publish(IPC_CHANNELS.TRANSCODE.COMPLETED, { jobId, filePath: outputPath });
      }
    } catch (error) {
      const message = getErrorMessage(error);
      this.publish(IPC_CHANNELS.TRANSCODE.ERROR, { jobId, error: message });
      this.logger.error('Transcode failed', { jobId, error: message });
      throw error;
    } finally {
      this.jobs.delete(jobId);
      cleanupSession(sessionDir, this.logger);
      try {
        fs.rmSync(stagingPath, { force: true });
      } catch (error) {
        this.logger.warn('Failed to remove partial output file', { jobId, path: stagingPath, error });
      }
    }
  }

  private publish<K extends keyof IpcPushPayloadMap>(...args: IpcPushArguments<K>): void {
    try {
      this.pushPublisher.emit<K>(...args);
    } catch (error) {
      this.logger.warn('Failed to notify renderer', { channel: args[0], error });
    }
  }

  /** Stop accepting work and let accepted recordings finish before normal application exit. */
  async drain(): Promise<void> {
    this.draining = true;
    const active = new Set([...this.jobs.values()].map((job) => job.completion));
    const preparations = await Promise.allSettled([...this.starting]);
    for (const preparation of preparations) {
      if (preparation.status === 'fulfilled') active.add(preparation.value.completion);
    }
    const completed = await Promise.allSettled([...active]);
    const errors = [...preparations, ...completed]
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason);
    if (errors.length) throw new AggregateError(errors, 'Accepted recordings failed to finish saving');
  }

  override async dispose(): Promise<void> {
    this.disposing = true;
    await Promise.allSettled([...this.starting]);
    await Promise.all([...this.jobs.values()].map(async (job) => {
      job.process.cancel();
      try { await job.completion; } catch { /* Failure was already published and cleaned up. */ }
    }));
    await super.dispose();
  }
}
