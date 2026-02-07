/**
 * Device Bridge
 *
 * Bridges device connection events to tray updates and renderer IPC.
 */

import { BaseService } from '@shared/base/service.base.js';
import { channels as IPC_CHANNELS } from '@shared/ipc/channels.config.js';
import { MainEventChannels } from '@main/infrastructure/events/event-channels.config.js';
import type { DeviceService } from './device.service.js';
import type { TrayService } from '@main/infrastructure/tray/tray.service.js';
import type { WindowService } from '@main/infrastructure/window/window.service.js';
import type { EventBus } from '@main/infrastructure/events/event-bus.js';
import type { LoggerFactory } from '@main/infrastructure/logging/logger.interface.js';

interface DeviceStatus {
  connected: boolean;
  device: Record<string, unknown> | null;
}

interface DeviceBridgeServiceDependencies {
  deviceService: DeviceService;
  trayService: TrayService;
  windowService: WindowService;
  eventBus: EventBus;
  loggerFactory: LoggerFactory;
}

class DeviceBridgeService extends BaseService {

  private readonly deviceService: DeviceService;
  private readonly trayService: TrayService;
  private readonly windowService: WindowService;
  private readonly eventBus: EventBus;
  private _unsubscribe: (() => void) | null;

  constructor(dependencies: DeviceBridgeServiceDependencies) {
    super(
      dependencies,
      ['deviceService', 'trayService', 'windowService', 'eventBus', 'loggerFactory'],
      'DeviceBridgeService'
    );

    this.deviceService = dependencies.deviceService;
    this.trayService = dependencies.trayService;
    this.windowService = dependencies.windowService;
    this.eventBus = dependencies.eventBus;
    this._unsubscribe = null;
  }

  initialize(): void {
    if (this._unsubscribe) {
      return;
    }

    this._unsubscribe = this.eventBus.subscribe(
      MainEventChannels.DEVICE.CONNECTION_CHANGED,
      (status: DeviceStatus) => this._handleConnectionChanged(status)
    );
  }

  private _handleConnectionChanged(status: DeviceStatus): void {
    this.trayService.updateTrayMenu();

    if (status.connected) {
      this.windowService.send(IPC_CHANNELS.DEVICE.CONNECTED, status.device);
    } else {
      this.windowService.send(IPC_CHANNELS.DEVICE.DISCONNECTED);
    }
  }

  dispose(): void {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  }
}

export { DeviceBridgeService };
export type { DeviceBridgeServiceDependencies, DeviceStatus };
