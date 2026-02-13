/**
 * Device Event Handler
 *
 * Handles device connection events:
 * - Bridges events to tray updates and renderer IPC
 * - Manages device auto-launch sequence
 */

import { BaseService } from '@prismgb/core';
import { channels as IPC_CHANNELS } from '@prismgb/ipc';
import { appConfig } from '@main/infrastructure/config/config-loader.utils';
import { MainEventChannels } from '@main/infrastructure/events/event-channels.config.js';
import type { DeviceService } from './device.service.js';
import type { TrayService } from '@main/infrastructure/tray/tray.service.js';
import type { WindowService } from '@main/infrastructure/window/window.service.js';
import type { EventBus } from '@main/infrastructure/events/event-bus.js';
import type { LoggerFactory } from '@main/infrastructure/logging/logger.interface.js';

const { DEVICE_LAUNCH_DELAY } = appConfig;

interface DeviceStatus {
  connected: boolean;
  device: Record<string, unknown> | null;
}

interface DeviceEventHandlerDependencies {
  deviceService: DeviceService;
  trayService: TrayService;
  windowService: WindowService;
  eventBus: EventBus;
  loggerFactory: LoggerFactory;
}

class DeviceEventHandler extends BaseService {

  private readonly deviceService: DeviceService;
  private readonly trayService: TrayService;
  private readonly windowService: WindowService;
  private readonly eventBus: EventBus;
  private _unsubscribe: (() => void) | null;
  private _launchTimeoutId: NodeJS.Timeout | null;

  constructor(dependencies: DeviceEventHandlerDependencies) {
    super(
      dependencies,
      ['deviceService', 'trayService', 'windowService', 'eventBus', 'loggerFactory'],
      'DeviceEventHandler'
    );

    this.deviceService = dependencies.deviceService;
    this.trayService = dependencies.trayService;
    this.windowService = dependencies.windowService;
    this.eventBus = dependencies.eventBus;
    this._unsubscribe = null;
    this._launchTimeoutId = null;
  }

  initialize(): void {
    this.logger.info('Initializing device event handler');

    if (this._unsubscribe) {
      this.logger.warn('Already initialized');
      return;
    }

    this._unsubscribe = this.eventBus.subscribe(
      MainEventChannels.DEVICE.CONNECTION_CHANGED,
      (status: DeviceStatus) => this._handleConnectionChanged(status)
    );

    this.logger.info('Device event handler initialized');
  }

  private _handleConnectionChanged(status: DeviceStatus): void {
    // Update tray menu
    this.trayService.updateTrayMenu();

    // Forward event to renderer via IPC
    if (status.connected) {
      this.logger.info('Device connected - scheduling window launch');
      this.windowService.send(IPC_CHANNELS.DEVICE.CONNECTED, status.device);
      this._launchWindow();
    } else {
      this.logger.info('Device disconnected');
      this.windowService.send(IPC_CHANNELS.DEVICE.DISCONNECTED);
    }
  }

  /**
   * Auto-launch window after device connection
   */
  private _launchWindow(): void {
    // Clear any pending launch timeout
    if (this._launchTimeoutId) {
      clearTimeout(this._launchTimeoutId);
    }

    this._launchTimeoutId = setTimeout(() => {
      this._launchTimeoutId = null;
      if (this.windowService) {
        this.logger.debug('Launching window');
        this.windowService.showWindow();
      }
    }, DEVICE_LAUNCH_DELAY);
  }

  /**
   * Cleanup and dispose of resources
   */
  dispose(): void {
    this.logger.info('Disposing device event handler');

    // Cancel any pending window launch
    if (this._launchTimeoutId) {
      clearTimeout(this._launchTimeoutId);
      this._launchTimeoutId = null;
    }

    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }

    this.logger.info('Device event handler disposed');
  }
}

export { DeviceEventHandler };
export type { DeviceEventHandlerDependencies, DeviceStatus };
