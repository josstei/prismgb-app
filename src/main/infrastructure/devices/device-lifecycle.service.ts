/**
 * Device Lifecycle Service
 * Owns the device auto-launch sequence, decoupling device detection from window management
 */

import { BaseService } from '@shared/base/service.base.js';
import { appConfig } from '@shared/config/config-loader.utils.js';
import { MainEventChannels } from '@main/infrastructure/events/event-channels.config.js';
import type { DeviceService } from './device.service.js';
import type { WindowService } from '@main/infrastructure/window/window.service.js';
import type { EventBus } from '@main/infrastructure/events/event-bus.js';
import type { LoggerFactory } from '@main/infrastructure/logging/logger.interface.js';

const { DEVICE_LAUNCH_DELAY } = appConfig;

interface DeviceStatus {
  connected: boolean;
  device?: any;
}

interface DeviceLifecycleServiceDependencies {
  deviceService: DeviceService;
  windowService: WindowService;
  eventBus: EventBus;
  loggerFactory: LoggerFactory;
}

export class DeviceLifecycleService extends BaseService {

  private readonly deviceService: DeviceService;
  private readonly windowService: WindowService;
  private readonly eventBus: EventBus;
  private _unsubscribe: (() => void) | null;
  private _launchTimeoutId: NodeJS.Timeout | null;

  constructor(dependencies: DeviceLifecycleServiceDependencies) {
    super(dependencies, ['deviceService', 'windowService', 'eventBus', 'loggerFactory'], 'DeviceLifecycleService');
    this.deviceService = dependencies.deviceService;
    this.windowService = dependencies.windowService;
    this.eventBus = dependencies.eventBus;
    this._unsubscribe = null;
    this._launchTimeoutId = null;
  }

  initialize(): void {
    this.logger.info('Initializing device lifecycle service');

    this._unsubscribe = this.eventBus.subscribe(
      MainEventChannels.DEVICE.CONNECTION_CHANGED,
      (status: DeviceStatus) => this._handleConnectionChanged(status)
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
    this.logger.info('Disposing device lifecycle service');

    // Cancel any pending window launch
    if (this._launchTimeoutId) {
      clearTimeout(this._launchTimeoutId);
      this._launchTimeoutId = null;
    }

    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }

    this.logger.info('Device lifecycle service disposed');
  }
}

export type { DeviceLifecycleServiceDependencies, DeviceStatus };
