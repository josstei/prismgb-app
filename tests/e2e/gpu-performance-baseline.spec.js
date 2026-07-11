import { expect, test } from './fixtures/performance.fixture.js';
import {
  assertProductionBundleIsolation,
  loadPerformanceBuildManifest
} from './helpers/gpu-performance-baseline.helper.js';

test('the production build excludes the harness-only performance surface', async () => {
  await assertProductionBundleIsolation(await loadPerformanceBuildManifest());
});

test('the instrumented harness echoes one marker identity through main and renderer', async ({ performanceLaunch }) => {
  expect(performanceLaunch.build.id).toBe('instrumented');
  expect(performanceLaunch.launchId).toMatch(/^[0-9a-f-]{36}$/);
  await expect(performanceLaunch.readPerformanceControlProbe()).resolves.toEqual([]);
});

test.describe('harness-control build', () => {
  test.use({ performanceVariant: 'harness-control' });

  test('installs the marker-bound control probe without instrumentation', async ({ performanceLaunch }) => {
    expect(performanceLaunch.build).toMatchObject({
      id: 'harness-control',
      harness: true,
      instrumentation: false
    });
    await expect(performanceLaunch.readPerformanceControlProbe()).resolves.toEqual([]);
  });
});
