/**
 * Transcode Service
 *
 * Main process service for video transcoding operations.
 * Manages transcode sessions, progress tracking, and cleanup.
 */

import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { BaseService } from '@shared/base/service.base.js';
import { IPC_CHANNELS } from '@shared/ipc/ipc.manifest.js';
import { TRANSCODE_CONFIG, TranscodeState } from '@shared/features/transcode/transcode.config.js';
import { validateFfmpegBinaries } from './ffmpeg-path.utils.js';
import {
  createTempSession,
  writeTempFile,
  cleanupSession,
  cleanupAllSessions,
  SessionInfo
} from './transcode-temp.utils.js';
import { TranscodeProcess, probeDuration, TranscodeProgressData } from './transcode-process.js';

/**
 * Transcode job info
 */
export interface TranscodeJob {
  id: string;
  state: string;
  progress: number;
  outputPath: string | null;
  error: string | null;
  startTime: number;
}

/**
 * Transcode options
 */
export interface TranscodeOptions {
  inputBuffer: Buffer;
  format: string;
  outputFilename: string;
  inputArgs?: string[];
  interrupted?: boolean;
}

/**
 * Transcode result
 */
export interface TranscodeResult {
  success: boolean;
  jobId?: string;
  filePath?: string;
  error?: string;
}

/**
 * Cancel result
 */
export interface CancelResult {
  success: boolean;
  error?: string;
}

/**
 * Status result
 */
export interface StatusResult {
  success: boolean;
  jobs?: TranscodeJob[];
  error?: string;
}

/**
 * Service dependencies
 */
interface TranscodeServiceDependencies {
  windowService: {
    send: (channel: string, data: unknown) => void;
  };
  eventBus: unknown;
  loggerFactory: {
    create: (name: string) => {
      info: (message: string, meta?: Record<string, unknown>) => void;
      debug: (message: string, meta?: Record<string, unknown>) => void;
      warn: (message: string, meta?: Record<string, unknown>) => void;
      error: (message: string, meta?: Record<string, unknown>) => void;
    };
  };
}

type TranscodeFormatKey = keyof typeof TRANSCODE_CONFIG.formats;

function isTranscodeFormat(value: string): value is TranscodeFormatKey {
  return Object.prototype.hasOwnProperty.call(TRANSCODE_CONFIG.formats, value);
}

class TranscodeService extends BaseService {

  private windowService: TranscodeServiceDependencies['windowService'];
  private _jobs: Map<string, TranscodeJob> = new Map();
  private _processes: Map<string, TranscodeProcess> = new Map();
  private _sessions: Map<string, SessionInfo> = new Map();
  private _cleanupTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private _isInitialized = false;

  constructor(dependencies: TranscodeServiceDependencies) {
    super(dependencies, ['windowService', 'eventBus', 'loggerFactory'], 'TranscodeService');
    this.windowService = dependencies.windowService;
  }

  /**
   * Initialize the transcode service
   */
  initialize(): void {
    if (this._isInitialized) {
      this.logger.warn('TranscodeService already initialized');
      return;
    }

    this.logger.info('Initializing transcode service');

    // Validate ffmpeg binaries are available
    try {
      const { ffmpegPath, ffprobePath } = validateFfmpegBinaries();
      this.logger.info('FFmpeg binaries validated', { ffmpegPath, ffprobePath: ffprobePath || 'optional-missing' });
    } catch (error) {
      this.logger.error('FFmpeg binary not found', { error: (error as Error).message });
      // Don't throw - service can still be initialized, but transcode will fail
    }

    this._isInitialized = true;
    this.logger.info('TranscodeService initialized');
  }

