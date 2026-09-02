/**
 * Main Entry Point
 * Initializes the application using dependency injection
 */

import { app, BrowserWindow, dialog, Menu, powerMonitor, screen, type MenuItemConstructorOptions } from 'electron';
import { MainBootstrap } from './app-bootstrap.js';
import { getGpuPolicy, applyChromiumFlags, GPU_ENV_VARS } from './infrastructure/gpu/gpu-policy.js';
import { TOKENS } from './application/di/tokens.js';
import { installPerformanceLaunchMarker } from './infrastructure/diagnostics/performance-launch-marker.js';
import {
  installPerformanceMeasurementGuard,
  type MeasurementEventSource
} from './infrastructure/diagnostics/performance-measurement-guard.js';
import {
  resolvePerformanceRootExitAuditPath,
  writePerformanceRootExitAudit
} from './infrastructure/diagnostics/performance-root-exit-audit.js';

const APP_NAME = 'PrismGB';

type MeasurementEventEmitter = {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  off(event: string, listener: (...args: unknown[]) => void): unknown;
};

function createMeasurementEventSource(
  name: string,
  emitter: unknown,
  events: readonly string[]
): MeasurementEventSource {
  const source = emitter as MeasurementEventEmitter;
  return {
    name,
    events,
    on: (event, listener) => source.on(event, listener),
    off: (event, listener) => source.off(event, listener)
  };
}

let performanceRootExitAuditPath: string | null = null;

const performanceMeasurementController =
  typeof __PRISMGB_PERF_HARNESS__ !== 'undefined' && __PRISMGB_PERF_HARNESS__
    ? (() => {
        const launchId = installPerformanceLaunchMarker(app, process.argv, process.env);
        if (launchId === null) return null;
        performanceRootExitAuditPath = resolvePerformanceRootExitAuditPath(process.env);
        const gpuInfoReady = new Promise<void>((resolve) => {
          app.once('gpu-info-update', () => resolve());
        });
        return installPerformanceMeasurementGuard(launchId, {
          getAppMetrics: () => app.getAppMetrics(),
          rootProcessId: process.pid,
          getEnvironmentSnapshot: async () => {
            await gpuInfoReady;
            return {
              gpuFeatureStatus: app.getGPUFeatureStatus(),
              gpuInfo: await app.getGPUInfo('complete'),
              commandLine: [...process.argv]
            };
          },
          eventSources: [
            createMeasurementEventSource('power', powerMonitor, [
              'on-ac',
              'on-battery',
              'speed-limit-change',
              'thermal-state-change'
            ]),
            createMeasurementEventSource('screen', screen, [
              'display-added',
              'display-removed',
              'display-metrics-changed'
            ]),
            createMeasurementEventSource('app', app, ['gpu-info-update'])
          ]
        });
      })()
    : null;

/**
 * Build a lightweight macOS application menu so the system uses the correct app name.
 * Keeping Edit/Window menus preserves common shortcuts (copy/paste, minimize, etc.).
 */
const createMacAppMenu = (appName: string): MenuItemConstructorOptions[] => [
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
    performanceMeasurementController?.installEnvironmentListeners();
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
  if (process.env[GPU_ENV_VARS.DISABLE_GPU] === '1') {
    app.disableHardwareAcceleration();
  }

  // Apply platform-aware GPU flags (must be before app.whenReady)
  // Addresses ARM64 Linux Vulkan driver issues by disabling WebGPU probing
  const gpuPolicy = getGpuPolicy();
  applyChromiumFlags(app, gpuPolicy);
  if (gpuPolicy.reason) {
    console.log(`[GPU Policy] WebGPU disabled: ${gpuPolicy.reason}`);
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
    const application = new MainBootstrap();

    // Handle second instance launch - focus existing window
    app.on('second-instance', () => {
      const container = application.getContainer();
      if (container) {
        const windowService = container.get(TOKENS.windowService);
        const win = windowService?.getMainWindow();
        if (win) {
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
        }
      }
    });

    // App lifecycle events
    app.whenReady().then(async () => {
      performanceMeasurementController?.installEnvironmentListeners();
      // Set macOS application menu with correct app name
      if (process.platform === 'darwin') {
        const macMenu = Menu.buildFromTemplate(createMacAppMenu(APP_NAME));
        Menu.setApplicationMenu(macMenu);
      }

      try {
        await application.initialize();
      } catch (error) {
        console.error('Application initialization failed:', error);
        dialog.showErrorBox(
          'Initialization Error',
          `${APP_NAME} failed to start: ${error instanceof Error ? error.message : String(error)}`
        );
        app.quit();
        return;
      }

      // macOS: recreate window when dock icon clicked
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          const container = application.getContainer();
          if (container) {
            const windowService = container.get(TOKENS.windowService);
            windowService.createWindow();
          }
        }
      });
    });

    // Keep app running in background via system tray when all windows close
    // This allows USB device monitoring to continue
    app.on('window-all-closed', () => {
      // Intentionally empty - app stays running in tray
    });

    let quitCleanupPromise: Promise<void> | null = null;
    let quitCleanupComplete = false;

    app.on('before-quit', (event) => {
      if (quitCleanupComplete) {
        return;
      }

      event.preventDefault();
      app.isQuitting = true;

      if (!quitCleanupPromise) {
        let cleanupFailed = false;
        let rootExitFailure: unknown = null;
        quitCleanupPromise = application.cleanup()
          .catch((error: unknown) => {
            cleanupFailed = true;
            console.error('Application cleanup failed:', error);
          })
          .then(async () => {
            if (performanceMeasurementController === null) return;
            if (cleanupFailed) {
              throw new Error('performance root-exit gate cannot run after failed application cleanup');
            }
            const controllerAudit = await performanceMeasurementController.finalizeAtRootExit();
            if (controllerAudit === null) return;
            if (performanceRootExitAuditPath === null) {
              throw new Error('performance root-exit gate requires its fixture-owned audit path');
            }
            await writePerformanceRootExitAudit(performanceRootExitAuditPath, controllerAudit);
          })
          .catch((error: unknown) => {
            rootExitFailure = error;
            console.error('Performance root-exit gate failed:', error);
          })
          .finally(() => {
            quitCleanupComplete = true;
            if (rootExitFailure !== null) {
              app.exit(1);
              return;
            }
            app.quit();
          });
      }
    });
  }
}
