/**
 * Application Orchestrator
 * Coordinates main process services and application lifecycle
 */

import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { injectable, inject } from 'inversify';
import { BaseOrchestrator, safeDisposeAll } from '@platform/core';
import { TOKENS } from './di/tokens';
import type { MainLogger } from '@main/infrastructure/logging/logger.factory';
import type { WindowService } from '@main/infrastructure/window/window.service';
import type { DeviceConnectionService } from '@main/infrastructure/devices/device-connection.service';
import type { DeviceIntegrationService } from '@main/infrastructure/devices/device-integration.service';
import type { TrayService } from '@main/infrastructure/tray/tray.service';
import type { IpcHandlerRegistry } from '@main/ipc/ipc-handler.registry';
import type { AutoUpdateService } from '@main/infrastructure/updates/auto-update.service';
import type { TranscodeService } from '@main/infrastructure/transcode/transcode.service';
import type { LoginItemService } from '@main/infrastructure/system/login-item.service';

function resolveDevDockIconPath(appPath: string): string | null {
  const candidates = [
    path.join(appPath, 'assets/icon.png'),
    path.join(process.cwd(), 'assets/icon.png')
  ];

  return candidates.find(candidate => fs.existsSync(candidate)) ?? null;
}

@injectable()
export class AppOrchestrator extends BaseOrchestrator {

  constructor(
    @inject(TOKENS.windowService) private readonly windowService: WindowService,
    @inject(TOKENS.deviceConnectionService) private readonly deviceConnectionService: DeviceConnectionService,
    @inject(TOKENS.deviceIntegrationService) private readonly deviceIntegrationService: DeviceIntegrationService,
    @inject(TOKENS.trayService) private readonly trayService: TrayService,
    @inject(TOKENS.ipcHandlerRegistry) private readonly ipcHandlerRegistry: IpcHandlerRegistry,
    @inject(TOKENS.autoUpdateService) private readonly autoUpdateService: AutoUpdateService,
    @inject(TOKENS.transcodeService) private readonly transcodeService: TranscodeService,
    @inject(TOKENS.loginItemService) private readonly loginItemService: LoginItemService,
    @inject(TOKENS.loggerFactory) loggerFactory: MainLogger
  ) {
    super(loggerFactory, 'AppOrchestrator');
  }

  /**
   * Initialize the application and DI container
   * Called by BaseOrchestrator.initialize()
   */
  async onInitialize(): Promise<void> {
    this.logger.info('Starting PrismGB...');

    // Subscribe app-owned device side effects before the first runtime reconciliation.
    this.deviceIntegrationService.initialize();

    this.autoUpdateService.initialize();

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

    this.deviceConnectionService.initialize();

    const status = this.deviceConnectionService.reconcileDeviceStatus('startup');
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

    // Window cleanup is safely handled by the window service
    try {
      this.windowService.destroyWindow();
    } catch (error) {
      this.logger.error('Error destroying window during cleanup:', error);
    }

    await safeDisposeAll(this.logger, [
      ['IPC handler registry', () => this.ipcHandlerRegistry.dispose()],
      ['device integration service', () => this.deviceIntegrationService.dispose()],
      ['device connection service', () => this.deviceConnectionService.dispose()],
      ['system tray', () => this.trayService.dispose()],
      ['auto-update service', () => this.autoUpdateService.dispose()],
      ['transcode service', () => this.transcodeService.dispose()]
    ]);

    this.logger.info('PrismGB shutdown complete');
  }
}
