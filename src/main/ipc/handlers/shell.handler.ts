/**
 * Shell IPC Handlers
 * Registers shell-related IPC routes.
 */

import type { IpcMainInvokeEvent, Shell } from 'electron';
import type { Logger } from '@main/infrastructure/logging/logger.interface.js';
import { channels as IPC_CHANNELS } from '@prismgb/ipc';
import type { ShellOpenExternalResponse } from '@prismgb/ipc';
import {
  getErrorMessage,
  registerWrappedHandler,
  type RegisterHandler
} from './handler-wrapper.utils.js';

export interface ShellHandlerDependencies {
  registerHandler: RegisterHandler;
  shell: Shell;
  logger: Logger;
}

export function registerShellHandlers({ registerHandler, shell, logger }: ShellHandlerDependencies): void {
  registerWrappedHandler({
    registerHandler,
    channel: IPC_CHANNELS.SHELL.OPEN_EXTERNAL,
    logger,
    logMessage: 'Failed to open external URL:',
    handler: async (_event: IpcMainInvokeEvent, url: string) => {
      const parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Only http and https URLs are allowed');
      }
      await shell.openExternal(url);
      return { success: true } as ShellOpenExternalResponse;
    },
    onError: (error) => {
      return { success: false, error: getErrorMessage(error) } as ShellOpenExternalResponse;
    }
  });
}
