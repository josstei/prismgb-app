/**
 * Main Entry Point
 * Initializes the application using dependency injection
 */

import { app, BrowserWindow } from 'electron';
import Application from './Application.js';
import { ProcessMemoryMonitor } from '../../infrastructure/logging/process-memory-monitor.js';

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
    const application = new Application();

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
      await application.initialize();

      // Dev mode: Auto-start process memory monitoring
      if (!app.isPackaged) {
        new ProcessMemoryMonitor().start();
      }

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

    // Before quit cleanup
    app.on('before-quit', (event) => {
      if (!app.isQuitting) {
        event.preventDefault();
        app.isQuitting = true;

        // Cleanup and give native USB threads time to terminate
        application.cleanup();

        // Small delay to allow usb-detection native threads to clean up
        setTimeout(() => {
          app.quit();
        }, 100);
      }
    });
  }
}
