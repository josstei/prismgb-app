import { BaseService } from '@prismgb/core';
import {
  matchByUsb,
  toDeviceInfo,
  type DeviceInfo,
  type DeviceMatch,
  type DeviceStatus,
  type ObservedUsbDevice
} from './index.js';
import {
  createNodeUsbDeviceMonitor,
  createNoopUsbDeviceMonitor,
  type UsbDeviceInfo,
  type UsbDeviceMonitor
} from './usb-device-monitor.js';
import type { LoggerFactoryLike } from '@prismgb/core';

export type DeviceReconcileReason =
  | 'startup'
  | 'hotplug-add'
  | 'hotplug-remove'
  | 'tray-refresh'
  | 'manual-refresh';

export interface DeviceRuntimeCheckError {
  reason: DeviceReconcileReason;
  error: string;
}

export interface DeviceRuntimeEvents {
  statusChanged: DeviceStatus;
  checkError: DeviceRuntimeCheckError;
}

export interface MainDeviceRuntimeDependencies {
  loggerFactory: LoggerFactoryLike;
  usbMonitor?: UsbDeviceMonitor;
  now?: () => number;
}

export type DeviceStatusListener = (status: DeviceStatus, reason: DeviceReconcileReason) => void;
export type DeviceCheckErrorListener = (error: DeviceRuntimeCheckError) => void;
export type DeviceRuntimeUnsubscribe = () => void;

const TEST_MODE_ARGS = new Set(['--test-mode']);

function isTestMode(): boolean {
  return process.argv.some((argument) => TEST_MODE_ARGS.has(argument)) || process.env.NODE_ENV === 'test';
}

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

function toObservedUsbDevice(device: UsbDeviceInfo): ObservedUsbDevice {
  const observed: ObservedUsbDevice = {
    vendorId: device.vendorId,
    productId: device.productId
  };

  if (device.locationId !== undefined) {
    observed.locationId = device.locationId;
  }

  if (device.deviceAddress !== undefined) {
    observed.deviceAddress = device.deviceAddress;
  }

  if (device.deviceName !== undefined) {
    observed.deviceName = device.deviceName;
  }

  if (device.manufacturer !== undefined) {
    observed.manufacturer = device.manufacturer;
  }

  if (device.serialNumber !== undefined) {
    observed.serialNumber = device.serialNumber;
  }

  if (device.deviceClass !== undefined) {
    observed.deviceClass = device.deviceClass;
  }

  if (device.busNumber !== undefined) {
    observed.busNumber = device.busNumber;
  }

  return observed;
}

export class MainDeviceRuntime extends BaseService {
  private readonly usbMonitor: UsbDeviceMonitor;
  private readonly now: () => number;
  private status: DeviceStatus;
  private initialized = false;
  private initializationLock: Promise<void> | null = null;
  private reconcileLock: Promise<DeviceStatus> | null = null;
  private readonly statusListeners = new Set<DeviceStatusListener>();
  private readonly checkErrorListeners = new Set<DeviceCheckErrorListener>();

  constructor(dependencies: MainDeviceRuntimeDependencies) {
    super(dependencies, 'MainDeviceRuntime');
    this.usbMonitor = dependencies.usbMonitor ?? (
      isTestMode() ? createNoopUsbDeviceMonitor() : createNodeUsbDeviceMonitor()
    );
    this.now = dependencies.now ?? Date.now;
    this.status = createInitialStatus(this.now);
  }

  initialize(): Promise<void> {
    if (this.initializationLock) {
      return this.initializationLock;
    }

    if (this.initialized) {
      this.logger.warn('MainDeviceRuntime already initialized');
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
      this.logger.info('Main device runtime initialized');
    }).finally(() => {
      this.initializationLock = null;
    });

    return this.initializationLock;
  }

  reconcileDeviceStatus(reason: DeviceReconcileReason): Promise<DeviceStatus> {
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

  onStatusChanged(listener: DeviceStatusListener): DeviceRuntimeUnsubscribe {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  onCheckError(listener: DeviceCheckErrorListener): DeviceRuntimeUnsubscribe {
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

  private async performDeviceReconciliation(reason: DeviceReconcileReason): Promise<DeviceStatus> {
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

  private createStatusFromDevices(devices: readonly UsbDeviceInfo[]): DeviceStatus {
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

  private commitStatus(nextStatus: DeviceStatus, reason: DeviceReconcileReason): void {
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

  private emitStatusChanged(status: DeviceStatus, reason: DeviceReconcileReason): void {
    for (const listener of this.statusListeners) {
      try {
        listener(status, reason);
      } catch (error) {
        this.logger.error('Device status listener failed', error);
      }
    }
  }

  private emitCheckError(error: DeviceRuntimeCheckError): void {
    for (const listener of this.checkErrorListeners) {
      try {
        listener(error);
      } catch (listenerError) {
        this.logger.error('Device check-error listener failed', listenerError);
      }
    }
  }
}

export type ConnectedDeviceInfo = DeviceInfo;
export type { DeviceMatch, DeviceStatus };
