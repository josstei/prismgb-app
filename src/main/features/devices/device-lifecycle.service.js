/**
 * Device Lifecycle Service
 * Owns the device auto-launch sequence, decoupling device detection from window management
 */

import { BaseService } from '@shared/base/service.base.js';
import { appConfig } from '@shared/config/config-loader.utils.js';
import { MainEventChannels } from '@main/infrastructure/events/event-channels.config.js';

const { DEVICE_LAUNCH_DELAY } = appConfig;

export class DeviceLifecycleService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['deviceService', 'windowService', 'eventBus', 'loggerFactory'], 'DeviceLifecycleService');
    this._unsubscribe = null;
    this._launchTimeoutId = null;
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
  dispose() {
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
