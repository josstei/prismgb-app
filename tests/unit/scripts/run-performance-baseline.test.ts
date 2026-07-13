import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PERFORMANCE_BUILD_VARIANTS,
  PERFORMANCE_POLICY_HASH,
  createBuildManifestBody,
  createBundleManifest,
  createPerformanceLaunchAuthority,
  createPerformancePreLoopAuthority,
  createPerformancePairPlan,
  createPerformanceRunJoinFromAuthority,
  createPerformanceCommandLedger,
  createPerformanceBuildEnvironment,
  createProductionBundleEvidence,
  collectPerformanceExternalMetricCaptures,
  collectPerformanceMetricSessionCaptures,
  collectPerformanceSentinelCaptures,
  collectPerformanceWorkloadCaptures,
  finalizePerformancePreLoopBoundary,
  parsePerformanceBaselineArgs,
  resolvePerformanceExperimentDeadline,
  resolvePerformancePlaywrightCommand,
  runPerformanceBaseline,
  validatePerformancePreLoopAuthority,
  validatePerformanceLaunchAuthority
} from '../../../scripts/run-performance-baseline.js';
import { canonicalSha256, stableStringify } from '../../../scripts/lib/baseline-report.js';
import { assessCapturedPerformancePairAttempt } from '../../../scripts/lib/performance-evidence.js';
import { createPerformanceSentinelCapture } from '../../../scripts/lib/performance-sentinel-capture.js';
import { createPerformanceExternalMetricCapture } from '../../../scripts/lib/performance-external-metric-capture.js';
import { createPerformanceMetricSessionCapture } from '../../../scripts/lib/performance-metric-session-capture.js';
import { createPerformanceWorkloadCapture } from '../../../scripts/lib/performance-workload-capture.js';
import {
  createPerformanceCaptureIndex,
  createPerformanceQualificationCapture,
  createPerformanceTransportCapture,
  readPerformanceRawCaptureManifest
} from '../../../scripts/lib/performance-raw-capture-manifest.js';
import {
  createPerformanceControllerAuditFixture,
  createPerformanceRootExitObservationFixture
} from './performance-controller-audit.fixture.js';

const tempDirectories: string[] = [];

async function createTemporaryWorkspace(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'prismgb-performance-runner-'));
  tempDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

const BUILD_VARIANT_FLAGS = Object.freeze({
  production: Object.freeze({ harness: false, instrumentation: false }),
  'harness-control': Object.freeze({ harness: true, instrumentation: false }),
  instrumented: Object.freeze({ harness: true, instrumentation: true })
});
const DEFAULT_HARNESS_PAIR = Object.freeze({
  experimentId: '123e4567-e89b-42d3-a456-426614174001',
  pairPlanChecksum: 'b'.repeat(64),
  metricSessionId: 'harness-pair-1-attempt-1',
  comparisonKind: 'harness-overhead',
  backend: 'canvas2d',
  pairIndex: 1,
  attemptIndex: 1,
  comparisonSide: 'B'
});
const DEFAULT_INSTRUMENTATION_PAIR = Object.freeze({
  experimentId: '123e4567-e89b-42d3-a456-426614174002',
  pairPlanChecksum: 'c'.repeat(64),
  metricSessionId: 'instrumentation-pair-1-attempt-1',
  comparisonKind: 'instrumentation-overhead',
  backend: 'canvas2d',
  pairIndex: 1,
  attemptIndex: 1,
  comparisonSide: 'B'
});

function fixtureUuid(sequence: number) {
  return `123e4567-e89b-42d3-a456-${sequence.toString(16).padStart(12, '0')}`;
}

function createFixturePairPlan() {
  let session = 0;
  return createPerformancePairPlan({
    experimentId: fixtureUuid(1),
    backend: 'canvas2d',
    createSessionId: () => `fixture-session-${++session}`
  });
}

function buildMetadata(id: keyof typeof BUILD_VARIANT_FLAGS, bundleSha256: string) {
  return { id, ...BUILD_VARIANT_FLAGS[id], bundleSha256 };
}

function createPairBinding(plan: ReturnType<typeof createPerformancePairPlan>, pair: any, attempt: any, launch: any) {
  return {
    experimentId: plan.experimentId,
    pairPlanChecksum: plan.checksum,
    metricSessionId: attempt.metricSessionId,
    comparisonKind: pair.comparisonKind,
    backend: pair.backend,
    pairIndex: pair.pairIndex,
    attemptIndex: attempt.attemptIndex,
    comparisonSide: launch.comparisonSide
  };
}

function createCanvasSentinelCapture({
  sourceSha = 'a'.repeat(40),
  bundleSha256 = 'b'.repeat(64),
  buildId = 'harness-control' as const,
  pair = DEFAULT_HARNESS_PAIR,
  externalExecutionId = fixtureUuid(10),
  runId = `external-sentinel:${externalExecutionId}`,
  observationBoundaryId = `external-sentinel-window:${externalExecutionId}`
}: {
  sourceSha?: string;
  bundleSha256?: string;
  buildId?: 'production' | 'harness-control';
  pair?: Record<string, unknown>;
  externalExecutionId?: string;
  runId?: string;
  observationBoundaryId?: string;
} = {}) {
  const controllerAudit = buildId === 'production'
    ? null
    : createPerformanceControllerAuditFixture({
      launchId: externalExecutionId,
      instrumentation: false
    });
  return createPerformanceSentinelCapture({
    sourceSha,
    runId,
    externalExecutionId,
    observationBoundaryId,
    pair,
    build: buildMetadata(buildId, bundleSha256),
    backend: 'canvas2d',
    workload: {
      id: 'phase0-animated-160x144-v1',
      pattern: 'animated',
      width: 160,
      height: 144,
      frameRate: 60
    },
    warmup: { callbackCount: 600, elapsedMs: 10_000 },
    window: {
      minimumCallbacks: 1,
      minimumDurationMs: 10,
      maximumCallbacks: 2,
      maximumDurationMs: 45,
      deliveredCallbackCount: 1,
      startedAt: 10,
      closedAt: 20,
      terminalClosureEnd: 25,
      closureReason: 'minimum-reached'
    },
    observations: {
      callbacks: [{
        sequence: 1,
        kind: 'renderer-callback',
        observedAt: 11,
        callbackOrdinal: 1,
        mediaTime: 0.1
      }],
      canvasDraws: [{
        sequence: 2,
        kind: 'canvas-draw-completed',
        observedAt: 13,
        callbackOrdinal: 1,
        startedAt: 12,
        endedAt: 13
      }],
      workerFramePosts: [],
      acknowledgements: [],
      errors: [],
      postPauseCanvasDrawCount: 0,
      callbackOverlapCount: 0,
      outstandingWorkerFrames: 0
    },
    controllerAudit,
    rootExit: controllerAudit === null ? null : createPerformanceRootExitObservationFixture(controllerAudit)
  });
}

function createCanvasExternalMetricCapture({
  sourceSha = 'a'.repeat(40),
  bundleSha256 = 'b'.repeat(64),
  buildId = 'harness-control' as const,
  pair = DEFAULT_HARNESS_PAIR,
  externalExecutionId = fixtureUuid(10),
  runId = `external-sentinel:${externalExecutionId}`,
  observationBoundaryId = `external-sentinel-window:${externalExecutionId}`,
  pid = 42
}: {
  sourceSha?: string;
  bundleSha256?: string;
  buildId?: 'production' | 'harness-control' | 'instrumented';
  pair?: Record<string, unknown>;
  externalExecutionId?: string;
  runId?: string;
  observationBoundaryId?: string;
  pid?: number;
} = {}) {
  const processIdentity = `renderer:${externalExecutionId}:${pid}`;
  const metricRead = (ordinal: number, readStart: number, cumulativeCpuSeconds: number) => ({
    sample: {
      ordinal,
      readStart,
      readEnd: readStart + 0.01,
      cumulativeCpuSeconds,
      counterQuantumSeconds: 0.01,
      processIdentity,
      workingSetMiB: 128
    },
    raw: {
      pid,
      userTicks: cumulativeCpuSeconds * 100,
      systemTicks: 0,
      startTicks: 30,
      residentPages: 32768,
      pageSize: 4096,
      clockTicks: 100
    }
  });
  return createPerformanceExternalMetricCapture({
    sourceSha,
    runId,
    externalExecutionId,
    observationBoundaryId,
    pair,
    build: buildMetadata(buildId, bundleSha256),
    adapterId: 'linux-procfs-v1',
    target: {
      pid,
      creationIdentity: '30',
      processIdentity,
      counterQuantumSeconds: 0.01
    },
    window: { start: 10, terminalClosureEnd: 40.25 },
    prime: metricRead(0, 9.5, 1),
    inWindowSamples: Array.from({ length: 61 }, (_, index) => metricRead(index + 1, 10 + (index * 0.5), index + 2)),
    terminalSample: metricRead(62, 40.5, 63)
  });
}

function createInstrumentationWorkloadCapture({
  sourceSha = 'a'.repeat(40),
  bundleSha256 = 'd'.repeat(64),
  buildId = 'instrumented' as const,
  pair = DEFAULT_INSTRUMENTATION_PAIR,
  launchId = fixtureUuid(20),
  externalExecutionId = fixtureUuid(21),
  observationBoundaryId = `external-sentinel-window:${externalExecutionId}`,
  diagnostics = buildId === 'harness-control' ? {} : { source: { sourceOpportunities: 2 } }
}: {
  sourceSha?: string;
  bundleSha256?: string;
  buildId?: 'harness-control' | 'instrumented';
  pair?: Record<string, unknown>;
  launchId?: string;
  externalExecutionId?: string;
  observationBoundaryId?: string;
  diagnostics?: Record<string, unknown>;
} = {}) {
  const controllerAudit = createPerformanceControllerAuditFixture({
    launchId,
    instrumentation: buildId === 'instrumented'
  });
  return createPerformanceWorkloadCapture({
    sourceSha,
    launchId,
    externalExecutionId,
    observationBoundaryId,
    pair,
    build: buildMetadata(buildId, bundleSha256),
    workload: { id: 'phase0-animated-160x144-v1', pattern: 'animated', width: 160, height: 144, frameRate: 60 },
    warmup: { sourceOpportunityCount: 600, elapsedMs: 10_000 },
    window: {
      minimumCallbacks: 2,
      minimumDurationMs: 30_000,
      maximumCallbacks: 4,
      maximumDurationMs: 45_000,
      deliveredCallbackCount: 2,
      startedAt: 100,
      closedAt: 30_100,
      closureReason: 'minimum-reached'
    },
    sourceSequences: [1, 2],
    controlWrites: [],
    diagnostics,
    controllerAudit,
    rootExit: createPerformanceRootExitObservationFixture(controllerAudit)
  });
}

function writeRawCaptureSync(outputDirectory: string, directory: string, identity: string, capture: { checksum: string }) {
  const target = path.join(outputDirectory, directory);
  fsSync.mkdirSync(target, { recursive: true });
  const relativePath = `${directory}/${identity}-${capture.checksum}.json`;
  fsSync.writeFileSync(path.join(outputDirectory, relativePath), JSON.stringify(capture));
  return relativePath;
}

function runRawBinding(join: Record<string, any>, captureKind: string) {
  return {
    sourceSha: join.sourceSha,
    policyHash: join.policyHash,
    experimentId: join.experimentId,
    pairPlanChecksum: join.pairPlanChecksum,
    ledgerSequence: join.ledgerSequence,
    experimentRole: join.experimentRole,
    scopeKind: 'run',
    scopeId: join.runId,
    captureKind,
    runId: join.runId,
    metricSessionId: join.metricSessionId,
    comparisonKind: join.comparisonKind,
    backend: join.backend,
    pairIndex: join.pairIndex,
    attemptIndex: join.attemptIndex,
    comparisonSide: join.comparisonSide,
    buildVariant: join.buildVariant,
    launchOrdinal: join.ordinal,
    externalExecutionId: join.externalExecutionId,
    observationBoundaryId: join.observationBoundaryId
  };
}

function rebindRunRawKinds(rawKinds: Array<Record<string, any>>, join: Record<string, any>, captureKind: string) {
  const binding = runRawBinding(join, captureKind);
  return rawKinds.map((group) => ({
    ...group,
    rows: group.rows.map((row: Record<string, any>) => ({ ...row, ...binding }))
  }));
}

