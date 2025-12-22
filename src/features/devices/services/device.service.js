/**
 * Device Service (Facade)
 *
 * Delegates device connection, storage, and media enumeration
 * to focused services while preserving the legacy interface.
 */

import { BaseService } from '@shared/base/service.js';
import { DeviceConnectionService } from './device-connection.service.js';
import { DeviceStorageService } from './device-storage.service.js';
import { MediaDeviceService } from './media-device.service.js';

class DeviceService extends BaseService {
  /**
   * @param {Object} dependencies - Injected dependencies
   * @param {EventBus} dependencies.eventBus - Event publisher
   * @param {Function} dependencies.loggerFactory - Logger factory
   * @param {IDeviceStatusProvider} dependencies.deviceStatusProvider - USB device status provider
   * @param {StorageService} [dependencies.storageService] - Browser storage abstraction
   * @param {MediaDevicesService} [dependencies.mediaDevicesService] - Media devices abstraction
   */
  constructor(dependencies) {
    super(dependencies, ['eventBus', 'loggerFactory', 'deviceStatusProvider'], 'DeviceService');

    this.storageService = dependencies.storageService;
    this.mediaDevicesService = dependencies.mediaDevicesService;

    this.deviceStorageService = new DeviceStorageService({
      storageService: this.storageService,
      loggerFactory: dependencies.loggerFactory
    });

    this.deviceConnectionService = new DeviceConnectionService({
      eventBus: this.eventBus,
      loggerFactory: dependencies.loggerFactory,
      deviceStatusProvider: dependencies.deviceStatusProvider
    });

    this.mediaDeviceService = new MediaDeviceService({
      eventBus: this.eventBus,
      loggerFactory: dependencies.loggerFactory,
      mediaDevicesService: this.mediaDevicesService,
      deviceConnectionService: this.deviceConnectionService,
      deviceStorageService: this.deviceStorageService
    });
  }

  get isConnected() {
    return this.deviceConnectionService.isConnected;
  }

  async updateDeviceStatus() {
    const { status, changed } = await this.deviceConnectionService.refreshStatus();
    if (changed) {
      this.mediaDeviceService.invalidateEnumerationCache();
    }
    return status;
  }

  isDeviceConnected() {
    return this.deviceConnectionService.isConnected;
  }

  async enumerateDevices() {
    return this.mediaDeviceService.enumerateDevices();
  }

  getRegisteredStoredDeviceIds() {
    return this.deviceStorageService.getRegisteredStoredDeviceIds();
  }

  getSelectedDeviceId() {
    return this.mediaDeviceService.getSelectedDeviceId();
  }

  async discoverSupportedDevice() {
    return this.mediaDeviceService.discoverSupportedDevice();
  }

  cacheSupportedDevice(device) {
    return this.mediaDeviceService.cacheSupportedDevice(device);
  }

  setupDeviceChangeListener() {
    this.mediaDeviceService.setupDeviceChangeListener(() => this.updateDeviceStatus());
  }

  dispose() {
    this.mediaDeviceService.dispose();
  }
}

export { DeviceService };
