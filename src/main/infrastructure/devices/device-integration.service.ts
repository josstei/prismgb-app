import { injectable, inject } from 'inversify';
import { BaseService } from '@platform/core';
import { appConfig } from '@platform/config';
import { IPC_CHANNELS } from '@platform/ipc';
import { MainEventChannels } from '@platform/events';
import { DeviceCatalog, toDeviceInfoPayload, type DeviceStatus } from '@platform/devices';
import type {
  DeviceConnectionReason,
  DeviceConnectionService
} from '@platform/devices/runtime';
import type { LoggerFactoryLike } from '@platform/core';
import type { SharedEventBus } from '@platform/events';
import type { TrayService } from '@main/infrastructure/tray/tray.service.js';
import type { WindowService } from '@main/infrastructure/window/window.service.js';
import { TOKENS } from '@main/application/di/tokens.js';

const WINDOW_LAUNCH_LIFECYCLE = Symbol('deviceIntegrationWindowLaunch');

@injectable()
export class DeviceIntegrationService extends BaseService {
  private unsubscribeStatus: (() => void) | null = null;
  private unsubscribeCheckError: (() => void) | null = null;

  constructor(
    @inject(TOKENS.deviceConnectionService) private readonly deviceConnectionService: DeviceConnectionService,
    @inject(TOKENS.trayService) private readonly trayService: TrayService,
    @inject(TOKENS.windowService) private readonly windowService: WindowService,
    @inject(TOKENS.eventBus) private readonly eventBus: SharedEventBus,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactoryLike
  ) {
    super({ loggerFactory, eventBus }, 'DeviceIntegrationService');
  }

  initialize(): void {
    if (this.unsubscribeStatus) {
      return;
    }

    this.unsubscribeStatus = this.deviceConnectionService.onStatusChanged(
      (status, reason) => this.handleStatusChanged(status, reason)
    );
    this.unsubscribeCheckError = this.deviceConnectionService.onCheckError((error) => {
      this.eventBus.publish(MainEventChannels.DEVICE.CHECK_ERROR, error);
    });
  }

  override async dispose(): Promise<void> {
    this.unsubscribeStatus?.();
    this.unsubscribeStatus = null;
    this.unsubscribeCheckError?.();
    this.unsubscribeCheckError = null;
    await super.dispose();
  }

  private handleStatusChanged(status: DeviceStatus, reason: DeviceConnectionReason): void {
    this.eventBus.publish(MainEventChannels.DEVICE.CONNECTION_CHANGED, status);
    this.trayService.updateTrayMenu();

    if (status.connected && status.device) {
      this.windowService.send(IPC_CHANNELS.DEVICE.CONNECTED, toDeviceInfoPayload(status.device));
      this.scheduleWindowLaunch(status);
      this.logger.info(`Device connected via ${reason}`);
      return;
    }

    this.disposables.cancel(WINDOW_LAUNCH_LIFECYCLE);
    this.windowService.send(IPC_CHANNELS.DEVICE.DISCONNECTED);
    this.logger.info(`Device disconnected via ${reason}`);
  }

  private scheduleWindowLaunch(status: DeviceStatus): void {
    if (!status.device) {
      return;
    }

    const descriptor = DeviceCatalog.get(status.device.id);
    const delayMs = descriptor?.behavior.showWindowOnConnectDelayMs ?? appConfig.DEVICE_LAUNCH_DELAY;
    this.disposables.cancel(WINDOW_LAUNCH_LIFECYCLE);
    const launchTimeout = setTimeout(() => {
      this.disposables.cancel(WINDOW_LAUNCH_LIFECYCLE);
      this.windowService.showWindow();
    }, delayMs);
    this.disposables.replace(WINDOW_LAUNCH_LIFECYCLE, () => clearTimeout(launchTimeout));
  }
}
