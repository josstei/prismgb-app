/**
 * Window IPC Handlers
 * Handles window-related IPC messages (fullscreen, etc.)
 */

import type { IpcMainInvokeEvent } from 'electron';
import type { Logger } from '@main/infrastructure/logging/logger.interface.js';
import { channels as IPC_CHANNELS } from '@shared/ipc/channels.config.js';

interface WindowService {
  setFullScreen(enabled: boolean): void;
  isFullScreen(): boolean;
}

interface RegisterHandler {
  (channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown> | unknown): void;
}

export interface WindowHandlerDependencies {
  registerHandler: RegisterHandler;
  windowService: WindowService;
  logger: Logger;
}

/**
 * Register window-related IPC handlers
 */
export function registerWindowHandlers({ registerHandler, windowService, logger }: WindowHandlerDependencies): void {
  registerHandler(IPC_CHANNELS.WINDOW.SET_FULLSCREEN, async (event: IpcMainInvokeEvent, enabled: boolean) => {
    logger.debug(`Setting fullscreen: ${enabled}`);
    windowService.setFullScreen(enabled);
    return { success: true };
  });

  registerHandler(IPC_CHANNELS.WINDOW.IS_FULLSCREEN, async () => {
    return windowService.isFullScreen();
  });
}