function createFixtureRunJoin({ sourceSha, pairPlan, pair, attempt, launch, ordinal, ledgerSequence }: Record<string, any>) {
  const externalExecutionId = fixtureUuid(100 + ordinal);
  const common = {
    sourceSha,
    policyHash: PERFORMANCE_POLICY_HASH,
    ...createPairBinding(pairPlan, pair, attempt, launch),
    ledgerSequence,
    experimentRole: 'ci-integrity',
    buildVariant: launch.buildVariant,
    ordinal,
    runId: `performance-run:${pairPlan.experimentId}:${ordinal}`,
    externalExecutionId
  };
  if (launch.buildVariant === 'production') {
    return {
      ...common,
      observationBoundaryId: `performance-window:${externalExecutionId}`,
      browserPid: 1000 + ordinal,
      browserCreationTime: String(10_000 + ordinal)
    };
  }
  const launchId = fixtureUuid(200 + ordinal);
  return { ...common, observationBoundaryId: launchId, launchId, executionId: launchId };
}

function createFixtureSentinelCapture(join: Record<string, any>) {
  const binding = runRawBinding(join, 'sentinel');
  const sentinelRows = [
    {
      ...binding,
      captureOrdinal: 1,
      observationBoundaryId: join.observationBoundaryId,
      observationKind: 'callback',
      observedAt: 11,
      callbackOrdinal: 1,
      mediaTime: 0.1
    },
    {
      ...binding,
      captureOrdinal: 3,
      observationBoundaryId: join.observationBoundaryId,
      observationKind: 'boundary',
      observedAt: 10,
      boundary: 'window-start'
    },
    {
      ...binding,
      captureOrdinal: 4,
      observationBoundaryId: join.observationBoundaryId,
      observationKind: 'boundary',
      observedAt: 20,
      boundary: 'window-close'
    },
    {
      ...binding,
      captureOrdinal: 5,
      observationBoundaryId: join.observationBoundaryId,
      observationKind: 'pending',
      observedAt: 11,
      pendingCount: 0
    },
    {
      ...binding,
      captureOrdinal: 6,
      observationBoundaryId: join.observationBoundaryId,
      observationKind: 'closure',
      observedAt: 22,
      closureReason: 'minimum-reached'
    }
  ];
  const rawKinds: Array<{ rawKind: string; rows: Array<Record<string, any>> }> = [{
    rawKind: 'backend-operation',
    rows: [{
      ...binding,
      captureOrdinal: 2,
      callbackOrdinal: 1,
      operationId: 'canvas-draw-completed',
      observedAt: 12
    }]
  }, {
    rawKind: 'sentinel-observation',
    rows: sentinelRows
  }];
  if (join.buildVariant === 'harness-control') {
    rawKinds.push({
      rawKind: 'controller-operation',
      rows: [{
        ...binding,
        controlSequence: 1,
        operationKind: 'control-write',
        clockDomain: 'renderer-performance-now-v1',
        writeKind: 'backend-ready',
        rawWrite: {
          kind: 'backend-ready',
          launchId: join.launchId,
          observedAt: 9,
          requestedBackend: 'canvas2d',
          selectedBackend: 'canvas2d',
          selectionReason: 'requested-canvas2d',
          backendExecutionIdentity: null
        },
        writtenAt: 9,
        outcome: 'recorded'
      }]
    });
  }
  return createPerformanceSentinelCapture({
    experimentId: join.experimentId,
    sourceSha: join.sourceSha,
    policyHash: join.policyHash,
    captureKind: 'sentinel',
    join,
    rawKinds
  });
}

function createFixtureExternalMetricCapture(join: Record<string, any>) {
  const pid = 1000 + join.ordinal;
  const creationIdentity = String(30 + join.ordinal);
  const rawSample = (ordinal: number) => ({
    pid,
    userTicks: ordinal * 5,
    systemTicks: 0,
    startTicks: Number(creationIdentity),
    residentPages: 32768,
    pageSize: 4096,
    clockTicks: 100
  });
  return createPerformanceExternalMetricCapture({
    experimentId: join.experimentId,
    sourceSha: join.sourceSha,
    policyHash: join.policyHash,
    captureKind: 'external-metric',
    join,
    rawKinds: [{
      rawKind: 'process-observation',
      rows: [{
        ...runRawBinding(join, 'external-metric'),
        observationOrdinal: 1,
        observedAt: 9,
        observationKind: 'membership',
        observationSource: 'external-metric-adapter',
        adapterId: 'linux-procfs-v1',
        subjectKind: 'renderer',
        pid,
        creationIdentity,
        processIdentity: `renderer:${join.externalExecutionId}:${pid}`,
        rawAdapterKind: 'linux-procfs-v1',
        rawIdentity: rawSample(1),
        rawMembership: rawSample(1),
        processClass: 'application-renderer',
        ownership: 'application-owned',
        alive: true
      }]
    }, {
      rawKind: 'cpu-sample',
      rows: Array.from({ length: 61 }, (_, index) => {
        const ordinal = index + 1;
        return ({
        ...runRawBinding(join, 'external-metric'),
        ordinal,
        samplePhase: ordinal === 1 ? 'prime' : ordinal === 61 ? 'terminal-closure' : 'in-window',
        adapterId: 'linux-procfs-v1',
        pid,
        creationIdentity,
        processIdentity: `renderer:${join.externalExecutionId}:${pid}`,
        readStart: 10 + (ordinal * 0.5),
        readEnd: 10.01 + (ordinal * 0.5),
        counterQuantumSeconds: 0.01,
        cumulativeCpuSeconds: (ordinal * 5) / 100,
        workingSetMiB: 128,
        rawAdapterKind: 'linux-procfs-v1',
        rawAdapterSample: {
          adapterSample: rawSample(ordinal),
          readStart: 10 + (ordinal * 0.5),
          readEnd: 10.01 + (ordinal * 0.5)
        }
      }); })
    }]
  });
}

function createFixtureWorkloadCapture(join: Record<string, any>) {
  const binding = runRawBinding(join, 'workload');
  const measurementEpochId = join.buildVariant === 'instrumented' ? 'epoch-1' : null;
  const diagnosticFrameId = join.buildVariant === 'instrumented' ? 'diagnostic-frame-1' : null;
  return createPerformanceWorkloadCapture({
    experimentId: join.experimentId,
    sourceSha: join.sourceSha,
    policyHash: join.policyHash,
    captureKind: 'workload',
    join,
    rawKinds: [{
      rawKind: 'source-opportunity',
      rows: [{
        ...binding,
        captureOrdinal: 1,
        eventKind: 'source-opportunity',
        launchId: join.launchId,
        measurementWindowId: join.observationBoundaryId,
        measurementEpochId,
        sourceSequence: 1,
        diagnosticFrameId,
        mediaTime: 0.1,
        sessionPresent: true,
        sessionActive: true,
        duplicateMediaTime: false,
        readyState: 4,
        hasCurrentData: true
      }, {
        ...binding,
        captureOrdinal: 2,
        eventKind: 'advisory-disposition',
        launchId: join.launchId,
        measurementWindowId: join.observationBoundaryId,
        measurementEpochId,
        sourceSequence: 1,
        diagnosticFrameId,
        advisoryOutcome: 'canvas-draw-completed',
        advisoryFrameToken: null
      }]
    }, {
      rawKind: 'controller-operation',
      rows: [{
        ...binding,
        controlSequence: 1,
        operationKind: 'control-write',
        clockDomain: 'renderer-performance-now-v1',
        writeKind: 'backend-ready',
        rawWrite: {
          kind: 'backend-ready',
          launchId: join.launchId,
          observedAt: 9,
          requestedBackend: 'canvas2d',
          selectedBackend: 'canvas2d',
          selectionReason: 'requested-canvas2d',
          backendExecutionIdentity: null
        },
        writtenAt: 9,
        outcome: 'recorded'
      }]
    }]
  });
}

function createFixtureMetricSessionCapture({ pairPlan, pair, attempt, pairOffset, sourceSha, joins }: Record<string, any>) {
  const join = {
    metricSessionId: attempt.metricSessionId,
    comparisonKind: pair.comparisonKind,
    backend: pair.backend,
    pairIndex: pair.pairIndex,
    attemptIndex: attempt.attemptIndex,
    metricSessionOpenSequence: 6 + (pairOffset * 6)
  };
  const common = {
    sourceSha,
    policyHash: PERFORMANCE_POLICY_HASH,
    experimentId: pairPlan.experimentId,
    pairPlanChecksum: pairPlan.checksum,
    experimentRole: 'ci-integrity',
    scopeKind: 'metric-session',
    scopeId: attempt.metricSessionId,
    captureKind: 'metric-session',
    ...join,
    observationSource: 'external-adapter',
    adapterId: 'linux-procfs-v1',
    subjectKind: 'renderer',
    rawAdapterKind: 'linux-procfs-v1',
    processClass: 'application-renderer',
    ownership: 'application-owned'
  };
  const identities = joins.map((runJoin: Record<string, any>) => {
    const pid = 1000 + runJoin.ordinal;
    const creationIdentity = String(30 + runJoin.ordinal);
    const processIdentity = `renderer:${runJoin.externalExecutionId}:${pid}`;
    return {
      pid,
      creationIdentity,
      processIdentity,
      rawIdentity: { pid, userTicks: 5, systemTicks: 0, startTicks: Number(creationIdentity), residentPages: 32768, pageSize: 4096, clockTicks: 100 },
      target: { pid, creationIdentity, processIdentity, counterQuantumSeconds: 0.01 }
    };
  });
  const sessionCarrier = {
    adapterId: 'linux-procfs-v1',
    result: { status: 'closed' },
    transitions: [
      ...identities.map(({ target }: Record<string, any>, index: number) => ({ sequence: index + 1, operation: 'attach', at: 8, target })),
      ...identities.map(({ target }: Record<string, any>, index: number) => ({ sequence: identities.length + index + 1, operation: 'detach', at: 41, target }))
    ]
  };
  const rows = [
    ...identities.map(({ pid, creationIdentity, processIdentity, rawIdentity }: Record<string, any>, index: number) => ({
      ...common,
      observationOrdinal: index + 1,
      observedAt: 8,
      observationKind: 'membership',
      pid,
      creationIdentity,
      processIdentity,
      rawIdentity,
      rawMembership: sessionCarrier,
      alive: true
    })),
    ...identities.map(({ pid, creationIdentity, processIdentity, rawIdentity }: Record<string, any>, index: number) => ({
      ...common,
      observationOrdinal: identities.length + index + 1,
      observedAt: 41,
      observationKind: 'closure',
      pid,
      creationIdentity,
      processIdentity,
      rawIdentity,
      rawClosure: sessionCarrier,
      alive: false,
      closureState: 'detached'
    }))
  ];
  return createPerformanceMetricSessionCapture({
    experimentId: pairPlan.experimentId,
    sourceSha,
    policyHash: PERFORMANCE_POLICY_HASH,
    captureKind: 'metric-session',
    join,
    rawKinds: [{
      rawKind: 'process-observation',
      rows
    }]
  });
}

function writeExactRawCaptureSync(outputDirectory: string, directory: string, capture: { checksum: string }) {
  const target = path.join(outputDirectory, directory);
  fsSync.mkdirSync(target, { recursive: true });
  const relativePath = `${directory}/${capture.checksum}.json`;
  fsSync.writeFileSync(path.join(outputDirectory, relativePath), JSON.stringify(capture));
  return relativePath;
}

function createFixtureManifest(bundles = {
  production: 'c'.repeat(64),
  'harness-control': 'b'.repeat(64),
  instrumented: 'd'.repeat(64)
}) {
  return {
    variants: Object.entries(BUILD_VARIANT_FLAGS).map(([id, flags]) => ({
      id,
      ...flags,
      bundle: { sha256: bundles[id as keyof typeof bundles] }
    }))
  };
}

