import { BaseService } from '@platform/core';
import { matchByUsb } from '../domain/matching.js';
import { toDeviceInfo } from '../domain/payloads.js';
import type {
  DeviceInfo,
  DeviceStatus
} from '../domain/types.js';
import {
  createNodeUsbMonitor,
  type UsbDevice,
  type UsbMonitor
} from '../infrastructure/usb.monitor.js';
import type { LoggerFactoryLike } from '@platform/core';

export type DeviceConnectionReason =
  | 'startup'
  | 'hotplug-add'
  | 'hotplug-remove'
  | 'tray-refresh'
  | 'manual-refresh';

interface DeviceConnectionDependencies {
  loggerFactory: LoggerFactoryLike;
  usbMonitor?: UsbMonitor;
}
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

export class DeviceConnectionService extends BaseService {
  private readonly usbMonitor: UsbMonitor;
  private status: DeviceStatus = { state: 'unknown', connected: false, device: null };
  private readonly statusListeners = new Set<DeviceStatusListener>();

  constructor(dependencies: DeviceConnectionDependencies) {
    super(dependencies, 'DeviceConnectionService');
    this.usbMonitor = dependencies.usbMonitor ?? createNodeUsbMonitor();
  }

  protected override onInitialize(): void {
    this.usbMonitor.startMonitoring(
      () => { void this.reconcileDeviceStatus('hotplug-add'); },
      () => { void this.reconcileDeviceStatus('hotplug-remove'); }
    );
    this.logger.info('Device connection service initialized');
  }

  getStatus(): DeviceStatus {
    return this.status;
  }

  isConnected(): boolean {
    return this.status.connected;
  }

  onStatusChanged(listener: DeviceStatusListener): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  override async dispose(): Promise<void> {
    this.usbMonitor.stopMonitoring();
    this.statusListeners.clear();
    await super.dispose();
  }

  async reconcileDeviceStatus(reason: DeviceConnectionReason): Promise<DeviceStatus> {
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
        error: message
      };
    }

    this.commitStatus(nextStatus, reason);
    return this.status;
  }

  private createStatusFromDevices(devices: readonly UsbDevice[]): DeviceStatus {
    for (const device of devices) {
      const match = matchByUsb(device);

      if (match.matched && match.descriptor) {
        return {
          state: 'connected',
          connected: true,
          device: toDeviceInfo(match.descriptor, device)
        };
      }
    }

    return {
      state: 'disconnected',
      connected: false,
      device: null
    };
  }

  private commitStatus(nextStatus: DeviceStatus, reason: DeviceConnectionReason): void {
    if (isSameStatus(this.status, nextStatus)) {
      this.status = nextStatus;
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
