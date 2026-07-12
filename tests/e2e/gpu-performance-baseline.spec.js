import { expect, test } from './fixtures/performance.fixture.js';
import {
  assertProductionBundleIsolation,
  loadPerformanceBuildManifest,
  readPerformanceDiagnostics
} from './helpers/gpu-performance-baseline.helper.js';
import { StreamPage } from './pages/stream.page.js';
import { loadBaselinePolicy } from '../../scripts/lib/performance-evidence.js';
import { writePerformanceWorkloadCapture } from '../../scripts/lib/performance-workload-capture.js';

const performancePolicy = loadBaselinePolicy().policy;
const { warmup: warmupLimits, window: windowLimits } = performancePolicy.performanceLimits;
const measurementWindowLimits = Object.freeze({
  minimumCallbacks: windowLimits.minimumCallbacks,
  minimumDurationMs: windowLimits.minimumSeconds * 1000,
  maximumCallbacks: windowLimits.maximumCallbacks,
  maximumDurationMs: windowLimits.maximumSeconds * 1000
});

function sourceOpportunityWrites(writes) {
  return writes.filter((write) => write.kind === 'source-opportunity');
}

function waitFor(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForWarmupEligibility(performanceLaunch) {
  const startedAt = performance.now();
  while (true) {
    const sourceWrites = sourceOpportunityWrites(await performanceLaunch.readPerformanceControlProbe());
    const elapsedMs = performance.now() - startedAt;
    if (
      sourceWrites.length >= warmupLimits.minimumCallbacks &&
      elapsedMs >= warmupLimits.minimumSeconds * 1000
    ) {
      return { sourceWrites, elapsedMs };
    }
    if (
      sourceWrites.length >= warmupLimits.maximumCallbacks ||
      elapsedMs >= warmupLimits.maximumSeconds * 1000
    ) {
      throw new Error(
        `performance workload warm-up did not become eligible before the ${warmupLimits.maximumSeconds}s/${warmupLimits.maximumCallbacks}-callback cap`
      );
    }
    await waitFor(100);
  }
}

async function waitForMeasurementWindowClosure(performanceLaunch) {
  const deadline = performance.now() + measurementWindowLimits.maximumDurationMs + 5000;
  while (true) {
    const gate = await performanceLaunch.readPerformanceCallbackGate();
    const measurementWindow = gate.measurementWindow;
    if (measurementWindow?.status === 'closed') return gate;
    if (measurementWindow?.status === 'failed') {
      throw new Error(`performance workload window closed at its ${measurementWindow.closureReason} cap`);
    }
    if (performance.now() >= deadline) {
      throw new Error('performance workload window did not close before its policy deadline');
    }
    await waitFor(100);
  }
}

test('the production build excludes the harness-only performance surface', async () => {
  await assertProductionBundleIsolation(await loadPerformanceBuildManifest());
});

test.describe('production sentinel fixture', () => {
  test.use({ performanceVariant: 'production', performanceDiagnostics: false });

  test('launches without the harness marker, control probe, or diagnostics bridge', async ({ performanceLaunch }) => {
    expect(performanceLaunch.build).toMatchObject({
      id: 'production',
      harness: false,
      instrumentation: false
    });
    await expect(performanceLaunch.window.evaluate(() => ({
      hasMarker: window.prismgbPerformanceLaunchMarker !== undefined,
      hasControlProbe: window.prismgbPerformanceControlProbe !== undefined,
      hasDiagnostics: window[Symbol.for('prismgb.performance.rendererDiagnostics')] !== undefined
    }))).resolves.toEqual({
      hasMarker: false,
      hasControlProbe: false,
      hasDiagnostics: false
    });
  });
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

test('the instrumented harness delimits the policy-bound renderer cohort after warmup', async ({
  performanceLaunch,
  performanceChromaticDevice
}) => {
  const streamPage = new StreamPage(performanceLaunch.window);
  expect(performancePolicy.performanceMetricPolicy.workloadId).toBe('phase0-animated-160x144-v1');
  expect(performanceChromaticDevice.fixture.display).toMatchObject({ nativeWidth: 160, nativeHeight: 144 });
  await performanceChromaticDevice.connect({ testPattern: 'animated' });
  await streamPage.start();

  const warmup = await waitForWarmupEligibility(performanceLaunch);
  expect(warmup.sourceWrites.length).toBeGreaterThanOrEqual(warmupLimits.minimumCallbacks);
  expect(warmup.sourceWrites.length).toBeLessThanOrEqual(warmupLimits.maximumCallbacks);
  expect(warmup.elapsedMs).toBeGreaterThanOrEqual(warmupLimits.minimumSeconds * 1000);
  expect(warmup.elapsedMs).toBeLessThanOrEqual(warmupLimits.maximumSeconds * 1000);

  await performanceLaunch.pausePerformanceCallbacks();
  await expect.poll(
    () => performanceLaunch.readPerformanceCallbackGate(),
    { timeout: 5000 }
  ).toMatchObject({ paused: true, heldCallbackCount: 1 });

  await expect(performanceLaunch.resetPerformanceControlProbe()).resolves.toEqual({ reset: true });
  await expect(performanceLaunch.resetPerformanceDiagnostics()).resolves.toEqual({ reset: true });
  await expect(performanceLaunch.armPerformanceCallbackWindow({
    ...measurementWindowLimits
  })).resolves.toMatchObject({
    paused: true,
    heldCallbackCount: 1,
    measurementWindow: {
      status: 'armed',
      ...measurementWindowLimits
    }
  });
  await performanceLaunch.resumePerformanceCallbacks();

  const closedGate = await waitForMeasurementWindowClosure(performanceLaunch);
  expect(closedGate).toMatchObject({
    paused: true,
    heldCallbackCount: 1,
    pauseAtCallbackCount: null,
    measurementWindow: {
      status: 'closed',
      closureReason: 'minimum-reached'
    }
  });

  await streamPage.stop();
  const writes = await performanceLaunch.readPerformanceControlProbe();
  const cohortSourceWrites = sourceOpportunityWrites(writes);
  const diagnostics = await performanceLaunch.readPerformanceDiagnostics();
  const measurementWindow = closedGate.measurementWindow;
  const sourceSequences = cohortSourceWrites.map((write) => write.sourceSequence);

  if (process.env.PRISMGB_PERFORMANCE_CAPTURE_OUTPUT) {
    await writePerformanceWorkloadCapture({
      outputDirectory: process.env.PRISMGB_PERFORMANCE_CAPTURE_OUTPUT,
      sourceSha: performanceLaunch.sourceSha,
      launchId: performanceLaunch.launchId,
      build: {
        id: performanceLaunch.build.id,
        harness: performanceLaunch.build.harness,
        instrumentation: performanceLaunch.build.instrumentation,
        bundleSha256: performanceLaunch.build.bundle.sha256
      },
      workload: {
        id: performancePolicy.performanceMetricPolicy.workloadId,
        pattern: 'animated',
        width: performanceChromaticDevice.fixture.display.nativeWidth,
        height: performanceChromaticDevice.fixture.display.nativeHeight,
        frameRate: performanceChromaticDevice.fixture.stream.defaultFrameRate
      },
      warmup: {
        sourceOpportunityCount: warmup.sourceWrites.length,
        elapsedMs: warmup.elapsedMs
      },
      window: {
        minimumCallbacks: measurementWindow.minimumCallbacks,
        minimumDurationMs: measurementWindow.minimumDurationMs,
        maximumCallbacks: measurementWindow.maximumCallbacks,
        maximumDurationMs: measurementWindow.maximumDurationMs,
        deliveredCallbackCount: measurementWindow.deliveredCallbackCount,
        startedAt: measurementWindow.startedAt,
        closedAt: measurementWindow.closedAt,
        closureReason: measurementWindow.closureReason
      },
      sourceSequences,
      controlWrites: writes,
      diagnostics
    });
  }

  expect(cohortSourceWrites.length).toBeGreaterThanOrEqual(measurementWindowLimits.minimumCallbacks);
  expect(cohortSourceWrites.length).toBeLessThanOrEqual(measurementWindowLimits.maximumCallbacks);
  expect(measurementWindow.deliveredCallbackCount).toBe(cohortSourceWrites.length);
  expect(measurementWindow.closedAt - measurementWindow.startedAt).toBeGreaterThanOrEqual(
    measurementWindowLimits.minimumDurationMs
  );
  expect(measurementWindow.closedAt - measurementWindow.startedAt).toBeLessThanOrEqual(
    measurementWindowLimits.maximumDurationMs
  );
  expect(sourceSequences).toEqual(
    cohortSourceWrites.map((write, index) => cohortSourceWrites[0].sourceSequence + index)
  );
  expect(diagnostics).toMatchObject({
    source: {
      sourceOpportunities: cohortSourceWrites.length,
      fatalDispositions: { total: 0 },
      reconciliation: { accountedOpportunities: cohortSourceWrites.length, isConserved: true }
    },
    shutdown: {
      beforeRelease: { availability: 'observed', launchId: performanceLaunch.launchId },
      releaseDispatched: { availability: 'observed', launchId: performanceLaunch.launchId }
    }
  });
  expect(diagnostics.timingSamples['source-callback']).toHaveLength(cohortSourceWrites.length);
});
