import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeviceConnectionService } from '@platform/devices/runtime';
import { createLoggerFactory } from '../../../../factories/index.js';
import {
  createChromaticDeviceInfoPayload,
  createChromaticUsbDevice
} from '../../../../devices/media.testkit';

describe('DeviceConnectionService', () => {
  let usbMonitor: {
    startMonitoring: ReturnType<typeof vi.fn>;
    stopMonitoring: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
  };
  let lifecycleListeners: {
    onAdd?: (device: unknown) => void;
    onRemove?: (device: unknown) => void;
  };

  function createUsbMonitor() {
    lifecycleListeners = {};
    return {
      startMonitoring: vi.fn((onAdd, onRemove) => {
        lifecycleListeners.onAdd = onAdd;
        lifecycleListeners.onRemove = onRemove;
      }),
      stopMonitoring: vi.fn(),
      find: vi.fn(() => [])
    };
  }

  function createRuntime() {
    usbMonitor = createUsbMonitor();
    return new DeviceConnectionService({
      loggerFactory: createLoggerFactory(),
      usbMonitor: usbMonitor as never
    });
  }

  it('starts USB monitoring and registers hotplug listeners on initialize', async () => {
    const runtime = createRuntime();

    await runtime.initialize();

    expect(usbMonitor.startMonitoring).toHaveBeenCalledTimes(1);
  });

  it('is idempotent when initialized more than once', async () => {
    const runtime = createRuntime();

    await runtime.initialize();
    await runtime.initialize();

    expect(usbMonitor.startMonitoring).toHaveBeenCalledTimes(1);
  });

  it('reconciles matching USB devices into canonical connected status', async () => {
    const runtime = createRuntime();
    usbMonitor.find.mockReturnValue([createChromaticUsbDevice({
      locationId: 3,
      deviceAddress: 9,
      serialNumber: 'MOCK-001'
    })]);

    const status = await runtime.reconcileDeviceStatus('startup');

    expect(status).toEqual({
      state: 'connected',
      connected: true,
      device: createChromaticDeviceInfoPayload({
        locationId: 3,
        deviceAddress: 9,
        serialNumber: 'MOCK-001'
      })
    });
    expect(runtime.isConnected()).toBe(true);
  });

  it('reconciles no matching device into canonical disconnected status', async () => {
    const runtime = createRuntime();
    usbMonitor.find.mockReturnValue([{
      ...createChromaticUsbDevice(),
      vendorId: 0x9999
    }]);

    const status = await runtime.reconcileDeviceStatus('manual-refresh');

    expect(status).toEqual({
      state: 'disconnected',
      connected: false,
      device: null
    });
    expect(runtime.isConnected()).toBe(false);
  });

  it('emits status changes only when connection state changes', async () => {
    const runtime = createRuntime();
    const onStatusChanged = vi.fn();
    runtime.onStatusChanged(onStatusChanged);
    usbMonitor.find.mockReturnValue([createChromaticUsbDevice()]);

    await runtime.reconcileDeviceStatus('startup');
    await runtime.reconcileDeviceStatus('manual-refresh');

    expect(onStatusChanged).toHaveBeenCalledTimes(1);
    expect(onStatusChanged).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'connected', connected: true }),
      'startup'
    );
  });

  it('routes hotplug callbacks through the same reconciliation path', async () => {
    const runtime = createRuntime();
    const onStatusChanged = vi.fn();
    runtime.onStatusChanged(onStatusChanged);
    usbMonitor.find.mockReturnValue([createChromaticUsbDevice()]);

    await runtime.initialize();
    lifecycleListeners.onAdd?.({});
    await Promise.resolve();

    expect(onStatusChanged).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'connected' }),
      'hotplug-add'
    );
  });

  it('routes hotplug remove callbacks through the same reconciliation path', async () => {
    const runtime = createRuntime();
    const onStatusChanged = vi.fn();
    runtime.onStatusChanged(onStatusChanged);
    usbMonitor.find.mockReturnValue([createChromaticUsbDevice()]);

    await runtime.reconcileDeviceStatus('startup');
    usbMonitor.find.mockReturnValue([]);
    await runtime.initialize();
    lifecycleListeners.onRemove?.({});
    await Promise.resolve();

    expect(onStatusChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: 'disconnected', connected: false }),
      'hotplug-remove'
    );
  });

  it('keeps canonical status when a status listener side effect fails', async () => {
    const loggerFactory = createLoggerFactory();
    usbMonitor = createUsbMonitor();
    const runtime = new DeviceConnectionService({
      loggerFactory,
      usbMonitor: usbMonitor as never
    });
    runtime.onStatusChanged(() => {
      throw new Error('integration failed');
    });
    usbMonitor.find.mockReturnValue([createChromaticUsbDevice()]);

    const status = await runtime.reconcileDeviceStatus('startup');

    expect(status).toMatchObject({
      state: 'connected',
      connected: true,
      device: expect.objectContaining({ id: createChromaticDeviceInfoPayload().id })
    });
    expect(runtime.getStatus()).toBe(status);
    expect(loggerFactory._getLogger('DeviceConnectionService').error).toHaveBeenCalledWith(
      'Device status listener failed',
      expect.any(Error)
    );
  });

  it('emits canonical error status when USB scan fails', async () => {
    const runtime = createRuntime();
    const onStatusChanged = vi.fn();
    runtime.onStatusChanged(onStatusChanged);
    usbMonitor.find.mockImplementation(() => {
      throw new Error('scan failed');
    });

    const status = await runtime.reconcileDeviceStatus('tray-refresh');

    expect(status).toEqual({
      state: 'error',
      connected: false,
      device: null,
      error: 'scan failed'
    });
    expect(onStatusChanged).toHaveBeenCalledWith(status, 'tray-refresh');
  });

  it('cleans up USB lifecycle listeners and monitoring on dispose', async () => {
    const runtime = createRuntime();

    await runtime.initialize();
    await runtime.dispose();

    expect(usbMonitor.stopMonitoring).toHaveBeenCalled();
  });

  it('keeps the latest USB status when attach and detach arrive in the same turn', async () => {
    const runtime = createRuntime();
    const listener = vi.fn();
    runtime.onStatusChanged(listener);
    await runtime.initialize();
    usbMonitor.find.mockReturnValue([createChromaticUsbDevice()]);
    lifecycleListeners.onAdd?.({});
    usbMonitor.find.mockReturnValue([]);
    lifecycleListeners.onRemove?.({});
    expect(listener.mock.calls.map(([status]) => status.connected)).toEqual([true, false]);
    expect(runtime.getStatus()).toEqual({ state: 'disconnected', connected: false, device: null });
    await runtime.dispose();
  });

  it('can initialize again after disposal without retaining old subscribers', async () => {
    const runtime = createRuntime();
    const listener = vi.fn();
    runtime.onStatusChanged(listener);
    await runtime.initialize();
    await runtime.dispose();
    await runtime.initialize();
    usbMonitor.find.mockReturnValue([createChromaticUsbDevice()]);
    lifecycleListeners.onAdd?.({});
    expect(usbMonitor.startMonitoring).toHaveBeenCalledTimes(2);
    expect(listener).not.toHaveBeenCalled();
    expect(runtime.isConnected()).toBe(true);
    await runtime.dispose();
  });
});
