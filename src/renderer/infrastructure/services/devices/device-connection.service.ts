import { Service } from '@prismgb/core';
/**
 * Device Connection Service
 *
 * Owns main-process USB connection status and status events.
 */

import { BaseService } from '@prismgb/core';
import { EventChannels } from '@prismgb/events';
import type { EventBusLike, LoggerFactoryLike } from '@prismgb/core';
import type {
  DeviceStatusProvider,
  RendererDeviceStatus
} from '@prismgb/devices';

interface DeviceConnectionServiceDependencies {
  eventBus: EventBusLike;
  loggerFactory: LoggerFactoryLike;
  deviceStatusProvider: DeviceStatusProvider;
}

@Service({
  "token": "deviceConnectionService",
  "disposal": "dispose"
})
class DeviceConnectionService extends BaseService {
  protected readonly eventBus: EventBusLike;
  private readonly deviceStatusProvider: DeviceStatusProvider;
  isConnected: boolean | null;

  constructor(dependencies: DeviceConnectionServiceDependencies) {
    super(dependencies, ['eventBus', 'loggerFactory', 'deviceStatusProvider'], 'DeviceConnectionService');
    this.eventBus = dependencies.eventBus;
    this.deviceStatusProvider = dependencies.deviceStatusProvider;
    this.isConnected = null;  // null ensures first status check always publishes event
  }

  async updateConnectionStatus(): Promise<{ status: RendererDeviceStatus; changed: boolean }> {
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

  getStatus(): { connected: boolean | null } {
    return { connected: this.isConnected };
  }
}

export { DeviceConnectionService };
