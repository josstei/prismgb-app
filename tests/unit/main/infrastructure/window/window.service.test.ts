import * as serviceMocks from '../../../../factories/index.js';
/**
 * WindowService Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createPreventDefaultEventMock,
  createWindowServiceElectronMock
} from '../../../../factories/index.js';
import { createServiceHarness, type LoggerMockLike } from '../../../../support/service.harness.js';

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

import { WindowService } from '@main/infrastructure/window/window.service.js';
import { app } from 'electron';

type MockFn = ReturnType<typeof vi.fn<(...args: any[]) => any>>;
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
    session: { on: MockFn; off: MockFn };
    on: MockFn;
    off: MockFn;
    isDevToolsOpened: MockFn;
    closeDevTools: MockFn;
  };
};
type TestableWindowService = Omit<WindowService, 'getMainWindow'> & {
  mainWindow: MockBrowserWindow | null;
  _forceWindowToForeground(): void;
  getMainWindow(): MockBrowserWindow | null;
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
    const h = createServiceHarness(WindowService, {
      loggerFactory: serviceMocks.createLoggerFactory(),
      ipcPushBridge: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
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

      expect(windowService.mainWindow!.loadURL).toHaveBeenCalledWith(
        'http://127.0.0.1:3000/src/renderer/index.html'
      );
    });

    it('should load file in production', () => {
      const originalIsPackaged = app.isPackaged;
      Object.defineProperty(app, 'isPackaged', { value: true, configurable: true });

      windowService.createWindow();

      expect(windowService.mainWindow!.loadFile).toHaveBeenCalled();

      Object.defineProperty(app, 'isPackaged', { value: originalIsPackaged, configurable: true });
    });

    it('should register console-message handler', () => {
      windowService.createWindow();

      expect(windowService.mainWindow!.webContents.on).toHaveBeenCalledWith('console-message', expect.any(Function));
    });

    it('should register ready-to-show handler', () => {
      windowService.createWindow();

      expect(windowService.mainWindow!.once).toHaveBeenCalledWith('ready-to-show', expect.any(Function));
    });

    it('should register close handler', () => {
      windowService.createWindow();

      expect(windowService.mainWindow!.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should register closed handler', () => {
      windowService.createWindow();

      expect(windowService.mainWindow!.on).toHaveBeenCalledWith('closed', expect.any(Function));
    });

    it('should return existing window if already created', () => {
      windowService.createWindow();
      const firstWindow = windowService.mainWindow!;

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
      const win = windowService.mainWindow!;
      win.show.mockClear();

      windowService.showWindow();

      expect(win.show).toHaveBeenCalled();
    });

    it('should create window if it does not exist', () => {
      windowService.showWindow();

      expect(windowService.mainWindow).not.toBeNull();
    });
  });

  describe('_forceWindowToForeground', () => {
    it('should show and focus window', () => {
      windowService.createWindow();

      windowService._forceWindowToForeground();

      expect(windowService.mainWindow!.show).toHaveBeenCalled();
      expect(windowService.mainWindow!.focus).toHaveBeenCalled();
    });

    it('should restore if minimized', () => {
      windowService.createWindow();
      windowService.mainWindow!.isMinimized.mockReturnValue(true);

      windowService._forceWindowToForeground();

      expect(windowService.mainWindow!.restore).toHaveBeenCalled();
    });

    it('should do nothing if window does not exist', () => {
      // Should not throw
      expect(() => windowService._forceWindowToForeground()).not.toThrow();
    });
  });

  describe('Window Event Handlers', () => {
    it('should handle close event by hiding window when not quitting', () => {
      windowService.createWindow();
      const win = windowService.mainWindow!;

      const closeHandler = win.on.mock.calls.find(
        call => call[0] === 'close'
      )![1];

      const mockEvent = createPreventDefaultEventMock();
      app.isQuitting = false;

      closeHandler(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(win.hide).toHaveBeenCalled();
    });

    it('should allow close when app is quitting', () => {
      windowService.createWindow();
      const win = windowService.mainWindow!;

      const closeHandler = win.on.mock.calls.find(
        call => call[0] === 'close'
      )![1];

      const mockEvent = createPreventDefaultEventMock();
      app.isQuitting = true;

      closeHandler(mockEvent);

      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
    });

    it('should clean up webContents listener on close event when quitting', () => {
      windowService.createWindow();
      const win = windowService.mainWindow!;

      const closeHandler = win.on.mock.calls.find(
        call => call[0] === 'close'
      )![1];

      const mockEvent = createPreventDefaultEventMock();
      app.isQuitting = true;

      closeHandler(mockEvent);

      // Verify webContents listener was removed during close (before destroy)
      expect(win.webContents.off).toHaveBeenCalledWith('console-message', expect.any(Function));
    });

    it('should null window reference on closed event', () => {
      windowService.createWindow();
      const win = windowService.mainWindow!;

      const closedHandler = win.on.mock.calls.find(
        call => call[0] === 'closed'
      )![1];

      closedHandler();

      // After closed, window reference should be null
      expect(windowService.mainWindow).toBeNull();
    });

    it('should log renderer console messages', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      windowService.createWindow();

      const consoleHandler = windowService.mainWindow!.webContents.on.mock.calls.find(
        call => call[0] === 'console-message'
      )![1];

      consoleHandler({}, 1, 'Test message', 10, 'source.js');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Test message'));
      consoleLogSpy.mockRestore();
    });
  });

  describe('drainDownloads', () => {
    it('waits for a registered download before will-download arrives and until it completes', async () => {
      windowService.createWindow();
      windowService.expectDownload('blob:recording');
      const drained = vi.fn();
      const draining = windowService.drainDownloads().then(drained);
      await Promise.resolve();
      expect(drained).not.toHaveBeenCalled();

      const download = windowService.mainWindow!.webContents.session.on.mock.calls.find(
        call => call[0] === 'will-download'
      )![1];
      const item = { getFilename: vi.fn(() => 'recording.webm'), getURL: vi.fn(() => 'blob:recording'), setSavePath: vi.fn(), once: vi.fn() };
      download(createPreventDefaultEventMock(), item);
      await Promise.resolve();
      expect(drained).not.toHaveBeenCalled();
      item.once.mock.calls[0][1]({}, 'completed');
      await draining;
      expect(drained).toHaveBeenCalledOnce();
    });

    it('releases a registration when the renderer cannot click the download', async () => {
      windowService.expectDownload('blob:recording');
      const draining = windowService.drainDownloads();
      windowService.cancelDownload('blob:recording');
      await expect(draining).resolves.toBeUndefined();
    });

    it('bounds missing-start failure and reports it after other downloads finish', async () => {
      vi.useFakeTimers();
      try {
        windowService.createWindow();
        windowService.expectDownload('blob:missing');
        const download = windowService.mainWindow!.webContents.session.on.mock.calls.find(
          call => call[0] === 'will-download'
        )![1];
        const item = { getFilename: vi.fn(() => 'recording.webm'), getURL: vi.fn(() => 'blob:recording'), setSavePath: vi.fn(), once: vi.fn() };
        download(createPreventDefaultEventMock(), item);
        const rejected = vi.fn();
        const draining = windowService.drainDownloads().catch(rejected);
        await vi.advanceTimersByTimeAsync(5000);
        expect(rejected).not.toHaveBeenCalled();
        item.once.mock.calls[0][1]({}, 'completed');
        await draining;
        expect(rejected).toHaveBeenCalledWith(expect.objectContaining({ message: 'Downloads failed to start' }));
        await expect(windowService.drainDownloads()).resolves.toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    });

    it('waits for every accepted download, including one starting during drain', async () => {
      windowService.createWindow();
      const download = windowService.mainWindow!.webContents.session.on.mock.calls.find(
        call => call[0] === 'will-download'
      )![1];
      const createItem = () => {
        const item = { getFilename: vi.fn(() => 'recording.webm'), getURL: vi.fn(() => 'blob:recording'), setSavePath: vi.fn(), once: vi.fn() };
        download(createPreventDefaultEventMock(), item);
        return (state = 'completed') => item.once.mock.calls[0][1]({}, state);
      };
      const finishFirst = createItem();
      const drained = vi.fn();
      const draining = windowService.drainDownloads().then(drained);
      const finishSecond = createItem();
      finishFirst();
      await Promise.resolve();
      expect(drained).not.toHaveBeenCalled();
      finishSecond();
      await draining;
      expect(drained).toHaveBeenCalledOnce();
    });

    it('settles cancelled downloads without blocking shutdown', async () => {
      windowService.createWindow();
      const download = windowService.mainWindow!.webContents.session.on.mock.calls.find(
        call => call[0] === 'will-download'
      )![1];
      const item = { getFilename: vi.fn(() => 'recording.webm'), getURL: vi.fn(() => 'blob:recording'), setSavePath: vi.fn(), once: vi.fn() };
      download(createPreventDefaultEventMock(), item);
      const draining = windowService.drainDownloads();
      item.once.mock.calls[0][1]({}, 'cancelled');
      await draining;
      expect(mockLogger.warn).toHaveBeenCalledWith('Download failed: cancelled');
    });

    it('returns immediately when no downloads are pending', async () => {
      await expect(windowService.drainDownloads()).resolves.toBeUndefined();
    });
  });

  describe('destroyWindow', () => {
    it('should destroy BrowserWindow and null reference', () => {
      windowService.createWindow();
      const win = windowService.mainWindow!;
      
      windowService.destroyWindow();

      expect(win.destroy).toHaveBeenCalled();
      expect(windowService.mainWindow).toBeNull();
    });

    it('should not throw if window does not exist', () => {
      expect(() => windowService.destroyWindow()).not.toThrow();
    });

    it('should close devTools if open', () => {
      windowService.createWindow();
      const win = windowService.mainWindow!;
      win.webContents.isDevToolsOpened.mockReturnValue(true);

      windowService.destroyWindow();

      expect(win.webContents.closeDevTools).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should clean up all listeners and dispose service', () => {
      windowService.createWindow();
      const win = windowService.mainWindow!;

      windowService.dispose();

      // Verify a listener removal, e.g. console-message
      expect(win.webContents.off).toHaveBeenCalledWith('console-message', expect.any(Function));
    });
  });
});
