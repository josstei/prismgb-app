import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appRouter } from '@main/ipc/router.js';
import { IpcPushBridge } from '@main/ipc/event-bridge.js';
import type { IpcContext } from '@main/ipc/trpc.js';
import {
  createChromaticDeviceInfoPayload,
  createChromaticDeviceStatusPayload
} from '../../../devices/media.testkit';

function createContext(overrides: Partial<Record<string, unknown>> = {}) {
  const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const context = {
    mainDeviceRuntime: {
      getStatus: vi.fn(() => ({
        state: 'connected',
        connected: true,
        device: createChromaticDeviceInfoPayload(),
        updatedAt: 12345
      })),
      reconcileDeviceStatus: vi.fn(async () => ({
        state: 'connected',
        connected: true,
        device: createChromaticDeviceInfoPayload(),
        updatedAt: 12346
      }))
    },
    mainProcessTestControl: {
      getDeviceStatusOverride: vi.fn(() => null),
      setDeviceStatusOverride: vi.fn(),
      emitPush: vi.fn()
    },
    updateService: {
      checkForUpdates: vi.fn(async () => ({ version: '1.0.0' })),
      downloadUpdate: vi.fn(async () => undefined),
      installUpdate: vi.fn(),
      getStatus: vi.fn(() => ({ state: 'idle' }))
    },
    windowService: { setFullScreen: vi.fn(), isFullScreen: vi.fn(() => true) },
    transcodeService: {
      transcode: vi.fn(async () => ({ success: true, jobId: 'job-1' })),
      cancel: vi.fn(() => ({ success: true })),
      getStatus: vi.fn(() => ({ success: true }))
    },
    loginItemService: { isEnabled: vi.fn(() => true), setEnabled: vi.fn() },
    app: { getAppMetrics: vi.fn(() => []) },
    shell: { openExternal: vi.fn(async () => undefined) },
    logger,
    ipcPushBridge: new IpcPushBridge(),
    ...overrides
  };
  return context as unknown as IpcContext;
}

function caller(context: IpcContext) {
  return appRouter.createCaller(context);
}

