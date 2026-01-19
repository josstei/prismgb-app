/**
 * Transcode IPC Handlers
 *
 * Registers transcode-related IPC routes.
 */

import { channels as IPC_CHANNELS } from '@shared/ipc/channels.config.js';

/**
 * Register transcode IPC handlers
 * @param {Object} options - Handler options
 * @param {Function} options.registerHandler - Function to register IPC handlers
 * @param {Object} options.transcodeService - TranscodeService instance
 * @param {Object} options.logger - Logger instance
 */
export function registerTranscodeHandlers({ registerHandler, transcodeService, logger }) {
  /**
   * Start a transcode operation
   * Expects: { inputBuffer: ArrayBuffer, format: string, outputFilename?: string, inputArgs?: string[] }
   * Returns: { success: boolean, jobId?: string, error?: string }
   */
  registerHandler(IPC_CHANNELS.TRANSCODE.START, async (_event, options) => {
    try {
      // Convert ArrayBuffer to Buffer if needed
      let inputBuffer = options.inputBuffer;
      if (inputBuffer instanceof ArrayBuffer) {
        inputBuffer = Buffer.from(inputBuffer);
      } else if (ArrayBuffer.isView(inputBuffer)) {
        inputBuffer = Buffer.from(inputBuffer.buffer, inputBuffer.byteOffset, inputBuffer.byteLength);
      }

      const result = await transcodeService.transcode({
        inputBuffer,
        format: options.format,
        outputFilename: options.outputFilename,
        inputArgs: options.inputArgs,
        interrupted: Boolean(options.interrupted)
      });

      return result;
    } catch (error) {
      logger.error('Failed to start transcode:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Cancel a transcode operation
   * Expects: { jobId: string }
   * Returns: { success: boolean, error?: string }
   */
  registerHandler(IPC_CHANNELS.TRANSCODE.CANCEL, async (_event, { jobId }) => {
    try {
      const result = transcodeService.cancel(jobId);
      return result;
    } catch (error) {
      logger.error('Failed to cancel transcode:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get transcode status
   * Expects: { jobId?: string } (optional - if not provided, returns all jobs)
   * Returns: { success: boolean, job?: TranscodeJob, jobs?: TranscodeJob[], error?: string }
   */
  registerHandler(IPC_CHANNELS.TRANSCODE.GET_STATUS, async (_event, options = {}) => {
    try {
      const result = transcodeService.getStatus(options.jobId);
      return result;
    } catch (error) {
      logger.error('Failed to get transcode status:', error);
      return { success: false, error: error.message };
    }
  });
}
