/**
 * TrayManager Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock electron
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

// Mock path
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
  let mockDeviceManager;
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

    mockDeviceManager = {
      isConnected: vi.fn(),
      checkForDevice: vi.fn()
    };

    trayManager = new TrayManager({
      windowManager: mockWindowManager,
      deviceManager: mockDeviceManager,
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

    it('should store device manager', () => {
      expect(trayManager.deviceManager).toBe(mockDeviceManager);
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

      // Get the click handler
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

      expect(Menu.buildFromTemplate).toHaveBeenCalledTimes(1); // Only from createTray
    });

    it('should check device connection status', () => {
      mockDeviceManager.isConnected.mockReturnValue(true);

      trayManager.updateTrayMenu();

      expect(mockDeviceManager.isConnected).toHaveBeenCalled();
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
      // Just verify it doesn't throw
      expect(() => trayManager.destroy()).not.toThrow();
    });
  });

  describe('Menu Actions', () => {
    beforeEach(() => {
      trayManager.createTray();
    });

    it('should create menu with Show Window action', () => {
      const templateCall = Menu.buildFromTemplate.mock.calls[0][0];
      const showWindowItem = templateCall.find(item => item.label === 'Show Window');

      expect(showWindowItem).toBeDefined();
      expect(typeof showWindowItem.click).toBe('function');
    });

    it('should create menu with Refresh Devices action', () => {
      const templateCall = Menu.buildFromTemplate.mock.calls[0][0];
      const refreshItem = templateCall.find(item => item.label === 'Refresh Devices');

      expect(refreshItem).toBeDefined();
      expect(typeof refreshItem.click).toBe('function');
    });

    it('should create menu with Quit action', () => {
      const templateCall = Menu.buildFromTemplate.mock.calls[0][0];
      const quitItem = templateCall.find(item => item.label === 'Quit');

      expect(quitItem).toBeDefined();
      expect(typeof quitItem.click).toBe('function');
    });

    it('should show device connected status', () => {
      mockDeviceManager.isConnected.mockReturnValue(true);
      trayManager.updateTrayMenu();

      const templateCall = Menu.buildFromTemplate.mock.calls[1][0];
      const statusItem = templateCall.find(item => item.label === 'Device Connected');

      expect(statusItem).toBeDefined();
    });

    it('should show device disconnected status', () => {
      mockDeviceManager.isConnected.mockReturnValue(false);
      trayManager.updateTrayMenu();

      const templateCall = Menu.buildFromTemplate.mock.calls[1][0];
      const statusItem = templateCall.find(item => item.label === 'Device Disconnected');

      expect(statusItem).toBeDefined();
    });
  });
});
