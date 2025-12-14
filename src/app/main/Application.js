/**
 * Application Bootstrap
 * Main application class that creates the DI container and initializes services
 */

import { app } from 'electron';
import path from 'path';
import { createAppContainer } from './container.js';
import IPC_CHANNELS from '@infrastructure/ipc/channels.js';
import { MainLogger } from '@infrastructure/logging/main-logger.js';

class Application {
  constructor() {
    this.container = null;
    this.initialized = false;
    this.loggerFactory = new MainLogger();
    this.logger = this.loggerFactory.create('Application');

    // Service references - populated during initialize()
    this._windowManager = null;
    this._deviceManager = null;
    this._trayManager = null;
    this._ipcHandlers = null;
    this._updateManager = null;
  }

  /**
   * Initialize the application and DI container
   */
  async initialize() {
    this.logger.info('Starting PrismGB...');

    // Create DI container (async for ESM compatibility)
    this.container = await createAppContainer();

    // Resolve and cache core services
    this._windowManager = this.container.resolve('windowManager');
    this._deviceManager = this.container.resolve('deviceManager');
    this._trayManager = this.container.resolve('trayManager');
    this._ipcHandlers = this.container.resolve('ipcHandlers');
    this._updateManager = this.container.resolve('updateManager');

    // Initialize device manager (loads device profiles)
    await this._deviceManager.initialize();

    // Initialize update manager and start auto-check (1 hour interval)
    this._updateManager.initialize();
    this._updateManager.startAutoCheck(60 * 60 * 1000);

    // Subscribe to device manager events - store reference for cleanup
    this._connectionChangedHandler = () => {
      this._trayManager.updateTrayMenu();

      // Notify renderer of device connection status change
      if (this._deviceManager.isConnected()) {
        this._windowManager.send(IPC_CHANNELS.DEVICE.CONNECTED, this._deviceManager.connectedDeviceInfo);
      } else {
        this._windowManager.send(IPC_CHANNELS.DEVICE.DISCONNECTED);
      }
    };
    this._deviceManager.on('connection-changed', this._connectionChangedHandler);

    // Start USB monitoring for hot-plug detection
    this._deviceManager.startUSBMonitoring();

    // Create system tray
    this._trayManager.createTray();

    // Set dock icon in dev mode (macOS only)
    // In production, macOS uses icon.icns from app bundle automatically
    if (process.platform === 'darwin' && !app.isPackaged) {
      const iconPath = path.join(app.getAppPath(), 'assets/icon.png');
      app.dock.setIcon(iconPath);
      this.logger.debug(`Set dock icon: ${iconPath}`);
    }

    // Register IPC handlers
    this._ipcHandlers.registerHandlers();

    // Wait for USB monitoring to initialize and enumerate devices
    // usb-detection needs time to populate its device cache after startMonitoring()
    await new Promise(resolve => setTimeout(resolve, 500));

    // Create main window immediately
    this._windowManager.createWindow();

    // Check for already connected devices
    const deviceFound = await this._deviceManager.checkForDevice();
    if (deviceFound) {
      this.logger.info('Device already connected');
    }

    this.initialized = true;
    this.logger.info('PrismGB initialized successfully');
  }

  /**
   * Cleanup on app quit
   */
  cleanup() {
    this.logger.info('Shutting down PrismGB...');

    if (!this.container) {
      this.logger.info('No container to cleanup');
      return;
    }

    try {
      // Close DevTools and destroy main window to prevent zombie processes
      if (this._windowManager?.mainWindow) {
        const win = this._windowManager.mainWindow;
        if (win.webContents?.isDevToolsOpened()) {
          win.webContents.closeDevTools();
          this.logger.debug('Closed DevTools');
        }
        win.destroy();
        this.logger.debug('Destroyed main window');
      }
    } catch (error) {
      this.logger.error('Error destroying window:', error);
    }

    try {
      // Remove device manager event listener to prevent memory leaks
      if (this._connectionChangedHandler && this._deviceManager) {
        this._deviceManager.off('connection-changed', this._connectionChangedHandler);
        this._connectionChangedHandler = null;
        this.logger.debug('Removed device manager listener');
      }
    } catch (error) {
      this.logger.error('Error removing device manager listener:', error);
    }

    try {
      // Stop USB monitoring
      if (this._deviceManager) {
        this._deviceManager.stopUSBMonitoring();
        this.logger.debug('Stopped USB monitoring');
      }
    } catch (error) {
      this.logger.error('Error stopping USB monitoring:', error);
    }

    try {
      // Destroy tray
      if (this._trayManager) {
        this._trayManager.destroy();
        this.logger.debug('Destroyed system tray');
      }
    } catch (error) {
      this.logger.error('Error destroying tray:', error);
    }

    try {
      // Dispose update manager
      if (this._updateManager) {
        this._updateManager.dispose();
        this.logger.debug('Disposed update manager');
      }
    } catch (error) {
      this.logger.error('Error disposing update manager:', error);
    }

    try {
      // Dispose container
      this.container.dispose();
      this.container = null;
      this.logger.debug('Disposed DI container');
    } catch (error) {
      this.logger.error('Error disposing container:', error);
    }

    // Clear service references
    this._windowManager = null;
    this._deviceManager = null;
    this._trayManager = null;
    this._ipcHandlers = null;
    this._updateManager = null;

    this.logger.info('PrismGB shutdown complete');
  }

  /**
   * Get the DI container
   * @returns {AwilixContainer}
   */
  getContainer() {
    return this.container;
  }
}

export default Application;
