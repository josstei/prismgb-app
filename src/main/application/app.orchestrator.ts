/**
 * Application Orchestrator
 * Coordinates main process services and application lifecycle
 */

import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { BaseOrchestrator } from '@prismgb/core';
import { safeDisposeAll } from '@prismgb/core';
import type { MainServiceContainer } from './container.js';
import type { MainLogger } from '@main/infrastructure/logging/logger.factory.js';
import type { WindowService } from '@main/infrastructure/window/window.service.js';
import type { DeviceService } from '@prismgb/devices/service';
import type { DeviceLifecycleService } from '@prismgb/devices/service';
import type { TrayService } from '@main/infrastructure/tray/tray.service.js';
import type { IpcHandlerRegistry } from '@main/ipc/ipc-handler.registry.js';
import type { UpdateService } from '@prismgb/updates';
import type { DeviceBridgeService } from '@prismgb/devices/service';
import type { UpdateBridge } from '@prismgb/updates';
import type { TranscodeService } from '@prismgb/transcode/service';
import type { LoginItemService } from '@main/infrastructure/window/login-item.service.js';

function resolveDevDockIconPath(appPath: string): string | null {
  const candidates = [
    path.join(appPath, 'assets/icon.png'),
    path.join(process.cwd(), 'assets/icon.png')
  ];

  return candidates.find(candidate => fs.existsSync(candidate)) ?? null;
}

export class AppOrchestrator extends BaseOrchestrator {

  private readonly loggerFactory: MainLogger;
  private container: MainServiceContainer | null = null;
  private _windowService: WindowService | null = null;
  private _deviceService: DeviceService | null = null;
  private _deviceLifecycleService: DeviceLifecycleService | null = null;
  private _trayService: TrayService | null = null;
  private _ipcHandlerRegistry: IpcHandlerRegistry | null = null;
  private _updateService: UpdateService | null = null;
  private _deviceBridgeService: DeviceBridgeService | null = null;
  private _updateBridgeService: UpdateBridge | null = null;
  private _transcodeService: TranscodeService | null = null;
  private _loginItemService: LoginItemService | null = null;

  constructor(container: MainServiceContainer) {
    super(container.cradle, 'AppOrchestrator');
    this.container = container;
    this.loggerFactory = container.resolve('loggerFactory');
  }

  /**
   * Initialize the application and DI container
   * Called by BaseOrchestrator.initialize()
   */
  async onInitialize(): Promise<void> {
    this.logger.info('Starting PrismGB...');

    const container = this.container!;

    // Resolve and cache core services
    this._windowService = container.resolve('windowService');
    this._deviceService = container.resolve('deviceService');
    this._deviceLifecycleService = container.resolve('deviceLifecycleService');
    this._trayService = container.resolve('trayService');
    this._ipcHandlerRegistry = container.resolve('ipcHandlerRegistry');
    this._updateService = container.resolve('updateService');
    this._deviceBridgeService = container.resolve('deviceBridgeService');
    this._updateBridgeService = container.resolve('updateBridgeService');
    this._transcodeService = container.resolve('transcodeService');
    this._loginItemService = container.resolve('loginItemService');


    // Initialize device lifecycle service (handles auto-launch)
    this._deviceLifecycleService!.initialize();

    // Initialize update bridge and start auto-check (1 hour interval)
    this._updateBridgeService!.initialize();

    // Initialize transcode service (validates ffmpeg binaries)
    this._transcodeService!.initialize();

    // Start USB monitoring for hot-plug detection
    this._deviceService!.startUSBMonitoring();

    // Subscribe to device events via bridge
    this._deviceBridgeService!.initialize();

    // Create system tray
    this._trayService!.createTray();

    // Set dock icon in dev mode (macOS only)
    // In production, macOS uses icon.icns from app bundle automatically
    if (process.platform === 'darwin' && !app.isPackaged) {
      const iconPath = resolveDevDockIconPath(app.getAppPath());
      if (iconPath) {
        app.dock?.setIcon(iconPath);
        this.logger.debug(`Set dock icon: ${iconPath}`);
      } else {
        this.logger.warn('Dock icon not found; continuing without custom dock icon');
      }
    }

    // Register IPC handlers
    this._ipcHandlerRegistry!.registerHandlers();

    // Wait for USB monitoring to initialize and enumerate devices.
    await new Promise(resolve => setTimeout(resolve, 500));

    // Detect hidden launch (login item / auto-start)
    const isHiddenLaunch = this._loginItemService!.wasLaunchedAsHidden();
    if (isHiddenLaunch) {
      this.logger.info('Hidden launch detected - starting in system tray');
    }

    // Create main window (hidden if launched as login item)
    const mainWindow = this._windowService!.createWindow({ hidden: isHiddenLaunch });
    this._ipcHandlerRegistry!.attachWindow(mainWindow);

    // Check for already connected devices
    const deviceFound = await this._deviceService!.refreshDeviceStatus();
    if (deviceFound) {
      this.logger.info('Device already connected');
    }

    this.logger.info('PrismGB initialized successfully');
  }

  /**
   * Cleanup on app quit
   * Called by BaseOrchestrator.cleanup()
   */
  async onCleanup(): Promise<void> {
    this.logger.info('Shutting down PrismGB...');

    if (!this.container) {
      this.logger.info('No container to cleanup');
      return;
    }

    // Window cleanup is safely handled by the window service
    try {
      this._windowService?.destroyWindow();
    } catch (error) {
      this.logger.error('Error destroying window during cleanup:', error);
    }

    // Dispose services using safe utility (eliminates repetitive try-catch)
    await safeDisposeAll(this.logger, [
      ['IPC handler registry', this._ipcHandlerRegistry],
      ['device bridge service', this._deviceBridgeService],
      ['device lifecycle service', this._deviceLifecycleService],
      ['device service (USB monitoring)', this._deviceService, 'stopUSBMonitoring'],
      ['system tray', this._trayService, 'destroy'],
      ['update bridge service', this._updateBridgeService],
      ['transcode service', this._transcodeService]
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
    this._transcodeService = null;
    this._loginItemService = null;

    this.logger.info('PrismGB shutdown complete');
  }
}


