import type { Device as NodeUsbDevice } from 'usb';
import * as nodeModule from 'module';

type UsbDeviceEvent = 'add' | 'remove';

interface UsbDevice {
  locationId?: number;
  vendorId: number;
  productId: number;
  deviceName?: string;
  manufacturer?: string;
  serialNumber?: string;
  deviceAddress?: number;
  deviceClass?: number;
  busNumber?: number;
}

interface UsbMonitor {
  startMonitoring(): void;
  stopMonitoring(): void;
  on(event: UsbDeviceEvent, callback: (device: UsbDevice) => void): void;
  off(event: UsbDeviceEvent, callback: (device: UsbDevice) => void): void;
  find(): UsbDevice[];
  registerLifecycleListeners(
    onAdd: (device: UsbDevice) => void,
    onRemove: (device: UsbDevice) => void
  ): void;
  unregisterLifecycleListeners(): void;
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

const EVENT_MAP: Record<UsbDeviceEvent, NodeUsbEvent> = {
  add: 'attach',
  remove: 'detach'
};

function loadNativeUsbModule(): UsbModule | null {
  try {
    if (typeof require === 'function') {
      const usb = require('usb') as UsbModule;
      if (usb) {
        return usb;
      }
    }
  } catch {
    // Fall through to createRequire.
  }

  try {
    if (nodeModule && typeof nodeModule.createRequire === 'function') {
      const req = nodeModule.createRequire(import.meta.url);
      const usb = req('usb') as UsbModule;
      if (usb) {
        return usb;
      }
    }
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
  private readonly usbModule: UsbModule;
  private readonly listeners: Map<UsbDeviceEvent, Map<(device: UsbDevice) => void, NodeUsbListener>>;
  private onAddCallback: ((device: UsbDevice) => void) | null = null;
  private onRemoveCallback: ((device: UsbDevice) => void) | null = null;

  constructor(usbModule: UsbModule) {
    this.usbModule = usbModule;
    this.listeners = new Map([
      ['add', new Map()],
      ['remove', new Map()]
    ]);
  }

  startMonitoring(): void {
    this.usbModule.usb?.unrefHotplugEvents?.();
  }

  stopMonitoring(): void {
    for (const [event, callbacks] of this.listeners.entries()) {
      for (const callback of callbacks.keys()) {
        this.off(event, callback);
      }
    }
  }

  on(event: UsbDeviceEvent, callback: (device: UsbDevice) => void): void {
    if (!this.usbModule.usb) return;

    const callbacks = this.listeners.get(event);
    if (!callbacks || callbacks.has(callback)) {
      return;
    }

    const listener = (device: NodeUsbDevice) => callback(toUsbDevice(device));
    callbacks.set(callback, listener);
    this.usbModule.usb.on(EVENT_MAP[event], listener);
    this.usbModule.usb.unrefHotplugEvents?.();
  }

  off(event: UsbDeviceEvent, callback: (device: UsbDevice) => void): void {
    if (!this.usbModule.usb) return;

    const callbacks = this.listeners.get(event);
    const listener = callbacks?.get(callback);
    if (!callbacks || !listener) {
      return;
    }

    this.usbModule.usb.off(EVENT_MAP[event], listener);
    callbacks.delete(callback);
  }

  find(): UsbDevice[] {
    return this.usbModule.getDeviceList().map(toUsbDevice);
  }

  registerLifecycleListeners(
    onAdd: (device: UsbDevice) => void,
    onRemove: (device: UsbDevice) => void
  ): void {
    this.unregisterLifecycleListeners();
    this.onAddCallback = onAdd;
    this.onRemoveCallback = onRemove;
    this.on('add', onAdd);
    this.on('remove', onRemove);
  }

  unregisterLifecycleListeners(): void {
    if (this.onAddCallback) {
      this.off('add', this.onAddCallback);
      this.onAddCallback = null;
    }
    if (this.onRemoveCallback) {
      this.off('remove', this.onRemoveCallback);
      this.onRemoveCallback = null;
    }
  }
}

class NoopUsbMonitor implements UsbMonitor {
  startMonitoring(): void {}

  stopMonitoring(): void {}

  on(): void {}

  off(): void {}

  find(): UsbDevice[] {
    return [];
  }

  registerLifecycleListeners(): void {}

  unregisterLifecycleListeners(): void {}
}

function createNodeUsbMonitor(options: { loadUsbModule?: UsbModuleLoader } = {}): UsbMonitor {
  try {
    const usb = (options.loadUsbModule ?? loadNativeUsbModule)();
    return usb ? new NodeUsbMonitor(usb) : new NoopUsbMonitor();
  } catch {
    return new NoopUsbMonitor();
  }
}

function createNoopUsbMonitor(): UsbMonitor {
  return new NoopUsbMonitor();
}

export {
  createNodeUsbMonitor,
  createNoopUsbMonitor,
  loadNativeUsbModule,
  toUsbDevice
};
export type {
  UsbDevice,
  UsbDeviceEvent,
  UsbModule,
  UsbModuleLoader,
  UsbMonitor
};
