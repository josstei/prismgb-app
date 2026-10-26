/**
 * Main Entry Point
 * Composes the application and owns Electron process lifecycle
 */

import { app, BrowserWindow, dialog, Menu, type MenuItemConstructorOptions } from 'electron';
import { createMainRuntime, type MainRuntime } from './application/container.js';
import { MainLogger } from './infrastructure/logging/logger.factory.js';
import { getGpuPolicy, applyChromiumFlags, GPU_ENV_VARS } from './infrastructure/gpu/gpu-policy.js';
import { runApplicationSmoke } from './application/smoke-lifecycle.js';

const APP_NAME = 'PrismGB';

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

const smokeMode = process.argv.includes('--smoke-test');

// GPU flags must be applied before Electron becomes ready in every launch mode.
if (process.env[GPU_ENV_VARS.DISABLE_GPU] === '1') {
  app.disableHardwareAcceleration();
}
const gpuPolicy = getGpuPolicy();
applyChromiumFlags(app, gpuPolicy);
if (gpuPolicy.reason) {
  console.log(`[GPU Policy] WebGPU disabled: ${gpuPolicy.reason}`);
}
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128');

if (!app.requestSingleInstanceLock()) {
  console.log('Another instance is already running. Exiting.');
  if (smokeMode) app.exit(1);
  else app.quit();
} else {
  const rendererReady = Promise.withResolvers<void>();
  let runtime: MainRuntime | null = null;

  app.on('second-instance', () => {
    const win = runtime?.windowService.getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    if (process.platform === 'darwin') {
      Menu.setApplicationMenu(Menu.buildFromTemplate(createMacAppMenu(APP_NAME)));
    }
    try {
      runtime = createMainRuntime(new MainLogger(), { onRendererReady: () => rendererReady.resolve() });
      if (smokeMode) {
        await runApplicationSmoke(runtime, rendererReady.promise);
        console.log('PRISMGB_SMOKE_READY');
        app.exit(0);
        return;
      }
      await runtime.initialize();
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          runtime?.windowService.createWindow();
        }
      });
    } catch (error) {
      console.error('Application initialization failed:', error);
      if (smokeMode) {
        app.exit(1);
        return;
      }
      dialog.showErrorBox(
        'Initialization Error',
        `${APP_NAME} failed to start: ${error instanceof Error ? error.message : String(error)}`
      );
      app.quit();
    }
  }).catch((error: unknown) => {
    console.error('Electron startup failed:', error);
    app.exit(1);
  });

  // USB monitoring continues in the tray when the final window closes.
  app.on('window-all-closed', () => {});

  let quitCleanupPromise: Promise<void> | null = null;
  let quitCleanupComplete = false;
  app.on('before-quit', (event) => {
    if (quitCleanupComplete) return;
    event.preventDefault();
    app.isQuitting = true;
    quitCleanupPromise ??= Promise.resolve(runtime?.dispose())
      .catch((error: unknown) => console.error('Application cleanup failed:', error))
      .finally(() => {
        quitCleanupComplete = true;
        app.quit();
      });
  });
}
