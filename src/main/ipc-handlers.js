/**
 * IPC Handlers
 * Centralized registration of all IPC handler modules.
 */

import { app, ipcMain, shell } from 'electron';
import { registerDeviceHandlers } from './ipc/device-ipc.handlers.js';
import { registerUpdateHandlers } from './ipc/update-ipc.handlers.js';
import { registerShellHandlers } from './ipc/shell-ipc.handlers.js';
import { registerPerformanceHandlers } from './ipc/performance-ipc.handlers.js';

class IpcHandlers {
  constructor({ deviceServiceMain, updateServiceMain, loggerFactory }) {
    this.logger = loggerFactory.create('IpcHandlers');
    this.deviceServiceMain = deviceServiceMain;
    this.updateServiceMain = updateServiceMain;
    this._registeredChannels = [];
  }

  /**
   * Register all IPC handlers
   */
  registerHandlers() {
    this.logger.info('Registering IPC handlers');

    registerDeviceHandlers({
      registerHandler: this._registerHandler.bind(this),
      deviceServiceMain: this.deviceServiceMain,
      logger: this.logger
    });

    registerShellHandlers({
      registerHandler: this._registerHandler.bind(this),
      shell,
      logger: this.logger
    });

    registerUpdateHandlers({
      registerHandler: this._registerHandler.bind(this),
      updateServiceMain: this.updateServiceMain,
      logger: this.logger
    });

    registerPerformanceHandlers({
      registerHandler: this._registerHandler.bind(this),
      app,
      logger: this.logger
    });
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
}

export default IpcHandlers;
