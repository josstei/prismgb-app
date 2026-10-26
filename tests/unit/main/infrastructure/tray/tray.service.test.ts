import { createLoggerFactory } from '../../../../factories/logger.factory.js';
/**
 * TrayService Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createWindowServiceMock
} from '../../../../factories/window.factory.js';
import { createServiceHarness, type LoggerMockLike } from '../../../../support/service.harness.js';

type PathModuleWithDefault = typeof import('node:path') & { default: typeof import('node:path') };

vi.mock('electron', () => {
  return {
    Tray: class MockTray {
      constructor(readonly iconPath: string) {}
      setToolTip = vi.fn();
      setContextMenu = vi.fn();
      on = vi.fn();
      destroy = vi.fn();
    },
    Menu: {
      buildFromTemplate: vi.fn(() => ({}))
    },
    app: {
      getAppPath: vi.fn(() => '/app/path'),
      quit: vi.fn(),
      isQuitting: false,
      isPackaged: false
    }
  };
});

vi.mock('path', async (importOriginal) => {
  const actual = await importOriginal<PathModuleWithDefault>();
  return {
    ...actual,
    default: {
      ...actual.default,
      join: vi.fn((...args: string[]) => args.join('/'))
    },
    join: vi.fn((...args: string[]) => args.join('/'))
  };
});

import { TrayService } from '@main/infrastructure/tray/tray.service.js';
import { Menu, app } from 'electron';

type MockFn = ReturnType<typeof vi.fn<(...args: any[]) => any>>;
type MockTrayInstance = {
  iconPath: string;
  setToolTip: MockFn;
  setContextMenu: MockFn;
  on: MockFn;
  destroy: MockFn;
};
type MockWindowService = ReturnType<typeof createWindowServiceMock>;
type MockDeviceConnectionService = {
  isConnected: MockFn;
  reconcileDeviceStatus: MockFn;
};
type TestableTrayService = Omit<TrayService, 'tray'> & {
  tray: MockTrayInstance | null;
  windowService: MockWindowService;
  deviceConnectionService: MockDeviceConnectionService;
};
type MenuTemplateItem = {
  label?: string;
  click?: () => void;
};

describe('TrayService', () => {
  let trayService: TestableTrayService;
  let mockWindowService: MockWindowService;
  let mockDeviceConnectionService: MockDeviceConnectionService;
  let mockLogger: LoggerMockLike;

  beforeEach(() => {
    const h = createServiceHarness(TrayService, {
      loggerFactory: createLoggerFactory(),
      windowService: createWindowServiceMock({
          showWindow: vi.fn()
        }),
      deviceConnectionService: {
          isConnected: vi.fn(),
          reconcileDeviceStatus: vi.fn(async () => ({ connected: false }))
        }
    });
    trayService = h.subject as unknown as TestableTrayService;
    mockLogger = h.logger;
    ({
      windowService: mockWindowService,
      deviceConnectionService: mockDeviceConnectionService
    } = h.deps);
  });

  afterEach(() => { vi.unstubAllEnvs(); Object.defineProperty(app, 'isPackaged', { value: false, configurable: true }); });

  it('loads the copied renderer icon for a locally built production launch', () => {
    vi.stubEnv('ELECTRON_IS_DEV', '0');
    trayService.createTray();
    expect(trayService.tray!.iconPath).toMatch(/\/renderer\/tray-icon\.png$/);
    expect(trayService.tray!.iconPath).not.toContain('/app/path/assets/');
  });

  it('loads the copied renderer icon from the packaged application', () => {
    Object.defineProperty(app, 'isPackaged', { value: true, configurable: true });
    trayService.createTray();
    expect(trayService.tray!.iconPath).toBe('/app/path/dist/renderer/tray-icon.png');
  });

  it('creates the tray, installs its tooltip/menu and opens the window on click', () => {
    const tray = trayService.createTray();
    expect(tray).toBe(trayService.tray);
    expect(trayService.tray).not.toBeNull();
    expect(trayService.tray!.setToolTip).toHaveBeenCalledWith('PrismGB - Monitoring for device');
    expect(trayService.tray!.setContextMenu).toHaveBeenCalledWith(vi.mocked(Menu.buildFromTemplate).mock.results.at(-1)!.value);
    const click = trayService.tray!.on.mock.calls.find(call => call[0] === 'click')![1];
    click();
    expect(mockWindowService.showWindow).toHaveBeenCalledOnce();
    expect(mockLogger.info).toHaveBeenCalledWith('Creating system tray icon');
  });

  describe('updateTrayMenu', () => {
    beforeEach(() => {
      trayService.createTray();
    });





    it('should do nothing if tray not created', () => {
      trayService.tray = null;

      trayService.updateTrayMenu();

      expect(vi.mocked(Menu.buildFromTemplate)).toHaveBeenCalledTimes(1);
    });

    it('should check device connection status', () => {
      mockDeviceConnectionService.isConnected.mockReturnValue(true);

      trayService.updateTrayMenu();

      expect(mockDeviceConnectionService.isConnected).toHaveBeenCalled();
      const template = vi.mocked(Menu.buildFromTemplate).mock.calls.at(-1)![0] as MenuTemplateItem[];
      expect(template).toEqual(expect.arrayContaining([expect.objectContaining({ label: 'Device Connected' })]));
    });

    it('should reconcile through the tray-refresh path from the menu item', () => {
      trayService.updateTrayMenu();

      const template = vi.mocked(Menu.buildFromTemplate).mock.calls.at(-1)?.[0] as MenuTemplateItem[];
      const refreshItem = template.find((item) => item.label === 'Refresh Devices');
      refreshItem?.click?.();

      expect(mockDeviceConnectionService.reconcileDeviceStatus).toHaveBeenCalledWith('tray-refresh');
    });
  });

  describe('destroy', () => {
    it('should destroy tray when it exists', () => {
      trayService.createTray();
      const trayInstance = trayService.tray!;

      trayService.destroy();

      expect(trayInstance.destroy).toHaveBeenCalled();
      expect(trayService.tray).toBeNull();
    });

    it('should do nothing if tray not created', () => {
      expect(() => trayService.destroy()).not.toThrow();
    });
  });
});