function writePlannedCaptureFixturesSync({
  outputDirectory,
  pairPlan,
  manifest,
  sourceSha = 'a'.repeat(40)
}: {
  outputDirectory: string;
  pairPlan: ReturnType<typeof createPerformancePairPlan>;
  manifest: ReturnType<typeof createFixtureManifest>;
  sourceSha?: string;
}) {
  const sentinels: Array<{ capture: any; relativePath: string }> = [];
  const metrics: Array<{ capture: any; relativePath: string }> = [];
  const metricSessions: Array<{ capture: any; relativePath: string }> = [];
  const workloads: Array<{ capture: any; relativePath: string }> = [];
  const joins: Array<Record<string, any>> = [];
  let execution = 0;
  for (const [pairOffset, pair] of pairPlan.pairs.entries()) {
    const attempt = pair.attempts[0];
    const pairJoins: Array<Record<string, any>> = [];
    for (const [launchIndex, launch] of attempt.launches.entries()) {
      execution += 1;
      const build = manifest.variants.find((variant) => variant.id === launch.buildVariant);
      if (!build) throw new Error(`missing fixture build ${launch.buildVariant}`);
      const join = createFixtureRunJoin({
        sourceSha,
        pairPlan,
        pair,
        attempt,
        launch,
        ordinal: execution,
        ledgerSequence: 5 + (pairOffset * 6) + (launchIndex === 0 ? 3 : 5)
      });
      joins.push(join);
      pairJoins.push(join);
      if (pair.comparisonKind === 'harness-overhead') {
        const sentinel = createFixtureSentinelCapture(join);
        sentinels.push({
          capture: sentinel,
          relativePath: writeExactRawCaptureSync(outputDirectory, 'raw-sentinel-captures', sentinel)
        });
      }
      const metric = createFixtureExternalMetricCapture(join);
      metrics.push({
        capture: metric,
        relativePath: writeExactRawCaptureSync(outputDirectory, 'raw-external-metric-captures', metric)
      });
      if (pair.comparisonKind === 'instrumentation-overhead') {
        const workload = createFixtureWorkloadCapture(join);
        workloads.push({
          capture: workload,
          relativePath: writeExactRawCaptureSync(outputDirectory, 'raw-workload-captures', workload)
        });
      }
    }
    const metricSession = createFixtureMetricSessionCapture({ pairPlan, pair, attempt, pairOffset, sourceSha, joins: pairJoins });
    const relativePath = writeExactRawCaptureSync(outputDirectory, 'raw-metric-session-captures', metricSession);
    metricSessions.push({ capture: metricSession, relativePath });
  }
  return { sentinels, metrics, metricSessions, workloads, joins };
}

function fixtureClosure() {
  return {
    closed: true,
    stdoutDrained: true,
    stderrDrained: true,
    inputClosed: true,
    exit: { code: 0, durationMs: 1 },
    zeroSurvivors: true
  };
}

function createFixturePerformanceLedger(pairPlan: ReturnType<typeof createPerformancePairPlan>, joins: Array<Record<string, any>>) {
  const closure = fixtureClosure();
  const genericMarker = fixtureUuid(390);
  const genericBoundary = fixtureUuid(391);
  const electronMarker = fixtureUuid(400);
  const electronBoundary = fixtureUuid(402);
  const ledger: Array<Record<string, any>> = [
    {
      sequence: 1,
      operationId: 'generic-transport-spawn',
      start: 0,
      end: 1,
      outcome: 'completed',
      executionIdentity: { externalExecutionId: fixtureUuid(392), executionId: fixtureUuid(393) },
      markerIdentity: {
        operationMarker: genericMarker,
        launchId: genericMarker,
        preloadEchoLaunchId: genericMarker,
        rendererEchoLaunchId: genericMarker
      },
      transportIdentity: { transportId: 'fixture-generic-transport', observationBoundaryId: genericBoundary },
      transportClosureEnd: 1
    },
    { sequence: 2, operationId: 'build-spawn', start: 1, end: 2, buildId: 'production', closure, outcome: 'completed' },
    { sequence: 3, operationId: 'build-spawn', start: 2, end: 3, buildId: 'harness-control', closure, outcome: 'completed' },
    { sequence: 4, operationId: 'build-spawn', start: 3, end: 4, buildId: 'instrumented', closure, outcome: 'completed' },
    {
      sequence: 5,
      operationId: 'electron-harness-spawn',
      start: 4,
      end: 5,
      purpose: 'transport-probe',
      outcome: 'completed',
      executionIdentity: { externalExecutionId: fixtureUuid(401), executionId: fixtureUuid(403) },
      markerIdentity: {
        operationMarker: electronMarker,
        launchId: electronMarker,
        preloadEchoLaunchId: electronMarker,
        rendererEchoLaunchId: electronMarker
      },
      transportIdentity: { transportId: 'fixture-electron-transport', observationBoundaryId: electronBoundary },
      applicationDescendantClosureEnd: 5
    }
  ];
  for (const [pairOffset, pair] of pairPlan.pairs.entries()) {
    const attempt = pair.attempts[0];
    const pairJoins = joins.slice(pairOffset * 2, (pairOffset * 2) + 2);
    const sequenceOffset = 5 + (pairOffset * 6);
    ledger.push({
      sequence: sequenceOffset + 1,
      operationId: 'metric-adapter-session-open',
      start: sequenceOffset,
      end: sequenceOffset + 1,
      metricSessionId: attempt.metricSessionId,
      outcome: 'ready',
      comparisonKind: pair.comparisonKind,
      backend: pair.backend,
      pairIndex: pair.pairIndex,
      attemptIndex: attempt.attemptIndex,
      readyAt: sequenceOffset + 1
    });
    pairJoins.forEach((join, index) => {
      ledger.push({
        sequence: sequenceOffset + (index === 0 ? 2 : 4),
        operationId: 'internal-reset',
        start: sequenceOffset + (index === 0 ? 1 : 3),
        end: sequenceOffset + (index === 0 ? 2 : 4),
        outcome: 'completed',
        resetIdentity: `${attempt.metricSessionId}-reset-${index + 1}`
      });
      const harness = join.buildVariant !== 'production';
      ledger.push({
        sequence: join.ledgerSequence,
        operationId: harness ? 'electron-harness-spawn' : 'production-sentinel-spawn',
        start: join.ledgerSequence - 1,
        end: join.ledgerSequence,
        purpose: 'measurement-side',
        sourceSha: join.sourceSha,
        pairPlanChecksum: join.pairPlanChecksum,
        ledgerSequence: join.ledgerSequence,
        experimentRole: join.experimentRole,
        metricSessionId: join.metricSessionId,
        comparisonSide: join.comparisonSide,
        comparisonKind: join.comparisonKind,
        buildVariant: join.buildVariant,
        pairIndex: join.pairIndex,
        attemptIndex: join.attemptIndex,
        ordinal: join.ordinal,
        runId: join.runId,
        experimentId: join.experimentId,
        backend: join.backend,
        policyHash: join.policyHash,
        externalExecutionId: join.externalExecutionId,
        observationBoundaryId: join.observationBoundaryId,
        ownership: { class: 'application-owned' },
        cleanup: closure,
        outcome: 'completed',
        applicationDescendantClosureEnd: join.ledgerSequence,
        ...(harness
          ? {
            launchId: join.launchId,
            executionId: join.executionId,
            ...(join.buildVariant === 'instrumented'
              ? { measurementEpochId: join.launchId, frameSourceSequences: [1] }
              : {})
          }
          : {
            externalExecutionId: join.externalExecutionId,
            browserPid: join.browserPid,
            browserCreationTime: join.browserCreationTime
          })
      });
    });
    ledger.push({
      sequence: sequenceOffset + 6,
      operationId: 'metric-adapter-session-close',
      start: sequenceOffset + 5,
      end: sequenceOffset + 6,
      metricSessionId: attempt.metricSessionId,
      outcome: 'completed',
      closure,
      closureEnd: sequenceOffset + 6
    });
  }
  return ledger;
}

function writeFixturePreLoopEvidenceSync({
  outputDirectory,
  experimentId,
  sourceSha
}: {
  outputDirectory: string;
  experimentId: string;
  sourceSha: string;
}) {
  const dynamicState = {
    power: {}, display: {}, refreshRate: null, devicePixelRatio: null, thermal: {}, gpuSwitch: {}
  };
  fsSync.mkdirSync(path.join(outputDirectory, 'experiment-evidence', 'transport'), { recursive: true });

  const transportCapture = (ledgerSequence: number, operationId: string, observationBoundaryId: string) => {
    const binding = {
      sourceSha,
      policyHash: PERFORMANCE_POLICY_HASH,
      experimentId,
      experimentRole: 'ci-integrity',
      scopeKind: 'ledger-operation',
      scopeId: ledgerSequence,
      captureKind: 'transport',
      ledgerSequence,
      operationId
    };
    const pid = 5000 + ledgerSequence;
    const creationIdentity = `fixture-${ledgerSequence}`;
    const rawKinds: Array<Record<string, any>> = [{
      rawKind: 'process-observation',
      rows: [{
        ...binding,
        observationOrdinal: 1,
        observedAt: ledgerSequence,
        observationKind: 'membership',
        observationSource: 'fixture-external',
        adapterId: 'external-membership-v1',
        subjectKind: 'transport',
        pid,
        creationIdentity,
        processIdentity: `external:${pid}:${creationIdentity}`,
        rawAdapterKind: 'external-process-membership',
        rawIdentity: { pid, creationIdentity },
        rawMembership: { spawnBoundary: {}, rendererEvaluation: {}, ancestry: {}, processGroup: null, job: null, pathIdentity: {} },
        processClass: 'application-renderer',
        ownership: 'application-owned',
        alive: true
      }]
    }];
    if (operationId === 'electron-harness-spawn') {
      const scopedBinding = { ...binding, observationBoundaryId };
      const currentState = dynamicState;
      rawKinds.push({ rawKind: 'environment-observation', rows: [{
        ...scopedBinding,
        source: 'electron-main',
        sourceSequence: 1,
        clockDomain: 'electron-main',
        runnerReceiptSequence: 1,
        observedAt: ledgerSequence,
        observationKind: 'initial-snapshot',
        rawAdapterKind: 'electron-environment-v1',
        rawObservation: {
          launchId: fixtureUuid(400), callSequence: 1, phase: 'initial', capturedAt: ledgerSequence,
          currentState, eventBoundary: null
        },
        staticIdentity: currentState,
        dynamicState: currentState
      }] });
      rawKinds.push({ rawKind: 'controller-operation', rows: [{
        ...scopedBinding,
        controlSequence: 1,
        operationKind: 'request',
        clockDomain: 'electron-main',
        controllerRequestId: 'transport-request',
        channel: 'browser-window',
        requestKind: 'transport',
        rawRequest: {},
        sentAt: ledgerSequence
      }, {
        ...scopedBinding,
        controlSequence: 2,
        operationKind: 'response',
        clockDomain: 'electron-main',
        controllerRequestId: 'transport-request',
        channel: 'browser-window',
        responseKind: 'transport',
        rawResponse: {},
        receivedAt: ledgerSequence + 0.5,
        outcome: 'recorded'
      }] });
    }
    return createPerformanceTransportCapture({
      experimentId,
      sourceSha,
      policyHash: PERFORMANCE_POLICY_HASH,
      captureKind: 'transport',
      ledgerSequence,
      operationId,
      observationBoundaryId,
      rawKinds
    });
  };
  const transports = [
    JSON.parse(fsSync.readFileSync(path.join(outputDirectory, 'experiment-evidence/transport/generic.json'), 'utf8')),
    transportCapture(5, 'electron-harness-spawn', fixtureUuid(400))
  ];
  const transportPaths = [
    'experiment-evidence/transport/generic.json',
    'experiment-evidence/transport/electron-harness.json'
  ];
  transports.forEach((capture, index) => {
    fsSync.writeFileSync(path.join(outputDirectory, transportPaths[index]), stableStringify(capture));
  });
  const transportIndex = createPerformanceCaptureIndex({
    schemaVersion: 1,
    experimentId,
    captureKind: 'transport',
    entryCount: 2,
    entries: transports.map((capture, index) => ({
      ledgerSequence: capture.ledgerSequence,
      operationId: capture.operationId,
      observationBoundaryId: capture.observationBoundaryId,
      relativePath: transportPaths[index],
      checksum: capture.checksum
    }))
  });
  fsSync.writeFileSync(path.join(outputDirectory, 'performance-transport-captures.json'), stableStringify(transportIndex));
  const ledger = JSON.parse(fsSync.readFileSync(path.join(outputDirectory, 'performance-ledger.json'), 'utf8'));
  const start = ledger.at(-1).end;
  const marker = fixtureUuid(400);
  ledger.push({
    sequence: 5,
    operationId: 'electron-harness-spawn',
    start,
    end: start,
    purpose: 'transport-probe',
    outcome: 'completed',
    executionIdentity: { externalExecutionId: fixtureUuid(401), executionId: fixtureUuid(403) },
    markerIdentity: {
      operationMarker: marker,
      launchId: marker,
      preloadEchoLaunchId: marker,
      rendererEchoLaunchId: marker
    },
    transportIdentity: { transportId: 'fixture-electron-transport', observationBoundaryId: marker },
    applicationDescendantClosureEnd: start
  });
  fsSync.writeFileSync(path.join(outputDirectory, 'performance-ledger.json'), stableStringify(ledger));
  return { transports, transportIndex };
}

