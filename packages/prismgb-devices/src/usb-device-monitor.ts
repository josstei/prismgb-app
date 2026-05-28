import type { Device as NodeUsbDevice } from 'usb';
import * as nodeModule from 'module';

let nodeUsbLib: any = null;
function getUsbLib() {
  if (nodeUsbLib !== null) return nodeUsbLib;

  // 0. Try global mock hook (used for test environments like Vitest/Happy DOM)
  if ((globalThis as any).__usbMock) {
    nodeUsbLib = (globalThis as any).__usbMock;
    return nodeUsbLib;
  }

  // 1. Try global require (e.g. in CJS or test environments where require is globally mocked)
  try {
    if (typeof require === 'function') {
      nodeUsbLib = require('usb');
      if (nodeUsbLib) return nodeUsbLib;
    }
  } catch (e) {
    // proceed
  }

  // 2. Try Node.js standard createRequire
  try {
    if (nodeModule && typeof nodeModule.createRequire === 'function') {
      const req = nodeModule.createRequire(import.meta.url);
      nodeUsbLib = req('usb');
      if (nodeUsbLib) return nodeUsbLib;
    }
  } catch (e) {
    // proceed
  }

  console.warn('[usb-device-monitor] Failed to load native C++ "usb" module. Falling back to mock monitor.');
  nodeUsbLib = false;
  return nodeUsbLib;
}

type UsbDeviceEvent = 'add' | 'remove';

interface UsbDeviceInfo {
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

interface UsbDeviceMonitor {
  startMonitoring(): void;
  stopMonitoring(): void;
  on(event: UsbDeviceEvent, callback: (device: UsbDeviceInfo) => void): void;
  off(event: UsbDeviceEvent, callback: (device: UsbDeviceInfo) => void): void;
  find(): UsbDeviceInfo[];
}

type NodeUsbEvent = 'attach' | 'detach';
type NodeUsbListener = (device: NodeUsbDevice) => void;

const EVENT_MAP: Record<UsbDeviceEvent, NodeUsbEvent> = {
  add: 'attach',
  remove: 'detach'
};

function toUsbDeviceInfo(device: NodeUsbDevice): UsbDeviceInfo {
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

class NodeUsbDeviceMonitor implements UsbDeviceMonitor {
  private readonly listeners: Map<UsbDeviceEvent, Map<(device: UsbDeviceInfo) => void, NodeUsbListener>>;

  constructor() {
    this.listeners = new Map([
      ['add', new Map()],
      ['remove', new Map()]
    ]);
  }

  startMonitoring(): void {
    const usb = getUsbLib();
    if (usb && usb.usb) {
      usb.usb.unrefHotplugEvents?.();
    }
  }

  stopMonitoring(): void {
    for (const [event, callbacks] of this.listeners.entries()) {
      for (const callback of callbacks.keys()) {
        this.off(event, callback);
      }
    }
  }

  on(event: UsbDeviceEvent, callback: (device: UsbDeviceInfo) => void): void {
    const usb = getUsbLib();
    if (!usb || !usb.usb) return;

    const callbacks = this.listeners.get(event);
    if (!callbacks || callbacks.has(callback)) {
      return;
    }

    const listener = (device: NodeUsbDevice) => callback(toUsbDeviceInfo(device));
    callbacks.set(callback, listener);
    usb.usb.on(EVENT_MAP[event], listener);
    usb.usb.unrefHotplugEvents?.();
  }

  off(event: UsbDeviceEvent, callback: (device: UsbDeviceInfo) => void): void {
    const usb = getUsbLib();
    if (!usb || !usb.usb) return;

    const callbacks = this.listeners.get(event);
    const listener = callbacks?.get(callback);
    if (!callbacks || !listener) {
      return;
    }

    usb.usb.off(EVENT_MAP[event], listener);
    callbacks.delete(callback);
  }

  find(): UsbDeviceInfo[] {
    const usb = getUsbLib();
    if (!usb) return [];
    return usb.getDeviceList().map(toUsbDeviceInfo);
  }
}

class NoopUsbDeviceMonitor implements UsbDeviceMonitor {
  startMonitoring(): void {}

  stopMonitoring(): void {}

  on(): void {}

  off(): void {}

  find(): UsbDeviceInfo[] {
    return [];
  }
}

function createNodeUsbDeviceMonitor(): UsbDeviceMonitor {
  const usb = getUsbLib();
  if (!usb) {
    return new NoopUsbDeviceMonitor();
  }
  return new NodeUsbDeviceMonitor();
}

function createNoopUsbDeviceMonitor(): UsbDeviceMonitor {
  return new NoopUsbDeviceMonitor();
}

export {
  createNodeUsbDeviceMonitor,
  createNoopUsbDeviceMonitor,
  toUsbDeviceInfo
};
export type { UsbDeviceEvent, UsbDeviceInfo, UsbDeviceMonitor };
