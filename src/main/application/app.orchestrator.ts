/**
 * Application Orchestrator
 * Coordinates main process services and application lifecycle
 */

import { app } from 'electron';
import fs from 'fs';
import path from 'path';

import { BaseOrchestrator, type LoggerFactoryLike } from '@platform/core';
import { disposeInOrder } from '@platform/core';

import type { WindowService } from '@main/infrastructure/window/window.service.js';
import type { DeviceConnectionService } from '@platform/devices/runtime';
import type { DeviceIntegrationService } from '@main/infrastructure/devices/device-integration.service.js';
import type { TrayService } from '@main/infrastructure/tray/tray.service.js';
import type { IpcHandlerRegistry } from '@main/ipc/ipc-handler.registry.js';
import type { UpdateService } from '@platform/updates';
import type { TranscodeService } from '@platform/transcode/service';
import type { LoginItemService } from '@main/infrastructure/window/login-item.service.js';

function resolveDevDockIconPath(appPath: string): string | null {
  const candidates = [
    path.join(appPath, 'assets/icon.png'),
    path.join(process.cwd(), 'assets/icon.png')
  ];

  return candidates.find(candidate => fs.existsSync(candidate)) ?? null;
}

type AppOrchestratorDependencies = {
  windowService: WindowService;
  deviceConnectionService: DeviceConnectionService;
  deviceIntegrationService: DeviceIntegrationService;
  trayService: TrayService;
  ipcHandlerRegistry: IpcHandlerRegistry;
  updateService: UpdateService;
  transcodeService: TranscodeService;
  loginItemService: LoginItemService;
  loggerFactory: LoggerFactoryLike;
};

export class AppOrchestrator extends BaseOrchestrator {

  private readonly windowService: WindowService;
  private readonly deviceConnectionService: DeviceConnectionService;
  private readonly deviceIntegrationService: DeviceIntegrationService;
  private readonly trayService: TrayService;
  private readonly ipcHandlerRegistry: IpcHandlerRegistry;
  private readonly updateService: UpdateService;
  private readonly transcodeService: TranscodeService;
  private readonly loginItemService: LoginItemService;

  constructor({ windowService, deviceConnectionService, deviceIntegrationService, trayService, ipcHandlerRegistry, updateService, transcodeService, loginItemService, loggerFactory }: AppOrchestratorDependencies) {
    super({ loggerFactory }, 'AppOrchestrator');
    this.windowService = windowService;
    this.deviceConnectionService = deviceConnectionService;
    this.deviceIntegrationService = deviceIntegrationService;
    this.trayService = trayService;
    this.ipcHandlerRegistry = ipcHandlerRegistry;
    this.updateService = updateService;
    this.transcodeService = transcodeService;
    this.loginItemService = loginItemService;
  }

  /**
   * Initialize the application services
   * Called by BaseOrchestrator.initialize()
   */
  async onInitialize(): Promise<void> {
    this.logger.info('Starting PrismGB...');

    // Subscribe app-owned device side effects before the first runtime reconciliation.
    this.deviceIntegrationService.initialize();

    await this.updateService.initialize();
    this.updateService.startAutoCheck(3600000);

    // Initialize transcode service (validates ffmpeg binaries)
    this.transcodeService.initialize();

    // Create system tray
    this.trayService.createTray();

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
    this.ipcHandlerRegistry.registerHandlers();

    // Detect hidden launch (login item / auto-start)
    const isHiddenLaunch = this.loginItemService.wasLaunchedAsHidden();
    if (isHiddenLaunch) {
      this.logger.info('Hidden launch detected - starting in system tray');
    }

    // Create main window (hidden if launched as login item)
    const mainWindow = this.windowService.createWindow({ hidden: isHiddenLaunch });
    this.ipcHandlerRegistry.attachWindow(mainWindow);

    await this.deviceConnectionService.initialize();

    const status = await this.deviceConnectionService.reconcileDeviceStatus('startup');
    if (status.connected) {
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

    await disposeInOrder([
      () => this.deviceConnectionService.dispose(),
      () => this.deviceIntegrationService.dispose(),
      () => this.updateService.dispose(),
      () => this.transcodeService.dispose(),
      () => this.ipcHandlerRegistry.dispose(),
      () => this.trayService.destroy(),
      () => this.windowService.destroyWindow()
    ]);

    this.logger.info('PrismGB shutdown complete');
  }
}
