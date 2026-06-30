import { BaseService } from '@prismgb/core';
import { appConfig } from '@prismgb/config';
import { IPC_CHANNELS } from '@prismgb/ipc';
import { MainEventChannels } from '@prismgb/events';
import { DeviceCatalog, toDeviceInfoPayload, type DeviceStatus } from '@prismgb/devices';
import type {
  DeviceReconcileReason,
  MainDeviceRuntime
} from '@prismgb/devices/service';
import type { LoggerFactoryLike } from '@prismgb/core';
import type { EventBus } from '@main/infrastructure/events/event-bus.js';
import type { TrayService } from '@main/infrastructure/tray/tray.service.js';
import type { WindowService } from '@main/infrastructure/window/window.service.js';

const WINDOW_LAUNCH_LIFECYCLE = Symbol('deviceIntegrationWindowLaunch');

export interface DeviceIntegrationServiceDependencies {
  mainDeviceRuntime: MainDeviceRuntime;
  trayService: TrayService;
  windowService: WindowService;
  eventBus: EventBus;
  loggerFactory: LoggerFactoryLike;
}

export class DeviceIntegrationService extends BaseService {
  private readonly mainDeviceRuntime: MainDeviceRuntime;
  private readonly trayService: TrayService;
  private readonly windowService: WindowService;
  private readonly eventBus: EventBus;
  private unsubscribeStatus: (() => void) | null = null;
  private unsubscribeCheckError: (() => void) | null = null;

  constructor(dependencies: DeviceIntegrationServiceDependencies) {
    super(dependencies, 'DeviceIntegrationService');
    this.mainDeviceRuntime = dependencies.mainDeviceRuntime;
    this.trayService = dependencies.trayService;
    this.windowService = dependencies.windowService;
    this.eventBus = dependencies.eventBus;
  }

  initialize(): void {
    if (this.unsubscribeStatus) {
      return;
    }

    this.unsubscribeStatus = this.mainDeviceRuntime.onStatusChanged(
      (status, reason) => this.handleStatusChanged(status, reason)
    );
    this.unsubscribeCheckError = this.mainDeviceRuntime.onCheckError((error) => {
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

  private handleStatusChanged(status: DeviceStatus, reason: DeviceReconcileReason): void {
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
