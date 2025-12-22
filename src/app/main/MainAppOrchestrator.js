/**
 * Main Application Orchestrator
 * Coordinates main process services and application lifecycle
 */

import { app } from 'electron';
import path from 'path';
import { createAppContainer } from './container.js';
import { MainLogger } from '@infrastructure/logging/main-logger.js';

class MainAppOrchestrator {
  constructor() {
    this.container = null;
    this.initialized = false;
    this.loggerFactory = new MainLogger();
    this.logger = this.loggerFactory.create('MainAppOrchestrator');

    // Service references - populated during initialize()
    this._windowManager = null;
    this._deviceServiceMain = null;
    this._trayManager = null;
    this._ipcHandlers = null;
    this._updateServiceMain = null;
    this._deviceBridgeService = null;
    this._updateBridgeService = null;
  }

  /**
   * Initialize the application and DI container
   */
  async initialize() {
    this.logger.info('Starting PrismGB...');

    // Create DI container with shared logger factory (eliminates duplicate instance)
    this.container = await createAppContainer(this.loggerFactory);

    // Resolve and cache core services
    this._windowManager = this.container.resolve('windowManager');
    this._deviceServiceMain = this.container.resolve('deviceServiceMain');
    this._trayManager = this.container.resolve('trayManager');
    this._ipcHandlers = this.container.resolve('ipcHandlers');
    this._updateServiceMain = this.container.resolve('updateServiceMain');
    this._deviceBridgeService = this.container.resolve('deviceBridgeService');
    this._updateBridgeService = this.container.resolve('updateBridgeService');

    // Initialize device service (loads device profiles)
    await this._deviceServiceMain.initialize();

    // Initialize update bridge and start auto-check (1 hour interval)
    this._updateBridgeService.initialize();

    // Start USB monitoring for hot-plug detection
    this._deviceServiceMain.startUSBMonitoring();

    // Subscribe to device events via bridge
    this._deviceBridgeService.initialize();

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
    const deviceFound = await this._deviceServiceMain.checkForDevice();
    if (deviceFound) {
      this.logger.info('Device already connected');
    }

    this.initialized = true;
    this.logger.info('PrismGB initialized successfully');
  }

  /**
   * Cleanup on app quit (idempotent - safe to call multiple times)
   */
  cleanup() {
    if (this._cleanedUp) {
      return;
    }
    this._cleanedUp = true;

    this.logger.info('Shutting down PrismGB...');

    if (!this.container) {
      this.logger.info('No container to cleanup');
      return;
    }

    try {
      if (this._windowManager?.mainWindow) {
        const win = this._windowManager.mainWindow;
        if (!win.isDestroyed()) {
          if (win.webContents?.isDevToolsOpened()) {
            win.webContents.closeDevTools();
            this.logger.debug('Closed DevTools');
          }
          win.destroy();
          this.logger.debug('Destroyed main window');
        }
      }
    } catch (error) {
      this.logger.error('Error destroying window:', error);
    }

    try {
      if (this._ipcHandlers) {
        this._ipcHandlers.dispose();
        this.logger.debug('Disposed IPC handlers');
      }
    } catch (error) {
      this.logger.error('Error disposing IPC handlers:', error);
    }

    try {
      if (this._deviceBridgeService) {
        this._deviceBridgeService.dispose();
        this.logger.debug('Disposed device bridge service');
      }
    } catch (error) {
      this.logger.error('Error disposing device bridge service:', error);
    }

    try {
      // Stop USB monitoring
      if (this._deviceServiceMain) {
        this._deviceServiceMain.stopUSBMonitoring();
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
      // Dispose update bridge
      if (this._updateBridgeService) {
        this._updateBridgeService.dispose();
        this.logger.debug('Disposed update bridge service');
      }
    } catch (error) {
      this.logger.error('Error disposing update bridge service:', error);
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
    this._deviceServiceMain = null;
    this._trayManager = null;
    this._ipcHandlers = null;
    this._updateServiceMain = null;
    this._deviceBridgeService = null;
    this._updateBridgeService = null;

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

export default MainAppOrchestrator;
