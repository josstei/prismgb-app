import { app } from 'electron';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { injectable, inject } from 'inversify';
import { BaseService, getErrorMessage, type LoggerFactory } from '@platform/core';
import { IPC_CHANNELS, type TranscodeFormat } from '@platform/ipc';
import { TOKENS } from '@main/application/di/tokens';
import type { IpcPushBridge } from '@main/ipc/ipc-push.bridge';
import { getFfmpegPath, getOptionalFfprobePath } from './ffmpeg-path.utils';
import { TranscodeProcess, probeDuration, type TranscodeProgressData } from './transcode-process';

const FORMATS: Readonly<Record<TranscodeFormat, { extension: string; ffmpegArgs: readonly string[] }>> = {
  webm: {
    extension: 'webm',
    ffmpegArgs: [
      '-c:v', 'libvpx-vp9',
      '-crf', '30',
      '-b:v', '0',
      '-c:a', 'libopus',
      '-b:a', '128k'
    ]
  },
  mp4: {
    extension: 'mp4',
    ffmpegArgs: [
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart'
    ]
  },
  mov: {
    extension: 'mov',
    ffmpegArgs: [
      '-c:v', 'prores_ks',
      '-profile:v', '1',
      '-c:a', 'pcm_s16le'
    ]
  }
};

/** Lets ffmpeg rebuild timestamps and skip corrupt packets of a recording cut short. */
const INTERRUPTED_INPUT_ARGS = ['-fflags', '+genpts', '-err_detect', 'ignore_err'] as const;

const TEMP_ROOT_NAME = 'prismgb-transcode';
const SESSION_DIR_PREFIX = 'prismgb-transcode-';

interface TranscodeRequest {
  inputBuffer: Buffer;
  format: TranscodeFormat;
  outputFilename?: string | undefined;
  interrupted?: boolean | undefined;
}

@injectable()
export class TranscodeService extends BaseService {
  private readonly jobs = new Map<string, { process: TranscodeProcess; sessionDir: string; outputPath: string }>();

  constructor(
    @inject(TOKENS.ipcPushBridge) private readonly ipcPushBridge: IpcPushBridge,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactory
  ) {
    super(loggerFactory, 'TranscodeService');
  }

  initialize(): void {
    this.logger.info('Initializing transcode service');

    try {
      this.logger.info('FFmpeg binaries validated', {
        ffmpegPath: getFfmpegPath(),
        ffprobePath: getOptionalFfprobePath() ?? 'optional-missing'
      });
    } catch (error) {
      // Startup continues without ffmpeg; each later job then fails to spawn and never starts.
      this.logger.error('FFmpeg binary not found', { error: getErrorMessage(error) });
    }

    this.logger.info('TranscodeService initialized');
  }

