import { describe, expect, it } from 'vitest';
import { createPerformanceElectronLaunchOptions } from '../../e2e/fixtures/performance.fixture.js';

describe('createPerformanceElectronLaunchOptions', () => {
  const inheritedHarnessEnvironment = {
    PATH: '/bin',
    PRISMGB_PERF_MEASUREMENT: '1',
    PRISMGB_PERF_LAUNCH_ID: 'stale-launch',
    PRISMGB_E2E_DIAGNOSTICS: '1',
    PRISMGB_E2E_TEST_CONTROL: '1'
  };

  it('removes inherited harness state from a production sentinel launch', () => {
    const launch = createPerformanceElectronLaunchOptions({
      build: { directory: '/fixture/production', harness: false, instrumentation: false },
      launchId: null,
      userDataDirectory: '/tmp/production-profile',
      baseEnvironment: inheritedHarnessEnvironment,
      performanceDiagnostics: false
    });

    expect(launch.args).toEqual([
      '/fixture/production/main/index.js',
      '--test-mode',
      '--user-data-dir=/tmp/production-profile',
      '--no-sandbox',
      '--disable-dev-shm-usage'
    ]);
    expect(launch.env).toMatchObject({
      PATH: '/bin',
      NODE_ENV: 'test',
      ELECTRON_IS_DEV: '0',
      DISABLE_AUTO_UPDATER: 'true',
      DISABLE_CRASH_REPORTER: 'true',
      DISABLE_TRAY: 'true'
    });
    expect(launch.env).not.toHaveProperty('PRISMGB_PERF_MEASUREMENT');
    expect(launch.env).not.toHaveProperty('PRISMGB_PERF_LAUNCH_ID');
    expect(launch.env).not.toHaveProperty('PRISMGB_E2E_DIAGNOSTICS');
    expect(launch.env).not.toHaveProperty('PRISMGB_E2E_TEST_CONTROL');
  });

  it('adds the marker and harness-only environment for a harness launch', () => {
    const launch = createPerformanceElectronLaunchOptions({
      build: { directory: '/fixture/instrumented', harness: true, instrumentation: true },
      launchId: 'launch-42',
      userDataDirectory: '/tmp/harness-profile',
      baseEnvironment: { PATH: '/bin' },
      performanceDiagnostics: true
    });

    expect(launch.args).toContain('--prismgb-performance-launch-id=launch-42');
    expect(launch.env).toMatchObject({
      PRISMGB_PERF_MEASUREMENT: '1',
      PRISMGB_PERF_LAUNCH_ID: 'launch-42',
      PRISMGB_E2E_DIAGNOSTICS: '1',
      PRISMGB_E2E_TEST_CONTROL: '1'
    });
  });

  it('rejects a launch marker on a production sentinel', () => {
    expect(() => createPerformanceElectronLaunchOptions({
      build: { directory: '/fixture/production', harness: false, instrumentation: false },
      launchId: 'unexpected-marker',
      userDataDirectory: '/tmp/production-profile',
      performanceDiagnostics: false
    })).toThrow(/must not receive a launch ID/);
  });
});
