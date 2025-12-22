/**
 * Device Storage Service
 *
 * Manages persisted device IDs per device type.
 */

import { DeviceRegistry } from '../shared/device-registry.js';

function getDeviceStorageKey(deviceType) {
  return `${deviceType || 'device'}_id`;
}

class DeviceStorageService {
  constructor({ storageService, loggerFactory }) {
    this.storageService = storageService;
    this.logger = loggerFactory?.create('DeviceStorageService') || console;
  }

  getStoredDeviceId(deviceType) {
    try {
      const key = getDeviceStorageKey(deviceType);
      return this.storageService?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  storeDeviceId(deviceId, deviceType) {
    try {
      const key = getDeviceStorageKey(deviceType);
      this.storageService?.setItem(key, deviceId);
    } catch {
      // Storage not available (e.g., in tests)
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
