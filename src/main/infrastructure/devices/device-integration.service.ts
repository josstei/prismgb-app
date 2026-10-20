import { injectable, inject } from 'inversify';
import { BaseService } from '@platform/core';
import { appConfig } from '@platform/config';
import { IPC_CHANNELS } from '@platform/ipc';
import { DeviceCatalog, toDeviceInfoPayload, type DeviceStatus } from '@platform/devices';
import type {
  DeviceConnectionReason,
  DeviceConnectionService
} from '@platform/devices/runtime';
import type { LoggerFactory } from '@platform/core';
import type { TrayService } from '@main/infrastructure/tray/tray.service';
import type { WindowService } from '@main/infrastructure/window/window.service';
import { TOKENS } from '@main/application/di/tokens';

const WINDOW_LAUNCH_LIFECYCLE = Symbol('deviceIntegrationWindowLaunch');

@injectable()
export class DeviceIntegrationService extends BaseService {
  private unsubscribeStatus: (() => void) | null = null;

  constructor(
    @inject(TOKENS.deviceConnectionService) private readonly deviceConnectionService: DeviceConnectionService,
    @inject(TOKENS.trayService) private readonly trayService: TrayService,
    @inject(TOKENS.windowService) private readonly windowService: WindowService,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactory
  ) {
    super(loggerFactory, 'DeviceIntegrationService');
  }

  initialize(): void {
    if (this.unsubscribeStatus) {
      return;
    }

    this.unsubscribeStatus = this.deviceConnectionService.onStatusChanged(
      (status, reason) => this.handleStatusChanged(status, reason)
    );
  }

  override async dispose(): Promise<void> {
    this.unsubscribeStatus?.();
    this.unsubscribeStatus = null;
    await super.dispose();
  }

  private handleStatusChanged(status: DeviceStatus, reason: DeviceConnectionReason): void {
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
