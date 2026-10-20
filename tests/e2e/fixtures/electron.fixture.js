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

function createTestUserDataDir() {
  const tempDir = path.join(os.tmpdir(), `prismgb-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

export const test = base.extend({
  /**
   * Readiness is gated on `app.firstWindow()`, never `app.evaluate(() => app.whenReady())`.
   * The main window is created inside the `app.whenReady().then(...)` boot chain, so a
   * resolved `firstWindow()` already implies `whenReady()` completed — and it does so
   * without a main-process `evaluate` round-trip, which races the first window's initial
   * navigation and intermittently throws "Execution context was destroyed".
   */
  electronApp: async ({}, use) => {
    const userDataDir = createTestUserDataDir();

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
        // The tray icon asset may not exist in dist
        DISABLE_TRAY: 'true',
        // Enable explicit main-process test-control IPC port for device fixtures
        PRISMGB_E2E_TEST_CONTROL: '1',
      },
      timeout: 30000,
    });

    await app.firstWindow();
    await use(app);

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

    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  },

  window: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await use(window);
  },

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

export { expect } from '@playwright/test';
