/**
 * Device Storage Service
 *
 * Manages persisted device IDs per device type.
 */

import { BaseService } from '@shared/base/service.base.js';
import { DeviceRegistry } from '@shared/features/devices/device.registry.js';

function getDeviceStorageKey(deviceType: string | null | undefined): string {
  return `${deviceType || 'device'}_id`;
}

class DeviceStorageService extends BaseService {

  constructor(dependencies: Record<string, unknown>) {
    super(dependencies, ['storageService', 'loggerFactory'], 'DeviceStorageService');
  }

  getStoredDeviceId(deviceType: string): string | null {
    try {
      const key = getDeviceStorageKey(deviceType);
      return this.storageService?.getItem(key) ?? null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug('Failed to get stored device ID:', message);
      return null;
    }
  }

  storeDeviceId(deviceId: string, deviceType: string): void {
    try {
      const key = getDeviceStorageKey(deviceType);
      this.storageService?.setItem(key, deviceId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug('Storage not available:', message);
    }
  }

  getRegisteredStoredDeviceIds(): string[] {
    const registeredIds = DeviceRegistry.getAll().map(device => device.id);
    const storedIds = registeredIds
      .map(id => this.getStoredDeviceId(id))
      .filter((id): id is string => Boolean(id));
    return Array.from(new Set(storedIds));
  }
}

export { DeviceStorageService };
