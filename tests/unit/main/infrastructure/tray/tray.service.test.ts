import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createWindowServiceMock
} from '../../../../factories/index.js';
import { createInjectableHarness, type LoggerMockLike } from '../../../../support/di/injectable.harness';

type PathModuleWithDefault = typeof import('node:path') & { default: typeof import('node:path') };

vi.mock('electron', () => {
  return {
    Tray: class MockTray {
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
      isQuitting: false
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

import { TrayService } from '@main/infrastructure/tray/tray.service';
import { Menu, app } from 'electron';

type MockFn = ReturnType<typeof vi.fn>;
type MockTrayInstance = {
  setToolTip: MockFn;
  setContextMenu: MockFn;
  on: MockFn;
  destroy: MockFn;
};
type MockWindowService = ReturnType<typeof createWindowServiceMock> & {
  showWindow: MockFn;
};
type MockDeviceConnectionService = {
  getStatus: MockFn;
  reconcileDeviceStatus: MockFn;
};
type MockLoggerFactory = {
  create: MockFn;
};
type TestableTrayService = Omit<TrayService, 'tray'> & {
  tray: MockTrayInstance | null;
};
type MenuTemplateItem = {
  label?: string;
  type?: string;
  enabled?: boolean;
  click?: () => void;
};

describe('TrayService', () => {
  let trayService: TestableTrayService;
  let mockWindowService: MockWindowService;
  let mockDeviceConnectionService: MockDeviceConnectionService;
  let mockLogger: LoggerMockLike;
  let mockLoggerFactory: MockLoggerFactory;

  beforeEach(() => {
    const h = createInjectableHarness(TrayService, {
      overrides: {
        windowService: createWindowServiceMock({
          showWindow: vi.fn()
        }),
        deviceConnectionService: {
          getStatus: vi.fn(() => ({ connected: false })),
          reconcileDeviceStatus: vi.fn(() => ({ connected: false }))
        }
      }
    });
    trayService = h.subject as unknown as TestableTrayService;
    mockLogger = h.logger;
    ({
      windowService: mockWindowService,
      deviceConnectionService: mockDeviceConnectionService,
      loggerFactory: mockLoggerFactory
    } = h.deps as {
      windowService: MockWindowService;
      deviceConnectionService: MockDeviceConnectionService;
      loggerFactory: MockLoggerFactory;
    });
  });

  describe('Constructor', () => {
    it('should create logger', () => {
      expect(mockLoggerFactory.create).toHaveBeenCalledWith('TrayService');
    });

    it('should not build a menu before the tray is created', () => {
      trayService.updateTrayMenu();

      expect(vi.mocked(Menu.buildFromTemplate)).not.toHaveBeenCalled();
    });
  });

  describe('createTray', () => {
    it('should create tray instance', () => {
      trayService.createTray();

      expect(trayService.tray).toBeDefined();
      expect(trayService.tray).not.toBeNull();
    });

    it('should set initial tooltip', () => {
      trayService.createTray();

      expect(trayService.tray.setToolTip).toHaveBeenCalledWith('PrismGB - Monitoring for device');
    });

    it('should register click handler', () => {
      trayService.createTray();

      expect(trayService.tray.on).toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('should show window on click', () => {
      trayService.createTray();

      const clickHandler = trayService.tray.on.mock.calls.find(
        call => call[0] === 'click'
      )[1];

      clickHandler();

      expect(mockWindowService.showWindow).toHaveBeenCalled();
    });

    it('should log creation', () => {
      trayService.createTray();

      expect(mockLogger.info).toHaveBeenCalledWith('Creating system tray icon');
    });

    it('skips the tray when DISABLE_TRAY is true', () => {
      vi.stubEnv('DISABLE_TRAY', 'true');

      trayService.createTray();

      expect(trayService.tray).toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith('Tray disabled via DISABLE_TRAY environment variable');
      vi.unstubAllEnvs();
    });

    it('should handle dist path for bundled environment', () => {
      vi.mocked(app.getAppPath).mockReturnValue('/app/dist/main');

      trayService.createTray();

      expect(trayService.tray).toBeDefined();
    });
  });

  describe('updateTrayMenu', () => {
    beforeEach(() => {
      trayService.createTray();
    });

    it('should build menu from template', () => {
      trayService.updateTrayMenu();

      expect(vi.mocked(Menu.buildFromTemplate)).toHaveBeenCalled();
    });

    it('should set context menu', () => {
      trayService.updateTrayMenu();

      expect(trayService.tray.setContextMenu).toHaveBeenCalled();
    });

    it('should do nothing if tray not created', () => {
      trayService.tray = null;

      trayService.updateTrayMenu();

      expect(vi.mocked(Menu.buildFromTemplate)).toHaveBeenCalledTimes(1);
    });

    it('lists the same items in the same order with the disconnected label', () => {
      trayService.updateTrayMenu();

      const template = vi.mocked(Menu.buildFromTemplate).mock.calls.at(-1)?.[0] as MenuTemplateItem[];
      expect(template.map(({ label, type, enabled }) => ({ label, type, enabled }))).toEqual([
        { label: 'PrismGB', type: undefined, enabled: false },
        { label: undefined, type: 'separator', enabled: undefined },
        { label: 'Device Disconnected', type: undefined, enabled: false },
        { label: undefined, type: 'separator', enabled: undefined },
        { label: 'Show Window', type: undefined, enabled: undefined },
        { label: 'Refresh Devices', type: undefined, enabled: undefined },
        { label: undefined, type: 'separator', enabled: undefined },
        { label: 'Quit', type: undefined, enabled: undefined }
      ]);
    });

    it('labels the device as connected from the device status', () => {
      mockDeviceConnectionService.getStatus.mockReturnValue({ connected: true });

      trayService.updateTrayMenu();

      const template = vi.mocked(Menu.buildFromTemplate).mock.calls.at(-1)?.[0] as MenuTemplateItem[];
      expect(template[2]).toEqual({ label: 'Device Connected', enabled: false });
    });

    it('shows the window and quits from the menu items', () => {
      trayService.updateTrayMenu();

      const template = vi.mocked(Menu.buildFromTemplate).mock.calls.at(-1)?.[0] as MenuTemplateItem[];
      template.find((item) => item.label === 'Show Window')?.click?.();
      template.find((item) => item.label === 'Quit')?.click?.();

      expect(mockWindowService.showWindow).toHaveBeenCalledTimes(1);
      expect(app.quit).toHaveBeenCalledTimes(1);
    });

    it('should reconcile through the tray-refresh path from the menu item', () => {
      trayService.updateTrayMenu();

      const template = vi.mocked(Menu.buildFromTemplate).mock.calls.at(-1)?.[0] as MenuTemplateItem[];
      const refreshItem = template.find((item) => item.label === 'Refresh Devices');
      refreshItem?.click?.();

      expect(mockDeviceConnectionService.reconcileDeviceStatus).toHaveBeenCalledWith('tray-refresh');
    });
  });

  describe('dispose', () => {
    it('should destroy tray when it exists', async () => {
      trayService.createTray();
      const trayInstance = trayService.tray;

      await trayService.dispose();

      expect(trayInstance.destroy).toHaveBeenCalled();
      expect(trayService.tray).toBeNull();
    });

    it('should do nothing if tray not created', async () => {
      await expect(trayService.dispose()).resolves.toBeUndefined();
    });
  });
});
