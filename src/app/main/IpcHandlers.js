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
    this._registeredChannels = [];
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
   * Remove all registered IPC handlers
   */
  dispose() {
    this.logger.info('Removing IPC handlers');
    this._registeredChannels.forEach(channel => {
      ipcMain.removeHandler(channel);
    });
    this._registeredChannels = [];
  }

  _registerHandler(channel, handler) {
    ipcMain.handle(channel, handler);
    this._registeredChannels.push(channel);
  }

  /**
   * Register device-related IPC handlers
   */
  _registerDeviceHandlers() {
    this._registerHandler(IPC_CHANNELS.DEVICE.GET_STATUS, async () => {
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
    this._registerHandler(IPC_CHANNELS.SHELL.OPEN_EXTERNAL, async (event, url) => {
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
    this._registerHandler(IPC_CHANNELS.UPDATE.CHECK, async () => {
      try {
        const result = await this.updateManager.checkForUpdates();
        return { success: true, ...result };
      } catch (error) {
        this.logger.error('Failed to check for updates:', error);
        return { success: false, error: error.message };
      }
    });

    this._registerHandler(IPC_CHANNELS.UPDATE.DOWNLOAD, async () => {
      try {
        await this.updateManager.downloadUpdate();
        return { success: true };
      } catch (error) {
        this.logger.error('Failed to download update:', error);
        return { success: false, error: error.message };
      }
    });

    this._registerHandler(IPC_CHANNELS.UPDATE.INSTALL, async () => {
      try {
        this.updateManager.installUpdate();
        return { success: true };
      } catch (error) {
        this.logger.error('Failed to install update:', error);
        return { success: false, error: error.message };
      }
    });

    this._registerHandler(IPC_CHANNELS.UPDATE.GET_STATUS, async () => {
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
