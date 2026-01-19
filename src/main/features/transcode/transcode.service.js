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
import { channels as IPC_CHANNELS } from '@shared/ipc/channels.config.js';
import { TRANSCODE_CONFIG, TranscodeState } from '@shared/features/transcode/transcode.config.js';
import { validateFfmpegBinaries } from './ffmpeg-path.utils.js';
import {
  createTempSession,
  writeTempFile,
  cleanupSession,
  cleanupAllSessions
} from './transcode-temp.utils.js';
import { TranscodeProcess, probeDuration } from './transcode-process.class.js';

/**
 * Transcode job info
 * @typedef {Object} TranscodeJob
 * @property {string} id - Job ID (same as session ID)
 * @property {string} state - Current state
 * @property {number} progress - Progress percentage (0-100)
 * @property {string|null} outputPath - Output file path (when completed)
 * @property {string|null} error - Error message (when failed)
 * @property {number} startTime - Start timestamp
 */

class TranscodeService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['windowService', 'eventBus', 'loggerFactory'], 'TranscodeService');

    /** @type {Map<string, TranscodeJob>} */
    this._jobs = new Map();

    /** @type {Map<string, TranscodeProcess>} */
    this._processes = new Map();

    /** @type {Map<string, { sessionId: string, sessionDir: string }>} */
    this._sessions = new Map();

    /** @type {Map<string, NodeJS.Timeout>} Track job cleanup timeouts */
    this._cleanupTimeouts = new Map();

    this._isInitialized = false;
  }

  /**
   * Initialize the transcode service
   */
  initialize() {
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
      this.logger.error('FFmpeg binary not found', { error: error.message });
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
   * Start a transcode operation
   * @param {Object} options - Transcode options
   * @param {Buffer} options.inputBuffer - Input video buffer (WebM)
   * @param {string} options.format - Output format (webm, mp4, mov)
   * @param {string} options.outputFilename - Output filename (without extension)
   * @param {string[]} [options.inputArgs] - FFmpeg input args (applied before -i)
   * @param {boolean} [options.interrupted] - Recording stopped due to stream interruption
  * @returns {Promise<{ success: boolean, jobId?: string, filePath?: string, error?: string }>}
   */
  async transcode({ inputBuffer, format, outputFilename, inputArgs }) {
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
      let durationUs;
      try {
        durationUs = await probeDuration(inputPath);
        this.logger.debug('Probed video duration', { sessionId, durationUs });
      } catch (error) {
        this.logger.debug('Duration unknown, will show spinner', { sessionId });
        durationUs = 0;
      }

      // Determine output path (save directly to Downloads)
      const downloadsDir = app.getPath('downloads');
      const outputPath = path.join(downloadsDir, `${outputFilename}.${formatConfig.extension}`);

      // Create job record
      // Note: outputPath is set early so cleanup can delete partial files on cancel/error
      const job = {
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
      process.on('progress', (progressData) => {
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

      process.on('error', (error) => {
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
      process.start().catch((error) => {
        // Error already handled via event
        this.logger.debug('Transcode process rejected', { sessionId, error: error.message });
      });

      return { success: true, jobId: sessionId };
    } catch (error) {
      this.logger.error('Failed to start transcode', { sessionId, error: error.message });

      // Cleanup on error
      cleanupSession(sessionId, sessionDir);
      this._jobs.delete(sessionId);
      this._sessions.delete(sessionId);

      return { success: false, error: error.message };
    }
  }

  /**
   * Cancel a transcode operation
   * @param {string} jobId - Job ID to cancel
   * @returns {{ success: boolean, error?: string }}
   */
  cancel(jobId) {
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
   * Get status of a specific job or all jobs
   * @param {string} [jobId] - Optional job ID
   * @returns {{ success: boolean, job?: TranscodeJob, jobs?: TranscodeJob[], error?: string }}
   */
  getStatus(jobId) {
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
   * @param {string} jobId - Job ID
   * @param {boolean} [removeOutput=false] - Also remove output file
   * @private
   */
  _cleanupJob(jobId, removeOutput = false) {
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
            error: error.message
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
  _cleanupOnQuit() {
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
   * @param {string} channel - IPC channel
   * @param {Object} data - Data to send
   * @private
   */
  _notifyRenderer(channel, data) {
    try {
      this.windowService?.send(channel, data);
    } catch (error) {
      this.logger.warn('Failed to notify renderer', { channel, error: error.message });
    }
  }

  /**
   * Dispose service resources
   */
  dispose() {
    this.logger.info('Disposing TranscodeService');

    // Cancel any running processes
    for (const [jobId, process] of this._processes) {
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
