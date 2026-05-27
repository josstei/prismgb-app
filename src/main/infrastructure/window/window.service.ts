import { BrowserWindow, app, DownloadItem, Event } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { uiConfig } from '@shared/config/config-loader.utils.js';
import { IPC_CHANNELS } from '@shared/ipc/ipc.manifest.js';
import { BaseService } from '@shared/base/service.base.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { WINDOW_CONFIG } = uiConfig;

interface WindowServiceDependencies {
  loggerFactory: {
    create: (name: string) => {
      info: (message: string) => void;
      debug: (message: string) => void;
      warn: (message: string) => void;
      error: (message: string) => void;
    };
  };
}

type ConsoleMessageListener = (
  event: Event,
  level: number,
  message: string,
  line: number,
  sourceId: string
) => void;

type DownloadHandler = (event: Event, item: DownloadItem) => void;

type FullscreenListener = () => void;

type AppWithQuitFlag = typeof app & {
  isQuitting?: boolean;
};

interface CreateWindowOptions {
  hidden?: boolean;
}

const WINDOW_DOWNLOAD_LIFECYCLE = Symbol('windowDownload');
const WINDOW_CONSOLE_LIFECYCLE = Symbol('windowConsole');
const WINDOW_READY_TO_SHOW_LIFECYCLE = Symbol('windowReadyToShow');
const WINDOW_ENTER_FULLSCREEN_LIFECYCLE = Symbol('windowEnterFullscreen');
const WINDOW_LEAVE_FULLSCREEN_LIFECYCLE = Symbol('windowLeaveFullscreen');
const WINDOW_RESIZED_LIFECYCLE = Symbol('windowResized');
const WINDOW_CLOSE_LIFECYCLE = Symbol('windowClose');
const WINDOW_CLOSED_LIFECYCLE = Symbol('windowClosed');

type CleanupWindowListenersOptions = {
  includeCloseListener?: boolean;
  includeClosedListener?: boolean;
};

class WindowService extends BaseService {

  private mainWindow: BrowserWindow | null = null;
  private _isHiddenLaunch: boolean = false;

  constructor(dependencies: WindowServiceDependencies) {
    super(dependencies, ['loggerFactory'], 'WindowService');
  }

  createWindow(options: CreateWindowOptions = {}): BrowserWindow {
    if (this.mainWindow) {
      this._forceWindowToForeground();
      return this.mainWindow;
    }

    this._isHiddenLaunch = options.hidden ?? false;

    this.logger.info('Creating main window');

    const isDev = process.env.ELECTRON_IS_DEV === '0' ? false : !app.isPackaged;
    const appPath = app.getAppPath();

    const preloadPath = path.join(__dirname, '../preload/index.js');

    this.logger.info(`isDev: ${isDev}`);
    this.logger.debug(`appPath: ${appPath}, preloadPath: ${preloadPath}`);

    this.mainWindow = new BrowserWindow({
      width: WINDOW_CONFIG.width,
      height: WINDOW_CONFIG.height,
      minWidth: WINDOW_CONFIG.minWidth,
      minHeight: WINDOW_CONFIG.minHeight,
      title: 'PrismGB',
      backgroundColor: WINDOW_CONFIG.backgroundColor,
      autoHideMenuBar: true,
      frame: true,
      transparent: false,
      skipTaskbar: false, // Ensure window appears in taskbar
      focusable: true, // Ensure window can receive focus
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        preload: preloadPath
      },
      show: false // Don't show until ready
    });
    const mainWindow = this.mainWindow;

    const downloadHandler: DownloadHandler = (event: Event, item: DownloadItem) => {
      const downloadsPath = app.getPath('downloads');
      const rawFilename = item.getFilename();

      const baseName = path.basename(rawFilename);
      const sanitizedFilename = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');

      const filename = sanitizedFilename || 'download';

      const savePath = path.join(downloadsPath, filename);

      const resolvedPath = path.resolve(savePath);
      if (!resolvedPath.startsWith(path.resolve(downloadsPath))) {
        this.logger.error(`Path traversal attempt blocked: ${rawFilename}`);
        event.preventDefault();
        return;
      }

      this.logger.info(`Auto-saving download: ${filename} to ${downloadsPath}`);
      item.setSavePath(savePath);

      item.once('done', (event: Event, state: string) => {
        if (state === 'completed') {
          this.logger.info(`Download completed: ${savePath}`);
        } else {
          this.logger.warn(`Download failed: ${state}`);
        }
      });
    };
    mainWindow.webContents.session.on('will-download', downloadHandler);
    this.disposables.replace(WINDOW_DOWNLOAD_LIFECYCLE, () => {
      mainWindow.webContents.session.off('will-download', downloadHandler);
    });

    if (isDev) {
      this.mainWindow.loadURL('http://127.0.0.1:3000/src/renderer/index.html');
      this.logger.info('Loading from Vite dev server: http://127.0.0.1:3000/src/renderer/index.html');
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../renderer/src/renderer/index.html'));
      this.logger.info('Loading built files');
    }

