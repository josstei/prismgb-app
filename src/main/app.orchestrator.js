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
import { safeDisposeAll } from '@shared/utils/safe-disposer.utils.js';
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

    // Window cleanup requires special handling (isDestroyed check, devtools)
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

    // Dispose services using safe utility (eliminates repetitive try-catch)
    await safeDisposeAll(this.logger, [
      ['IPC handler registry', this._ipcHandlerRegistry],
      ['device bridge service', this._deviceBridgeService],
      ['device lifecycle service', this._deviceLifecycleService],
      ['device service (USB monitoring)', this._deviceService, 'stopUSBMonitoring'],
      ['system tray', this._trayService, 'destroy'],
      ['update bridge service', this._updateBridgeService],
      ['DI container', this.container]
    ]);

    // Clear service references
    this.container = null;
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
