/**
 * Window Manager
 * Handles main application window creation and lifecycle
 */

import { BrowserWindow, app } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { uiConfig } from '../../shared/config/config-loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { WINDOW_CONFIG } = uiConfig;

class WindowManager {
  constructor({ loggerFactory }) {
    this.logger = loggerFactory.create('WindowManager');
    this.mainWindow = null;
    this._consoleMessageListener = null;
    this._downloadHandler = null;
  }

  /**
   * Create the main application window
   */
  createWindow() {
    if (this.mainWindow) {
      this._forceWindowToForeground();
      return this.mainWindow;
    }

    this.logger.info('Creating main window');

    // Determine dev vs production mode
    const isDev = !app.isPackaged;
    const appPath = app.getAppPath();

    // Preload path - relative to main process bundle location (dist/main -> dist/preload)
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

    // Configure download handler to auto-save without native dialog
    // This bypasses GTK file chooser issues on Linux (GtkFileChooserNative errors)
    // Store reference for cleanup on window close
    this._downloadHandler = (event, item) => {
      const downloadsPath = app.getPath('downloads');
      const rawFilename = item.getFilename();

      // Sanitize filename to prevent path traversal attacks
      // Extract base name and remove any dangerous characters
      const baseName = path.basename(rawFilename);
      const sanitizedFilename = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');

      // Ensure filename is not empty after sanitization
      const filename = sanitizedFilename || 'download';

      const savePath = path.join(downloadsPath, filename);

      // Verify the resolved path is still within downloads directory
      const resolvedPath = path.resolve(savePath);
      if (!resolvedPath.startsWith(path.resolve(downloadsPath))) {
        this.logger.error(`Path traversal attempt blocked: ${rawFilename}`);
        event.preventDefault();
        return;
      }

      this.logger.info(`Auto-saving download: ${filename} to ${downloadsPath}`);
      item.setSavePath(savePath);

      item.once('done', (event, state) => {
        if (state === 'completed') {
          this.logger.info(`Download completed: ${savePath}`);
        } else {
          this.logger.warn(`Download failed: ${state}`);
        }
      });
    };
    this.mainWindow.webContents.session.on('will-download', this._downloadHandler);

    if (isDev) {
      // Development: Load from Vite dev server
      this.mainWindow.loadURL('http://localhost:3000/src/app/renderer/index.html');
      this.logger.info('Loading from Vite dev server: http://localhost:3000/src/app/renderer/index.html');
      // DevTools disabled - can cause GPU crashes on Linux
      // Press F12 to open manually if needed
    } else {
      // Production: Load built files (Vite builds to dist/renderer/src/app/renderer/)
      this.mainWindow.loadFile(path.join(__dirname, '../renderer/src/app/renderer/index.html'));
      this.logger.info('Loading built files');
    }

    // Log renderer console to terminal (dev only) - store reference for cleanup
    if (isDev) {
      this._consoleMessageListener = (event, level, message, line, sourceId) => {
        const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
        console.log(`[Renderer ${levels[level] || level}] ${message}`);
      };
      this.mainWindow.webContents.on('console-message', this._consoleMessageListener);
    }

    // Show window when ready - pop up and focus
    this.mainWindow.once('ready-to-show', () => {
      this._forceWindowToForeground();
    });

    // Handle window close - clean up listeners before window is destroyed
    this.mainWindow.on('close', (event) => {
      if (!app.isQuitting) {
        event.preventDefault();
        this.mainWindow.hide();
        return;
      }

      // Clean up console message listener
      if (this._consoleMessageListener && this.mainWindow.webContents) {
        this.mainWindow.webContents.off('console-message', this._consoleMessageListener);
      }
      this._consoleMessageListener = null;

      // Clean up download handler from session
      if (this._downloadHandler && this.mainWindow?.webContents?.session) {
        this.mainWindow.webContents.session.off('will-download', this._downloadHandler);
      }
      this._downloadHandler = null;
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
  _forceWindowToForeground() {
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
  showWindow() {
    if (this.mainWindow) {
      this._forceWindowToForeground();
    } else {
      this.createWindow();
    }
  }

  /**
   * Check if window exists
   */
  hasWindow() {
    return this.mainWindow !== null;
  }

  /**
   * Send message to renderer process
   */
  send(channel, ...args) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args);
    }
  }
}

export default WindowManager;
