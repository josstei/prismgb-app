/**
 * Device Storage Service
 *
 * Manages persisted device IDs per device type.
 */

import { BaseService } from '@shared/base/service.base.js';
import { DeviceRegistry } from '@shared/features/devices/device.registry.js';

function getDeviceStorageKey(deviceType) {
  return `${deviceType || 'device'}_id`;
}

class DeviceStorageService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['storageService', 'loggerFactory'], 'DeviceStorageService');
  }

  getStoredDeviceId(deviceType) {
    try {
      const key = getDeviceStorageKey(deviceType);
      return this.storageService?.getItem(key) ?? null;
    } catch (error) {
      this.logger.debug('Failed to get stored device ID:', error.message);
      return null;
    }
  }

  storeDeviceId(deviceId, deviceType) {
    try {
      const key = getDeviceStorageKey(deviceType);
      this.storageService?.setItem(key, deviceId);
    } catch (error) {
      this.logger.debug('Storage not available:', error.message);
    }
  }

  getRegisteredStoredDeviceIds() {
    const registeredIds = DeviceRegistry.getAll().map(device => device.id);
    const storedIds = registeredIds
      .map(id => this.getStoredDeviceId(id))
      .filter(Boolean);
    return Array.from(new Set(storedIds));
  }
}

export { DeviceStorageService };
