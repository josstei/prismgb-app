import { describe, it, expect, afterEach, vi, type Mock } from 'vitest';
import type { ObservedUsbDevice } from '@platform/devices';
import { DeviceConnectionService } from '@main/infrastructure/devices/device-connection.service';
import { createLoggerFactory } from '../../../../factories/index.js';
import {
  createChromaticDeviceInfoPayload,
  createChromaticUsbDevice
} from '../../../../devices/media.testkit';

describe('DeviceConnectionService', () => {
  let usbMonitor: {
    find: Mock<() => ObservedUsbDevice[]>;
    watch: Mock<(onChange: () => void) => () => void>;
    unwatch: Mock<() => void>;
    hotplug: () => void;
  };

  function createUsbMonitor(): typeof usbMonitor {
    const monitor: typeof usbMonitor = {
      find: vi.fn(() => []),
      unwatch: vi.fn(),
      hotplug: () => {},
      watch: vi.fn((onChange: () => void) => {
        monitor.hotplug = onChange;
        return monitor.unwatch;
      })
    };
    return monitor;
  }

  function createRuntime(now = 1000, loggerFactory = createLoggerFactory()) {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    usbMonitor = createUsbMonitor();
    return new DeviceConnectionService(usbMonitor, loggerFactory);
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('watches USB hotplug on initialize', () => {
    const runtime = createRuntime();

    runtime.initialize();

    expect(usbMonitor.watch).toHaveBeenCalledTimes(1);
  });

  it('watches only once when initialized more than once', () => {
    const loggerFactory = createLoggerFactory();
    const runtime = createRuntime(1000, loggerFactory);

    runtime.initialize();
    runtime.initialize();

    expect(usbMonitor.watch).toHaveBeenCalledTimes(1);
    expect(loggerFactory._getLogger('DeviceConnectionService').warn).toHaveBeenCalledWith(
      'DeviceConnectionService already initialized'
    );
  });

  it('reconciles matching USB devices into canonical connected status', () => {
    const runtime = createRuntime(2000);
    usbMonitor.find.mockReturnValue([createChromaticUsbDevice({
      locationId: 3,
      deviceAddress: 9,
      serialNumber: 'MOCK-001'
    })]);

    const status = runtime.reconcileDeviceStatus('startup');

    expect(status).toEqual({
      state: 'connected',
      connected: true,
      device: createChromaticDeviceInfoPayload({
        locationId: 3,
        deviceAddress: 9,
        serialNumber: 'MOCK-001'
      }),
      updatedAt: 2000
    });
    expect(runtime.getStatus()).toBe(status);
  });

  it('reconciles no matching device into canonical disconnected status', () => {
    const runtime = createRuntime(3000);
    usbMonitor.find.mockReturnValue([{
      ...createChromaticUsbDevice(),
      vendorId: 0x9999
    }]);

    const status = runtime.reconcileDeviceStatus('manual-refresh');

    expect(status).toEqual({
      state: 'disconnected',
      connected: false,
      device: null,
      updatedAt: 3000
    });
    expect(runtime.getStatus().connected).toBe(false);
  });

  it('emits status changes only when connection state changes', () => {
    const runtime = createRuntime(4000);
    const onStatusChanged = vi.fn();
    runtime.onStatusChanged(onStatusChanged);
    usbMonitor.find.mockReturnValue([createChromaticUsbDevice()]);

    runtime.reconcileDeviceStatus('startup');
    runtime.reconcileDeviceStatus('manual-refresh');

    expect(onStatusChanged).toHaveBeenCalledTimes(1);
    expect(onStatusChanged).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'connected', connected: true }),
      'startup'
    );
  });

  it('keeps the first updatedAt while the status is unchanged', () => {
    const runtime = createRuntime(4500);
    usbMonitor.find.mockReturnValue([createChromaticUsbDevice()]);

    runtime.reconcileDeviceStatus('startup');
    vi.mocked(Date.now).mockReturnValue(9999);
    const status = runtime.reconcileDeviceStatus('manual-refresh');

    expect(status.updatedAt).toBe(4500);
  });

  it('reconciles synchronously on hotplug', () => {
    const runtime = createRuntime(5000);
    const onStatusChanged = vi.fn();
    runtime.onStatusChanged(onStatusChanged);
    usbMonitor.find.mockReturnValue([createChromaticUsbDevice()]);

    runtime.initialize();
    usbMonitor.hotplug();

    expect(onStatusChanged).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'connected' }),
      'hotplug'
    );
  });

  it('reports a removed device through the same hotplug path', () => {
    const runtime = createRuntime(5500);
    const onStatusChanged = vi.fn();
    runtime.onStatusChanged(onStatusChanged);
    usbMonitor.find.mockReturnValue([createChromaticUsbDevice()]);

    runtime.reconcileDeviceStatus('startup');
    usbMonitor.find.mockReturnValue([]);
    runtime.initialize();
    usbMonitor.hotplug();

    expect(onStatusChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: 'disconnected', connected: false }),
      'hotplug'
    );
  });

  it('keeps canonical status when a status listener side effect fails', () => {
    const loggerFactory = createLoggerFactory();
    const runtime = createRuntime(5750, loggerFactory);
    const after = vi.fn();
    runtime.onStatusChanged(() => {
      throw new Error('integration failed');
    });
    runtime.onStatusChanged(after);
    usbMonitor.find.mockReturnValue([createChromaticUsbDevice()]);

    const status = runtime.reconcileDeviceStatus('startup');

    expect(status).toMatchObject({
      state: 'connected',
      connected: true,
      device: expect.objectContaining({ id: createChromaticDeviceInfoPayload().id })
    });
    expect(runtime.getStatus()).toBe(status);
    expect(after).toHaveBeenCalledWith(status, 'startup');
    expect(loggerFactory._getLogger('DeviceConnectionService').error).toHaveBeenCalledWith(
      'Device status listener failed',
      expect.any(Error)
    );
  });

  it('emits canonical error status and logs when USB scan fails', () => {
    const loggerFactory = createLoggerFactory();
    const runtime = createRuntime(6000, loggerFactory);
    const onStatusChanged = vi.fn();
    runtime.onStatusChanged(onStatusChanged);
    usbMonitor.find.mockImplementation(() => {
      throw new Error('scan failed');
    });

    const status = runtime.reconcileDeviceStatus('tray-refresh');

    expect(status).toEqual({
      state: 'error',
      connected: false,
      device: null,
      error: 'scan failed',
      updatedAt: 6000
    });
    expect(onStatusChanged).toHaveBeenCalledWith(status, 'tray-refresh');
    expect(loggerFactory._getLogger('DeviceConnectionService').error).toHaveBeenCalledWith(
      'Failed to reconcile device status',
      expect.any(Error)
    );
  });

  it('stops watching USB and drops status listeners on dispose', async () => {
    const runtime = createRuntime();
    const onStatusChanged = vi.fn();
    runtime.onStatusChanged(onStatusChanged);
    usbMonitor.find.mockReturnValue([createChromaticUsbDevice()]);

    runtime.initialize();
    await runtime.dispose();
    runtime.reconcileDeviceStatus('manual-refresh');

    expect(usbMonitor.unwatch).toHaveBeenCalledTimes(1);
    expect(onStatusChanged).not.toHaveBeenCalled();
  });

  it('stops notifying a listener after it unsubscribes', () => {
    const runtime = createRuntime();
    const onStatusChanged = vi.fn();
    const unsubscribe = runtime.onStatusChanged(onStatusChanged);
    usbMonitor.find.mockReturnValue([createChromaticUsbDevice()]);

    unsubscribe();
    runtime.reconcileDeviceStatus('startup');

    expect(onStatusChanged).not.toHaveBeenCalled();
  });
});
