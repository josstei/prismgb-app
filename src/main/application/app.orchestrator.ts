import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { injectable, inject } from 'inversify';
import { BaseOrchestrator, safeDisposeAll, type LoggerFactory } from '@platform/core';
import { IPC_CHANNELS } from '@platform/ipc';
import { DeviceCatalog, type DeviceStatus } from '@platform/devices';
import { TOKENS } from './di/tokens';
import type { WindowService } from '@main/infrastructure/window/window.service';
import type {
  DeviceConnectionReason,
  DeviceConnectionService
} from '@main/infrastructure/devices/device-connection.service';
import type { TrayService } from '@main/infrastructure/tray/tray.service';
import type { IpcHost } from '@main/ipc/ipc.host';
import type { IpcPushBridge } from '@main/ipc/ipc-push.bridge';
import type { AutoUpdateService } from '@main/infrastructure/updates/auto-update.service';
import type { TranscodeService } from '@main/infrastructure/transcode/transcode.service';
import type { LoginItemService } from '@main/infrastructure/system/login-item.service';

const DEVICE_WINDOW_LAUNCH_KEY = Symbol('deviceWindowLaunch');

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
    @inject(TOKENS.trayService) private readonly trayService: TrayService,
    @inject(TOKENS.ipcHost) private readonly ipcHost: IpcHost,
    @inject(TOKENS.ipcPushBridge) private readonly ipcPushBridge: IpcPushBridge,
    @inject(TOKENS.autoUpdateService) private readonly autoUpdateService: AutoUpdateService,
    @inject(TOKENS.transcodeService) private readonly transcodeService: TranscodeService,
    @inject(TOKENS.loginItemService) private readonly loginItemService: LoginItemService,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactory
  ) {
    super(loggerFactory, 'AppOrchestrator');
  }

  override async onInitialize(): Promise<void> {
    this.logger.info('Starting PrismGB...');

    // Subscribed before the first reconciliation so the startup status reaches tray and renderer.
    this.disposables.add(this.deviceConnectionService.onStatusChanged(
      (status, reason) => this.onDeviceStatusChanged(status, reason)
    ));

    this.autoUpdateService.initialize();
    this.transcodeService.initialize();
    this.trayService.createTray();

    // In production, macOS uses icon.icns from the app bundle.
    if (process.platform === 'darwin' && !app.isPackaged) {
      const iconPath = resolveDevDockIconPath(app.getAppPath());
      if (iconPath) {
        app.dock?.setIcon(iconPath);
        this.logger.debug(`Set dock icon: ${iconPath}`);
      } else {
        this.logger.warn('Dock icon not found; continuing without custom dock icon');
      }
    }

    this.ipcHost.registerHandlers();

    const isHiddenLaunch = this.loginItemService.wasLaunchedAsHidden();
    if (isHiddenLaunch) {
      this.logger.info('Hidden launch detected - starting in system tray');
    }

    const mainWindow = this.windowService.createWindow({ hidden: isHiddenLaunch });
    this.ipcHost.attachWindow(mainWindow);

    this.deviceConnectionService.initialize();

    const status = this.deviceConnectionService.reconcileDeviceStatus('startup');
    if (status.connected) {
      this.logger.info('Device already connected');
    }

    this.logger.info('PrismGB initialized successfully');
  }

  override async onCleanup(): Promise<void> {
    this.logger.info('Shutting down PrismGB...');
    this.disposables.cancel(DEVICE_WINDOW_LAUNCH_KEY);

    try {
      this.windowService.destroyWindow();
    } catch (error) {
      this.logger.error('Error destroying window during cleanup:', error);
    }

    await safeDisposeAll(this.logger, [
      ['IPC host', () => this.ipcHost.dispose()],
      ['device connection service', () => this.deviceConnectionService.dispose()],
      ['system tray', () => this.trayService.dispose()],
      ['auto-update service', () => this.autoUpdateService.dispose()],
      ['transcode service', () => this.transcodeService.dispose()]
    ]);

    this.logger.info('PrismGB shutdown complete');
  }

  private onDeviceStatusChanged(status: DeviceStatus, reason: DeviceConnectionReason): void {
    this.trayService.updateTrayMenu();

    if (status.connected && status.device) {
      this.ipcPushBridge.emit(IPC_CHANNELS.DEVICE.CONNECTED, status.device);
      this.disposables.schedule(
        DEVICE_WINDOW_LAUNCH_KEY,
        () => this.windowService.showWindow(),
        DeviceCatalog.get(status.device.id)!.behavior.showWindowOnConnectDelayMs
      );
      this.logger.info(`Device connected via ${reason}`);
      return;
    }

    this.disposables.cancel(DEVICE_WINDOW_LAUNCH_KEY);
    this.ipcPushBridge.emit(IPC_CHANNELS.DEVICE.DISCONNECTED);
    this.logger.info(`Device disconnected via ${reason}`);
  }
}
