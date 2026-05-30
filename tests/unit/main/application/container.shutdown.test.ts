// @ts-nocheck
/**
 * Main shutdown regression tests.
 *
 * Guards the application teardown path against the self-referential disposal
 * cycle that previously crashed the app on quit: the orchestrator disposes the
 * DI container, and the container disposes every resolved instance including the
 * orchestrator. These tests prove the real {@link MainServiceContainer.dispose}
 * terminates and disposes each instance exactly once when driven by a real
 * re-entrancy-safe orchestrator.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('electron', () => {
  class MockBrowserWindow {}
  class MockTray {
    constructor() {
      this.setToolTip = vi.fn();
      this.setContextMenu = vi.fn();
      this.on = vi.fn();
      this.destroy = vi.fn();
    }
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
    ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
    shell: { openExternal: vi.fn() },
    dialog: { showErrorBox: vi.fn() },
    nativeImage: { createFromPath: vi.fn(() => ({ isEmpty: () => true })) }
  };
});

vi.mock('@prismgb/updates', () => ({
  UpdateService: class {
    initialize(): void {}
    dispose(): void {}
  },
  UpdateBridge: class {
    initialize(): void {}
    dispose(): void {}
  }
}));

import { BaseOrchestrator } from '@prismgb/core';
import { MainServiceContainer } from '@main/application/container.js';
import { AppOrchestrator } from '@main/application/app.orchestrator.js';
import { createLoggerFactory } from '../../../factories/index.js';

describe('Main shutdown', () => {
  let loggerFactory: ReturnType<typeof createLoggerFactory>;

  beforeEach(() => {
    vi.clearAllMocks();
    loggerFactory = createLoggerFactory();
  });

  it('terminates and disposes each instance once when an orchestrator disposes the container', async () => {
    let container: MainServiceContainer;
    const leafDispose = vi.fn();

    class ContainerDisposingOrchestrator extends BaseOrchestrator {
      onCleanupCount = 0;

      constructor(dependencies: object) {
        super(dependencies, 'ContainerDisposingOrchestrator');
      }

      async onCleanup(): Promise<void> {
        this.onCleanupCount++;
        if (this.onCleanupCount <= 5) {
          await container.dispose();
        }
      }
    }

    const orchestrator = new ContainerDisposingOrchestrator({ loggerFactory });
    container = new MainServiceContainer(loggerFactory, {
      appOrchestrator: orchestrator,
      transcodeService: { dispose: leafDispose }
    });

    await orchestrator.cleanup();

    expect(orchestrator.onCleanupCount).toBe(1);
    expect(leafDispose).toHaveBeenCalledTimes(1);
  });

  it('disposes managed services in AppOrchestrator.onCleanup without disposing the DI container', async () => {
    const containerDispose = vi.fn();
    const fakeContainer = {
      cradle: { loggerFactory },
      resolve: vi.fn(() => loggerFactory),
      dispose: containerDispose
    };

    const orchestrator = new AppOrchestrator(fakeContainer as never);

    const destroyWindow = vi.fn();
    const ipcDispose = vi.fn();
    const stopUSBMonitoring = vi.fn();
    const trayDestroy = vi.fn();
    Object.assign(orchestrator, {
      _windowService: { destroyWindow },
      _ipcHandlerRegistry: { dispose: ipcDispose },
      _deviceBridgeService: { dispose: vi.fn() },
      _deviceLifecycleService: { dispose: vi.fn() },
      _deviceService: { stopUSBMonitoring },
      _trayService: { destroy: trayDestroy },
      _updateBridgeService: { dispose: vi.fn() },
      _transcodeService: { dispose: vi.fn() }
    });

    await orchestrator.onCleanup();

    expect(destroyWindow).toHaveBeenCalledTimes(1);
    expect(ipcDispose).toHaveBeenCalledTimes(1);
    expect(stopUSBMonitoring).toHaveBeenCalledTimes(1);
    expect(trayDestroy).toHaveBeenCalledTimes(1);
    expect(containerDispose).not.toHaveBeenCalled();
  });
});
