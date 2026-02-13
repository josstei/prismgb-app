/**
 * Window Service
 * Handles main application window creation and lifecycle
 */

import { BrowserWindow, app, DownloadItem, Event } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { uiConfig } from '@main/infrastructure/config/config-loader.utils';
import { channels as IPC_CHANNELS } from '@prismgb/ipc';
import { BaseService } from '@prismgb/core';

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

class WindowService extends BaseService {

  private mainWindow: BrowserWindow | null = null;
  private readonly _listeners: Map<string, Function> = new Map();

  constructor(dependencies: WindowServiceDependencies) {
    super(dependencies, ['loggerFactory'], 'WindowService');
  }

  /**
   * Create the main application window
   */
  createWindow(): BrowserWindow {
    if (this.mainWindow) {
      this._forceWindowToForeground();
      return this.mainWindow;
    }

    this.logger.info('Creating main window');

    // Determine dev vs production mode
    // ELECTRON_IS_DEV=0 forces production mode for E2E tests
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

    const downloadHandler = (event: Event, item: DownloadItem) => {
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
    this._listeners.set('will-download', downloadHandler);
    this.mainWindow.webContents.session.on('will-download', downloadHandler);

    if (isDev) {
      this.mainWindow.loadURL('http://localhost:3000/src/renderer/index.html');
      this.logger.info('Loading from Vite dev server: http://localhost:3000/src/renderer/index.html');
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../renderer/src/renderer/index.html'));
      this.logger.info('Loading built files');
    }

    // Log renderer console to terminal (dev only)
    if (isDev) {
      const consoleListener = (
        event: Event,
        level: number,
        message: string,
        _line: number,
        _sourceId: string
      ) => {
        const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
        console.log(`[Renderer ${levels[level] || level}] ${message}`);
      };
      this._listeners.set('console-message', consoleListener);
      this.mainWindow.webContents.on('console-message', consoleListener);
    }

    this.mainWindow.once('ready-to-show', () => {
      this._forceWindowToForeground();
    });

    const enterFullscreenListener = () => {
      this.send(IPC_CHANNELS.WINDOW.ENTER_FULLSCREEN);
    };
    const leaveFullscreenListener = () => {
      this.send(IPC_CHANNELS.WINDOW.LEAVE_FULLSCREEN);
    };
    const resizedListener = () => {
      this.send(IPC_CHANNELS.WINDOW.RESIZED);
    };
    this._listeners.set('enter-full-screen', enterFullscreenListener);
    this._listeners.set('leave-full-screen', leaveFullscreenListener);
    this._listeners.set('resized', resizedListener);
    this.mainWindow.on('enter-full-screen', enterFullscreenListener);
    this.mainWindow.on('leave-full-screen', leaveFullscreenListener);
    this.mainWindow.on('resized', resizedListener);

    // Handle window close - clean up listeners before window is destroyed
    this.mainWindow.on('close', (event: Event) => {
      if (!(app as AppWithQuitFlag).isQuitting) {
        event.preventDefault();
        this.mainWindow!.hide();
        return;
      }

      // Clean up all tracked listeners
      const consoleListener = this._listeners.get('console-message');
      if (consoleListener && this.mainWindow!.webContents) {
        this.mainWindow!.webContents.off('console-message', consoleListener as ConsoleMessageListener);
      }

      const downloadListener = this._listeners.get('will-download');
      if (downloadListener && this.mainWindow?.webContents?.session) {
        this.mainWindow.webContents.session.off('will-download', downloadListener as DownloadHandler);
      }

      if (this.mainWindow) {
        const enterFullscreenListener = this._listeners.get('enter-full-screen');
        const leaveFullscreenListener = this._listeners.get('leave-full-screen');
        const resizedListener = this._listeners.get('resized');

        if (enterFullscreenListener) {
          this.mainWindow.off('enter-full-screen', enterFullscreenListener as FullscreenListener);
        }
        if (leaveFullscreenListener) {
          this.mainWindow.off('leave-full-screen', leaveFullscreenListener as FullscreenListener);
        }
        if (resizedListener) {
          this.mainWindow.off('resized', resizedListener as () => void);
        }
      }

      this._listeners.clear();
    });

    this.mainWindow.on('closed', () => {
      // Window is already destroyed at this point - just null the reference
      this.mainWindow = null;
    });

    return this.mainWindow;
  }

  /**
   * Force window to foreground with platform-specific methods
   * Simplified to avoid Chromium compositor crashes on Linux
   */
  private _forceWindowToForeground(): void {
    if (!this.mainWindow) return;

    // Restore if minimized
    if (this.mainWindow.isMinimized()) {
      this.mainWindow.restore();
    }

    // Show and focus - keep it simple to avoid race conditions
    this.mainWindow.show();
    this.mainWindow.focus();

    // Platform-specific focus methods
    if (process.platform === 'darwin') {
      // macOS-specific: request focus and activate app
      app.focus({ steal: true });
    }

    if (process.platform === 'win32') {
      this.mainWindow.setSkipTaskbar(false);
    }
  }

  /**
   * Show the window if it exists
   */
  showWindow(): void {
    if (this.mainWindow) {
      this._forceWindowToForeground();
    } else {
      this.createWindow();
    }
  }

  /**
   * Check if window exists
   */
  hasWindow(): boolean {
    return this.mainWindow !== null;
  }

  /**
   * Get main window reference
   */
  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  /**
   * Set fullscreen state
   * @param enabled - Whether to enter or exit fullscreen
   */
  setFullScreen(enabled: boolean): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.setFullScreen(enabled);
    }
  }

  /**
   * Check if window is in fullscreen
   * @returns True if fullscreen
   */
  isFullScreen(): boolean {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      return this.mainWindow.isSimpleFullScreen() || this.mainWindow.isFullScreen();
    }
    return false;
  }

  /**
   * Send message to renderer process
   */
  send(channel: string, ...args: unknown[]): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args);
    }
  }
}

export { WindowService };
export type { WindowServiceDependencies };
