import path from 'node:path';
import fs from 'node:fs';
import { BaseService, getErrorMessage, type LoggerFactoryLike } from '@platform/core';
import { IPC_CHANNELS } from '@platform/ipc';
import type { IpcPushPublisher, IpcPushPayloadMap, IpcPushArguments } from '@platform/ipc';
import { TRANSCODE_CONFIG, type TranscodeFormat } from './transcode.config.js';
import { getFfmpegPath, getOptionalFfprobePath, validateFfmpegBinaries, type FfmpegEnvironment } from './ffmpeg-path.utils.js';
import { createTempSession, writeTempFile, cleanupSession, cleanupAllSessions } from './transcode-temp.utils.js';
import { TranscodeProcess, probeDuration, type TranscodeProgressData } from './transcode-process.js';

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
  sessionDir: string;
  outputPath: string;
}

/** Owns active conversion processes and their files until a terminal event or shutdown. */
export class TranscodeService extends BaseService {
  private readonly jobs = new Map<string, ActiveJob>();
  private readonly starting = new Set<Promise<{ jobId: string }>>();
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
    return pending.finally(() => this.starting.delete(pending));
  }

  private async startTranscode({ inputBuffer, format, outputFilename, inputArgs = [] }: TranscodeOptions): Promise<{ jobId: string }> {
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
      const process = new TranscodeProcess(inputPath, outputPath, config.ffmpegArgs, durationUs, inputArgs, getFfmpegPath(this.environment));
      this.jobs.set(sessionId, { process, sessionDir, outputPath });
      process.on('progress', (progress: TranscodeProgressData) => {
        this.publish(IPC_CHANNELS.TRANSCODE.PROGRESS, { jobId: sessionId, ...progress });
      });
      process.once('completed', () => {
        this.publish(IPC_CHANNELS.TRANSCODE.COMPLETED, { jobId: sessionId, filePath: outputPath });
        this.cleanupJob(sessionId, false);
      });
      process.once('cancelled', () => {
        this.publish(IPC_CHANNELS.TRANSCODE.CANCELLED, { jobId: sessionId });
        this.cleanupJob(sessionId, true);
      });
      process.once('error', (error: Error) => {
        this.publish(IPC_CHANNELS.TRANSCODE.ERROR, { jobId: sessionId, error: error.message });
        this.logger.error('Transcode failed', { sessionId, error: error.message });
        this.cleanupJob(sessionId, true);
      });
      void process.start().catch((error: unknown) => {
        this.logger.debug('Transcode process rejected', { sessionId, error: getErrorMessage(error) });
        // Covers synchronous startup failures that cannot emit a process event.
        if (this.jobs.has(sessionId)) {
          this.publish(IPC_CHANNELS.TRANSCODE.ERROR, { jobId: sessionId, error: getErrorMessage(error) });
          this.cleanupJob(sessionId, true);
        }
      });
      return { jobId: sessionId };
    } catch (error) {
      cleanupSession(sessionDir, this.logger);
      throw error;
    }
  }

  cancel(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error('Job not found or already completed');
    if (!job.process.isRunning) throw new Error('Job is not running');
    job.process.cancel();
  }

  private cleanupJob(jobId: string, removeOutput: boolean): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    this.jobs.delete(jobId);
    cleanupSession(job.sessionDir, this.logger);
    if (removeOutput) {
      try {
        fs.rmSync(job.outputPath, { force: true });
      } catch (error) {
        this.logger.warn('Failed to remove partial output file', { jobId, path: job.outputPath, error });
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
    const active = new Set([...this.jobs.values()].map((job) => job.process));
    const preparations = await Promise.allSettled([...this.starting]);
    for (const job of this.jobs.values()) active.add(job.process);
    const completed = await Promise.allSettled([...active].map((process) => process.waitForExit()));
    const errors = [...preparations, ...completed]
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason);
    if (errors.length) throw new AggregateError(errors, 'Accepted recordings failed to finish saving');
  }

  override async dispose(): Promise<void> {
    this.disposing = true;
    await Promise.allSettled([...this.starting]);
    await Promise.all([...this.jobs.entries()].map(async ([jobId, job]) => {
      job.process.cancel();
      try { await job.process.waitForExit(); } catch { /* Expected on cancellation. */ }
      this.cleanupJob(jobId, true);
      job.process.removeAllListeners();
    }));
    cleanupAllSessions(this.environment.tempDir, this.logger);
    this._initialized = false;
    await super.dispose();
  }
}
