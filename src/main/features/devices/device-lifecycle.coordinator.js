/**
 * Device Lifecycle Coordinator
 * Owns the device auto-launch sequence, decoupling device detection from window management
 */

import { BaseService } from '@shared/base/service.js';
import { appConfig } from '@shared/config/config-loader.js';

const { DEVICE_LAUNCH_DELAY } = appConfig;

export class DeviceLifecycleCoordinator extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['deviceServiceMain', 'windowManager', 'loggerFactory'], 'DeviceLifecycleCoordinator');
    this._connectionListener = null;
  }

  /**
   * Initialize the coordinator
   * Subscribe to device connection events
   */
  initialize() {
    this.logger.info('Initializing device lifecycle coordinator');

    // Subscribe to device connection changes
    this._connectionListener = () => this._handleConnectionChanged();
    this.deviceServiceMain.on('connection-changed', this._connectionListener);

    this.logger.info('Device lifecycle coordinator initialized');
  }

  /**
   * Handle device connection state changes
   * @private
   */
  _handleConnectionChanged() {
    const status = this.deviceServiceMain.getStatus();

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
      if (this.windowManager) {
        this.logger.debug('Launching window');
        this.windowManager.showWindow();
      }
    }, DEVICE_LAUNCH_DELAY);
  }

  /**
   * Cleanup and dispose of resources
   */
  dispose() {
    this.logger.info('Disposing device lifecycle coordinator');

    // Remove event listener
    if (this._connectionListener) {
      this.deviceServiceMain.off('connection-changed', this._connectionListener);
      this._connectionListener = null;
    }

    this.logger.info('Device lifecycle coordinator disposed');
  }
}
