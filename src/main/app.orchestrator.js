/**
 * Application Orchestrator
 * Coordinates main process services and application lifecycle
 *
 * Note: This is a bootstrap orchestrator that creates the DI container,
 * so it passes a pre-created loggerFactory to BaseOrchestrator rather
 * than receiving it as an injected dependency.
 */

import { app } from 'electron';
import path from 'path';
import { BaseOrchestrator } from '@shared/base/orchestrator.base.js';
import { createAppContainer } from './container.js';
import { MainLogger } from './infrastructure/logging/main-logger.factory.js';

class AppOrchestrator extends BaseOrchestrator {
  constructor() {
    // Create logger factory before calling super (bootstrap pattern)
    const loggerFactory = new MainLogger();

    // Call base constructor with pre-created loggerFactory
    super({ loggerFactory }, ['loggerFactory'], 'AppOrchestrator');

    // Container will be created during onInitialize()
    this.container = null;

    // Service references - populated during onInitialize()
    this._windowService = null;
    this._deviceService = null;
    this._deviceLifecycleService = null;
    this._trayService = null;
    this._ipcHandlerRegistry = null;
    this._updateService = null;
    this._deviceBridgeService = null;
    this._updateBridgeService = null;
  }

  /**
   * Initialize the application and DI container
   * Called by BaseOrchestrator.initialize()
   */
  async onInitialize() {
    this.logger.info('Starting PrismGB...');

    // Create DI container with shared logger factory (eliminates duplicate instance)
    this.container = await createAppContainer(this.loggerFactory);

    // Resolve and cache core services
    this._windowService = this.container.resolve('windowService');
    this._deviceService = this.container.resolve('deviceService');
    this._deviceLifecycleService = this.container.resolve('deviceLifecycleService');
    this._trayService = this.container.resolve('trayService');
    this._ipcHandlerRegistry = this.container.resolve('ipcHandlerRegistry');
    this._updateService = this.container.resolve('updateService');
    this._deviceBridgeService = this.container.resolve('deviceBridgeService');
    this._updateBridgeService = this.container.resolve('updateBridgeService');

    // Initialize device service (loads device profiles)
    await this._deviceService.initialize();

    // Initialize device lifecycle service (handles auto-launch)
    this._deviceLifecycleService.initialize();

    // Initialize update bridge and start auto-check (1 hour interval)
    this._updateBridgeService.initialize();

    // Start USB monitoring for hot-plug detection
    this._deviceService.startUSBMonitoring();

    // Subscribe to device events via bridge
    this._deviceBridgeService.initialize();

    // Create system tray
    this._trayService.createTray();

    // Set dock icon in dev mode (macOS only)
    // In production, macOS uses icon.icns from app bundle automatically
    if (process.platform === 'darwin' && !app.isPackaged) {
      const iconPath = path.join(app.getAppPath(), 'assets/icon.png');
      app.dock.setIcon(iconPath);
      this.logger.debug(`Set dock icon: ${iconPath}`);
    }

    // Register IPC handlers
    this._ipcHandlerRegistry.registerHandlers();

    // Wait for USB monitoring to initialize and enumerate devices
    // usb-detection needs time to populate its device cache after startMonitoring()
    await new Promise(resolve => setTimeout(resolve, 500));

    // Create main window immediately
    this._windowService.createWindow();

    // Check for already connected devices
    const deviceFound = await this._deviceService.checkForDevice();
    if (deviceFound) {
      this.logger.info('Device already connected');
    }

    this.logger.info('PrismGB initialized successfully');
  }

  /**
   * Cleanup on app quit
   * Called by BaseOrchestrator.cleanup()
   */
  async onCleanup() {
    this.logger.info('Shutting down PrismGB...');

    if (!this.container) {
      this.logger.info('No container to cleanup');
      return;
    }

    try {
      if (this._windowService?.mainWindow) {
        const win = this._windowService.mainWindow;
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
      if (this._ipcHandlerRegistry) {
        this._ipcHandlerRegistry.dispose();
        this.logger.debug('Disposed IPC handler registry');
      }
    } catch (error) {
      this.logger.error('Error disposing IPC handler registry:', error);
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
      if (this._deviceLifecycleService) {
        this._deviceLifecycleService.dispose();
        this.logger.debug('Disposed device lifecycle service');
      }
    } catch (error) {
      this.logger.error('Error disposing device lifecycle service:', error);
    }

    try {
      // Stop USB monitoring
      if (this._deviceService) {
        this._deviceService.stopUSBMonitoring();
        this.logger.debug('Stopped USB monitoring');
      }
    } catch (error) {
      this.logger.error('Error stopping USB monitoring:', error);
    }

    try {
      // Destroy tray
      if (this._trayService) {
        this._trayService.destroy();
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
    this._windowService = null;
    this._deviceService = null;
    this._deviceLifecycleService = null;
    this._trayService = null;
    this._ipcHandlerRegistry = null;
    this._updateService = null;
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

export { AppOrchestrator };
