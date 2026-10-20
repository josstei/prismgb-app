import { describe, it, expect, vi } from 'vitest';
import { createNodeUsbMonitor, type UsbModule } from '@main/infrastructure/devices/usb.monitor';
import { CHROMATIC_DESCRIPTOR } from '../../../../devices/media.testkit';

const chromaticUsb = CHROMATIC_DESCRIPTOR.usb;

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
    attach: new Set<(device: unknown) => void>(),
    detach: new Set<(device: unknown) => void>()
  };
  const usb = {
    getDeviceList: vi.fn<() => ReturnType<typeof makeNodeUsbDevice>[]>(() => []),
    usb: {
      on: vi.fn((event: 'attach' | 'detach', listener: (device: unknown) => void) => {
        listeners[event].add(listener);
      }),
      off: vi.fn((event: 'attach' | 'detach', listener: (device: unknown) => void) => {
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

function monitorFor(usb: ReturnType<typeof createUsbModule>) {
  return createNodeUsbMonitor(() => usb as unknown as UsbModule);
}

describe('usb.monitor', () => {
  it('maps node-usb devices to observed USB identities', () => {
    const usb = createUsbModule();
    usb.getDeviceList.mockReturnValue([makeNodeUsbDevice()]);

    expect(monitorFor(usb).find()).toEqual([{
      vendorId: chromaticUsb.vendorId,
      productId: chromaticUsb.productId,
      locationId: 4,
      deviceAddress: 12
    }]);
  });

  it('calls the watcher on attach and detach without passing the device', () => {
    const usb = createUsbModule();
    const onChange = vi.fn();

    monitorFor(usb).watch(onChange);
    usb.emit('attach');
    usb.emit('detach', makeNodeUsbDevice({ deviceAddress: 13 }));

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenNthCalledWith(1);
    expect(usb.usb.unrefHotplugEvents).toHaveBeenCalled();
  });

  it('removes both hotplug listeners on unsubscribe', () => {
    const usb = createUsbModule();
    const onChange = vi.fn();

    const unwatch = monitorFor(usb).watch(onChange);
    unwatch();
    usb.emit('attach');
    usb.emit('detach');

    expect(onChange).not.toHaveBeenCalled();
    expect(usb.usb.off).toHaveBeenCalledWith('attach', expect.any(Function));
    expect(usb.usb.off).toHaveBeenCalledWith('detach', expect.any(Function));
  });

  it('watches nothing when the module has no hotplug emitter', () => {
    const usb = { getDeviceList: vi.fn(() => []) };
    const monitor = createNodeUsbMonitor(() => usb as unknown as UsbModule);

    expect(() => monitor.watch(vi.fn())()).not.toThrow();
  });

  it('returns a no-op monitor when the native module is unavailable', () => {
    const monitor = createNodeUsbMonitor(() => null);
    const onChange = vi.fn();

    const unwatch = monitor.watch(onChange);

    expect(monitor.find()).toEqual([]);
    expect(() => unwatch()).not.toThrow();
    expect(onChange).not.toHaveBeenCalled();
  });
});
