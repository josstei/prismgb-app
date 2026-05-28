import { Service } from '@prismgb/core';
import { BaseService } from '@prismgb/core';
import { DeviceRegistry } from '@prismgb/devices';
import type { LoggerFactoryLike, StorageServiceLike } from '@prismgb/core';

type DeviceStorageServiceDependencies = {
  storageService: StorageServiceLike;
  loggerFactory: LoggerFactoryLike;
};

function getDeviceStorageKey(deviceType: string | null | undefined): string {
  return `${deviceType || 'device'}_id`;
}

@Service({
  "token": "deviceStorageService",
  "disposal": "dispose"
})
class DeviceStorageService extends BaseService {
  private readonly storageService: StorageServiceLike;

  constructor(dependencies: DeviceStorageServiceDependencies) {
    super(dependencies, ['storageService', 'loggerFactory'], 'DeviceStorageService');
    this.storageService = dependencies.storageService;
  }

  getStoredDeviceId(deviceType: string): string | null {
    try {
      const key = getDeviceStorageKey(deviceType);
      return this.storageService.getItem(key);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug('Failed to get stored device ID:', message);
      return null;
    }
  }

  storeDeviceId(deviceId: string, deviceType: string): void {
    try {
      const key = getDeviceStorageKey(deviceType);
      if (!this.storageService.setItem(key, deviceId)) {
        this.logger.debug('Storage rejected device ID write');
      }
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
