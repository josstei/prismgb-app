/**
 * Device Service
 *
 * Delegates device connection, storage, and media enumeration
 * to focused services behind the application device contract.
 */

import { BaseService } from '@prismgb/core';
import type { EventBusLike, LoggerFactoryLike } from '@prismgb/core';
import type { RendererDeviceStatus } from '@prismgb/devices';

type DeviceConnectionUpdate = {
  status: RendererDeviceStatus;
  changed: boolean;
};

type DeviceConnectionServiceLike = {
  readonly isConnected: boolean | null;
  updateConnectionStatus(): Promise<DeviceConnectionUpdate>;
};

type DeviceStorageServiceLike = {
  getRegisteredStoredDeviceIds(): string[];
};

type DeviceMediaServiceLike = {
  invalidateEnumerationCache(): void;
  enumerateDevices(): Promise<unknown>;
  getSelectedDeviceId(): string | null;
  discoverSupportedDevice(): Promise<MediaDeviceInfo | null>;
  registerSupportedDevice(device: MediaDeviceInfo): unknown;
  setupDeviceChangeListener(onDeviceChange: () => Promise<RendererDeviceStatus> | RendererDeviceStatus): void;
};

type DeviceServiceDependencies = {
  eventBus: EventBusLike;
  loggerFactory: LoggerFactoryLike;
  deviceConnectionService: DeviceConnectionServiceLike;
  deviceStorageService: DeviceStorageServiceLike;
  deviceMediaService: DeviceMediaServiceLike;
};

class DeviceService extends BaseService {
  private readonly eventBus: EventBusLike;
  private readonly deviceConnectionService: DeviceConnectionServiceLike;
  private readonly deviceStorageService: DeviceStorageServiceLike;
  private readonly deviceMediaService: DeviceMediaServiceLike;

  constructor(dependencies: DeviceServiceDependencies) {
    super(dependencies, 'DeviceService');

    this.eventBus = dependencies.eventBus;
    this.deviceConnectionService = dependencies.deviceConnectionService;
    this.deviceStorageService = dependencies.deviceStorageService;
    this.deviceMediaService = dependencies.deviceMediaService;
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

  override dispose(): void | Promise<void> {
    return super.dispose();
  }
}

export { DeviceService };
