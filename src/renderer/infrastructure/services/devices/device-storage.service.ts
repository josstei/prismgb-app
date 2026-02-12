/**
 * Device Storage Service
 *
 * Manages persisted device IDs per device type.
 */

import { BaseService } from '@prismgb/core';
import { DeviceRegistry } from '@shared/features/devices/device.registry.js';

function getDeviceStorageKey(deviceType) {
  return `${deviceType || 'device'}_id`;
}

class DeviceStorageService extends BaseService {
  static readonly dependencies = ['storageService', 'loggerFactory'] as const;

  constructor(dependencies) {
    super(dependencies, [...DeviceStorageService.dependencies], 'DeviceStorageService');
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
