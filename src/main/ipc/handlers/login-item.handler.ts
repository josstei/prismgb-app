import type { IpcMainInvokeEvent } from 'electron';
import type { Logger } from '@main/infrastructure/logging/logger.interface.js';
import IPC_CHANNELS from '@shared/ipc/channels.json';
import type { LoginItemSetResponse } from '@shared/ipc/preload-api.contract.js';
import { defineIpcHandlers } from '../ipc-handler.descriptor.js';

interface LoginItemService {
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
}

export interface LoginItemHandlerDependencies {
  loginItemService: LoginItemService;
  logger: Logger;
}

export const loginItemHandlerDescriptors = defineIpcHandlers<LoginItemHandlerDependencies>([
  {
    channel: IPC_CHANNELS.LOGIN_ITEM.GET,
    dependencyTokens: ['loginItemService'],
    argumentSchema: [],
    responseMode: 'bare',
    async invoke({ loginItemService }: LoginItemHandlerDependencies) {
      return loginItemService.isEnabled();
    },
    mapError: () => {
      return false;
    }
  },
  {
    channel: IPC_CHANNELS.LOGIN_ITEM.SET,
    dependencyTokens: ['loginItemService', 'logger'],
    argumentSchema: ['enabled:boolean'],
    responseMode: 'result-envelope',
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
