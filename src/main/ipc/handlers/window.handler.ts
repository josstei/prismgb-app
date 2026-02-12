/**
 * Window IPC Handlers
 * Handles window-related IPC messages (fullscreen, etc.)
 */

import type { IpcMainInvokeEvent } from 'electron';
import type { Logger } from '@main/infrastructure/logging/logger.interface.js';
import { channels as IPC_CHANNELS } from '@prismgb/ipc';
import type { WindowSetFullscreenResponse } from '@prismgb/ipc';
import {
  getErrorMessage,
  registerWrappedHandler,
  type RegisterHandler
} from './handler-wrapper.utils.js';

interface WindowService {
  setFullScreen(enabled: boolean): void;
  isFullScreen(): boolean;
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
  registerWrappedHandler({
    registerHandler,
    channel: IPC_CHANNELS.WINDOW.SET_FULLSCREEN,
    logger,
    logMessage: 'Failed to set fullscreen:',
    handler: async (_event: IpcMainInvokeEvent, enabled: boolean) => {
      logger.debug(`Setting fullscreen: ${enabled}`);
      windowService.setFullScreen(enabled);
      return { success: true } as WindowSetFullscreenResponse;
    },
    onError: (error) => {
      return { success: false, error: getErrorMessage(error) } as WindowSetFullscreenResponse;
    }
  });

  registerWrappedHandler({
    registerHandler,
    channel: IPC_CHANNELS.WINDOW.IS_FULLSCREEN,
    logger,
    logMessage: 'Failed to query fullscreen state:',
    handler: async () => {
      return windowService.isFullScreen();
    },
    onError: () => false
  });
}
