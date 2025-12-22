/**
 * TrayManager Unit Tests
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

import TrayManager from '@app/main/TrayManager.js';
import { Tray, Menu, app } from 'electron';

describe('TrayManager', () => {
  let trayManager;
  let mockWindowManager;
  let mockDeviceServiceMain;
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

    mockWindowManager = {
      showWindow: vi.fn()
    };

    mockDeviceServiceMain = {
      isConnected: vi.fn(),
      checkForDevice: vi.fn()
    };

    trayManager = new TrayManager({
      windowManager: mockWindowManager,
      deviceServiceMain: mockDeviceServiceMain,
      loggerFactory: mockLoggerFactory
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create logger', () => {
      expect(mockLoggerFactory.create).toHaveBeenCalledWith('TrayManager');
    });

    it('should initialize tray as null', () => {
      expect(trayManager.tray).toBeNull();
    });

    it('should store window manager', () => {
      expect(trayManager.windowManager).toBe(mockWindowManager);
    });

    it('should store device service', () => {
      expect(trayManager.deviceServiceMain).toBe(mockDeviceServiceMain);
    });
  });

  describe('createTray', () => {
    it('should create tray instance', () => {
      trayManager.createTray();

      expect(trayManager.tray).toBeDefined();
      expect(trayManager.tray).not.toBeNull();
    });

    it('should set initial tooltip', () => {
      trayManager.createTray();

      expect(trayManager.tray.setToolTip).toHaveBeenCalledWith('PrismGB - Monitoring for device');
    });

    it('should register click handler', () => {
      trayManager.createTray();

      expect(trayManager.tray.on).toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('should show window on click', () => {
      trayManager.createTray();

      const clickHandler = trayManager.tray.on.mock.calls.find(
        call => call[0] === 'click'
      )[1];

      clickHandler();

      expect(mockWindowManager.showWindow).toHaveBeenCalled();
    });

    it('should log creation', () => {
      trayManager.createTray();

      expect(mockLogger.info).toHaveBeenCalledWith('Creating system tray icon');
    });

    it('should return tray instance', () => {
      const result = trayManager.createTray();

      expect(result).toBe(trayManager.tray);
    });

    it('should handle dist path for bundled environment', () => {
      app.getAppPath.mockReturnValue('/app/dist/main');

      trayManager.createTray();

      expect(trayManager.tray).toBeDefined();
    });
  });

  describe('updateTrayMenu', () => {
    beforeEach(() => {
      trayManager.createTray();
    });

    it('should build menu from template', () => {
      trayManager.updateTrayMenu();

      expect(Menu.buildFromTemplate).toHaveBeenCalled();
    });

    it('should set context menu', () => {
      trayManager.updateTrayMenu();

      expect(trayManager.tray.setContextMenu).toHaveBeenCalled();
    });

    it('should do nothing if tray not created', () => {
      trayManager.tray = null;

      trayManager.updateTrayMenu();

      expect(Menu.buildFromTemplate).toHaveBeenCalledTimes(1);
    });

    it('should check device connection status', () => {
      mockDeviceServiceMain.isConnected.mockReturnValue(true);

      trayManager.updateTrayMenu();

      expect(mockDeviceServiceMain.isConnected).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('should destroy tray when it exists', () => {
      trayManager.createTray();
      const trayInstance = trayManager.tray;

      trayManager.destroy();

      expect(trayInstance.destroy).toHaveBeenCalled();
      expect(trayManager.tray).toBeNull();
    });

    it('should do nothing if tray not created', () => {
      expect(() => trayManager.destroy()).not.toThrow();
    });
  });
});
