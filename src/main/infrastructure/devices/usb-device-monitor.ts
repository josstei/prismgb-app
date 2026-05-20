import { getDeviceList, usb, type Device as NodeUsbDevice } from 'usb';

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
    // Hotplug listeners are registered lazily by node-usb. Unref keeps monitoring
    // from pinning the Electron process open after the app requests shutdown.
    usb.unrefHotplugEvents?.();
  }

  stopMonitoring(): void {
    for (const [event, callbacks] of this.listeners.entries()) {
      for (const callback of callbacks.keys()) {
        this.off(event, callback);
      }
    }
  }

  on(event: UsbDeviceEvent, callback: (device: UsbDeviceInfo) => void): void {
    const callbacks = this.listeners.get(event);
    if (!callbacks || callbacks.has(callback)) {
      return;
    }

    const listener = (device: NodeUsbDevice) => callback(toUsbDeviceInfo(device));
    callbacks.set(callback, listener);
    usb.on(EVENT_MAP[event], listener);
    usb.unrefHotplugEvents?.();
  }

  off(event: UsbDeviceEvent, callback: (device: UsbDeviceInfo) => void): void {
    const callbacks = this.listeners.get(event);
    const listener = callbacks?.get(callback);
    if (!callbacks || !listener) {
      return;
    }

    usb.off(EVENT_MAP[event], listener);
    callbacks.delete(callback);
  }

  find(): UsbDeviceInfo[] {
    return getDeviceList().map(toUsbDeviceInfo);
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