function appendFixturePairLedgerSync({
  outputDirectory,
  pairPlan,
  joins
}: {
  outputDirectory: string;
  pairPlan: ReturnType<typeof createPerformancePairPlan>;
  joins: Array<Record<string, any>>;
}) {
  const ledger = JSON.parse(fsSync.readFileSync(path.join(outputDirectory, 'performance-ledger.json'), 'utf8'));
  const offset = ledger.at(-1).end - 5;
  const suffix = createFixturePerformanceLedger(pairPlan, joins).slice(5).map((entry) => {
    const shifted = { ...entry, start: entry.start + offset, end: entry.end + offset };
    for (const terminal of ['readyAt', 'applicationDescendantClosureEnd', 'closureEnd']) {
      if (terminal in shifted) shifted[terminal] += offset;
    }
    return shifted;
  });
  fsSync.writeFileSync(path.join(outputDirectory, 'performance-ledger.json'), stableStringify([...ledger, ...suffix]));
}

describe('parsePerformanceBaselineArgs', () => {
  it('requires an isolated output directory and accepts the closed experiment roles', () => {
    expect(() => parsePerformanceBaselineArgs([])).toThrow(/--output is required/);
    expect(() => parsePerformanceBaselineArgs(['--output', '.', '--role', 'unknown'])).toThrow(/unsupported experiment role/);
    expect(() => parsePerformanceBaselineArgs(['--output', 'artifacts/performance'])).toThrow(/--role is required/);
    expect(() => parsePerformanceBaselineArgs(['--output', 'artifacts/performance', '--role', 'reference-comparison'])).toThrow(
      /requires --selected-host/
    );
    expect(parsePerformanceBaselineArgs([
      '--output',
      'artifacts/performance',
      '--role',
      'reference-comparison',
      '--selected-host'
    ], {
      cwd: '/workspace'
    })).toEqual({
      outputDirectory: '/workspace/artifacts/performance',
      role: 'reference-comparison',
      selectedHost: true,
      buildOnly: false
    });
  });
});

describe('resolvePerformanceExperimentDeadline', () => {
  it('uses the closed role-specific policy deadline', () => {
    expect(resolvePerformanceExperimentDeadline('ci-integrity')).toBe(10_800);
    expect(resolvePerformanceExperimentDeadline('reference-comparison')).toBe(28_800);
    expect(() => resolvePerformanceExperimentDeadline('unknown' as never)).toThrow(/unsupported experiment role/);
  });
});

describe('performance pre-loop authority', () => {
  it('seals one Electron transport slot and a reference-only qualification slot', () => {
    let sequence = 100;
    const createUuid = () => fixtureUuid(++sequence);
    const reference = createPerformancePreLoopAuthority({
      sourceSha: 'a'.repeat(40),
      policyHash: 'b'.repeat(64),
      experimentId: fixtureUuid(1),
      experimentRole: 'reference-comparison',
      createUuid
    });

    expect(validatePerformancePreLoopAuthority(reference)).toEqual(reference);
    expect(reference.transport).toMatchObject({
      ledgerSequence: 5,
      buildVariant: 'harness-control',
      launchId: reference.transport.operationMarker,
      observationBoundaryId: reference.transport.operationMarker
    });
    expect(reference.qualification).toMatchObject({
      ledgerSequence: 6,
      buildVariant: 'harness-control',
      launchId: reference.qualification?.operationMarker,
      observationBoundaryId: reference.qualification?.operationMarker
    });
    expect(new Set([
      reference.transport.operationMarker,
      reference.transport.executionId,
      reference.transport.externalExecutionId,
      reference.qualification?.operationMarker,
      reference.qualification?.executionId,
      reference.qualification?.externalExecutionId
    ]).size).toBe(6);

    const ci = createPerformancePreLoopAuthority({
      sourceSha: 'a'.repeat(40),
      policyHash: 'b'.repeat(64),
      experimentId: fixtureUuid(2),
      experimentRole: 'ci-integrity',
      createUuid
    });
    expect(ci.qualification).toBeNull();
    expect(() => validatePerformancePreLoopAuthority({ ...ci, qualification: reference.qualification }))
      .toThrow(/qualification authority does not match/);
  });
});

describe('createPerformanceBuildEnvironment', () => {
  it('sets both compile-time switches for each registered build variant', () => {
    expect(createPerformanceBuildEnvironment({ PATH: '/bin' }, PERFORMANCE_BUILD_VARIANTS[0])).toMatchObject({
      PATH: '/bin',
      PRISMGB_PERF_HARNESS_BUILD: '0',
      PRISMGB_PERF_INSTRUMENTATION_BUILD: '0'
    });
    expect(createPerformanceBuildEnvironment({}, PERFORMANCE_BUILD_VARIANTS[2])).toMatchObject({
      PRISMGB_PERF_HARNESS_BUILD: '1',
      PRISMGB_PERF_INSTRUMENTATION_BUILD: '1'
    });
  });
});

