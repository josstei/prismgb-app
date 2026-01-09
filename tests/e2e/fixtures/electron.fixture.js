/**
 * Electron Test Fixtures for Playwright
 *
 * Provides app and window fixtures for E2E testing.
 * Handles Electron app lifecycle and cleanup.
 */

import { test as base, _electron as electron } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../..');

/**
 * Create isolated user data directory for test isolation
 * @returns {string} Path to temp user data directory
 */
function createTestUserDataDir() {
  const tempDir = path.join(os.tmpdir(), `prismgb-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Extended test fixtures with Electron app support
 */
export const test = base.extend({
  /**
   * Electron app instance fixture
   * Launches the built app with test-mode flags
   */
  electronApp: async ({}, use) => {
    const userDataDir = createTestUserDataDir();

    // Launch Electron with test flags
    const app = await electron.launch({
      args: [
        path.join(projectRoot, 'dist/main/index.js'),
        '--test-mode',
        `--user-data-dir=${userDataDir}`,
        // GPU flags for headless/CI environments
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--in-process-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ELECTRON_IS_DEV: '0',
        // Force software rendering
        LIBGL_ALWAYS_SOFTWARE: '1',
        // Disable auto-updater in tests
        DISABLE_AUTO_UPDATER: 'true',
        // Disable crash reporter
        DISABLE_CRASH_REPORTER: 'true',
        // Disable tray icon in tests (may not exist in dist)
        DISABLE_TRAY: 'true',
      },
      timeout: 30000,
    });

    // Wait for app to be ready
    await app.evaluate(async ({ app: electronApp }) => {
      await electronApp.whenReady();
    });

    // Provide the app to the test
    await use(app);

    // Cleanup after test - force close with timeout
    try {
      await Promise.race([
        app.close(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Close timeout')), 5000)
        ),
      ]);
    } catch {
      // Force kill if close times out
      try {
        const pid = await app.evaluate(({ process }) => process.pid);
        process.kill(pid, 'SIGKILL');
      } catch {
        // Ignore kill errors
      }
    }

    // Remove temp user data directory
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  },

  /**
   * Main window fixture
   * Provides access to the app's main BrowserWindow
   */
  window: async ({ electronApp }, use) => {
    // Wait for the first window to open
    const window = await electronApp.firstWindow();

    // Wait for window to be ready (DOM loaded)
    await window.waitForLoadState('domcontentloaded');

    // Optionally wait for network idle (if app makes initial requests)
    // await window.waitForLoadState('networkidle');

    await use(window);
  },

  /**
   * Page fixture - alias for window for Playwright compatibility
   */
  page: async ({ window }, use) => {
    await use(window);
  },
});

/**
 * Re-export expect for convenience
 */
export { expect } from '@playwright/test';

/**
 * Helper to wait for app initialization
 * Waits for key DOM elements to be present AND event listeners to be attached
 *
 * @param {import('@playwright/test').Page} page - Playwright page
 * @param {Object} options - Wait options
 */
export async function waitForAppReady(page, options = {}) {
  const { timeout = 15000 } = options;

  // Wait for main container to be visible
  await page.waitForSelector('#streamContainer', { timeout, state: 'visible' });

  // Wait for status indicator (shows app is initialized)
  await page.waitForSelector('#statusIndicator', { timeout, state: 'attached' });

  // Wait for settings button to be ready (key interactive element)
  await page.waitForSelector('#settingsBtn', { timeout, state: 'attached' });

  // Wait for header to be fully rendered
  await page.waitForSelector('.header', { timeout, state: 'visible' });

  // Wait for app to complete initialization by checking for aria-expanded attribute
  // which is only set after the component binds its event listeners
  await page.waitForFunction(
    () => {
      const btn = document.getElementById('settingsBtn');
      return btn && btn.hasAttribute('aria-expanded');
    },
    { timeout }
  );

  // Small delay to ensure all event listeners are attached after DOM setup
  await page.waitForTimeout(300);
}

/**
 * Helper to take a named screenshot
 *
 * @param {import('@playwright/test').Page} page - Playwright page
 * @param {string} name - Screenshot name
 * @param {Object} options - Screenshot options
 */
export async function takeScreenshot(page, name, options = {}) {
  const screenshotPath = path.join(projectRoot, 'tests/e2e/screenshots', `${name}.png`);

  // Ensure screenshots directory exists
  const screenshotsDir = path.dirname(screenshotPath);
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  await page.screenshot({
    path: screenshotPath,
    fullPage: options.fullPage ?? false,
    ...options,
  });

  return screenshotPath;
}

/**
 * Helper to evaluate code in Electron main process
 *
 * @param {import('@playwright/test').ElectronApplication} app - Electron app
 * @param {Function} fn - Function to evaluate
 * @param {...any} args - Arguments to pass to the function
 */
export async function evaluateInMain(app, fn, ...args) {
  return app.evaluate(fn, ...args);
}

/**
 * Helper to get app info from main process
 *
 * @param {import('@playwright/test').ElectronApplication} app - Electron app
 * @returns {Promise<Object>} App info
 */
export async function getAppInfo(app) {
  return app.evaluate(async ({ app: electronApp }) => ({
    name: electronApp.getName(),
    version: electronApp.getVersion(),
    locale: electronApp.getLocale(),
    paths: {
      userData: electronApp.getPath('userData'),
      temp: electronApp.getPath('temp'),
      logs: electronApp.getPath('logs'),
    },
  }));
}

/**
 * IPC channel names for test injection
 * Must match src/shared/ipc/channels.json
 */
const IPC_CHANNELS = {
  DEVICE: {
    CONNECTED: 'device:connected',
    DISCONNECTED: 'device:disconnected',
  },
};

/**
 * Set up mock device status in main process
 * This allows getDeviceStatus IPC calls to return mock data
 *
 * @param {import('@playwright/test').ElectronApplication} app - Electron app
 * @param {Object} mockStatus - Mock status to return
 */
export async function setMockDeviceStatus(app, mockStatus) {
  await app.evaluate(
    async (_, status) => {
      // Store mock status globally for test mode
      global.__testMockDeviceStatus = status;
    },
    mockStatus
  );
}

/**
 * Clear mock device status
 *
 * @param {import('@playwright/test').ElectronApplication} app - Electron app
 */
export async function clearMockDeviceStatus(app) {
  await app.evaluate(async () => {
    delete global.__testMockDeviceStatus;
  });
}

/**
 * Inject a device connected event via main process IPC
 * This uses the real IPC path (webContents.send) to trigger deviceAPI callbacks
 *
 * Note: For full UI testing, you may also need to set mock device status
 * via setMockDeviceStatus() since the app's getDeviceStatus IPC call will
 * query the main process for current device state.
 *
 * @param {import('@playwright/test').ElectronApplication} app - Electron app
 * @param {Object} deviceInfo - Device information to inject
 */
export async function injectDeviceConnectedEvent(app, deviceInfo = {}) {
  const device = {
    vendorId: 0x374e,
    productId: 0x0101,
    deviceName: 'Chromatic',
    configName: 'Mod Retro Chromatic',
    serialNumber: 'MOCK-001',
    ...deviceInfo,
  };

  await app.evaluate(
    async ({ BrowserWindow }, payload) => {
      const windows = BrowserWindow.getAllWindows();
      const mainWindow = windows[0];
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send(payload.channel, payload.device);
      }
    },
    { channel: IPC_CHANNELS.DEVICE.CONNECTED, device }
  );
}

/**
 * Inject a device disconnected event via main process IPC
 *
 * @param {import('@playwright/test').ElectronApplication} app - Electron app
 */
export async function injectDeviceDisconnectedEvent(app) {
  await app.evaluate(
    async ({ BrowserWindow }, payload) => {
      const windows = BrowserWindow.getAllWindows();
      const mainWindow = windows[0];
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send(payload.channel);
      }
    },
    { channel: IPC_CHANNELS.DEVICE.DISCONNECTED }
  );
}
