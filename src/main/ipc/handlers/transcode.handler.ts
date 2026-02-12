/**
 * Transcode IPC Handlers
 *
 * Registers transcode-related IPC routes.
 */

import type { IpcMainInvokeEvent } from 'electron';
import type { Logger } from '@main/infrastructure/logging/logger.interface.js';
import { channels as IPC_CHANNELS } from '@prismgb/ipc';
import type {
  TranscodeCancelResponse,
  TranscodeFormat,
  TranscodeStartResponse,
  TranscodeStatusResponse
} from '@prismgb/ipc';
import {
  getErrorMessage,
  registerWrappedHandler,
  type RegisterHandler
} from './handler-wrapper.utils.js';

interface TranscodeService {
  transcode(options: {
    inputBuffer: Buffer;
    format: TranscodeFormat;
    outputFilename?: string;
    inputArgs?: string[];
    interrupted: boolean;
  }): Promise<TranscodeStartResponse>;
  cancel(jobId: string): TranscodeCancelResponse;
  getStatus(jobId?: string): TranscodeStatusResponse;
}

export interface TranscodeHandlerDependencies {
  registerHandler: RegisterHandler;
  transcodeService: TranscodeService;
  logger: Logger;
}

interface TranscodeStartOptions {
  inputBuffer: ArrayBuffer | Buffer | ArrayBufferView;
  format: TranscodeFormat;
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
  registerWrappedHandler({
    registerHandler,
    channel: IPC_CHANNELS.TRANSCODE.START,
    logger,
    logMessage: 'Failed to start transcode:',
    handler: async (_event: IpcMainInvokeEvent, options: TranscodeStartOptions) => {
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
    },
    onError: (error) => {
      return { success: false, error: getErrorMessage(error) } as TranscodeStartResponse;
    }
  });

  /**
   * Cancel a transcode operation
   * Expects: { jobId: string }
   * Returns: { success: boolean, error?: string }
   */
  registerWrappedHandler({
    registerHandler,
    channel: IPC_CHANNELS.TRANSCODE.CANCEL,
    logger,
    logMessage: 'Failed to cancel transcode:',
    handler: async (_event: IpcMainInvokeEvent, { jobId }: TranscodeCancelOptions) => {
      const result = transcodeService.cancel(jobId);
      return result;
    },
    onError: (error) => {
      return { success: false, error: getErrorMessage(error) } as TranscodeCancelResponse;
    }
  });

  /**
   * Get transcode status
   * Expects: { jobId?: string } (optional - if not provided, returns all jobs)
   * Returns: { success: boolean, job?: TranscodeJob, jobs?: TranscodeJob[], error?: string }
   */
  registerWrappedHandler({
    registerHandler,
    channel: IPC_CHANNELS.TRANSCODE.GET_STATUS,
    logger,
    logMessage: 'Failed to get transcode status:',
    handler: async (_event: IpcMainInvokeEvent, options: TranscodeStatusOptions = {}) => {
      const result = transcodeService.getStatus(options.jobId);
      return result;
    },
    onError: (error) => {
      return { success: false, error: getErrorMessage(error) } as TranscodeStatusResponse;
    }
  });
}