describe('createPerformancePairPlan', () => {
  it('uses the exact three-plus-six cardinality and alternates cold-launch order', () => {
    let session = 0;
    const plan = createPerformancePairPlan({
      experimentId: '123e4567-e89b-42d3-a456-426614174000',
      backend: 'canvas2d',
      createSessionId: () => `session-${++session}`
    });

    expect(plan).toMatchObject({ schemaVersion: 3, backend: 'canvas2d', checksum: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(plan.pairs.map((pair) => ({
      comparisonKind: pair.comparisonKind,
      pairIndex: pair.pairIndex,
      launches: pair.attempts[0].launches
    }))).toEqual([
      {
        comparisonKind: 'harness-overhead',
        pairIndex: 1,
        launches: [{ comparisonSide: 'A', executionOrdinal: 1, buildVariant: 'production' }, { comparisonSide: 'B', executionOrdinal: 2, buildVariant: 'harness-control' }]
      },
      {
        comparisonKind: 'harness-overhead',
        pairIndex: 2,
        launches: [{ comparisonSide: 'A', executionOrdinal: 1, buildVariant: 'harness-control' }, { comparisonSide: 'B', executionOrdinal: 2, buildVariant: 'production' }]
      },
      {
        comparisonKind: 'harness-overhead',
        pairIndex: 3,
        launches: [{ comparisonSide: 'A', executionOrdinal: 1, buildVariant: 'production' }, { comparisonSide: 'B', executionOrdinal: 2, buildVariant: 'harness-control' }]
      },
      {
        comparisonKind: 'instrumentation-overhead',
        pairIndex: 1,
        launches: [{ comparisonSide: 'A', executionOrdinal: 1, buildVariant: 'harness-control' }, { comparisonSide: 'B', executionOrdinal: 2, buildVariant: 'instrumented' }]
      },
      {
        comparisonKind: 'instrumentation-overhead',
        pairIndex: 2,
        launches: [{ comparisonSide: 'A', executionOrdinal: 1, buildVariant: 'instrumented' }, { comparisonSide: 'B', executionOrdinal: 2, buildVariant: 'harness-control' }]
      },
      {
        comparisonKind: 'instrumentation-overhead',
        pairIndex: 3,
        launches: [{ comparisonSide: 'A', executionOrdinal: 1, buildVariant: 'harness-control' }, { comparisonSide: 'B', executionOrdinal: 2, buildVariant: 'instrumented' }]
      },
      {
        comparisonKind: 'instrumentation-overhead',
        pairIndex: 4,
        launches: [{ comparisonSide: 'A', executionOrdinal: 1, buildVariant: 'instrumented' }, { comparisonSide: 'B', executionOrdinal: 2, buildVariant: 'harness-control' }]
      },
      {
        comparisonKind: 'instrumentation-overhead',
        pairIndex: 5,
        launches: [{ comparisonSide: 'A', executionOrdinal: 1, buildVariant: 'harness-control' }, { comparisonSide: 'B', executionOrdinal: 2, buildVariant: 'instrumented' }]
      },
      {
        comparisonKind: 'instrumentation-overhead',
        pairIndex: 6,
        launches: [{ comparisonSide: 'A', executionOrdinal: 1, buildVariant: 'instrumented' }, { comparisonSide: 'B', executionOrdinal: 2, buildVariant: 'harness-control' }]
      }
    ]);
    const byKind = (comparisonKind: string) => plan.pairs.filter((pair) => pair.comparisonKind === comparisonKind);
    expect(byKind('harness-overhead')).toHaveLength(3);
    expect(byKind('instrumentation-overhead')).toHaveLength(6);
    expect(byKind('harness-overhead').flatMap((pair) => pair.attempts[0].launches).filter((launch) => launch.buildVariant === 'production')).toHaveLength(3);
    expect(byKind('instrumentation-overhead').filter((pair) => pair.attempts[0].launches[0].buildVariant === 'harness-control')).toHaveLength(3);
    expect(byKind('instrumentation-overhead').filter((pair) => pair.attempts[0].launches[0].buildVariant === 'instrumented')).toHaveLength(3);
    expect(new Set(plan.pairs.flatMap((pair) => pair.attempts.map((attempt) => attempt.metricSessionId))).size).toBe(27);
    expect(plan.pairs.every((pair) => pair.attempts.every((attempt) =>
      stableStringify(attempt.launches) === stableStringify(pair.attempts[0].launches)
    ))).toBe(true);
    expect(Object.isFrozen(plan.pairs[0].attempts[0].launches)).toBe(true);
  });

  it('rejects invalid experiment/backend/session identities', () => {
    expect(() => createPerformancePairPlan({
      experimentId: 'not-a-uuid',
      backend: 'canvas2d'
    })).toThrow(/experimentId/);
    expect(() => createPerformancePairPlan({
      experimentId: '123e4567-e89b-42d3-a456-426614174000',
      backend: 'unknown' as never
    })).toThrow(/backend/);
    expect(() => createPerformancePairPlan({
      experimentId: '123e4567-e89b-42d3-a456-426614174000',
      backend: 'canvas2d',
      createSessionId: () => ''
    })).toThrow(/session ID/);
  });
});

describe('performance launch authority', () => {
  it('seals every preallocated attempt identity while deriving contiguous runtime coordinates', () => {
    let session = 0;
    let identity = 100;
    const pairPlan = createPerformancePairPlan({
      experimentId: fixtureUuid(1),
      backend: 'canvas2d',
      createSessionId: () => `session-${++session}`
    });
    const authority = createPerformanceLaunchAuthority({
      sourceSha: 'a'.repeat(40),
      policyHash: 'b'.repeat(64),
      experimentRole: 'ci-integrity',
      pairPlan,
      createUuid: () => fixtureUuid(++identity)
    });
    const validated = validatePerformanceLaunchAuthority(authority, pairPlan);

    expect(validated.slots).toHaveLength(54);
    expect(validated.slots.slice(0, 6).map((slot) => slot.attemptIndex)).toEqual([1, 1, 2, 2, 3, 3]);
    expect(validated.slots.every((slot) => !('ledgerSequence' in slot) && !('ordinal' in slot))).toBe(true);
    expect(validated.slots[0]).toMatchObject({
      buildVariant: 'production',
      attemptIndex: 1
    });
    expect(validated.slots[0]).not.toHaveProperty('launchId');
    const harnessSlot = validated.slots[1];
    expect(harnessSlot).toMatchObject({
      buildVariant: 'harness-control',
      launchId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      executionId: expect.stringMatching(/^[0-9a-f-]{36}$/)
    });
    expect(harnessSlot.executionId).toBe(harnessSlot.launchId);
    expect(harnessSlot.observationBoundaryId).toBe(harnessSlot.launchId);

    expect(createPerformanceRunJoinFromAuthority({
      authority: validated,
      slot: validated.slots[0],
      ledgerSequence: 8,
      ordinal: 1,
      runtimeIdentity: {
        externalExecutionId: validated.slots[0].externalExecutionId,
        browserPid: 42,
        browserCreationTime: '100'
      }
    })).toMatchObject({
      ledgerSequence: 8,
      ordinal: 1,
      browserPid: 42,
      browserCreationTime: '100'
    });
    expect(createPerformanceRunJoinFromAuthority({
      authority: validated,
      slot: harnessSlot,
      ledgerSequence: 10,
      ordinal: 2,
      runtimeIdentity: {
        externalExecutionId: harnessSlot.externalExecutionId,
        launchId: harnessSlot.launchId,
        executionId: harnessSlot.executionId
      }
    })).toMatchObject({
      ledgerSequence: 10,
      ordinal: 2,
      launchId: harnessSlot.launchId,
      executionId: harnessSlot.executionId
    });
    expect(() => createPerformanceRunJoinFromAuthority({
      authority: validated,
      slot: harnessSlot,
      ledgerSequence: 10,
      ordinal: 2,
      runtimeIdentity: {
        externalExecutionId: harnessSlot.externalExecutionId,
        launchId: fixtureUuid(999),
        executionId: harnessSlot.executionId
      }
    })).toThrow(/does not match its authority slot/);
  });

  it('seals qualified-reference WebGPU attempts and accepts post-Canvas runtime coordinates', () => {
    let session = 0;
    let identity = 500;
    const pairPlan = createPerformancePairPlan({
      experimentId: fixtureUuid(4),
      backend: 'webgpu',
      createSessionId: () => `webgpu-session-${++session}`
    });
    const authority = createPerformanceLaunchAuthority({
      sourceSha: 'a'.repeat(40),
      policyHash: 'b'.repeat(64),
      experimentRole: 'reference-comparison',
      pairPlan,
      createUuid: () => fixtureUuid(++identity)
    });
    const validated = validatePerformanceLaunchAuthority(authority, pairPlan);
    expect(validated.slots).toHaveLength(54);
    expect(createPerformanceRunJoinFromAuthority({
      authority: validated,
      slot: validated.slots[0],
      ledgerSequence: 63,
      ordinal: 19,
      runtimeIdentity: {
        externalExecutionId: validated.slots[0].externalExecutionId,
        browserPid: 42,
        browserCreationTime: '100'
      }
    })).toMatchObject({ ledgerSequence: 63, ordinal: 19 });
    expect(() => createPerformanceLaunchAuthority({
      sourceSha: 'a'.repeat(40),
      policyHash: 'b'.repeat(64),
      experimentRole: 'ci-integrity',
      pairPlan
    })).toThrow(/selected-reference/);
  });
});

describe('finalizePerformancePreLoopBoundary', () => {
  it('preserves producer-sealed qualification bytes, checksums, and actual cleanup timestamps', async () => {
    const outputDirectory = await createTemporaryWorkspace();
    const experimentId = fixtureUuid(450);
    const sourceSha = 'a'.repeat(40);
    const observationBoundaryId = fixtureUuid(451);
    const adapterIdentity = { vendor: 'vendor', architecture: null, device: 'device', description: null };
    const limits = { maxTextureDimension2D: 8192, maxBindGroups: 4 };
    const backendExecutionIdentity = {
      backend: 'webgpu',
      driver: 'webgpu-driver-v1',
      workerProtocol: 'webgpu-worker-ready-v1',
      adapterIdentity,
      limits,
      isFallbackAdapter: false,
      powerPreference: 'low-power'
    };
    const captureBody = {
      schemaVersion: 1,
      experimentId,
      ledgerSequence: 6,
      observationBoundaryId,
      sourceSha,
      policyHash: PERFORMANCE_POLICY_HASH,
      buildVariant: 'harness-control',
      requestedBackend: 'webgpu',
      readinessEvidence: { stages: [{
        backend: 'webgpu',
        backendReadyObservedAt: 12,
        sourceSequence: 1,
        sourceObservedAt: 13,
        terminalFrame: {
          kind: 'worker-frame-acknowledged',
          frameToken: 1,
          submittedAt: 14,
          acknowledgedAt: 15,
          outcome: 'webgpu-queue-submit-completed'
        }
      }] },
      capabilityResult: {
        status: 'available',
        adapterIdentity,
        limits,
        isFallbackAdapter: false,
        strictSelection: { requestedBackend: 'webgpu', powerPreference: 'low-power', forceFallbackAdapter: false }
      },
      transferResult: { status: 'available' },
      selectionResult: {
        qualificationState: 'qualified-webgpu',
        unavailabilityBranch: 'none',
        requestedBackend: 'webgpu',
        selectedBackend: 'webgpu',
        observedBackend: 'webgpu',
        selectionReason: 'webgpu-selected'
      },
      adapterIdentity,
      fallbackState: { isFallbackAdapter: false, branch: null },
      backendExecutionIdentity,
      cleanup: {
        controllerFatalReasons: [],
        listenersRemoved: true,
        restorationOutcome: 'restored',
        applicationDescendantClosureEnd: 42,
        brokerDisposeEnd: 42,
        rootExitObservedAt: 42,
        terminalClosureEnd: 42
      }
    };
    const captureBodyChecksum = canonicalSha256(captureBody);
    const binding = {
      sourceSha,
      policyHash: PERFORMANCE_POLICY_HASH,
      experimentId,
      experimentRole: 'reference-comparison',
      captureKind: 'qualification',
      scopeKind: 'ledger-operation',
      scopeId: 6,
      ledgerSequence: 6,
      operationId: 'electron-harness-spawn',
      observationBoundaryId
    };
    const capture = createPerformanceQualificationCapture({
      experimentId,
      sourceSha,
      policyHash: PERFORMANCE_POLICY_HASH,
      captureKind: 'qualification',
      ledgerSequence: 6,
      observationBoundaryId,
      captureBody,
      captureBodyChecksum,
      rawKinds: [{ rawKind: 'controller-operation', rows: [{
        ...binding,
        controlSequence: 1,
        operationKind: 'request',
        clockDomain: 'electron-main',
        controllerRequestId: 'qualification-request',
        channel: 'browser-window',
        requestKind: 'qualification',
        rawRequest: {},
        sentAt: 12
      }, {
        ...binding,
        controlSequence: 2,
        operationKind: 'response',
        clockDomain: 'electron-main',
        controllerRequestId: 'qualification-request',
        channel: 'browser-window',
        responseKind: 'qualification',
        rawResponse: {},
        receivedAt: 16,
        outcome: 'recorded'
      }] }]
    });
    const relativePath = 'experiment-evidence/qualification.json';
    const qualificationPath = path.join(outputDirectory, relativePath);
    await fs.mkdir(path.dirname(qualificationPath), { recursive: true });
    const qualificationBytes = `${stableStringify(capture)}\n`;
    await fs.writeFile(qualificationPath, qualificationBytes);
    const index = createPerformanceCaptureIndex({
      schemaVersion: 1,
      experimentId,
      captureKind: 'qualification',
      entryCount: 1,
      entries: [{
        ledgerSequence: 6,
        operationId: 'electron-harness-spawn',
        observationBoundaryId,
        relativePath,
        checksum: capture.checksum
      }]
    });
    const indexPath = path.join(outputDirectory, 'performance-qualification-captures.json');
    const indexBytes = `${stableStringify(index)}\n`;
    await fs.writeFile(indexPath, indexBytes);
    const ledger = [
      { sequence: 1, operationId: 'generic-transport-spawn', start: 0, end: 1 },
      { sequence: 2, operationId: 'build-spawn', start: 1, end: 2 },
      { sequence: 3, operationId: 'build-spawn', start: 2, end: 3 },
      { sequence: 4, operationId: 'build-spawn', start: 3, end: 4 },
      { sequence: 5, operationId: 'electron-harness-spawn', start: 4, end: 11, applicationDescendantClosureEnd: 11 },
      {
        sequence: 6,
        operationId: 'electron-harness-spawn',
        start: 11,
        end: 42,
        applicationDescendantClosureEnd: 42,
        capabilityEvidence: { captureBodyChecksum }
      }
    ];
    const ledgerPath = path.join(outputDirectory, 'performance-ledger.json');
    const ledgerBytes = `${stableStringify(ledger)}\n`;
    await fs.writeFile(ledgerPath, ledgerBytes);

    const finalized = await finalizePerformancePreLoopBoundary({
      outputDirectory,
      role: 'reference-comparison'
    });

    expect(finalized.observedEnd).toBe(42);
    expect(finalized.backends).toEqual(['canvas2d', 'webgpu']);
    expect(finalized.qualificationCapture?.checksum).toBe(capture.checksum);
    await expect(fs.readFile(qualificationPath, 'utf8')).resolves.toBe(qualificationBytes);
    await expect(fs.readFile(indexPath, 'utf8')).resolves.toBe(indexBytes);
    await expect(fs.readFile(ledgerPath, 'utf8')).resolves.toBe(ledgerBytes);
  });
});

describe('resolvePerformancePlaywrightCommand', () => {
  it('uses the direct Playwright invocation outside of displayless Linux', () => {
    expect(resolvePerformancePlaywrightCommand({
      cwd: '/workspace',
      platform: 'darwin',
      environment: { PATH: '/bin' },
      isExecutable: vi.fn()
    })).toEqual({
      command: 'npx',
      args: ['playwright', 'test', '--config', 'playwright.performance.config.js']
    });
    expect(resolvePerformancePlaywrightCommand({
      cwd: '/workspace',
      platform: 'linux',
      environment: { DISPLAY: ':99', PATH: '/bin' },
      isExecutable: vi.fn()
    })).toEqual({
      command: 'npx',
      args: ['playwright', 'test', '--config', 'playwright.performance.config.js']
    });
  });

  it('requires and resolves xvfb-run for Linux runs without a display', () => {
    const isExecutable = vi.fn((candidate: string) => candidate === '/fixture/bin/xvfb-run');
    expect(resolvePerformancePlaywrightCommand({
      cwd: '/workspace',
      platform: 'linux',
      environment: { PATH: '/missing:/fixture/bin' },
      isExecutable
    })).toEqual({
      command: '/fixture/bin/xvfb-run',
      args: ['-a', 'npx', 'playwright', 'test', '--config', 'playwright.performance.config.js']
    });
    expect(isExecutable).toHaveBeenCalledWith('/missing/xvfb-run');
    expect(() => resolvePerformancePlaywrightCommand({
      cwd: '/workspace',
      platform: 'linux',
      environment: { PATH: '/missing' },
      isExecutable: () => false
    })).toThrow(/requires xvfb-run -a when DISPLAY is unavailable/);
  });
});

describe('createBundleManifest', () => {
  it('sorts paths and binds each tracked output byte sequence', async () => {
    const directory = await createTemporaryWorkspace();
    await fs.mkdir(path.join(directory, 'nested'));
    await fs.writeFile(path.join(directory, 'z.txt'), 'z');
    await fs.writeFile(path.join(directory, 'nested', 'a.txt'), 'a');

    const manifest = await createBundleManifest(directory);
    expect(manifest.entries.map((entry) => entry.path)).toEqual(['nested/a.txt', 'z.txt']);
    expect(manifest.entries[0]).toEqual({
      path: 'nested/a.txt',
      bytes: 1,
      sha256: crypto.createHash('sha256').update('a').digest('hex')
    });
    expect(manifest.sha256).toBe(
      crypto.createHash('sha256').update(stableStringify(manifest.entries), 'utf8').digest('hex')
    );
    expect(manifest.sha256).not.toBe(
      crypto.createHash('sha256').update(JSON.stringify(manifest.entries), 'utf8').digest('hex')
    );
  });

  it('constructs only the closed v2 build-manifest variant order and canonical bundles', async () => {
    const variants = [];
    for (const variant of PERFORMANCE_BUILD_VARIANTS) {
      const directory = await createTemporaryWorkspace();
      await fs.writeFile(path.join(directory, `${variant.id}.js`), variant.id);
      variants.push({ ...variant, bundle: await createBundleManifest(directory) });
    }

    const manifest = createBuildManifestBody({ sourceSha: 'a'.repeat(40), variants });
    expect(manifest).toEqual({
      schemaVersion: 2,
      sourceSha: 'a'.repeat(40),
      variants
    });
    expect(() => createBuildManifestBody({
      sourceSha: 'a'.repeat(40),
      variants: [variants[1], variants[0], variants[2]]
    })).toThrow(/registered order and flags/);
    expect(() => createBuildManifestBody({
      sourceSha: 'a'.repeat(40),
      variants: variants.map((variant, index) => index === 0
        ? { ...variant, bundle: { ...variant.bundle, sha256: 'f'.repeat(64) } }
        : variant)
    })).toThrow(/aggregate hash/);
  });

  it('derives a separate checksummed production code manifest for all four bundle roots', async () => {
    const directory = await createTemporaryWorkspace();
    await fs.mkdir(path.join(directory, 'main'), { recursive: true });
    await fs.mkdir(path.join(directory, 'preload'), { recursive: true });
    await fs.mkdir(path.join(directory, 'renderer', 'assets'), { recursive: true });
    await fs.writeFile(path.join(directory, 'main', 'index.js'), 'main');
    await fs.writeFile(path.join(directory, 'preload', 'index.js'), 'preload');
    await fs.writeFile(path.join(directory, 'renderer', 'assets', 'main-fixture.js'), 'renderer');
    await fs.writeFile(path.join(directory, 'renderer', 'assets', 'worker-entry-fixture.js'), 'worker');
    const bundle = await createBundleManifest(directory);
    const evidence = createProductionBundleEvidence({
      sourceSha: 'a'.repeat(40),
      variant: { id: 'production', harness: false, instrumentation: false, bundle }
    });

    expect(evidence).toMatchObject({
      schemaVersion: 1,
      sourceSha: 'a'.repeat(40),
      build: { id: 'production', bundleSha256: bundle.sha256 },
      codeByteTotal: 25,
      codeRoots: [
        { id: 'main', entrypoint: { path: 'main/index.js' } },
        { id: 'preload', entrypoint: { path: 'preload/index.js' } },
        { id: 'renderer', entrypoint: { path: 'renderer/assets/main-fixture.js' } },
        { id: 'worker', entrypoint: { path: 'renderer/assets/worker-entry-fixture.js' } }
      ],
      checksum: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
    const { checksum, ...body } = evidence;
    expect(checksum).toBe(
      crypto.createHash('sha256').update(stableStringify(body), 'utf8').digest('hex')
    );
    const entriesWithoutWorker = bundle.entries.filter((entry) => entry.path !== 'renderer/assets/worker-entry-fixture.js');
    expect(() => createProductionBundleEvidence({
      sourceSha: 'a'.repeat(40),
      variant: {
        id: 'production',
        harness: false,
        instrumentation: false,
        bundle: {
          entries: entriesWithoutWorker,
          sha256: crypto.createHash('sha256').update(stableStringify(entriesWithoutWorker), 'utf8').digest('hex')
        }
      }
    })).toThrow(/worker code root is empty/);
  });
});

describe('createPerformanceCommandLedger', () => {
  it('records append-only build closure evidence on one monotonic runner clock', async () => {
    const clock = vi.fn()
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(2.5)
      .mockReturnValueOnce(3)
      .mockReturnValueOnce(4);
    const ledger = createPerformanceCommandLedger({ sourceSha: 'a'.repeat(40), clock });

    await expect(ledger.recordBuild('production', () => 'production-output')).resolves.toBe('production-output');
    await expect(ledger.recordBuild('instrumented', async () => 'instrumented-output')).resolves.toBe('instrumented-output');
    expect(ledger.snapshot()).toEqual({
      schemaVersion: 1,
      sourceSha: 'a'.repeat(40),
      entries: [
        {
          sequence: 1,
          operationId: 'build-spawn',
          start: 1,
          end: 2.5,
          buildId: 'production',
          closure: {
            closed: true,
            stdoutDrained: true,
            stderrDrained: true,
            inputClosed: true,
            exit: { code: 0, durationMs: 1500 },
            zeroSurvivors: true
          }
        },
        {
          sequence: 2,
          operationId: 'build-spawn',
          start: 3,
          end: 4,
          buildId: 'instrumented',
          closure: {
            closed: true,
            stdoutDrained: true,
            stderrDrained: true,
            inputClosed: true,
            exit: { code: 0, durationMs: 1000 },
            zeroSurvivors: true
          }
        }
      ]
    });
  });
});

describe('planned raw capture collection', () => {
  it('indexes the exact six sentinel, six workload, eighteen external metric sides, and nine adapter sessions', async () => {
    const outputDirectory = await createTemporaryWorkspace();
    const sourceSha = 'a'.repeat(40);
    const pairPlan = createFixturePairPlan();
    const manifest = createFixtureManifest();
    const fixtures = writePlannedCaptureFixturesSync({ outputDirectory, pairPlan, manifest, sourceSha });

    const sentinel = await collectPerformanceSentinelCaptures({ outputDirectory, sourceSha, manifest, pairPlan });
    const externalMetric = await collectPerformanceExternalMetricCaptures({
      outputDirectory,
      sourceSha,
      manifest,
      sentinelCaptures: sentinel.captures,
      pairPlan
    });
    const workload = await collectPerformanceWorkloadCaptures({
      outputDirectory,
      sourceSha,
      manifest,
      pairPlan,
      externalMetricCaptures: externalMetric.captures
    });
    const metricSession = await collectPerformanceMetricSessionCaptures({
      outputDirectory,
      sourceSha,
      externalMetricCaptures: externalMetric.captures,
      pairPlan
    });

    expect(sentinel.index).toMatchObject({
      schemaVersion: 7,
      captureKind: 'sentinel',
      sourceSha,
      entries: expect.arrayContaining([
        expect.objectContaining({ buildVariant: 'production', backend: 'canvas2d', comparisonSide: 'A' })
      ])
    });
    expect(sentinel.index.entries).toHaveLength(6);
    expect(externalMetric.index).toMatchObject({ schemaVersion: 4, captureKind: 'external-metric', sourceSha });
    expect(externalMetric.index.entries).toHaveLength(18);
    expect(externalMetric.index.entries.filter((capture) => capture.buildVariant === 'instrumented')).toHaveLength(6);
    expect(workload.index).toMatchObject({ schemaVersion: 9, captureKind: 'workload', sourceSha });
    expect(workload.index.entries).toHaveLength(12);
    expect(workload.index.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        buildVariant: 'harness-control',
        externalExecutionId: expect.stringMatching(/^[0-9a-f-]{36}$/)
      }),
      expect.objectContaining({ buildVariant: 'instrumented' })
    ]));
    expect(metricSession.index).toMatchObject({ schemaVersion: 2, captureKind: 'metric-session', sourceSha });
    expect(metricSession.index.entries).toHaveLength(9);
    expect(metricSession.index.entries[0]).toMatchObject({
      comparisonKind: 'harness-overhead',
      attemptIndex: 1
    });
    expect(fixtures.workloads).toHaveLength(12);
    expect(fixtures.workloads.filter(({ capture }) => capture.join.buildVariant === 'harness-control')).toHaveLength(6);
    expect(fixtures.workloads
      .filter(({ capture }) => capture.join.buildVariant === 'harness-control')
      .every(({ capture }) => capture.rawKinds[0].rows[0].measurementEpochId === null)).toBe(true);
    expect(fixtures.metricSessions).toHaveLength(9);
    await expect(fs.readFile(sentinel.indexPath, 'utf8')).resolves.toContain(fixtures.sentinels[0].relativePath);
  });

  it('rejects a planned capture whose build variant is absent from the manifest', async () => {
    const outputDirectory = await createTemporaryWorkspace();
    const pairPlan = createFixturePairPlan();
    const manifest = createFixtureManifest();
    writePlannedCaptureFixturesSync({ outputDirectory, pairPlan, manifest });
    const mismatchedManifest = {
      variants: manifest.variants.filter((variant) => variant.id !== 'harness-control')
    };

    await expect(collectPerformanceSentinelCaptures({
      outputDirectory,
      sourceSha: 'a'.repeat(40),
      manifest: mismatchedManifest,
      pairPlan
    })).rejects.toThrow(/build variant does not exist in the build manifest/);
  });

  it('rejects a harness metric transcript whose pair side does not bind the sentinel boundary', async () => {
    const outputDirectory = await createTemporaryWorkspace();
    const pairPlan = createFixturePairPlan();
    const manifest = createFixtureManifest();
    const fixtures = writePlannedCaptureFixturesSync({ outputDirectory, pairPlan, manifest });
    const sentinel = await collectPerformanceSentinelCaptures({
      outputDirectory,
      sourceSha: 'a'.repeat(40),
      manifest,
      pairPlan
    });
    const malformedSentinels = sentinel.captures.map((entry, index) => index === 0
      ? { ...entry, capture: { ...entry.capture, join: { ...entry.capture.join, observationBoundaryId: 'different-boundary' } } }
      : entry);

    await expect(collectPerformanceExternalMetricCaptures({
      outputDirectory,
      sourceSha: 'a'.repeat(40),
      manifest,
      sentinelCaptures: malformedSentinels,
      pairPlan
    })).rejects.toThrow(/does not bind the sentinel run join/);
    expect(fixtures.metrics).toHaveLength(18);
  });

  it('rejects an instrumentation workload that does not bind its external metric execution', async () => {
    const outputDirectory = await createTemporaryWorkspace();
    const pairPlan = createFixturePairPlan();
    const manifest = createFixtureManifest();
    const fixtures = writePlannedCaptureFixturesSync({ outputDirectory, pairPlan, manifest });
    const sentinel = await collectPerformanceSentinelCaptures({
      outputDirectory,
      sourceSha: 'a'.repeat(40),
      manifest,
      pairPlan
    });
    const externalMetric = await collectPerformanceExternalMetricCaptures({
      outputDirectory,
      sourceSha: 'a'.repeat(40),
      manifest,
      sentinelCaptures: sentinel.captures,
      pairPlan
    });
    const original = fixtures.workloads[0];
    const externalExecutionId = fixtureUuid(999);
    const join = {
      ...original.capture.join,
      externalExecutionId,
      observationBoundaryId: fixtureUuid(1000)
    };
    const malformed = createPerformanceWorkloadCapture({
      experimentId: original.capture.experimentId,
      sourceSha: original.capture.sourceSha,
      policyHash: original.capture.policyHash,
      captureKind: 'workload',
      join,
      rawKinds: rebindRunRawKinds(original.capture.rawKinds, join, 'workload')
    });
    await fs.rm(path.join(outputDirectory, original.relativePath));
    await fs.writeFile(
      path.join(outputDirectory, `raw-workload-captures/${malformed.checksum}.json`),
      JSON.stringify(malformed)
    );

    await expect(collectPerformanceWorkloadCaptures({
      outputDirectory,
      sourceSha: 'a'.repeat(40),
      manifest,
      pairPlan,
      externalMetricCaptures: externalMetric.captures
    })).rejects.toThrow(/does not bind the external metric run join/);
  });

  it('rejects a metric session capture that does not bind a planned session', async () => {
    const outputDirectory = await createTemporaryWorkspace();
    const pairPlan = createFixturePairPlan();
    const manifest = createFixtureManifest();
    const fixtures = writePlannedCaptureFixturesSync({ outputDirectory, pairPlan, manifest });
    const sentinel = await collectPerformanceSentinelCaptures({
      outputDirectory,
      sourceSha: 'a'.repeat(40),
      manifest,
      pairPlan
    });
    const externalMetric = await collectPerformanceExternalMetricCaptures({
      outputDirectory,
      sourceSha: 'a'.repeat(40),
      manifest,
      sentinelCaptures: sentinel.captures,
      pairPlan
    });
    const original = fixtures.metricSessions[0];
    const join = { ...original.capture.join, metricSessionId: 'different-session' };
    const malformed = createPerformanceMetricSessionCapture({
      experimentId: original.capture.experimentId,
      sourceSha: original.capture.sourceSha,
      policyHash: original.capture.policyHash,
      captureKind: 'metric-session',
      join,
      rawKinds: original.capture.rawKinds.map((group: any) => ({
        ...group,
        rows: group.rows.map((row: any) => ({ ...row, scopeId: join.metricSessionId, metricSessionId: join.metricSessionId }))
      }))
    });
    await fs.rm(path.join(outputDirectory, original.relativePath));
    const relativePath = `raw-metric-session-captures/${malformed.checksum}.json`;
    await fs.writeFile(path.join(outputDirectory, relativePath), JSON.stringify(malformed));

    await expect(collectPerformanceMetricSessionCaptures({
      outputDirectory,
      sourceSha: 'a'.repeat(40),
      externalMetricCaptures: externalMetric.captures,
      pairPlan
    })).rejects.toThrow(/does not bind one planned metric session/);
  });
});

