/** Main runtime ownership and process isolation. */

import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('electron', () => {
  class MockBrowserWindow {}
  class MockTray {
    setToolTip = vi.fn();
    setContextMenu = vi.fn();
    on = vi.fn();
    destroy = vi.fn();
  }
  return {
    app: {
      getAppPath: vi.fn(() => '/app'),
      getVersion: vi.fn(() => '1.0.0'),
      getPath: vi.fn(() => '/tmp'),
      getLoginItemSettings: vi.fn(() => ({ wasOpenedAtLogin: false })),
      setLoginItemSettings: vi.fn(),
      isPackaged: false,
      on: vi.fn(),
      quit: vi.fn(),
      isQuitting: false,
      dock: { setIcon: vi.fn() }
    },
    BrowserWindow: MockBrowserWindow,
    Tray: MockTray,
    Menu: { buildFromTemplate: vi.fn(() => ({})), setApplicationMenu: vi.fn() },
    ipcMain: { handle: vi.fn(), removeHandler: vi.fn(), on: vi.fn(), removeAllListeners: vi.fn() },
    shell: { openExternal: vi.fn() },
    dialog: { showErrorBox: vi.fn() },
    nativeImage: { createFromPath: vi.fn(() => ({ isEmpty: () => true })) }
  };
});

vi.mock('electron-updater', () => {
  const autoUpdater = {
    logger: null,
    autoDownload: true,
    autoInstallOnAppQuit: false,
    allowPrerelease: false,
    on: vi.fn(),
    removeAllListeners: vi.fn(),
    removeListener: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn()
  };
  return {
    autoUpdater,
    default: { autoUpdater }
  };
});

import { createMainRuntime } from '@main/application/container.js';
import { AppOrchestrator } from '@main/application/app.orchestrator.js';
import { IpcHandlerRegistry } from '@main/ipc/ipc-handler.registry.js';
import { WindowService } from '@main/infrastructure/window/window.service.js';
import { TranscodeService } from '@platform/transcode/service';
import { createLoggerFactory } from '../../../factories/index.js';

describe('Main runtime', () => {
  afterEach(() => vi.restoreAllMocks());

  it('awaits renderer shutdown before main teardown and releases services after shutdown failure', async () => {
    let rejectShutdown!: (error: Error) => void;
    const shutdown = vi.spyOn(IpcHandlerRegistry.prototype, 'shutdownRenderer')
      .mockImplementation(() => new Promise<void>((_resolve, reject) => { rejectShutdown = reject; }));
    const drain = vi.spyOn(TranscodeService.prototype, 'drain').mockResolvedValue();
    const cleanup = vi.spyOn(AppOrchestrator.prototype, 'cleanup').mockResolvedValue();
    const disposeWindow = vi.spyOn(WindowService.prototype, 'dispose').mockResolvedValue();
    const runtime = createMainRuntime(createLoggerFactory());
    const disposal = runtime.dispose();
    await vi.waitFor(() => expect(shutdown).toHaveBeenCalledOnce());
    expect(cleanup).not.toHaveBeenCalled();
    expect(disposeWindow).not.toHaveBeenCalled();

    const failure = new Error('renderer flush failed');
    rejectShutdown(failure);
    await expect(disposal).rejects.toMatchObject({ errors: [failure] });
    expect(drain).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(disposeWindow).toHaveBeenCalledOnce();
    expect(runtime.dispose()).toBe(disposal);
  });

  it('finishes renderer-accepted recordings before main services close', async () => {
    const order: string[] = [];
    let finishRecording!: () => void;
    vi.spyOn(IpcHandlerRegistry.prototype, 'shutdownRenderer').mockImplementation(async () => { order.push('renderer'); });
    vi.spyOn(TranscodeService.prototype, 'drain').mockImplementation(() => {
      order.push('recordings');
      return new Promise<void>((resolve) => { finishRecording = resolve; });
    });
    vi.spyOn(WindowService.prototype, 'drainDownloads').mockImplementation(async () => { order.push('downloads'); });
    vi.spyOn(AppOrchestrator.prototype, 'cleanup').mockImplementation(async () => { order.push('main'); });
    const runtime = createMainRuntime(createLoggerFactory());
    const disposal = runtime.dispose();
    await vi.waitFor(() => expect(order).toEqual(['renderer', 'recordings']));
    finishRecording();
    await disposal;
    expect(order).toEqual(['renderer', 'recordings', 'downloads', 'main']);
  });

  it('owns independent service graphs and disposes an unstarted runtime', async () => {
    const first = createMainRuntime(createLoggerFactory());
    const second = createMainRuntime(createLoggerFactory());
    expect(first.windowService).not.toBe(second.windowService);
    await Promise.all([first.dispose(), first.dispose(), second.dispose()]);
    await expect(first.initialize()).rejects.toThrow('disposed');
  });
});
