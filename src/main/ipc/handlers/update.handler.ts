/**
 * Update IPC Handlers
 * Registers update-related IPC routes.
 */

import type { Logger } from '@main/infrastructure/logging/logger.interface.js';
import { channels as IPC_CHANNELS } from '@shared/ipc/channels.config.js';
import type {
  UpdateCheckResponse,
  UpdateDownloadResponse,
  UpdateGetStatusResponse,
  UpdateInstallResponse,
  UpdateStatusPayload
} from '@shared/ipc/preload-api.contract.js';
import {
  getErrorMessage,
  registerWrappedHandler,
  type RegisterHandler
} from './handler-wrapper.utils.js';

interface UpdateService {
  checkForUpdates(): Promise<Record<string, unknown>>;
  downloadUpdate(): Promise<void>;
  installUpdate(): void;
  getStatus(): UpdateStatusPayload;
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
  registerWrappedHandler({
    registerHandler,
    channel: IPC_CHANNELS.UPDATE.CHECK,
    logger,
    logMessage: 'Failed to check for updates:',
    handler: async () => {
      const result = await updateService.checkForUpdates();
      return { success: true, ...toObjectPayload(result) } as UpdateCheckResponse;
    },
    onError: (error) => {
      return { success: false, error: getErrorMessage(error) } as UpdateCheckResponse;
    }
  });

  registerWrappedHandler({
    registerHandler,
    channel: IPC_CHANNELS.UPDATE.DOWNLOAD,
    logger,
    logMessage: 'Failed to download update:',
    handler: async () => {
      await updateService.downloadUpdate();
      return { success: true } as UpdateDownloadResponse;
    },
    onError: (error) => {
      return { success: false, error: getErrorMessage(error) } as UpdateDownloadResponse;
    }
  });

  registerWrappedHandler({
    registerHandler,
    channel: IPC_CHANNELS.UPDATE.INSTALL,
    logger,
    logMessage: 'Failed to install update:',
    handler: async () => {
      updateService.installUpdate();
      return { success: true } as UpdateInstallResponse;
    },
    onError: (error) => {
      return { success: false, error: getErrorMessage(error) } as UpdateInstallResponse;
    }
  });

  registerWrappedHandler({
    registerHandler,
    channel: IPC_CHANNELS.UPDATE.GET_STATUS,
    logger,
    logMessage: 'Failed to get update status:',
    handler: async () => {
      const status = updateService.getStatus();
      return { success: true, ...toObjectPayload(status) } as UpdateGetStatusResponse;
    },
    onError: (error) => {
      return { success: false, error: getErrorMessage(error) } as UpdateGetStatusResponse;
    }
  });
}