    if (isDev) {
      const consoleMessageListener: ConsoleMessageListener = (
        event: Event,
        level: number,
        message: string,
        _line: number,
        _sourceId: string
      ) => {
        const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
        console.log(`[Renderer ${levels[level] || level}] ${message}`);
      };
      mainWindow.webContents.on('console-message', consoleMessageListener);
      this.disposables.replace(WINDOW_CONSOLE_LIFECYCLE, () => {
        mainWindow.webContents.off('console-message', consoleMessageListener);
      });
    }

    const readyToShowListener = () => {
      if (!this._isHiddenLaunch) {
        this._forceWindowToForeground();
      } else {
        this.logger.info('Window created in hidden mode - awaiting tray click');
      }
    };
    mainWindow.once('ready-to-show', readyToShowListener);
    this.disposables.replace(WINDOW_READY_TO_SHOW_LIFECYCLE, () => {
      mainWindow.off('ready-to-show', readyToShowListener);
    });

    const enterFullscreenListener: FullscreenListener = () => {
      this.send(IPC_CHANNELS.WINDOW.ENTER_FULLSCREEN);
    };
    const leaveFullscreenListener: FullscreenListener = () => {
      this.send(IPC_CHANNELS.WINDOW.LEAVE_FULLSCREEN);
    };
    const resizedListener = () => {
      this.send(IPC_CHANNELS.WINDOW.RESIZED);
    };
    mainWindow.on('enter-full-screen', enterFullscreenListener);
    this.disposables.replace(WINDOW_ENTER_FULLSCREEN_LIFECYCLE, () => {
      mainWindow.off('enter-full-screen', enterFullscreenListener);
    });
    mainWindow.on('leave-full-screen', leaveFullscreenListener);
    this.disposables.replace(WINDOW_LEAVE_FULLSCREEN_LIFECYCLE, () => {
      mainWindow.off('leave-full-screen', leaveFullscreenListener);
    });
    mainWindow.on('resized', resizedListener);
    this.disposables.replace(WINDOW_RESIZED_LIFECYCLE, () => {
      mainWindow.off('resized', resizedListener);
    });

    const closeListener = (event: Event) => {
      if (!(app as AppWithQuitFlag).isQuitting) {
        event.preventDefault();
        mainWindow.hide();
        return;
      }

      this._cleanupWindowListeners({
        includeCloseListener: false,
        includeClosedListener: false
      });
    };
    mainWindow.on('close', closeListener);
    this.disposables.replace(WINDOW_CLOSE_LIFECYCLE, () => {
      mainWindow.off('close', closeListener);
    });

    const closedListener = () => {
      this._cleanupWindowListeners({
        includeCloseListener: true,
        includeClosedListener: true
      });
      this.mainWindow = null;
    };
    mainWindow.on('closed', closedListener);
    this.disposables.replace(WINDOW_CLOSED_LIFECYCLE, () => {
      mainWindow.off('closed', closedListener);
    });

    return this.mainWindow;
  }

  private _forceWindowToForeground(): void {
    if (!this.mainWindow) return;

    if (this.mainWindow.isMinimized()) {
      this.mainWindow.restore();
    }

    this.mainWindow.show();
    this.mainWindow.focus();

    if (process.platform === 'darwin') {
      app.focus({ steal: true });
    }

    if (process.platform === 'win32') {
      this.mainWindow.setSkipTaskbar(false);
    }
  }

  showWindow(): void {
    this._isHiddenLaunch = false;
    if (this.mainWindow) {
      this._forceWindowToForeground();
    } else {
      this.createWindow();
    }
  }

  hasWindow(): boolean {
    return this.mainWindow !== null;
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  setFullScreen(enabled: boolean): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.setFullScreen(enabled);
    }
  }

  isFullScreen(): boolean {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      return this.mainWindow.isSimpleFullScreen() || this.mainWindow.isFullScreen();
    }
    return false;
  }

  send(channel: string, ...args: unknown[]): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args);
    }
  }

  private _cleanupWindowListeners({
    includeCloseListener = true,
    includeClosedListener = false
  }: CleanupWindowListenersOptions = {}): void {
    this.disposables.cancel(WINDOW_READY_TO_SHOW_LIFECYCLE);
    this.disposables.cancel(WINDOW_CONSOLE_LIFECYCLE);
    this.disposables.cancel(WINDOW_DOWNLOAD_LIFECYCLE);
    this.disposables.cancel(WINDOW_ENTER_FULLSCREEN_LIFECYCLE);
    this.disposables.cancel(WINDOW_LEAVE_FULLSCREEN_LIFECYCLE);
    this.disposables.cancel(WINDOW_RESIZED_LIFECYCLE);

    if (includeCloseListener) {
      this.disposables.cancel(WINDOW_CLOSE_LIFECYCLE);
    }
    if (includeClosedListener) {
      this.disposables.cancel(WINDOW_CLOSED_LIFECYCLE);
    }
  }

  override dispose(): void | Promise<void> {
    this._cleanupWindowListeners({
      includeCloseListener: true,
      includeClosedListener: true
    });
    return super.dispose();
  }
}

export { WindowService };
export type { WindowServiceDependencies };
