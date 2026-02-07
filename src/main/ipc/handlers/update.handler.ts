/**
 * Update IPC Handlers
 * Registers update-related IPC routes.
 */

import type { IpcMainInvokeEvent } from 'electron';
import type { Logger } from '@main/infrastructure/logging/logger.interface.js';
import { channels as IPC_CHANNELS } from '@shared/ipc/channels.config.js';
import type {
  UpdateCheckResponse,
  UpdateDownloadResponse,
  UpdateGetStatusResponse,
  UpdateInstallResponse,
  UpdateStatusPayload
} from '@shared/ipc/preload-api.contract.js';

interface UpdateService {
  checkForUpdates(): Promise<Record<string, unknown>>;
  downloadUpdate(): Promise<void>;
  installUpdate(): void;
  getStatus(): UpdateStatusPayload;
}

interface RegisterHandler {
  (channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown> | unknown): void;
}

export interface UpdateHandlerDependencies {
  registerHandler: RegisterHandler;
  updateService: UpdateService;
  logger: Logger;
}

function toObjectPayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return {};
}

export function registerUpdateHandlers({ registerHandler, updateService, logger }: UpdateHandlerDependencies): void {
  registerHandler(IPC_CHANNELS.UPDATE.CHECK, async () => {
    try {
      const result = await updateService.checkForUpdates();
      return { success: true, ...toObjectPayload(result) } as UpdateCheckResponse;
    } catch (error) {
      logger.error('Failed to check for updates:', error);
      return { success: false, error: (error as Error).message } as UpdateCheckResponse;
    }
  });

  registerHandler(IPC_CHANNELS.UPDATE.DOWNLOAD, async () => {
    try {
      await updateService.downloadUpdate();
      return { success: true } as UpdateDownloadResponse;
    } catch (error) {
      logger.error('Failed to download update:', error);
      return { success: false, error: (error as Error).message } as UpdateDownloadResponse;
    }
  });

  registerHandler(IPC_CHANNELS.UPDATE.INSTALL, async () => {
    try {
      updateService.installUpdate();
      return { success: true } as UpdateInstallResponse;
    } catch (error) {
      logger.error('Failed to install update:', error);
      return { success: false, error: (error as Error).message } as UpdateInstallResponse;
    }
  });

  registerHandler(IPC_CHANNELS.UPDATE.GET_STATUS, async () => {
    try {
      const status = updateService.getStatus();
      return { success: true, ...toObjectPayload(status) } as UpdateGetStatusResponse;
    } catch (error) {
      logger.error('Failed to get update status:', error);
      return { success: false, error: (error as Error).message } as UpdateGetStatusResponse;
    }
  });
}
