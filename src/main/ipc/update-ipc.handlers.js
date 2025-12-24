/**
 * Update IPC Handlers
 * Registers update-related IPC routes.
 */

import IPC_CHANNELS from '@infrastructure/ipc/channels.js';

export function registerUpdateHandlers({ registerHandler, updateServiceMain, logger }) {
  registerHandler(IPC_CHANNELS.UPDATE.CHECK, async () => {
    try {
      const result = await updateServiceMain.checkForUpdates();
      return { success: true, ...result };
    } catch (error) {
      logger.error('Failed to check for updates:', error);
      return { success: false, error: error.message };
    }
  });

  registerHandler(IPC_CHANNELS.UPDATE.DOWNLOAD, async () => {
    try {
      await updateServiceMain.downloadUpdate();
      return { success: true };
    } catch (error) {
      logger.error('Failed to download update:', error);
      return { success: false, error: error.message };
    }
  });

  registerHandler(IPC_CHANNELS.UPDATE.INSTALL, async () => {
    try {
      updateServiceMain.installUpdate();
      return { success: true };
    } catch (error) {
      logger.error('Failed to install update:', error);
      return { success: false, error: error.message };
    }
  });

  registerHandler(IPC_CHANNELS.UPDATE.GET_STATUS, async () => {
    try {
      const status = updateServiceMain.getStatus();
      return { success: true, ...status };
    } catch (error) {
      logger.error('Failed to get update status:', error);
      return { success: false, error: error.message };
    }
  });
}
