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

/** Close normally, retaining a bounded and observable failure path. */
async function closeTestApp(app, child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    if (child.exitCode !== 0) throw new Error('Electron exited unexpectedly: ' + (child.signalCode ?? child.exitCode));
    return;
  }
  let timeout;
  try {
    await Promise.race([
      app.close(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Electron close timed out')), 5000);
      }),
    ]);
  } catch (error) {
    try { child.kill('SIGKILL'); } catch { /* Preserve the original close failure. */ }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extended test fixtures with Electron app support
 */
export const test = base.extend({
  // Each journey owns a fresh profile and real application. Window readiness is
  // awaited by the window fixture, avoiding a second firstWindow round-trip.
  electronApp: async ({}, use) => {
    const userDataDir = createTestUserDataDir();
    try {
      const app = await launchTestApp(userDataDir);
      const child = app.process();
      try { await use(app); }
      finally { await closeTestApp(app, child); }
    } finally {
      fs.rmSync(userDataDir, { recursive: true, force: true });
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