  /** Starts ffmpeg in the background and resolves the job id; results arrive as TRANSCODE pushes. */
  async transcode({ inputBuffer, format, outputFilename, interrupted = false }: TranscodeRequest): Promise<string> {
    if (!Object.hasOwn(FORMATS, format)) {
      throw new Error(`Unsupported format: ${format}`);
    }
    if (!outputFilename) {
      throw new Error('Output filename is required');
    }
    const { extension, ffmpegArgs } = FORMATS[format];

    const sessionDir = this.createSessionDir();
    const jobId = path.basename(sessionDir);
    this.logger.info('Created transcode session', { sessionId: jobId, format });

    try {
      const inputPath = path.join(sessionDir, 'input.webm');
      await fs.promises.writeFile(inputPath, inputBuffer);

      let durationUs = 0;
      try {
        durationUs = await probeDuration(inputPath);
        this.logger.debug('Probed video duration', { sessionId: jobId, durationUs });
      } catch {
        this.logger.debug('Duration unknown, will show spinner', { sessionId: jobId });
      }

      const outputPath = path.join(app.getPath('downloads'), `${outputFilename}.${extension}`);
      const transcodeProcess = new TranscodeProcess(
        inputPath,
        outputPath,
        ffmpegArgs,
        durationUs,
        interrupted ? INTERRUPTED_INPUT_ARGS : []
      );
      this.jobs.set(jobId, { process: transcodeProcess, sessionDir, outputPath });

      transcodeProcess.on('progress', (progressData: TranscodeProgressData) => {
        this.ipcPushBridge.emit(IPC_CHANNELS.TRANSCODE.PROGRESS, { jobId, ...progressData });
      });

      transcodeProcess.on('completed', () => {
        this.ipcPushBridge.emit(IPC_CHANNELS.TRANSCODE.COMPLETED, { jobId, filePath: outputPath });
        this.logger.info('Transcode completed', { sessionId: jobId, outputPath });
        this.releaseJob(jobId, false);
      });

      transcodeProcess.on('cancelled', () => {
        this.ipcPushBridge.emit(IPC_CHANNELS.TRANSCODE.CANCELLED, { jobId });
        this.logger.info('Transcode cancelled', { sessionId: jobId });
        this.releaseJob(jobId, true);
      });

      transcodeProcess.on('error', (error: Error) => {
        this.ipcPushBridge.emit(IPC_CHANNELS.TRANSCODE.ERROR, { jobId, error: error.message });
        this.logger.error('Transcode failed', { sessionId: jobId, error: error.message });
        this.releaseJob(jobId, true);
      });

      transcodeProcess.start().catch((error: Error) => {
        this.logger.debug('Transcode process rejected', { sessionId: jobId, error: error.message });
      });

      return jobId;
    } catch (error) {
      this.logger.error('Failed to start transcode', { sessionId: jobId, error: getErrorMessage(error) });
      this.removeDir(sessionDir);
      throw error;
    }
  }

  override async dispose(): Promise<void> {
    this.logger.info('Disposing TranscodeService');

    await Promise.all([...this.jobs.entries()].map(async ([jobId, job]) => {
      job.process.cancel();
      try {
        await job.process.waitForExit();
      } catch {
        // A cancelled run rejects; the 'cancelled' handler or releaseJob below owns cleanup.
      }
      this.releaseJob(jobId, true);
      job.process.removeAllListeners();
    }));

    await super.dispose();
    this.sweepTempRoot();
    this.logger.info('TranscodeService disposed');
  }

  private releaseJob(jobId: string, removeOutput: boolean): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }
    this.jobs.delete(jobId);
    this.removeDir(job.sessionDir);

    if (removeOutput && fs.existsSync(job.outputPath)) {
      try {
        fs.unlinkSync(job.outputPath);
      } catch (error) {
        this.logger.warn('Failed to remove partial output file', {
          jobId,
          path: job.outputPath,
          error: getErrorMessage(error)
        });
      }
    }
  }

  private tempRoot(): string {
    return path.join(app.getPath('temp'), TEMP_ROOT_NAME);
  }

  private createSessionDir(): string {
    const sessionDir = path.join(
      this.tempRoot(),
      `${SESSION_DIR_PREFIX}${Date.now()}-${randomBytes(4).toString('hex')}`
    );
    fs.mkdirSync(sessionDir, { recursive: true });
    return sessionDir;
  }

  private removeDir(dir: string): void {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      this.logger.warn('Failed to remove transcode temp dir', { dir, error: getErrorMessage(error) });
    }
  }

  /** Also removes session dirs orphaned by a crash. */
  private sweepTempRoot(): void {
    const root = this.tempRoot();
    try {
      if (!fs.existsSync(root)) {
        return;
      }
      for (const entry of fs.readdirSync(root)) {
        if (entry.startsWith(SESSION_DIR_PREFIX)) {
          this.removeDir(path.join(root, entry));
        }
      }
      if (fs.readdirSync(root).length === 0) {
        fs.rmdirSync(root);
      }
    } catch {
      // Best effort: a locked or vanished temp root is left for the next run.
    }
  }
}
