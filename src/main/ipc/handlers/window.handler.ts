import type { IpcMainInvokeEvent } from 'electron';
import type { Logger } from '@main/infrastructure/logging/logger.interface.js';
import type { WindowSetFullscreenResponse } from '@shared/ipc/preload-api.contract.js';
import { defineManifestIpcHandlers } from '../ipc-handler.descriptor.js';

interface WindowService {
  setFullScreen(enabled: boolean): void;
  isFullScreen(): boolean;
}

export interface WindowHandlerDependencies {
  windowService: WindowService;
  logger: Logger;
}

export const windowHandlerDescriptors = defineManifestIpcHandlers<WindowHandlerDependencies>('windowAPI', [
  {
    method: 'setFullScreen',
    async invoke(
      { windowService, logger }: WindowHandlerDependencies,
      _event: IpcMainInvokeEvent,
      enabled: boolean
    ) {
      logger.debug(`Setting fullscreen: ${enabled}`);
      windowService.setFullScreen(enabled);
      return { success: true } as WindowSetFullscreenResponse;
    },
    mapError: (error, { logger }) => {
      logger.error('Failed to set fullscreen:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage } as WindowSetFullscreenResponse;
    }
  },
  {
    method: 'isFullScreen',
    invoke({ windowService }: WindowHandlerDependencies) {
      return windowService.isFullScreen();
    },
    mapError: (error, { logger }) => {
      logger.error('Failed to get fullscreen state:', error);
      return false;
    }
  }
]);
