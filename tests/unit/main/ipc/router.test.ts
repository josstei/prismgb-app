import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appRouter } from '@main/ipc/router.js';
import { IpcPushBridge } from '@main/ipc/ipc-push.bridge.js';
import type { IpcContext } from '@main/ipc/trpc.js';
import {
  createChromaticDeviceInfoPayload,
  createChromaticDeviceStatusPayload
} from '../../../devices/media.testkit';

function createContext(overrides: Partial<Record<string, unknown>> = {}) {
  const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const context = {
    deviceConnectionService: {
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
  it('device.getStatus maps canonical device status to the payload-only response', async () => {
    const context = createContext();
    const result = await caller(context).device.getStatus();
    expect(result).toEqual({
      state: 'connected',
      connected: true,
      device: createChromaticDeviceInfoPayload()
    });
  });

  it('device.refreshStatus reconciles through the manual-refresh runtime path', async () => {
    const context = createContext();
    const result = await caller(context).device.refreshStatus();

    expect(context.deviceConnectionService.reconcileDeviceStatus).toHaveBeenCalledWith('manual-refresh');
    expect(result).toEqual({
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

    expect(context.deviceConnectionService.getStatus).not.toHaveBeenCalled();
    expect(result).toEqual(override);
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

    expect(context.deviceConnectionService.reconcileDeviceStatus).not.toHaveBeenCalled();
    expect(result).toEqual(override);
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

    await expect(caller(context).device.getStatus()).resolves.toEqual(override);
    await expect(caller(context).device.getStatus()).resolves.toEqual({
      state: 'connected',
      connected: true,
      device: createChromaticDeviceInfoPayload()
    });
    expect(context.deviceConnectionService.getStatus).toHaveBeenCalledTimes(1);
  });

  it('device.getStatus rethrows a thrown handler error as an INTERNAL_SERVER_ERROR TRPCError', async () => {
    const context = createContext({
      deviceConnectionService: {
        getStatus: vi.fn(() => {
          throw new Error('usb exploded');
        })
      }
    });

    await expect(caller(context).device.getStatus()).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'usb exploded'
    });
  });

  it('device.refreshStatus rethrows a thrown reconcile error as an INTERNAL_SERVER_ERROR TRPCError', async () => {
    const context = createContext({
      deviceConnectionService: {
        getStatus: vi.fn(),
        reconcileDeviceStatus: vi.fn(async () => {
          throw new Error('refresh exploded');
        })
      }
    });

    await expect(caller(context).device.refreshStatus()).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'refresh exploded'
    });
  });

  it('shell.openExternal forwards a valid url and rejects an invalid one at the input boundary', async () => {
    const context = createContext();
    await expect(caller(context).shell.openExternal('https://example.com')).resolves.toBeUndefined();
    expect(context.shell.openExternal).toHaveBeenCalledWith('https://example.com');
    await expect(caller(context).shell.openExternal('javascript:alert(1)')).rejects.toThrow();
  });

  it('shell.openExternal rethrows a thrown handler error as an INTERNAL_SERVER_ERROR TRPCError', async () => {
    const context = createContext({
      shell: {
        openExternal: vi.fn(async () => {
          throw new Error('shell exploded');
        })
      }
    });

    await expect(caller(context).shell.openExternal('https://example.com')).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'shell exploded'
    });
  });

  it('window.setFullScreen forwards the flag and resolves void', async () => {
    const context = createContext();
    await expect(caller(context).window.setFullScreen(true)).resolves.toBeUndefined();
    expect(context.windowService.setFullScreen).toHaveBeenCalledWith(true);
  });

  it('window.setFullScreen rethrows a thrown handler error', async () => {
    const context = createContext({
      windowService: {
        setFullScreen: vi.fn(() => {
          throw new Error('fullscreen exploded');
        }),
        isFullScreen: vi.fn(() => true)
      }
    });

    await expect(caller(context).window.setFullScreen(true)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'fullscreen exploded'
    });
  });

  it('window.isFullScreen returns the payload-only fullscreen state', async () => {
    const context = createContext();
    await expect(caller(context).window.isFullScreen()).resolves.toEqual({ isFullscreen: true });
  });

  it('window.isFullScreen rethrows a thrown handler error', async () => {
    const context = createContext({
      windowService: {
        setFullScreen: vi.fn(),
        isFullScreen: vi.fn(() => {
          throw new Error('query exploded');
        })
      }
    });

    await expect(caller(context).window.isFullScreen()).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'query exploded'
    });
  });

  it('performance.getProcessMetrics returns the payload-only metrics snapshot', async () => {
    const context = createContext({
      app: {
        getAppMetrics: vi.fn(() => [
          { type: 'Renderer', pid: 1, memory: { workingSetSize: 2048, peakWorkingSetSize: 4096 }, cpu: { percentCPUUsage: 5 } }
        ])
      }
    });

    const result = await caller(context).performance.getProcessMetrics();
    expect(result).toMatchObject({
      totalKB: 2048,
      processCount: 1,
      processes: [{ type: 'Renderer', pid: 1, memoryKB: 2048 }]
    });
    expect(result).not.toHaveProperty('success');
  });

  it('performance.getProcessMetrics rethrows a thrown handler error', async () => {
    const context = createContext({
      app: {
        getAppMetrics: vi.fn(() => {
          throw new Error('metrics exploded');
        })
      }
    });

    await expect(caller(context).performance.getProcessMetrics()).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'metrics exploded'
    });
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

  it('transcode.start returns the payload-only shape on service success', async () => {
    const context = createContext();
    const result = await caller(context).transcode.start({ inputBuffer: new ArrayBuffer(8), format: 'mp4' } as never);
    expect(result).toEqual({ jobId: 'job-1' });
  });

  it('transcode.start rethrows an INTERNAL_SERVER_ERROR TRPCError when the service reports a business failure', async () => {
    const context = createContext({
      transcodeService: {
        transcode: vi.fn(async () => ({ success: false, error: 'Unsupported format' })),
        cancel: vi.fn(() => ({ success: true })),
        getStatus: vi.fn(() => ({ success: true }))
      }
    });

    await expect(
      caller(context).transcode.start({ inputBuffer: new ArrayBuffer(8), format: 'mp4' } as never)
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'Unsupported format' });
  });

  it('transcode.start rethrows an INTERNAL_SERVER_ERROR TRPCError when the service throws', async () => {
    const context = createContext({
      transcodeService: {
        transcode: vi.fn(async () => {
          throw new Error('ffmpeg crashed');
        }),
        cancel: vi.fn(() => ({ success: true })),
        getStatus: vi.fn(() => ({ success: true }))
      }
    });

    await expect(
      caller(context).transcode.start({ inputBuffer: new ArrayBuffer(8), format: 'mp4' } as never)
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'ffmpeg crashed' });
  });

  it('transcode.cancel resolves void on service success', async () => {
    const context = createContext();
    await expect(caller(context).transcode.cancel({ jobId: 'job-1' })).resolves.toBeUndefined();
  });

  it('transcode.cancel rethrows an INTERNAL_SERVER_ERROR TRPCError when the service reports a business failure', async () => {
    const context = createContext({
      transcodeService: {
        transcode: vi.fn(async () => ({ success: true, jobId: 'job-1' })),
        cancel: vi.fn(() => ({ success: false, error: 'Job not found or already completed' })),
        getStatus: vi.fn(() => ({ success: true }))
      }
    });

    await expect(caller(context).transcode.cancel({ jobId: 'job-1' })).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Job not found or already completed'
    });
  });

  it('transcode.getStatus returns the payload-only jobs shape on service success', async () => {
    const job = { id: 'job-1', state: 'running', progress: 50, outputPath: null, error: null, startTime: 1 };
    const context = createContext({
      transcodeService: {
        transcode: vi.fn(async () => ({ success: true, jobId: 'job-1' })),
        cancel: vi.fn(() => ({ success: true })),
        getStatus: vi.fn(() => ({ success: true, jobs: [job] }))
      }
    });

    await expect(caller(context).transcode.getStatus()).resolves.toEqual({ jobs: [job] });
  });

  it('transcode.getStatus rethrows an INTERNAL_SERVER_ERROR TRPCError when the service reports a business failure', async () => {
    const context = createContext({
      transcodeService: {
        transcode: vi.fn(async () => ({ success: true, jobId: 'job-1' })),
        cancel: vi.fn(() => ({ success: true })),
        getStatus: vi.fn(() => ({ success: false, error: 'Status unavailable' }))
      }
    });

    await expect(caller(context).transcode.getStatus()).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Status unavailable'
    });
  });

  it('loginItem.set rejects a non-boolean argument at the input boundary', async () => {
    const context = createContext();
    await expect(caller(context).loginItem.set('yes' as never)).rejects.toThrow();
  });

  it('loginItem.set forwards the flag and resolves void', async () => {
    const context = createContext();
    await expect(caller(context).loginItem.set(true)).resolves.toBeUndefined();
    expect(context.loginItemService.setEnabled).toHaveBeenCalledWith(true);
  });

  it('loginItem.set rethrows a thrown handler error', async () => {
    const context = createContext({
      loginItemService: {
        isEnabled: vi.fn(() => true),
        setEnabled: vi.fn(() => {
          throw new Error('login item exploded');
        })
      }
    });

    await expect(caller(context).loginItem.set(true)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'login item exploded'
    });
  });

  it('loginItem.get returns an output-valid payload-only enabled response', async () => {
    const context = createContext();
    const result = await caller(context).loginItem.get();
    expect(result).toEqual({ enabled: true });
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
