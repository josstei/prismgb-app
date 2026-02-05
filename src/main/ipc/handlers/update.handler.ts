/**
 * Update IPC Handlers
 * Registers update-related IPC routes.
 */

import type { IpcMainInvokeEvent } from 'electron';
import type { Logger } from '@main/infrastructure/logging/logger.interface.js';
import { channels as IPC_CHANNELS } from '@shared/ipc/channels.config.js';

interface UpdateService {
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<void>;
  installUpdate(): void;
  getStatus(): unknown;
}

interface RegisterHandler {
  (channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown> | unknown): void;
}

export interface UpdateHandlerDependencies {
  registerHandler: RegisterHandler;
  updateService: UpdateService;
  logger: Logger;
}

export function registerUpdateHandlers({ registerHandler, updateService, logger }: UpdateHandlerDependencies): void {
  registerHandler(IPC_CHANNELS.UPDATE.CHECK, async () => {
    try {
      const result = await updateService.checkForUpdates();
      return { success: true, ...result };
    } catch (error) {
      logger.error('Failed to check for updates:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  registerHandler(IPC_CHANNELS.UPDATE.DOWNLOAD, async () => {
    try {
      await updateService.downloadUpdate();
      return { success: true };
    } catch (error) {
      logger.error('Failed to download update:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  registerHandler(IPC_CHANNELS.UPDATE.INSTALL, async () => {
    try {
      updateService.installUpdate();
      return { success: true };
    } catch (error) {
      logger.error('Failed to install update:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  registerHandler(IPC_CHANNELS.UPDATE.GET_STATUS, async () => {
    try {
      const status = updateService.getStatus();
      return { success: true, ...status };
    } catch (error) {
      logger.error('Failed to get update status:', error);
      return { success: false, error: (error as Error).message };
    }
  });
}
