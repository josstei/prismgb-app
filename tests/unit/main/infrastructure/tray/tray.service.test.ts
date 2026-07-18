/**
 * TrayService Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createWindowServiceMock
} from '../../../../factories/index.js';
import { createInjectableHarness, type LoggerMockLike } from '../../../../support/di/injectable.harness.js';

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

import { TrayService } from '@main/infrastructure/tray/tray.service.js';
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
  isConnected: MockFn;
  reconcileDeviceStatus: MockFn;
};
type MockLoggerFactory = {
  create: MockFn;
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
  let mockLoggerFactory: MockLoggerFactory;

  beforeEach(() => {
    const h = createInjectableHarness(TrayService, {
      overrides: {
        windowService: createWindowServiceMock({
          showWindow: vi.fn()
        }),
        deviceConnectionService: {
          isConnected: vi.fn(),
          reconcileDeviceStatus: vi.fn(async () => ({ connected: false }))
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

    it('should initialize tray as null', () => {
      expect(trayService.tray).toBeNull();
    });

    it('should store window service', () => {
      expect(trayService.windowService).toBe(mockWindowService);
    });

    it('should store device connection service', () => {
      expect(trayService.deviceConnectionService).toBe(mockDeviceConnectionService);
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

    it('should return tray instance', () => {
      const result = trayService.createTray();

      expect(result).toBe(trayService.tray);
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

    it('should check device connection status', () => {
      mockDeviceConnectionService.isConnected.mockReturnValue(true);

      trayService.updateTrayMenu();

      expect(mockDeviceConnectionService.isConnected).toHaveBeenCalled();
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
      const trayInstance = trayService.tray;

      trayService.destroy();

      expect(trayInstance.destroy).toHaveBeenCalled();
      expect(trayService.tray).toBeNull();
    });

    it('should do nothing if tray not created', () => {
      expect(() => trayService.destroy()).not.toThrow();
    });
  });
});
