/**
 * Device Lifecycle Service
 * Owns the device auto-launch sequence, decoupling device detection from window management
 */

import { BaseService } from '@shared/base/service.js';
import { appConfig } from '@shared/config/config-loader.js';
import { MainEventChannels } from '@main/infrastructure/events/event-channels.js';

const { DEVICE_LAUNCH_DELAY } = appConfig;

export class DeviceLifecycleService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['deviceService', 'windowService', 'eventBus', 'loggerFactory'], 'DeviceLifecycleService');
    this._unsubscribe = null;
  }

  initialize() {
    this.logger.info('Initializing device lifecycle service');

    this._unsubscribe = this.eventBus.subscribe(
      MainEventChannels.DEVICE.CONNECTION_CHANGED,
      (status) => this._handleConnectionChanged(status)
    );

    this.logger.info('Device lifecycle service initialized');
  }

  _handleConnectionChanged(status) {
    if (status.connected) {
      this.logger.info('Device connected - scheduling window launch');
      this._launchWindow();
    } else {
      this.logger.info('Device disconnected');
    }
  }

  /**
   * Auto-launch window after device connection
   * @private
   */
  _launchWindow() {
    setTimeout(() => {
      if (this.windowService) {
        this.logger.debug('Launching window');
        this.windowService.showWindow();
      }
    }, DEVICE_LAUNCH_DELAY);
  }

  /**
   * Cleanup and dispose of resources
   */
  dispose() {
    this.logger.info('Disposing device lifecycle service');

    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }

    this.logger.info('Device lifecycle service disposed');
  }
}
