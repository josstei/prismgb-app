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
import { ChromaticDeviceFixture } from './chromatic-device.fixture.js';
import { AppShellPage } from '../pages/app-shell.page.js';
import { SettingsMenuPage } from '../pages/settings.page.js';
import { StreamPage } from '../pages/stream.page.js';

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
   * Launches the built app with test-mode flags.
   *
   * Readiness is gated on `app.firstWindow()`, never `app.evaluate(() => app.whenReady())`.
   * The main window is created inside the `app.whenReady().then(...)` boot chain, so a
   * resolved `firstWindow()` already implies `whenReady()` completed — and it does so
   * without a main-process `evaluate` round-trip, which races the first window's initial
   * navigation and intermittently throws "Execution context was destroyed".
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
        // Enable explicit main-process test-control IPC port for device fixtures
        PRISMGB_E2E_TEST_CONTROL: '1',
      },
      timeout: 30000,
    });

    // Wait for app to be ready
    await app.firstWindow();

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

  appShell: async ({ window }, use) => {
    await use(new AppShellPage(window));
  },

  settingsMenu: async ({ window }, use) => {
    await use(new SettingsMenuPage(window));
  },

  streamPage: async ({ window }, use) => {
    await use(new StreamPage(window));
  },

  chromaticDevice: async ({ electronApp, window }, use) => {
    const chromaticDevice = new ChromaticDeviceFixture(electronApp, window);
    try {
      await use(chromaticDevice);
    } finally {
      await chromaticDevice.cleanup();
    }
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
  await new AppShellPage(page).waitForReady(options);
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

export {
  clearTestDeviceStatus,
  injectDeviceConnectedEvent,
  injectDeviceDisconnectedEvent,
  setTestDeviceStatus,
} from '../helpers/device-ipc.helper.js';
