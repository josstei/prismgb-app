import fs from 'node:fs/promises';
import path from 'node:path';
import {
  expect,
  openPerformanceLaunch,
  openPerformanceRendererMetricPairSession,
  test
} from './fixtures/performance.fixture.js';
import { ChromaticDeviceFixture } from './fixtures/chromatic-device.fixture.js';
import {
  assertProductionBundleIsolation,
  createAbortedPerformanceMetricSessionClose,
  executePerformancePairAttemptSequence,
  loadPerformanceBuildManifest,
  performanceBackendSettingValue,
  readPerformanceDiagnostics
} from './helpers/gpu-performance-baseline.helper.js';
import { StreamPage } from './pages/stream.page.js';
import { SettingsMenuPage } from './pages/settings.page.js';
import {
  collectExternalMetricTranscript,
  runOperationWithinDeadline
} from '../../scripts/lib/process-runner.js';
import { canonicalSha256, stableStringify } from '../../scripts/lib/baseline-report.js';
import { assessCapturedPerformancePairAttempt, loadBaselinePolicy } from '../../scripts/lib/performance-evidence.js';
import { createPerformanceExternalMetricCapture, writePerformanceExternalMetricCapture } from '../../scripts/lib/performance-external-metric-capture.js';
import { createPerformanceMetricSessionCapture, writePerformanceMetricSessionCapture } from '../../scripts/lib/performance-metric-session-capture.js';
import {
  resolvePerformancePairPlanLaunch,
  validatePerformancePairPlan
} from '../../scripts/lib/performance-pair-plan.js';
import { createPerformanceSentinelCapture, writePerformanceSentinelCapture } from '../../scripts/lib/performance-sentinel-capture.js';
import { createPerformanceWorkloadCapture, writePerformanceWorkloadCapture } from '../../scripts/lib/performance-workload-capture.js';
import {
  createPerformanceCaptureIndex,
  createPerformanceQualificationCapture,
  createPerformanceTransportCapture
} from '../../scripts/lib/performance-raw-capture-manifest.js';
import {
  createPerformanceRunJoinFromAuthority,
  validatePerformanceLaunchAuthority,
  validatePerformancePreLoopAuthority
} from '../../scripts/run-performance-baseline.js';

const performancePolicy = loadBaselinePolicy().policy;
const { warmup: warmupLimits, window: windowLimits } = performancePolicy.performanceLimits;
const measurementWindowLimits = Object.freeze({
  minimumCallbacks: windowLimits.minimumCallbacks,
  minimumDurationMs: windowLimits.minimumSeconds * 1000,
  maximumCallbacks: windowLimits.maximumCallbacks,
  maximumDurationMs: windowLimits.maximumSeconds * 1000
});
const performancePairPlanPath = process.env.PRISMGB_PERFORMANCE_PAIR_PLAN ?? null;
const performanceLaunchAuthorityPath = process.env.PRISMGB_PERFORMANCE_LAUNCH_AUTHORITY ?? null;
const performancePreLoopAuthorityPath = process.env.PRISMGB_PERFORMANCE_PRELOOP_AUTHORITY ?? null;
const performanceExecutionPhase = process.env.PRISMGB_PERFORMANCE_EXECUTION_PHASE ?? 'standalone';
if (!['standalone', 'pre-loop', 'pair-loop'].includes(performanceExecutionPhase)) {
  throw new Error('performance execution phase is invalid');
}
const PERFORMANCE_LAUNCH_DEADLINE_MS = performancePolicy.performanceLimits.oneLaunchSeconds * 1000;
const PERFORMANCE_RESOURCE_CLEANUP_PROOFS = new WeakSet();

function runnerMonotonicSeconds() {
  return Number(process.hrtime.bigint()) / 1_000_000_000;
}

function operationClosure(start, end) {
  return Object.freeze({
    closed: true,
    stdoutDrained: true,
    stderrDrained: true,
    inputClosed: true,
    exit: Object.freeze({ code: 0, durationMs: (end - start) * 1000 }),
    zeroSurvivors: true
  });
}

