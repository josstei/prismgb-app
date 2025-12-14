/**
 * IPC Handlers
 * Centralized registration of all IPC handlers
 */

import { ipcMain, shell } from 'electron';
import IPC_CHANNELS from '@infrastructure/ipc/channels.js';

class IpcHandlers {
  constructor({ deviceManager, updateManager, loggerFactory }) {
    this.logger = loggerFactory.create('IpcHandlers');
    this.deviceManager = deviceManager;
    this.updateManager = updateManager;
  }

  /**
   * Register all IPC handlers
   */
  registerHandlers() {
    this.logger.info('Registering IPC handlers');

    this._registerDeviceHandlers();
    this._registerShellHandlers();
    this._registerUpdateHandlers();
  }

  /**
   * Register device-related IPC handlers
   */
  _registerDeviceHandlers() {
    // Get device status
    ipcMain.handle(IPC_CHANNELS.DEVICE.GET_STATUS, async () => {
      try {
        const status = this.deviceManager.getStatus();
        return status;
      } catch (error) {
        this.logger.error('Failed to get device status:', error);
        return { connected: false, error: error.message };
      }
    });
  }

  /**
   * Register shell-related IPC handlers
   */
  _registerShellHandlers() {
    // Open external URL in default browser
    ipcMain.handle(IPC_CHANNELS.SHELL.OPEN_EXTERNAL, async (event, url) => {
      try {
        // Validate URL before opening
        const parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          throw new Error('Only http and https URLs are allowed');
        }
        await shell.openExternal(url);
        return { success: true };
      } catch (error) {
        this.logger.error('Failed to open external URL:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Register update-related IPC handlers
   */
  _registerUpdateHandlers() {
    // Check for updates
    ipcMain.handle(IPC_CHANNELS.UPDATE.CHECK, async () => {
      try {
        const result = await this.updateManager.checkForUpdates();
        return { success: true, ...result };
      } catch (error) {
        this.logger.error('Failed to check for updates:', error);
        return { success: false, error: error.message };
      }
    });

    // Download update
    ipcMain.handle(IPC_CHANNELS.UPDATE.DOWNLOAD, async () => {
      try {
        await this.updateManager.downloadUpdate();
        return { success: true };
      } catch (error) {
        this.logger.error('Failed to download update:', error);
        return { success: false, error: error.message };
      }
    });

    // Install update (quit and install)
    ipcMain.handle(IPC_CHANNELS.UPDATE.INSTALL, async () => {
      try {
        // This will quit the app and install the update
        this.updateManager.installUpdate();
        return { success: true };
      } catch (error) {
        this.logger.error('Failed to install update:', error);
        return { success: false, error: error.message };
      }
    });

    // Get update status
    ipcMain.handle(IPC_CHANNELS.UPDATE.GET_STATUS, async () => {
      try {
        const status = this.updateManager.getStatus();
        return { success: true, ...status };
      } catch (error) {
        this.logger.error('Failed to get update status:', error);
        return { success: false, error: error.message };
      }
    });
  }
}

export default IpcHandlers;
