/**
 * Shell IPC Handlers
 * Registers shell-related IPC routes.
 */

import type { IpcMainInvokeEvent, Shell } from 'electron';
import type { Logger } from '@main/infrastructure/logging/logger.interface.js';
import { channels as IPC_CHANNELS } from '@shared/ipc/channels.config.js';
import type { ShellOpenExternalResponse } from '@shared/ipc/preload-api.contract.js';

interface RegisterHandler {
  (channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown> | unknown): void;
}

export interface ShellHandlerDependencies {
  registerHandler: RegisterHandler;
  shell: Shell;
  logger: Logger;
}

export function registerShellHandlers({ registerHandler, shell, logger }: ShellHandlerDependencies): void {
  registerHandler(IPC_CHANNELS.SHELL.OPEN_EXTERNAL, async (event: IpcMainInvokeEvent, url: string) => {
    try {
      const parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Only http and https URLs are allowed');
      }
      await shell.openExternal(url);
      return { success: true } as ShellOpenExternalResponse;
    } catch (error) {
      logger.error('Failed to open external URL:', error);
      return { success: false, error: (error as Error).message } as ShellOpenExternalResponse;
    }
  });
}
