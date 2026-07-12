import fs from 'node:fs/promises';
import {
  expect,
  openPerformanceLaunch,
  openPerformanceRendererMetricPairSession,
  test
} from './fixtures/performance.fixture.js';
import { ChromaticDeviceFixture } from './fixtures/chromatic-device.fixture.js';
import {
  assertProductionBundleIsolation,
  loadPerformanceBuildManifest,
  readPerformanceDiagnostics
} from './helpers/gpu-performance-baseline.helper.js';
import { StreamPage } from './pages/stream.page.js';
import { loadBaselinePolicy } from '../../scripts/lib/performance-evidence.js';
import { writePerformanceExternalMetricCapture } from '../../scripts/lib/performance-external-metric-capture.js';
import { writePerformanceMetricSessionCapture } from '../../scripts/lib/performance-metric-session-capture.js';
import {
  resolvePerformancePairPlanLaunch,
  validatePerformancePairPlan
} from '../../scripts/lib/performance-pair-plan.js';
import { writePerformanceSentinelCapture } from '../../scripts/lib/performance-sentinel-capture.js';
import { writePerformanceWorkloadCapture } from '../../scripts/lib/performance-workload-capture.js';

const performancePolicy = loadBaselinePolicy().policy;
const { warmup: warmupLimits, window: windowLimits } = performancePolicy.performanceLimits;
const measurementWindowLimits = Object.freeze({
  minimumCallbacks: windowLimits.minimumCallbacks,
  minimumDurationMs: windowLimits.minimumSeconds * 1000,
  maximumCallbacks: windowLimits.maximumCallbacks,
  maximumDurationMs: windowLimits.maximumSeconds * 1000
});
const performancePairPlanPath = process.env.PRISMGB_PERFORMANCE_PAIR_PLAN ?? null;
const usesPerformancePairPlan = performancePairPlanPath !== null;
const PERFORMANCE_LAUNCH_DEADLINE_MS = performancePolicy.performanceLimits.oneLaunchSeconds * 1000;

async function loadPerformancePairPlanFromEnvironment() {
  if (performancePairPlanPath === null) {
    throw new Error('performance pair execution requires PRISMGB_PERFORMANCE_PAIR_PLAN');
  }
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(performancePairPlanPath, 'utf8'));
  } catch (error) {
    throw new Error(`performance pair plan is not readable JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const plan = validatePerformancePairPlan(parsed);
  if (process.env.PRISMGB_PERFORMANCE_EXPERIMENT_ID !== plan.experimentId) {
    throw new Error('performance pair plan does not match the runner experiment identity');
  }
  return plan;
}

function createPairBinding(plan, pair, launch) {
  const binding = {
    experimentId: plan.experimentId,
    pairPlanChecksum: plan.checksum,
    metricSessionId: pair.metricSessionId,
    comparisonKind: pair.comparisonKind,
    backend: pair.backend,
    pairIndex: pair.pairIndex,
    attemptIndex: pair.attemptIndex,
    comparisonSide: launch.comparisonSide
  };
  const planned = resolvePerformancePairPlanLaunch(plan, binding);
  if (planned.launch.buildVariant !== launch.buildVariant) {
    throw new Error('performance pair launch does not match its immutable plan side');
  }
  return Object.freeze(binding);
}

async function runWithinPerformanceLaunchDeadline(label, operation) {
  let timeout;
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} exceeded the 300-second performance launch deadline`)), PERFORMANCE_LAUNCH_DEADLINE_MS);
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function sourceOpportunityWrites(writes) {
  return writes.filter((write) => write.kind === 'source-opportunity');
}

