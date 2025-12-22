/**
 * Main Entry Point
 * Initializes the application using dependency injection
 */

import { app, BrowserWindow, Menu } from 'electron';
import MainAppOrchestrator from './MainAppOrchestrator.js';

const APP_NAME = 'PrismGB';

/**
 * Build a lightweight macOS application menu so the system uses the correct app name.
 * Keeping Edit/Window menus preserves common shortcuts (copy/paste, minimize, etc.).
 */
const createMacAppMenu = (appName) => [
  {
    label: appName,
    submenu: [
      { role: 'about', label: `About ${appName}` },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide', label: `Hide ${appName}` },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit', label: `Quit ${appName}` }
    ]
  },
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'pasteAndMatchStyle' },
      { role: 'delete' },
      { role: 'selectAll' }
    ]
  },
  {
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      { type: 'separator' },
      { role: 'front' }
    ]
  }
];

// Set app identity for macOS before the app is ready so the menu bar uses PrismGB
if (process.platform === 'darwin') {
  app.setName(APP_NAME);
  app.setAboutPanelOptions({
    applicationName: APP_NAME,
    applicationVersion: app.getVersion()
  });
}

// =================================================================
// SMOKE TEST MODE
// Exit cleanly after startup for CI/CD validation
// =================================================================
if (process.argv.includes('--smoke-test')) {
  app.whenReady().then(() => {
    console.log('Smoke test: Electron app ready');
    console.log('Smoke test: Main process initialized');

    // Give the app a moment to fully initialize
    setTimeout(() => {
      console.log('Smoke test: Exiting cleanly');
      app.exit(0);
    }, 5000);
  });

  app.on('window-all-closed', () => {
    // Don't quit on window close in smoke test mode
  });
} else {
  // =================================================================
  // NORMAL APPLICATION MODE
  // =================================================================

  // Hardware acceleration is enabled by default for better performance.
  // Users with GPU driver issues can disable it via environment variable:
  //   PRISMGB_DISABLE_GPU=1 prismgb
  if (process.env.PRISMGB_DISABLE_GPU === '1') {
    app.disableHardwareAcceleration();
  }

  // Limit main process V8 heap size for memory efficiency
  // Main process doesn't need large heap - most work happens in renderer
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128');

  // =================================================================
  // SINGLE INSTANCE LOCK
  // Prevent multiple instances of the app from running simultaneously
  // =================================================================
  const gotTheLock = app.requestSingleInstanceLock();

  if (!gotTheLock) {
    console.log('Another instance is already running. Exiting.');
    app.quit();
  } else {
    // Create application instance
    const application = new MainAppOrchestrator();

    // Handle second instance launch - focus existing window
    app.on('second-instance', () => {
      const container = application.getContainer();
      if (container) {
        const windowManager = container.resolve('windowManager');
        const win = windowManager?.mainWindow;
        if (win) {
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
        }
      }
    });

    // App lifecycle events
    app.whenReady().then(async () => {
      // Set macOS application menu with correct app name
      if (process.platform === 'darwin') {
        const macMenu = Menu.buildFromTemplate(createMacAppMenu(APP_NAME));
        Menu.setApplicationMenu(macMenu);
      }

      await application.initialize();

      // macOS: recreate window when dock icon clicked
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          const container = application.getContainer();
          if (container) {
            const windowManager = container.resolve('windowManager');
            windowManager.createWindow();
          }
        }
      });
    });

    // Keep app running in background via system tray when all windows close
    // This allows USB device monitoring to continue
    app.on('window-all-closed', () => {
      // Intentionally empty - app stays running in tray
    });

    app.on('before-quit', (event) => {
      const wasAlreadyQuitting = app.isQuitting;
      app.isQuitting = true;

      application.cleanup();

      if (!wasAlreadyQuitting) {
        event.preventDefault();
        setTimeout(() => {
          app.quit();
        }, 100);
      }
    });
  }
}
