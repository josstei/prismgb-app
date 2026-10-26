import type { Device as NodeUsbDevice } from 'usb';
import { createRequire } from 'node:module';
import type { ObservedUsbDevice as UsbDevice } from '../domain/types.js';

interface UsbMonitor {
  startMonitoring(onAdd: (device: UsbDevice) => void, onRemove: (device: UsbDevice) => void): void;
  stopMonitoring(): void;
  find(): UsbDevice[];
}

interface UsbModule {
  getDeviceList(): NodeUsbDevice[];
  usb?: {
    on(event: NodeUsbEvent, listener: NodeUsbListener): void;
    off(event: NodeUsbEvent, listener: NodeUsbListener): void;
    unrefHotplugEvents?(): void;
  };
}

type UsbModuleLoader = () => UsbModule | null;
type NodeUsbEvent = 'attach' | 'detach';
type NodeUsbListener = (device: NodeUsbDevice) => void;

function loadNativeUsbModule(): UsbModule | null {
  try {
    return createRequire(import.meta.url)('usb') as UsbModule;
  } catch {
    // Fall through to no-op monitor.
  }

  console.warn('[usb.monitor] Failed to load native C++ "usb" module. Falling back to no-op monitor.');
  return null;
}

function toUsbDevice(device: NodeUsbDevice): UsbDevice {
  const descriptor = device.deviceDescriptor;
  const vendorId = descriptor.idVendor;
  const productId = descriptor.idProduct;

  return {
    locationId: device.busNumber,
    vendorId,
    productId,
    deviceName: `USB Device ${vendorId.toString(16).padStart(4, '0')}:${productId.toString(16).padStart(4, '0')}`,
    deviceAddress: device.deviceAddress,
    deviceClass: descriptor.bDeviceClass,
    busNumber: device.busNumber
  };
}

class NodeUsbMonitor implements UsbMonitor {
  private detachListeners: (() => void) | null = null;

  constructor(private readonly usbModule: UsbModule) {}

  stopMonitoring(): void {
    this.detachListeners?.();
    this.detachListeners = null;
  }

  find(): UsbDevice[] {
    return this.usbModule.getDeviceList().map(toUsbDevice);
  }

  startMonitoring(
    onAdd: (device: UsbDevice) => void,
    onRemove: (device: UsbDevice) => void
  ): void {
    this.stopMonitoring();
    const usb = this.usbModule.usb;
    if (!usb) return;
    const attached = (device: NodeUsbDevice) => onAdd(toUsbDevice(device));
    const detached = (device: NodeUsbDevice) => onRemove(toUsbDevice(device));
    this.detachListeners = () => {
      usb.off('attach', attached);
      usb.off('detach', detached);
    };
    usb.on('attach', attached);
    usb.on('detach', detached);
    usb.unrefHotplugEvents?.();
  }

}

class NoopUsbMonitor implements UsbMonitor {
  startMonitoring(): void {}

  stopMonitoring(): void {}

  find(): UsbDevice[] {
    return [];
  }

}

function createNodeUsbMonitor(options: { loadUsbModule?: UsbModuleLoader } = {}): UsbMonitor {
  try {
    const usb = (options.loadUsbModule ?? loadNativeUsbModule)();
    return usb ? new NodeUsbMonitor(usb) : new NoopUsbMonitor();
  } catch {
    return new NoopUsbMonitor();
  }
}

export { createNodeUsbMonitor };
export type {
  UsbDevice,
  UsbModule,
  UsbMonitor
};
