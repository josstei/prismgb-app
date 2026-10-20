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

export type DeviceConnectionReason =
  | 'startup'
  | 'hotplug-add'
  | 'hotplug-remove'
  | 'tray-refresh'
  | 'manual-refresh';

export type DeviceStatusListener = (status: DeviceStatus, reason: DeviceConnectionReason) => void;
export type DeviceConnectionUnsubscribe = () => void;

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
  private initializationLock: Promise<void> | null = null;
  private reconcileLock: Promise<DeviceStatus> | null = null;
  private readonly statusListeners = new Set<DeviceStatusListener>();

  constructor(
    @inject(TOKENS.usbMonitor) private readonly usbMonitor: UsbMonitor,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactory
  ) {
    super(loggerFactory, 'DeviceConnectionService');
  }

  initialize(): Promise<void> {
    if (this.initializationLock) {
      return this.initializationLock;
    }

    if (this.initialized) {
      this.logger.warn('DeviceConnectionService already initialized');
      return Promise.resolve();
    }

    this.initializationLock = Promise.resolve().then(() => {
      this.usbMonitor.startMonitoring();
      this.usbMonitor.registerLifecycleListeners(
        () => {
          void this.reconcileDeviceStatus('hotplug-add');
        },
        () => {
          void this.reconcileDeviceStatus('hotplug-remove');
        }
      );
      this.initialized = true;
      this.logger.info('Device connection service initialized');
    }).finally(() => {
      this.initializationLock = null;
    });

    return this.initializationLock;
  }

  reconcileDeviceStatus(reason: DeviceConnectionReason): Promise<DeviceStatus> {
    if (this.reconcileLock) {
      return this.reconcileLock;
    }

    this.reconcileLock = this.performDeviceReconciliation(reason).finally(() => {
      this.reconcileLock = null;
    });

    return this.reconcileLock;
  }

  getStatus(): DeviceStatus {
    return this.status;
  }

  isConnected(): boolean {
    return this.status.connected;
  }

  onStatusChanged(listener: DeviceStatusListener): DeviceConnectionUnsubscribe {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  override async dispose(): Promise<void> {
    this.usbMonitor.unregisterLifecycleListeners();
    this.usbMonitor.stopMonitoring();
    this.statusListeners.clear();
    await super.dispose();
  }

  private async performDeviceReconciliation(reason: DeviceConnectionReason): Promise<DeviceStatus> {
    let nextStatus: DeviceStatus;

    try {
      const devices = this.usbMonitor.find();
      nextStatus = this.createStatusFromDevices(devices);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to reconcile device status', error);

      nextStatus = {
        state: 'error',
        connected: false,
        device: null,
        error: message,
        updatedAt: Date.now()
      };
      this.commitStatus(nextStatus, reason);
      return this.status;
    }

    this.commitStatus(nextStatus, reason);
    return this.status;
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
