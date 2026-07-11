import { expect, test } from './fixtures/performance.fixture.js';
import {
  assertProductionBundleIsolation,
  loadPerformanceBuildManifest
} from './helpers/gpu-performance-baseline.helper.js';
import { StreamPage } from './pages/stream.page.js';

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

test('the instrumented harness records raw branch evidence for the animated Chromatic workload', async ({
  performanceLaunch,
  performanceChromaticDevice
}) => {
  const streamPage = new StreamPage(performanceLaunch.window);
  await performanceChromaticDevice.connect({ testPattern: 'animated' });
  await streamPage.start();

  await expect.poll(async () => {
    const writes = await performanceLaunch.readPerformanceControlProbe();
    return writes.filter((write) => write.kind === 'source-opportunity').length;
  }, { timeout: 10000 }).toBeGreaterThan(0);
  await expect.poll(async () => {
    const writes = await performanceLaunch.readPerformanceControlProbe();
    return writes.filter((write) => write.kind === 'frame-branch').length;
  }, { timeout: 10000 }).toBeGreaterThan(0);

  await streamPage.stop();
  const writes = await performanceLaunch.readPerformanceControlProbe();
  const sourceSequences = writes
    .filter((write) => write.kind === 'source-opportunity')
    .map((write) => write.sourceSequence);
  expect(sourceSequences).toEqual(sourceSequences.map((_, index) => index + 1));
  expect(writes.some((write) => write.kind === 'shutdown-boundary' && write.boundary === 'before-release')).toBe(true);
  expect(writes.some((write) => write.kind === 'shutdown-boundary' && write.boundary === 'release-dispatched')).toBe(true);
});
