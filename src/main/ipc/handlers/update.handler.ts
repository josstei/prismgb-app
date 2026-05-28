/**
 * Update IPC Handlers
 * Registers update-related IPC routes.
 */

import type { Logger } from '@main/infrastructure/logger.interface.js';
import type {
  UpdateCheckResponse,
  UpdateDownloadResponse,
  UpdateGetStatusResponse,
  UpdateInstallResponse,
  UpdateStatusPayload
} from '@prismgb/ipc';
import { defineManifestIpcHandlers } from '../ipc-handler.descriptor.js';

interface UpdateService {
  checkForUpdates(): Promise<Record<string, unknown>>;
  downloadUpdate(): Promise<void>;
  installUpdate(): void;
  getStatus(): UpdateStatusPayload;
}

export interface UpdateHandlerDependencies {
  updateService: UpdateService;
  logger: Logger;
}

function toObjectPayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return {};
}

export const updateHandlerDescriptors = defineManifestIpcHandlers<UpdateHandlerDependencies>('updateAPI', [
  {
    method: 'checkForUpdates',
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
    method: 'downloadUpdate',
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
    method: 'installUpdate',
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
    method: 'getStatus',
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
