/**
 * Interface for device status providers
 * Abstracts IPC communication for testability
 */
import type { DeviceStatusPayload } from '@prismgb/ipc';

export class IDeviceStatusProvider {
  /**
   * Get current device connection status
   * @returns {Promise<DeviceStatusPayload>} Device status object
   */
  async getDeviceStatus(): Promise<DeviceStatusPayload> {
    throw new Error('Not implemented');
  }
}
