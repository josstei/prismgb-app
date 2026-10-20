import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createPreventDefaultEventMock,
  createWindowServiceElectronMock
} from '../../../../factories/index.js';
import { createInjectableHarness, type LoggerMockLike } from '../../../../support/di/injectable.harness';

type UrlModuleWithDefault = typeof import('node:url') & { default: typeof import('node:url') };
type PathModuleWithDefault = typeof import('node:path') & { default: typeof import('node:path') };

// Mock electron - need to use class syntax
vi.mock('electron', () => {
  return createWindowServiceElectronMock();
});

vi.mock('url', async (importOriginal) => {
  const actual = await importOriginal<UrlModuleWithDefault>();
  return {
    ...actual,
    default: {
      ...actual.default,
      fileURLToPath: vi.fn((urlArg: string | URL) => {
        if (typeof urlArg === 'string' && urlArg.includes('window.service')) {
          return '/app/src/main/window/window.service.js';
        }
        return actual.fileURLToPath(urlArg);
      })
    },
    fileURLToPath: vi.fn((urlArg: string | URL) => {
      if (typeof urlArg === 'string' && urlArg.includes('window.service')) {
        return '/app/src/main/window/window.service.js';
      }
      return actual.fileURLToPath(urlArg);
    })
  };
});

vi.mock('path', async (importOriginal) => {
  const actual = await importOriginal<PathModuleWithDefault>();
  return {
    ...actual,
    default: {
      ...actual.default,
      join: vi.fn((...args: string[]) => args.join('/')),
      dirname: vi.fn((p: string) => p.split('/').slice(0, -1).join('/'))
    },
    join: vi.fn((...args: string[]) => args.join('/')),
    dirname: vi.fn((p: string) => p.split('/').slice(0, -1).join('/'))
  };
});

import { WindowService } from '@main/infrastructure/window/window.service';
import { app } from 'electron';

type MockFn = ReturnType<typeof vi.fn>;
type MockBrowserWindow = {
  loadURL: MockFn;
  loadFile: MockFn;
  show: MockFn;
  hide: MockFn;
  focus: MockFn;
  restore: MockFn;
  destroy: MockFn;
  isMinimized: MockFn;
  setSkipTaskbar: MockFn;
  on: MockFn;
  off: MockFn;
  once: MockFn;
  webContents: {
    on: MockFn;
    off: MockFn;
    isDevToolsOpened: MockFn;
    closeDevTools: MockFn;
    session: {
      on: MockFn;
      off: MockFn;
    };
  };
};
type TestableWindowService = Omit<WindowService, 'getMainWindow'> & {
  mainWindow: MockBrowserWindow | null;
  getMainWindow(): MockBrowserWindow | null;
};
type DownloadItemMock = {
  getFilename: MockFn;
  setSavePath: MockFn;
  once: MockFn;
};
type MockLoggerFactory = {
  create: MockFn;
};
type MockIpcPushBridge = {
  emit: MockFn;
  on: MockFn;
  off: MockFn;
};

