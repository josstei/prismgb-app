/**
 * Device Connection Service
 *
 * Owns main-process USB connection status and status events.
 */

import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';

class DeviceConnectionService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['eventBus', 'loggerFactory', 'deviceStatusProvider'], 'DeviceConnectionService');
    this.isConnected = false;
  }

  async refreshStatus() {
    try {
      const status = await this.deviceStatusProvider.getDeviceStatus();
      const connected = status.connected;
      const changed = this.isConnected !== connected;

      this.isConnected = connected;

      this.logger.info(`Device status: ${connected ? 'CONNECTED' : 'DISCONNECTED'}`);
      this.eventBus.publish(EventChannels.DEVICE.STATUS_CHANGED, status);

      return { status, changed };
    } catch (error) {
      this.logger.error('Error updating device status:', error);
      throw error;
    }
  }

  getStatus() {
    return { connected: this.isConnected };
  }
}

export { DeviceConnectionService };
