
import { BaseService } from '@platform/core';
import { appConfig } from '@platform/config';
import { IPC_CHANNELS } from '@platform/ipc';
import { DeviceCatalog, type DeviceStatus } from '@platform/devices';
import type {
  DeviceConnectionReason,
  DeviceConnectionService
} from '@platform/devices/runtime';
import type { LoggerFactoryLike } from '@platform/core';
import type { IpcPushPublisher } from '@platform/ipc';
import type { TrayService } from '@main/infrastructure/tray/tray.service.js';
import type { WindowService } from '@main/infrastructure/window/window.service.js';

const WINDOW_LAUNCH_LIFECYCLE = Symbol('deviceIntegrationWindowLaunch');

type DeviceIntegrationServiceDependencies = {
  deviceConnectionService: DeviceConnectionService;
  trayService: TrayService;
  windowService: WindowService;
  pushPublisher: IpcPushPublisher;
  loggerFactory: LoggerFactoryLike;
};

export class DeviceIntegrationService extends BaseService {
  private readonly deviceConnectionService: DeviceConnectionService;
  private readonly trayService: TrayService;
  private readonly windowService: WindowService;
  private readonly pushPublisher: IpcPushPublisher;

  constructor({ deviceConnectionService, trayService, windowService, pushPublisher, loggerFactory }: DeviceIntegrationServiceDependencies) {
    super({ loggerFactory }, 'DeviceIntegrationService');
    this.deviceConnectionService = deviceConnectionService;
    this.trayService = trayService;
    this.windowService = windowService;
    this.pushPublisher = pushPublisher;
  }

  protected override onInitialize(): void {
    this.disposables.add(this.deviceConnectionService.onStatusChanged(
      (status, reason) => this.handleStatusChanged(status, reason)
    ));
  }

  private handleStatusChanged(status: DeviceStatus, reason: DeviceConnectionReason): void {
    this.trayService.updateTrayMenu();

    if (status.connected && status.device) {
      this.pushPublisher.emit(IPC_CHANNELS.DEVICE.CONNECTED, status.device);
      this.scheduleWindowLaunch(status);
      this.logger.info(`Device connected via ${reason}`);
      return;
    }

    this.disposables.cancel(WINDOW_LAUNCH_LIFECYCLE);
    this.pushPublisher.emit(IPC_CHANNELS.DEVICE.DISCONNECTED);
    this.logger.info(`Device disconnected via ${reason}`);
  }

  private scheduleWindowLaunch(status: DeviceStatus): void {
    if (!status.device) {
      return;
    }

    const descriptor = DeviceCatalog.get(status.device.id);
    const delayMs = descriptor?.behavior.showWindowOnConnectDelayMs ?? appConfig.DEVICE_LAUNCH_DELAY;
    this.schedule(WINDOW_LAUNCH_LIFECYCLE, () => this.windowService.showWindow(), delayMs);
  }
}