function waitFor(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function monotonicSeconds() {
  return performance.now() / 1000;
}

async function waitForMetricCaptureTarget(metricCapture) {
  const remainingMilliseconds = Math.max(0, (metricCapture.getNextSampleTargetAt() - monotonicSeconds()) * 1000);
  if (remainingMilliseconds > 0) await waitFor(remainingMilliseconds);
}

/**
 * Keeps raw OS metrics on their own external runner clock while a callback
 * gate owns the workload. The terminal closure is deliberately recorded only
 * after the sampler stops, so no in-window endpoint can be serialized after
 * the external closure boundary.
 */
async function collectExternalMetricTranscript({ metricCapture, executeWindow }) {
  let stopSampling = false;
  let samplingLoop;
  try {
    await metricCapture.beginWindow();
    samplingLoop = (async () => {
      while (!stopSampling) {
        await waitForMetricCaptureTarget(metricCapture);
        if (stopSampling) return;
        await metricCapture.sampleInWindow();
      }
    })();
    const result = await executeWindow();
    stopSampling = true;
    await samplingLoop;
    metricCapture.markTerminalClosure(monotonicSeconds());
    await waitForMetricCaptureTarget(metricCapture);
    await metricCapture.sampleTerminalClosure();
    return Object.freeze({
      result,
      transcript: Object.freeze({
        ...(await metricCapture.finalize()),
        adapterId: metricCapture.adapterId
      })
    });
  } catch (error) {
    stopSampling = true;
    await samplingLoop?.catch(() => {});
    await metricCapture.abort().catch(() => {});
    throw error;
  }
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

async function waitForExternalWarmupEligibility(performanceLaunch) {
  const startedAt = performance.now();
  while (true) {
    const gate = await performanceLaunch.readPerformanceCallbackGate();
    const elapsedMs = performance.now() - startedAt;
    if (
      gate.interceptedCallbackCount >= warmupLimits.minimumCallbacks
      && elapsedMs >= warmupLimits.minimumSeconds * 1000
    ) {
      return { callbackCount: gate.interceptedCallbackCount, elapsedMs };
    }
    if (
      gate.interceptedCallbackCount >= warmupLimits.maximumCallbacks
      || elapsedMs >= warmupLimits.maximumSeconds * 1000
    ) {
      throw new Error(
        `external sentinel warm-up did not become eligible before the ${warmupLimits.maximumSeconds}s/${warmupLimits.maximumCallbacks}-callback cap`
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

async function waitForExternalSentinelDrain(performanceLaunch) {
  const deadline = performance.now() + 5000;
  while (true) {
    const gate = await performanceLaunch.readPerformanceCallbackGate();
    if (gate.observations.outstandingWorkerFrames === 0) return gate;
    if (performance.now() >= deadline) {
      throw new Error('external sentinel backend work did not drain before the closure deadline');
    }
    await waitFor(25);
  }
}

function externalSentinelBackend(observations) {
  if (
    observations.canvasDraws.length > 0
    && observations.workerFramePosts.length === 0
    && observations.acknowledgements.length === 0
    && observations.errors.length === 0
  ) {
    return 'canvas2d';
  }
  if (
    observations.canvasDraws.length === 0
    && observations.workerFramePosts.length > 0
    && observations.errors.length === 0
  ) {
    return 'webgpu';
  }
  throw new Error('external sentinel observations do not identify one supported backend');
}

async function persistExternalSentinelCapture({ performanceLaunch, performanceChromaticDevice, warmup, gate, pair }) {
  if (!process.env.PRISMGB_PERFORMANCE_CAPTURE_OUTPUT) return;
  const measurementWindow = gate.measurementWindow;
  if (!measurementWindow || measurementWindow.terminalClosureEnd === null) {
    throw new Error('external sentinel capture requires a sealed measurement window');
  }
  const backend = externalSentinelBackend(gate.observations);
  await writePerformanceSentinelCapture({
    outputDirectory: process.env.PRISMGB_PERFORMANCE_CAPTURE_OUTPUT,
    sourceSha: performanceLaunch.sourceSha,
    runId: `external-sentinel:${performanceLaunch.externalExecutionId}`,
    externalExecutionId: performanceLaunch.externalExecutionId,
    observationBoundaryId: `external-sentinel-window:${performanceLaunch.externalExecutionId}`,
    pair,
    build: {
      id: performanceLaunch.build.id,
      harness: performanceLaunch.build.harness,
      instrumentation: performanceLaunch.build.instrumentation,
      bundleSha256: performanceLaunch.build.bundle.sha256
    },
    backend,
    workload: {
      id: performancePolicy.performanceMetricPolicy.workloadId,
      pattern: 'animated',
      width: performanceChromaticDevice.fixture.display.nativeWidth,
      height: performanceChromaticDevice.fixture.display.nativeHeight,
      frameRate: performanceChromaticDevice.fixture.stream.defaultFrameRate
    },
    warmup,
    window: {
      minimumCallbacks: measurementWindow.minimumCallbacks,
      minimumDurationMs: measurementWindow.minimumDurationMs,
      maximumCallbacks: measurementWindow.maximumCallbacks,
      maximumDurationMs: measurementWindow.maximumDurationMs,
      deliveredCallbackCount: measurementWindow.deliveredCallbackCount,
      startedAt: measurementWindow.startedAt,
      closedAt: measurementWindow.closedAt,
      terminalClosureEnd: measurementWindow.terminalClosureEnd,
      closureReason: measurementWindow.closureReason
    },
    observations: gate.observations
  });
}

async function persistExternalMetricCapture({ performanceLaunch, transcript, pair }) {
  if (!process.env.PRISMGB_PERFORMANCE_CAPTURE_OUTPUT) return;
  return writePerformanceExternalMetricCapture({
    outputDirectory: process.env.PRISMGB_PERFORMANCE_CAPTURE_OUTPUT,
    sourceSha: performanceLaunch.sourceSha,
    runId: `external-sentinel:${performanceLaunch.externalExecutionId}`,
    externalExecutionId: performanceLaunch.externalExecutionId,
    observationBoundaryId: `external-sentinel-window:${performanceLaunch.externalExecutionId}`,
    pair,
    build: {
      id: performanceLaunch.build.id,
      harness: performanceLaunch.build.harness,
      instrumentation: performanceLaunch.build.instrumentation,
      bundleSha256: performanceLaunch.build.bundle.sha256
    },
    adapterId: performanceLaunchMetricAdapterId(transcript),
    target: performanceLaunchMetricTarget(transcript),
    window: transcript.window,
    prime: transcript.prime,
    inWindowSamples: transcript.inWindowSamples,
    terminalSample: transcript.terminalSample
  });
}

function performanceLaunchMetricAdapterId(transcript) {
  if (transcript && typeof transcript === 'object' && typeof transcript.adapterId === 'string') {
    return transcript.adapterId;
  }
  if (!transcript || typeof transcript !== 'object' || !transcript.sessionClosure
    || typeof transcript.sessionClosure !== 'object' || typeof transcript.sessionClosure.adapterId !== 'string') {
    throw new Error('external metric transcript does not retain its adapter identity');
  }
  return transcript.sessionClosure.adapterId;
}

function performanceLaunchMetricTarget(transcript) {
  if (!transcript || typeof transcript !== 'object' || !transcript.transcript
    || typeof transcript.transcript !== 'object' || !transcript.transcript.target) {
    throw new Error('external metric transcript does not retain its attached target');
  }
  return transcript.transcript.target;
}

async function executeExternalSentinelMeasurement({ performanceLaunch, performanceChromaticDevice, metricCapture }) {
  const streamPage = new StreamPage(performanceLaunch.window);
  let streamStopped = false;
  try {
    await performanceChromaticDevice.connect({ testPattern: 'animated' });
    await streamPage.start();

    const warmup = await waitForExternalWarmupEligibility(performanceLaunch);
    await performanceLaunch.pausePerformanceCallbacks();
    await expect.poll(
      () => performanceLaunch.readPerformanceCallbackGate(),
      { timeout: 5000 }
    ).toMatchObject({ paused: true, heldCallbackCount: 1 });
    await performanceLaunch.resetPerformanceCallbacks();
    await performanceLaunch.armPerformanceCallbackWindow(measurementWindowLimits);
    const executeWindow = async () => {
      await performanceLaunch.resumePerformanceCallbacks();
      await waitForMeasurementWindowClosure(performanceLaunch);
      await waitForExternalSentinelDrain(performanceLaunch);
      return performanceLaunch.sealPerformanceCallbacks();
    };
    const measured = metricCapture
      ? await collectExternalMetricTranscript({ metricCapture, executeWindow })
      : Object.freeze({ result: await executeWindow(), transcript: null });
    const sealedGate = measured.result;
    expect(sealedGate).toMatchObject({
      paused: true,
      heldCallbackCount: 1,
      measurementWindow: {
        status: 'closed',
        closureReason: 'minimum-reached',
        terminalClosureEnd: expect.any(Number)
      },
      observations: {
        postPauseCanvasDrawCount: 0,
        callbackOverlapCount: 0,
        outstandingWorkerFrames: 0
      }
    });

    await streamPage.stop();
    streamStopped = true;
    return Object.freeze({ warmup, gate: sealedGate, transcript: measured.transcript });
  } finally {
    if (!streamStopped) await streamPage.stop().catch(() => {});
  }
}

async function executeInstrumentedMeasurement({ performanceLaunch, performanceChromaticDevice, metricCapture, pair }) {
  if (!performanceLaunch.build.instrumentation) {
    throw new Error('instrumented workload execution requires an instrumented performance build');
  }
  const streamPage = new StreamPage(performanceLaunch.window);
  let streamStopped = false;
  try {
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
    await expect(performanceLaunch.resetPerformanceCallbacks()).resolves.toMatchObject({
      paused: true,
      heldCallbackCount: 1,
      observations: {
        callbacks: [],
        canvasDraws: [],
        workerFramePosts: [],
        acknowledgements: [],
        errors: [],
        postPauseCanvasDrawCount: 0,
        outstandingWorkerFrames: 0
      }
    });
    await expect(performanceLaunch.armPerformanceCallbackWindow({ ...measurementWindowLimits })).resolves.toMatchObject({
      paused: true,
      heldCallbackCount: 1,
      measurementWindow: { status: 'armed', ...measurementWindowLimits }
    });
    const executeWindow = async () => {
      await performanceLaunch.resumePerformanceCallbacks();
      await waitForMeasurementWindowClosure(performanceLaunch);
      await waitForExternalSentinelDrain(performanceLaunch);
      return performanceLaunch.sealPerformanceCallbacks();
    };
    const measured = metricCapture
      ? await collectExternalMetricTranscript({ metricCapture, executeWindow })
      : Object.freeze({ result: await executeWindow(), transcript: null });
    const sealedGate = measured.result;
    expect(sealedGate).toMatchObject({
      paused: true,
      heldCallbackCount: 1,
      measurementWindow: { status: 'closed', closureReason: 'minimum-reached' },
      observations: {
        postPauseCanvasDrawCount: 0,
        callbackOverlapCount: 0,
        outstandingWorkerFrames: 0
      }
    });

    await streamPage.stop();
    streamStopped = true;
    const writes = await performanceLaunch.readPerformanceControlProbe();
    const cohortSourceWrites = sourceOpportunityWrites(writes);
    const diagnostics = await performanceLaunch.readPerformanceDiagnostics();
    const measurementWindow = sealedGate.measurementWindow;
    const sourceSequences = cohortSourceWrites.map((write) => write.sourceSequence);
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

    if (process.env.PRISMGB_PERFORMANCE_CAPTURE_OUTPUT) {
      if (!pair) throw new Error('instrumented workload capture requires its planned pair binding');
      await writePerformanceWorkloadCapture({
        outputDirectory: process.env.PRISMGB_PERFORMANCE_CAPTURE_OUTPUT,
        sourceSha: performanceLaunch.sourceSha,
        launchId: performanceLaunch.launchId,
        externalExecutionId: performanceLaunch.externalExecutionId,
        observationBoundaryId: `external-sentinel-window:${performanceLaunch.externalExecutionId}`,
        pair,
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
    return Object.freeze({ warmup, gate: sealedGate, transcript: measured.transcript });
  } finally {
    if (!streamStopped) await streamPage.stop().catch(() => {});
  }
}

async function executePlannedLaunch({ manifest, plan, pair, launch, metricSession }) {
  const binding = createPairBinding(plan, pair, launch);
  const performanceLaunch = await openPerformanceLaunch({
    loadedManifest: manifest,
    performanceVariant: launch.buildVariant,
    performanceDiagnostics: launch.buildVariant === 'instrumented'
  });
  let metricCapture = null;
  try {
    metricCapture = await metricSession.openSide({
      rendererPid: performanceLaunch.rendererPid,
      externalExecutionId: performanceLaunch.externalExecutionId
    });
    const persistPlannedMetricCapture = async (transcript) => {
      const written = await persistExternalMetricCapture({ performanceLaunch, transcript, pair: binding });
      if (!written) {
        throw new Error('planned performance launch did not persist its external metric capture');
      }
      return Object.freeze({
        sourceSha: performanceLaunch.sourceSha,
        pair: binding,
        buildVariant: launch.buildVariant,
        externalExecutionId: performanceLaunch.externalExecutionId,
        metricCapture: written.capture
      });
    };
    const performanceChromaticDevice = new ChromaticDeviceFixture(performanceLaunch.app, performanceLaunch.window);
    try {
      if (pair.comparisonKind === 'harness-overhead') {
        const measured = await executeExternalSentinelMeasurement({
          performanceLaunch,
          performanceChromaticDevice,
          metricCapture
        });
        await persistExternalSentinelCapture({
          performanceLaunch,
          performanceChromaticDevice,
          warmup: measured.warmup,
          gate: measured.gate,
          pair: binding
        });
        return persistPlannedMetricCapture(measured.transcript);
      }

      if (launch.buildVariant === 'instrumented') {
        const measured = await executeInstrumentedMeasurement({
          performanceLaunch,
          performanceChromaticDevice,
          metricCapture,
          pair: binding
        });
        return persistPlannedMetricCapture(measured.transcript);
      }

      const measured = await executeExternalSentinelMeasurement({
        performanceLaunch,
        performanceChromaticDevice,
        metricCapture
      });
      return persistPlannedMetricCapture(measured.transcript);
    } finally {
      await performanceChromaticDevice.cleanup();
    }
  } catch (error) {
    if (metricCapture) await metricCapture.abort().catch(() => {});
    throw error;
  } finally {
    await performanceLaunch.close();
  }
}

async function executePlannedPair({ manifest, plan, pair }) {
  const captureOutput = process.env.PRISMGB_PERFORMANCE_CAPTURE_OUTPUT;
  if (!captureOutput) {
    throw new Error('planned performance pair execution requires PRISMGB_PERFORMANCE_CAPTURE_OUTPUT');
  }
  const metricSession = await openPerformanceRendererMetricPairSession();
  let completed = false;
  try {
    const completedLaunches = [];
    for (const launch of pair.launches) {
      completedLaunches.push(await runWithinPerformanceLaunchDeadline(
        `${pair.comparisonKind} pair ${pair.pairIndex} side ${launch.comparisonSide}`,
        () => executePlannedLaunch({ manifest, plan, pair, launch, metricSession })
      ));
    }
    const closure = await metricSession.close();
    if (closure.adapterId !== metricSession.adapterId) {
      throw new Error('performance metric pair session closure changed its adapter identity');
    }
    const sourceSha = completedLaunches[0]?.sourceSha;
    if (typeof sourceSha !== 'string' || completedLaunches.length !== pair.launches.length
      || completedLaunches.some((launch) => launch.sourceSha !== sourceSha)) {
      throw new Error('performance metric pair sides do not retain one source identity');
    }
    await writePerformanceMetricSessionCapture({
      outputDirectory: captureOutput,
      sourceSha,
      pair: {
        experimentId: plan.experimentId,
        pairPlanChecksum: plan.checksum,
        metricSessionId: pair.metricSessionId,
        comparisonKind: pair.comparisonKind,
        backend: pair.backend,
        pairIndex: pair.pairIndex,
        attemptIndex: pair.attemptIndex
      },
      adapterId: metricSession.adapterId,
      sides: completedLaunches.map((launch) => ({
        comparisonSide: launch.pair.comparisonSide,
        buildVariant: launch.buildVariant,
        externalExecutionId: launch.externalExecutionId,
        metricCaptureChecksum: launch.metricCapture.checksum,
        target: launch.metricCapture.target
      })),
      closure: {
        adapterId: closure.adapterId,
        transitions: closure.transitions
      }
    });
    completed = true;
  } finally {
    if (!completed) await metricSession.abort().catch(() => {});
  }
}

if (!usesPerformancePairPlan) {
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
    expect(performanceLaunch.externalExecutionId).toMatch(/^[0-9a-f-]{36}$/);
    const metricTarget = await performanceLaunch.resolveRendererMetricTarget();
    expect(metricTarget.target).toMatchObject({
      pid: performanceLaunch.rendererPid,
      processIdentity: `renderer:${performanceLaunch.externalExecutionId}:${performanceLaunch.rendererPid}`
    });
    expect(['linux-procfs-v1', 'macos-ps-v1', 'windows-powershell-v1']).toContain(metricTarget.adapterId);
    await expect(performanceLaunch.window.evaluate(() => ({
      hasMarker: window.prismgbPerformanceLaunchMarker !== undefined,
      hasControlProbe: window.prismgbPerformanceControlProbe !== undefined,
      hasDiagnostics: window[Symbol.for('prismgb.performance.rendererDiagnostics')] !== undefined
    }))).resolves.toEqual({
      hasMarker: false,
      hasControlProbe: false,
      hasDiagnostics: false
    });
    await expect(performanceLaunch.readPerformanceCallbackGate()).resolves.toMatchObject({
      paused: false,
      observations: {
        callbacks: [],
        canvasDraws: [],
        workerFramePosts: [],
        acknowledgements: [],
        errors: []
      }
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

test.describe('harness-control external sentinel fixture', () => {
  test.use({ performanceVariant: 'harness-control', performanceDiagnostics: false });

  test('persists only externally observed callback and backend evidence', async ({
    performanceLaunch,
    performanceChromaticDevice
  }) => {
    const streamPage = new StreamPage(performanceLaunch.window);
    await performanceChromaticDevice.connect({ testPattern: 'animated' });
    await streamPage.start();

    const warmup = await waitForExternalWarmupEligibility(performanceLaunch);
    await performanceLaunch.pausePerformanceCallbacks();
    await expect.poll(
      () => performanceLaunch.readPerformanceCallbackGate(),
      { timeout: 5000 }
    ).toMatchObject({ paused: true, heldCallbackCount: 1 });
    await performanceLaunch.resetPerformanceCallbacks();
    await performanceLaunch.armPerformanceCallbackWindow(measurementWindowLimits);
    const metricCapture = process.env.PRISMGB_PERFORMANCE_CAPTURE_OUTPUT
      ? await performanceLaunch.openRendererMetricCapture()
      : null;
    const executeWindow = async () => {
      await performanceLaunch.resumePerformanceCallbacks();
      await waitForMeasurementWindowClosure(performanceLaunch);
      await waitForExternalSentinelDrain(performanceLaunch);
      return performanceLaunch.sealPerformanceCallbacks();
    };
    const measured = metricCapture
      ? await collectExternalMetricTranscript({ metricCapture, executeWindow })
      : Object.freeze({ result: await executeWindow(), transcript: null });
    const sealedGate = measured.result;
    expect(sealedGate).toMatchObject({
      paused: true,
      heldCallbackCount: 1,
      measurementWindow: {
        status: 'closed',
        closureReason: 'minimum-reached',
        terminalClosureEnd: expect.any(Number)
      },
      observations: {
        postPauseCanvasDrawCount: 0,
        callbackOverlapCount: 0,
        outstandingWorkerFrames: 0
      }
    });

    await streamPage.stop();
    await persistExternalSentinelCapture({
      performanceLaunch,
      performanceChromaticDevice,
      warmup,
      gate: sealedGate
    });
    if (measured.transcript !== null) {
      await persistExternalMetricCapture({ performanceLaunch, transcript: measured.transcript });
    }
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
  await expect(performanceLaunch.resetPerformanceCallbacks()).resolves.toMatchObject({
    paused: true,
    heldCallbackCount: 1,
    observations: {
      callbacks: [],
      canvasDraws: [],
      workerFramePosts: [],
      acknowledgements: [],
      errors: [],
      postPauseCanvasDrawCount: 0,
      outstandingWorkerFrames: 0
    }
  });
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
      externalExecutionId: performanceLaunch.externalExecutionId,
      observationBoundaryId: `external-sentinel-window:${performanceLaunch.externalExecutionId}`,
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
}

if (usesPerformancePairPlan) {
  test('executes every balanced planned pair with one shared external metric session', async () => {
    const plan = await loadPerformancePairPlanFromEnvironment();
    const manifest = await loadPerformanceBuildManifest();
    await assertProductionBundleIsolation(manifest);

    for (const pair of plan.pairs) {
      await executePlannedPair({ manifest, plan, pair });
    }
  });
}
