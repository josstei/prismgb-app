import type { IpcMainInvokeEvent } from 'electron';
import type { LoggerLike as Logger } from '@prismgb/core';
import type { LoginItemSetResponse, LoginItemGetResponse } from '@prismgb/ipc';
import { defineManifestIpcHandlers } from '@prismgb/ipc';

interface LoginItemService {
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
}

export interface LoginItemHandlerDependencies {
  loginItemService: LoginItemService;
  logger: Logger;
}

export const loginItemHandlerDescriptors = defineManifestIpcHandlers<LoginItemHandlerDependencies>('loginItemAPI', [
  {
    method: 'get',
    async invoke({ loginItemService }: LoginItemHandlerDependencies) {
      return {
        success: true,
        enabled: loginItemService.isEnabled()
      } as LoginItemGetResponse;
    },
    mapError: (error) => {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        enabled: false,
        error: errorMessage
      } as LoginItemGetResponse;
    }
  },
  {
    method: 'set',
    async invoke({ loginItemService, logger }: LoginItemHandlerDependencies, _event: IpcMainInvokeEvent, enabled: boolean) {
      logger.debug(`Setting login item: ${enabled}`);
      loginItemService.setEnabled(enabled);
      return { success: true } as LoginItemSetResponse;
    },
    mapError: (error, { logger }) => {
      logger.error('Failed to set login item:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage } as LoginItemSetResponse;
    }
  }
]);
