/**
 * Tray Service
 * Handles system tray icon and menu
 */

import { Tray, Menu, app } from 'electron';
import path from 'path';
import { fileURLToPath } from 'node:url';

import { BaseService, type LoggerFactoryLike } from '@platform/core';
import type { DeviceConnectionReason } from '@platform/devices/runtime';

interface TrayWindowServiceLike {
  showWindow: () => void;
}

interface TrayDeviceConnectionServiceLike {
  reconcileDeviceStatus: (reason: DeviceConnectionReason) => Promise<unknown>;
  isConnected: () => boolean;
}

type TrayServiceDependencies = {
  windowService: TrayWindowServiceLike;
  deviceConnectionService: TrayDeviceConnectionServiceLike;
  loggerFactory: LoggerFactoryLike;
};

class TrayService extends BaseService {
  private tray: Tray | null = null;

  private readonly windowService: TrayWindowServiceLike;
  private readonly deviceConnectionService: TrayDeviceConnectionServiceLike;

  constructor({ windowService, deviceConnectionService, loggerFactory }: TrayServiceDependencies) {
    super({ loggerFactory }, 'TrayService');
    this.windowService = windowService;
    this.deviceConnectionService = deviceConnectionService;
  }

  /**
   * Create system tray icon
   */
  createTray(): Tray | null {
    // Skip tray creation in test mode
    if (process.env.DISABLE_TRAY === 'true') {
      this.logger.info('Tray disabled via DISABLE_TRAY environment variable');
      return null;
    }

    const appPath = app.getAppPath();
    const trayIconPath = app.isPackaged
      ? path.join(appPath, 'dist/renderer/tray-icon.png')
      : process.env.ELECTRON_IS_DEV === '0'
        ? fileURLToPath(new URL('../renderer/tray-icon.png', import.meta.url))
        : path.join(appPath, 'assets/tray-icon.png');

    this.logger.info('Creating system tray icon');

    this.tray = new Tray(trayIconPath);
    this.tray.setToolTip('PrismGB - Monitoring for device');

    this.updateTrayMenu();

    this.tray.on('click', () => this.windowService.showWindow());

    return this.tray;
  }

  /**
   * Update tray menu with current device status
   */
  updateTrayMenu(): void {
    if (!this.tray) return;

    const isDeviceConnected = this.deviceConnectionService.isConnected();

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'PrismGB',
        enabled: false
      },
      { type: 'separator' },
      {
        label: isDeviceConnected ? 'Device Connected' : 'Device Disconnected',
        enabled: false
      },
      { type: 'separator' },
      {
        label: 'Show Window',
        click: () => this.windowService.showWindow()
      },
      {
        label: 'Refresh Devices',
        click: () => {
          void this.deviceConnectionService.reconcileDeviceStatus('tray-refresh').catch((error: unknown) => {
            this.logger.error('Failed to refresh devices from tray', error);
          });
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit();
        }
      }
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  /**
   * Destroy the tray icon
   */
  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

export { TrayService };
