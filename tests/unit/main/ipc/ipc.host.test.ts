import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const handler = vi.hoisted(() => ({ attachWindow: vi.fn(), detachWindow: vi.fn() }));

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  return { app: { name: 'app' }, shell: { name: 'shell' }, ipcMain: new EventEmitter() };
});

vi.mock('electron-trpc/main', () => ({
  ELECTRON_TRPC_CHANNEL: 'electron-trpc',
  createIPCHandler: vi.fn(() => handler)
}));

import { app, ipcMain, shell } from 'electron';
import { createIPCHandler } from 'electron-trpc/main';
import { IpcHost } from '@main/ipc/ipc.host';
import { appRouter } from '@main/ipc/router';
import { IpcPushBridge } from '@main/ipc/ipc-push.bridge';
import { TEST_CONTROL_CHANNELS } from '@main/ipc/test-control';
import type { IpcContext } from '@main/ipc/trpc';
import { createInjectableHarness } from '../../../support/di/injectable.harness';
import { createLoggerFactory } from '../../../factories/index.js';

function createWindow(destroyed = false) {
  return { isDestroyed: vi.fn(() => destroyed) } as never;
}

async function contextOf(): Promise<IpcContext> {
  const { createContext } = vi.mocked(createIPCHandler).mock.calls.at(-1)![0];
  return (await createContext!({} as never)) as IpcContext;
}

describe('IpcHost', () => {
  let host: IpcHost;
  let deps: Record<string, unknown>;

  beforeEach(() => {
    vi.mocked(createIPCHandler).mockClear();
    handler.attachWindow.mockClear();
    handler.detachWindow.mockClear();
    const loggerFactory = createLoggerFactory();
    const h = createInjectableHarness(IpcHost, {
      overrides: {
        loggerFactory,
        deviceConnectionService: { name: 'devices' },
        autoUpdateService: { name: 'updates' },
        transcodeService: { name: 'transcode' },
        ipcPushBridge: new IpcPushBridge(loggerFactory)
      }
    });
    host = h.subject;
    deps = h.deps;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    ipcMain.removeAllListeners();
  });

  it('serves the app router with one context built from the injected services', async () => {
    host.registerHandlers();

    expect(createIPCHandler).toHaveBeenCalledWith(expect.objectContaining({ router: appRouter, windows: [] }));
    const context = await contextOf();
    expect(context).toMatchObject({
      deviceConnectionService: deps.deviceConnectionService,
      autoUpdateService: deps.autoUpdateService,
      windowService: deps.windowService,
      transcodeService: deps.transcodeService,
      loginItemService: deps.loginItemService,
      ipcPushBridge: deps.ipcPushBridge,
      app,
      shell,
      testControl: null
    });
    await expect(contextOf()).resolves.toBe(context);
  });

  it('installs test control into the context only when the E2E gate is set', async () => {
    vi.stubEnv('PRISMGB_E2E_TEST_CONTROL', '1');

    host.registerHandlers();

    expect((await contextOf()).testControl).toMatchObject({ deviceStatusOverride: null });
    expect(ipcMain.listenerCount(TEST_CONTROL_CHANNELS.SET_DEVICE_STATUS)).toBe(1);
  });

  it('attaches the main window to the handler', () => {
    const window = createWindow();
    host.registerHandlers();

    host.attachWindow(window);

    expect(handler.attachWindow).toHaveBeenCalledWith(window);
  });

  it('detaches a live window and removes the transport and test-control listeners on dispose', async () => {
    vi.stubEnv('PRISMGB_E2E_TEST_CONTROL', '1');
    const window = createWindow();
    host.registerHandlers();
    host.attachWindow(window);
    ipcMain.on('electron-trpc', vi.fn());

    await host.dispose();

    expect(handler.detachWindow).toHaveBeenCalledWith(window);
    expect(ipcMain.listenerCount('electron-trpc')).toBe(0);
    for (const channel of Object.values(TEST_CONTROL_CHANNELS)) {
      expect(ipcMain.listenerCount(channel)).toBe(0);
    }
  });

  it('skips detaching a window that is already destroyed', async () => {
    host.registerHandlers();
    host.attachWindow(createWindow(true));

    await host.dispose();

    expect(handler.detachWindow).not.toHaveBeenCalled();
  });
});
