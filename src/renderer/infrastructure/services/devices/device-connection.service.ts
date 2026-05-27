import { Service } from '@shared/di/decorators.js';
/**
 * Device Connection Service
 *
 * Owns main-process USB connection status and status events.
 */

import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@shared/events/event-channels.js';
import type { EventBusLike, LoggerFactoryLike } from '@shared/interfaces/infrastructure.types.js';
import type {
  DeviceStatusProvider,
  RendererDeviceStatus
} from '@shared/interfaces/device-status-provider.interface.js';

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
