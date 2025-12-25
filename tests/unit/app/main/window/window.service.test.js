/**
 * WindowService Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock electron - need to use class syntax
vi.mock('electron', () => {
  return {
    BrowserWindow: class MockBrowserWindow {
      constructor() {
        this.loadURL = vi.fn();
        this.loadFile = vi.fn();
        this.show = vi.fn();
        this.hide = vi.fn();
        this.focus = vi.fn();
        this.restore = vi.fn();
        this.isMinimized = vi.fn().mockReturnValue(false);
        this.isDestroyed = vi.fn().mockReturnValue(false);
        this.setSkipTaskbar = vi.fn();
        this.removeAllListeners = vi.fn();
        this.on = vi.fn();
        this.off = vi.fn();
        this.once = vi.fn();
        this.webContents = {
          send: vi.fn(),
          on: vi.fn(),
          off: vi.fn(),
          session: {
            on: vi.fn(),
            off: vi.fn()
          }
        };
      }
    },
    app: {
      isPackaged: false,
      getAppPath: vi.fn(() => '/app/path'),
      getPath: vi.fn(() => '/downloads'),
      isQuitting: false,
      focus: vi.fn()
    }
  };
});

// Mock ConfigLoader
vi.mock('../../../src/shared/config/config-loader.js', () => ({
  uiConfig: {
    WINDOW_CONFIG: {
      width: 1280,
      height: 720,
      minWidth: 800,
      minHeight: 600,
      backgroundColor: '#000000',
      title: 'PrismGB'
    }
  }
}));

// Mock url - need default export
vi.mock('url', () => ({
  default: {
    fileURLToPath: vi.fn(() => '/app/src/main/window/window.service.js')
  },
  fileURLToPath: vi.fn(() => '/app/src/main/window/window.service.js')
}));

vi.mock('path', () => ({
  default: {
    join: vi.fn((...args) => args.join('/')),
    dirname: vi.fn((p) => p.split('/').slice(0, -1).join('/'))
  },
  join: vi.fn((...args) => args.join('/')),
  dirname: vi.fn((p) => p.split('/').slice(0, -1).join('/'))
}));

import { WindowService } from '@main/window/window.service.js';
import { BrowserWindow, app } from 'electron';

describe('WindowService', () => {
  let windowService;
  let mockLogger;
  let mockLoggerFactory;
  let originalPlatform;

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

    windowService = new WindowService({
      loggerFactory: mockLoggerFactory
    });

    // Store original platform
    originalPlatform = process.platform;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Note: Can't easily restore process.platform in vitest
  });

  describe('Constructor', () => {
    it('should create logger', () => {
      expect(mockLoggerFactory.create).toHaveBeenCalledWith('WindowService');
    });

    it('should initialize mainWindow as null', () => {
      expect(windowService.mainWindow).toBeNull();
    });
  });

  describe('createWindow', () => {
    it('should create BrowserWindow', () => {
      windowService.createWindow();

      expect(windowService.mainWindow).toBeDefined();
      expect(windowService.mainWindow).not.toBeNull();
    });

    it('should load dev URL when not packaged', () => {
      windowService.createWindow();

      expect(windowService.mainWindow.loadURL).toHaveBeenCalledWith(
        'http://localhost:3000/src/renderer/index.html'
      );
    });

    it('should load file in production', () => {
      const originalIsPackaged = app.isPackaged;
      Object.defineProperty(app, 'isPackaged', { value: true, configurable: true });

      windowService.createWindow();

      expect(windowService.mainWindow.loadFile).toHaveBeenCalled();

      Object.defineProperty(app, 'isPackaged', { value: originalIsPackaged, configurable: true });
    });

    it('should register console-message handler', () => {
      windowService.createWindow();

      expect(windowService.mainWindow.webContents.on).toHaveBeenCalledWith('console-message', expect.any(Function));
    });

    it('should register ready-to-show handler', () => {
      windowService.createWindow();

      expect(windowService.mainWindow.once).toHaveBeenCalledWith('ready-to-show', expect.any(Function));
    });

    it('should register close handler', () => {
      windowService.createWindow();

      expect(windowService.mainWindow.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should register closed handler', () => {
      windowService.createWindow();

      expect(windowService.mainWindow.on).toHaveBeenCalledWith('closed', expect.any(Function));
    });

    it('should return existing window if already created', () => {
      windowService.createWindow();
      const firstWindow = windowService.mainWindow;

      windowService.createWindow();

      // Should force to foreground
      expect(firstWindow.show).toHaveBeenCalled();
    });

    it('should return the window instance', () => {
      const result = windowService.createWindow();

      expect(result).toBe(windowService.mainWindow);
    });

    it('should log creation', () => {
      windowService.createWindow();

      expect(mockLogger.info).toHaveBeenCalledWith('Creating main window');
    });
  });

  describe('showWindow', () => {
    it('should show existing window', () => {
      windowService.createWindow();
      const win = windowService.mainWindow;
      win.show.mockClear();

      windowService.showWindow();

      expect(win.show).toHaveBeenCalled();
    });

    it('should create window if it does not exist', () => {
      windowService.showWindow();

      expect(windowService.mainWindow).not.toBeNull();
    });
  });

  describe('hasWindow', () => {
    it('should return false initially', () => {
      expect(windowService.hasWindow()).toBe(false);
    });

    it('should return true after creation', () => {
      windowService.createWindow();

      expect(windowService.hasWindow()).toBe(true);
    });
  });

  describe('send', () => {
    it('should send message to renderer', () => {
      windowService.createWindow();

      windowService.send('test-channel', 'arg1', 'arg2');

      expect(windowService.mainWindow.webContents.send).toHaveBeenCalledWith('test-channel', 'arg1', 'arg2');
    });

    it('should do nothing if window does not exist', () => {
      // Should not throw
      expect(() => windowService.send('test-channel', 'data')).not.toThrow();
    });

    it('should do nothing if window is destroyed', () => {
      windowService.createWindow();
      windowService.mainWindow.isDestroyed.mockReturnValue(true);

      windowService.send('test-channel', 'data');

      expect(windowService.mainWindow.webContents.send).not.toHaveBeenCalled();
    });
  });

  describe('_forceWindowToForeground', () => {
    it('should show and focus window', () => {
      windowService.createWindow();

      windowService._forceWindowToForeground();

      expect(windowService.mainWindow.show).toHaveBeenCalled();
      expect(windowService.mainWindow.focus).toHaveBeenCalled();
    });

    it('should restore if minimized', () => {
      windowService.createWindow();
      windowService.mainWindow.isMinimized.mockReturnValue(true);

      windowService._forceWindowToForeground();

      expect(windowService.mainWindow.restore).toHaveBeenCalled();
    });

    it('should do nothing if window does not exist', () => {
      // Should not throw
      expect(() => windowService._forceWindowToForeground()).not.toThrow();
    });
  });

  describe('Window Event Handlers', () => {
    it('should handle close event by hiding window when not quitting', () => {
      windowService.createWindow();
      const win = windowService.mainWindow;

      const closeHandler = win.on.mock.calls.find(
        call => call[0] === 'close'
      )[1];

      const mockEvent = { preventDefault: vi.fn() };
      app.isQuitting = false;

      closeHandler(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(win.hide).toHaveBeenCalled();
    });

    it('should allow close when app is quitting', () => {
      windowService.createWindow();
      const win = windowService.mainWindow;

      const closeHandler = win.on.mock.calls.find(
        call => call[0] === 'close'
      )[1];

      const mockEvent = { preventDefault: vi.fn() };
      app.isQuitting = true;

      closeHandler(mockEvent);

      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
    });

    it('should clean up webContents listener on close event when quitting', () => {
      windowService.createWindow();
      const win = windowService.mainWindow;

      const closeHandler = win.on.mock.calls.find(
        call => call[0] === 'close'
      )[1];

      const mockEvent = { preventDefault: vi.fn() };
      app.isQuitting = true;

      closeHandler(mockEvent);

      // Verify webContents listener was removed during close (before destroy)
      expect(win.webContents.off).toHaveBeenCalledWith('console-message', expect.any(Function));
      expect(windowService._consoleMessageListener).toBeNull();
    });

    it('should null window reference on closed event', () => {
      windowService.createWindow();
      const win = windowService.mainWindow;

      const closedHandler = win.on.mock.calls.find(
        call => call[0] === 'closed'
      )[1];

      closedHandler();

      // After closed, window reference should be null
      expect(windowService.mainWindow).toBeNull();
    });

    it('should log renderer console messages', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      windowService.createWindow();

      const consoleHandler = windowService.mainWindow.webContents.on.mock.calls.find(
        call => call[0] === 'console-message'
      )[1];

      consoleHandler({}, 1, 'Test message', 10, 'source.js');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Test message'));
      consoleLogSpy.mockRestore();
    });
  });
});
