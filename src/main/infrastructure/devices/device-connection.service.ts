import { injectable, inject } from 'inversify';
import { BaseService, type LoggerFactory } from '@platform/core';
import {
  matchByUsb,
  toDeviceInfo,
  type DeviceInfo,
  type DeviceStatus,
  type ObservedUsbDevice
} from '@platform/devices';
import { TOKENS } from '@main/application/di/tokens';
import type { UsbMonitor } from './usb.monitor';

export type DeviceConnectionReason = 'startup' | 'hotplug' | 'tray-refresh' | 'manual-refresh';

type DeviceStatusListener = (status: DeviceStatus, reason: DeviceConnectionReason) => void;

function sameDeviceInfo(left: DeviceInfo | null, right: DeviceInfo | null): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.id === right.id &&
    left.vendorId === right.vendorId &&
    left.productId === right.productId &&
    left.locationId === right.locationId &&
    left.deviceAddress === right.deviceAddress &&
    left.serialNumber === right.serialNumber;
}

function isSameStatus(left: DeviceStatus, right: DeviceStatus): boolean {
  return left.state === right.state &&
    left.connected === right.connected &&
    left.error === right.error &&
    sameDeviceInfo(left.device, right.device);
}

@injectable()
export class DeviceConnectionService extends BaseService {
  private status: DeviceStatus = {
    state: 'unknown',
    connected: false,
    device: null,
    updatedAt: Date.now()
  };
  private initialized = false;
  private readonly statusListeners = new Set<DeviceStatusListener>();

  constructor(
    @inject(TOKENS.usbMonitor) private readonly usbMonitor: UsbMonitor,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactory
  ) {
    super(loggerFactory, 'DeviceConnectionService');
  }

  initialize(): void {
    if (this.initialized) {
      this.logger.warn('DeviceConnectionService already initialized');
      return;
    }

    this.initialized = true;
    this.disposables.add(this.usbMonitor.watch(() => this.reconcileDeviceStatus('hotplug')));
    this.logger.info('Device connection service initialized');
  }

  reconcileDeviceStatus(reason: DeviceConnectionReason): DeviceStatus {
    let nextStatus: DeviceStatus;

    try {
      nextStatus = this.createStatusFromDevices(this.usbMonitor.find());
    } catch (error) {
      this.logger.error('Failed to reconcile device status', error);
      nextStatus = {
        state: 'error',
        connected: false,
        device: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        updatedAt: Date.now()
      };
    }

    this.commitStatus(nextStatus, reason);
    return this.status;
  }

  getStatus(): DeviceStatus {
    return this.status;
  }

  onStatusChanged(listener: DeviceStatusListener): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  override dispose(): Promise<void> {
    this.statusListeners.clear();
    return super.dispose();
  }

  private createStatusFromDevices(devices: readonly ObservedUsbDevice[]): DeviceStatus {
    for (const device of devices) {
      const match = matchByUsb(device);

      if (match.matched && match.descriptor) {
        return {
          state: 'connected',
          connected: true,
          device: toDeviceInfo(match.descriptor, device),
          updatedAt: Date.now()
        };
      }
    }

    return {
      state: 'disconnected',
      connected: false,
      device: null,
      updatedAt: Date.now()
    };
  }

  private commitStatus(nextStatus: DeviceStatus, reason: DeviceConnectionReason): void {
    if (isSameStatus(this.status, nextStatus)) {
      this.status = {
        ...nextStatus,
        updatedAt: this.status.updatedAt
      };
      return;
    }

    this.status = nextStatus;
    this.emitStatusChanged(nextStatus, reason);
  }

  private emitStatusChanged(status: DeviceStatus, reason: DeviceConnectionReason): void {
    for (const listener of this.statusListeners) {
      try {
        listener(status, reason);
      } catch (error) {
        this.logger.error('Device status listener failed', error);
      }
    }
  }
}
