/**
 * Interface for device status providers
 * Abstracts IPC communication for testability
 */
export class IDeviceStatusProvider {
  /**
   * Get current device connection status
   * @returns {Promise<Object>} Device status object
   */
  async getDeviceStatus() {
    throw new Error('Not implemented');
  }
}
