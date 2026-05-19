import type { IpcMainInvokeEvent } from 'electron';
import type { Logger } from '@main/infrastructure/logging/logger.interface.js';
import { channels as IPC_CHANNELS } from '@shared/ipc/channels.config.js';
import type {
  TranscodeCancelResponse,
  TranscodeFormat,
  TranscodeStartResponse,
  TranscodeStatusResponse
} from '@shared/ipc/preload-api.contract.js';
import { defineIpcHandlers } from '../ipc-handler.descriptor.js';

interface TranscodeService {
  transcode(options: {
    inputBuffer: Buffer;
    format: TranscodeFormat;
    outputFilename?: string;
    inputArgs?: string[];
    interrupted: boolean;
  }): Promise<TranscodeStartResponse>;
  cancel(jobId: string): TranscodeCancelResponse;
  getStatus(): TranscodeStatusResponse;
}

export interface TranscodeHandlerDependencies {
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

function toBuffer(inputBuffer: TranscodeStartOptions['inputBuffer']): Buffer {
  if (inputBuffer instanceof ArrayBuffer) {
    return Buffer.from(inputBuffer);
  }

  if (ArrayBuffer.isView(inputBuffer)) {
    return Buffer.from(inputBuffer.buffer, inputBuffer.byteOffset, inputBuffer.byteLength);
  }

  return inputBuffer as Buffer;
}

export const transcodeHandlerDescriptors = defineIpcHandlers<TranscodeHandlerDependencies>([
  {
    channel: IPC_CHANNELS.TRANSCODE.START,
    dependencyTokens: ['transcodeService', 'logger'],
    argumentSchema: ['options:object'],
    responseMode: 'result-envelope',
    async invoke(
      { transcodeService }: TranscodeHandlerDependencies,
      _event: IpcMainInvokeEvent,
      options: TranscodeStartOptions
    ): Promise<TranscodeStartResponse> {
      const result = await transcodeService.transcode({
        inputBuffer: toBuffer(options.inputBuffer),
        format: options.format,
        outputFilename: options.outputFilename,
        inputArgs: options.inputArgs,
        interrupted: Boolean(options.interrupted)
      });

      return result;
    },
    mapError: (error, { logger }) => {
      logger.error('Failed to start transcode:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage } as TranscodeStartResponse;
    }
  },
  {
    channel: IPC_CHANNELS.TRANSCODE.CANCEL,
    dependencyTokens: ['transcodeService', 'logger'],
    argumentSchema: ['options:object'],
    responseMode: 'result-envelope',
    invoke(
      { transcodeService }: TranscodeHandlerDependencies,
      _event: IpcMainInvokeEvent,
      { jobId }: TranscodeCancelOptions
    ): TranscodeCancelResponse {
      return transcodeService.cancel(jobId);
    },
    mapError: (error, { logger }) => {
      logger.error('Failed to cancel transcode:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage } as TranscodeCancelResponse;
    }
  },
  {
    channel: IPC_CHANNELS.TRANSCODE.GET_STATUS,
    dependencyTokens: ['transcodeService', 'logger'],
    argumentSchema: [],
    responseMode: 'result-envelope',
    invoke(
      { transcodeService }: TranscodeHandlerDependencies
    ): TranscodeStatusResponse {
      return transcodeService.getStatus();
    },
    mapError: (error, { logger }) => {
      logger.error('Failed to get transcode status:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage } as TranscodeStatusResponse;
    }
  }
]);