describe('runPerformanceBaseline', () => {
  it('clean-builds and preserves all three variant bundles before invoking the performance lane', async () => {
    const cwd = await createTemporaryWorkspace();
    const calls: Array<{ command: string; args: readonly string[]; environment: NodeJS.ProcessEnv }> = [];
    const spawn = vi.fn((command: string, args: readonly string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => {
      calls.push({ command, args, environment: options.env });
      if (command === 'git' && args[0] === 'status') {
        return { status: 0, stdout: '', stderr: '' };
      }

      if (command === 'git' && args[0] === 'rev-parse') {
        return { status: 0, stdout: `${'a'.repeat(40)}\n`, stderr: '' };
      }

      if (command === 'npm') {
        const variant = `${options.env.PRISMGB_PERF_HARNESS_BUILD}:${options.env.PRISMGB_PERF_INSTRUMENTATION_BUILD}`;
        const dist = path.join(options.cwd, 'dist');
        fsSync.mkdirSync(path.join(dist, 'main'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'preload'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'renderer'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'renderer', 'assets'), { recursive: true });
        fsSync.writeFileSync(path.join(dist, 'main', 'index.js'), `main:${variant}`);
        fsSync.writeFileSync(path.join(dist, 'preload', 'index.js'), `preload:${variant}`);
        fsSync.writeFileSync(path.join(dist, 'renderer', 'index.js'), `renderer:${variant}`);
        fsSync.writeFileSync(path.join(dist, 'renderer', 'assets', 'main-fixture.js'), `renderer-entry:${variant}`);
        fsSync.writeFileSync(path.join(dist, 'renderer', 'assets', 'worker-entry-fixture.js'), `worker:${variant}`);
        return { status: 0, stdout: '', stderr: '' };
      }

      throw new Error(`unexpected command ${command}`);
    });

    const result = await runPerformanceBaseline({
      cwd,
      argv: ['--output', 'performance-output', '--role', 'ci-integrity', '--build-only'],
      baseEnvironment: { PATH: '/bin', DISPLAY: ':99' },
      spawn: spawn as unknown as typeof spawnSync,
      platform: 'linux'
    });

    expect(result.playwrightExecuted).toBe(false);
    expect(result.selectedHost).toBe(false);
    expect(result.manifest.sourceSha).toBe('a'.repeat(40));
    expect(result.manifest.variants.map((variant) => variant.id)).toEqual([
      'production',
      'harness-control',
      'instrumented'
    ]);
    expect(calls.filter((call) => call.command === 'npm').map((call) => [
      call.environment.PRISMGB_PERF_HARNESS_BUILD,
      call.environment.PRISMGB_PERF_INSTRUMENTATION_BUILD
    ])).toEqual([
      ['0', '0'],
      ['1', '0'],
      ['1', '1']
    ]);
    await expect(fs.readFile(path.join(result.buildsDirectory, 'instrumented', 'main', 'index.js'), 'utf8'))
      .resolves.toBe('main:1:1');
    await expect(fs.readFile(result.manifestPath, 'utf8')).resolves.toContain('"harness-control"');
    expect(result.productionBundleEvidence).toMatchObject({
      sourceSha: 'a'.repeat(40),
      build: { id: 'production', harness: false, instrumentation: false },
      codeRoots: [
        { id: 'main' },
        { id: 'preload' },
        { id: 'renderer' },
        { id: 'worker' }
      ]
    });
    await expect(fs.readFile(result.productionBundleEvidencePath, 'utf8')).resolves.toContain('worker-entry-fixture.js');
    await expect(fs.readFile(result.commandLedgerPath, 'utf8')).resolves.toContain('"build-spawn"');
    expect(result.commandLedger.entries.map((entry) => entry.buildId)).toEqual([
      'production',
      'harness-control',
      'instrumented'
    ]);
  });

  it('retains command stdout and stderr when the performance lane fails', async () => {
    const cwd = await createTemporaryWorkspace();
    const spawn = vi.fn((command: string, args: readonly string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => {
      if (command === 'git' && args[0] === 'status') return { status: 0, stdout: '', stderr: '' };
      if (command === 'git' && args[0] === 'rev-parse') return { status: 0, stdout: `${'a'.repeat(40)}\n`, stderr: '' };
      if (command === 'npm') {
        const dist = path.join(options.cwd, 'dist');
        fsSync.mkdirSync(path.join(dist, 'main'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'preload'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'renderer'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'renderer', 'assets'), { recursive: true });
        fsSync.writeFileSync(path.join(dist, 'main', 'index.js'), 'main');
        fsSync.writeFileSync(path.join(dist, 'preload', 'index.js'), 'preload');
        fsSync.writeFileSync(path.join(dist, 'renderer', 'index.js'), 'renderer');
        fsSync.writeFileSync(path.join(dist, 'renderer', 'assets', 'main-fixture.js'), 'renderer-entry');
        fsSync.writeFileSync(path.join(dist, 'renderer', 'assets', 'worker-entry-fixture.js'), 'worker');
        return { status: 0, stdout: '', stderr: '' };
      }
      if (command === 'npx') return { status: 1, stdout: 'playwright assertion detail', stderr: 'playwright warning' };
      throw new Error(`unexpected command ${command}`);
    });

    await expect(runPerformanceBaseline({
      cwd,
      argv: ['--output', 'performance-output', '--role', 'ci-integrity'],
      baseEnvironment: { PATH: '/bin', DISPLAY: ':99' },
      spawn: spawn as unknown as typeof spawnSync,
      platform: 'linux'
    })).rejects.toThrow(/playwright assertion detail[\s\S]*playwright warning/);
  });

  it('fails the performance lane when the runner deadline terminates Playwright', async () => {
    const cwd = await createTemporaryWorkspace();
    const spawn = vi.fn((command: string, args: readonly string[], options: { cwd: string }) => {
      if (command === 'git' && args[0] === 'status') return { status: 0, stdout: '', stderr: '' };
      if (command === 'git' && args[0] === 'rev-parse') return { status: 0, stdout: `${'a'.repeat(40)}\n`, stderr: '' };
      if (command === 'npm') {
        const dist = path.join(options.cwd, 'dist');
        fsSync.mkdirSync(path.join(dist, 'main'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'preload'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'renderer'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'renderer', 'assets'), { recursive: true });
        fsSync.writeFileSync(path.join(dist, 'main', 'index.js'), 'main');
        fsSync.writeFileSync(path.join(dist, 'preload', 'index.js'), 'preload');
        fsSync.writeFileSync(path.join(dist, 'renderer', 'index.js'), 'renderer');
        fsSync.writeFileSync(path.join(dist, 'renderer', 'assets', 'main-fixture.js'), 'renderer-entry');
        fsSync.writeFileSync(path.join(dist, 'renderer', 'assets', 'worker-entry-fixture.js'), 'worker');
        return { status: 0, stdout: '', stderr: '' };
      }
      if (command === 'npx') {
        const error = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
        return { error, status: null, stdout: '', stderr: '' };
      }
      throw new Error(`unexpected command ${command}`);
    });

    await expect(runPerformanceBaseline({
      cwd,
      argv: ['--output', 'performance-output', '--role', 'ci-integrity'],
      baseEnvironment: { PATH: '/bin', DISPLAY: ':99' },
      spawn: spawn as unknown as typeof spawnSync,
      platform: 'linux'
    })).rejects.toThrow(/exceeded its 10800-second deadline/);
  });

  it('rejects a Playwright command that returns after the role deadline', async () => {
    const cwd = await createTemporaryWorkspace();
    const clock = vi.fn()
      .mockReturnValueOnce(1)
      .mockReturnValue(10_820);
    const spawn = vi.fn((command: string, args: readonly string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => {
      if (command === 'git' && args[0] === 'status') return { status: 0, stdout: '', stderr: '' };
      if (command === 'git' && args[0] === 'rev-parse') return { status: 0, stdout: `${'a'.repeat(40)}\n`, stderr: '' };
      if (command === 'npm') {
        const dist = path.join(options.cwd, 'dist');
        fsSync.mkdirSync(path.join(dist, 'main'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'preload'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'renderer'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'renderer', 'assets'), { recursive: true });
        fsSync.writeFileSync(path.join(dist, 'main', 'index.js'), 'main');
        fsSync.writeFileSync(path.join(dist, 'preload', 'index.js'), 'preload');
        fsSync.writeFileSync(path.join(dist, 'renderer', 'index.js'), 'renderer');
        fsSync.writeFileSync(path.join(dist, 'renderer', 'assets', 'main-fixture.js'), 'renderer-entry');
        fsSync.writeFileSync(path.join(dist, 'renderer', 'assets', 'worker-entry-fixture.js'), 'worker');
        return { status: 0, stdout: '', stderr: '' };
      }
      if (command === 'npx') {
        if (options.env.PRISMGB_PERFORMANCE_EXECUTION_PHASE === 'pre-loop') {
          const outputDirectory = options.env.PRISMGB_PERFORMANCE_CAPTURE_OUTPUT;
          const experimentId = options.env.PRISMGB_PERFORMANCE_EXPERIMENT_ID;
          if (!outputDirectory || !experimentId) throw new Error('expected pre-loop output environment');
          writeFixturePreLoopEvidenceSync({ outputDirectory, experimentId, sourceSha: 'a'.repeat(40) });
        }
        return { status: 0, stdout: '', stderr: '' };
      }
      throw new Error(`unexpected command ${command}`);
    });

    await expect(runPerformanceBaseline({
      cwd,
      argv: ['--output', 'performance-output', '--role', 'ci-integrity'],
      baseEnvironment: { PATH: '/bin', DISPLAY: ':99' },
      spawn: spawn as unknown as typeof spawnSync,
      platform: 'linux',
      clock
    })).rejects.toThrow(/ci-integrity performance experiment exceeded its 10800-second deadline/);
  });

  it('indexes the exact planned raw capture set produced by the Playwright lane', async () => {
    const cwd = await createTemporaryWorkspace();
    const spawn = vi.fn((command: string, args: readonly string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => {
      if (command === 'git' && args[0] === 'status') return { status: 0, stdout: '', stderr: '' };
      if (command === 'git' && args[0] === 'rev-parse') return { status: 0, stdout: `${'a'.repeat(40)}\n`, stderr: '' };
      if (command === 'npm') {
        const dist = path.join(options.cwd, 'dist');
        fsSync.mkdirSync(path.join(dist, 'main'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'preload'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'renderer'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'renderer', 'assets'), { recursive: true });
        fsSync.writeFileSync(path.join(dist, 'main', 'index.js'), `main:${options.env.PRISMGB_PERF_INSTRUMENTATION_BUILD}`);
        fsSync.writeFileSync(path.join(dist, 'preload', 'index.js'), `preload:${options.env.PRISMGB_PERF_INSTRUMENTATION_BUILD}`);
        fsSync.writeFileSync(path.join(dist, 'renderer', 'index.js'), `renderer:${options.env.PRISMGB_PERF_INSTRUMENTATION_BUILD}`);
        fsSync.writeFileSync(path.join(dist, 'renderer', 'assets', 'main-fixture.js'), `renderer-entry:${options.env.PRISMGB_PERF_INSTRUMENTATION_BUILD}`);
        fsSync.writeFileSync(path.join(dist, 'renderer', 'assets', 'worker-entry-fixture.js'), `worker:${options.env.PRISMGB_PERF_INSTRUMENTATION_BUILD}`);
        return { status: 0, stdout: '', stderr: '' };
      }
      if (command === 'npx') {
        const manifestPath = options.env.PRISMGB_PERFORMANCE_BUILD_MANIFEST;
        const outputDirectory = options.env.PRISMGB_PERFORMANCE_CAPTURE_OUTPUT;
        const experimentId = options.env.PRISMGB_PERFORMANCE_EXPERIMENT_ID;
        if (!manifestPath || !outputDirectory || !experimentId) throw new Error('expected performance output environment');
        if (options.env.PRISMGB_PERFORMANCE_EXECUTION_PHASE === 'pre-loop') {
          writeFixturePreLoopEvidenceSync({ outputDirectory, experimentId, sourceSha: 'a'.repeat(40) });
          return { status: 0, stdout: '', stderr: '' };
        }
        const pairPlanPath = options.env.PRISMGB_PERFORMANCE_PAIR_PLAN;
        if (!pairPlanPath) throw new Error('expected performance pair plan');
        const manifest = JSON.parse(fsSync.readFileSync(manifestPath, 'utf8'));
        const pairPlan = JSON.parse(fsSync.readFileSync(pairPlanPath, 'utf8'));
        if (pairPlan.pairs.length !== 9) throw new Error('expected the exact performance pair plan');
        const captures = writePlannedCaptureFixturesSync({
          outputDirectory,
          pairPlan,
          manifest,
          sourceSha: 'a'.repeat(40)
        });
        appendFixturePairLedgerSync({ outputDirectory, pairPlan, joins: captures.joins });
        return { status: 0, stdout: '', stderr: '' };
      }
      throw new Error(`unexpected command ${command}`);
    });

    const result = await runPerformanceBaseline({
      cwd,
      argv: ['--output', 'performance-output', '--role', 'ci-integrity'],
      baseEnvironment: { PATH: '/bin', DISPLAY: ':99' },
      spawn: spawn as unknown as typeof spawnSync,
      platform: 'linux'
    });

    if (result.playwrightExecuted !== true) throw new Error('expected the Playwright lane to execute');
    expect(result.experimentDeadlineSeconds).toBe(10_800);
    expect(result.experimentElapsedSeconds).toBeGreaterThanOrEqual(0);
    expect(spawn.mock.calls.filter(([command]) => command === 'npx').map(([, , options]) => (
      options.env.PRISMGB_PERFORMANCE_EXECUTION_PHASE
    ))).toEqual(['pre-loop', 'pair-loop']);
    const playwrightCall = spawn.mock.calls.find(([command]) => command === 'npx');
    expect(playwrightCall?.[2]).toMatchObject({
      timeout: 10_800_000,
      env: {
        PRISMGB_PERFORMANCE_ROLE: 'ci-integrity',
        PRISMGB_PERFORMANCE_EXPERIMENT_DEADLINE_SECONDS: '10800'
      }
    });
    const environmentRows = result.experimentEnvironment.capture.rawKinds[0].rows;
    expect(environmentRows.filter((row) => row.observedAt === result.pairLoopStart)).toEqual([
      expect.objectContaining({
        source: 'external-monitor',
        observationKind: 'poll-snapshot',
        rawAdapterKind: 'external-host-snapshot-v1',
        clockDomain: 'runner'
      })
    ]);
    const canonicalLedger = JSON.parse(await fs.readFile(path.join(cwd, 'performance-output', 'performance-ledger.json'), 'utf8'));
    const targetPair = result.pairPlan.pairs[1];
    const targetAttempt = targetPair.attempts[0];
    const targetLaunches = canonicalLedger.filter((entry: Record<string, any>) => (
      entry.metricSessionId === targetAttempt.metricSessionId && entry.purpose === 'measurement-side'
    ));
    const targetCloseIndex = canonicalLedger.findIndex((entry: Record<string, any>) => (
      entry.metricSessionId === targetAttempt.metricSessionId && entry.operationId === 'metric-adapter-session-close'
    ));
    if (targetCloseIndex < 0) throw new Error('expected later-pair terminal ledger authority');
    const bridgeLedger = canonicalLedger.slice(0, targetCloseIndex + 1);
    const pollTemplate = environmentRows.find((row) => row.observationKind === 'poll-snapshot');
    if (!pollTemplate || targetLaunches.length !== 2) throw new Error('expected later-pair environment fixture authority');
    const stableEnvironmentRows = [
      { observedAt: targetLaunches[0].start - 0.001 },
      { observedAt: targetLaunches[0].end },
      { observedAt: targetLaunches[1].end }
    ].map((timing, index) => ({
      ...pollTemplate,
      sourceSequence: index + 1,
      runnerReceiptSequence: index + 1,
      ...timing
    }));
    const captureGroups = [
      ...result.sentinelCapture.captures.filter(({ capture }) => capture.join.metricSessionId === targetAttempt.metricSessionId).map(({ capture }) => capture),
      ...result.externalMetricCapture.captures.filter(({ capture }) => capture.join.metricSessionId === targetAttempt.metricSessionId).map(({ capture }) => capture),
      ...result.metricSessionCapture.captures.filter(({ capture }) => capture.join.metricSessionId === targetAttempt.metricSessionId).map(({ capture }) => capture)
    ];
    expect(assessCapturedPerformancePairAttempt({
      ledger: bridgeLedger,
      target: { backend: 'canvas2d', comparisonKind: 'harness-overhead', pairIndex: 2, attemptIndex: 1 },
      captureGroups,
      environmentRows: stableEnvironmentRows
    })).toEqual({ disposition: 'accepted', reason: null, retryAllowed: false, nextAttemptIndex: null });
    expect(() => assessCapturedPerformancePairAttempt({
      ledger: bridgeLedger,
      target: { backend: 'canvas2d', comparisonKind: 'harness-overhead', pairIndex: 2, attemptIndex: 2 },
      captureGroups,
      environmentRows: stableEnvironmentRows
    })).toThrow(/latest completed attempt/);
    expect(JSON.parse(await fs.readFile(path.join(cwd, 'performance-output', 'performance-ledger.json'), 'utf8'))
      .slice(0, 5).map((entry: { operationId: string }) => entry.operationId)).toEqual([
      'generic-transport-spawn',
      'build-spawn',
      'build-spawn',
      'build-spawn',
      'electron-harness-spawn'
    ]);
    expect(result.workloadCapture.index).toMatchObject({
      sourceSha: 'a'.repeat(40)
    });
    expect(result.workloadCapture.index.entries).toHaveLength(12);
    expect(result.workloadCapture.index.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ buildVariant: 'harness-control' }),
        expect.objectContaining({ buildVariant: 'instrumented' })
      ])
    );
    expect(result.sentinelCapture.index).toMatchObject({
      sourceSha: 'a'.repeat(40)
    });
    expect(result.sentinelCapture.index.entries).toHaveLength(6);
    expect(result.sentinelCapture.index.entries).toEqual(
      expect.arrayContaining([expect.objectContaining({ buildVariant: 'harness-control', backend: 'canvas2d' })])
    );
    expect(result.externalMetricCapture.index).toMatchObject({
      sourceSha: 'a'.repeat(40)
    });
    expect(result.externalMetricCapture.index.entries).toHaveLength(18);
    expect(result.externalMetricCapture.index.entries).toEqual(
      expect.arrayContaining([expect.objectContaining({ buildVariant: 'harness-control' })])
    );
    expect(result.metricSessionCapture.index).toMatchObject({
      sourceSha: 'a'.repeat(40)
    });
    expect(result.metricSessionCapture.index.entries).toHaveLength(9);
    expect(result.metricSessionCapture.index.entries).toEqual(
      expect.arrayContaining([expect.objectContaining({ comparisonKind: 'harness-overhead' })])
    );
    expect(result.rawCaptureManifest.manifest).toMatchObject({
      schemaVersion: 2,
      mode: 'ci-core',
      evaluationContext: {
        sourceSha: 'a'.repeat(40),
        experimentRole: 'ci-integrity',
        experimentId: result.experimentId
      },
      backendFamilies: ['canvas2d'],
      memberReferences: {
        buildCommandLedger: { relativePath: 'performance-command-ledger.json' },
        performanceLedger: { relativePath: 'performance-ledger.json' },
        experimentEvidence: {
          indexes: {
            environment: { relativePath: 'performance-experiment-environment.json' },
            transport: { relativePath: 'performance-transport-captures.json' }
          }
        }
      }
    });
    expect(result.pairPlan).toMatchObject({ backend: 'canvas2d', pairs: expect.any(Array) });
    await expect(fs.readFile(result.pairPlanPath, 'utf8')).resolves.toContain('instrumentation-overhead');
    await expect(fs.readFile(result.workloadCapture.indexPath, 'utf8')).resolves.toContain('raw-workload-captures/');
    await expect(fs.readFile(result.sentinelCapture.indexPath, 'utf8')).resolves.toContain('raw-sentinel-captures/');
    await expect(fs.readFile(result.externalMetricCapture.indexPath, 'utf8')).resolves.toContain('raw-external-metric-captures/');
    await expect(fs.readFile(result.metricSessionCapture.indexPath, 'utf8')).resolves.toContain('raw-metric-session-captures/');
    await expect(readPerformanceRawCaptureManifest({ outputDirectory: path.join(cwd, 'performance-output') })).resolves.toMatchObject({
      manifest: result.rawCaptureManifest.manifest,
      buildCommandLedger: result.commandLedger
    });
    await fs.rm(path.join(
      cwd,
      'performance-output',
      result.workloadCapture.index.entries[0].relativePath
    ));
    await expect(readPerformanceRawCaptureManifest({ outputDirectory: path.join(cwd, 'performance-output') }))
      .rejects.toThrow(/workload capture 0 is unreadable/);
  });

  it('rejects a passing Playwright lane that does not persist its workload capture', async () => {
    const cwd = await createTemporaryWorkspace();
    const spawn = vi.fn((command: string, args: readonly string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => {
      if (command === 'git' && args[0] === 'status') return { status: 0, stdout: '', stderr: '' };
      if (command === 'git' && args[0] === 'rev-parse') return { status: 0, stdout: `${'a'.repeat(40)}\n`, stderr: '' };
      if (command === 'npm') {
        const dist = path.join(options.cwd, 'dist');
        fsSync.mkdirSync(path.join(dist, 'main'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'preload'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'renderer'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'renderer', 'assets'), { recursive: true });
        fsSync.writeFileSync(path.join(dist, 'main', 'index.js'), 'main');
        fsSync.writeFileSync(path.join(dist, 'preload', 'index.js'), 'preload');
        fsSync.writeFileSync(path.join(dist, 'renderer', 'index.js'), 'renderer');
        fsSync.writeFileSync(path.join(dist, 'renderer', 'assets', 'main-fixture.js'), 'renderer-entry');
        fsSync.writeFileSync(path.join(dist, 'renderer', 'assets', 'worker-entry-fixture.js'), 'worker');
        return { status: 0, stdout: '', stderr: '' };
      }
      if (command === 'npx') {
        const manifestPath = options.env.PRISMGB_PERFORMANCE_BUILD_MANIFEST;
        const outputDirectory = options.env.PRISMGB_PERFORMANCE_CAPTURE_OUTPUT;
        const experimentId = options.env.PRISMGB_PERFORMANCE_EXPERIMENT_ID;
        if (!manifestPath || !outputDirectory || !experimentId) throw new Error('expected performance output environment');
        if (options.env.PRISMGB_PERFORMANCE_EXECUTION_PHASE === 'pre-loop') {
          writeFixturePreLoopEvidenceSync({ outputDirectory, experimentId, sourceSha: 'a'.repeat(40) });
          return { status: 0, stdout: '', stderr: '' };
        }
        const pairPlanPath = options.env.PRISMGB_PERFORMANCE_PAIR_PLAN;
        if (!pairPlanPath) throw new Error('expected performance pair plan');
        writePlannedCaptureFixturesSync({
          outputDirectory,
          manifest: JSON.parse(fsSync.readFileSync(manifestPath, 'utf8')),
          pairPlan: JSON.parse(fsSync.readFileSync(pairPlanPath, 'utf8')),
          sourceSha: 'a'.repeat(40)
        });
        fsSync.rmSync(path.join(outputDirectory, 'raw-workload-captures'), { recursive: true, force: true });
        return { status: 0, stdout: '', stderr: '' };
      }
      throw new Error(`unexpected command ${command}`);
    });

    await expect(runPerformanceBaseline({
      cwd,
      argv: ['--output', 'performance-output', '--role', 'ci-integrity'],
      baseEnvironment: { PATH: '/bin', DISPLAY: ':99' },
      spawn: spawn as unknown as typeof spawnSync,
      platform: 'linux'
    })).rejects.toThrow(/instrumentation workload captures are missing the first planned attempt/);
  });

  it('rejects a dirty source tree before building any variant', async () => {
    const cwd = await createTemporaryWorkspace();
    const spawn = vi.fn((command: string, args: readonly string[]) => {
      if (command === 'git' && args[0] === 'status') {
        return { status: 0, stdout: ' M src/main/index.ts\n', stderr: '' };
      }
      throw new Error(`unexpected command ${command}`);
    });

    await expect(runPerformanceBaseline({
      cwd,
      argv: ['--output', 'performance-output', '--role', 'ci-integrity', '--build-only'],
      baseEnvironment: { PATH: '/bin' },
      spawn: spawn as unknown as typeof spawnSync,
      platform: 'linux'
    })).rejects.toThrow(/source tree must be clean/);
    expect(spawn).toHaveBeenCalledTimes(1);
    await expect(fs.access(path.join(cwd, 'performance-output'))).rejects.toThrow();
  });
});
