/**
 * TrayService Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('electron', () => {
  return {
    Tray: class MockTray {
      constructor() {
        this.setToolTip = vi.fn();
        this.setContextMenu = vi.fn();
        this.on = vi.fn();
        this.destroy = vi.fn();
      }
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

vi.mock('path', () => ({
  default: {
    join: vi.fn((...args) => args.join('/'))
  }
}));

import { TrayService } from '@main/tray/tray.service.js';
import { Tray, Menu, app } from 'electron';

describe('TrayService', () => {
  let trayService;
  let mockWindowService;
  let mockDeviceService;
  let mockLogger;
  let mockLoggerFactory;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockLoggerFactory = {
      create: vi.fn(() => mockLogger)
    };

    mockWindowService = {
      showWindow: vi.fn()
    };

    mockDeviceService = {
      isConnected: vi.fn(),
      checkForDevice: vi.fn()
    };

    trayService = new TrayService({
      windowService: mockWindowService,
      deviceService: mockDeviceService,
      loggerFactory: mockLoggerFactory
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

    it('should store device service', () => {
      expect(trayService.deviceService).toBe(mockDeviceService);
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
      app.getAppPath.mockReturnValue('/app/dist/main');

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

      expect(Menu.buildFromTemplate).toHaveBeenCalled();
    });

    it('should set context menu', () => {
      trayService.updateTrayMenu();

      expect(trayService.tray.setContextMenu).toHaveBeenCalled();
    });

    it('should do nothing if tray not created', () => {
      trayService.tray = null;

      trayService.updateTrayMenu();

      expect(Menu.buildFromTemplate).toHaveBeenCalledTimes(1);
    });

    it('should check device connection status', () => {
      mockDeviceService.isConnected.mockReturnValue(true);

      trayService.updateTrayMenu();

      expect(mockDeviceService.isConnected).toHaveBeenCalled();
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
