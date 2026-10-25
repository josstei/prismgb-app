import { describe, it, expect, vi } from 'vitest';
import { createNodeUsbMonitor } from '../../../../../src/platform/devices/infrastructure/usb.monitor.js';
import type { UsbModule } from '../../../../../src/platform/devices/infrastructure/usb.monitor.js';
import { CHROMATIC_DESCRIPTOR } from '../../../../devices/media.testkit';

const chromaticUsb = CHROMATIC_DESCRIPTOR.usb;
const chromaticUsbName = `USB Device ${chromaticUsb.hexVendorId.slice(2)}:${chromaticUsb.hexProductId.slice(2)}`;

function makeNodeUsbDevice(overrides: Record<string, unknown> = {}) {
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

function createUsbModule() {
  const listeners = {
    attach: new Set<(device: ReturnType<typeof makeNodeUsbDevice>) => void>(),
    detach: new Set<(device: ReturnType<typeof makeNodeUsbDevice>) => void>()
  };
  const usb = {
    getDeviceList: vi.fn<() => ReturnType<typeof makeNodeUsbDevice>[]>(() => []),
    usb: {
      on: vi.fn((event: 'attach' | 'detach', listener: (device: ReturnType<typeof makeNodeUsbDevice>) => void) => {
        listeners[event].add(listener);
      }),
      off: vi.fn((event: 'attach' | 'detach', listener: (device: ReturnType<typeof makeNodeUsbDevice>) => void) => {
        listeners[event].delete(listener);
      }),
      unrefHotplugEvents: vi.fn()
    },
    emit(event: 'attach' | 'detach', device = makeNodeUsbDevice()) {
      for (const listener of listeners[event]) {
        listener(device);
      }
    }
  };

  return usb;
}

describe('usb.monitor', () => {
  it('maps node-usb descriptors to app USB device info', () => {
    const usb = createUsbModule();
    usb.getDeviceList.mockReturnValue([makeNodeUsbDevice()]);
    const monitor = createNodeUsbMonitor({ loadUsbModule: () => usb as unknown as UsbModule });
    expect(monitor.find()).toEqual([{
      locationId: 4,
      vendorId: chromaticUsb.vendorId,
      productId: chromaticUsb.productId,
      deviceName: chromaticUsbName,
      deviceAddress: 12,
      deviceClass: chromaticUsb.deviceClass,
      busNumber: 4
    }]);
  });

  it('enumerates devices through the injected node-usb implementation', () => {
    const usb = createUsbModule();
    usb.getDeviceList.mockReturnValue([makeNodeUsbDevice()]);

    const monitor = createNodeUsbMonitor({ loadUsbModule: () => usb as unknown as UsbModule });

    expect(monitor.find()).toEqual([
      expect.objectContaining({
        vendorId: chromaticUsb.vendorId,
        productId: chromaticUsb.productId
      })
    ]);
  });

  it('translates hotplug attach and detach events', () => {
    const usb = createUsbModule();
    const monitor = createNodeUsbMonitor({ loadUsbModule: () => usb as unknown as UsbModule });
    const onAdd = vi.fn();
    const onRemove = vi.fn();

    monitor.startMonitoring(onAdd, onRemove);

    usb.emit('attach', makeNodeUsbDevice());
    usb.emit('detach', makeNodeUsbDevice({ deviceAddress: 13 }));

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ deviceAddress: 12 }));
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ deviceAddress: 13 }));
    expect(usb.usb.unrefHotplugEvents).toHaveBeenCalled();
  });

  it('removes registered listeners on stop', () => {
    const usb = createUsbModule();
    const monitor = createNodeUsbMonitor({ loadUsbModule: () => usb as unknown as UsbModule });
    const onAdd = vi.fn();

    monitor.startMonitoring(onAdd, vi.fn());
    monitor.stopMonitoring();
    usb.emit('attach', makeNodeUsbDevice());

    expect(onAdd).not.toHaveBeenCalled();
    expect(usb.usb.off).toHaveBeenCalledWith('attach', expect.any(Function));
  });

  it('returns a no-op monitor when the loader returns null', () => {
    const monitor = createNodeUsbMonitor({ loadUsbModule: () => null });
    const onAdd = vi.fn();

    monitor.startMonitoring(onAdd, vi.fn());

    expect(monitor.find()).toEqual([]);
    expect(onAdd).not.toHaveBeenCalled();
    expect(() => monitor.stopMonitoring()).not.toThrow();
  });

  it('returns a no-op monitor when the loader throws', () => {
    const loader = () => {
      throw new Error('native load failed');
    };
    const monitor = createNodeUsbMonitor({ loadUsbModule: loader });

    expect(monitor.find()).toEqual([]);
  });

  it('replaces lifecycle listeners without duplicating hotplug events', () => {
    const usb = createUsbModule();
    const monitor = createNodeUsbMonitor({ loadUsbModule: () => usb as unknown as UsbModule });
    const oldAdd = vi.fn();
    const oldRemove = vi.fn();
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    monitor.startMonitoring(oldAdd, oldRemove);
    monitor.startMonitoring(onAdd, onRemove);
    usb.emit('attach');
    usb.emit('detach');
    expect(oldAdd).not.toHaveBeenCalled();
    expect(oldRemove).not.toHaveBeenCalled();
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
    monitor.stopMonitoring();
    monitor.stopMonitoring();
    usb.emit('attach');
    usb.emit('detach');
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
