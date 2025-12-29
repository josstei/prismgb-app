/**
 * Update IPC Handlers
 * Registers update-related IPC routes.
 */

import { channels as IPC_CHANNELS } from '@shared/ipc/channels.js';

export function registerUpdateHandlers({ registerHandler, updateService, logger }) {
  registerHandler(IPC_CHANNELS.UPDATE.CHECK, async () => {
    try {
      const result = await updateService.checkForUpdates();
      return { success: true, ...result };
    } catch (error) {
      logger.error('Failed to check for updates:', error);
      return { success: false, error: error.message };
    }
  });

  registerHandler(IPC_CHANNELS.UPDATE.DOWNLOAD, async () => {
    try {
      await updateService.downloadUpdate();
      return { success: true };
    } catch (error) {
      logger.error('Failed to download update:', error);
      return { success: false, error: error.message };
    }
  });

  registerHandler(IPC_CHANNELS.UPDATE.INSTALL, async () => {
    try {
      updateService.installUpdate();
      return { success: true };
    } catch (error) {
      logger.error('Failed to install update:', error);
      return { success: false, error: error.message };
    }
  });

  registerHandler(IPC_CHANNELS.UPDATE.GET_STATUS, async () => {
    try {
      const status = updateService.getStatus();
      return { success: true, ...status };
    } catch (error) {
      logger.error('Failed to get update status:', error);
      return { success: false, error: error.message };
    }
  });
}
