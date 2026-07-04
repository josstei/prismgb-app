import { DeviceCatalog } from '@platform/devices';
import type { DeviceId } from '@platform/devices';
import type { LoggerLike, StorageServiceLike } from '@platform/core';

export interface DevicePreferenceStore {
  readStoredDeviceIds(): readonly string[];
  storeDeviceId(deviceId: string, deviceIdKind: DeviceId): void;
}

export class StorageDevicePreferenceStore implements DevicePreferenceStore {
  private readonly storageService: StorageServiceLike;
  private readonly logger?: LoggerLike;

  constructor(storageService: StorageServiceLike, logger?: LoggerLike) {
    this.storageService = storageService;
    this.logger = logger;
  }

  readStoredDeviceIds(): readonly string[] {
    const storedIds = DeviceCatalog.enabled()
      .map((descriptor) => this.getStoredDeviceId(descriptor.id))
      .filter((deviceId): deviceId is string => Boolean(deviceId));

    return Array.from(new Set(storedIds));
  }

  storeDeviceId(deviceId: string, deviceIdKind: DeviceId): void {
    try {
      if (!this.storageService.setItem(this.toStorageKey(deviceIdKind), deviceId)) {
        this.logger?.debug('Storage rejected device ID write');
      }
    } catch (error) {
      this.logger?.debug('Storage not available:', error);
    }
  }

  private getStoredDeviceId(deviceIdKind: DeviceId): string | null {
    try {
      return this.storageService.getItem(this.toStorageKey(deviceIdKind));
    } catch (error) {
      this.logger?.debug('Failed to get stored device ID:', error);
      return null;
    }
  }

  private toStorageKey(deviceIdKind: DeviceId): string {
    return `${deviceIdKind}_id`;
  }
}
