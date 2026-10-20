import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { appRouter } from '@main/ipc/router';
import { IpcPushBridge } from '@main/ipc/ipc-push.bridge';
import { externalUrlSchema } from '@main/ipc/ipc.schemas';
import type { IpcContext } from '@main/ipc/trpc';
import type { TestControl } from '@main/ipc/test-control';
import { callIpc } from '@renderer/infrastructure/ipc/call-ipc';
import { createLoggerFactory } from '../../../factories/index.js';
import {
  createChromaticDeviceInfoPayload,
  createChromaticDeviceStatusPayload
} from '../../../devices/media.testkit';

type LogMethod = Mock<(...args: unknown[]) => void>;
type MockLogger = { info: LogMethod; debug: LogMethod; warn: LogMethod; error: LogMethod };

function createLogger(): MockLogger {
  return { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function createContext(overrides: Partial<Record<keyof IpcContext, unknown>> = {}) {
  const context = {
    deviceConnectionService: {
      getStatus: vi.fn(() => ({
        state: 'connected',
        connected: true,
        device: createChromaticDeviceInfoPayload(),
        updatedAt: 12345
      })),
      reconcileDeviceStatus: vi.fn(() => ({
        state: 'connected',
        connected: true,
        device: createChromaticDeviceInfoPayload(),
        updatedAt: 12346
      }))
    },
    autoUpdateService: {
      checkForUpdates: vi.fn(async () => ({ updateAvailable: false, reason: 'development' })),
      downloadUpdate: vi.fn(async () => undefined),
      installUpdate: vi.fn(),
      getStatus: vi.fn(() => ({ state: 'idle', updateInfo: null, downloadProgress: null, error: null }))
    },
    windowService: { setFullScreen: vi.fn(), isFullScreen: vi.fn(() => true) },
    transcodeService: {
      transcode: vi.fn(async () => 'job-1')
    },
    loginItemService: { isEnabled: vi.fn(() => true), setEnabled: vi.fn() },
    app: { getAppMetrics: vi.fn(() => []) },
    shell: { openExternal: vi.fn(async () => undefined) },
    logger: createLogger(),
    ipcPushBridge: new IpcPushBridge(createLoggerFactory()),
    testControl: null,
    ...overrides
  };
  return context as unknown as IpcContext & { logger: MockLogger };
}

function caller(context: IpcContext) {
  return appRouter.createCaller(context);
}

function testControlWith(deviceStatusOverride: TestControl['deviceStatusOverride']): TestControl {
  return { deviceStatusOverride, dispose: vi.fn() };
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

  it('device.getStatus uses the test-control status override without reading runtime state', async () => {
    const override = createChromaticDeviceStatusPayload(false);
    const context = createContext({ testControl: testControlWith(override) });

    const result = await caller(context).device.getStatus();

    expect(context.deviceConnectionService.getStatus).not.toHaveBeenCalled();
    expect(result).toEqual(override);
  });

  it('device.refreshStatus uses the test-control status override without reconciling runtime state', async () => {
    const override = createChromaticDeviceStatusPayload(true, { serialNumber: 'OVERRIDE-1' });
    const context = createContext({ testControl: testControlWith(override) });

    const result = await caller(context).device.refreshStatus();

    expect(context.deviceConnectionService.reconcileDeviceStatus).not.toHaveBeenCalled();
    expect(result).toEqual(override);
  });

  it('device.getStatus falls back to runtime after the status override clears', async () => {
    const override = createChromaticDeviceStatusPayload(false);
    const testControl = { deviceStatusOverride: override as TestControl['deviceStatusOverride'], dispose: vi.fn() };
    const context = createContext({ testControl });

    await expect(caller(context).device.getStatus()).resolves.toEqual(override);
    testControl.deviceStatusOverride = null;
    await expect(caller(context).device.getStatus()).resolves.toEqual({
      state: 'connected',
      connected: true,
      device: createChromaticDeviceInfoPayload()
    });
    expect(context.deviceConnectionService.getStatus).toHaveBeenCalledTimes(1);
  });

  it('device.getStatus rethrows a thrown handler error as an INTERNAL_SERVER_ERROR and logs the path', async () => {
    const thrown = new Error('usb exploded');
    const context = createContext({
      deviceConnectionService: {
        getStatus: vi.fn(() => {
          throw thrown;
        })
      }
    });

    await expect(caller(context).device.getStatus()).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'usb exploded'
    });
    expect(context.logger.error).toHaveBeenCalledWith('IPC device.getStatus failed', thrown);
  });

  it('device.refreshStatus rethrows a thrown reconcile error as an INTERNAL_SERVER_ERROR', async () => {
    const context = createContext({
      deviceConnectionService: {
        getStatus: vi.fn(),
        reconcileDeviceStatus: vi.fn(() => {
          throw new Error('refresh exploded');
        })
      }
    });

    await expect(caller(context).device.refreshStatus()).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'refresh exploded'
    });
    expect(context.logger.error).toHaveBeenCalledWith('IPC device.refreshStatus failed', expect.any(Error));
  });

  it('shell.openExternal forwards a valid url and rejects an invalid one at the input boundary', async () => {
    const context = createContext();
    await expect(caller(context).shell.openExternal({ url: 'https://example.com' })).resolves.toBeUndefined();
    expect(context.shell.openExternal).toHaveBeenCalledWith('https://example.com');
    await expect(caller(context).shell.openExternal({ url: 'javascript:alert(1)' })).rejects.toMatchObject({
      code: 'BAD_REQUEST'
    });
    expect(context.shell.openExternal).toHaveBeenCalledTimes(1);
  });

  it('shell.openExternal rethrows a thrown handler error as an INTERNAL_SERVER_ERROR', async () => {
    const context = createContext({
      shell: {
        openExternal: vi.fn(async () => {
          throw new Error('shell exploded');
        })
      }
    });

    await expect(caller(context).shell.openExternal({ url: 'https://example.com' })).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'shell exploded'
    });
    expect(context.logger.error).toHaveBeenCalledWith('IPC shell.openExternal failed', expect.any(Error));
  });

  it('window.setFullScreen forwards enabled: true to the window service', async () => {
    const context = createContext();
    await expect(caller(context).window.setFullScreen({ enabled: true })).resolves.toBeUndefined();
    expect(context.windowService.setFullScreen).toHaveBeenCalledWith(true);
  });

  it('window.setFullScreen forwards enabled: false to the window service (falsy flag survives the boxed input)', async () => {
    const context = createContext();
    await expect(caller(context).window.setFullScreen({ enabled: false })).resolves.toBeUndefined();
    expect(context.windowService.setFullScreen).toHaveBeenCalledWith(false);
  });

  it('window.setFullScreen rejects a bare boolean at the input boundary', async () => {
    const context = createContext();
    await expect(caller(context).window.setFullScreen(false as never)).rejects.toThrow();
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

    await expect(caller(context).window.setFullScreen({ enabled: true })).rejects.toMatchObject({
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

  it('update procedures return the service results unchanged', async () => {
    const context = createContext();

    await expect(caller(context).update.checkForUpdates()).resolves.toEqual({ updateAvailable: false, reason: 'development' });
    await expect(caller(context).update.getStatus()).resolves.toEqual({
      state: 'idle',
      updateInfo: null,
      downloadProgress: null,
      error: null
    });
    await expect(caller(context).update.downloadUpdate()).resolves.toBeUndefined();
    await expect(caller(context).update.installUpdate()).resolves.toBeUndefined();
    expect(context.autoUpdateService.installUpdate).toHaveBeenCalledTimes(1);
  });

  it('update.installUpdate surfaces the service error message', async () => {
    const context = createContext({
      autoUpdateService: {
        installUpdate: vi.fn(() => {
          throw new Error('No update downloaded to install');
        })
      }
    });

    await expect(caller(context).update.installUpdate()).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'No update downloaded to install'
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
      totalMB: '2.0',
      processCount: 1,
      processes: [{ type: 'Renderer', pid: 1, memoryKB: 2048, memoryMB: '2.0', peakMemoryKB: 4096, peakMemoryMB: '4.0', cpuPercent: 5 }]
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

  it('transcode.start rejects a differently cased format at the input boundary', async () => {
    const context = createContext();
    await expect(
      caller(context).transcode.start({ inputBuffer: new ArrayBuffer(8), format: 'WEBM' } as never)
    ).rejects.toThrow();
    expect(context.transcodeService.transcode).not.toHaveBeenCalled();
  });

  it('transcode.start passes a Buffer, the filename and the interrupted flag through to the service', async () => {
    const context = createContext();
    await caller(context).transcode.start({
      inputBuffer: new ArrayBuffer(8),
      format: 'mp4',
      outputFilename: 'recording',
      interrupted: true
    });
    const passed = (context.transcodeService.transcode as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(Buffer.isBuffer(passed.inputBuffer)).toBe(true);
    expect(passed).toMatchObject({ format: 'mp4', outputFilename: 'recording', interrupted: true });
  });

  it('transcode.start never forwards renderer-supplied ffmpeg arguments', async () => {
    const context = createContext();
    await caller(context).transcode.start({
      inputBuffer: new ArrayBuffer(8),
      format: 'mp4',
      inputArgs: ['-vf', 'scale=1']
    } as never);
    const passed = (context.transcodeService.transcode as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(passed).not.toHaveProperty('inputArgs');
    expect(passed.interrupted).toBeUndefined();
  });

  it('transcode.start returns the payload-only shape on service success', async () => {
    const context = createContext();
    const result = await caller(context).transcode.start({ inputBuffer: new ArrayBuffer(8), format: 'mp4' } as never);
    expect(result).toEqual({ jobId: 'job-1' });
  });

  it('transcode.start surfaces the service validation message verbatim', async () => {
    const context = createContext({
      transcodeService: {
        transcode: vi.fn(async () => {
          throw new Error('Output filename is required');
        })
      }
    });

    await expect(
      caller(context).transcode.start({ inputBuffer: new ArrayBuffer(8), format: 'mp4' } as never)
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'Output filename is required' });
  });

  it('transcode.start rethrows an INTERNAL_SERVER_ERROR when the service throws', async () => {
    const context = createContext({
      transcodeService: {
        transcode: vi.fn(async () => {
          throw new Error('ffmpeg crashed');
        })
      }
    });

    await expect(
      caller(context).transcode.start({ inputBuffer: new ArrayBuffer(8), format: 'mp4' } as never)
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'ffmpeg crashed' });
    expect(context.logger.error).toHaveBeenCalledWith('IPC transcode.start failed', expect.any(Error));
  });

  it('loginItem.set rejects a malformed or bare argument at the input boundary', async () => {
    const context = createContext();
    await expect(caller(context).loginItem.set({ enabled: 'yes' } as never)).rejects.toThrow();
    await expect(caller(context).loginItem.set(true as never)).rejects.toThrow();
  });

  it('loginItem.set forwards enabled: true to the login item service', async () => {
    const context = createContext();
    await expect(caller(context).loginItem.set({ enabled: true })).resolves.toBeUndefined();
    expect(context.loginItemService.setEnabled).toHaveBeenCalledWith(true);
  });

  it('loginItem.set forwards enabled: false to the login item service (falsy flag survives the boxed input)', async () => {
    const context = createContext();
    await expect(caller(context).loginItem.set({ enabled: false })).resolves.toBeUndefined();
    expect(context.loginItemService.setEnabled).toHaveBeenCalledWith(false);
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

    await expect(caller(context).loginItem.set({ enabled: true })).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'login item exploded'
    });
  });

  it('loginItem.get returns the payload-only enabled response', async () => {
    const context = createContext();
    const result = await caller(context).loginItem.get();
    expect(result).toEqual({ enabled: true });
  });
});

describe('appRouter — renderer error text (callIpc)', () => {
  function failingWindowContext(thrown: unknown) {
    return createContext({
      windowService: {
        setFullScreen: vi.fn(() => {
          throw thrown;
        }),
        isFullScreen: vi.fn()
      }
    });
  }

  async function rendererErrorText(context: IpcContext, run: (client: ReturnType<typeof caller>) => Promise<unknown>) {
    const result = await callIpc('test', () => run(caller(context)), createLogger());
    return result.status === 'error' ? result.error : null;
  }

  it.each([
    ['an Error', new Error('x'), 'x'],
    ['an Error without a message', new Error(''), 'Unknown error'],
    ['a thrown string', 'disk full', 'disk full'],
    ['a non-Error object', { code: 'ENOENT' }, 'Unknown error']
  ])('surfaces %s as the same string the renderer showed before', async (_label, thrown, expected) => {
    const context = failingWindowContext(thrown);

    await expect(rendererErrorText(context, (client) => client.window.setFullScreen({ enabled: true }))).resolves.toBe(expected);
    expect(context.logger.error).toHaveBeenCalledWith('IPC window.setFullScreen failed', expect.anything());
  });

  it('surfaces a zod BAD_REQUEST as the validation message and does not log it', async () => {
    const context = createContext();
    const zodMessage = externalUrlSchema.safeParse({ url: 'javascript:alert(1)' }).error?.message;

    await expect(
      rendererErrorText(context, (client) => client.shell.openExternal({ url: 'javascript:alert(1)' }))
    ).resolves.toBe(zodMessage);
    expect(zodMessage).toContain('Only http and https URLs are allowed');
    expect(context.logger.error).not.toHaveBeenCalled();
  });
});

describe('appRouter — subscriptions', () => {
  let bridge: IpcPushBridge;
  let context: ReturnType<typeof createContext>;

  beforeEach(() => {
    bridge = new IpcPushBridge(createLoggerFactory());
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
    expect(context.logger.warn).toHaveBeenCalledWith('Dropping invalid device:connected subscription payload');
    subscription.unsubscribe();
  });

  it('device.onDisconnected relays an empty payload', async () => {
    const observableResult = await caller(context).device.onDisconnected();
    const received: unknown[] = [];
    const subscription = observableResult.subscribe({ next: (value: unknown) => received.push(value) });

    bridge.emit('device:disconnected');

    expect(received).toEqual([undefined]);
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

  it('relays update and transcode payloads exactly as main emitted them', async () => {
    const updates: unknown[] = [];
    const transcodes: unknown[] = [];
    const updateSubscription = (await caller(context).update.onAvailable()).subscribe({ next: (value: unknown) => updates.push(value) });
    const transcodeSubscription = (await caller(context).transcode.onCompleted()).subscribe({ next: (value: unknown) => transcodes.push(value) });

    bridge.emit('update:available', { version: '2.0.0', releaseDate: '2026-01-01' });
    bridge.emit('transcode:completed', { jobId: 'j', filePath: '/downloads/out.mp4' });

    expect(updates).toEqual([{ version: '2.0.0', releaseDate: '2026-01-01' }]);
    expect(transcodes).toEqual([{ jobId: 'j', filePath: '/downloads/out.mp4' }]);
    updateSubscription.unsubscribe();
    transcodeSubscription.unsubscribe();
  });

  it('stops listening on the bridge when the subscription ends', async () => {
    const received: unknown[] = [];
    const subscription = (await caller(context).transcode.onProgress()).subscribe({ next: (value: unknown) => received.push(value) });

    subscription.unsubscribe();
    bridge.emit('transcode:progress', { percent: 10 });

    expect(received).toEqual([]);
  });
});
