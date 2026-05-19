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
  defineIpcHandlers,
  registerIpcHandlerDescriptors,
  type RegisterHandler
} from '../ipc-handler.descriptor.js';

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

export const updateHandlerDescriptors = defineIpcHandlers<UpdateHandlerDependencies>([
  {
    channel: IPC_CHANNELS.UPDATE.CHECK,
    dependencyTokens: ['updateService', 'logger'],
    argumentSchema: [],
    responseMode: 'result-envelope',
    async invoke({ updateService }: UpdateHandlerDependencies): Promise<UpdateCheckResponse> {
      const result = await updateService.checkForUpdates();
      return { success: true, ...toObjectPayload(result) } as UpdateCheckResponse;
    },
    mapError: (error, { logger }) => {
      logger.error('Failed to check for updates:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage } as UpdateCheckResponse;
    }
  },
  {
    channel: IPC_CHANNELS.UPDATE.DOWNLOAD,
    dependencyTokens: ['updateService', 'logger'],
    argumentSchema: [],
    responseMode: 'result-envelope',
    async invoke({ updateService }: UpdateHandlerDependencies): Promise<UpdateDownloadResponse> {
      await updateService.downloadUpdate();
      return { success: true } as UpdateDownloadResponse;
    },
    mapError: (error, { logger }) => {
      logger.error('Failed to download update:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage } as UpdateDownloadResponse;
    }
  },
  {
    channel: IPC_CHANNELS.UPDATE.INSTALL,
    dependencyTokens: ['updateService', 'logger'],
    argumentSchema: [],
    responseMode: 'result-envelope',
    invoke({ updateService }: UpdateHandlerDependencies): UpdateInstallResponse {
      updateService.installUpdate();
      return { success: true } as UpdateInstallResponse;
    },
    mapError: (error, { logger }) => {
      logger.error('Failed to install update:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage } as UpdateInstallResponse;
    }
  },
  {
    channel: IPC_CHANNELS.UPDATE.GET_STATUS,
    dependencyTokens: ['updateService', 'logger'],
    argumentSchema: [],
    responseMode: 'result-envelope',
    invoke({ updateService }: UpdateHandlerDependencies): UpdateGetStatusResponse {
      const status = updateService.getStatus();
      return { success: true, ...toObjectPayload(status) } as UpdateGetStatusResponse;
    },
    mapError: (error, { logger }) => {
      logger.error('Failed to get update status:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage } as UpdateGetStatusResponse;
    }
  }
]);

export function registerUpdateHandlers(dependencies: UpdateHandlerDependencies): void {
  registerIpcHandlerDescriptors(dependencies, updateHandlerDescriptors);
}
