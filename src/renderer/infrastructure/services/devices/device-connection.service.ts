/**
 * Device Connection Service
 *
 * Owns main-process USB connection status and status events.
 */

import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@shared/events/event-channels.js';

interface DeviceStatusPayload {
  connected: boolean;
  [key: string]: unknown;
}

interface DeviceConnectionServiceDependencies {
  eventBus: {
    publish(event: string, payload?: unknown): void;
  };
  loggerFactory: unknown;
  deviceStatusProvider: {
    getDeviceStatus(): Promise<DeviceStatusPayload>;
  };
}

class DeviceConnectionService extends BaseService {
  isConnected: boolean | null;

  constructor(dependencies: DeviceConnectionServiceDependencies) {
    super(dependencies, ['eventBus', 'loggerFactory', 'deviceStatusProvider'], 'DeviceConnectionService');
    this.isConnected = null;  // null ensures first status check always publishes event
  }

  async updateConnectionStatus(): Promise<{ status: DeviceStatusPayload; changed: boolean }> {
    try {
      const status = await this.deviceStatusProvider.getDeviceStatus();
      const connected = status.connected;
      const changed = this.isConnected !== connected;

      this.isConnected = connected;

      if (changed) {
        this.logger.info(`Device status: ${connected ? 'CONNECTED' : 'DISCONNECTED'}`);
        this.eventBus.publish(EventChannels.DEVICE.STATUS_CHANGED, status);
      }

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
