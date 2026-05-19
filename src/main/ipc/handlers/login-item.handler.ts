import type { IpcMainInvokeEvent } from 'electron';
import type { Logger } from '@main/infrastructure/logging/logger.interface.js';
import { channels as IPC_CHANNELS } from '@shared/ipc/channels.config.js';
import type { LoginItemSetResponse } from '@shared/ipc/preload-api.contract.js';
import {
  defineIpcHandlers,
  registerIpcHandlerDescriptors,
  type RegisterHandler
} from '../ipc-handler.descriptor.js';

interface LoginItemService {
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
}

export interface LoginItemHandlerDependencies {
  registerHandler: RegisterHandler;
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
    }
  }
]);

export function registerLoginItemHandlers(dependencies: LoginItemHandlerDependencies): void {
  registerIpcHandlerDescriptors(dependencies, loginItemHandlerDescriptors);
}