describe('appRouter — queries / mutations', () => {
  it('device.getStatus maps canonical device status to the IPC success envelope', async () => {
    const context = createContext();
    const result = await caller(context).device.getStatus();
    expect(result).toEqual({
      success: true,
      state: 'connected',
      connected: true,
      device: createChromaticDeviceInfoPayload()
    });
  });

  it('device.refreshStatus reconciles through the manual-refresh runtime path', async () => {
    const context = createContext();
    const result = await caller(context).device.refreshStatus();

    expect(context.mainDeviceRuntime.reconcileDeviceStatus).toHaveBeenCalledWith('manual-refresh');
    expect(result).toEqual({
      success: true,
      state: 'connected',
      connected: true,
      device: createChromaticDeviceInfoPayload()
    });
  });

  it('device.getStatus uses context status override without reading runtime state', async () => {
    const override = createChromaticDeviceStatusPayload(false);
    const context = createContext({
      mainProcessTestControl: {
        getDeviceStatusOverride: vi.fn(() => override),
        setDeviceStatusOverride: vi.fn(),
        emitPush: vi.fn()
      }
    });

    const result = await caller(context).device.getStatus();

    expect(context.mainDeviceRuntime.getStatus).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      ...override
    });
  });

  it('device.refreshStatus uses context status override without reconciling runtime state', async () => {
    const override = createChromaticDeviceStatusPayload(true, { serialNumber: 'OVERRIDE-1' });
    const context = createContext({
      mainProcessTestControl: {
        getDeviceStatusOverride: vi.fn(() => override),
        setDeviceStatusOverride: vi.fn(),
        emitPush: vi.fn()
      }
    });

    const result = await caller(context).device.refreshStatus();

    expect(context.mainDeviceRuntime.reconcileDeviceStatus).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      ...override
    });
  });

  it('device.getStatus falls back to runtime after status override clears', async () => {
    const override = createChromaticDeviceStatusPayload(false);
    const getDeviceStatusOverride = vi.fn()
      .mockReturnValueOnce(override)
      .mockReturnValueOnce(null);
    const context = createContext({
      mainProcessTestControl: {
        getDeviceStatusOverride,
        setDeviceStatusOverride: vi.fn(),
        emitPush: vi.fn()
      }
    });

    await expect(caller(context).device.getStatus()).resolves.toEqual({
      success: true,
      ...override
    });
    await expect(caller(context).device.getStatus()).resolves.toEqual({
      success: true,
      state: 'connected',
      connected: true,
      device: createChromaticDeviceInfoPayload()
    });
    expect(context.mainDeviceRuntime.getStatus).toHaveBeenCalledTimes(1);
  });

  it('device.getStatus maps a thrown handler error to a failure envelope (resultEnvelope)', async () => {
    const context = createContext({
      mainDeviceRuntime: {
        getStatus: vi.fn(() => {
          throw new Error('usb exploded');
        })
      }
    });
    const result = await caller(context).device.getStatus();
    expect(result).toEqual({
      success: false,
      state: 'error',
      connected: false,
      device: null,
      error: 'usb exploded'
    });
  });

  it('device.refreshStatus maps a thrown reconcile error to a failure envelope', async () => {
    const context = createContext({
      mainDeviceRuntime: {
        getStatus: vi.fn(),
        reconcileDeviceStatus: vi.fn(async () => {
          throw new Error('refresh exploded');
        })
      }
    });

    const result = await caller(context).device.refreshStatus();

    expect(result).toEqual({
      success: false,
      state: 'error',
      connected: false,
      device: null,
      error: 'refresh exploded'
    });
  });

  it('shell.openExternal forwards a valid url and rejects an invalid one at the input boundary', async () => {
    const context = createContext();
    await expect(caller(context).shell.openExternal('https://example.com')).resolves.toMatchObject({ success: true });
    expect(context.shell.openExternal).toHaveBeenCalledWith('https://example.com');
    await expect(caller(context).shell.openExternal('javascript:alert(1)')).rejects.toThrow();
  });

  it('transcode.start rejects an unsupported format at the input boundary', async () => {
    const context = createContext();
    await expect(
      caller(context).transcode.start({ inputBuffer: new ArrayBuffer(8), format: 'avi' } as never)
    ).rejects.toThrow();
  });

  it('transcode.start passes a Buffer + interrupted flag through to the service for a valid input', async () => {
    const context = createContext();
    await caller(context).transcode.start({ inputBuffer: new ArrayBuffer(8), format: 'mp4' } as never);
    const passed = (context.transcodeService.transcode as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(Buffer.isBuffer(passed.inputBuffer)).toBe(true);
    expect(passed.format).toBe('mp4');
    expect(passed.interrupted).toBe(false);
  });

  it('loginItem.set rejects a non-boolean argument at the input boundary', async () => {
    const context = createContext();
    await expect(caller(context).loginItem.set('yes' as never)).rejects.toThrow();
  });

  it('gpu.getPolicy returns an output-valid policy envelope', async () => {
    const context = createContext();
    const result = await caller(context).gpu.getPolicy();
    expect(result.success).toBe(true);
    expect(typeof result.skipWebGPU).toBe('boolean');
  });

  it('loginItem.get returns an output-valid enabled envelope', async () => {
    const context = createContext();
    const result = await caller(context).loginItem.get();
    expect(result).toMatchObject({ success: true, enabled: true });
  });
});

describe('appRouter — subscriptions', () => {
  let bridge: IpcPushBridge;
  let context: IpcContext;

  beforeEach(() => {
    bridge = new IpcPushBridge();
    context = createContext({ ipcPushBridge: bridge });
  });

  it('device.onConnected relays valid payloads and drops invalid ones (stream stays alive)', async () => {
    const observableResult = await caller(context).device.onConnected();
    const received: unknown[] = [];
    const subscription = observableResult.subscribe({ next: (value: unknown) => received.push(value) });

    const validDevice = createChromaticDeviceInfoPayload();

    bridge.emit('device:connected', validDevice);
    bridge.emit('device:connected', { vendorId: 'not-a-number' });
    bridge.emit('device:connected', { ...validDevice, extra: true });
    bridge.emit('device:connected', { ...validDevice, serialNumber: 'MOCK-002' });

    expect(received).toEqual([
      validDevice,
      { ...validDevice, serialNumber: 'MOCK-002' }
    ]);
    subscription.unsubscribe();
  });

  it('window.onEnterFullscreen relays a void payload', async () => {
    const observableResult = await caller(context).window.onEnterFullscreen();
    const received: unknown[] = [];
    const subscription = observableResult.subscribe({ next: (value: unknown) => received.push(value) });

    bridge.emit('window:enter-fullscreen');

    expect(received).toEqual([undefined]);
    subscription.unsubscribe();
  });
});
