// @ts-nocheck
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('usb', () => {
  const listeners = {
    attach: new Set(),
    detach: new Set()
  };

  return {
    getDeviceList: vi.fn(),
    usb: {
      on: vi.fn((event, listener) => listeners[event].add(listener)),
      off: vi.fn((event, listener) => listeners[event].delete(listener)),
      unrefHotplugEvents: vi.fn(),
      __emit(event, device) {
        for (const listener of listeners[event]) {
          listener(device);
        }
      },
      __clear() {
        listeners.attach.clear();
        listeners.detach.clear();
      }
    }
  };
});

import { getDeviceList, usb } from 'usb';
globalThis.__usbMock = { getDeviceList, usb };

import {
  createNodeUsbDeviceMonitor,
  createNoopUsbDeviceMonitor,
  toUsbDeviceInfo
} from '../../../packages/prismgb-devices/src/usb-device-monitor.js';
import { CHROMATIC_DESCRIPTOR } from '../../devices/chromatic-manifest.testkit';

const chromaticUsb = CHROMATIC_DESCRIPTOR.usb;
const chromaticUsbName = `USB Device ${chromaticUsb.hexVendorId.slice(2)}:${chromaticUsb.hexProductId.slice(2)}`;

function makeNodeUsbDevice(overrides = {}) {
  return {
    busNumber: 4,
    deviceAddress: 12,
    deviceDescriptor: {
      idVendor: chromaticUsb.vendorId,
      idProduct: chromaticUsb.productId,
      bDeviceClass: chromaticUsb.deviceClass
    },
    ...overrides
  };
}

describe('usb-device-monitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usb.__clear();
  });

  it('maps node-usb descriptors to app USB device info', () => {
    expect(toUsbDeviceInfo(makeNodeUsbDevice())).toEqual({
      locationId: 4,
      vendorId: chromaticUsb.vendorId,
      productId: chromaticUsb.productId,
      deviceName: chromaticUsbName,
      deviceAddress: 12,
      deviceClass: chromaticUsb.deviceClass,
      busNumber: 4
    });
  });

  it('enumerates devices through the node-usb implementation', () => {
    getDeviceList.mockReturnValue([makeNodeUsbDevice()]);

    const monitor = createNodeUsbDeviceMonitor();

    expect(monitor.find()).toEqual([
      expect.objectContaining({
        vendorId: chromaticUsb.vendorId,
        productId: chromaticUsb.productId
      })
    ]);
  });

  it('translates hotplug attach and detach events', () => {
    const monitor = createNodeUsbDeviceMonitor();
    const onAdd = vi.fn();
    const onRemove = vi.fn();

    monitor.startMonitoring();
    monitor.on('add', onAdd);
    monitor.on('remove', onRemove);

    usb.__emit('attach', makeNodeUsbDevice());
    usb.__emit('detach', makeNodeUsbDevice({ deviceAddress: 13 }));

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ deviceAddress: 12 }));
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ deviceAddress: 13 }));
    expect(usb.unrefHotplugEvents).toHaveBeenCalled();
  });

  it('removes registered listeners on stop', () => {
    const monitor = createNodeUsbDeviceMonitor();
    const onAdd = vi.fn();

    monitor.on('add', onAdd);
    monitor.stopMonitoring();
    usb.__emit('attach', makeNodeUsbDevice());

    expect(onAdd).not.toHaveBeenCalled();
    expect(usb.off).toHaveBeenCalledWith('attach', expect.any(Function));
  });

  it('provides a no-op monitor for test mode', () => {
    const monitor = createNoopUsbDeviceMonitor();
    const onAdd = vi.fn();

    monitor.startMonitoring();
    monitor.on('add', onAdd);
    monitor.stopMonitoring();

    expect(monitor.find()).toEqual([]);
    expect(onAdd).not.toHaveBeenCalled();
  });
});
