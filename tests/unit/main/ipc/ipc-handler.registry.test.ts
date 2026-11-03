import { EventEmitter } from 'node:events';
import type { BrowserWindow } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IpcContext } from '@main/ipc/trpc.js';

const transport = vi.hoisted(() => ({
  createContext: undefined as (() => Promise<IpcContext>) | undefined,
  attachWindow: vi.fn(),
  detachWindow: vi.fn()
}));

vi.mock('electron', () => ({
  app: {},
  shell: {},
  ipcMain: { on: vi.fn(), removeAllListeners: vi.fn() }
}));
vi.mock('electron-trpc/main', () => ({
  createIPCHandler: vi.fn((options: { createContext: () => Promise<IpcContext> }) => {
    transport.createContext = options.createContext;
    return transport;
  })
}));

import { IpcHandlerRegistry } from '@main/ipc/ipc-handler.registry.js';
import { IpcPushBridge } from '@main/ipc/ipc-push.bridge.js';
import { appRouter } from '@main/ipc/router.js';
import { createLoggerFactory } from '../../../factories/logger.factory.js';

async function createRegistry() {
  const bridge = new IpcPushBridge();
  const onRendererReady = vi.fn();
  const registry = new IpcHandlerRegistry({
    deviceConnectionService: {
      getStatus: vi.fn(),
      reconcileDeviceStatus: vi.fn()
    },
    mainProcessTestControl: {
      getDeviceStatusOverride: vi.fn(() => null),
      setDeviceStatusOverride: vi.fn(),
      emitPush: vi.fn()
    },
    updateService: {
      checkForUpdates: vi.fn(), downloadUpdate: vi.fn(), installUpdate: vi.fn(),
      getStatus: vi.fn(() => ({ state: 'idle' as const }))
    },
    windowService: {
      setFullScreen: vi.fn(), isFullScreen: vi.fn(() => false),
      expectDownload: vi.fn(), cancelDownload: vi.fn()
    },
    transcodeService: { transcode: vi.fn(), cancel: vi.fn() },
    loginItemService: { isEnabled: vi.fn(() => false), setEnabled: vi.fn() },
    ipcPushBridge: bridge,
    loggerFactory: createLoggerFactory(),
    onRendererReady
  });
  registry.registerHandlers();
  const webContents = new EventEmitter();
  registry.attachWindow({ webContents, isDestroyed: () => false } as unknown as BrowserWindow);
  const caller = appRouter.createCaller(await transport.createContext!());
  const requests: { requestId: string }[] = [];
  const subscription = (await caller.app.onShutdown()).subscribe({ next: (value) => requests.push(value) });
  return { registry, caller, requests, bridge, onRendererReady, webContents, subscription };
}

describe('renderer shutdown handshake', () => {
  afterEach(() => vi.useRealTimers());

  it('skips partial renderer startup without emitting a request', async () => {
    const { registry, requests } = await createRegistry();
    await registry.shutdownRenderer();
    expect(requests).toEqual([]);
    registry.dispose();
  });

  it('keeps IPC alive and waits for the matching acknowledgement exactly once', async () => {
    const { registry, caller, requests, onRendererReady } = await createRegistry();
    await caller.app.rendererReady();
    expect(onRendererReady).toHaveBeenCalledOnce();
    const shutdown = registry.shutdownRenderer();
    const settled = vi.fn();
    void shutdown.then(settled);
    expect(registry.shutdownRenderer()).toBe(shutdown);
    expect(requests).toHaveLength(1);
    await caller.app.rendererShutdownComplete({ requestId: 'stale-request' });
    expect(settled).not.toHaveBeenCalled();
    await caller.app.rendererShutdownComplete(requests[0]);
    await shutdown;
    expect(settled).toHaveBeenCalledOnce();
    expect(registry.shutdownRenderer()).toBe(shutdown);
    registry.dispose();
  });

  it('reports renderer cleanup failure instead of claiming a successful shutdown', async () => {
    const { registry, caller, requests } = await createRegistry();
    await caller.app.rendererReady();
    const result = expect(registry.shutdownRenderer()).rejects.toThrow('Renderer shutdown failed: note save failed');
    await caller.app.rendererShutdownComplete({ ...requests[0], error: 'note save failed' });
    await result;
    registry.dispose();
  });

  it('bounds an unresponsive renderer and ignores late acknowledgements', async () => {
    vi.useFakeTimers();
    const { registry, caller, requests } = await createRegistry();
    await caller.app.rendererReady();
    const result = expect(registry.shutdownRenderer()).rejects.toThrow('Renderer shutdown timed out');
    await vi.advanceTimersByTimeAsync(30_000);
    await result;
    await caller.app.rendererShutdownComplete(requests[0]);
    registry.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['render-process-gone', 'destroyed'])('rejects when webContents emits %s during cleanup', async (event) => {
    const { registry, caller, webContents } = await createRegistry();
    await caller.app.rendererReady();
    const result = expect(registry.shutdownRenderer()).rejects.toThrow('Renderer exited');
    webContents.emit(event);
    await result;
    registry.dispose();
    expect(webContents.listenerCount(event)).toBe(0);
  });

  it('rejects immediately after an already-ready renderer has crashed', async () => {
    const { registry, caller, webContents, requests } = await createRegistry();
    await caller.app.rendererReady();
    webContents.emit('render-process-gone');
    await expect(registry.shutdownRenderer()).rejects.toThrow('Renderer exited');
    expect(requests).toHaveLength(0);
    registry.dispose();
  });

  it('requests cleanup from a recovered renderer after a fresh readiness notification', async () => {
    const { registry, caller, webContents, requests } = await createRegistry();
    await caller.app.rendererReady();
    webContents.emit('render-process-gone');
    await caller.app.rendererReady();
    const shutdown = registry.shutdownRenderer();
    await caller.app.rendererShutdownComplete(requests[0]);
    await shutdown;
    registry.dispose();
  });

  it('waits for fresh readiness after a full main-frame navigation', async () => {
    const { registry, caller, webContents, requests } = await createRegistry();
    await caller.app.rendererReady();
    webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
    await registry.shutdownRenderer();
    expect(requests).toHaveLength(0);
    await caller.app.rendererReady();
    const shutdown = registry.shutdownRenderer();
    await caller.app.rendererShutdownComplete(requests[0]);
    await shutdown;
    registry.dispose();
  });

  it('returns a rejected shutdown promise when publishing fails', async () => {
    const { registry, caller, bridge } = await createRegistry();
    await caller.app.rendererReady();
    vi.spyOn(bridge, 'emit').mockImplementation(() => { throw new Error('renderer transport gone'); });
    await expect(registry.shutdownRenderer()).rejects.toThrow('renderer transport gone');
    registry.dispose();
  });

  it('rejects a pending handshake if its transport is disposed prematurely', async () => {
    const { registry, caller } = await createRegistry();
    await caller.app.rendererReady();
    const result = expect(registry.shutdownRenderer()).rejects.toThrow('IPC transport disposed');
    registry.dispose();
    await result;
  });
});
