import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getAppPath: vi.fn(() => '/app'),
    dock: { setIcon: vi.fn() }
  }
}));

import { AppOrchestrator } from '@main/application/app.orchestrator';
import { DeviceCatalog, type DeviceStatus } from '@platform/devices';
import { createInjectableHarness } from '../../../support/di/injectable.harness';
import { createLoggerFactory } from '../../../factories/index.js';
import { createChromaticDeviceInfoPayload } from '../../../devices/media.testkit';

type MockFn = ReturnType<typeof vi.fn>;

const connectedStatus = (): DeviceStatus => ({
  state: 'connected',
  connected: true,
  device: createChromaticDeviceInfoPayload(),
  updatedAt: 1
});

const disconnectedStatus = (): DeviceStatus => ({
  state: 'disconnected',
  connected: false,
  device: null,
  updatedAt: 2
});

describe('AppOrchestrator', () => {
  let orchestrator: AppOrchestrator;
  let calls: string[];
  let statusListener: ((status: DeviceStatus, reason: string) => void) | null;
  let loggerFactory: ReturnType<typeof createLoggerFactory>;
  let deps: {
    windowService: { createWindow: MockFn; showWindow: MockFn; destroyWindow: MockFn };
    deviceConnectionService: { onStatusChanged: MockFn; initialize: MockFn; reconcileDeviceStatus: MockFn; dispose: MockFn };
    trayService: { createTray: MockFn; updateTrayMenu: MockFn; dispose: MockFn };
    ipcHost: { registerHandlers: MockFn; attachWindow: MockFn; dispose: MockFn };
    ipcPushBridge: { emit: MockFn };
    autoUpdateService: { initialize: MockFn; dispose: MockFn };
    transcodeService: { initialize: MockFn; dispose: MockFn };
    loginItemService: { wasLaunchedAsHidden: MockFn };
  };

  const record = (name: string, result?: unknown) => vi.fn(() => {
    calls.push(name);
    return result;
  });

  beforeEach(() => {
    calls = [];
    statusListener = null;
    loggerFactory = createLoggerFactory();
    const mainWindow = { id: 1 };
    const h = createInjectableHarness(AppOrchestrator, {
      overrides: {
        loggerFactory,
        windowService: {
          createWindow: record('windowService.createWindow', mainWindow),
          showWindow: vi.fn(),
          destroyWindow: record('windowService.destroyWindow')
        },
        deviceConnectionService: {
          onStatusChanged: vi.fn((listener) => {
            calls.push('deviceConnectionService.onStatusChanged');
            statusListener = listener;
            return vi.fn();
          }),
          initialize: record('deviceConnectionService.initialize'),
          reconcileDeviceStatus: vi.fn((reason: string) => {
            calls.push(`deviceConnectionService.reconcileDeviceStatus:${reason}`);
            return disconnectedStatus();
          }),
          dispose: record('deviceConnectionService.dispose')
        },
        trayService: {
          createTray: record('trayService.createTray'),
          updateTrayMenu: vi.fn(),
          dispose: record('trayService.dispose')
        },
        ipcHost: {
          registerHandlers: record('ipcHost.registerHandlers'),
          attachWindow: vi.fn((window) => calls.push(`ipcHost.attachWindow:${window === mainWindow}`)),
          dispose: record('ipcHost.dispose')
        },
        ipcPushBridge: { emit: vi.fn() },
        autoUpdateService: { initialize: record('autoUpdateService.initialize'), dispose: record('autoUpdateService.dispose') },
        transcodeService: { initialize: record('transcodeService.initialize'), dispose: record('transcodeService.dispose') },
        loginItemService: { wasLaunchedAsHidden: vi.fn(() => false) }
      }
    });
    orchestrator = h.subject;
    deps = h.deps as typeof deps;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialize', () => {
    it('wires the main process in order, subscribing to device status before the first reconcile', async () => {
      await orchestrator.initialize();

      expect(calls).toEqual([
        'deviceConnectionService.onStatusChanged',
        'autoUpdateService.initialize',
        'transcodeService.initialize',
        'trayService.createTray',
        'ipcHost.registerHandlers',
        'windowService.createWindow',
        'ipcHost.attachWindow:true',
        'deviceConnectionService.initialize',
        'deviceConnectionService.reconcileDeviceStatus:startup'
      ]);
      expect(deps.windowService.createWindow).toHaveBeenCalledWith({ hidden: false });
    });

    it('creates the window hidden for a login-item launch', async () => {
      deps.loginItemService.wasLaunchedAsHidden.mockReturnValue(true);

      await orchestrator.initialize();

      expect(deps.windowService.createWindow).toHaveBeenCalledWith({ hidden: true });
    });

    it('subscribes to device status once', async () => {
      await orchestrator.initialize();
      await orchestrator.initialize();

      expect(deps.deviceConnectionService.onStatusChanged).toHaveBeenCalledTimes(1);
    });
  });

  describe('device status', () => {
    beforeEach(async () => {
      vi.useFakeTimers();
      await orchestrator.initialize();
    });

    it('refreshes the tray, pushes the device and shows the window after the catalog delay', () => {
      const status = connectedStatus();
      const delayMs = DeviceCatalog.get(status.device!.id)!.behavior.showWindowOnConnectDelayMs;

      statusListener!(status, 'startup');

      expect(deps.trayService.updateTrayMenu).toHaveBeenCalledTimes(1);
      expect(deps.ipcPushBridge.emit).toHaveBeenCalledWith('device:connected', status.device);
      expect(loggerFactory._getLogger('AppOrchestrator').info).toHaveBeenCalledWith('Device connected via startup');

      vi.advanceTimersByTime(delayMs - 1);
      expect(deps.windowService.showWindow).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(deps.windowService.showWindow).toHaveBeenCalledTimes(1);
      expect(delayMs).toBe(500);
    });

    it('restarts the launch delay when the device reconnects before it elapses', () => {
      statusListener!(connectedStatus(), 'hotplug');
      vi.advanceTimersByTime(400);
      statusListener!(connectedStatus(), 'hotplug');
      vi.advanceTimersByTime(400);

      expect(deps.windowService.showWindow).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(deps.windowService.showWindow).toHaveBeenCalledTimes(1);
    });

    it('cancels the pending launch and pushes the disconnect', () => {
      statusListener!(connectedStatus(), 'hotplug');
      statusListener!(disconnectedStatus(), 'hotplug');

      vi.advanceTimersByTime(1000);

      expect(deps.windowService.showWindow).not.toHaveBeenCalled();
      expect(deps.trayService.updateTrayMenu).toHaveBeenCalledTimes(2);
      expect(deps.ipcPushBridge.emit).toHaveBeenLastCalledWith('device:disconnected');
      expect(loggerFactory._getLogger('AppOrchestrator').info).toHaveBeenCalledWith('Device disconnected via hotplug');
    });

    it('clears the pending launch on cleanup', async () => {
      statusListener!(connectedStatus(), 'hotplug');

      await orchestrator.cleanup();
      vi.advanceTimersByTime(1000);

      expect(deps.windowService.showWindow).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
      calls = [];
    });

    it('destroys the window, then disposes the IPC host and services in order', async () => {
      await orchestrator.cleanup();

      expect(calls).toEqual([
        'windowService.destroyWindow',
        'ipcHost.dispose',
        'deviceConnectionService.dispose',
        'trayService.dispose',
        'autoUpdateService.dispose',
        'transcodeService.dispose'
      ]);
      expect(loggerFactory._getLogger('AppOrchestrator').info).toHaveBeenCalledWith('PrismGB shutdown complete');
    });

    it('keeps disposing when a step fails', async () => {
      deps.windowService.destroyWindow.mockImplementation(() => {
        throw new Error('window gone');
      });
      deps.ipcHost.dispose.mockRejectedValue(new Error('ipc gone'));

      await orchestrator.cleanup();

      const logger = loggerFactory._getLogger('AppOrchestrator');
      expect(logger.error).toHaveBeenCalledWith('Error destroying window during cleanup:', expect.any(Error));
      expect(logger.error).toHaveBeenCalledWith('Error disposing IPC host:', expect.any(Error));
      expect(deps.transcodeService.dispose).toHaveBeenCalledTimes(1);
    });
  });
});
