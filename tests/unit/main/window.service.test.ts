// @ts-nocheck
/**
 * WindowService Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createLoggerFactory,
  createPreventDefaultEventMock,
  createWindowServiceElectronMock
} from '../../factories/index.js';

// Mock electron - need to use class syntax
vi.mock('electron', () => {
  return createWindowServiceElectronMock();
});

vi.mock('url', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      ...actual.default,
      fileURLToPath: vi.fn((urlArg) => {
        if (typeof urlArg === 'string' && urlArg.includes('window.service')) {
          return '/app/src/main/window/window.service.js';
        }
        return actual.fileURLToPath(urlArg);
      })
    },
    fileURLToPath: vi.fn((urlArg) => {
      if (typeof urlArg === 'string' && urlArg.includes('window.service')) {
        return '/app/src/main/window/window.service.js';
      }
      return actual.fileURLToPath(urlArg);
    })
  };
});

vi.mock('path', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      ...actual.default,
      join: vi.fn((...args) => args.join('/')),
      dirname: vi.fn((p) => p.split('/').slice(0, -1).join('/'))
    },
    join: vi.fn((...args) => args.join('/')),
    dirname: vi.fn((p) => p.split('/').slice(0, -1).join('/'))
  };
});

import { WindowService } from '@main/infrastructure/window/window.service.js';
import { BrowserWindow, app } from 'electron';

describe('WindowService', () => {
  let windowService;
  let mockLogger;
  let mockLoggerFactory;
  let mockIpcPushBridge;
  let originalPlatform;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLoggerFactory = createLoggerFactory();
    mockIpcPushBridge = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };

    windowService = new WindowService({
      loggerFactory: mockLoggerFactory,
      ipcPushBridge: mockIpcPushBridge
    });
    mockLogger = mockLoggerFactory._getLogger('WindowService');

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
        'http://127.0.0.1:3000/src/renderer/index.html'
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
    it('forwards the channel and the first argument to the push bridge', () => {
      windowService.createWindow();

      windowService.send('test-channel', 'payload');

      expect(mockIpcPushBridge.emit).toHaveBeenCalledWith('test-channel', 'payload');
    });

    it('emits a void payload when called without arguments', () => {
      windowService.send('window:enter-fullscreen');

      expect(mockIpcPushBridge.emit).toHaveBeenCalledWith('window:enter-fullscreen', undefined);
    });

    it('emits regardless of window lifecycle (the bridge owns delivery)', () => {
      expect(() => windowService.send('test-channel', 'data')).not.toThrow();
      expect(mockIpcPushBridge.emit).toHaveBeenCalledWith('test-channel', 'data');
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

      const mockEvent = createPreventDefaultEventMock();
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

      const mockEvent = createPreventDefaultEventMock();
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

      const mockEvent = createPreventDefaultEventMock();
      app.isQuitting = true;

      closeHandler(mockEvent);

      // Verify webContents listener was removed during close (before destroy)
      expect(win.webContents.off).toHaveBeenCalledWith('console-message', expect.any(Function));
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

  describe('destroyWindow', () => {
    it('should destroy BrowserWindow and null reference', () => {
      windowService.createWindow();
      const win = windowService.mainWindow;
      
      windowService.destroyWindow();

      expect(win.destroy).toHaveBeenCalled();
      expect(windowService.mainWindow).toBeNull();
    });

    it('should not throw if window does not exist', () => {
      expect(() => windowService.destroyWindow()).not.toThrow();
    });

    it('should close devTools if open', () => {
      windowService.createWindow();
      const win = windowService.mainWindow;
      win.webContents.isDevToolsOpened.mockReturnValue(true);

      windowService.destroyWindow();

      expect(win.webContents.closeDevTools).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should clean up all listeners and dispose service', () => {
      windowService.createWindow();
      const win = windowService.mainWindow;

      windowService.dispose();

      // Verify a listener removal, e.g. console-message
      expect(win.webContents.off).toHaveBeenCalledWith('console-message', expect.any(Function));
    });
  });
});