  async transcode({ inputBuffer, format, outputFilename, inputArgs }: TranscodeOptions): Promise<TranscodeResult> {
    if (!this._isInitialized) {
      return { success: false, error: 'TranscodeService not initialized' };
    }

    // Validate format
    if (!isTranscodeFormat(format)) {
      return { success: false, error: `Unsupported format: ${format}` };
    }
    const formatConfig = TRANSCODE_CONFIG.formats[format];

    // Validate outputFilename
    if (!outputFilename || typeof outputFilename !== 'string') {
      return { success: false, error: 'Output filename is required' };
    }

    // Create temp session
    const { sessionId, sessionDir } = createTempSession();
    this.logger.info('Created transcode session', { sessionId, format });

    try {
      // Write input buffer to temp file (async to avoid blocking event loop)
      const inputFilename = 'input.webm';
      const inputPath = await writeTempFile(sessionDir, inputFilename, inputBuffer);

      // Get video duration for progress tracking
      let durationUs: number;
      try {
        durationUs = await probeDuration(inputPath);
        this.logger.debug('Probed video duration', { sessionId, durationUs });
      } catch {
        this.logger.debug('Duration unknown, will show spinner', { sessionId });
        durationUs = 0;
      }

      // Determine output path (save directly to Downloads)
      const downloadsDir = app.getPath('downloads');
      const outputPath = path.join(downloadsDir, `${outputFilename}.${formatConfig.extension}`);

      // Create job record
      // Note: outputPath is set early so cleanup can delete partial files on cancel/error
      const job: TranscodeJob = {
        id: sessionId,
        state: TranscodeState.TRANSCODING,
        progress: 0,
        outputPath: outputPath,
        error: null,
        startTime: Date.now()
      };
      this._jobs.set(sessionId, job);
      this._sessions.set(sessionId, { sessionId, sessionDir });

      // Create and start transcode process
      const process = new TranscodeProcess(
        inputPath,
        outputPath,
        formatConfig.ffmpegArgs,
        durationUs,
        Array.isArray(inputArgs) ? inputArgs : []
      );
      this._processes.set(sessionId, process);

      // Set up event handlers
      process.on('progress', (progressData: TranscodeProgressData) => {
        job.progress = progressData.percent;
        this._notifyRenderer(IPC_CHANNELS.TRANSCODE.PROGRESS, {
          jobId: sessionId,
          ...progressData
        });
      });

      process.on('completed', () => {
        job.state = TranscodeState.COMPLETED;
        job.progress = 100;
        // Note: outputPath was set early in job creation for cleanup purposes

        this._notifyRenderer(IPC_CHANNELS.TRANSCODE.COMPLETED, {
          jobId: sessionId,
          filePath: job.outputPath
        });

        this.logger.info('Transcode completed', { sessionId, outputPath: job.outputPath });

        // Cleanup temp files (not the output)
        this._cleanupJob(sessionId);
      });

      process.on('cancelled', () => {
        job.state = TranscodeState.CANCELLED;

        this._notifyRenderer(IPC_CHANNELS.TRANSCODE.CANCELLED, {
          jobId: sessionId
        });

        this.logger.info('Transcode cancelled', { sessionId });

        // Cleanup temp files and partial output
        this._cleanupJob(sessionId, true);
      });

      process.on('error', (error: Error) => {
        job.state = TranscodeState.ERROR;
        job.error = error.message;

        this._notifyRenderer(IPC_CHANNELS.TRANSCODE.ERROR, {
          jobId: sessionId,
          error: error.message
        });

        this.logger.error('Transcode failed', { sessionId, error: error.message });

        // Cleanup temp files and partial output
        this._cleanupJob(sessionId, true);
      });

      // Start the process (non-blocking)
      process.start().catch((error: Error) => {
        // Error already handled via event
        this.logger.debug('Transcode process rejected', { sessionId, error: error.message });
      });

      return { success: true, jobId: sessionId };
    } catch (error) {
      this.logger.error('Failed to start transcode', { sessionId, error: (error as Error).message });

      // Cleanup on error
      cleanupSession(sessionId, sessionDir);
      this._jobs.delete(sessionId);
      this._sessions.delete(sessionId);

      return { success: false, error: (error as Error).message };
    }
  }

  cancel(jobId: string): CancelResult {
    const process = this._processes.get(jobId);
    if (!process) {
      return { success: false, error: 'Job not found or already completed' };
    }

    if (!process.isRunning) {
      return { success: false, error: 'Job is not running' };
    }

    this.logger.info('Cancelling transcode', { jobId });
    process.cancel();

    return { success: true };
  }

  /**
   * Get status of all tracked jobs.
   */
  getStatus(): StatusResult {
    const jobs = Array.from(this._jobs.values());
    return { success: true, jobs };
  }

  private _cleanupJob(jobId: string, removeOutput = false): void {
    // Remove process reference
    this._processes.delete(jobId);

    // Get session info
    const sessionInfo = this._sessions.get(jobId);
    if (sessionInfo) {
      cleanupSession(sessionInfo.sessionId, sessionInfo.sessionDir);
      this._sessions.delete(jobId);
    }

    // Optionally remove output file (for cancelled/failed jobs)
    if (removeOutput) {
      const job = this._jobs.get(jobId);
      if (job?.outputPath && fs.existsSync(job.outputPath)) {
        try {
          fs.unlinkSync(job.outputPath);
        } catch (error) {
          this.logger.warn('Failed to remove partial output file', {
            jobId,
            path: job.outputPath,
            error: (error as Error).message
          });
        }
      }
    }

    // Schedule job record cleanup after TTL (5 minutes)
    // This allows status queries for recently completed jobs while preventing memory leaks
    const timeoutHandle = setTimeout(() => {
      this._cleanupTimeouts.delete(jobId);
      if (this._jobs.has(jobId)) {
        this._jobs.delete(jobId);
        this.logger.debug('Removed stale job record', { jobId });
      }
    }, 5 * 60 * 1000);
    this._cleanupTimeouts.set(jobId, timeoutHandle);
  }

  private _notifyRenderer(channel: string, data: unknown): void {
    try {
      this.windowService?.send(channel, data);
    } catch (error) {
      this.logger.warn('Failed to notify renderer', { channel, error: (error as Error).message });
    }
  }

  /**
   * Dispose service resources
   */
  dispose(): void {
    this.logger.info('Disposing TranscodeService');

    // Cancel any running processes
    for (const process of this._processes.values()) {
      if (process.isRunning) {
        process.cancel();
      }
    }

    // Clear all cleanup timeouts to prevent memory leaks
    for (const timeoutHandle of this._cleanupTimeouts.values()) {
      clearTimeout(timeoutHandle);
    }
    this._cleanupTimeouts.clear();

    // Clean up all temp sessions
    cleanupAllSessions();

    // Clear all maps
    this._jobs.clear();
    this._processes.clear();
    this._sessions.clear();

    this._isInitialized = false;
    this.logger.info('TranscodeService disposed');
  }
}

export { TranscodeService };
