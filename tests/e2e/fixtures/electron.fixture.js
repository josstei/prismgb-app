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

/** Launch the built application against a caller-owned profile. */
export function launchTestApp(userDataDir) {
  return electron.launch({
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

    const app = await launchTestApp(userDataDir);

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

  streamPage: async ({ window, electronApp }, use) => {
    await use(new StreamPage(window, electronApp));
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
