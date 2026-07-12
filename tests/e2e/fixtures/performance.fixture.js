import { test as base, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ChromaticDeviceFixture } from './chromatic-device.fixture.js';
import { AppShellPage } from '../pages/app-shell.page.js';
import {
  armPerformanceCallbackWindow,
  assertPerformanceController,
  createPerformanceLaunchId,
  getPerformanceBuild,
  installPerformanceCallbackGate,
  installPerformanceControlProbe,
  loadPerformanceBuildManifest,
  pausePerformanceCallbacks,
  pausePerformanceCallbacksAt,
  readPerformanceCallbackGate,
  removePerformanceControlProbe,
  removePerformanceCallbackGate,
  readPerformanceControlProbe,
  readPerformanceDiagnostics,
  resetPerformanceControlProbe,
  resumePerformanceCallbacks,
  resetPerformanceDiagnostics
} from '../helpers/gpu-performance-baseline.helper.js';

export const test = base.extend({
  performanceVariant: ['instrumented', { option: true }],
  performanceDiagnostics: [true, { option: true }],

  performanceLaunch: async ({ performanceVariant, performanceDiagnostics }, use) => {
    const loadedManifest = await loadPerformanceBuildManifest();
    const build = getPerformanceBuild(loadedManifest, performanceVariant);
    if (!build.harness) {
      throw new Error('performanceLaunch requires a harness build');
    }

    const launchId = createPerformanceLaunchId();
    const userDataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'prismgb-performance-'));
    const app = await electron.launch({
      args: [
        path.join(build.directory, 'main', 'index.js'),
        '--test-mode',
        `--prismgb-performance-launch-id=${launchId}`,
        `--user-data-dir=${userDataDirectory}`,
        '--no-sandbox',
        '--disable-dev-shm-usage'
      ],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ELECTRON_IS_DEV: '0',
        PRISMGB_PERF_MEASUREMENT: '1',
        PRISMGB_PERF_LAUNCH_ID: launchId,
        PRISMGB_E2E_DIAGNOSTICS: build.instrumentation && performanceDiagnostics ? '1' : '0',
        PRISMGB_E2E_TEST_CONTROL: '1',
        DISABLE_AUTO_UPDATER: 'true',
        DISABLE_CRASH_REPORTER: 'true',
        DISABLE_TRAY: 'true'
      },
      timeout: 60000
    });

    let window;
    try {
      window = await app.firstWindow();
      await new AppShellPage(window).waitForReady();
      const marker = await window.evaluate(() => window.prismgbPerformanceLaunchMarker);
      if (marker?.launchId !== launchId) {
        throw new Error('renderer marker does not match the launch controller identity');
      }
      await assertPerformanceController(app, launchId);
      await installPerformanceControlProbe(window, launchId);
      await installPerformanceCallbackGate(window, launchId);
      await use({
        app,
        window,
        launchId,
        sourceSha: loadedManifest.manifest.sourceSha,
        build,
        readPerformanceControlProbe: () => readPerformanceControlProbe(window),
        pausePerformanceCallbacks: () => pausePerformanceCallbacks(window, launchId),
        pausePerformanceCallbacksAt: (callbackCount) => pausePerformanceCallbacksAt(window, launchId, callbackCount),
        armPerformanceCallbackWindow: (limits) => armPerformanceCallbackWindow(window, launchId, limits),
        resumePerformanceCallbacks: () => resumePerformanceCallbacks(window, launchId),
        readPerformanceCallbackGate: () => readPerformanceCallbackGate(window, launchId),
        resetPerformanceControlProbe: () => resetPerformanceControlProbe(window),
        readPerformanceDiagnostics: () => {
          if (!build.instrumentation) {
            throw new Error('renderer diagnostics require an instrumented performance build');
          }
          return readPerformanceDiagnostics(window, launchId);
        },
        resetPerformanceDiagnostics: () => {
          if (!build.instrumentation) {
            throw new Error('renderer diagnostics require an instrumented performance build');
          }
          return resetPerformanceDiagnostics(window, launchId);
        }
      });
    } finally {
      if (window) {
        await removePerformanceCallbackGate(window, launchId).catch(() => {});
        await removePerformanceControlProbe(window).catch(() => {});
      }
      await app.close().catch(() => {});
      await fs.rm(userDataDirectory, { recursive: true, force: true });
    }
  },

  performanceChromaticDevice: async ({ performanceLaunch }, use) => {
    const chromaticDevice = new ChromaticDeviceFixture(performanceLaunch.app, performanceLaunch.window);
    try {
      await use(chromaticDevice);
    } finally {
      await chromaticDevice.cleanup();
    }
  }
});

export { expect } from '@playwright/test';
