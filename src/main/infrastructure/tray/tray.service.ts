/**
 * Tray Service
 * Handles system tray icon and menu
 */

import { Tray, Menu, app, MenuItemConstructorOptions } from 'electron';
import path from 'path';
import { BaseService } from '@shared/base/service.base.js';

/**
 * Menu configuration item
 */
interface MenuConfigItem {
  label: string;
  service: 'windowService' | 'deviceService';
  method: string;
}

/**
 * TrayService dependencies
 */
interface TrayServiceDependencies {
  windowService: {
    showWindow: () => void;
  };
  deviceService: {
    refreshDeviceStatus: () => void;
    isConnected: () => boolean;
  };
  loggerFactory: {
    create: (name: string) => {
      info: (message: string) => void;
      error: (message: string) => void;
      warn: (message: string) => void;
      debug: (message: string) => void;
    };
  };
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
    service: 'deviceService',
    method: 'refreshDeviceStatus'
  }
];

class TrayService extends BaseService {
  private tray: Tray | null = null;
  private readonly windowService: TrayServiceDependencies['windowService'];
  private readonly deviceService: TrayServiceDependencies['deviceService'];

  constructor(dependencies: TrayServiceDependencies) {
    super(dependencies, ['windowService', 'deviceService', 'loggerFactory'], 'TrayService');
    this.windowService = dependencies.windowService;
    this.deviceService = dependencies.deviceService;
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

    const isDeviceConnected = this.deviceService ? this.deviceService.isConnected() : false;

    // Build dynamic menu items from config
    const menuItems: MenuItemConstructorOptions[] = MENU_CONFIG.map(({ label, service, method }) => ({
      label,
      click: () => {
        const serviceInstance = this[service];
        if (serviceInstance && typeof serviceInstance[method] === 'function') {
          serviceInstance[method]();
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
