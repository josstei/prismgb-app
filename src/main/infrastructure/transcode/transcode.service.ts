/**
 * Transcode Service
 *
 * Main process service for video transcoding operations.
 * Manages transcode sessions, progress tracking, and cleanup.
 */

import { spawn, ChildProcess } from 'node:child_process';
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { BaseService } from '@prismgb/core';
import { channels as IPC_CHANNELS } from '@prismgb/ipc';
import { TRANSCODE_CONFIG, TranscodeState } from '@main/infrastructure/transcode/config/transcode.config';
import { validateFfmpegBinaries, getFfmpegPath, getOptionalFfprobePath } from './ffmpeg-path.utils.js';
import {
  createTempSession,
  writeTempFile,
  cleanupSession,
  cleanupAllSessions,
  SessionInfo
} from './transcode-temp.utils.js';

/**
 * Progress data emitted during transcode
 */
export interface TranscodeProgressData {
  percent: number;
  timeUs: number;
  elapsedMs?: number;
}

/**
 * Completed event data
 */
export interface TranscodeCompletedData {
  outputPath: string;
}

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
 * Process state for active transcode jobs
 */
interface ProcessState {
  process: ChildProcess;
  inputPath: string;
  outputPath: string;
  durationUs: number;
  wasKilled: boolean;
  hasCompleted: boolean;
  startTime: number;
  lastProgressEmit: number;
  forceKillTimeoutId: NodeJS.Timeout | null;
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
  job?: TranscodeJob;
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

class TranscodeService extends BaseService {

  private windowService: TranscodeServiceDependencies['windowService'];
  private _jobs: Map<string, TranscodeJob> = new Map();
  private _processStates: Map<string, ProcessState> = new Map();
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

    // Register cleanup on app quit
    app.on('before-quit', () => {
      this._cleanupOnQuit();
    });

    this._isInitialized = true;
    this.logger.info('TranscodeService initialized');
  }

