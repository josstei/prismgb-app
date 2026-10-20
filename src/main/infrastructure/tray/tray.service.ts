import { Tray, Menu, app } from 'electron';
import path from 'path';
import { injectable, inject } from 'inversify';
import { BaseService, type LoggerFactory } from '@platform/core';
import type { DeviceConnectionService } from '@main/infrastructure/devices/device-connection.service';
import type { WindowService } from '@main/infrastructure/window/window.service';
import { TOKENS } from '@main/application/di/tokens';

@injectable()
export class TrayService extends BaseService {
  private tray: Tray | null = null;

  constructor(
    @inject(TOKENS.windowService) private readonly windowService: WindowService,
    @inject(TOKENS.deviceConnectionService) private readonly deviceConnectionService: DeviceConnectionService,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactory
  ) {
    super(loggerFactory, 'TrayService');
  }

  createTray(): void {
    if (process.env.DISABLE_TRAY === 'true') {
      this.logger.info('Tray disabled via DISABLE_TRAY environment variable');
      return;
    }

    const appPath = app.getAppPath();
    const trayIconPath = app.isPackaged
      ? path.join(appPath, 'dist/renderer/assets/tray-icon.png')
      : path.join(appPath, 'assets/tray-icon.png');

    this.logger.info('Creating system tray icon');

    this.tray = new Tray(trayIconPath);
    this.tray.setToolTip('PrismGB - Monitoring for device');
    this.updateTrayMenu();
    this.tray.on('click', () => this.windowService.showWindow());
  }

  updateTrayMenu(): void {
    if (!this.tray) return;

    const connected = this.deviceConnectionService.getStatus().connected;
    this.tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'PrismGB', enabled: false },
      { type: 'separator' },
      { label: connected ? 'Device Connected' : 'Device Disconnected', enabled: false },
      { type: 'separator' },
      { label: 'Show Window', click: () => this.windowService.showWindow() },
      { label: 'Refresh Devices', click: () => this.deviceConnectionService.reconcileDeviceStatus('tray-refresh') },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ]));
  }

  override dispose(): Promise<void> {
    this.tray?.destroy();
    this.tray = null;
    return super.dispose();
  }
}
