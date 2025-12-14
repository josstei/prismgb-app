/**
 * WindowManager Unit Tests
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
    fileURLToPath: vi.fn(() => '/app/src/main/services/WindowManager.js')
  },
  fileURLToPath: vi.fn(() => '/app/src/main/services/WindowManager.js')
}));

vi.mock('path', () => ({
  default: {
    join: vi.fn((...args) => args.join('/')),
    dirname: vi.fn((p) => p.split('/').slice(0, -1).join('/'))
  },
  join: vi.fn((...args) => args.join('/')),
  dirname: vi.fn((p) => p.split('/').slice(0, -1).join('/'))
}));

import WindowManager from '@app/main/WindowManager.js';
import { BrowserWindow, app } from 'electron';

describe('WindowManager', () => {
  let windowManager;
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

    windowManager = new WindowManager({
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
      expect(mockLoggerFactory.create).toHaveBeenCalledWith('WindowManager');
    });

    it('should initialize mainWindow as null', () => {
      expect(windowManager.mainWindow).toBeNull();
    });
  });

  describe('createWindow', () => {
    it('should create BrowserWindow', () => {
      windowManager.createWindow();

      expect(windowManager.mainWindow).toBeDefined();
      expect(windowManager.mainWindow).not.toBeNull();
    });

    it('should load dev URL when not packaged', () => {
      windowManager.createWindow();

      expect(windowManager.mainWindow.loadURL).toHaveBeenCalledWith(
        'http://localhost:3000/src/app/renderer/index.html'
      );
    });

    it('should load file in production', () => {
      const originalIsPackaged = app.isPackaged;
      Object.defineProperty(app, 'isPackaged', { value: true, configurable: true });

      windowManager.createWindow();

      expect(windowManager.mainWindow.loadFile).toHaveBeenCalled();

      Object.defineProperty(app, 'isPackaged', { value: originalIsPackaged, configurable: true });
    });

    it('should register console-message handler', () => {
      windowManager.createWindow();

      expect(windowManager.mainWindow.webContents.on).toHaveBeenCalledWith('console-message', expect.any(Function));
    });

    it('should register ready-to-show handler', () => {
      windowManager.createWindow();

      expect(windowManager.mainWindow.once).toHaveBeenCalledWith('ready-to-show', expect.any(Function));
    });

    it('should register close handler', () => {
      windowManager.createWindow();

      expect(windowManager.mainWindow.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should register closed handler', () => {
      windowManager.createWindow();

      expect(windowManager.mainWindow.on).toHaveBeenCalledWith('closed', expect.any(Function));
    });

    it('should return existing window if already created', () => {
      windowManager.createWindow();
      const firstWindow = windowManager.mainWindow;

      windowManager.createWindow();

      // Should force to foreground
      expect(firstWindow.show).toHaveBeenCalled();
    });

    it('should return the window instance', () => {
      const result = windowManager.createWindow();

      expect(result).toBe(windowManager.mainWindow);
    });

    it('should log creation', () => {
      windowManager.createWindow();

      expect(mockLogger.info).toHaveBeenCalledWith('Creating main window');
    });
  });

  describe('showWindow', () => {
    it('should show existing window', () => {
      windowManager.createWindow();
      const win = windowManager.mainWindow;
      win.show.mockClear();

      windowManager.showWindow();

      expect(win.show).toHaveBeenCalled();
    });

    it('should create window if it does not exist', () => {
      windowManager.showWindow();

      expect(windowManager.mainWindow).not.toBeNull();
    });
  });

  describe('hasWindow', () => {
    it('should return false initially', () => {
      expect(windowManager.hasWindow()).toBe(false);
    });

    it('should return true after creation', () => {
      windowManager.createWindow();

      expect(windowManager.hasWindow()).toBe(true);
    });
  });

  describe('send', () => {
    it('should send message to renderer', () => {
      windowManager.createWindow();

      windowManager.send('test-channel', 'arg1', 'arg2');

      expect(windowManager.mainWindow.webContents.send).toHaveBeenCalledWith('test-channel', 'arg1', 'arg2');
    });

    it('should do nothing if window does not exist', () => {
      // Should not throw
      expect(() => windowManager.send('test-channel', 'data')).not.toThrow();
    });

    it('should do nothing if window is destroyed', () => {
      windowManager.createWindow();
      windowManager.mainWindow.isDestroyed.mockReturnValue(true);

      windowManager.send('test-channel', 'data');

      expect(windowManager.mainWindow.webContents.send).not.toHaveBeenCalled();
    });
  });

  describe('_forceWindowToForeground', () => {
    it('should show and focus window', () => {
      windowManager.createWindow();

      windowManager._forceWindowToForeground();

      expect(windowManager.mainWindow.show).toHaveBeenCalled();
      expect(windowManager.mainWindow.focus).toHaveBeenCalled();
    });

    it('should restore if minimized', () => {
      windowManager.createWindow();
      windowManager.mainWindow.isMinimized.mockReturnValue(true);

      windowManager._forceWindowToForeground();

      expect(windowManager.mainWindow.restore).toHaveBeenCalled();
    });

    it('should do nothing if window does not exist', () => {
      // Should not throw
      expect(() => windowManager._forceWindowToForeground()).not.toThrow();
    });
  });

  describe('Window Event Handlers', () => {
    it('should handle close event by hiding window when not quitting', () => {
      windowManager.createWindow();
      const win = windowManager.mainWindow;

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
      windowManager.createWindow();
      const win = windowManager.mainWindow;

      const closeHandler = win.on.mock.calls.find(
        call => call[0] === 'close'
      )[1];

      const mockEvent = { preventDefault: vi.fn() };
      app.isQuitting = true;

      closeHandler(mockEvent);

      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
    });

    it('should clean up webContents listener on close event when quitting', () => {
      windowManager.createWindow();
      const win = windowManager.mainWindow;

      const closeHandler = win.on.mock.calls.find(
        call => call[0] === 'close'
      )[1];

      const mockEvent = { preventDefault: vi.fn() };
      app.isQuitting = true;

      closeHandler(mockEvent);

      // Verify webContents listener was removed during close (before destroy)
      expect(win.webContents.off).toHaveBeenCalledWith('console-message', expect.any(Function));
      expect(windowManager._consoleMessageListener).toBeNull();
    });

    it('should null window reference on closed event', () => {
      windowManager.createWindow();
      const win = windowManager.mainWindow;

      const closedHandler = win.on.mock.calls.find(
        call => call[0] === 'closed'
      )[1];

      closedHandler();

      // After closed, window reference should be null
      expect(windowManager.mainWindow).toBeNull();
    });

    it('should log renderer console messages', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      windowManager.createWindow();

      const consoleHandler = windowManager.mainWindow.webContents.on.mock.calls.find(
        call => call[0] === 'console-message'
      )[1];

      consoleHandler({}, 1, 'Test message', 10, 'source.js');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Test message'));
      consoleLogSpy.mockRestore();
    });
  });
});
