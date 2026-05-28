/**
 * Shell IPC Handlers
 * Registers shell-related IPC routes.
 */

import type { IpcMainInvokeEvent, Shell } from 'electron';
import type { Logger } from '@main/infrastructure/logging/logger.interface.js';
import type { ShellOpenExternalResponse } from '@prismgb/ipc';
import { defineManifestIpcHandlers } from '../ipc-handler.descriptor.js';

export interface ShellHandlerDependencies {
  shell: Shell;
  logger: Logger;
}

export const shellHandlerDescriptors = defineManifestIpcHandlers<ShellHandlerDependencies>('shellAPI', [
  {
    method: 'openExternal',
    async invoke({ shell }: ShellHandlerDependencies, _event: IpcMainInvokeEvent, url: string) {
      const parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Only http and https URLs are allowed');
      }

      await shell.openExternal(url);
      return { success: true } as ShellOpenExternalResponse;
    },
    mapError: (error, { logger }) => {
      logger.error('Failed to open external URL:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage } as ShellOpenExternalResponse;
    }
  }
]);
