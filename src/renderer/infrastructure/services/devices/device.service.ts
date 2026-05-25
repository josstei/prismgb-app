/**
 * Device Service
 *
 * Delegates device connection, storage, and media enumeration
 * to focused services behind the application device contract.
 */

import { BaseService } from '@shared/base/service.base.js';

class DeviceService extends BaseService {

  constructor(dependencies: Record<string, unknown>) {
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
    const { status, changed } = await this.deviceConnectionService.updateConnectionStatus();
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

  registerSupportedDevice(device: MediaDeviceInfo) {
    return this.deviceMediaService.registerSupportedDevice(device);
  }

  setupDeviceChangeListener() {
    this.deviceMediaService.setupDeviceChangeListener(() => this.updateDeviceStatus());
  }

  dispose() {
    this.deviceMediaService.dispose();
  }
}

export { DeviceService };
