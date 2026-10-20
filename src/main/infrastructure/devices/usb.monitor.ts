import { createRequire } from 'node:module';
import type { Device as NodeUsbDevice } from 'usb';
import type { ObservedUsbDevice } from '@platform/devices';

export interface UsbMonitor {
  find(): ObservedUsbDevice[];
  /** Calls `onChange` on every attach or detach; returns the unsubscribe. */
  watch(onChange: () => void): () => void;
}

type HotplugEvent = 'attach' | 'detach';

export interface UsbModule {
  getDeviceList(): NodeUsbDevice[];
  usb?: {
    on(event: HotplugEvent, listener: () => void): void;
    off(event: HotplugEvent, listener: () => void): void;
    unrefHotplugEvents?(): void;
  };
}

/** The main bundle is ESM, so the native addon is loaded through createRequire. */
function loadNativeUsbModule(): UsbModule | null {
  try {
    return createRequire(import.meta.url)('usb') as UsbModule;
  } catch {
    console.warn('[usb.monitor] Failed to load native C++ "usb" module. Falling back to no-op monitor.');
    return null;
  }
}

function toObservedUsbDevice(device: NodeUsbDevice): ObservedUsbDevice {
  return {
    vendorId: device.deviceDescriptor.idVendor,
    productId: device.deviceDescriptor.idProduct,
    locationId: device.busNumber,
    deviceAddress: device.deviceAddress
  };
}

const NOOP_USB_MONITOR: UsbMonitor = {
  find: () => [],
  watch: () => () => {}
};

export function createNodeUsbMonitor(loadUsbModule: () => UsbModule | null = loadNativeUsbModule): UsbMonitor {
  const usbModule = loadUsbModule();
  if (!usbModule) {
    return NOOP_USB_MONITOR;
  }

  return {
    find: () => usbModule.getDeviceList().map(toObservedUsbDevice),
    watch: (onChange) => {
      const hotplug = usbModule.usb;
      if (!hotplug) {
        return () => {};
      }
      const listener = () => onChange();
      hotplug.on('attach', listener);
      hotplug.on('detach', listener);
      hotplug.unrefHotplugEvents?.();
      return () => {
        hotplug.off('attach', listener);
        hotplug.off('detach', listener);
      };
    }
  };
}
