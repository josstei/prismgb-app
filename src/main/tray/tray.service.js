/**
 * Tray Service
 * Handles system tray icon and menu
 */

import { Tray, Menu, app } from 'electron';
import path from 'path';
import { BaseService } from '@shared/base/service.js';

// Declarative menu configuration
const MENU_CONFIG = [
  {
    label: 'Show Window',
    service: 'windowService',
    method: 'showWindow'
  },
  {
    label: 'Refresh Devices',
    service: 'deviceService',
    method: 'checkForDevice'
  }
];

class TrayService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['windowService', 'deviceService', 'loggerFactory'], 'TrayService');
    this.tray = null;
  }

  /**
   * Create system tray icon
   */
  createTray() {
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
  updateTrayMenu() {
    if (!this.tray) return;

    const isDeviceConnected = this.deviceService ? this.deviceService.isConnected() : false;

    // Build dynamic menu items from config
    const menuItems = MENU_CONFIG.map(({ label, service, method }) => ({
      label,
      click: () => this[service]?.[method]?.()
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
  destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

export { TrayService };
