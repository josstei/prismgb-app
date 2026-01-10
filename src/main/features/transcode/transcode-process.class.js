/**
 * Transcode Process
 *
 * Wraps child_process.spawn for FFmpeg execution.
 * Provides progress tracking, cancellation support, and error handling.
 */

import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { getFfmpegPath, getFfprobePath } from './ffmpeg-path.utils.js';
import { TRANSCODE_CONFIG } from '@shared/features/transcode/transcode.config.js';

/**
 * Get the duration of a media file using ffprobe
 * @param {string} inputPath - Path to the input file
 * @returns {Promise<number>} Duration in microseconds
 */
export async function probeDuration(inputPath) {
  return new Promise((resolve, reject) => {
    const ffprobePath = getFfprobePath();
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
 * FFmpeg Transcode Process
 * Wraps FFmpeg spawn process with progress tracking and cancellation
 */
export class TranscodeProcess extends EventEmitter {
  /**
   * Create a new transcode process
   * @param {string} inputPath - Path to input file
   * @param {string} outputPath - Path to output file
   * @param {string[]} ffmpegArgs - FFmpeg codec/format arguments
   * @param {number} durationUs - Expected duration in microseconds (for progress)
   */
  constructor(inputPath, outputPath, ffmpegArgs, durationUs) {
    super();
    this._inputPath = inputPath;
    this._outputPath = outputPath;
    this._ffmpegArgs = ffmpegArgs;
    this._durationUs = durationUs;
    this._process = null;
    this._killed = false;
    this._completed = false;
    this._startTime = null;
  }

  /**
   * Start the transcode process
   * @returns {Promise<void>} Resolves when transcode completes
   */
  start() {
    return new Promise((resolve, reject) => {
      if (this._process) {
        reject(new Error('Process already started'));
        return;
      }

      this._startTime = Date.now();

      const ffmpegPath = getFfmpegPath();
      const args = [
        '-y', // Overwrite output file
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
      this._process.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          this._parseProgressLine(line.trim());
        }
      });

      // Collect stderr for error messages
      this._process.stderr.on('data', (data) => {
        stderrBuffer += data.toString();
      });

      this._process.on('close', (code, signal) => {
        this._process = null;

        if (this._killed) {
          this.emit('cancelled');
          reject(new Error('Transcode cancelled'));
          return;
        }

        if (code === 0) {
          this._completed = true;
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
        this.emit('error', error);
        reject(error);
      });
    });
  }

  /**
   * Parse a progress line from ffmpeg output
   * @param {string} line - Line from ffmpeg progress output
   * @private
   */
  _parseProgressLine(line) {
    if (!line) return;

    // Parse out_time_us=<microseconds>
    if (line.startsWith('out_time_us=')) {
      const timeUs = parseInt(line.substring(12), 10);
      if (!isNaN(timeUs)) {
        const elapsedMs = Date.now() - this._startTime;

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
   * @param {string} stderr - FFmpeg stderr output
   * @returns {string|null} Extracted error message or null
   * @private
   */
  _extractErrorMessage(stderr) {
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
  cancel() {
    if (this._process && !this._killed) {
      this._killed = true;
      // Send SIGTERM first for graceful shutdown
      this._process.kill('SIGTERM');

      // Force kill after timeout
      setTimeout(() => {
        if (this._process) {
          this._process.kill('SIGKILL');
        }
      }, 2000);
    }
  }

  /**
   * Check if process is running
   * @returns {boolean} True if process is running
   */
  get isRunning() {
    return this._process !== null && !this._killed && !this._completed;
  }

  /**
   * Check if process was cancelled
   * @returns {boolean} True if cancelled
   */
  get isCancelled() {
    return this._killed;
  }

  /**
   * Check if process completed successfully
   * @returns {boolean} True if completed
   */
  get isCompleted() {
    return this._completed;
  }
}
