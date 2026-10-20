import { BrowserWindow, app, type DownloadItem, type Event } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { IPC_CHANNELS } from '@platform/ipc';
import { injectable, inject } from 'inversify';
import { BaseService, type LoggerFactory } from '@platform/core';
import { TOKENS } from '@main/application/di/tokens';
import type { IpcPushBridge } from '@main/ipc/ipc-push.bridge';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEV_SERVER_URL = 'http://127.0.0.1:3000/src/renderer/index.html';
const RENDERER_CONSOLE_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

/** The download listener sits on the shared default session, which outlives the window. */
const DOWNLOAD_LISTENER_KEY = Symbol('windowDownloadListener');

@injectable()
export class WindowService extends BaseService {
  private mainWindow: BrowserWindow | null = null;
  private isHiddenLaunch = false;

  constructor(
    @inject(TOKENS.ipcPushBridge) private readonly ipcPushBridge: IpcPushBridge,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactory
  ) {
    super(loggerFactory, 'WindowService');
  }

  createWindow(options: { hidden?: boolean } = {}): BrowserWindow {
    if (this.mainWindow) {
      this.forceWindowToForeground();
      return this.mainWindow;
    }

    this.isHiddenLaunch = options.hidden ?? false;

    this.logger.info('Creating main window');

    const isDev = process.env.ELECTRON_IS_DEV === '0' ? false : !app.isPackaged;
    const appPath = app.getAppPath();
    const preloadPath = path.join(__dirname, '../preload/index.js');

    this.logger.info(`isDev: ${isDev}`);
    this.logger.debug(`appPath: ${appPath}, preloadPath: ${preloadPath}`);

    const mainWindow = new BrowserWindow({
      width: 1280,
      height: 720,
      minWidth: 800,
      minHeight: 600,
      backgroundColor: '#0f0f1e',
      title: 'PrismGB',
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        preload: preloadPath
      },
      show: false
    });
    this.mainWindow = mainWindow;

    const { session } = mainWindow.webContents;
    const downloadHandler = (event: Event, item: DownloadItem) => this.saveDownload(event, item);
    session.on('will-download', downloadHandler);
    this.disposables.replace(DOWNLOAD_LISTENER_KEY, () => {
      session.off('will-download', downloadHandler);
    });

    if (isDev) {
      mainWindow.loadURL(DEV_SERVER_URL);
      this.logger.info(`Loading from Vite dev server: ${DEV_SERVER_URL}`);
      // scripts/dev-boot-smoke.js matches this '[Renderer <LEVEL>] <message>' stdout format.
      mainWindow.webContents.on('console-message', (_event: Event, level: number, message: string) => {
        console.log(`[Renderer ${RENDERER_CONSOLE_LEVELS[level] || level}] ${message}`);
      });
    } else {
      mainWindow.loadFile(path.join(__dirname, '../renderer/src/renderer/index.html'));
      this.logger.info('Loading built files');
    }

    mainWindow.once('ready-to-show', () => {
      if (!this.isHiddenLaunch) {
        this.forceWindowToForeground();
      } else {
        this.logger.info('Window created in hidden mode - awaiting tray click');
      }
    });

    mainWindow.on('enter-full-screen', () => this.ipcPushBridge.emit(IPC_CHANNELS.WINDOW.ENTER_FULLSCREEN));
    mainWindow.on('leave-full-screen', () => this.ipcPushBridge.emit(IPC_CHANNELS.WINDOW.LEAVE_FULLSCREEN));
    mainWindow.on('resized', () => this.ipcPushBridge.emit(IPC_CHANNELS.WINDOW.RESIZED));

    mainWindow.on('close', (event: Event) => {
      if (!app.isQuitting) {
        event.preventDefault();
        mainWindow.hide();
      }
    });

    mainWindow.on('closed', () => {
      this.disposables.cancel(DOWNLOAD_LISTENER_KEY);
      this.mainWindow = null;
    });

    return mainWindow;
  }

  showWindow(): void {
    this.isHiddenLaunch = false;
    if (this.mainWindow) {
      this.forceWindowToForeground();
    } else {
      this.createWindow();
    }
  }

  destroyWindow(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      this.mainWindow = null;
      return;
    }

    this.logger.info('Destroying main window safely');
    this.disposables.cancel(DOWNLOAD_LISTENER_KEY);

    const { webContents } = this.mainWindow;
    if (!webContents.isDestroyed() && webContents.isDevToolsOpened()) {
      webContents.closeDevTools();
      this.logger.debug('Closed DevTools');
    }

    this.mainWindow.destroy();
    this.logger.debug('Destroyed main window');
    this.mainWindow = null;
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

  private forceWindowToForeground(): void {
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

  /** Auto-saves into Downloads; a sanitized name can still be '..', hence the resolve check. */
  private saveDownload(event: Event, item: DownloadItem): void {
    const downloadsPath = app.getPath('downloads');
    const rawFilename = item.getFilename();
    const filename = path.basename(rawFilename).replace(/[^a-zA-Z0-9._-]/g, '_') || 'download';
    const savePath = path.join(downloadsPath, filename);

    if (!path.resolve(savePath).startsWith(path.resolve(downloadsPath))) {
      this.logger.error(`Path traversal attempt blocked: ${rawFilename}`);
      event.preventDefault();
      return;
    }

    this.logger.info(`Auto-saving download: ${filename} to ${downloadsPath}`);
    item.setSavePath(savePath);

    item.once('done', (_event: Event, state: string) => {
      if (state === 'completed') {
        this.logger.info(`Download completed: ${savePath}`);
      } else {
        this.logger.warn(`Download failed: ${state}`);
      }
    });
  }
}
