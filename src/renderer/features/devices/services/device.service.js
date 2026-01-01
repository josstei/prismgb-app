/**
 * Device Service (Facade)
 *
 * Delegates device connection, storage, and media enumeration
 * to focused services while preserving the legacy interface.
 */

import { BaseService } from '@shared/base/service.base.js';

class DeviceService extends BaseService {
  /**
   * @param {Object} dependencies - Injected dependencies
   * @param {EventBus} dependencies.eventBus - Event publisher
   * @param {Function} dependencies.loggerFactory - Logger factory
   * @param {IDeviceStatusProvider} dependencies.deviceStatusProvider - USB device status provider
   * @param {DeviceConnectionService} dependencies.deviceConnectionService - Connection status service
   * @param {DeviceStorageService} dependencies.deviceStorageService - Device ID storage service
   * @param {DeviceMediaService} dependencies.deviceMediaService - Media device enumeration service
   */
  constructor(dependencies) {
    super(dependencies, [
      'eventBus',
      'loggerFactory',
      'deviceStatusProvider',
      'deviceConnectionService',
      'deviceStorageService',
      'deviceMediaService'
    ], 'DeviceService');
  }

  get isConnected() {
    return this.deviceConnectionService.isConnected;
  }

  async updateDeviceStatus() {
    const { status, changed } = await this.deviceConnectionService.refreshStatus();
    if (changed) {
      this.deviceMediaService.invalidateEnumerationCache();
    }
    return status;
  }

  isDeviceConnected() {
    return this.deviceConnectionService.isConnected;
  }

  async enumerateDevices() {
    return this.deviceMediaService.enumerateDevices();
  }

  getRegisteredStoredDeviceIds() {
    return this.deviceStorageService.getRegisteredStoredDeviceIds();
  }

  getSelectedDeviceId() {
    return this.deviceMediaService.getSelectedDeviceId();
  }

  async discoverSupportedDevice() {
    return this.deviceMediaService.discoverSupportedDevice();
  }

  cacheSupportedDevice(device) {
    return this.deviceMediaService.cacheSupportedDevice(device);
  }

  setupDeviceChangeListener() {
    this.deviceMediaService.setupDeviceChangeListener(() => this.updateDeviceStatus());
  }

  dispose() {
    this.deviceMediaService.dispose();
  }
}

export { DeviceService };
