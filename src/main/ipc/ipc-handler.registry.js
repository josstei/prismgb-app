/**
 * IPC Handler Registry
 * Centralized registration of all IPC handler modules.
 */

import { app, ipcMain, shell } from 'electron';
import { BaseService } from '@shared/base/service.js';
import { registerDeviceHandlers } from '../features/devices/ipc/device-ipc.handler.js';
import { registerUpdateHandlers } from '../features/updates/ipc/update-ipc.handler.js';
import { registerShellHandlers } from '../features/shell/ipc/shell-ipc.handler.js';
import { registerPerformanceHandlers } from '../features/performance/ipc/performance-ipc.handler.js';
import { registerWindowHandlers } from '../features/window/ipc/window-ipc.handler.js';

class IpcHandlerRegistry extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['deviceService', 'updateService', 'windowService', 'loggerFactory'], 'IpcHandlerRegistry');
    this._registeredChannels = [];
  }

  /**
   * Register all IPC handlers
   */
  registerHandlers() {
    this.logger.info('Registering IPC handlers');

    registerDeviceHandlers({
      registerHandler: this._registerHandler.bind(this),
      deviceService: this.deviceService,
      logger: this.logger
    });

    registerShellHandlers({
      registerHandler: this._registerHandler.bind(this),
      shell,
      logger: this.logger
    });

    registerUpdateHandlers({
      registerHandler: this._registerHandler.bind(this),
      updateService: this.updateService,
      logger: this.logger
    });

    registerPerformanceHandlers({
      registerHandler: this._registerHandler.bind(this),
      app,
      logger: this.logger
    });

    registerWindowHandlers({
      registerHandler: this._registerHandler.bind(this),
      windowService: this.windowService,
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

export { IpcHandlerRegistry };