describe('WindowService', () => {
  let windowService: TestableWindowService;
  let mockLogger: LoggerMockLike;
  let mockLoggerFactory: MockLoggerFactory;
  let mockIpcPushBridge: MockIpcPushBridge;
  let originalPlatform: NodeJS.Platform;

  beforeEach(() => {
    const h = createInjectableHarness(WindowService, {
      overrides: {
        ipcPushBridge: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
      }
    });
    windowService = h.subject as unknown as TestableWindowService;
    mockLogger = h.logger;
    ({
      ipcPushBridge: mockIpcPushBridge,
      loggerFactory: mockLoggerFactory
    } = h.deps as { ipcPushBridge: MockIpcPushBridge; loggerFactory: MockLoggerFactory });

    // Store original platform
    originalPlatform = process.platform;
  });

  afterEach(() => {
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

  describe('bringing the window to the foreground', () => {
    it('should show and focus window', () => {
      windowService.createWindow();
      windowService.mainWindow.show.mockClear();

      windowService.showWindow();

      expect(windowService.mainWindow.show).toHaveBeenCalled();
      expect(windowService.mainWindow.focus).toHaveBeenCalled();
    });

    it('should restore if minimized', () => {
      windowService.createWindow();
      windowService.mainWindow.isMinimized.mockReturnValue(true);

      windowService.showWindow();

      expect(windowService.mainWindow.restore).toHaveBeenCalled();
    });

    it('shows the window on ready-to-show unless launched hidden', () => {
      windowService.createWindow();
      const readyToShow = windowService.mainWindow.once.mock.calls.find(call => call[0] === 'ready-to-show')[1];

      readyToShow();

      expect(windowService.mainWindow.show).toHaveBeenCalled();
    });

    it('stays hidden on ready-to-show for a hidden launch', () => {
      windowService.createWindow({ hidden: true });
      const readyToShow = windowService.mainWindow.once.mock.calls.find(call => call[0] === 'ready-to-show')[1];

      readyToShow();

      expect(windowService.mainWindow.show).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Window created in hidden mode - awaiting tray click');
    });
  });

  describe('fullscreen and resize pushes', () => {
    it.each([
      ['enter-full-screen', 'window:enter-fullscreen'],
      ['leave-full-screen', 'window:leave-fullscreen'],
      ['resized', 'window:resized']
    ])('pushes %s as %s', (windowEvent, channel) => {
      windowService.createWindow();
      const handler = windowService.mainWindow.on.mock.calls.find(call => call[0] === windowEvent)[1];

      handler();

      expect(mockIpcPushBridge.emit).toHaveBeenCalledWith(channel);
    });

    it('reports simple fullscreen as fullscreen', () => {
      windowService.createWindow();
      Object.assign(windowService.mainWindow, {
        isSimpleFullScreen: vi.fn(() => true),
        isFullScreen: vi.fn(() => false)
      });

      expect(windowService.isFullScreen()).toBe(true);
    });
  });

  describe('downloads', () => {
    function downloadHandler() {
      windowService.createWindow();
      return windowService.mainWindow.webContents.session.on.mock.calls.find(call => call[0] === 'will-download')[1];
    }

    function downloadItem(filename: string): DownloadItemMock {
      return { getFilename: vi.fn(() => filename), setSavePath: vi.fn(), once: vi.fn() };
    }

    it('auto-saves into Downloads with a sanitized file name', () => {
      const item = downloadItem('my recording?.png');
      const event = createPreventDefaultEventMock();

      downloadHandler()(event, item);

      expect(item.setSavePath).toHaveBeenCalledWith('/downloads/my_recording_.png');
      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('falls back to a default name when nothing survives sanitizing', () => {
      const item = downloadItem('');

      downloadHandler()(createPreventDefaultEventMock(), item);

      expect(item.setSavePath).toHaveBeenCalledWith('/downloads/download');
    });

    it('blocks a name that still escapes Downloads', () => {
      const item = downloadItem('..');
      const event = createPreventDefaultEventMock();

      downloadHandler()(event, item);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(item.setSavePath).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith('Path traversal attempt blocked: ..');
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

    it('removes the session will-download listener on closed', () => {
      windowService.createWindow();
      const win = windowService.mainWindow;
      const downloadListener = win.webContents.session.on.mock.calls.find(call => call[0] === 'will-download')[1];

      const closedHandler = win.on.mock.calls.find(
        call => call[0] === 'closed'
      )[1];
      closedHandler();

      expect(win.webContents.session.off).toHaveBeenCalledWith('will-download', downloadListener);
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
      consoleHandler({}, 7, 'Odd level', 10, 'source.js');

      expect(consoleLogSpy).toHaveBeenCalledWith('[Renderer INFO] Test message');
      expect(consoleLogSpy).toHaveBeenCalledWith('[Renderer 7] Odd level');
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

    it('removes the session will-download listener', () => {
      windowService.createWindow();
      const win = windowService.mainWindow;

      windowService.destroyWindow();

      expect(win.webContents.session.off).toHaveBeenCalledWith('will-download', expect.any(Function));
    });
  });

  describe('dispose', () => {
    it('removes the session will-download listener', async () => {
      windowService.createWindow();
      const win = windowService.mainWindow;

      await windowService.dispose();

      expect(win.webContents.session.off).toHaveBeenCalledWith('will-download', expect.any(Function));
    });
  });
});
