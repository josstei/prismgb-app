/**
 * Tray Manager
 * Handles system tray icon and menu
 */

import { Tray, Menu, app } from 'electron';
import path from 'path';

// Declarative menu configuration
const MENU_CONFIG = [
  {
    label: 'Show Window',
    service: 'windowManager',
    method: 'showWindow'
  },
  {
    label: 'Refresh Devices',
    service: 'deviceManager',
    method: 'checkForDevice'
  }
];

class TrayManager {
  constructor({ windowManager, deviceManager, loggerFactory }) {
    this.logger = loggerFactory.create('TrayManager');
    this.tray = null;
    this.windowManager = windowManager;
    this.deviceManager = deviceManager;
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
      if (this.windowManager) {
        this.windowManager.showWindow();
      }
    });

    return this.tray;
  }

  /**
   * Update tray menu with current device status
   */
  updateTrayMenu() {
    if (!this.tray) return;

    const isDeviceConnected = this.deviceManager ? this.deviceManager.isConnected() : false;

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

export default TrayManager;
