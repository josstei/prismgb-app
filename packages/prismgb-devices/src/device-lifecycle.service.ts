/**
 * Device Lifecycle Service
 * Owns the device auto-launch sequence, decoupling device detection from window management
 */

import { BaseService, type ILoggerFactory } from '@prismgb/core';
import { appConfig } from '@prismgb/config';
import type { DeviceService } from './device.service.js';
import type { IEventBus } from '@prismgb/events';

interface WindowService {
  setFullScreen(enabled: boolean): void;
  isFullScreen(): boolean;
  createWindow?(options?: any): any;
  showWindow?(): void;
}

const MainEventChannels = {
  DEVICE: {
    CONNECTION_CHANGED: 'device:connection-changed' as const,
    CHECK_ERROR: 'device:check-error' as const
  }
};

const { DEVICE_LAUNCH_DELAY } = appConfig;
const DEVICE_CONNECTION_LIFECYCLE = Symbol('deviceLifecycleConnection');
const WINDOW_LAUNCH_LIFECYCLE = Symbol('deviceLifecycleWindowLaunch');

interface DeviceStatus {
  connected: boolean;
  device?: Record<string, unknown> | null;
}

interface DeviceLifecycleServiceDependencies {
  deviceService: DeviceService;
  windowService: WindowService;
  eventBus: IEventBus;
  loggerFactory: ILoggerFactory;
}

export class DeviceLifecycleService extends BaseService {

  private readonly deviceService: DeviceService;
  private readonly windowService: WindowService;
  private readonly eventBus: IEventBus;

  constructor(dependencies: DeviceLifecycleServiceDependencies) {
    super(dependencies, 'DeviceLifecycleService');
    this.deviceService = dependencies.deviceService;
    this.windowService = dependencies.windowService;
    this.eventBus = dependencies.eventBus;
  }

  initialize(): void {
    this.logger.info('Initializing device lifecycle service');

    this.disposables.cancel(DEVICE_CONNECTION_LIFECYCLE);
    this.disposables.replace(
      DEVICE_CONNECTION_LIFECYCLE,
      this.eventBus.subscribe(
        MainEventChannels.DEVICE.CONNECTION_CHANGED,
        (status: DeviceStatus) => this._handleConnectionChanged(status)
      )
    );

    this.logger.info('Device lifecycle service initialized');
  }

  private _handleConnectionChanged(status: DeviceStatus): void {
    if (status.connected) {
      this.logger.info('Device connected - scheduling window launch');
      this._launchWindow();
    } else {
      this.logger.info('Device disconnected');
    }
  }

  /**
   * Auto-launch window after device connection
   */
  private _launchWindow(): void {
    this.disposables.cancel(WINDOW_LAUNCH_LIFECYCLE);

    const launchTimeoutId = setTimeout(() => {
      this.disposables.cancel(WINDOW_LAUNCH_LIFECYCLE);
      if (this.windowService && typeof this.windowService.showWindow === 'function') {
        this.logger.debug('Launching window');
        this.windowService.showWindow();
      }
    }, DEVICE_LAUNCH_DELAY);
    this.disposables.replace(WINDOW_LAUNCH_LIFECYCLE, () => clearTimeout(launchTimeoutId));
  }

  /**
   * Cleanup and dispose of resources
   */
  override async dispose(): Promise<void> {
    this.logger.info('Disposing device lifecycle service');
    await super.dispose();
    this.logger.info('Device lifecycle service disposed');
  }
}

export type { DeviceLifecycleServiceDependencies, DeviceStatus };
