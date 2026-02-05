/**
 * Transcode IPC Handlers
 *
 * Registers transcode-related IPC routes.
 */

import type { IpcMainInvokeEvent } from 'electron';
import type { Logger } from '@main/infrastructure/logging/logger.interface.js';
import { channels as IPC_CHANNELS } from '@shared/ipc/channels.config.js';

interface TranscodeService {
  transcode(options: {
    inputBuffer: Buffer;
    format: string;
    outputFilename?: string;
    inputArgs?: string[];
    interrupted: boolean;
  }): Promise<unknown>;
  cancel(jobId: string): unknown;
  getStatus(jobId?: string): unknown;
}

interface RegisterHandler {
  (channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown> | unknown): void;
}

export interface TranscodeHandlerDependencies {
  registerHandler: RegisterHandler;
  transcodeService: TranscodeService;
  logger: Logger;
}

interface TranscodeStartOptions {
  inputBuffer: ArrayBuffer | Buffer | ArrayBufferView;
  format: string;
  outputFilename?: string;
  inputArgs?: string[];
  interrupted?: boolean;
}

interface TranscodeCancelOptions {
  jobId: string;
}

interface TranscodeStatusOptions {
  jobId?: string;
}

/**
 * Register transcode IPC handlers
 */
export function registerTranscodeHandlers({ registerHandler, transcodeService, logger }: TranscodeHandlerDependencies): void {
  /**
   * Start a transcode operation
   * Expects: { inputBuffer: ArrayBuffer, format: string, outputFilename?: string, inputArgs?: string[] }
   * Returns: { success: boolean, jobId?: string, error?: string }
   */
  registerHandler(IPC_CHANNELS.TRANSCODE.START, async (_event: IpcMainInvokeEvent, options: TranscodeStartOptions) => {
    try {
      // Convert ArrayBuffer to Buffer if needed
      let inputBuffer: Buffer = options.inputBuffer as Buffer;
      if (options.inputBuffer instanceof ArrayBuffer) {
        inputBuffer = Buffer.from(options.inputBuffer);
      } else if (ArrayBuffer.isView(options.inputBuffer)) {
        inputBuffer = Buffer.from(
          options.inputBuffer.buffer,
          options.inputBuffer.byteOffset,
          options.inputBuffer.byteLength
        );
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
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Cancel a transcode operation
   * Expects: { jobId: string }
   * Returns: { success: boolean, error?: string }
   */
  registerHandler(IPC_CHANNELS.TRANSCODE.CANCEL, async (_event: IpcMainInvokeEvent, { jobId }: TranscodeCancelOptions) => {
    try {
      const result = transcodeService.cancel(jobId);
      return result;
    } catch (error) {
      logger.error('Failed to cancel transcode:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  /**
   * Get transcode status
   * Expects: { jobId?: string } (optional - if not provided, returns all jobs)
   * Returns: { success: boolean, job?: TranscodeJob, jobs?: TranscodeJob[], error?: string }
   */
  registerHandler(IPC_CHANNELS.TRANSCODE.GET_STATUS, async (_event: IpcMainInvokeEvent, options: TranscodeStatusOptions = {}) => {
    try {
      const result = transcodeService.getStatus(options.jobId);
      return result;
    } catch (error) {
      logger.error('Failed to get transcode status:', error);
      return { success: false, error: (error as Error).message };
    }
  });
}
