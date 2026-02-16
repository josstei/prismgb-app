import type { IpcMainInvokeEvent } from 'electron';
import type { Logger } from '@main/infrastructure/logging/logger.interface.js';
import { channels as IPC_CHANNELS } from '@shared/ipc/channels.config.js';
import type { LoginItemSetResponse } from '@shared/ipc/preload-api.contract.js';

interface LoginItemService {
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
}

interface RegisterHandler {
  (channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown> | unknown): void;
}

export interface LoginItemHandlerDependencies {
  registerHandler: RegisterHandler;
  loginItemService: LoginItemService;
  logger: Logger;
}

export function registerLoginItemHandlers({ registerHandler, loginItemService, logger }: LoginItemHandlerDependencies): void {
  registerHandler(IPC_CHANNELS.LOGIN_ITEM.GET, async () => {
    return loginItemService.isEnabled();
  });

  registerHandler(IPC_CHANNELS.LOGIN_ITEM.SET, async (_event: IpcMainInvokeEvent, enabled: boolean) => {
    logger.debug(`Setting login item: ${enabled}`);
    loginItemService.setEnabled(enabled);
    return { success: true } as LoginItemSetResponse;
  });
}
