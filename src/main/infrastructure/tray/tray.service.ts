/**
 * Tray Service
 * Handles system tray icon and menu
 */

import { Tray, Menu, app, MenuItemConstructorOptions } from 'electron';
import path from 'path';
import { injectable, inject } from 'inversify';
import { BaseService, type LoggerFactoryLike } from '@platform/core';
import type { DeviceConnectionReason } from '@platform/devices/runtime';
import { TOKENS } from '@main/application/di/tokens.js';

/**
 * Menu configuration item
 */
interface MenuConfigItem {
  label: string;
  service: 'windowService' | 'deviceConnectionService';
  method: 'showWindow' | 'reconcileDeviceStatus';
}

interface TrayWindowServiceLike {
  showWindow: () => void;
}

interface TrayDeviceConnectionServiceLike {
  reconcileDeviceStatus: (reason: DeviceConnectionReason) => Promise<unknown>;
  isConnected: () => boolean;
}

// Declarative menu configuration
const MENU_CONFIG: MenuConfigItem[] = [
  {
    label: 'Show Window',
    service: 'windowService',
    method: 'showWindow'
  },
  {
    label: 'Refresh Devices',
    service: 'deviceConnectionService',
    method: 'reconcileDeviceStatus'
  }
];

@injectable()
class TrayService extends BaseService {
  private tray: Tray | null = null;

  constructor(
    @inject(TOKENS.windowService) private readonly windowService: TrayWindowServiceLike,
    @inject(TOKENS.deviceConnectionService) private readonly deviceConnectionService: TrayDeviceConnectionServiceLike,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactoryLike
  ) {
    super({ loggerFactory }, 'TrayService');
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
      ? path.join(appPath, 'dist/renderer/assets/tray-icon.png')
      : path.join(appPath, 'assets/tray-icon.png');

    this.logger.info('Creating system tray icon');

    this.tray = new Tray(trayIconPath);
    this.tray.setToolTip('PrismGB - Monitoring for device');

    this.updateTrayMenu();

    this.tray.on('click', () => {
      if (this.windowService) {
        this.windowService.showWindow();
      }
    });

    return this.tray;
  }

  /**
   * Update tray menu with current device status
   */
  updateTrayMenu(): void {
    if (!this.tray) return;

    const isDeviceConnected = this.deviceConnectionService.isConnected();

    // Build dynamic menu items from config
    const menuItems: MenuItemConstructorOptions[] = MENU_CONFIG.map(({ label, service, method }) => ({
      label,
      click: () => {
        if (service === 'windowService' && method === 'showWindow') {
          this.windowService.showWindow();
          return;
        }

        if (service === 'deviceConnectionService' && method === 'reconcileDeviceStatus') {
          void this.deviceConnectionService.reconcileDeviceStatus('tray-refresh').catch((error: unknown) => {
            this.logger.error('Failed to refresh devices from tray', error);
          });
        }
      }
    }));

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
      ...menuItems,
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
