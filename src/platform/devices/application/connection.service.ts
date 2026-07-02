import { BaseService, pruneUndefined } from '@prismgb/core';
import { matchByUsb } from '../domain/matching.js';
import { toDeviceInfo } from '../domain/payloads.js';
import type {
  DeviceInfo,
  DeviceStatus,
  ObservedUsbDevice
} from '../domain/types.js';
import {
  createNodeUsbMonitor,
  type UsbDevice,
  type UsbMonitor
} from '../infrastructure/usb.monitor.js';
import type { LoggerFactoryLike } from '@prismgb/core';

export type DeviceConnectionReason =
  | 'startup'
  | 'hotplug-add'
  | 'hotplug-remove'
  | 'tray-refresh'
  | 'manual-refresh';

export interface DeviceConnectionCheckError {
  reason: DeviceConnectionReason;
  error: string;
}

export interface DeviceConnectionEvents {
  statusChanged: DeviceStatus;
  checkError: DeviceConnectionCheckError;
}

export interface DeviceConnectionDependencies {
  loggerFactory: LoggerFactoryLike;
  usbMonitor?: UsbMonitor;
  now?: () => number;
}

export type DeviceStatusListener = (status: DeviceStatus, reason: DeviceConnectionReason) => void;
export type DeviceCheckErrorListener = (error: DeviceConnectionCheckError) => void;
export type DeviceConnectionUnsubscribe = () => void;

function createInitialStatus(now: () => number): DeviceStatus {
  return {
    state: 'unknown',
    connected: false,
    device: null,
    updatedAt: now()
  };
}

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

function toObservedUsbDevice(device: UsbDevice): ObservedUsbDevice {
  return pruneUndefined<ObservedUsbDevice>({
    vendorId: device.vendorId,
    productId: device.productId,
    locationId: device.locationId,
    deviceAddress: device.deviceAddress,
    deviceName: device.deviceName,
    manufacturer: device.manufacturer,
    serialNumber: device.serialNumber,
    deviceClass: device.deviceClass,
    busNumber: device.busNumber
  });
}

export class DeviceConnectionService extends BaseService {
  private readonly usbMonitor: UsbMonitor;
  private readonly now: () => number;
  private status: DeviceStatus;
  private initialized = false;
  private initializationLock: Promise<void> | null = null;
  private reconcileLock: Promise<DeviceStatus> | null = null;
  private readonly statusListeners = new Set<DeviceStatusListener>();
  private readonly checkErrorListeners = new Set<DeviceCheckErrorListener>();

  constructor(dependencies: DeviceConnectionDependencies) {
    super(dependencies, 'DeviceConnectionService');
    this.usbMonitor = dependencies.usbMonitor ?? createNodeUsbMonitor();
    this.now = dependencies.now ?? Date.now;
    this.status = createInitialStatus(this.now);
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

  onCheckError(listener: DeviceCheckErrorListener): DeviceConnectionUnsubscribe {
    this.checkErrorListeners.add(listener);
    return () => {
      this.checkErrorListeners.delete(listener);
    };
  }

  override async dispose(): Promise<void> {
    this.usbMonitor.unregisterLifecycleListeners();
    this.usbMonitor.stopMonitoring();
    this.statusListeners.clear();
    this.checkErrorListeners.clear();
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
        updatedAt: this.now()
      };
      this.commitStatus(nextStatus, reason);
      this.emitCheckError({ reason, error: message });
      return this.status;
    }

    this.commitStatus(nextStatus, reason);
    return this.status;
  }

  private createStatusFromDevices(devices: readonly UsbDevice[]): DeviceStatus {
    for (const device of devices) {
      const observed = toObservedUsbDevice(device);
      const match = matchByUsb(observed);

      if (match.matched && match.descriptor) {
        return {
          state: 'connected',
          connected: true,
          device: toDeviceInfo(match.descriptor, observed),
          updatedAt: this.now()
        };
      }
    }

    return {
      state: 'disconnected',
      connected: false,
      device: null,
      updatedAt: this.now()
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

  private emitCheckError(error: DeviceConnectionCheckError): void {
    for (const listener of this.checkErrorListeners) {
      try {
        listener(error);
      } catch (listenerError) {
        this.logger.error('Device check-error listener failed', listenerError);
      }
    }
  }
}

export type { DeviceStatus };