  /**
   * Get the duration of a media file using ffprobe
   * @param inputPath - Path to the input file
   * @returns Duration in microseconds
   * @private
   */
  private async _probeDuration(inputPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const ffprobePath = getOptionalFfprobePath();
      if (!ffprobePath) {
        resolve(0);
        return;
      }
      const args = [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        inputPath
      ];

      const proc = spawn(ffprobePath, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error('FFprobe timed out'));
      }, TRANSCODE_CONFIG.probeDurationTimeoutMs);

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          const duration = parseFloat(stdout.trim());
          if (isNaN(duration)) {
            reject(new Error(`Invalid duration from ffprobe: ${stdout}`));
          } else {
            // Convert seconds to microseconds
            resolve(Math.floor(duration * 1_000_000));
          }
        } else {
          reject(new Error(`FFprobe failed with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Start a transcode operation
   * @param options - Transcode options
   * @returns Transcode result
   */
  async transcode({ inputBuffer, format, outputFilename, inputArgs }: TranscodeOptions): Promise<TranscodeResult> {
    if (!this._isInitialized) {
      return { success: false, error: 'TranscodeService not initialized' };
    }

    // Validate format
    const formatConfig = TRANSCODE_CONFIG.formats[format];
    if (!formatConfig) {
      return { success: false, error: `Unsupported format: ${format}` };
    }

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
        durationUs = await this._probeDuration(inputPath);
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

      // Start transcode process
      this._startProcess(sessionId, inputPath, outputPath, formatConfig.ffmpegArgs, durationUs, Array.isArray(inputArgs) ? inputArgs : [])
        .catch((error: Error) => {
          // Error already handled by process handlers
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

  /**
   * Start FFmpeg transcode process
   * @param jobId - Job ID
   * @param inputPath - Input file path
   * @param outputPath - Output file path
   * @param ffmpegArgs - FFmpeg arguments
   * @param durationUs - Duration in microseconds
   * @param inputArgs - Input arguments
   * @returns Promise that resolves when transcode completes
   * @private
   */
  private _startProcess(
    jobId: string,
    inputPath: string,
    outputPath: string,
    ffmpegArgs: string[],
    durationUs: number,
    inputArgs: string[]
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const job = this._jobs.get(jobId);
      if (!job) {
        reject(new Error('Job not found'));
        return;
      }

      const ffmpegPath = getFfmpegPath();
      const args = [
        '-y', // Overwrite output file
        ...inputArgs,
        '-i', inputPath,
        '-progress', 'pipe:1', // Progress output to stdout
        '-nostats', // Don't output stats to stderr (use -progress instead)
        ...ffmpegArgs,
        outputPath
      ];

      const process = spawn(ffmpegPath, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Store process state
      const processState: ProcessState = {
        process,
        inputPath,
        outputPath,
        durationUs,
        wasKilled: false,
        hasCompleted: false,
        startTime: Date.now(),
        lastProgressEmit: 0,
        forceKillTimeoutId: null
      };
      this._processStates.set(jobId, processState);

      let stderrBuffer = '';

      // Parse progress from stdout (when using -progress pipe:1)
      process.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          this._parseProgressLine(jobId, line.trim());
        }
      });

      // Collect stderr for error messages
      process.stderr?.on('data', (data) => {
        stderrBuffer += data.toString();
      });

      process.on('close', (code, signal) => {
        const state = this._processStates.get(jobId);
        if (!state) return;

        if (state.forceKillTimeoutId) {
          clearTimeout(state.forceKillTimeoutId);
          state.forceKillTimeoutId = null;
        }

        this._processStates.delete(jobId);

        if (state.wasKilled) {
          job.state = TranscodeState.CANCELLED;
          this._notifyRenderer(IPC_CHANNELS.TRANSCODE.CANCELLED, { jobId });
          this.logger.info('Transcode cancelled', { jobId });
          this._cleanupJob(jobId, true);
          reject(new Error('Transcode cancelled'));
          return;
        }

        if (code === 0) {
          state.hasCompleted = true;
          job.state = TranscodeState.COMPLETED;
          job.progress = 100;

          this._notifyRenderer(IPC_CHANNELS.TRANSCODE.PROGRESS, {
            jobId,
            percent: 100,
            timeUs: state.durationUs
          });
          this._notifyRenderer(IPC_CHANNELS.TRANSCODE.COMPLETED, {
            jobId,
            filePath: job.outputPath
          });

          this.logger.info('Transcode completed', { jobId, outputPath: job.outputPath });
          this._cleanupJob(jobId);
          resolve();
        } else {
          const errorMessage = this._extractErrorMessage(stderrBuffer) ||
            `FFmpeg exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`;
          const error = new Error(errorMessage);

          job.state = TranscodeState.ERROR;
          job.error = errorMessage;

          this._notifyRenderer(IPC_CHANNELS.TRANSCODE.ERROR, {
            jobId,
            error: errorMessage
          });

          this.logger.error('Transcode failed', { jobId, error: errorMessage });
          this._cleanupJob(jobId, true);
          reject(error);
        }
      });

      process.on('error', (error) => {
        const state = this._processStates.get(jobId);
        if (state?.forceKillTimeoutId) {
          clearTimeout(state.forceKillTimeoutId);
          state.forceKillTimeoutId = null;
        }

        this._processStates.delete(jobId);

        job.state = TranscodeState.ERROR;
        job.error = error.message;

        this._notifyRenderer(IPC_CHANNELS.TRANSCODE.ERROR, {
          jobId,
          error: error.message
        });

        this.logger.error('Transcode process error', { jobId, error: error.message });
        this._cleanupJob(jobId, true);
        reject(error);
      });
    });
  }

  /**
   * Parse a progress line from ffmpeg output
   * @param jobId - Job ID
   * @param line - Line from ffmpeg progress output
   * @private
   */
  private _parseProgressLine(jobId: string, line: string): void {
    if (!line) return;

    const job = this._jobs.get(jobId);
    const state = this._processStates.get(jobId);
    if (!job || !state) return;

    // Parse out_time_us=<microseconds>
    if (line.startsWith('out_time_us=')) {
      const timeUs = parseInt(line.substring(12), 10);
      if (!isNaN(timeUs)) {
        const now = Date.now();

        // Throttle progress emissions to avoid IPC spam
        if (now - state.lastProgressEmit < TRANSCODE_CONFIG.progressIntervalMs) {
          return;
        }
        state.lastProgressEmit = now;

        const elapsedMs = now - state.startTime;

        // Calculate percentage if duration is known, otherwise -1
        const percent = state.durationUs > 0
          ? Math.round(Math.min(100, Math.max(0, (timeUs / state.durationUs) * 100)) * 10) / 10
          : -1;

        job.progress = percent;
        this._notifyRenderer(IPC_CHANNELS.TRANSCODE.PROGRESS, {
          jobId,
          percent,
          timeUs,
          elapsedMs
        });
      }
    }
  }

  /**
   * Extract a meaningful error message from ffmpeg stderr
   * @param stderr - FFmpeg stderr output
   * @returns Extracted error message or null
   * @private
   */
  private _extractErrorMessage(stderr: string): string | null {
    if (!stderr) return null;

    // Look for common error patterns
    const lines = stderr.split('\n');
    for (const line of lines) {
      // FFmpeg typically outputs errors after "Error" or with specific patterns
      if (line.includes('Error') || line.includes('error:')) {
        return line.trim();
      }
      if (line.includes('Invalid') || line.includes('Cannot') || line.includes('No such')) {
        return line.trim();
      }
    }

    // Return last non-empty line as fallback
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line && !line.startsWith('frame=') && !line.startsWith('size=')) {
        return line;
      }
    }

    return null;
  }

  /**
   * Cancel a transcode operation
   * @param jobId - Job ID to cancel
   * @returns Cancel result
   */
  cancel(jobId: string): CancelResult {
    const state = this._processStates.get(jobId);
    if (!state) {
      return { success: false, error: 'Job not found or already completed' };
    }

    if (state.wasKilled || state.hasCompleted) {
      return { success: false, error: 'Job is not running' };
    }

    this.logger.info('Cancelling transcode', { jobId });

    state.wasKilled = true;
    // Send SIGTERM first for graceful shutdown
    state.process.kill('SIGTERM');

    // Force kill after timeout
    if (state.forceKillTimeoutId) {
      clearTimeout(state.forceKillTimeoutId);
    }
    state.forceKillTimeoutId = setTimeout(() => {
      if (state.process) {
        state.process.kill('SIGKILL');
      }
      state.forceKillTimeoutId = null;
    }, 2000);

    return { success: true };
  }

  /**
   * Get status of a specific job or all jobs
   * @param jobId - Optional job ID
   * @returns Status result
   */
  getStatus(jobId?: string): StatusResult {
    if (jobId) {
      const job = this._jobs.get(jobId);
      if (!job) {
        return { success: false, error: 'Job not found' };
      }
      return { success: true, job };
    }

    // Return all jobs
    const jobs = Array.from(this._jobs.values());
    return { success: true, jobs };
  }

  /**
   * Clean up a job's resources
   * @param jobId - Job ID
   * @param removeOutput - Also remove output file
   * @private
   */
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

  /**
   * Cleanup on app quit
   * @private
   */
  private _cleanupOnQuit(): void {
    this.logger.info('Cleaning up transcode resources on quit');

    // Cancel all running processes - process.cancel() is synchronous (sends SIGTERM),
    // so signals are sent in quick succession without blocking
    for (const [jobId, process] of this._processes) {
      if (process.isRunning) {
        this.logger.info('Cancelling running transcode on quit', { jobId });
        process.cancel();
      }
    }

    // Clean up all temp sessions
    cleanupAllSessions();
  }

  /**
   * Notify renderer process
   * @param channel - IPC channel
   * @param data - Data to send
   * @private
   */
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
