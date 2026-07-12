import { expect, test } from './fixtures/performance.fixture.js';
import {
  assertProductionBundleIsolation,
  loadPerformanceBuildManifest,
  readPerformanceDiagnostics
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

test.describe('instrumented diagnostics gate', () => {
  test.use({ performanceDiagnostics: false });

  test('does not expose renderer diagnostics without the explicit runtime marker', async ({ performanceLaunch }) => {
    expect(performanceLaunch.build.id).toBe('instrumented');
    await expect(
      readPerformanceDiagnostics(performanceLaunch.window, performanceLaunch.launchId)
    ).rejects.toThrow('performance renderer diagnostics reader is unavailable');
  });
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
  const diagnostics = await performanceLaunch.readPerformanceDiagnostics();

  expect(sourceSequences).toEqual(sourceSequences.map((_, index) => index + 1));
  expect(writes.some((write) => write.kind === 'shutdown-boundary' && write.boundary === 'before-release')).toBe(true);
  expect(writes.some((write) => write.kind === 'shutdown-boundary' && write.boundary === 'release-dispatched')).toBe(true);
  expect(diagnostics).toMatchObject({
    source: {
      sourceOpportunities: sourceSequences.length,
      reconciliation: {
        accountedOpportunities: sourceSequences.length,
        isConserved: true
      }
    },
    shutdown: {
      beforeRelease: {
        availability: 'observed',
        unavailableReason: null,
        launchId: performanceLaunch.launchId
      },
      releaseDispatched: {
        availability: 'observed',
        unavailableReason: null,
        launchId: performanceLaunch.launchId
      }
    }
  });
  expect(diagnostics.timingSamples['source-callback']).not.toHaveLength(0);

  await expect(performanceLaunch.resetPerformanceDiagnostics()).resolves.toEqual({ reset: true });
  const resetDiagnostics = await performanceLaunch.readPerformanceDiagnostics();
  expect(resetDiagnostics).toMatchObject({
    source: {
      sourceOpportunities: 0,
      reconciliation: {
        accountedOpportunities: 0,
        isConserved: true
      }
    }
  });
  expect(resetDiagnostics.timingSamples['source-callback']).toEqual([]);
});

test('the instrumented harness delimits a 600-callback renderer cohort after warmup', async ({
  performanceLaunch,
  performanceChromaticDevice
}) => {
  const streamPage = new StreamPage(performanceLaunch.window);
  await performanceChromaticDevice.connect({ testPattern: 'animated' });
  await streamPage.start();

  const warmupStartedAt = performance.now();
  await expect.poll(async () => {
    const writes = await performanceLaunch.readPerformanceControlProbe();
    const sourceOpportunityCount = writes.filter((write) => write.kind === 'source-opportunity').length;
    return sourceOpportunityCount >= 600 && performance.now() - warmupStartedAt >= 10_000;
  }, { timeout: 30000 }).toBe(true);

  await performanceLaunch.pausePerformanceCallbacks();
  await expect.poll(
    () => performanceLaunch.readPerformanceCallbackGate(),
    { timeout: 5000 }
  ).toMatchObject({ paused: true, heldCallbackCount: 1 });

  const warmupSourceOpportunityCount = (await performanceLaunch.readPerformanceControlProbe())
    .filter((write) => write.kind === 'source-opportunity').length;
  const warmupGate = await performanceLaunch.readPerformanceCallbackGate();
  await expect(performanceLaunch.resetPerformanceDiagnostics()).resolves.toEqual({ reset: true });
  await expect(performanceLaunch.pausePerformanceCallbacksAt(warmupGate.interceptedCallbackCount + 600))
    .resolves.toMatchObject({ pauseAtCallbackCount: warmupGate.interceptedCallbackCount + 600 });
  await performanceLaunch.resumePerformanceCallbacks();

  await expect.poll(
    () => performanceLaunch.readPerformanceCallbackGate(),
    { timeout: 20000 }
  ).toMatchObject({ paused: true, heldCallbackCount: 1, pauseAtCallbackCount: null });

  await streamPage.stop();
  const writes = await performanceLaunch.readPerformanceControlProbe();
  const cohortSourceWrites = writes
    .filter((write) => write.kind === 'source-opportunity')
    .slice(warmupSourceOpportunityCount);
  const diagnostics = await performanceLaunch.readPerformanceDiagnostics();

  expect(cohortSourceWrites).toHaveLength(600);
  expect(cohortSourceWrites.map((write) => write.sourceSequence)).toEqual(
    cohortSourceWrites.map((write, index) => cohortSourceWrites[0].sourceSequence + index)
  );
  expect(diagnostics).toMatchObject({
    source: {
      sourceOpportunities: 600,
      fatalDispositions: { total: 0 },
      reconciliation: { accountedOpportunities: 600, isConserved: true }
    },
    shutdown: {
      beforeRelease: { availability: 'observed', launchId: performanceLaunch.launchId },
      releaseDispatched: { availability: 'observed', launchId: performanceLaunch.launchId }
    }
  });
  expect(diagnostics.timingSamples['source-callback']).toHaveLength(600);
});
