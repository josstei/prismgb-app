/**
 * Device Bridge
 *
 * Bridges device connection events to tray updates and renderer IPC.
 */

import { BaseService } from '@prismgb/core';
import type { ILoggerFactory as LoggerFactory } from '@prismgb/core';
import { IPC_CHANNELS } from '@prismgb/ipc';
import type { IEventBus as EventBus } from '@prismgb/events';
import type { DeviceService } from './device.service.js';

interface TrayService {
  updateTrayMenu(): void;
}

interface WindowService {
  send(channel: string, ...args: unknown[]): void;
}

const MainEventChannels = {
  DEVICE: {
    CONNECTION_CHANGED: 'device:connection-changed' as const,
    CHECK_ERROR: 'device:check-error' as const
  }
};

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