async function appendPerformanceLedgerEntries(entries) {
  const outputDirectory = process.env.PRISMGB_PERFORMANCE_CAPTURE_OUTPUT;
  if (!outputDirectory) throw new Error('semantic performance ledger requires a capture output directory');
  const ledgerPath = path.join(outputDirectory, 'performance-ledger.json');
  const ledger = JSON.parse(await fs.readFile(ledgerPath, 'utf8'));
  if (!Array.isArray(ledger) || !Array.isArray(entries) || entries.length === 0) {
    throw new Error('semantic performance ledger append requires nonempty arrays');
  }
  let previous = ledger.at(-1);
  for (const entry of entries) {
    if (!previous || entry.sequence !== previous.sequence + 1 || entry.start < previous.end || entry.end < entry.start) {
      throw new Error('semantic performance ledger append is not contiguous and monotonic');
    }
    ledger.push(entry);
    previous = entry;
  }
  const temporaryPath = `${ledgerPath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${stableStringify(ledger)}\n`, { encoding: 'utf8', flag: 'wx' });
  try {
    await fs.rename(temporaryPath, ledgerPath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function loadPerformancePairPlanFromEnvironment() {
  if (performancePairPlanPath === null || performanceLaunchAuthorityPath === null) {
    throw new Error('performance pair execution requires its pair plan and launch authority');
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
  let authorityInput;
  try {
    authorityInput = JSON.parse(await fs.readFile(performanceLaunchAuthorityPath, 'utf8'));
  } catch (error) {
    throw new Error(`performance launch authority is not readable JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const authority = validatePerformanceLaunchAuthority(authorityInput, plan);
  if (authority.experimentId !== plan.experimentId) {
    throw new Error('performance launch authority does not match the runner experiment identity');
  }
  return Object.freeze({ plan, authority });
}

async function loadPerformancePreLoopAuthorityFromEnvironment() {
  if (performancePreLoopAuthorityPath === null) {
    throw new Error('performance pre-loop execution requires its sealed authority');
  }
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(performancePreLoopAuthorityPath, 'utf8'));
  } catch (error) {
    throw new Error(`performance pre-loop authority is not readable JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const authority = validatePerformancePreLoopAuthority(parsed);
  if (authority.experimentId !== process.env.PRISMGB_PERFORMANCE_EXPERIMENT_ID ||
    authority.experimentRole !== process.env.PRISMGB_PERFORMANCE_ROLE) {
    throw new Error('performance pre-loop authority does not match the runner experiment');
  }
  return authority;
}

function createPairBinding(plan, pair, attempt, launch) {
  const binding = {
    experimentId: plan.experimentId,
    pairPlanChecksum: plan.checksum,
    metricSessionId: attempt.metricSessionId,
    comparisonKind: pair.comparisonKind,
    backend: pair.backend,
    pairIndex: pair.pairIndex,
    attemptIndex: attempt.attemptIndex,
    comparisonSide: launch.comparisonSide
  };
  const planned = resolvePerformancePairPlanLaunch(plan, binding);
  if (planned.launch.buildVariant !== launch.buildVariant) {
    throw new Error('performance pair launch does not match its immutable plan side');
  }
  return Object.freeze(binding);
}

function resolveLaunchAuthoritySlot(authority, binding) {
  const slot = authority.slots.find((candidate) => (
    candidate.metricSessionId === binding.metricSessionId &&
    candidate.comparisonSide === binding.comparisonSide
  ));
  if (!slot) throw new Error('performance launch has no sealed authority slot');
  return slot;
}

async function runWithinPerformanceLaunchDeadline(label, operation) {
  return runOperationWithinDeadline({
    label: `${label} performance launch`,
    operation,
    timeoutMilliseconds: PERFORMANCE_LAUNCH_DEADLINE_MS
  });
}

async function rethrowAfterCleanup(primaryError, cleanupOperations, label) {
  const errors = primaryError instanceof AggregateError ? [...primaryError.errors] : [primaryError];
  let cleanupFailed = false;
  for (const cleanup of cleanupOperations) {
    try {
      await cleanup();
    } catch (cleanupError) {
      cleanupFailed = true;
      errors.push(cleanupError);
    }
  }
  if (!cleanupFailed) {
    if (primaryError instanceof Error) {
      PERFORMANCE_RESOURCE_CLEANUP_PROOFS.add(primaryError);
    }
    throw primaryError;
  }
  throw new AggregateError(errors, `${label} and cleanup both failed`);
}

function performanceAbortReason(error, phase, backend) {
  if (phase === 'open') return 'metric-adapter-resource-owned';
  if (phase === 'reset-a' || phase === 'reset-b') return 'reset-failure';
  const message = error instanceof Error ? error.message : String(error);
  const candidates = [
    [/bitmap/i, 'bitmapCreationFailed'],
    [/enqueue/i, 'enqueueFailed'],
    [/submission.*(?:deadline|timeout)/i, 'submission-seal-timeout'],
    [/drain.*(?:deadline|timeout)/i, 'drain-timeout'],
    [/session.*inactive/i, 'sessionInactive'],
    [/worker.*not.*ready/i, 'workerNotReady'],
    [/environment/i, 'environment-drift'],
    [/membership/i, 'membership-failure'],
    [/pid.*identity/i, 'pid-identity-change'],
    [/driver.*inactive/i, 'driverInactive'],
    [/driver/i, 'driverFailed']
  ];
  const requested = candidates.find(([pattern]) => pattern.test(message))?.[1] ?? 'crash';
  const allowed = performancePolicy.performanceFailurePolicy.metricSessionAbortTuples.some((tuple) => (
    tuple.phase === phase && tuple.backend === backend && tuple.reason === requested
  ));
  return allowed ? requested : 'crash';
}

function hasVerifiedResourceCleanup(error) {
  if (error instanceof Error && PERFORMANCE_RESOURCE_CLEANUP_PROOFS.has(error)) return true;
  if (error instanceof Error && Number.isFinite(error.performanceLaunchCleanupEnd)) return true;
  return error instanceof AggregateError && error.errors.some(hasVerifiedResourceCleanup);
}

function performanceLaunchFailureEvidence(error) {
  if (error instanceof Error && error.performanceLaunchFailureEvidence) {
    return error.performanceLaunchFailureEvidence;
  }
  if (error instanceof AggregateError) {
    return error.errors.map(performanceLaunchFailureEvidence).find((entry) => entry !== null) ?? null;
  }
  return null;
}

function sourceOpportunityWrites(writes) {
  return writes.filter((write) => write.kind === 'source-opportunity');
}

function backendReadinessWrites(writes) {
  return writes.filter((write) => write.kind === 'backend-ready');
}

function requireSingleBackendReadinessWrite(writes, expectedBackend) {
  const readiness = backendReadinessWrites(writes);
  if (readiness.length !== 1 || readiness[0].requestedBackend !== expectedBackend
    || readiness[0].selectedBackend !== expectedBackend) {
    throw new Error(`performance control probe did not retain exactly one ${expectedBackend} backend readiness write`);
  }
  const identity = readiness[0].backendExecutionIdentity;
  if (expectedBackend === 'canvas2d' && identity !== null) {
    throw new Error('Canvas2D readiness must not retain a WebGPU execution identity');
  }
  if (expectedBackend === 'webgpu' && (
    !identity || identity.backend !== 'webgpu' || identity.driver !== 'webgpu-driver-v1'
    || identity.workerProtocol !== 'webgpu-worker-ready-v1'
    || identity.isFallbackAdapter !== false || identity.powerPreference !== 'low-power'
  )) {
    throw new Error('WebGPU readiness did not retain the strict selected-host execution identity');
  }
  return readiness[0];
}

async function applyPlannedPerformanceBackend(performanceLaunch, backend) {
  const settingsMenu = new SettingsMenuPage(performanceLaunch.window);
  await settingsMenu.setBooleanInMenu('animationSaver', performanceBackendSettingValue(backend));
}

function requireReleaseDispatchedControlBoundary(writes, launchId) {
  if (!Array.isArray(writes)) {
    throw new Error('performance control probe did not return its shutdown boundary writes');
  }
  const beforeReleaseIndex = writes.findIndex((write) => (
    write?.kind === 'shutdown-boundary'
    && write.boundary === 'before-release'
    && write.launchId === launchId
  ));
  const releaseDispatchedIndex = writes.findIndex((write) => (
    write?.kind === 'shutdown-boundary'
    && write.boundary === 'release-dispatched'
    && write.launchId === launchId
  ));
  if (beforeReleaseIndex === -1 || releaseDispatchedIndex === -1 || beforeReleaseIndex >= releaseDispatchedIndex) {
    throw new Error('performance control probe did not retain ordered before-release and release-dispatched boundaries');
  }
  const releaseDispatched = writes[releaseDispatchedIndex];
  if (!Number.isFinite(releaseDispatched.observedAt)) {
    throw new Error('performance control probe release-dispatched boundary has no observation timestamp');
  }
  return releaseDispatched;
}

function waitFor(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function recordPostReleaseSettle(performanceLaunch, measurement, writes) {
  if (measurement === null) return null;
  requireReleaseDispatchedControlBoundary(writes, performanceLaunch.launchId);
  const releaseDispatchedReceiptAt = performance.now();
  const { notBeforeFixtureAt } = await measurement.recordReleaseDispatched(releaseDispatchedReceiptAt);
  while (performance.now() < notBeforeFixtureAt) {
    await waitFor(Math.ceil(notBeforeFixtureAt - performance.now()));
  }
  const sampledFixtureAt = performance.now();
  await measurement.samplePostReleaseSettle(sampledFixtureAt);
  return Object.freeze({ releaseDispatchedReceiptAt, notBeforeFixtureAt, sampledFixtureAt });
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

const RUN_RAW_BINDING_KEYS = Object.freeze([
  'sourceSha', 'policyHash', 'experimentId', 'pairPlanChecksum', 'ledgerSequence',
  'experimentRole', 'runId', 'metricSessionId', 'comparisonKind', 'backend',
  'pairIndex', 'attemptIndex', 'comparisonSide', 'buildVariant',
  'externalExecutionId', 'observationBoundaryId'
]);

function bindRunRawRows(join, captureKind, groups) {
  const binding = Object.fromEntries(RUN_RAW_BINDING_KEYS.map((key) => [key, join[key]]));
  return groups.filter((group) => group.rows.length > 0).map((group) => ({
    rawKind: group.rawKind,
    rows: group.rows.map((row) => ({
      ...row,
      ...binding,
      scopeKind: 'run',
      scopeId: join.runId,
      captureKind,
      launchOrdinal: join.ordinal
    }))
  }));
}

function createSentinelRawKinds({ join, gate, controllerAudit, readinessWrites }) {
  const window = gate.measurementWindow;
  const events = [];
  for (const callback of gate.observations.callbacks) {
    events.push({
      observedAt: callback.observedAt,
      rawKind: 'sentinel-observation',
      row: {
        observationBoundaryId: join.observationBoundaryId,
        observationKind: 'callback',
        observedAt: callback.observedAt,
        callbackOrdinal: callback.callbackOrdinal,
        mediaTime: callback.mediaTime
      }
    });
  }
  for (const draw of gate.observations.canvasDraws) {
    events.push({
      observedAt: draw.observedAt,
      rawKind: 'backend-operation',
      row: { callbackOrdinal: draw.callbackOrdinal, operationId: 'canvas-draw-completed', observedAt: draw.observedAt }
    });
  }
  for (const post of gate.observations.workerFramePosts) {
    events.push({
      observedAt: post.observedAt,
      rawKind: 'backend-operation',
      row: { callbackOrdinal: post.callbackOrdinal, operationId: 'worker-frame-posted', observedAt: post.observedAt }
    });
  }
  const messages = [
    ...gate.observations.acknowledgements.map((message) => ({
      messageKind: 'acknowledgement', observedAt: message.observedAt,
      tagged: message.tagged === true, frameToken: message.frameToken ?? null,
      outcome: 'webgpu-queue-submit-completed'
    })),
    ...gate.observations.errors.map((message) => ({
      messageKind: 'error', observedAt: message.observedAt,
      tagged: message.tagged === true, frameToken: message.frameToken ?? null,
      outcome: message.kind
    }))
  ].sort((left, right) => left.observedAt - right.observedAt);
  messages.forEach((message, index) => events.push({
    observedAt: message.observedAt,
    rawKind: 'worker-message',
    row: { messageOrdinal: index + 1, clockDomain: 'external-performance-now-v1', ...message }
  }));
  events.push(
    {
      observedAt: window.startedAt,
      rawKind: 'sentinel-observation',
      row: {
        observationBoundaryId: join.observationBoundaryId,
        observationKind: 'boundary',
        observedAt: window.startedAt,
        boundary: 'window-start'
      }
    },
    {
      observedAt: window.closedAt,
      rawKind: 'sentinel-observation',
      row: {
        observationBoundaryId: join.observationBoundaryId,
        observationKind: 'boundary',
        observedAt: window.closedAt,
        boundary: 'window-close'
      }
    },
    {
      observedAt: window.terminalClosureEnd,
      rawKind: 'sentinel-observation',
      order: 1,
      row: {
        observationBoundaryId: join.observationBoundaryId,
        observationKind: 'pending',
        observedAt: window.terminalClosureEnd,
        pendingCount: gate.observations.outstandingWorkerFrames
      }
    },
    {
      observedAt: window.terminalClosureEnd,
      rawKind: 'sentinel-observation',
      order: 2,
      row: {
        observationBoundaryId: join.observationBoundaryId,
        observationKind: 'closure',
        observedAt: window.terminalClosureEnd,
        closureReason: window.closureReason
      }
    }
  );
  events.sort((left, right) => left.observedAt - right.observedAt || (left.order ?? 0) - (right.order ?? 0));
  const grouped = new Map([
    ['backend-operation', []], ['worker-message', []], ['sentinel-observation', []]
  ]);
  events.forEach((event, index) => grouped.get(event.rawKind).push({ captureOrdinal: index + 1, ...event.row }));
  return bindRunRawRows(join, 'sentinel', [
    { rawKind: 'backend-operation', rows: grouped.get('backend-operation') },
    { rawKind: 'worker-message', rows: grouped.get('worker-message') },
    { rawKind: 'sentinel-observation', rows: grouped.get('sentinel-observation') },
    { rawKind: 'controller-operation', rows: createControllerOperationRows(controllerAudit, readinessWrites) }
  ]);
}

function metricTranscriptReads(transcript) {
  return [
    { samplePhase: 'prime', read: transcript.prime },
    ...transcript.inWindowSamples.map((read) => ({ samplePhase: 'in-window', read })),
    { samplePhase: 'terminal-closure', read: transcript.terminalSample }
  ];
}

function createExternalMetricRawKinds({ join, transcript }) {
  const target = performanceLaunchMetricTarget(transcript);
  const adapterId = performanceLaunchMetricAdapterId(transcript);
  const reads = metricTranscriptReads(transcript);
  const processRows = [
    {
      observationOrdinal: 1,
      observedAt: reads[0].read.sample.readStart,
      observationKind: 'membership',
      observationSource: 'external-metric-adapter',
      adapterId,
      subjectKind: 'renderer',
      pid: target.pid,
      creationIdentity: target.creationIdentity,
      processIdentity: target.processIdentity,
      rawAdapterKind: adapterId,
      rawIdentity: reads[0].read.raw,
      rawMembership: { target },
      processClass: 'application-renderer',
      ownership: 'application-owned',
      alive: true
    }
  ];
  reads.forEach(({ read }, index) => processRows.push({
    observationOrdinal: index + 2,
    observedAt: (read.sample.readStart + read.sample.readEnd) / 2,
    observationKind: 'health',
    observationSource: 'external-metric-adapter',
    adapterId,
    subjectKind: 'renderer',
    pid: target.pid,
    creationIdentity: target.creationIdentity,
    processIdentity: target.processIdentity,
    rawAdapterKind: adapterId,
    rawIdentity: read.raw,
    rawHealth: read.raw,
    processClass: 'application-renderer',
    ownership: 'application-owned',
    alive: true,
    healthState: 'live'
  }));
  const cpuRows = reads.map(({ samplePhase, read }, index) => ({
    ordinal: index + 1,
    samplePhase,
    adapterId,
    pid: target.pid,
    creationIdentity: target.creationIdentity,
    processIdentity: target.processIdentity,
    readStart: read.sample.readStart,
    readEnd: read.sample.readEnd,
    counterQuantumSeconds: read.sample.counterQuantumSeconds,
    cumulativeCpuSeconds: read.sample.cumulativeCpuSeconds,
    workingSetMiB: read.sample.workingSetMiB,
    rawAdapterKind: adapterId,
    rawAdapterSample: {
      adapterSample: read.raw,
      readStart: read.sample.readStart,
      readEnd: read.sample.readEnd
    }
  }));
  return bindRunRawRows(join, 'external-metric', [
    { rawKind: 'process-observation', rows: processRows },
    { rawKind: 'cpu-sample', rows: cpuRows }
  ]);
}

function createControllerOperationRows(controllerAudit, writes = []) {
  const events = [
    ...(controllerAudit?.requestLog ?? []).map((entry) => ({
      sequence: entry.sequence,
      row: {
        operationKind: 'controller-lifecycle',
        clockDomain: 'electron-main',
        lifecyclePhase: entry.event,
        rawLifecycleEvent: entry,
        observedAt: entry.at,
        outcome: 'recorded'
      }
    })),
    ...(controllerAudit?.brokerSamples ?? []).map((sample) => ({
      sequence: sample.callSequence,
      row: {
        operationKind: 'broker-sample',
        clockDomain: 'electron-main',
        brokerSequence: sample.callSequence,
        sampleKind: sample.purpose,
        rawSample: sample,
        observedAt: sample.capturedAt
      }
    }))
  ].sort((left, right) => left.sequence - right.sequence);
  const rows = events.map(({ row }) => row);
  for (const write of writes) {
    rows.push({
      operationKind: 'control-write',
      clockDomain: 'renderer-performance-now-v1',
      writeKind: write.kind,
      rawWrite: write,
      writtenAt: write.observedAt,
      outcome: 'recorded'
    });
  }
  return rows.map((row, index) => ({ controlSequence: index + 1, ...row }));
}

function qualificationStageFromWrites(writes, backend, readinessOffset = 0) {
  const readiness = backendReadinessWrites(writes).filter((write) => write.selectedBackend === backend)[readinessOffset];
  if (!readiness) throw new Error(`qualification did not observe ${backend} readiness`);
  const sources = sourceOpportunityWrites(writes).filter((write) => write.observedAt >= readiness.observedAt);
  for (const source of sources) {
    if (backend === 'canvas2d') {
      const terminal = writes.find((write) => write.kind === 'frame-branch'
        && write.branch === 'canvas-disposition'
        && write.sourceSequence === source.sourceSequence
        && write.outcome === 'canvas-draw-completed');
      if (terminal) {
        return Object.freeze({
          backend,
          backendReadyObservedAt: readiness.observedAt,
          sourceSequence: source.sourceSequence,
          sourceObservedAt: source.observedAt,
          terminalFrame: Object.freeze({
            kind: 'canvas-draw-completed',
            observedAt: terminal.observedAt,
            outcome: terminal.outcome
          })
        });
      }
      continue;
    }
    const submitted = writes.find((write) => write.kind === 'frame-branch'
      && write.branch === 'worker-frame-submitted'
      && write.sourceSequence === source.sourceSequence);
    const acknowledged = submitted && writes.find((write) => write.kind === 'frame-branch'
      && write.branch === 'worker-frame-acknowledged'
      && write.sourceSequence === source.sourceSequence
      && write.frameToken === submitted.frameToken
      && write.outcome === 'webgpu-queue-submit-completed');
    if (submitted && acknowledged) {
      return Object.freeze({
        backend,
        backendReadyObservedAt: readiness.observedAt,
        sourceSequence: source.sourceSequence,
        sourceObservedAt: source.observedAt,
        terminalFrame: Object.freeze({
          kind: 'worker-frame-acknowledged',
          frameToken: submitted.frameToken,
          submittedAt: submitted.observedAt,
          acknowledgedAt: acknowledged.observedAt,
          outcome: acknowledged.outcome
        })
      });
    }
  }
  throw new Error(`qualification did not observe one terminal ${backend} frame after readiness`);
}

async function waitForQualificationStage(performanceLaunch, backend, readinessOffset = 0) {
  const deadline = performance.now() + 10_000;
  let lastError = null;
  while (performance.now() < deadline) {
    const writes = await performanceLaunch.readPerformanceControlProbe();
    try {
      return qualificationStageFromWrites(writes, backend, readinessOffset);
    } catch (error) {
      lastError = error;
      await waitFor(25);
    }
  }
  throw lastError ?? new Error(`qualification timed out waiting for ${backend} readiness`);
}

function preLoopRawBinding({ authority, slot, captureKind, operationId, observationBoundary = true }) {
  return {
    sourceSha: authority.sourceSha,
    policyHash: authority.policyHash,
    experimentId: authority.experimentId,
    experimentRole: authority.experimentRole,
    scopeKind: 'ledger-operation',
    scopeId: slot.ledgerSequence,
    captureKind,
    ledgerSequence: slot.ledgerSequence,
    operationId,
    ...(observationBoundary ? { observationBoundaryId: slot.observationBoundaryId } : {})
  };
}

function preLoopProcessRows({ authority, slot, captureKind, performanceLaunch, startedAt, closedAt, rootExit }) {
  const binding = preLoopRawBinding({
    authority,
    slot,
    captureKind,
    operationId: 'electron-harness-spawn',
    observationBoundary: false
  });
  const rawIdentity = { pid: performanceLaunch.rendererPid, creationIdentity: performanceLaunch.externalExecutionId };
  const processIdentity = `external:${performanceLaunch.rendererPid}:${performanceLaunch.externalExecutionId}`;
  return [{
    ...binding,
    observationOrdinal: 1,
    observedAt: startedAt,
    observationKind: 'membership',
    observationSource: 'external-electron-fixture',
    adapterId: 'external-membership-v1',
    subjectKind: 'renderer',
    pid: performanceLaunch.rendererPid,
    creationIdentity: performanceLaunch.externalExecutionId,
    processIdentity,
    rawAdapterKind: 'external-process-membership',
    rawIdentity,
    rawMembership: {
      spawnBoundary: { startedAt, launchId: performanceLaunch.launchId },
      rendererEvaluation: { externalExecutionId: performanceLaunch.externalExecutionId },
      ancestry: { browserRoot: rootExit.root },
      processGroup: null,
      job: null,
      pathIdentity: { buildVariant: performanceLaunch.build.id, bundleSha256: performanceLaunch.build.bundle.sha256 }
    },
    processClass: 'application-renderer',
    ownership: 'application-owned',
    alive: true
  }, {
    ...binding,
    observationOrdinal: 2,
    observedAt: startedAt,
    observationKind: 'health',
    observationSource: 'external-electron-fixture',
    adapterId: 'external-health-v1',
    subjectKind: 'renderer',
    pid: performanceLaunch.rendererPid,
    creationIdentity: performanceLaunch.externalExecutionId,
    processIdentity,
    rawAdapterKind: 'external-process-health',
    rawIdentity,
    rawHealth: { alive: true, status: 'ready', exitObservation: null },
    processClass: 'application-renderer',
    ownership: 'application-owned',
    alive: true,
    healthState: 'live'
  }, {
    ...binding,
    observationOrdinal: 3,
    observedAt: closedAt,
    observationKind: 'closure',
    observationSource: 'external-electron-fixture',
    adapterId: 'external-closure-v1',
    subjectKind: 'renderer',
    pid: performanceLaunch.rendererPid,
    creationIdentity: performanceLaunch.externalExecutionId,
    processIdentity,
    rawAdapterKind: 'external-process-closure',
    rawIdentity,
    rawClosure: { terminalStatus: 'closed', exitCode: 0, signal: null, zeroSurvivors: true },
    processClass: 'application-renderer',
    ownership: 'application-owned',
    alive: false,
    closureState: 'closed'
  }];
}

function preLoopEnvironmentRows({ authority, slot, captureKind, controllerAudit }) {
  const binding = preLoopRawBinding({
    authority,
    slot,
    captureKind,
    operationId: 'electron-harness-spawn'
  });
  return controllerAudit.environmentSamples.map((sample, index) => ({
    ...binding,
    source: 'electron-main',
    sourceSequence: index + 1,
    clockDomain: 'electron-main',
    runnerReceiptSequence: index + 1,
    observedAt: sample.capturedAt,
    observationKind: index === 0 ? 'initial-snapshot' : 'poll-snapshot',
    rawAdapterKind: 'electron-environment-v1',
    rawObservation: sample,
    ...(index === 0
      ? { staticIdentity: sample.currentState, dynamicState: sample.currentState }
      : { dynamicState: sample.currentState })
  }));
}

function preLoopControllerRows({ authority, slot, captureKind, controllerAudit, writes }) {
  const binding = preLoopRawBinding({
    authority,
    slot,
    captureKind,
    operationId: 'electron-harness-spawn'
  });
  return createControllerOperationRows(controllerAudit, writes).map((row) => ({ ...binding, ...row }));
}

function probeCleanup(controllerAudit, receiptAt) {
  return Object.freeze({
    controllerFatalReasons: controllerAudit.fatalReasons,
    listenersRemoved: controllerAudit.listenerEvidence.every((entry) => entry.removed === true),
    restorationOutcome: controllerAudit.restorationOutcome,
    applicationDescendantClosureEnd: receiptAt,
    brokerDisposeEnd: receiptAt,
    rootExitObservedAt: receiptAt,
    terminalClosureEnd: receiptAt
  });
}

function createWorkloadRawKinds({ join, writes, diagnostics, controllerAudit, rootExit }) {
  const instrumented = join.buildVariant === 'instrumented';
  const identity = {
    measurementWindowId: join.observationBoundaryId,
    measurementEpochId: instrumented ? join.launchId : null
  };
  const sourceWriteBySequence = new Map(writes
    .filter((write) => write.kind === 'source-opportunity')
    .map((write) => [write.sourceSequence, write]));
  const terminalWriteByToken = new Map(writes
    .filter((write) => write.kind === 'frame-branch' &&
      (write.branch === 'worker-frame-acknowledged' || write.branch === 'worker-terminal-error'))
    .map((write) => [write.frameToken, write]));
  const timingRows = [];
  const timingOrdinalByDomain = new Map();
  const pushTiming = (sample) => {
    const domain = `${sample.sourceSequence}\0${sample.metricId}`;
    const spanOrdinal = (timingOrdinalByDomain.get(domain) ?? 0) + 1;
    timingOrdinalByDomain.set(domain, spanOrdinal);
    const timingSpanId = `${join.runId}:timing:${timingRows.length + 1}`;
    timingRows.push({ ...sample, spanOrdinal, timingSpanId });
    return timingSpanId;
  };
  if (instrumented) {
    for (const sample of Object.values(diagnostics.timingSamples ?? {}).flatMap((samples) => samples)) {
      pushTiming({
        measurementWindowId: join.observationBoundaryId,
        measurementEpochId: sample.measurementEpochId,
        sourceSequence: sample.sourceSequence,
        diagnosticFrameId: sample.sourceSequence,
        metricId: sample.metricId,
        frameToken: sample.frameToken,
        unit: sample.unit,
        clock: sample.clock,
        startedAt: sample.startedAt,
        endedAt: sample.endedAt,
        outcome: sample.outcome
      });
    }
  } else {
    for (const write of writes) {
      if (write.kind !== 'frame-branch') continue;
      const source = sourceWriteBySequence.get(write.sourceSequence);
      if (write.branch === 'canvas-disposition' && write.outcome === 'canvas-draw-completed' && source) {
        pushTiming({
          measurementWindowId: join.observationBoundaryId,
          measurementEpochId: null,
          sourceSequence: write.sourceSequence,
          diagnosticFrameId: null,
          metricId: 'canvas-draw-call',
          frameToken: null,
          unit: 'milliseconds',
          clock: 'renderer-performance-now-v1',
          startedAt: source.observedAt,
          endedAt: write.observedAt,
          outcome: 'canvas-draw-completed'
        });
      }
      if (write.branch === 'worker-frame-submitted') {
        const terminal = terminalWriteByToken.get(write.frameToken);
        if (terminal?.branch === 'worker-frame-acknowledged' && terminal.outcome === 'webgpu-queue-submit-completed') {
          pushTiming({
            measurementWindowId: join.observationBoundaryId,
            measurementEpochId: null,
            sourceSequence: write.sourceSequence,
            diagnosticFrameId: null,
            metricId: 'webgpu-enqueue-to-ack',
            frameToken: write.frameToken,
            unit: 'milliseconds',
            clock: 'renderer-performance-now-v1',
            startedAt: write.observedAt,
            endedAt: terminal.observedAt,
            outcome: 'enqueue-acknowledged'
          });
        }
      }
    }
  }
  const timingSpanByOperation = new Map(timingRows
    .filter((row) => row.metricId === 'canvas-draw-call' || row.metricId === 'webgpu-enqueue-to-ack')
    .map((row) => [`${row.sourceSequence}\0${row.frameToken ?? 'null'}\0${row.metricId}`, row.timingSpanId]));
  const sourceRows = [];
  const backendRows = [];
  const workerRows = [];
  let captureOrdinal = 0;
  for (const write of writes) {
    const sourceIdentity = {
      launchId: join.launchId,
      ...identity,
      sourceSequence: write.sourceSequence,
      diagnosticFrameId: instrumented ? write.sourceSequence : null
    };
    if (write.kind === 'source-opportunity') {
      captureOrdinal += 1;
      sourceRows.push({
        captureOrdinal,
        eventKind: 'source-opportunity',
        ...sourceIdentity,
        mediaTime: write.mediaTime,
        sessionPresent: write.sessionPresent,
        sessionActive: write.sessionActive,
        duplicateMediaTime: write.duplicateMediaTime,
        readyState: write.readyState,
        hasCurrentData: write.hasCurrentData
      });
      continue;
    }
    if (write.kind === 'advisory-frame-disposition') {
      captureOrdinal += 1;
      sourceRows.push({
        captureOrdinal,
        eventKind: 'advisory-disposition',
        ...sourceIdentity,
        advisoryOutcome: write.outcome,
        advisoryFrameToken: write.frameToken
      });
      continue;
    }
    if (write.kind !== 'frame-branch') continue;
    if (write.branch === 'session-branch') {
      captureOrdinal += 1;
      sourceRows.push({
        captureOrdinal,
        eventKind: 'session-branch',
        ...sourceIdentity,
        workerPresent: write.workerPresent,
        workerReady: write.workerReady,
        outstandingFrameCount: write.outstandingFrameCount,
        outstandingFrameLimit: write.outstandingFrameLimit,
        bitmapOutcome: write.bitmapOutcome,
        canvasDrawOutcome: write.canvasDrawOutcome,
        framePostOutcome: write.framePostOutcome
      });
      continue;
    }
    if (write.branch === 'worker-frame-acknowledged' || write.branch === 'worker-terminal-error') {
      captureOrdinal += 1;
      workerRows.push({
        captureOrdinal,
        messageKind: write.branch === 'worker-frame-acknowledged' ? 'acknowledgement' : 'error',
        clockDomain: 'renderer-performance-now-v1',
        observedAt: write.observedAt,
        ...sourceIdentity,
        frameToken: write.frameToken,
        tagged: true,
        outcome: write.outcome ?? 'worker-terminal-error'
      });
      continue;
    }
    if (write.branch === 'canvas-disposition' || write.branch === 'worker-frame-submitted') {
      captureOrdinal += 1;
      const terminal = write.branch === 'worker-frame-submitted'
        ? terminalWriteByToken.get(write.frameToken)
        : null;
      const outcome = write.branch === 'canvas-disposition'
        ? write.outcome
        : terminal?.branch === 'worker-frame-acknowledged'
          ? terminal.outcome
          : 'failed';
      const metricId = write.branch === 'canvas-disposition' ? 'canvas-draw-call' : 'webgpu-enqueue-to-ack';
      backendRows.push({
        captureOrdinal,
        ...sourceIdentity,
        operationId: write.branch === 'canvas-disposition' ? 'canvas-draw-call' : 'webgpu-frame-submit',
        outcome,
        frameToken: write.frameToken ?? null,
        timingSpanId: timingSpanByOperation.get(
          `${write.sourceSequence}\0${write.frameToken ?? 'null'}\0${metricId}`
        ) ?? null
      });
    }
  }
  const firstBrokerSample = controllerAudit?.brokerSamples?.[0] ?? null;
  const rootMetric = Array.isArray(firstBrokerSample?.rawAppMetrics)
    ? firstBrokerSample.rawAppMetrics.find((metric) => metric?.type === 'Browser') ?? null
    : null;
  const processRows = rootExit === null || rootMetric === null ? [] : [
    {
      observationOrdinal: 1,
      observedAt: firstBrokerSample.capturedAt,
      observationKind: 'membership',
      observationSource: 'electron-app-metrics-broker',
      adapterId: 'electron-app-metrics-v1',
      subjectKind: 'browser-root',
      pid: rootMetric.pid,
      creationIdentity: String(rootMetric.creationTime),
      processIdentity: `browser:${join.executionId}:${rootMetric.pid}`,
      rawAdapterKind: 'electron-app-metrics-v1',
      rawIdentity: rootMetric,
      rawMembership: firstBrokerSample,
      processClass: 'application-root',
      ownership: 'application-owned',
      alive: true
    },
    {
      observationOrdinal: 2,
      observedAt: rootExit.rootExitObservedAt,
      observationKind: 'closure',
      observationSource: 'electron-root-exit',
      adapterId: 'electron-app-metrics-v1',
      subjectKind: 'browser-root',
      pid: rootExit.root.pid,
      creationIdentity: String(rootExit.root.creationTime),
      processIdentity: `browser:${join.executionId}:${rootExit.root.pid}`,
      rawAdapterKind: 'electron-app-metrics-v1',
      rawIdentity: rootExit.root,
      rawClosure: rootExit,
      processClass: 'application-root',
      ownership: 'application-owned',
      alive: false,
      closureState: 'closed'
    }
  ];
  const environmentRows = controllerAudit === null ? [] : controllerAudit.environmentSamples.map((sample, index) => ({
    source: 'electron-main',
    sourceSequence: index + 1,
    clockDomain: 'electron-main',
    runnerReceiptSequence: index + 1,
    observedAt: sample.capturedAt,
    observationKind: index === 0 ? 'initial-snapshot' : 'poll-snapshot',
    rawAdapterKind: 'electron-environment-v1',
    rawObservation: sample,
    ...(index === 0 ? { staticIdentity: sample.currentState, dynamicState: sample.currentState } : { dynamicState: sample.currentState })
  }));
  let runnerReceiptSequence = environmentRows.length;
  if (instrumented) {
    for (const observation of diagnostics.rendererHeap?.observations ?? []) {
      environmentRows.push({
        source: 'renderer-heap',
        sourceSequence: environmentRows.filter((row) => row.source === 'renderer-heap').length + 1,
        clockDomain: 'renderer-performance-now-v1',
        runnerReceiptSequence: ++runnerReceiptSequence,
        observedAt: observation.observedAt,
        observationKind: 'renderer-heap',
        rawAdapterKind: 'chromium-performance-memory-v1',
        rawObservation: observation,
        usedBytes: observation.usedBytes
      });
    }
    if (diagnostics.rendererHeap?.availability === 'unavailable') {
      environmentRows.push({
        source: 'renderer-heap',
        sourceSequence: 1,
        clockDomain: 'renderer-performance-now-v1',
        runnerReceiptSequence: ++runnerReceiptSequence,
        observedAt: 0,
        observationKind: 'renderer-heap-unavailable',
        rawAdapterKind: 'chromium-performance-memory-v1',
        rawObservation: diagnostics.rendererHeap,
        reason: diagnostics.rendererHeap.unavailableReason
      });
    }
  }
  const frameRequests = (diagnostics.allocationRequestProxies?.frameRequests ?? []).map((row) => ({ ...row }));
  const lifecycleRequests = (diagnostics.allocationRequestProxies?.lifecycleRequests ?? []).map((row) => ({
    ...row,
    executionId: join.executionId
  }));
  return bindRunRawRows(join, 'workload', [
    { rawKind: 'source-opportunity', rows: sourceRows },
    { rawKind: 'backend-operation', rows: backendRows },
    { rawKind: 'worker-message', rows: workerRows },
    { rawKind: 'process-observation', rows: processRows },
    { rawKind: 'environment-observation', rows: environmentRows },
    { rawKind: 'controller-operation', rows: createControllerOperationRows(controllerAudit, writes) },
    { rawKind: 'timing-span', rows: timingRows },
    { rawKind: 'frame-request', rows: frameRequests },
    { rawKind: 'lifecycle-request', rows: lifecycleRequests }
  ]);
}

function createMetricSessionRawKinds({ authority, pair, attempt, metricSession, closure, completedLaunches }) {
  const join = {
    metricSessionId: attempt.metricSessionId,
    comparisonKind: pair.comparisonKind,
    backend: pair.backend,
    pairIndex: pair.pairIndex,
    attemptIndex: attempt.attemptIndex,
    metricSessionOpenSequence: completedLaunches[0].join.ledgerSequence - 2
  };
  const rows = completedLaunches.flatMap((launch, index) => {
    const target = launch.metricTarget;
    const reads = metricTranscriptReads(launch.metricTranscript);
    const common = {
      sourceSha: authority.sourceSha,
      policyHash: authority.policyHash,
      experimentId: authority.experimentId,
      pairPlanChecksum: authority.pairPlanChecksum,
      experimentRole: authority.experimentRole,
      scopeKind: 'metric-session',
      scopeId: join.metricSessionId,
      captureKind: 'metric-session',
      ...join,
      observationSource: 'pair-metric-session',
      adapterId: metricSession.adapterId,
      subjectKind: 'renderer',
      pid: target.pid,
      creationIdentity: target.creationIdentity,
      processIdentity: target.processIdentity,
      rawAdapterKind: metricSession.adapterId,
      processClass: 'application-renderer',
      ownership: 'application-owned'
    };
    return [
      {
        ...common,
        observationOrdinal: (index * 2) + 1,
        observedAt: (reads[0].read.sample.readStart + reads[0].read.sample.readEnd) / 2,
        observationKind: 'membership',
        rawIdentity: reads[0].read.raw,
          rawMembership: { target, closure },
        alive: true
      },
      {
        ...common,
        observationOrdinal: (index * 2) + 2,
        observedAt: reads.at(-1).read.sample.readEnd,
        observationKind: 'closure',
        rawIdentity: reads.at(-1).read.raw,
          rawClosure: { target, closure },
        alive: false,
        closureState: 'detached'
      }
    ];
  });
  return [{ rawKind: 'process-observation', rows }];
}

function createExternalSentinelCapture({
  gate,
  join,
  controllerAudit,
  readinessWrites
}) {
  const measurementWindow = gate.measurementWindow;
  if (!measurementWindow || measurementWindow.terminalClosureEnd === null) {
    throw new Error('external sentinel capture requires a sealed measurement window');
  }
  if (externalSentinelBackend(gate.observations) !== join.backend) {
    throw new Error('external sentinel backend does not match its run join');
  }
  return createPerformanceSentinelCapture({
    experimentId: join.experimentId,
    sourceSha: join.sourceSha,
    policyHash: join.policyHash,
    captureKind: 'sentinel',
    join,
    rawKinds: createSentinelRawKinds({ join, gate, controllerAudit, readinessWrites })
  });
}

function createExternalMetricCapture({ transcript, join }) {
  return createPerformanceExternalMetricCapture({
    experimentId: join.experimentId,
    sourceSha: join.sourceSha,
    policyHash: join.policyHash,
    captureKind: 'external-metric',
    join,
    rawKinds: createExternalMetricRawKinds({ join, transcript })
  });
}

function createPlannedPerformanceWorkloadCapture({
  gate,
  writes,
  diagnostics,
  join,
  controllerAudit,
  rootExit
}) {
  const measurementWindow = gate.measurementWindow;
  if (!measurementWindow || measurementWindow.status !== 'closed') {
    throw new Error('harness workload capture requires a closed measurement window');
  }
  return createPerformanceWorkloadCapture({
    experimentId: join.experimentId,
    sourceSha: join.sourceSha,
    policyHash: join.policyHash,
    captureKind: 'workload',
    join,
    rawKinds: createWorkloadRawKinds({ join, writes, diagnostics, controllerAudit, rootExit })
  });
}

async function persistExternalSentinelCapture(input) {
  const outputDirectory = process.env.PRISMGB_PERFORMANCE_CAPTURE_OUTPUT;
  if (!outputDirectory) return null;
  const capture = createExternalSentinelCapture(input);
  return writePerformanceSentinelCapture({ outputDirectory, experimentId: capture.experimentId, sourceSha: capture.sourceSha, policyHash: capture.policyHash, captureKind: capture.captureKind, join: capture.join, rawKinds: capture.rawKinds });
}

async function persistExternalMetricCapture(input) {
  const outputDirectory = process.env.PRISMGB_PERFORMANCE_CAPTURE_OUTPUT;
  if (!outputDirectory) return null;
  const capture = createExternalMetricCapture(input);
  return writePerformanceExternalMetricCapture({ outputDirectory, experimentId: capture.experimentId, sourceSha: capture.sourceSha, policyHash: capture.policyHash, captureKind: capture.captureKind, join: capture.join, rawKinds: capture.rawKinds });
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

function requireHarnessPerformanceMeasurement(performanceLaunch) {
  if (!performanceLaunch.build.harness) return null;
  if (!performanceLaunch.performanceMeasurement) {
    throw new Error('planned harness launch did not acquire its measurement controller lease');
  }
  return performanceLaunch.performanceMeasurement;
}

async function beginPerformanceWarmup(performanceLaunch) {
  const measurement = requireHarnessPerformanceMeasurement(performanceLaunch);
  if (measurement !== null) await measurement.advance('warmup');
  return measurement;
}

async function beginPerformanceMeasurementWindow(performanceLaunch, instrumentation) {
  const measurement = requireHarnessPerformanceMeasurement(performanceLaunch);
  if (measurement !== null) {
    await measurement.beginMeasurement(instrumentation ? performanceLaunch.launchId : null);
  }
  return measurement;
}

function prepareHarnessPerformanceRootExit(performanceLaunch) {
  const measurement = requireHarnessPerformanceMeasurement(performanceLaunch);
  if (measurement === null) return null;
  return measurement.prepareRootExit();
}

async function executePreLoopHarnessProbe({ manifest, slot, qualification = false }) {
  const startedAt = runnerMonotonicSeconds();
  const performanceLaunch = await openPerformanceLaunch({
    loadedManifest: manifest,
    performanceVariant: 'harness-control',
    performanceDiagnostics: false,
    launchAuthoritySlot: slot
  });
  const measurement = requireHarnessPerformanceMeasurement(performanceLaunch);
  const chromaticDevice = new ChromaticDeviceFixture(performanceLaunch.app, performanceLaunch.window);
  const streamPage = new StreamPage(performanceLaunch.window);
  const settingsMenu = new SettingsMenuPage(performanceLaunch.window);
  let streamStarted = false;
  let closed = false;
  try {
    const detailedProbe = qualification ? await performanceLaunch.readPerformanceQualificationProbe() : null;
    if (detailedProbe !== null && (
      ['adapter-error', 'device-error'].includes(detailedProbe.webgpu?.status)
      || detailedProbe.transferControlToOffscreen?.status === 'unexpected-error'
    )) {
      throw new Error('selected-host qualification returned a fatal capability result');
    }
    await measurement.advance('warmup');
    const unavailableCapability = {
      'api-unavailable': 'webgpu-api-unavailable',
      'adapter-unavailable': 'webgpu-adapter-unavailable'
    }[detailedProbe?.webgpu?.status];
    const unavailableTransfer = {
      'api-unavailable': 'transfer-api-unavailable',
      'method-unavailable': 'transfer-method-unavailable',
      'allowlisted-not-supported': 'transfer-allowlisted-not-supported'
    }[detailedProbe?.transferControlToOffscreen?.status];
    const preWorkerBranch = unavailableCapability ?? unavailableTransfer ?? null;
    await settingsMenu.setBooleanInMenu('animationSaver', !qualification || preWorkerBranch !== null);
    await chromaticDevice.connect({ testPattern: 'animated' });
    await streamPage.start();
    streamStarted = true;

    const readinessStages = [];
    const firstBackend = qualification && preWorkerBranch === null ? 'webgpu' : 'canvas2d';
    readinessStages.push(await waitForQualificationStage(performanceLaunch, firstBackend));
    const firstReadiness = requireSingleBackendReadinessWrite(
      await performanceLaunch.readPerformanceControlProbe(),
      firstBackend
    );
    const fallbackAdapter = qualification
      && detailedProbe.webgpu.status === 'available'
      && detailedProbe.webgpu.isFallbackAdapter === true;
    if (fallbackAdapter) {
      if (stableStringify(firstReadiness.backendExecutionIdentity.adapterIdentity)
        !== stableStringify(detailedProbe.webgpu.adapterIdentity)
        || stableStringify(firstReadiness.backendExecutionIdentity.limits)
        !== stableStringify(detailedProbe.webgpu.limits)
        || firstReadiness.backendExecutionIdentity.isFallbackAdapter !== true) {
        throw new Error('fallback qualification READY identity differs from the live capability oracle');
      }
      await settingsMenu.setBooleanInMenu('animationSaver', true);
      readinessStages.push(await waitForQualificationStage(performanceLaunch, 'canvas2d'));
    } else if (qualification && preWorkerBranch === null) {
      if (stableStringify(firstReadiness.backendExecutionIdentity.adapterIdentity)
        !== stableStringify(detailedProbe.webgpu.adapterIdentity)
        || stableStringify(firstReadiness.backendExecutionIdentity.limits)
        !== stableStringify(detailedProbe.webgpu.limits)
        || firstReadiness.backendExecutionIdentity.isFallbackAdapter !== false
        || firstReadiness.backendExecutionIdentity.powerPreference !== 'low-power') {
        throw new Error('qualified WebGPU READY identity differs from the live capability oracle');
      }
    }

    await measurement.recordWarmupIdentity();
    await measurement.recordPrime();
    await measurement.beginMeasurement(null);
    await measurement.advance('submission-seal');
    await measurement.advance('drain');
    await measurement.advance('shutdown');
    await streamPage.stop();
    streamStarted = false;
    const writes = await performanceLaunch.readPerformanceControlProbe();
    await recordPostReleaseSettle(performanceLaunch, measurement, writes);
    await measurement.advance('application-descendant-closure');
    prepareHarnessPerformanceRootExit(performanceLaunch);
    const rootExitEvidence = await performanceLaunch.close();
    closed = true;
    if (!rootExitEvidence) throw new Error('pre-loop harness probe did not retain root-exit evidence');
    const closedAt = runnerMonotonicSeconds();
    const cleanup = probeCleanup(rootExitEvidence.controllerAudit, closedAt);
    return Object.freeze({
      startedAt,
      closedAt,
      performanceLaunch,
      detailedProbe,
      preWorkerBranch,
      fallbackAdapter,
      readinessEvidence: Object.freeze({ stages: Object.freeze(readinessStages) }),
      writes,
      controllerAudit: rootExitEvidence.controllerAudit,
      rootExit: rootExitEvidence.rootExit,
      cleanup
    });
  } catch (error) {
    const cleanups = [];
    if (streamStarted) cleanups.push(() => streamPage.stop());
    cleanups.push(() => chromaticDevice.cleanup());
    if (!closed) cleanups.push(() => performanceLaunch.close());
    await rethrowAfterCleanup(error, cleanups, qualification ? 'qualification probe' : 'Electron transport probe');
  } finally {
    await chromaticDevice.cleanup();
  }
}

function preLoopRawKinds({ authority, slot, captureKind, probe }) {
  return [{
    rawKind: 'process-observation',
    rows: preLoopProcessRows({
      authority,
      slot,
      captureKind,
      performanceLaunch: probe.performanceLaunch,
      startedAt: probe.startedAt,
      closedAt: probe.closedAt,
      rootExit: probe.rootExit
    })
  }, {
    rawKind: 'environment-observation',
    rows: preLoopEnvironmentRows({ authority, slot, captureKind, controllerAudit: probe.controllerAudit })
  }, {
    rawKind: 'controller-operation',
    rows: preLoopControllerRows({
      authority,
      slot,
      captureKind,
      controllerAudit: probe.controllerAudit,
      writes: probe.writes
    })
  }];
}

function qualificationCaptureBody({ authority, slot, probe }) {
  const capabilityResult = probe.detailedProbe.webgpu;
  const transferResult = probe.detailedProbe.transferControlToOffscreen;
  let selectionResult;
  let adapterIdentity = null;
  let fallbackState = null;
  let backendExecutionIdentity = null;
  if (probe.preWorkerBranch !== null) {
    selectionResult = {
      qualificationState: 'hardware-capability-unavailable',
      unavailabilityBranch: probe.preWorkerBranch,
      requestedBackend: 'webgpu',
      selectedBackend: 'canvas2d',
      observedBackend: 'canvas2d',
      selectionReason: probe.preWorkerBranch
    };
  } else {
    const webgpuReadiness = backendReadinessWrites(probe.writes).find((write) => write.selectedBackend === 'webgpu');
    if (!webgpuReadiness?.backendExecutionIdentity) {
      throw new Error('qualification capture has no actual WebGPU READY identity');
    }
    adapterIdentity = capabilityResult.adapterIdentity;
    if (probe.fallbackAdapter) {
      selectionResult = {
        qualificationState: 'hardware-capability-unavailable',
        unavailabilityBranch: 'worker-fallback-adapter',
        requestedBackend: 'webgpu',
        selectedBackend: 'canvas2d',
        observedBackend: 'webgpu',
        selectionReason: 'worker-fallback-adapter'
      };
      fallbackState = {
        isFallbackAdapter: true,
        branch: 'worker-fallback-adapter',
        observedBackendExecutionIdentity: webgpuReadiness.backendExecutionIdentity,
        fallbackBackend: 'canvas2d'
      };
    } else {
      selectionResult = {
        qualificationState: 'qualified-webgpu',
        unavailabilityBranch: 'none',
        requestedBackend: 'webgpu',
        selectedBackend: 'webgpu',
        observedBackend: 'webgpu',
        selectionReason: 'webgpu-selected'
      };
      fallbackState = { isFallbackAdapter: false, branch: null };
      backendExecutionIdentity = webgpuReadiness.backendExecutionIdentity;
    }
  }
  return Object.freeze({
    schemaVersion: 1,
    experimentId: authority.experimentId,
    ledgerSequence: slot.ledgerSequence,
    observationBoundaryId: slot.observationBoundaryId,
    sourceSha: authority.sourceSha,
    policyHash: authority.policyHash,
    buildVariant: 'harness-control',
    requestedBackend: 'webgpu',
    readinessEvidence: probe.readinessEvidence,
    capabilityResult,
    transferResult,
    selectionResult,
    adapterIdentity,
    fallbackState,
    backendExecutionIdentity,
    cleanup: probe.cleanup
  });
}

async function writeJsonExclusive(absolutePath, value) {
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, `${stableStringify(value)}\n`, { encoding: 'utf8', flag: 'wx' });
}

async function persistElectronTransportProbe({ authority, slot, probe }) {
  const outputDirectory = process.env.PRISMGB_PERFORMANCE_CAPTURE_OUTPUT;
  if (!outputDirectory) throw new Error('Electron transport probe requires a capture output directory');
  const capture = createPerformanceTransportCapture({
    experimentId: authority.experimentId,
    sourceSha: authority.sourceSha,
    policyHash: authority.policyHash,
    captureKind: 'transport',
    ledgerSequence: slot.ledgerSequence,
    operationId: 'electron-harness-spawn',
    observationBoundaryId: slot.observationBoundaryId,
    rawKinds: preLoopRawKinds({ authority, slot, captureKind: 'transport', probe })
  });
  const relativePath = 'experiment-evidence/transport/electron-harness.json';
  await writeJsonExclusive(path.join(outputDirectory, relativePath), capture);
  const genericRelativePath = 'experiment-evidence/transport/generic.json';
  let genericCapture;
  try {
    genericCapture = JSON.parse(await fs.readFile(path.join(outputDirectory, genericRelativePath), 'utf8'));
  } catch (error) {
    throw new Error(`generic transport capture is unavailable before Electron transport indexing: ${error instanceof Error ? error.message : String(error)}`);
  }
  const index = createPerformanceCaptureIndex({
    schemaVersion: 1,
    experimentId: authority.experimentId,
    captureKind: 'transport',
    entryCount: 2,
    entries: [{
      ledgerSequence: genericCapture.ledgerSequence,
      operationId: genericCapture.operationId,
      observationBoundaryId: genericCapture.observationBoundaryId,
      relativePath: genericRelativePath,
      checksum: genericCapture.checksum
    }, {
      ledgerSequence: slot.ledgerSequence,
      operationId: 'electron-harness-spawn',
      observationBoundaryId: slot.observationBoundaryId,
      relativePath,
      checksum: capture.checksum
    }]
  });
  await writeJsonExclusive(path.join(outputDirectory, 'performance-transport-captures.json'), index);
  return Object.freeze({ capture, index, relativePath });
}

async function persistQualificationProbe({ authority, slot, probe }) {
  const outputDirectory = process.env.PRISMGB_PERFORMANCE_CAPTURE_OUTPUT;
  if (!outputDirectory) throw new Error('qualification probe requires a capture output directory');
  const captureBody = qualificationCaptureBody({ authority, slot, probe });
  const capture = createPerformanceQualificationCapture({
    experimentId: authority.experimentId,
    sourceSha: authority.sourceSha,
    policyHash: authority.policyHash,
    captureKind: 'qualification',
    ledgerSequence: slot.ledgerSequence,
    observationBoundaryId: slot.observationBoundaryId,
    captureBody,
    captureBodyChecksum: canonicalSha256(captureBody),
    rawKinds: preLoopRawKinds({ authority, slot, captureKind: 'qualification', probe })
  });
  const relativePath = 'experiment-evidence/qualification.json';
  await writeJsonExclusive(path.join(outputDirectory, relativePath), capture);
  const index = createPerformanceCaptureIndex({
    schemaVersion: 1,
    experimentId: authority.experimentId,
    captureKind: 'qualification',
    entryCount: 1,
    entries: [{
      ledgerSequence: slot.ledgerSequence,
      operationId: 'electron-harness-spawn',
      observationBoundaryId: slot.observationBoundaryId,
      relativePath,
      checksum: capture.checksum
    }]
  });
  await writeJsonExclusive(path.join(outputDirectory, 'performance-qualification-captures.json'), index);
  return Object.freeze({ capture, index, relativePath });
}

function preLoopTransportCarriers(slot, transportId) {
  return {
    executionIdentity: Object.freeze({
      externalExecutionId: slot.externalExecutionId,
      executionId: slot.executionId
    }),
    markerIdentity: Object.freeze({
      operationMarker: slot.operationMarker,
      launchId: slot.launchId,
      preloadEchoLaunchId: slot.launchId,
      rendererEchoLaunchId: slot.launchId
    }),
    transportIdentity: Object.freeze({
      transportId,
      observationBoundaryId: slot.observationBoundaryId
    })
  };
}

function electronTransportLedgerEntry(slot, probe) {
  return Object.freeze({
    sequence: slot.ledgerSequence,
    operationId: 'electron-harness-spawn',
    start: probe.startedAt,
    end: probe.closedAt,
    purpose: 'transport-probe',
    outcome: 'completed',
    ...preLoopTransportCarriers(slot, `electron-transport:${slot.executionId}`),
    applicationDescendantClosureEnd: probe.closedAt
  });
}

function qualificationLedgerEntry({ authority, slot, probe, capture }) {
  return Object.freeze({
    sequence: slot.ledgerSequence,
    operationId: 'electron-harness-spawn',
    start: probe.startedAt,
    end: probe.closedAt,
    purpose: 'qualification-probe',
    outcome: 'completed',
    experimentId: authority.experimentId,
    policyHash: authority.policyHash,
    buildVariant: slot.buildVariant,
    observationBoundaryId: slot.observationBoundaryId,
    operationMarker: slot.operationMarker,
    launchId: slot.launchId,
    executionId: slot.executionId,
    externalExecutionId: slot.externalExecutionId,
    ...preLoopTransportCarriers(slot, `qualification:${slot.executionId}`),
    capabilityEvidence: Object.freeze({ captureBodyChecksum: capture.captureBodyChecksum }),
    readinessEvidence: probe.readinessEvidence,
    ownership: Object.freeze({ class: 'application-owned' }),
    cleanup: probe.cleanup,
    applicationDescendantClosureEnd: probe.closedAt
  });
}

async function executeExternalSentinelMeasurement({
  performanceLaunch,
  performanceChromaticDevice,
  openMetricCapture,
  collectMetricTranscript = collectExternalMetricTranscript,
  expectedBackend
}) {
  const streamPage = new StreamPage(performanceLaunch.window);
  const measurement = await beginPerformanceWarmup(performanceLaunch);
  let streamStopped = false;
  try {
    await performanceChromaticDevice.connect({ testPattern: 'animated' });
    await streamPage.start();

    const warmup = await waitForExternalWarmupEligibility(performanceLaunch);
    if (measurement !== null) await measurement.recordWarmupIdentity();
    await performanceLaunch.pausePerformanceCallbacks();
    await expect.poll(
      () => performanceLaunch.readPerformanceCallbackGate(),
      { timeout: 5000 }
    ).toMatchObject({ paused: true, heldCallbackCount: 1 });
    await performanceLaunch.resetPerformanceCallbacks();
    await performanceLaunch.armPerformanceCallbackWindow(measurementWindowLimits);
    const metricCapture = await openMetricCapture();
    if (measurement !== null) await measurement.recordPrime();
    await beginPerformanceMeasurementWindow(performanceLaunch, false);
    const executeWindow = async () => {
      await performanceLaunch.resumePerformanceCallbacks();
      await waitForMeasurementWindowClosure(performanceLaunch);
      if (measurement !== null) await measurement.advance('submission-seal');
      await waitForExternalSentinelDrain(performanceLaunch);
      if (measurement !== null) await measurement.advance('drain');
      return performanceLaunch.sealPerformanceCallbacks();
    };
    const measured = await collectMetricTranscript({ metricCapture, executeWindow });
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

    if (measurement !== null) await measurement.advance('shutdown');
    await streamPage.stop();
    streamStopped = true;
    let readinessWrites = [];
    if (measurement !== null) {
      const writes = await performanceLaunch.readPerformanceControlProbe();
      readinessWrites = [requireSingleBackendReadinessWrite(
        writes,
        expectedBackend
      )];
      await recordPostReleaseSettle(performanceLaunch, measurement, writes);
      await measurement.advance('application-descendant-closure');
    }
    return Object.freeze({ warmup, gate: sealedGate, transcript: measured.transcript, readinessWrites });
  } finally {
    if (!streamStopped) await streamPage.stop().catch(() => {});
  }
}

async function executeHarnessWorkloadMeasurement({
  performanceLaunch,
  performanceChromaticDevice,
  openMetricCapture,
  collectMetricTranscript = collectExternalMetricTranscript,
  instrumentation,
  expectedBackend
}) {
  if (!performanceLaunch.build.harness || performanceLaunch.build.instrumentation !== instrumentation) {
    const expectedBuild = instrumentation ? 'instrumented' : 'harness-control';
    throw new Error(`${expectedBuild} workload execution requires its matching harness performance build`);
  }
  const streamPage = new StreamPage(performanceLaunch.window);
  const measurement = await beginPerformanceWarmup(performanceLaunch);
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
    await measurement.recordWarmupIdentity();

    await performanceLaunch.pausePerformanceCallbacks();
    await expect.poll(
      () => performanceLaunch.readPerformanceCallbackGate(),
      { timeout: 5000 }
    ).toMatchObject({ paused: true, heldCallbackCount: 1 });
    const readinessWrites = [requireSingleBackendReadinessWrite(
      await performanceLaunch.readPerformanceControlProbe(),
      expectedBackend
    )];
    await expect(performanceLaunch.resetPerformanceControlProbe()).resolves.toEqual({ reset: true });
    if (instrumentation) {
      await expect(performanceLaunch.resetPerformanceDiagnostics()).resolves.toEqual({ reset: true });
    }
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
    const metricCapture = await openMetricCapture();
    await measurement.recordPrime();
    await beginPerformanceMeasurementWindow(performanceLaunch, instrumentation);
    const executeWindow = async () => {
      await performanceLaunch.resumePerformanceCallbacks();
      await waitForMeasurementWindowClosure(performanceLaunch);
      if (instrumentation) await measurement.closeNumericEpoch();
      await measurement.advance('submission-seal');
      await waitForExternalSentinelDrain(performanceLaunch);
      await measurement.advance('drain');
      return performanceLaunch.sealPerformanceCallbacks();
    };
    const measured = await collectMetricTranscript({ metricCapture, executeWindow });
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

    await measurement.advance('shutdown');
    await streamPage.stop();
    streamStopped = true;
    const measurementWrites = await performanceLaunch.readPerformanceControlProbe();
    await recordPostReleaseSettle(performanceLaunch, measurement, measurementWrites);
    await measurement.advance('application-descendant-closure');
    const cohortSourceWrites = sourceOpportunityWrites(measurementWrites);
    const diagnostics = instrumentation ? await performanceLaunch.readPerformanceDiagnostics() : {};
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
    if (instrumentation) {
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
    }
    return Object.freeze({
      warmup,
      gate: sealedGate,
      transcript: measured.transcript,
      writes: [...readinessWrites, ...measurementWrites],
      sourceSequences,
      diagnostics
    });
  } finally {
    if (!streamStopped) await streamPage.stop().catch(() => {});
  }
}

async function executeInstrumentedMeasurement(options) {
  return executeHarnessWorkloadMeasurement({ ...options, instrumentation: true });
}

async function executeHarnessControlMeasurement(options) {
  return executeHarnessWorkloadMeasurement({ ...options, instrumentation: false });
}

async function executePlannedLaunch({
  manifest,
  plan,
  authority,
  pair,
  attempt,
  launch,
  launchAuthoritySlot,
  ledgerSequence,
  ordinal,
  operationStart,
  metricSession,
  deadlineSignal
}) {
  if (!deadlineSignal || typeof deadlineSignal !== 'object'
    || typeof deadlineSignal.addEventListener !== 'function'
    || typeof deadlineSignal.removeEventListener !== 'function'
    || typeof deadlineSignal.aborted !== 'boolean') {
    throw new Error('planned performance launch requires a deadline cancellation signal');
  }
  const binding = createPairBinding(plan, pair, attempt, launch);
  const performanceLaunch = await openPerformanceLaunch({
    loadedManifest: manifest,
    performanceVariant: launch.buildVariant,
    performanceDiagnostics: launch.buildVariant === 'instrumented',
    launchAuthoritySlot
  });
  const join = createPerformanceRunJoinFromAuthority({
    authority,
    slot: launchAuthoritySlot,
    ledgerSequence,
    ordinal,
    runtimeIdentity: launch.buildVariant === 'production'
      ? {
        externalExecutionId: performanceLaunch.externalExecutionId,
        browserPid: performanceLaunch.browserPid,
        browserCreationTime: performanceLaunch.browserCreationTime
      }
      : {
        externalExecutionId: performanceLaunch.externalExecutionId,
        launchId: performanceLaunch.launchId,
        executionId: performanceLaunch.executionId
      }
  });
  let metricCapture = null;
  let metricCaptureOwnedByLaunch = false;
  let performanceLaunchClosed = false;
  let performanceLaunchClosureEnd = null;
  let performanceLaunchCloseOutcome = null;
  const requestPerformanceLaunchClose = () => {
    performanceLaunchCloseOutcome ??= Promise.resolve()
      .then(() => performanceLaunch.close())
      .then(
        (value) => {
          performanceLaunchClosed = true;
          performanceLaunchClosureEnd ??= runnerMonotonicSeconds();
          return Object.freeze({ status: 'fulfilled', value });
        },
        (error) => Object.freeze({ status: 'rejected', error })
      );
    return performanceLaunchCloseOutcome;
  };
  const closePerformanceLaunch = async () => {
    const outcome = await requestPerformanceLaunchClose();
    if (outcome.status === 'rejected') throw outcome.error;
    performanceLaunchClosureEnd ??= runnerMonotonicSeconds();
    return outcome.value;
  };
  const throwIfDeadlineCancelled = () => {
    if (!deadlineSignal.aborted) return;
    throw deadlineSignal.reason instanceof Error
      ? deadlineSignal.reason
      : new Error('planned performance launch was cancelled at its deadline');
  };
  const closeAtDeadline = () => {
    requestPerformanceLaunchClose();
  };
  deadlineSignal.addEventListener('abort', closeAtDeadline, { once: true });
  try {
    if (deadlineSignal.aborted) {
      await closePerformanceLaunch();
      throwIfDeadlineCancelled();
    }
    await applyPlannedPerformanceBackend(performanceLaunch, pair.backend);
    throwIfDeadlineCancelled();
    const openMetricCapture = async () => {
      if (metricCapture !== null) throw new Error('planned performance launch opened its metric capture more than once');
      metricCapture = await metricSession.openSide({
        rendererPid: performanceLaunch.rendererPid,
        externalExecutionId: performanceLaunch.externalExecutionId
      });
      metricCaptureOwnedByLaunch = true;
      return metricCapture;
    };
    const collectMetricTranscript = (options) => {
      if (!metricCaptureOwnedByLaunch || options.metricCapture !== metricCapture) {
        throw new Error('planned performance launch cannot transfer an unowned metric capture');
      }
      return collectExternalMetricTranscript({
        ...options,
        onOwnershipAccepted: () => { metricCaptureOwnedByLaunch = false; }
      });
    };
    const createPlannedMetricCapture = (transcript, operationEvidence, measurementCapture) => {
      const externalMetricCapture = createExternalMetricCapture({ transcript, join });
      return Object.freeze({
        sourceSha: performanceLaunch.sourceSha,
        pair: binding,
        buildVariant: launch.buildVariant,
        externalExecutionId: performanceLaunch.externalExecutionId,
        join,
        operationEvidence,
        metricCapture: externalMetricCapture,
        measurementCapture,
        metricTarget: performanceLaunchMetricTarget(transcript),
        metricTranscript: transcript
      });
    };
    const performanceChromaticDevice = new ChromaticDeviceFixture(performanceLaunch.app, performanceLaunch.window);
    let measured;
    let measurementKind;
    try {
      if (pair.comparisonKind === 'harness-overhead') {
        measured = await executeExternalSentinelMeasurement({
          performanceLaunch,
          performanceChromaticDevice,
          openMetricCapture,
          collectMetricTranscript,
          expectedBackend: pair.backend
        });
        measurementKind = 'harness-overhead';
      } else if (pair.comparisonKind === 'instrumentation-overhead') {
        const executeMeasurement = launch.buildVariant === 'instrumented'
          ? executeInstrumentedMeasurement
          : launch.buildVariant === 'harness-control'
            ? executeHarnessControlMeasurement
            : null;
        if (!executeMeasurement) {
          throw new Error(`instrumentation pair launch uses an unsupported build variant: ${launch.buildVariant}`);
        }
        measured = await executeMeasurement({
          performanceLaunch,
          performanceChromaticDevice,
          openMetricCapture,
          collectMetricTranscript,
          expectedBackend: pair.backend
        });
        measurementKind = 'instrumentation-overhead';
      } else {
        throw new Error(`unsupported planned performance comparison kind: ${pair.comparisonKind}`);
      }
    } finally {
      await performanceChromaticDevice.cleanup();
    }
    throwIfDeadlineCancelled();
    prepareHarnessPerformanceRootExit(performanceLaunch);
    const rootExitEvidence = await closePerformanceLaunch();
    const applicationDescendantClosureEnd = runnerMonotonicSeconds();
    throwIfDeadlineCancelled();
    if (performanceLaunch.build.harness && rootExitEvidence === null) {
      throw new Error('planned harness launch did not retain root-exit closure evidence');
    }
    const controllerAudit = rootExitEvidence?.controllerAudit ?? null;
    const rootExit = rootExitEvidence?.rootExit ?? null;
    const measurementCapture = measurementKind === 'harness-overhead'
      ? createExternalSentinelCapture({
        gate: measured.gate,
        join,
        controllerAudit,
        readinessWrites: measured.readinessWrites
      })
      : createPlannedPerformanceWorkloadCapture({
        gate: measured.gate,
        writes: measured.writes,
        diagnostics: measured.diagnostics,
        join,
        controllerAudit,
        rootExit
      });
    throwIfDeadlineCancelled();
    return createPlannedMetricCapture(measured.transcript, Object.freeze({
      applicationDescendantClosureEnd,
      frameSourceSequences: measurementKind === 'instrumentation-overhead'
        && performanceLaunch.build.instrumentation
        ? Object.freeze([...measured.sourceSequences])
        : null
    }), measurementCapture);
  } catch (error) {
    const cleanupOperations = [];
    if (!performanceLaunchClosed) {
      cleanupOperations.push(() => closePerformanceLaunch());
    }
    if (metricCaptureOwnedByLaunch && metricCapture !== null) {
      cleanupOperations.push(() => metricCapture.abort());
    }
    try {
      await rethrowAfterCleanup(error, cleanupOperations, 'planned performance launch');
    } catch (failure) {
      const applicationDescendantClosureEnd = performanceLaunchClosureEnd;
      if (failure instanceof Error && applicationDescendantClosureEnd !== null) {
        Object.defineProperty(failure, 'performanceLaunchFailureEvidence', {
          value: Object.freeze({ join, operationStart, applicationDescendantClosureEnd }),
          enumerable: false
        });
      }
      throw failure;
    }
  } finally {
    deadlineSignal.removeEventListener('abort', closeAtDeadline);
  }
}

function measurementLaunchLedgerEntry({ completedLaunch, start }) {
  const { join, operationEvidence } = completedLaunch;
  const end = operationEvidence.applicationDescendantClosureEnd;
  const harness = join.buildVariant !== 'production';
  return Object.freeze({
    sequence: join.ledgerSequence,
    operationId: harness ? 'electron-harness-spawn' : 'production-sentinel-spawn',
    start,
    end,
    purpose: 'measurement-side',
    ...join,
    ownership: Object.freeze({ class: 'application-owned' }),
    cleanup: operationClosure(start, end),
    outcome: 'completed',
    applicationDescendantClosureEnd: end,
    ...(join.buildVariant === 'instrumented'
      ? {
        measurementEpochId: join.launchId,
        frameSourceSequences: operationEvidence.frameSourceSequences
      }
      : {})
  });
}

function failedMeasurementLaunchLedgerEntry({ failureEvidence, phase, reason }) {
  const { join, operationStart, applicationDescendantClosureEnd } = failureEvidence;
  if (!join || !Number.isFinite(operationStart) || !Number.isFinite(applicationDescendantClosureEnd)
    || applicationDescendantClosureEnd < operationStart) {
    throw new Error('failed performance launch has no actual application cleanup boundary');
  }
  const harness = join.buildVariant !== 'production';
  return Object.freeze({
    sequence: join.ledgerSequence,
    operationId: harness ? 'electron-harness-spawn' : 'production-sentinel-spawn',
    start: operationStart,
    end: applicationDescendantClosureEnd,
    purpose: 'measurement-side',
    ...join,
    ownership: Object.freeze({ class: 'application-owned' }),
    cleanup: operationClosure(operationStart, applicationDescendantClosureEnd),
    outcome: 'failed',
    abortReason: Object.freeze({ phase, backend: join.backend, reason }),
    lastBoundary: phase === 'side-a' ? 'reset-a' : 'reset-b',
    applicationDescendantClosureEnd
  });
}

function captureWriterInput(outputDirectory, capture) {
  return { outputDirectory, experimentId: capture.experimentId, sourceSha: capture.sourceSha, policyHash: capture.policyHash, captureKind: capture.captureKind, join: capture.join, rawKinds: capture.rawKinds };
}

async function persistCompletedAttemptCaptures(outputDirectory, completedLaunches, metricSessionCapture) {
  for (const completedLaunch of completedLaunches) {
    const measurementWriter = completedLaunch.measurementCapture.captureKind === 'sentinel'
      ? writePerformanceSentinelCapture
      : completedLaunch.measurementCapture.captureKind === 'workload'
        ? writePerformanceWorkloadCapture
        : null;
    if (measurementWriter === null) throw new Error('completed performance attempt has an unsupported measurement capture');
    await measurementWriter(captureWriterInput(outputDirectory, completedLaunch.measurementCapture));
    await writePerformanceExternalMetricCapture(captureWriterInput(outputDirectory, completedLaunch.metricCapture));
  }
  await writePerformanceMetricSessionCapture(captureWriterInput(outputDirectory, metricSessionCapture));
}

async function executePlannedPair({ manifest, plan, authority, pair, attempt, retryReason = null }) {
  const captureOutput = process.env.PRISMGB_PERFORMANCE_CAPTURE_OUTPUT;
  if (!captureOutput) {
    throw new Error('planned performance pair execution requires PRISMGB_PERFORMANCE_CAPTURE_OUTPUT');
  }
  if ((attempt.attemptIndex === 1) !== (retryReason === null)) {
    throw new Error('planned performance pair retry reason does not match its attempt index');
  }
  const existingLedger = JSON.parse(await fs.readFile(path.join(captureOutput, 'performance-ledger.json'), 'utf8'));
  if (!Array.isArray(existingLedger) || existingLedger.length === 0) throw new Error('planned performance pair execution requires the existing canonical ledger');
  const metricSessionOpenSequence = existingLedger.at(-1).sequence + 1;
  const ordinalBase = existingLedger.filter((entry) => (
    (entry.operationId === 'electron-harness-spawn' || entry.operationId === 'production-sentinel-spawn')
    && entry.purpose === 'measurement-side'
  )).length;
  const openStart = runnerMonotonicSeconds();
  let metricSession;
  try {
    metricSession = await openPerformanceRendererMetricPairSession({ deferFailureAbort: true });
  } catch (error) {
    if (error?.performanceMetricZeroSpawned === true) {
      const failedAt = runnerMonotonicSeconds();
      const failedOpen = Object.freeze({
        sequence: metricSessionOpenSequence,
        operationId: 'metric-adapter-session-open',
        start: openStart,
        end: failedAt,
        metricSessionId: attempt.metricSessionId,
        outcome: 'failed-no-resource',
        comparisonKind: pair.comparisonKind,
        backend: pair.backend,
        pairIndex: pair.pairIndex,
        attemptIndex: attempt.attemptIndex,
        ...(retryReason === null ? {} : { retryReason }),
        failedAt,
        zeroSpawned: true
      });
      try {
        await appendPerformanceLedgerEntries([failedOpen]);
      } catch (persistenceError) {
        throw new AggregateError([error, persistenceError], 'metric-session no-resource open failure could not be persisted');
      }
      throw error;
    }
    const abortEvidence = error?.performanceMetricAbortEvidence ?? null;
    if (abortEvidence === null) throw error;
    const abortReason = Object.freeze({
      phase: 'open',
      backend: 'none',
      reason: 'metric-adapter-resource-owned'
    });
    const failedOpen = Object.freeze({
      sequence: metricSessionOpenSequence,
      operationId: 'metric-adapter-session-open',
      start: openStart,
      end: abortEvidence.startedAt,
      metricSessionId: attempt.metricSessionId,
      outcome: 'failed-resource-owned',
      comparisonKind: pair.comparisonKind,
      backend: pair.backend,
      pairIndex: pair.pairIndex,
      attemptIndex: attempt.attemptIndex,
      ...(retryReason === null ? {} : { retryReason }),
      failedAt: abortEvidence.startedAt,
      resourceIdentity: Object.freeze({ adapterId: abortEvidence.adapterId }),
      abortReason,
      lastBoundary: 'open'
    });
    const abortedClose = createAbortedPerformanceMetricSessionClose({
      sequence: metricSessionOpenSequence + 1,
      metricSessionId: attempt.metricSessionId,
      phase: 'open',
      backend: 'none',
      reason: abortReason.reason,
      abortEvidence,
      resourcesClosed: true
    });
    try {
      await appendPerformanceLedgerEntries([failedOpen, abortedClose]);
    } catch (persistenceError) {
      throw new AggregateError([error, persistenceError], 'metric-session open failure cleanup evidence could not be persisted');
    }
    throw error;
  }
  const openEnd = runnerMonotonicSeconds();
  const completedLaunches = [];
  const transactionEntries = [];
  let abortPhase = 'reset-a';
  let abortBackend = 'none';
  try {
    transactionEntries.push(Object.freeze({
      sequence: metricSessionOpenSequence,
      operationId: 'metric-adapter-session-open',
      start: openStart,
      end: openEnd,
      metricSessionId: attempt.metricSessionId,
      outcome: 'ready',
      comparisonKind: pair.comparisonKind,
      backend: pair.backend,
      pairIndex: pair.pairIndex,
      attemptIndex: attempt.attemptIndex,
      ...(retryReason === null ? {} : { retryReason }),
      readyAt: openEnd
    }));
    for (const launch of attempt.launches) {
      const binding = createPairBinding(plan, pair, attempt, launch);
      const launchAuthoritySlot = resolveLaunchAuthoritySlot(authority, binding);
      const resetStart = runnerMonotonicSeconds();
      const resetEnd = runnerMonotonicSeconds();
      transactionEntries.push(Object.freeze({
        sequence: metricSessionOpenSequence + (launch.executionOrdinal * 2) - 1,
        operationId: 'internal-reset',
        start: resetStart,
        end: resetEnd,
        outcome: 'completed',
        resetIdentity: `${attempt.metricSessionId}:side-${launch.comparisonSide.toLowerCase()}`
      }));
      abortPhase = launch.comparisonSide === 'A' ? 'side-a' : 'side-b';
      abortBackend = pair.backend;
      const launchStart = runnerMonotonicSeconds();
      const completedLaunch = await runWithinPerformanceLaunchDeadline(
        `${pair.comparisonKind} pair ${pair.pairIndex} attempt ${attempt.attemptIndex} side ${launch.comparisonSide}`,
        (deadlineSignal) => executePlannedLaunch({
          manifest,
          plan,
          authority,
          pair,
          attempt,
          launch,
          launchAuthoritySlot,
          ledgerSequence: metricSessionOpenSequence + (launch.executionOrdinal * 2),
          ordinal: ordinalBase + launch.executionOrdinal,
          operationStart: launchStart,
          metricSession,
          deadlineSignal
        })
      );
      completedLaunches.push(completedLaunch);
      transactionEntries.push(measurementLaunchLedgerEntry({ completedLaunch, start: launchStart }));
      abortPhase = launch.comparisonSide === 'A' ? 'reset-b' : 'close';
      abortBackend = 'none';
    }
    const closeStart = runnerMonotonicSeconds();
    const closure = await metricSession.close();
    const closeEnd = runnerMonotonicSeconds();
    if (closure.adapterId !== metricSession.adapterId) {
      throw new Error('performance metric pair session closure changed its adapter identity');
    }
    const sourceSha = completedLaunches[0]?.sourceSha;
    if (typeof sourceSha !== 'string' || completedLaunches.length !== attempt.launches.length
      || completedLaunches.some((launch) => launch.sourceSha !== sourceSha)) {
      throw new Error('performance metric pair sides do not retain one source identity');
    }
    const metricSessionCapture = createPerformanceMetricSessionCapture({
      experimentId: plan.experimentId,
      sourceSha,
      policyHash: authority.policyHash,
      captureKind: 'metric-session',
      join: {
        metricSessionId: attempt.metricSessionId,
        comparisonKind: pair.comparisonKind,
        backend: pair.backend,
        pairIndex: pair.pairIndex,
        attemptIndex: attempt.attemptIndex,
        metricSessionOpenSequence
      },
      rawKinds: createMetricSessionRawKinds({
        authority,
        pair,
        attempt,
        metricSession,
        closure,
        completedLaunches
      })
    });
    transactionEntries.push(Object.freeze({
      sequence: metricSessionOpenSequence + 5,
      operationId: 'metric-adapter-session-close',
      start: closeStart,
      end: closeEnd,
      metricSessionId: attempt.metricSessionId,
      outcome: 'completed',
      closure: operationClosure(closeStart, closeEnd),
      closureEnd: closeEnd
    }));
    await persistCompletedAttemptCaptures(captureOutput, completedLaunches, metricSessionCapture);
    await appendPerformanceLedgerEntries(transactionEntries);
    const liveEnvironmentPath = process.env.PRISMGB_PERFORMANCE_LIVE_ENVIRONMENT_CAPTURE;
    if (!liveEnvironmentPath) throw new Error('planned performance pair execution requires the continuous environment capture');
    const liveEnvironment = JSON.parse(await fs.readFile(liveEnvironmentPath, 'utf8'));
    if (liveEnvironment.schemaVersion !== 1 || !Array.isArray(liveEnvironment.rows)) throw new Error('planned performance pair continuous environment capture is invalid');
    return Object.freeze({
      ledger: Object.freeze(transactionEntries),
      measurementCaptures: Object.freeze(completedLaunches.map((entry) => entry.measurementCapture)),
      externalMetricCaptures: Object.freeze(completedLaunches.map((entry) => entry.metricCapture)),
      metricSessionCapture,
      environmentRows: Object.freeze(liveEnvironment.rows)
    });
  } catch (error) {
    if (metricSession.getState() === 'closed') throw error;
    let abortEvidence = metricSession.getTerminalAbortEvidence();
    if (abortEvidence === null && ['open', 'failed'].includes(metricSession.getState())) {
      try {
        await metricSession.abort();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'planned performance pair and metric-session cleanup both failed');
      }
      abortEvidence = metricSession.getTerminalAbortEvidence();
    }
    if (abortEvidence === null) {
      throw new AggregateError([error], 'planned performance pair failed without canonical metric-session cleanup evidence');
    }
    const sideFailure = abortPhase === 'side-a' || abortPhase === 'side-b';
    if (sideFailure && !hasVerifiedResourceCleanup(error)) {
      throw new AggregateError([error], 'planned performance side failed without canonical application cleanup evidence');
    }
    const reason = abortPhase === 'close'
      ? 'metric-adapter-close-failure'
      : performanceAbortReason(error, abortPhase, abortBackend);
    const failureEvidence = sideFailure ? performanceLaunchFailureEvidence(error) : null;
    if (sideFailure && failureEvidence === null) {
      throw new AggregateError([error], 'planned performance side failed without canonical failed-launch evidence');
    }
    if (failureEvidence !== null) {
      transactionEntries.push(failedMeasurementLaunchLedgerEntry({
        failureEvidence,
        phase: abortPhase,
        reason
      }));
    }
    const abortedClose = createAbortedPerformanceMetricSessionClose({
      sequence: transactionEntries.at(-1).sequence + 1,
      metricSessionId: attempt.metricSessionId,
      phase: abortPhase,
      backend: abortBackend,
      reason,
      abortEvidence,
      resourcesClosed: true,
      applicationDescendantClosureEnd: failureEvidence?.applicationDescendantClosureEnd ?? null
    });
    try {
      await appendPerformanceLedgerEntries([...transactionEntries, abortedClose]);
    } catch (persistenceError) {
      throw new AggregateError([error, persistenceError], 'planned performance pair abort evidence could not be persisted');
    }
    throw error;
  }
}

if (performanceExecutionPhase === 'standalone') {
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

if (performanceExecutionPhase === 'pre-loop') {
  test('executes the sealed transport and optional qualification probes before the pair loop', async () => {
    const preLoopAuthority = await loadPerformancePreLoopAuthorityFromEnvironment();
    const manifest = await loadPerformanceBuildManifest();
    expect(preLoopAuthority).toMatchObject({
      experimentId: process.env.PRISMGB_PERFORMANCE_EXPERIMENT_ID,
      experimentRole: process.env.PRISMGB_PERFORMANCE_ROLE,
      transport: { ledgerSequence: 5, buildVariant: 'harness-control' }
    });
    await assertProductionBundleIsolation(manifest);

    const transportProbe = await runWithinPerformanceLaunchDeadline(
      'Electron transport probe',
      () => executePreLoopHarnessProbe({
        manifest,
        slot: preLoopAuthority.transport,
        qualification: false
      })
    );
    await persistElectronTransportProbe({
      authority: preLoopAuthority,
      slot: preLoopAuthority.transport,
      probe: transportProbe
    });
    await appendPerformanceLedgerEntries([electronTransportLedgerEntry(preLoopAuthority.transport, transportProbe)]);

    if (preLoopAuthority.qualification !== null) {
      const qualificationProbe = await runWithinPerformanceLaunchDeadline(
        'selected-host qualification probe',
        () => executePreLoopHarnessProbe({
          manifest,
          slot: preLoopAuthority.qualification,
          qualification: true
        })
      );
      const qualificationCapture = await persistQualificationProbe({
        authority: preLoopAuthority,
        slot: preLoopAuthority.qualification,
        probe: qualificationProbe
      });
      await appendPerformanceLedgerEntries([qualificationLedgerEntry({
        authority: preLoopAuthority,
        slot: preLoopAuthority.qualification,
        probe: qualificationProbe,
        capture: qualificationCapture.capture
      })]);
    }

  });
}

if (performanceExecutionPhase === 'pair-loop') {
  test('executes every balanced planned pair with one shared external metric session', async () => {
    const { plan, authority } = await loadPerformancePairPlanFromEnvironment();
    const manifest = await loadPerformanceBuildManifest();
    await assertProductionBundleIsolation(manifest);
    for (const pair of plan.pairs) {
      const result = await executePerformancePairAttemptSequence({
        pair,
        executeAttempt: ({ attempt, retryReason }) => executePlannedPair({ manifest, plan, authority, pair, attempt, retryReason }),
        assessCompletedAttempt: async ({ attempt, projection }) => {
          const captureOutput = process.env.PRISMGB_PERFORMANCE_CAPTURE_OUTPUT;
          if (!captureOutput) throw new Error('performance pair assessment requires the capture output');
          const ledger = JSON.parse(await fs.readFile(path.join(captureOutput, 'performance-ledger.json'), 'utf8'));
          return assessCapturedPerformancePairAttempt({
            ledger,
            target: {
              backend: pair.backend,
              comparisonKind: pair.comparisonKind,
              pairIndex: pair.pairIndex,
              attemptIndex: attempt.attemptIndex
            },
            captureGroups: [...projection.measurementCaptures, ...projection.externalMetricCaptures, projection.metricSessionCapture],
            environmentRows: projection.environmentRows.filter((row) => row.observationKind !== 'cleanup')
          });
        }
      });
      if (result.terminal.disposition !== 'accepted') {
        throw new Error(`performance pair ${pair.comparisonKind}/${pair.pairIndex} stopped with ${result.terminal.disposition}: ${result.terminal.reason}`);
      }
    }
  });
}
