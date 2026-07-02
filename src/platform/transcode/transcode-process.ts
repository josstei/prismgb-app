/**
 * Transcode Process
 *
 * Wraps child_process.spawn for FFmpeg execution.
 * Provides progress tracking, cancellation support, and error handling.
 */

import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { getFfmpegPath, getOptionalFfprobePath } from './ffmpeg-path.utils.js';
import { TRANSCODE_CONFIG } from './transcode.config.js';
import { DisposableBag } from '@prismgb/core';

/**
 * Progress data emitted during transcode
 */
export interface TranscodeProgressData {
  percent: number;
  timeUs: number;
  elapsedMs?: number;
}

/**
 * Get the duration of a media file using ffprobe
 * @param inputPath - Path to the input file
 * @returns Duration in microseconds
 */
export async function probeDuration(inputPath: string): Promise<number> {
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

const FORCE_KILL_LIFECYCLE = Symbol('transcodeForceKill');

/**
 * FFmpeg Transcode Process
 * Wraps FFmpeg spawn process with progress tracking and cancellation
 */
export class TranscodeProcess extends EventEmitter {
  private _inputPath: string;
  private _outputPath: string;
  private _ffmpegArgs: readonly string[];
  private _durationUs: number;
  private _inputArgs: readonly string[];
  private _process: ChildProcess | null = null;
  private _wasKilled = false;
  private _hasCompleted = false;
  private _startTime: number | null = null;
  private _lastProgressEmit = 0;
  private readonly _disposables = new DisposableBag();
  private _completionPromise: Promise<void> | null = null;

  /**
   * Create a new transcode process
   * @param inputPath - Path to input file
   * @param outputPath - Path to output file
   * @param ffmpegArgs - FFmpeg codec/format arguments
   * @param durationUs - Expected duration in microseconds (for progress)
   * @param inputArgs - Optional input arguments (applied before -i)
   */
  constructor(inputPath: string, outputPath: string, ffmpegArgs: readonly string[], durationUs: number, inputArgs: readonly string[] = []) {
    super();
    this._inputPath = inputPath;
    this._outputPath = outputPath;
    this._ffmpegArgs = [...ffmpegArgs];
    this._durationUs = durationUs;
    this._inputArgs = [...inputArgs];
  }

  /**
   * Start the transcode process
   * @returns Resolves when transcode completes
   */
  start(): Promise<void> {
    this._completionPromise = new Promise((resolve, reject) => {
      if (this._process) {
        reject(new Error('Process already started'));
        return;
      }

      this._startTime = Date.now();

      const ffmpegPath = getFfmpegPath();
      const args = [
        '-y', // Overwrite output file
        ...this._inputArgs,
        '-i', this._inputPath,
        '-progress', 'pipe:1', // Progress output to stdout
        '-nostats', // Don't output stats to stderr (use -progress instead)
        ...this._ffmpegArgs,
        this._outputPath
      ];

      this._process = spawn(ffmpegPath, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stderrBuffer = '';

      // Parse progress from stdout (when using -progress pipe:1)
      this._process.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          this._parseProgressLine(line.trim());
        }
      });

      // Collect stderr for error messages
      this._process.stderr?.on('data', (data) => {
        stderrBuffer += data.toString();
      });

      this._process.on('close', (code, signal) => {
        this._process = null;
        this._disposables.cancel(FORCE_KILL_LIFECYCLE);

        if (this._wasKilled) {
          this.emit('cancelled');
          reject(new Error('Transcode cancelled'));
          return;
        }

        if (code === 0) {
          this._hasCompleted = true;
          this.emit('progress', { percent: 100, timeUs: this._durationUs });
          this.emit('completed', { outputPath: this._outputPath });
          resolve();
        } else {
          const errorMessage = this._extractErrorMessage(stderrBuffer) ||
            `FFmpeg exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`;
          const error = new Error(errorMessage);
          this.emit('error', error);
          reject(error);
        }
      });

      this._process.on('error', (error) => {
        this._process = null;
        this._disposables.cancel(FORCE_KILL_LIFECYCLE);
        this.emit('error', error);
        reject(error);
      });
    });
    return this._completionPromise;
  }

  /**
   * Parse a progress line from ffmpeg output
   * @param line - Line from ffmpeg progress output
   * @private
   */
  private _parseProgressLine(line: string): void {
    if (!line) return;

    // Parse out_time_us=<microseconds>
    if (line.startsWith('out_time_us=')) {
      const timeUs = parseInt(line.substring(12), 10);
      if (!isNaN(timeUs) && this._startTime !== null) {
        const now = Date.now();

        // Throttle progress emissions to avoid IPC spam
        if (now - this._lastProgressEmit < TRANSCODE_CONFIG.progressIntervalMs) {
          return;
        }
        this._lastProgressEmit = now;

        const elapsedMs = now - this._startTime;

        // Calculate percentage if duration is known, otherwise -1
        const percent = this._durationUs > 0
          ? Math.round(Math.min(100, Math.max(0, (timeUs / this._durationUs) * 100)) * 10) / 10
          : -1;

        this.emit('progress', { percent, timeUs, elapsedMs });
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
   * Cancel the transcode process
   */
  cancel(): void {
    if (this._process && !this._wasKilled) {
      this._wasKilled = true;
      // Send SIGTERM first for graceful shutdown
      this._process.kill('SIGTERM');

      // Force kill after timeout
      this._disposables.cancel(FORCE_KILL_LIFECYCLE);
      const forceKillTimeoutId = setTimeout(() => {
        this._disposables.cancel(FORCE_KILL_LIFECYCLE);
        if (this._process) {
          this._process.kill('SIGKILL');
        }
      }, 2000);
      this._disposables.replace(FORCE_KILL_LIFECYCLE, () => clearTimeout(forceKillTimeoutId));
    }
  }

  waitForExit(): Promise<void> {
    return this._completionPromise ?? Promise.resolve();
  }

  /**
   * Check if process is running
   * @returns True if process is running
   */
  get isRunning(): boolean {
    return this._process !== null && !this._wasKilled && !this._hasCompleted;
  }

  /**
   * Check if process was cancelled
   * @returns True if cancelled
   */
  get wasCancelled(): boolean {
    return this._wasKilled;
  }

  /**
   * Check if process completed successfully
   * @returns True if completed
   */
  get hasCompleted(): boolean {
    return this._hasCompleted;
  }
}
