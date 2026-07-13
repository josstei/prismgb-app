import { describe, expect, it } from 'vitest';
import { canonicalSha256 } from '../../../scripts/lib/baseline-report.js';
import { createEvidenceStore } from '../../../scripts/lib/baseline-evidence-store.js';
import {
  assessPerformancePairAttempt,
  classifyFailure,
  computeComparisonFingerprint,
  computeQualificationFingerprint,
  collectPerformanceCaptureRows,
  createPerformanceEvaluatorInput,
  createPerformanceEvaluationBody,
  createPerformanceRawArchive,
  decodePerformanceEvidence,
  deriveAllocationEvidence,
  deriveAllocationExpectedCoverage,
  deriveCpuScore,
  deriveCpuWindow,
  deriveQualificationCapture,
  deriveAcceptedInstrumentedLedgerRuns,
  encodePerformanceEvidence,
  evaluatePerformanceExperiment,
  finalizeCiCanvasPerformanceExperiment,
  loadBaselinePolicy,
  requirePublishablePerformanceEvidence,
  reconstructPerformanceRawEvidence,
  validateBaselinePolicy,
  validatePerformanceLedger
} from '../../../scripts/lib/performance-evidence.js';

const hash = 'a'.repeat(64);
const compiledPolicy = loadBaselinePolicy();
const policyHash = compiledPolicy.policyHash;
const experimentId = '00000000-0000-4000-8000-000000000000';
const runtimeCallbackCount = compiledPolicy.policy.performanceLimits.window.minimumCallbacks;

function sourceSequences(count: number) {
  return Array.from({ length: count }, (_, index) => index + 1);
}

function runtimeSourceSequences() {
  return sourceSequences(runtimeCallbackCount);
}

function cpuRawRow(runId: string, ordinal: number, total = 2) {
  const readStart = ordinal * 0.5;
  const readEnd = readStart + 0.01;
  return {
    adapterId: 'linux-procfs-v1',
    attemptIndex: 1,
    backend: 'canvas2d',
    buildVariant: 'production',
    captureKind: 'external-metric',
    comparisonKind: 'harness-overhead',
    comparisonSide: 'A',
    counterQuantumSeconds: 0.01,
    creationIdentity: '1',
    cumulativeCpuSeconds: ordinal / 100,
    experimentId,
    experimentRole: 'ci-integrity',
    externalExecutionId: `${runId}-execution`,
    launchOrdinal: 1,
    ledgerSequence: 1,
    metricSessionId: `${runId}-session`,
    observationBoundaryId: `${runId}-boundary`,
    ordinal,
    pairIndex: 1,
    pairPlanChecksum: hash,
    pid: 1,
    policyHash,
    processIdentity: `${runId}-identity`,
    rawAdapterKind: 'linux-procfs-v1',
    rawAdapterSample: {
      adapterSample: {
        pid: 1,
        userTicks: ordinal,
        systemTicks: 0,
        startTicks: 1,
        residentPages: 32768,
        pageSize: 4096,
        clockTicks: 100
      },
      readStart,
      readEnd
    },
    readEnd,
    readStart,
    runId,
    samplePhase: ordinal === 1 ? 'prime' : ordinal === total ? 'terminal-closure' : 'in-window',
    scopeId: runId,
    scopeKind: 'run',
    sourceSha: runtimeEvidenceProvenance.captureProvenance.sourceSha,
    workingSetMiB: 128
  };
}

const runtimeEvidenceProvenance = {
  kind: 'runtime-capture' as const,
  captureProvenance: {
    provider: 'local' as const,
    sourceSha: '9a7839ce47c61982f6eab836c496b8469f01a9ca',
    analysisSha256: '0c6a4ccbe48b9b12e4c58bd153ae6f5c04bed82fb489c5a2402d21934b4c8fba',
    captureSessionId: 'performance-evidence-test',
    producer: { role: 'test', targetId: null, reportSetId: 'test-set' }
  }
};

const ciRuntimeEvidenceProvenance = {
  kind: 'runtime-capture' as const,
  captureProvenance: {
    provider: 'github-actions' as const,
    sourceSha: '9a7839ce47c61982f6eab836c496b8469f01a9ca',
    analysisSha256: '0c6a4ccbe48b9b12e4c58bd153ae6f5c04bed82fb489c5a2402d21934b4c8fba',
    repository: 'prismgb/prismgb-app',
    workflowRef: 'prismgb/prismgb-app/.github/workflows/codebase-baseline.yml@refs/heads/main',
    workflowRunId: '1',
    workflowRunAttempt: 1,
    eventName: 'workflow_dispatch',
    producer: { jobId: 'performance-ci', targetId: null, artifactName: 'performance-evidence' }
  }
};

function allocationRow(entry: ReturnType<typeof deriveAllocationExpectedCoverage>[number], sequence: number) {
  const common = {
    experimentId,
    backend: 'webgpu',
    policyHash,
    sourceSha: runtimeEvidenceProvenance.captureProvenance.sourceSha,
    pairPlanChecksum: hash,
    ledgerSequence: 1,
    experimentRole: 'reference-comparison',
    scopeKind: 'run',
    scopeId: 'run',
    captureKind: 'workload',
    metricSessionId: 'session',
    comparisonKind: 'instrumentation-overhead',
    pairIndex: 1,
    attemptIndex: 1,
    comparisonSide: 'B',
    buildVariant: 'instrumented',
    launchOrdinal: 2,
    externalExecutionId: 'external',
    observationBoundaryId: 'boundary',
    runId: 'run', operationId: entry.operationId, sourceLocationId: entry.sourceLocationId,
    carrier: entry.carrier, requestOrdinal: sequence, outcome: 'success', byteKind: entry.byteSemantics
  } as Record<string, unknown>;
  if (entry.carrier === 'frame-request') {
    const frameOperations = compiledPolicy.policy.allocationEvidencePolicy.webgpu.coverage
      .filter((candidate) => candidate.carrier === 'frame-request');
    common.requestOrdinal = frameOperations.findIndex((candidate) => (
      candidate.operationId === entry.operationId && candidate.sourceLocationId === entry.sourceLocationId
    )) + 1;
    common.measurementEpochId = 'epoch';
    common.measurementWindowId = 'window';
    common.sourceSequence = sequence;
    common.diagnosticFrameId = `diagnostic-frame-${sequence}`;
    common.frameToken = sequence;
  } else {
    const phaseOperations = compiledPolicy.policy.allocationEvidencePolicy.webgpu.coverage
      .filter((candidate) => candidate.carrier === 'lifecycle-request' && candidate.lifecyclePhase === entry.lifecyclePhase);
    const phaseOperationIndex = phaseOperations.findIndex((candidate) => (
      candidate.operationId === entry.operationId && candidate.sourceLocationId === entry.sourceLocationId
    ));
    common.executionId = 'run-execution';
    common.lifecyclePhase = entry.lifecyclePhase;
    common.phaseSequence = ((sequence - 1) * phaseOperations.length) + phaseOperationIndex + 1;
  }
  if (entry.byteSemantics === 'rgba-transfer-footprint') Object.assign(common, { sourceWidth: 160, sourceHeight: 144, byteValue: 160 * 144 * 4 });
  if (entry.byteSemantics === 'requested-byte-length') Object.assign(common, { requestedByteLength: 64, byteValue: 64 });
  if (entry.byteSemantics === 'descriptor-size') Object.assign(common, { descriptorSize: 4096, byteValue: 4096 });
  if (entry.byteSemantics === 'logical-texel-footprint') Object.assign(common, {
    textureDescriptor: { width: 160, height: 144, depth: 1, format: 'rgba8unorm', usage: 'render-attachment', logicalTexelFootprint: 160 * 144 * 4 },
    byteValue: 160 * 144 * 4
  });
  if (entry.byteSemantics === 'count-only-unavailable') common.byteValue = null;
  return common;
}

function allocationInput(rows: Record<string, unknown>[]) {
  return {
    experimentId,
    backend: 'webgpu',
    policyHash,
    ledger: validLedger({ experimentId, backend: 'webgpu', comparisonKind: 'instrumentation-overhead' }),
    rows: rows.map((row) => {
      const projected: Record<string, unknown> = {};
      for (const key of [
        'experimentId', 'backend', 'policyHash', 'runId', 'operationId', 'sourceLocationId',
        'carrier', 'requestOrdinal', 'outcome', 'byteKind', 'byteValue',
        'measurementWindowId', 'measurementEpochId', 'sourceSequence', 'diagnosticFrameId',
        'frameToken', 'executionId', 'lifecyclePhase',
        'phaseSequence', 'sourceWidth', 'sourceHeight', 'requestedByteLength',
        'descriptorSize', 'textureDescriptor'
      ]) if (key in row) projected[key] = row[key];
      return projected;
    }),
    evidenceProvenance: runtimeEvidenceProvenance
  };
}

function validLedger({
  experimentId: ledgerExperimentId = 'canvas-experiment',
  backend = 'canvas2d',
  comparisonKind = 'harness-overhead',
  frameCallbackCount = 1
}: {
  experimentId?: string;
  backend?: 'canvas2d' | 'webgpu';
  comparisonKind?: 'harness-overhead' | 'instrumentation-overhead';
  frameCallbackCount?: number;
} = {}) {
  const closure = {
    closed: true,
    stdoutDrained: true,
    stderrDrained: true,
    inputClosed: true,
    exit: { code: 0, durationMs: 1 },
    zeroSurvivors: true
  };
  const common = { experimentId: ledgerExperimentId, backend, policyHash };
  const instrumentation = comparisonKind === 'instrumentation-overhead';
  return [
    { sequence: 1, operationId: 'metric-adapter-session-open', start: 0, end: 1, metricSessionId: 'session', outcome: 'ready' },
    { sequence: 2, operationId: 'internal-reset', start: 1, end: 2, metricSessionId: 'session', resetId: 'a', boundary: 'reset-before-a' },
    { sequence: 3, operationId: 'electron-harness-spawn', start: 2, end: 3, metricSessionId: 'session', comparisonSide: 'A', comparisonKind, buildVariant: 'harness-control', runId: instrumentation ? 'control' : 'a', launchId: 'launch-control', executionId: instrumentation ? 'control-execution' : 'execution', ...common, ownership: { class: 'application-owned' }, cleanup: closure, outcome: 'completed' },
    { sequence: 4, operationId: 'internal-reset', start: 3, end: 4, metricSessionId: 'session', resetId: 'b', boundary: 'reset-before-b' },
    instrumentation
      ? { sequence: 5, operationId: 'electron-harness-spawn', start: 4, end: 5, metricSessionId: 'session', comparisonSide: 'B', comparisonKind, buildVariant: 'instrumented', runId: 'run', launchId: 'launch-instrumented', executionId: 'run-execution', measurementEpochId: 'epoch', frameSourceSequences: sourceSequences(frameCallbackCount), ...common, ownership: { class: 'application-owned' }, cleanup: closure, outcome: 'completed' }
      : { sequence: 5, operationId: 'production-sentinel-spawn', start: 4, end: 5, metricSessionId: 'session', comparisonSide: 'B', comparisonKind, buildVariant: 'production', runId: 'b', externalExecutionId: 'external', ...common, ownership: { class: 'application-owned' }, cleanup: closure, outcome: 'completed' },
    { sequence: 6, operationId: 'metric-adapter-session-close', start: 5, end: 6, metricSessionId: 'session', outcome: 'completed', closure }
  ];
}

function completePairAttempt({
  sessionId,
  pairIndex,
  attemptIndex,
  retryReason,
  sequenceOffset,
  timeOffset,
  ledgerOptions = {}
}: {
  sessionId: string;
  pairIndex: number;
  attemptIndex: number;
  retryReason: string | null;
  sequenceOffset: number;
  timeOffset: number;
  ledgerOptions?: {
    experimentId?: string;
    backend?: 'canvas2d' | 'webgpu';
    comparisonKind?: 'harness-overhead' | 'instrumentation-overhead';
    frameCallbackCount?: number;
  };
}) {
  return validLedger(ledgerOptions).map((entry) => {
    const attempt = { ...entry, sequence: entry.sequence + sequenceOffset, start: entry.start + timeOffset, end: entry.end + timeOffset } as Record<string, unknown>;
    if ('metricSessionId' in attempt) attempt.metricSessionId = sessionId;
    if (attempt.operationId === 'metric-adapter-session-open') {
      attempt.attempt = { pairIndex, attemptIndex, retryReason };
    }
    if (attempt.operationId === 'internal-reset') attempt.resetId = `${sessionId}-${attempt.resetId}`;
    if (attempt.operationId === 'electron-harness-spawn') {
      attempt.runId = `${sessionId}-${attempt.runId}`;
      attempt.launchId = `${sessionId}-${attempt.launchId}`;
      attempt.executionId = `${sessionId}-${attempt.executionId}`;
    }
    if (attempt.operationId === 'production-sentinel-spawn') {
      attempt.runId = `${sessionId}-${attempt.runId}`;
      attempt.externalExecutionId = `${sessionId}-${attempt.externalExecutionId}`;
    }
    return attempt;
  });
}

function rawEvidence(ledger: ReturnType<typeof validLedger>) {
  const launches = ledger.filter((entry) => (
    (entry.operationId === 'electron-harness-spawn' || entry.operationId === 'production-sentinel-spawn')
    && 'runId' in entry
  ));
  return {
    runs: launches.map((launch: any) => {
      const sourceSequences = launch.buildVariant === 'instrumented' ? launch.frameSourceSequences : runtimeSourceSequences();
      const identity = `${launch.runId}-identity`;
      const cpuSamples = Array.from({ length: 61 }, (_, index) => {
        const readStart = index * 0.5;
        const readEnd = readStart + 0.01;
        return {
          ordinal: index + 1,
          readStart,
          readEnd,
          cumulativeCpuSeconds: index * 0.05,
          counterQuantumSeconds: 0.01,
          processIdentity: identity,
          workingSetMiB: 128
        };
      });
      const dynamicState = { power: 'ac', display: 'single', refreshRate: 60, devicePixelRatio: 1, thermal: 'nominal', gpuSwitch: 'stable' };
      const sources = launch.buildVariant === 'production' ? ['external'] : ['external', 'controller'];
      return {
        runId: launch.runId,
        callbackTiming: {
          callbackCohort: { sourceSequences, windowStart: 0, windowEnd: 30, dropCount: 0, sealed: true, drained: true },
          timingSpans: [{ firstSourceSequence: 1, lastSourceSequence: sourceSequences.length, startedAt: 0, endedAt: sourceSequences.length / 1000 }]
        },
        cpuSamples,
        environment: {
          staticIdentity: { host: 'test', runtime: 'electron', gpu: 'fixture', switches: 'none' },
          dynamicState,
          traces: sources.flatMap((source) => Array.from({ length: 32 }, (_, index) => ({ source, sourceSequence: index + 1, observedAt: index, dynamicState })))
        },
        process: {
          adapterId: 'linux-procfs-v1',
          identity,
          observations: cpuSamples.map((sample) => ({ sequence: sample.ordinal, observedAt: (sample.readStart + sample.readEnd) / 2, identity, alive: true }))
        },
        ...(launch.comparisonKind === 'harness-overhead' ? {
          sentinel: {
            callbackCount: sourceSequences.length,
            backendOperationCount: sourceSequences.length,
            backendSuccessCount: sourceSequences.length,
            errorCount: 0,
            healthFailureCount: 0
          }
        } : {})
      };
    })
  };
}

function balancedPairAttempt(entries: ReturnType<typeof completePairAttempt>, pairIndex: number) {
  const comparisonKind = entries[2].comparisonKind;
  const canonicalVariants = comparisonKind === 'harness-overhead'
    ? ['production', 'harness-control']
    : ['harness-control', 'instrumented'];
  const expectedFirst = pairIndex % 2 === 1 ? canonicalVariants[0] : canonicalVariants[1];
  if (entries[2].buildVariant === expectedFirst) return entries;
  const balanced = JSON.parse(JSON.stringify(entries));
  const first = balanced[2];
  const second = balanced[4];
  balanced[2] = {
    ...second,
    sequence: first.sequence,
    start: first.start,
    end: first.end,
    comparisonSide: 'A'
  };
  balanced[4] = {
    ...first,
    sequence: second.sequence,
    start: second.start,
    end: second.end,
    comparisonSide: 'B'
  };
  return balanced;
}

function ciCanvasPreLoop() {
  const closure = {
    closed: true,
    stdoutDrained: true,
    stderrDrained: true,
    inputClosed: true,
    exit: { code: 0, durationMs: 1 },
    zeroSurvivors: true
  };
  return [
    { sequence: 1, operationId: 'generic-transport-spawn', start: 0, end: 1, transportId: 'membership-path', closure },
    { sequence: 2, operationId: 'build-spawn', start: 1, end: 2, buildId: 'production', closure },
    { sequence: 3, operationId: 'build-spawn', start: 2, end: 3, buildId: 'harness-control', closure },
    { sequence: 4, operationId: 'build-spawn', start: 3, end: 4, buildId: 'instrumented', closure },
    {
      sequence: 5,
      operationId: 'electron-harness-spawn',
      start: 4,
      end: 5,
      transportId: 'harness-control-electron',
      operationMarker: 'transport-operation-marker',
      launchId: 'transport-operation-marker',
      executionId: 'transport-execution',
      experimentId,
      policyHash,
      buildVariant: 'harness-control',
      ownership: { class: 'application-owned' },
      cleanup: closure,
      outcome: 'completed'
    }
  ];
}

function canonicalLedger() {
  const closure = {
    closed: true,
    stdoutDrained: true,
    stderrDrained: true,
    inputClosed: true,
    exit: { code: 0, durationMs: 1 },
    zeroSurvivors: true
  };
  const carrier = (suffix: number) => {
    const launchId = `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
    return {
      executionIdentity: {
        externalExecutionId: `00000000-0000-4000-8000-${String(suffix + 1).padStart(12, '0')}`,
        executionId: `00000000-0000-4000-8000-${String(suffix + 2).padStart(12, '0')}`
      },
      markerIdentity: {
        operationMarker: launchId,
        launchId,
        preloadEchoLaunchId: launchId,
        rendererEchoLaunchId: launchId
      },
      transportIdentity: { transportId: `transport-${suffix}`, observationBoundaryId: launchId }
    };
  };
  const experiment = '00000000-0000-4000-8000-000000000010';
  const sourceSha = runtimeEvidenceProvenance.captureProvenance.sourceSha;
  const pairPlanChecksum = 'c'.repeat(64);
  const commonJoin = {
    sourceSha,
    policyHash,
    experimentId: experiment,
    pairPlanChecksum,
    experimentRole: 'ci-integrity',
    metricSessionId: 'canonical-session',
    comparisonKind: 'harness-overhead',
    backend: 'canvas2d',
    pairIndex: 1,
    attemptIndex: 1
  };
  return [
    { sequence: 1, operationId: 'generic-transport-spawn', start: 0, end: 1, outcome: 'completed', transportClosureEnd: 1, ...carrier(100) },
    { sequence: 2, operationId: 'build-spawn', start: 1, end: 2, outcome: 'completed', buildId: 'production', closure },
    { sequence: 3, operationId: 'build-spawn', start: 2, end: 3, outcome: 'completed', buildId: 'harness-control', closure },
    { sequence: 4, operationId: 'build-spawn', start: 3, end: 4, outcome: 'completed', buildId: 'instrumented', closure },
    { sequence: 5, operationId: 'electron-harness-spawn', start: 4, end: 5, purpose: 'transport-probe', outcome: 'completed', applicationDescendantClosureEnd: 5, ...carrier(200) },
    { sequence: 6, operationId: 'metric-adapter-session-open', start: 5, end: 6, outcome: 'ready', readyAt: 6, metricSessionId: 'canonical-session', comparisonKind: 'harness-overhead', backend: 'canvas2d', pairIndex: 1, attemptIndex: 1 },
    { sequence: 7, operationId: 'internal-reset', start: 6, end: 7, outcome: 'completed', resetIdentity: 'canonical-reset-a' },
    {
      sequence: 8,
      operationId: 'electron-harness-spawn',
      start: 7,
      end: 8,
      purpose: 'measurement-side',
      outcome: 'completed',
      applicationDescendantClosureEnd: 8,
      ledgerSequence: 8,
      ...commonJoin,
      comparisonSide: 'A',
      buildVariant: 'harness-control',
      ordinal: 1,
      runId: 'canonical-run-a',
      externalExecutionId: '00000000-0000-4000-8000-000000000301',
      observationBoundaryId: 'canonical-boundary-a',
      launchId: '00000000-0000-4000-8000-000000000302',
      executionId: '00000000-0000-4000-8000-000000000303',
      ownership: { class: 'application-owned' },
      cleanup: closure
    },
    { sequence: 9, operationId: 'internal-reset', start: 8, end: 9, outcome: 'completed', resetIdentity: 'canonical-reset-b' },
    {
      sequence: 10,
      operationId: 'production-sentinel-spawn',
      start: 9,
      end: 10,
      purpose: 'measurement-side',
      outcome: 'completed',
      applicationDescendantClosureEnd: 10,
      ledgerSequence: 10,
      ...commonJoin,
      comparisonSide: 'B',
      buildVariant: 'production',
      ordinal: 2,
      runId: 'canonical-run-b',
      externalExecutionId: '00000000-0000-4000-8000-000000000304',
      observationBoundaryId: 'canonical-boundary-b',
      browserPid: 123,
      browserCreationTime: 'canonical-browser-creation',
      ownership: { class: 'application-owned' },
      cleanup: closure
    },
    { sequence: 11, operationId: 'metric-adapter-session-close', start: 10, end: 11, outcome: 'completed', closureEnd: 11, metricSessionId: 'canonical-session', closure }
  ];
}

function canonicalMultiBackendLedger() {
  const ledger = canonicalLedger();
  const secondSession = JSON.parse(JSON.stringify(ledger.slice(5))).map((entry: Record<string, any>) => {
    const shifted: Record<string, any> = {
      ...entry,
      sequence: entry.sequence + 6,
      start: entry.start + 6,
      end: entry.end + 6
    };
    if ('metricSessionId' in entry) shifted.metricSessionId = 'canonical-session-webgpu';
    if ('readyAt' in shifted) shifted.readyAt += 6;
    if ('applicationDescendantClosureEnd' in shifted) shifted.applicationDescendantClosureEnd += 6;
    if ('closureEnd' in shifted) shifted.closureEnd += 6;
    if ('resetIdentity' in shifted) shifted.resetIdentity = `${shifted.resetIdentity}-webgpu`;
    if (!('runId' in shifted)) {
      if ('backend' in shifted) shifted.backend = 'webgpu';
      return shifted;
    }
    shifted.backend = 'webgpu';
    shifted.pairPlanChecksum = 'd'.repeat(64);
    shifted.ledgerSequence = shifted.sequence;
    shifted.ordinal += 2;
    if (shifted.comparisonSide === 'A') {
      shifted.runId = 'canonical-webgpu-run-a';
      shifted.externalExecutionId = '00000000-0000-4000-8000-000000000401';
      shifted.observationBoundaryId = 'canonical-webgpu-boundary-a';
      shifted.launchId = '00000000-0000-4000-8000-000000000402';
      shifted.executionId = '00000000-0000-4000-8000-000000000403';
    } else {
      shifted.runId = 'canonical-webgpu-run-b';
      shifted.externalExecutionId = '00000000-0000-4000-8000-000000000404';
      shifted.observationBoundaryId = 'canonical-webgpu-boundary-b';
      shifted.browserPid = 124;
      shifted.browserCreationTime = 'canonical-webgpu-browser-creation';
    }
    return shifted;
  });
  return [...ledger, ...secondSession];
}

function validCiCanvasEvaluationInput() {
  const ledger: any[] = ciCanvasPreLoop();
  for (const [comparisonKind, pairCount] of [
    ['harness-overhead', 3],
    ['instrumentation-overhead', 6]
  ] as const) {
    for (let pairIndex = 1; pairIndex <= pairCount; pairIndex += 1) {
      const attempt = completePairAttempt({
        sessionId: `${comparisonKind}-pair-${pairIndex}`,
        pairIndex,
        attemptIndex: 1,
        retryReason: null,
        sequenceOffset: ledger.length,
        timeOffset: ledger.at(-1).end,
        ledgerOptions: { experimentId, backend: 'canvas2d', comparisonKind, frameCallbackCount: runtimeCallbackCount }
      });
      ledger.push(...balancedPairAttempt(attempt, pairIndex));
    }
  }
  const bundle = (mainBytes: number) => {
    const entries = [
      { path: 'main/index.js', bytes: mainBytes, sha256: hash },
      { path: 'preload/index.js', bytes: 20_000, sha256: hash },
      { path: 'renderer/assets/main-test.js', bytes: 30_000, sha256: hash },
      { path: 'renderer/assets/worker-entry-test.js', bytes: 10_000, sha256: hash }
    ];
    return { sha256: canonicalSha256(entries), entries };
  };
  const buildManifest = {
    schemaVersion: 2,
    sourceSha: ciRuntimeEvidenceProvenance.captureProvenance.sourceSha,
    variants: [
      { id: 'production', harness: false, instrumentation: false, bundle: bundle(40_000) },
      { id: 'harness-control', harness: true, instrumentation: false, bundle: bundle(40_100) },
      { id: 'instrumented', harness: true, instrumentation: true, bundle: bundle(40_200) }
    ]
  };
  const productionBundleEvidence = {
    schemaVersion: 1,
    sourceSha: ciRuntimeEvidenceProvenance.captureProvenance.sourceSha,
    build: {
      id: 'production',
      harness: false,
      instrumentation: false,
      bundleSha256: buildManifest.variants[0].bundle.sha256
    },
    codeByteTotal: 100_000,
    codeRoots: buildManifest.variants[0].bundle.entries.map((entry, index) => ({
      id: ['main', 'preload', 'renderer', 'worker'][index],
      entrypoint: entry,
      byteTotal: entry.bytes,
      entries: [entry],
      sha256: canonicalSha256([entry])
    })),
    checksum: ''
  };
  productionBundleEvidence.checksum = canonicalSha256({
    schemaVersion: productionBundleEvidence.schemaVersion,
    sourceSha: productionBundleEvidence.sourceSha,
    build: productionBundleEvidence.build,
    codeByteTotal: productionBundleEvidence.codeByteTotal,
    codeRoots: productionBundleEvidence.codeRoots
  });
  const pairs = (comparisonKind: 'harness-overhead' | 'instrumentation-overhead', count: number) => Array.from({ length: count }, (_, offset) => {
    const pairIndex = offset + 1;
    const canonicalVariants = comparisonKind === 'harness-overhead'
      ? ['production', 'harness-control']
      : ['harness-control', 'instrumented'];
    const buildVariants = pairIndex % 2 === 1 ? canonicalVariants : [...canonicalVariants].reverse();
    return {
      comparisonKind,
      backend: 'canvas2d',
      pairIndex,
      attempts: Array.from({ length: 3 }, (_, attemptOffset) => ({
        attemptIndex: attemptOffset + 1,
        metricSessionId: `${comparisonKind}-pair-${pairIndex}-attempt-${attemptOffset + 1}`,
        launches: buildVariants.map((buildVariant, launchOffset) => ({
          comparisonSide: launchOffset === 0 ? 'A' : 'B',
          executionOrdinal: launchOffset + 1,
          buildVariant
        }))
      }))
    };
  });
  const pairPlanBody = {
    schemaVersion: 3,
    experimentId,
    backend: 'canvas2d',
    pairs: [...pairs('harness-overhead', 3), ...pairs('instrumentation-overhead', 6)]
  };
  return {
    experimentId,
    experimentRole: 'ci-integrity' as const,
    backend: 'canvas2d' as const,
    ledger,
    comparisonInputs: [comparisonInput('canvas2d')],
    allocationEvidence: {
      experimentId,
      backend: 'canvas2d' as const,
      policyHash,
      rows: [],
      evidenceProvenance: ciRuntimeEvidenceProvenance
    },
    rawEvidence: rawEvidence(ledger as ReturnType<typeof validLedger>),
    evidenceProvenance: ciRuntimeEvidenceProvenance,
    finalizationPurpose: 'publication' as const,
    semanticAuthority: {
      generatedAt: '2026-07-12T00:00:00.000Z',
      repository: {
        commitSha: ciRuntimeEvidenceProvenance.captureProvenance.sourceSha,
        dirty: false,
        branch: null
      },
      environment: { os: 'linux', arch: 'x64', nodeVersion: 'v24.0.0', targetId: null },
      inputs: { paths: ['tests/unit/scripts/performance-evidence.test.ts'] },
      reset: { version: 'phase0-cold-launch-reset-v1' },
      seed: { hash }
    },
    buildManifest,
    productionBundleEvidence,
    pairPlans: [{ ...pairPlanBody, checksum: canonicalSha256(pairPlanBody) }]
  };
}

function abortedPairAttempt({
  side,
  reason,
  attemptIndex = 1,
  retryReason = null,
  sequenceOffset = 0,
  timeOffset = 0
}: {
  side: 'A' | 'B';
  reason: string;
  attemptIndex?: number;
  retryReason?: string | null;
  sequenceOffset?: number;
  timeOffset?: number;
}) {
  const entries = completePairAttempt({
    sessionId: `aborted-attempt-${attemptIndex}`,
    pairIndex: 1,
    attemptIndex,
    retryReason,
    sequenceOffset,
    timeOffset,
    ledgerOptions: { experimentId, backend: 'canvas2d', comparisonKind: 'harness-overhead' }
  }) as Array<Record<string, any>>;
  const abortReason = { phase: side === 'A' ? 'side-a' : 'side-b', backend: 'canvas2d', reason };
  const launchIndex = side === 'A' ? 2 : 4;
  entries[launchIndex] = {
    ...entries[launchIndex],
    outcome: 'failed',
    abortReason,
    lastBoundary: side === 'A' ? 'reset-a' : 'reset-b'
  };
  if (side === 'A') {
    return [
      ...entries.slice(0, 3),
      {
        ...entries[5],
        sequence: sequenceOffset + 4,
        start: timeOffset + 3,
        end: timeOffset + 4,
        outcome: 'aborted',
        abortReason,
        lastBoundary: 'reset-a'
      }
    ];
  }
  entries[5] = { ...entries[5], outcome: 'aborted', abortReason, lastBoundary: 'reset-b' };
  return entries;
}

function comparisonInput(backend = 'canvas2d') {
  return {
    schemaVersion: 1,
    policyHashes: { policy: hash },
    initialEnvironment: { host: 'test' },
    workload: { id: 'phase0-animated-160x144-v1' },
    reset: { version: 'phase0-cold-launch-reset-v1' },
    processAdapter: { id: 'linux-procfs-v1' },
    seed: { hash },
    backend,
    backendExecutionIdentity: backend === 'canvas2d' ? 'not-applicable' : { adapter: 'test-adapter', isFallbackAdapter: false },
    sourceSha: 'ignored'
  };
}

function qualificationInput() {
  return {
    schemaVersion: 1,
    sourceSha: '9a7839ce47c61982f6eab836c496b8469f01a9ca',
    controlBundle: { hash, mode: 'harness-control' },
    workload: { id: 'phase0-animated-160x144-v1' },
    initialEnvironment: { host: 'test' },
    requestedBackend: 'webgpu',
    selectedBackend: 'webgpu',
    observedBackend: 'webgpu',
    qualificationState: 'qualified-webgpu',
    unavailabilityBranch: 'none',
    adapter: { id: 'adapter' },
    backendExecutionIdentity: { id: 'adapter' },
    resetVersion: 'v1',
    policyHashes: { policy: hash },
    processAdapter: { id: 'linux-procfs-v1' },
    seedManifestHash: hash
  };
}

function validRuntimeEvaluationInput() {
  const ledger = validLedger({ experimentId, backend: 'webgpu', comparisonKind: 'instrumentation-overhead', frameCallbackCount: runtimeCallbackCount });
  const expected = deriveAllocationExpectedCoverage({ acceptedRunIds: ['run'], frameCountByRun: { run: runtimeCallbackCount } }, compiledPolicy);
  const rows = expected.flatMap((entry) => Array.from({ length: entry.expectedCardinality }, (_, offset) => allocationRow(entry, offset + 1)));
  return {
    experimentId,
    experimentRole: 'reference-comparison',
    backend: 'webgpu',
    ledger,
    comparisonInputs: [comparisonInput('webgpu')],
    qualificationInput: qualificationInput(),
    allocationEvidence: { ...allocationInput(rows), ledger },
    rawEvidence: rawEvidence(ledger),
    evidenceProvenance: runtimeEvidenceProvenance
  };
}

function syntheticCapacityProvenance() {
  return {
    kind: 'synthetic-capacity-fixture' as const,
    scenario: 'unit-capacity',
    publicationEligible: false,
    runtimeMeasurement: false
  };
}

function syntheticCapacityCoverage(ledger: ReturnType<typeof validLedger>) {
  const acceptedRuns = deriveAcceptedInstrumentedLedgerRuns(ledger, { experimentId, backend: 'webgpu' }, compiledPolicy);
  const frameCountByRun = Object.fromEntries(acceptedRuns.map((run) => [run.runId, run.frameSourceSequences.length]));
  const expected = deriveAllocationExpectedCoverage({ acceptedRunIds: acceptedRuns.map((run) => run.runId), frameCountByRun }, compiledPolicy);
  return {
    encoding: compiledPolicy.policy.capacityFixturePolicy.encoding,
    frameCohorts: Object.entries(frameCountByRun)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([runId, callbackCount]) => ({ runId, callbackCount })),
    observedCoverage: expected.map((entry) => ({
      runId: entry.runId,
      operationId: entry.operationId,
      sourceLocationId: entry.sourceLocationId,
      observedCardinality: entry.expectedCardinality
    }))
  };
}

describe('performance evidence policy evaluator', () => {
  it('hashes only included comparison fields and rejects invalid backend identity', () => {
    const policy = loadBaselinePolicy();
    const input = comparisonInput();
    expect(computeComparisonFingerprint(input, policy)).toBe(computeComparisonFingerprint({ ...input, sourceSha: 'changed' }, policy));
    expect(computeComparisonFingerprint(input, policy)).not.toBe(computeComparisonFingerprint({ ...input, workload: { id: 'changed' } }, policy));
    expect(() => computeComparisonFingerprint({ ...input, backendExecutionIdentity: { adapter: 'x' } }, policy)).toThrow(/canvas comparison identity/);
  });

  it('uses the closed qualification fingerprint and allocation-state derivation', () => {
    const policy = loadBaselinePolicy();
    const qualification = {
      schemaVersion: 1, sourceSha: '9a7839ce47c61982f6eab836c496b8469f01a9ca', controlBundle: { hash },
      workload: { id: 'phase0-animated-160x144-v1' }, initialEnvironment: { host: 'test' }, requestedBackend: 'webgpu',
      selectedBackend: 'webgpu', observedBackend: 'webgpu', qualificationState: 'qualified-webgpu', unavailabilityBranch: 'none',
      adapter: { id: 'adapter' }, backendExecutionIdentity: { id: 'adapter' }, resetVersion: 'v1', policyHashes: { policy: hash },
      processAdapter: { id: 'linux-procfs-v1' }, seedManifestHash: hash, timestamps: [1]
    };
    expect(computeQualificationFingerprint(qualification, policy)).toMatch(/^[a-f0-9]{64}$/);
    const expected = deriveAllocationExpectedCoverage({ acceptedRunIds: ['run'], frameCountByRun: { run: 1 } }, policy);
    const completeRows = expected.flatMap((entry) => Array.from({ length: entry.expectedCardinality }, (_, offset) => allocationRow(entry, offset + 1)));
    expect(deriveAllocationEvidence(allocationInput(completeRows), policy).state).toBe('measured-request-proxy');
    const encodedRows = ['frame-request', 'lifecycle-request'].flatMap((rawKind) => {
      const rows = completeRows.filter((row) => row.carrier === rawKind);
      return rows.length === 0 ? [] : [{ rawKind, encoded: encodePerformanceEvidence(rawKind, rows, policy) }];
    });
    expect(deriveAllocationEvidence({ ...allocationInput(completeRows), rows: undefined, encodedRows }, policy).state).toBe('measured-request-proxy');
    const splitFrameManifests = [
      ...completeRows.filter((row) => row.carrier === 'frame-request').map((row) => ({
        rawKind: 'frame-request',
        encoded: encodePerformanceEvidence('frame-request', [row], policy)
      })),
      ...encodedRows.filter((entry) => entry.rawKind === 'lifecycle-request')
    ];
    expect(() => deriveAllocationEvidence({ ...allocationInput(completeRows), rows: undefined, encodedRows: splitFrameManifests }, policy)).toThrow(/exactly one canonical manifest/);
    expect(() => deriveAllocationEvidence({ ...allocationInput(completeRows), rows: undefined, encodedRows: [...encodedRows].reverse() }, policy)).toThrow(/ordered by canonical raw kind/);
    expect(() => deriveAllocationEvidence({ ...allocationInput(completeRows), encodedRows }, policy)).toThrow(/exactly one of raw rows, canonical encoded rows, or synthetic capacity coverage/);
    const runtimeLedger = validLedger({
      experimentId,
      backend: 'webgpu',
      comparisonKind: 'instrumentation-overhead',
      frameCallbackCount: runtimeCallbackCount
    });
    expect(() => evaluatePerformanceExperiment({
      experimentId,
      experimentRole: 'reference-comparison',
      backend: 'webgpu',
      ledger: runtimeLedger,
      comparisonInputs: [comparisonInput('webgpu')],
      allocationEvidence: allocationInput(completeRows),
      rawEvidence: rawEvidence(runtimeLedger),
      evidenceProvenance: runtimeEvidenceProvenance
    }, policy)).toThrow(/require qualification evidence/);
    const frame = expected.find((entry) => entry.operationId === 'video-frame-image-bitmap-request')!;
    const incomplete = deriveAllocationEvidence(allocationInput([allocationRow(frame, 1)]), policy);
    expect(incomplete.state).toBe('unavailable-incomplete-request-coverage');
    if (!('blocker' in incomplete)) throw new Error('expected incomplete allocation coverage blocker');
    expect(incomplete.blocker).toBe('phase-5-webgpu-allocation-request-proxy');
    expect(() => deriveAllocationEvidence({ ...allocationInput([]), expectedCoverage: [] }, policy)).toThrow(/policy-derived/);
    expect(() => deriveAllocationEvidence({ experimentId, backend: 'webgpu', policyHash, ledger: validLedger({ experimentId, backend: 'webgpu', comparisonKind: 'instrumentation-overhead' }), rows: [], evidenceProvenance: runtimeEvidenceProvenance }, policy)).toThrow(/nonempty observed subset/);
    expect(() => deriveAllocationEvidence(allocationInput([{ ...allocationRow(frame, 1), byteValue: 1 }]), policy)).toThrow(/RGBA transfer footprint/);
    expect(deriveAllocationEvidence({ backend: 'canvas2d', rows: [], evidenceProvenance: runtimeEvidenceProvenance }, policy).state).toBe('not-applicable-no-covered-allocation-request');
  });

  it('derives qualified WebGPU and every unavailable branch from the sealed qualification carrier', () => {
    const adapterIdentity = { vendor: 'vendor', architecture: null, device: 'device', description: null };
    const limits = { maxTextureDimension2D: 8192, maxBindGroups: 4 };
    const backendIdentity = (isFallbackAdapter: boolean) => ({
      backend: 'webgpu',
      driver: 'webgpu-driver-v1',
      workerProtocol: 'webgpu-worker-ready-v1',
      adapterIdentity,
      limits,
      isFallbackAdapter,
      powerPreference: 'low-power'
    });
    const webgpuStage = {
      backend: 'webgpu', backendReadyObservedAt: 1, sourceSequence: 1, sourceObservedAt: 2,
      terminalFrame: {
        kind: 'worker-frame-acknowledged', frameToken: 1, submittedAt: 3,
        acknowledgedAt: 4, outcome: 'webgpu-queue-submit-completed'
      }
    };
    const canvasStage = {
      backend: 'canvas2d', backendReadyObservedAt: 5, sourceSequence: 1, sourceObservedAt: 6,
      terminalFrame: { kind: 'canvas-draw-completed', observedAt: 7, outcome: 'canvas-draw-completed' }
    };
    const cleanup = {
      controllerFatalReasons: [], listenersRemoved: true, restorationOutcome: 'restored',
      applicationDescendantClosureEnd: 10, brokerDisposeEnd: 11,
      rootExitObservedAt: 12, terminalClosureEnd: 13
    };
    const availableCapability = (isFallbackAdapter: boolean) => ({
      status: 'available', adapterIdentity, limits, isFallbackAdapter,
      strictSelection: { requestedBackend: 'webgpu', powerPreference: 'low-power', forceFallbackAdapter: false }
    });
    const derive = (branch: string) => {
      const workerFallback = branch === 'worker-fallback-adapter';
      const qualified = branch === 'none';
      const capabilityStatus = branch === 'webgpu-api-unavailable'
        ? 'api-unavailable'
        : branch === 'webgpu-adapter-unavailable'
          ? 'adapter-unavailable'
          : 'available';
      const transferStatus = ({
        'transfer-api-unavailable': 'api-unavailable',
        'transfer-method-unavailable': 'method-unavailable',
        'transfer-allowlisted-not-supported': 'allowlisted-not-supported'
      } as Record<string, string>)[branch] ?? (capabilityStatus === 'available' ? 'available' : 'api-unavailable');
      const capabilityResult = capabilityStatus === 'available'
        ? availableCapability(workerFallback)
        : { status: capabilityStatus };
      const preWorkerUnavailable = !qualified && !workerFallback;
      const selectionResult = {
        qualificationState: qualified ? 'qualified-webgpu' : 'hardware-capability-unavailable',
        unavailabilityBranch: branch,
        requestedBackend: 'webgpu',
        selectedBackend: qualified ? 'webgpu' : 'canvas2d',
        observedBackend: workerFallback || qualified ? 'webgpu' : 'canvas2d',
        selectionReason: qualified ? 'webgpu-selected' : branch
      };
      const captureBody = {
        schemaVersion: 1,
        experimentId,
        ledgerSequence: 6,
        observationBoundaryId: 'qualification-boundary',
        sourceSha: runtimeEvidenceProvenance.captureProvenance.sourceSha,
        policyHash,
        buildVariant: 'harness-control',
        requestedBackend: 'webgpu',
        readinessEvidence: { stages: preWorkerUnavailable ? [canvasStage] : workerFallback ? [webgpuStage, canvasStage] : [webgpuStage] },
        capabilityResult,
        transferResult: { status: transferStatus },
        selectionResult,
        adapterIdentity: preWorkerUnavailable ? null : adapterIdentity,
        fallbackState: preWorkerUnavailable
          ? null
          : workerFallback
            ? { isFallbackAdapter: true, branch, observedBackendExecutionIdentity: backendIdentity(true), fallbackBackend: 'canvas2d' }
            : { isFallbackAdapter: false, branch: null },
        backendExecutionIdentity: qualified ? backendIdentity(false) : null,
        cleanup
      };
      const captureBodyChecksum = canonicalSha256(captureBody);
      const scopedBinding = {
        sourceSha: runtimeEvidenceProvenance.captureProvenance.sourceSha,
        policyHash,
        experimentId,
        experimentRole: 'reference-comparison',
        scopeKind: 'ledger-operation',
        scopeId: 6,
        captureKind: 'qualification',
        ledgerSequence: 6,
        operationId: 'electron-harness-spawn',
        observationBoundaryId: 'qualification-boundary'
      };
      const processBinding = { ...scopedBinding } as Record<string, unknown>;
      delete processBinding.observationBoundaryId;
      const processIdentity = 'external:42:created-42';
      const processCommon = {
        ...processBinding,
        observationSource: 'external', subjectKind: 'qualification', pid: 42,
        creationIdentity: 'created-42', processIdentity,
        rawIdentity: { pid: 42, creationIdentity: 'created-42' },
        processClass: 'application-renderer', ownership: 'application-owned'
      };
      const staticIdentity = { host: 'selected' };
      const dynamicState = { power: 'ac' };
      const controllerRows = [{
        ...scopedBinding, controlSequence: 1, operationKind: 'request', clockDomain: 'electron-main',
        controllerRequestId: 'qualification-request', channel: 'browser-window', requestKind: 'qualification',
        rawRequest: {}, sentAt: 1
      }, {
        ...scopedBinding, controlSequence: 2, operationKind: 'response', clockDomain: 'electron-main',
        controllerRequestId: 'qualification-request', channel: 'browser-window', responseKind: 'qualification',
        rawResponse: {}, receivedAt: 2, outcome: 'recorded'
      }, ...captureBody.readinessEvidence.stages.map((stage, index) => ({
        ...scopedBinding,
        controlSequence: index + 3,
        operationKind: 'control-write',
        clockDomain: 'renderer-performance-now-v1',
        writeKind: 'backend-ready',
        rawWrite: {
          kind: 'backend-ready', launchId: 'qualification-launch', observedAt: stage.backendReadyObservedAt,
          requestedBackend: 'webgpu', selectedBackend: stage.backend,
          selectionReason: stage.backend === 'webgpu'
            ? 'webgpu-selected'
            : branch === 'worker-fallback-adapter' ? 'fatal-detector-reason' : branch,
          backendExecutionIdentity: stage.backend === 'webgpu'
            ? (captureBody.backendExecutionIdentity ?? captureBody.fallbackState?.observedBackendExecutionIdentity)
            : null
        },
        writtenAt: stage.backendReadyObservedAt,
        outcome: 'recorded'
      }))];
      const rawKinds = [{
        rawKind: 'process-observation',
        rows: [{
          ...processCommon, observationOrdinal: 1, observedAt: 1, observationKind: 'membership',
          adapterId: 'external-membership-v1', rawAdapterKind: 'external-process-membership',
          rawMembership: { spawnBoundary: {}, rendererEvaluation: {}, ancestry: {}, processGroup: null, job: null, pathIdentity: {} },
          alive: true
        }, {
          ...processCommon, observationOrdinal: 2, observedAt: 2, observationKind: 'health',
          adapterId: 'external-health-v1', rawAdapterKind: 'external-process-health',
          rawHealth: { alive: true, status: 'live', exitObservation: null }, alive: true, healthState: 'live'
        }, {
          ...processCommon, observationOrdinal: 3, observedAt: 10, observationKind: 'closure',
          adapterId: 'external-closure-v1', rawAdapterKind: 'external-process-closure',
          rawClosure: { terminalStatus: 'closed', exitCode: 0, signal: null, zeroSurvivors: true },
          alive: false, closureState: 'closed'
        }]
      }, {
        rawKind: 'environment-observation',
        rows: [{
          ...scopedBinding, source: 'external-monitor', sourceSequence: 1, clockDomain: 'runner',
          runnerReceiptSequence: 1, observedAt: 1, observationKind: 'initial-snapshot',
          rawAdapterKind: 'external-host-snapshot-v1', rawObservation: { staticIdentity, dynamicState },
          staticIdentity, dynamicState
        }, {
          ...scopedBinding, source: 'external-monitor', sourceSequence: 2, clockDomain: 'runner',
          runnerReceiptSequence: 2, observedAt: 13, observationKind: 'cleanup',
          rawAdapterKind: 'external-host-cleanup-v1',
          rawObservation: { cleanupState: 'disposed', lastSourceSequence: 1, remainingPollTimerCount: 0, remainingListenerCount: 0 },
          cleanupState: 'disposed'
        }]
      }, { rawKind: 'controller-operation', rows: controllerRows }];
      const capture = {
        experimentId,
        ledgerSequence: 6,
        observationBoundaryId: 'qualification-boundary',
        sourceSha: runtimeEvidenceProvenance.captureProvenance.sourceSha,
        policyHash,
        captureBody,
        captureBodyChecksum,
        rawKinds
      };
      const ledgerEntry = {
        sequence: 6, operationId: 'electron-harness-spawn', start: 0, end: 14,
        purpose: 'qualification-probe', outcome: 'completed', experimentId, policyHash,
        buildVariant: 'harness-control', observationBoundaryId: 'qualification-boundary',
        operationMarker: 'qualification-launch', launchId: 'qualification-launch',
        executionId: 'qualification-execution', externalExecutionId: 'qualification-external',
        executionIdentity: { externalExecutionId: 'qualification-external', executionId: 'qualification-execution' },
        markerIdentity: {
          operationMarker: 'qualification-launch', launchId: 'qualification-launch',
          preloadEchoLaunchId: 'qualification-launch', rendererEchoLaunchId: 'qualification-launch'
        },
        transportIdentity: { transportId: 'qualification-transport', observationBoundaryId: 'qualification-boundary' },
        capabilityEvidence: { captureBodyChecksum },
        readinessEvidence: captureBody.readinessEvidence,
        ownership: { class: 'application-owned' },
        cleanup,
        applicationDescendantClosureEnd: 14
      };
      const captureSet = {
        manifest: {
          semanticAuthority: {
            generatedAt: '2026-07-12T00:00:00.000Z',
            repository: { commitSha: runtimeEvidenceProvenance.captureProvenance.sourceSha, dirty: false, branch: 'main' },
            environment: { os: 'darwin', arch: 'arm64', nodeVersion: 'v24', targetId: 'selected' },
            inputs: { workload: { id: 'phase0-animated-160x144-v1' }, processAdapter: { id: 'linux-procfs-v1' } },
            reset: { version: 'phase0-cold-launch-reset-v1' }, seed: { manifestHash: hash }
          }
        },
        buildManifest: { variants: [{ id: 'harness-control', bundle: { sha256: hash } }] },
        performanceLedger: [ledgerEntry]
      };
      return deriveQualificationCapture(capture as never, captureSet as never, compiledPolicy);
    };
    const qualified = derive('none');
    expect(qualified).toMatchObject({ state: 'qualified-webgpu', selectedBackend: 'webgpu', unavailabilityBranch: 'none' });
    for (const branch of compiledPolicy.policy.performanceFailurePolicy.qualificationUnavailableReasons) {
      expect(derive(branch)).toMatchObject({
        state: 'hardware-capability-unavailable',
        selectedBackend: 'canvas2d',
        unavailabilityBranch: branch
      });
    }
  });

  it('keeps all accepted runs for an allocation raw kind in one canonical manifest', () => {
    const policy = loadBaselinePolicy();
    const ledgerOptions = { experimentId, backend: 'webgpu' as const, comparisonKind: 'instrumentation-overhead' as const };
    const firstAttempt = completePairAttempt({
      sessionId: 'first-pair', pairIndex: 1, attemptIndex: 1, retryReason: null,
      sequenceOffset: 0, timeOffset: 0, ledgerOptions
    });
    const secondAttempt = completePairAttempt({
      sessionId: 'second-pair', pairIndex: 2, attemptIndex: 1, retryReason: null,
      sequenceOffset: 6, timeOffset: 6, ledgerOptions
    });
    const ledger = [...firstAttempt, ...secondAttempt];
    const acceptedRuns = deriveAcceptedInstrumentedLedgerRuns(ledger, { experimentId, backend: 'webgpu' }, policy);
    expect(acceptedRuns).toHaveLength(2);
    const runsById = new Map<string, { measurementEpochId: string; executionId: string }>(acceptedRuns.map((run) => [
      run.runId,
      { measurementEpochId: run.measurementEpochId, executionId: run.executionId }
    ]));
    const expected = deriveAllocationExpectedCoverage({
      acceptedRunIds: acceptedRuns.map((run) => run.runId),
      frameCountByRun: Object.fromEntries(acceptedRuns.map((run) => [run.runId, run.frameSourceSequences.length]))
    }, policy);
    const rows = expected.flatMap((entry) => Array.from({ length: entry.expectedCardinality }, (_, offset) => {
      const row = allocationRow(entry, offset + 1);
      const run = runsById.get(entry.runId);
      if (!run) throw new Error(`missing accepted run ${entry.runId}`);
      row.runId = entry.runId;
      row.scopeId = entry.runId;
      if (entry.carrier === 'frame-request') row.measurementEpochId = run.measurementEpochId;
      else row.executionId = run.executionId;
      return row;
    }));
    const encodedRows = ['frame-request', 'lifecycle-request'].map((rawKind) => ({
      rawKind,
      encoded: encodePerformanceEvidence(rawKind, rows.filter((row) => row.carrier === rawKind), policy)
    }));
    expect(deriveAllocationEvidence({
      experimentId,
      backend: 'webgpu',
      policyHash,
      ledger,
      rows: undefined,
      encodedRows,
      evidenceProvenance: runtimeEvidenceProvenance
    }, policy).state).toBe('measured-request-proxy');
  });

  it('keeps policy-owned synthetic capacity coverage non-publication and binds it to the logical frame cohort', () => {
    const runtimeInput = validRuntimeEvaluationInput();
    const syntheticProvenance = syntheticCapacityProvenance();
    const coverage = syntheticCapacityCoverage(runtimeInput.ledger);
    const { rows: ignoredRows, ...runtimeAllocation } = runtimeInput.allocationEvidence;
    const syntheticAllocation = {
      ...runtimeAllocation,
      syntheticCoverage: coverage,
      evidenceProvenance: syntheticProvenance
    };
    const derived = deriveAllocationEvidence(syntheticAllocation, compiledPolicy);
    expect(derived).toMatchObject({
      state: 'measured-request-proxy',
      evidenceClass: 'synthetic-capacity-only',
      allocationValuesObserved: false,
      syntheticCapacityCoverage: {
        encoding: compiledPolicy.policy.capacityFixturePolicy.encoding,
        frameCohorts: [{ runId: 'run', callbackCount: runtimeCallbackCount }]
      }
    });
    if (!('syntheticCapacityCoverage' in derived)) throw new Error('expected synthetic capacity coverage metadata');
    expect(derived.syntheticCapacityCoverage.semanticExpansionChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(() => deriveAllocationEvidence({
      ...syntheticAllocation,
      syntheticCoverage: { ...coverage, frameCohorts: [{ runId: 'run', callbackCount: runtimeCallbackCount + 1 }] }
    }, compiledPolicy)).toThrow(/ledger-derived callback cardinalities/);
    expect(() => deriveAllocationEvidence({
      ...runtimeAllocation,
      syntheticCoverage: coverage,
      evidenceProvenance: runtimeEvidenceProvenance
    }, compiledPolicy)).toThrow(/forbidden for runtime-capture/);

    const compactSyntheticRawEvidence = JSON.parse(JSON.stringify(runtimeInput.rawEvidence));
    for (const run of compactSyntheticRawEvidence.runs) {
      const sourceSequences = run.callbackTiming.callbackCohort.sourceSequences;
      run.callbackTiming.callbackCohort = {
        sourceSequenceEncoding: compiledPolicy.policy.capacityFixturePolicy.callbackCohortEncoding,
        firstSourceSequence: 1,
        callbackCount: sourceSequences.length,
        windowStart: 0,
        windowEnd: 30,
        dropCount: 0,
        sealed: true,
        drained: true
      };
    }
    expect(() => evaluatePerformanceExperiment({
      ...runtimeInput,
      rawEvidence: compactSyntheticRawEvidence
    }, compiledPolicy)).toThrow(/forbidden for runtime-capture evidence/);
    const syntheticExperiment = {
      ...runtimeInput,
      allocationEvidence: syntheticAllocation,
      rawEvidence: compactSyntheticRawEvidence,
      evidenceProvenance: syntheticProvenance
    };
    const evaluation = evaluatePerformanceExperiment(syntheticExperiment, compiledPolicy);
    expect(evaluation.publicationEligible).toBe(false);
    expect(() => requirePublishablePerformanceEvidence(evaluation)).toThrow(/synthetic/);
    expect(() => evaluatePerformanceExperiment({ ...syntheticExperiment, acceptanceContext: true }, compiledPolicy)).toThrow(/cannot enter an acceptance evaluation/);
  });

  it('derives conservative CPU ranges and canonical raw chunks', () => {
    const cpuWindow = deriveCpuWindow(
      { readStart: 0, readEnd: 0.01, cumulativeCpuSeconds: 0, counterQuantumSeconds: 0.001 },
      { readStart: 20, readEnd: 20.01, cumulativeCpuSeconds: 0.1, counterQuantumSeconds: 0.001 }
    );
    const score = deriveCpuScore({ p95Lower: 1, p95Upper: 2 }, { p95Lower: 1, p95Upper: 2 }, 0.05);
    expect(cpuWindow.cpuLowerPp).toBeLessThanOrEqual(cpuWindow.cpuUpperPp);
    expect(score.verdict).toBe('pass');
    const encoded = encodePerformanceEvidence('cpu-sample', [cpuRawRow('run', 2), cpuRawRow('run', 1)]);
    expect(encoded.columns).toEqual(compiledPolicy.policy.performanceEvidenceChunkPolicy.rawKinds['cpu-sample'].columns);
    expect(encoded.chunkDictionaries).toHaveLength(1);
    expect(decodePerformanceEvidence(encoded)).toEqual([cpuRawRow('run', 1), cpuRawRow('run', 2)]);

    const multiChunkRows = Array.from({ length: 257 }, (_, index) => cpuRawRow('multi-chunk-run', index + 1, 257));
    const multiChunk = encodePerformanceEvidence('cpu-sample', multiChunkRows, compiledPolicy);
    expect(multiChunk.chunks.map((chunk) => chunk.rowCount)).toEqual([256, 1]);
    expect(multiChunk.chunkDictionaries).toHaveLength(2);
    expect(decodePerformanceEvidence(multiChunk, compiledPolicy).sort((left, right) => left.ordinal - right.ordinal)).toEqual(multiChunkRows);

    const duplicateCoverage = deriveAllocationExpectedCoverage({
      acceptedRunIds: ['duplicate-run'],
      frameCountByRun: { 'duplicate-run': 1 }
    }, compiledPolicy)[0];
    const duplicate = allocationRow(duplicateCoverage, 1);
    expect(() => encodePerformanceEvidence('frame-request', [
      duplicate,
      JSON.parse(JSON.stringify(duplicate))
    ], compiledPolicy)).toThrow(/duplicate sort keys/);
  });

  it('archives and losslessly reconstructs every registered raw kind with kind-bound closure', () => {
    const rowsByRawKind = Object.fromEntries(compiledPolicy.rawKindOrder.map((rawKind) => [rawKind, []]));
    rowsByRawKind['cpu-sample'] = Array.from({ length: 257 }, (_, index) => cpuRawRow('run', index + 1, 257));
    const archive = createPerformanceRawArchive({ experimentId, rowsByRawKind }, compiledPolicy);
    expect(Object.isFrozen(archive)).toBe(true);
    expect(Object.isFrozen(archive.rawEvidenceBody)).toBe(true);
    expect(Object.isFrozen(archive.rawEvidenceBody.rawKinds)).toBe(true);
    expect(Object.isFrozen(archive.rawEvidenceBody.rawKinds.find((entry) => entry.rawKind === 'cpu-sample')?.rows[0])).toBe(true);
    expect(Object.isFrozen(archive.rawKindManifests[0].body)).toBe(true);
    expect(archive.rawKindManifests).toHaveLength(11);
    expect(archive.rawKindManifests.map((record) => record.body.rawKind)).toEqual(compiledPolicy.rawKindOrder);
    expect(archive.dictionaries.length).toBeLessThan(11);
    const cpuManifest = archive.rawKindManifests.find((record) => record.body.rawKind === 'cpu-sample');
    expect(cpuManifest?.body.chunkMetadata).toHaveLength(2);
    const chunkDictionaryHashes = cpuManifest?.body.chunkMetadata.map((entry) => entry.dictionaryHash).sort();
    expect(new Set(chunkDictionaryHashes).size).toBe(2);
    expect(cpuManifest?.body.dictionaryReferences.map((entry) => entry.hash)).toEqual(chunkDictionaryHashes);
    const replayed = reconstructPerformanceRawEvidence({
      rawKindManifests: archive.rawKindManifests,
      rawChunks: archive.rawChunks,
      dictionaries: archive.dictionaries
    }, compiledPolicy);
    expect(replayed).toEqual(archive.rawEvidenceBody);
    expect(canonicalSha256(replayed)).toBe(archive.rawEvidenceChecksum);
    const store = createEvidenceStore();
    for (const record of [
      ...archive.rawKindManifests,
      ...archive.rawChunks,
      ...archive.dictionaries
    ]) {
      const { deduplicated, ...stored } = store.putObject(record.kind, record.body);
      expect(deduplicated).toBe(false);
      expect(stored).toEqual(record);
    }
    for (const kind of ['run', 'aggregate', 'comparison', 'qualification', 'experiment-child-manifest']) {
      expect(store.putObject(kind, { schemaVersion: 1, fixture: kind }).kind).toBe(kind);
    }

    const tampered = JSON.parse(JSON.stringify(archive));
    tampered.rawKindManifests[0].body.encodedChecksum = 'b'.repeat(64);
    tampered.rawKindManifests[0].hash = canonicalSha256({
      kind: tampered.rawKindManifests[0].kind,
      body: tampered.rawKindManifests[0].body
    });
    expect(() => reconstructPerformanceRawEvidence({
      rawKindManifests: tampered.rawKindManifests,
      rawChunks: tampered.rawChunks,
      dictionaries: tampered.dictionaries
    }, compiledPolicy)).toThrow(/encoded checksum/);

    const wrongChunkDictionary = JSON.parse(JSON.stringify(archive));
    const wrongCpuManifest = wrongChunkDictionary.rawKindManifests.find((record: { body: { rawKind: string } }) => record.body.rawKind === 'cpu-sample');
    wrongCpuManifest.body.chunkMetadata[0].dictionaryHash = wrongCpuManifest.body.chunkMetadata[1].dictionaryHash;
    wrongCpuManifest.hash = canonicalSha256({ kind: wrongCpuManifest.kind, body: wrongCpuManifest.body });
    expect(() => reconstructPerformanceRawEvidence({
      rawKindManifests: wrongChunkDictionary.rawKindManifests,
      rawChunks: wrongChunkDictionary.rawChunks,
      dictionaries: wrongChunkDictionary.dictionaries
    }, compiledPolicy)).toThrow(/encoded checksum|unreferenced dictionary/);
  });

  it('rejects forged normalized carriers and broken controller foreign keys', () => {
    const cpu = cpuRawRow('forged-cpu-run', 1);
    expect(() => encodePerformanceEvidence('cpu-sample', [{ ...cpu, cumulativeCpuSeconds: 99 }], compiledPolicy))
      .toThrow(/normalized CPU fields/);

    const process = {
      sourceSha: runtimeEvidenceProvenance.captureProvenance.sourceSha,
      policyHash,
      experimentId,
      experimentRole: 'reference-comparison',
      scopeKind: 'ledger-operation',
      scopeId: 'transport-boundary',
      captureKind: 'transport',
      ledgerSequence: 1,
      operationId: 'generic-transport-spawn',
      observationOrdinal: 1,
      observedAt: 1,
      observationKind: 'membership',
      observationSource: 'external',
      adapterId: 'external-membership-v1',
      subjectKind: 'transport',
      pid: 42,
      creationIdentity: 'created-42',
      processIdentity: 'external:42:created-42',
      rawAdapterKind: 'external-process-membership',
      rawIdentity: { pid: 42, creationIdentity: 'created-42' },
      rawMembership: {
        spawnBoundary: {}, rendererEvaluation: {}, ancestry: {},
        processGroup: null, job: null, pathIdentity: {}
      },
      processClass: 'application-renderer',
      ownership: 'application-owned',
      alive: true
    };
    expect(() => encodePerformanceEvidence('process-observation', [{ ...process, processIdentity: 'forged' }], compiledPolicy))
      .toThrow(/raw-derived identity/);
    const { rawMembership: _rawMembership, ...healthBase } = process;
    const health = {
      ...healthBase,
      observationKind: 'health',
      adapterId: 'external-health-v1',
      rawAdapterKind: 'external-process-health',
      rawHealth: { alive: true, status: 'reported', exitObservation: null },
      healthState: 'live'
    };
    expect(decodePerformanceEvidence(encodePerformanceEvidence('process-observation', [health], compiledPolicy), compiledPolicy)).toEqual([health]);
    expect(() => encodePerformanceEvidence('process-observation', [{
      ...health,
      rawHealth: { alive: false, status: 'exited', exitObservation: { code: 1 } }
    }], compiledPolicy)).toThrow(/normalized health differs from its raw registered carrier/);

    const hostState = {
      power: {}, display: {}, refreshRate: 60, devicePixelRatio: 1,
      thermal: {}, gpuSwitch: {}
    };
    const environment = {
      sourceSha: runtimeEvidenceProvenance.captureProvenance.sourceSha,
      policyHash,
      experimentId,
      experimentRole: 'ci-integrity',
      scopeKind: 'experiment',
      scopeId: experimentId,
      captureKind: 'experiment-environment',
      source: 'external-monitor',
      sourceSequence: 1,
      clockDomain: 'runner',
      runnerReceiptSequence: 1,
      observedAt: 1,
      observationKind: 'initial-snapshot',
      rawAdapterKind: 'external-host-snapshot-v1',
      rawObservation: { staticIdentity: hostState, dynamicState: hostState },
      staticIdentity: hostState,
      dynamicState: hostState
    };
    expect(() => encodePerformanceEvidence('environment-observation', [{
      ...environment,
      dynamicState: { ...hostState, refreshRate: 120 }
    }], compiledPolicy)).toThrow(/normalized host snapshot/);
    expect(() => encodePerformanceEvidence('environment-observation', [{
      ...environment,
      clockDomain: 'electron-main'
    }], compiledPolicy)).toThrow(/clockDomain differs/);

    const controllerBinding = {
      sourceSha: runtimeEvidenceProvenance.captureProvenance.sourceSha,
      policyHash,
      experimentId,
      experimentRole: 'reference-comparison',
      scopeKind: 'ledger-operation',
      scopeId: 'qualification-boundary',
      captureKind: 'qualification',
      ledgerSequence: 2,
      operationId: 'electron-harness-spawn',
      observationBoundaryId: 'qualification-boundary',
      clockDomain: 'electron-main'
    };
    const request = {
      ...controllerBinding,
      controlSequence: 1,
      operationKind: 'request',
      controllerRequestId: 'qualification-request',
      channel: 'browser-window',
      requestKind: 'qualification',
      rawRequest: {},
      sentAt: 1
    };
    const response = {
      ...controllerBinding,
      controlSequence: 2,
      operationKind: 'response',
      controllerRequestId: 'qualification-request',
      channel: 'browser-window',
      responseKind: 'qualification',
      rawResponse: {},
      receivedAt: 2,
      outcome: 'recorded'
    };
    expect(() => encodePerformanceEvidence('controller-operation', [request, {
      ...response,
      controllerRequestId: 'forged-request'
    }], compiledPolicy)).toThrow(/response must follow exactly one request/);
  });

  it('derives raw authority and projection checksums only from manifest-resolved captures', () => {
    const context = {
      experimentId,
      experimentRole: 'ci-integrity',
      sourceSha: ciRuntimeEvidenceProvenance.captureProvenance.sourceSha,
      policyHash
    };
    const hostState = {
      power: { source: 'ac' },
      display: { count: 1 },
      refreshRate: 60,
      devicePixelRatio: 1,
      thermal: { state: 'nominal' },
      gpuSwitch: { state: 'stable' }
    };
    const environmentRow = {
      captureKind: 'experiment-environment',
      clockDomain: 'runner',
      dynamicState: hostState,
      experimentId,
      experimentRole: 'ci-integrity',
      observationKind: 'initial-snapshot',
      observedAt: 0,
      policyHash,
      rawAdapterKind: 'external-host-snapshot-v1',
      rawObservation: { staticIdentity: hostState, dynamicState: hostState },
      runnerReceiptSequence: 1,
      scopeId: experimentId,
      scopeKind: 'experiment',
      source: 'external-monitor',
      sourceSequence: 1,
      sourceSha: context.sourceSha,
      staticIdentity: hostState
    };
    const transportRow = (sequence: number) => ({
      adapterId: 'external-membership-v1',
      alive: true,
      captureKind: 'transport',
      creationIdentity: `created-${sequence}`,
      experimentId,
      experimentRole: 'ci-integrity',
      ledgerSequence: sequence,
      observationKind: 'membership',
      observationOrdinal: 1,
      observationSource: 'external',
      observedAt: sequence,
      operationId: 'generic-transport-spawn',
      ownership: 'application-owned',
      pid: 40 + sequence,
      policyHash,
      processClass: 'application-renderer',
      processIdentity: `external:${40 + sequence}:created-${sequence}`,
      rawAdapterKind: 'external-process-membership',
      rawIdentity: { pid: 40 + sequence, creationIdentity: `created-${sequence}` },
      rawMembership: {
        spawnBoundary: {}, rendererEvaluation: {}, ancestry: {},
        processGroup: null, job: null, pathIdentity: {}
      },
      scopeId: `boundary-${sequence}`,
      scopeKind: 'ledger-operation',
      sourceSha: context.sourceSha,
      subjectKind: 'renderer'
    });
    const captureSet = {
      manifest: { evaluationContext: context },
      buildManifest: {},
      productionBundleEvidence: {},
      buildCommandLedger: {},
      performanceLedger: [],
      experimentEvidence: {
        captures: {
          environment: {
            captureKind: 'experiment-environment', scopeKind: 'experiment', checksum: hash,
            rawKinds: [{ rawKind: 'environment-observation', rows: [environmentRow] }]
          },
          transport: [1, 2].map((sequence) => ({
            captureKind: 'transport', operationId: 'generic-transport-spawn', observationBoundaryId: `boundary-${sequence}`, checksum: `${sequence}`.repeat(64).slice(0, 64),
            rawKinds: [{ rawKind: 'process-observation', rows: [transportRow(sequence)] }]
          }))
        }
      },
      backendFamilies: {}
    };
    const collected = collectPerformanceCaptureRows(captureSet as never, compiledPolicy);
    expect(Object.isFrozen(collected)).toBe(true);
    expect(Object.isFrozen(collected.rawArchive)).toBe(true);
    expect(Object.isFrozen(collected.rawArchive.rawEvidenceBody)).toBe(true);
    expect(Object.isFrozen(collected.captureProjections)).toBe(true);
    expect(Object.isFrozen(collected.captureProjections[0])).toBe(true);
    expect(collected.captureProjections).toHaveLength(3);
    expect(collected.captureProjections.every((projection) => /^[a-f0-9]{64}$/.test(projection.projectionChecksum))).toBe(true);
    expect(collected.rawArchive.rawKindManifests).toHaveLength(11);

    const duplicated = JSON.parse(JSON.stringify(captureSet));
    duplicated.experimentEvidence.captures.transport[1].observationBoundaryId = 'boundary-1';
    duplicated.experimentEvidence.captures.transport[1].rawKinds[0].rows = [transportRow(1)];
    expect(() => collectPerformanceCaptureRows(duplicated, compiledPolicy)).toThrow(/directly owned by more than one capture/);
    expect(() => collectPerformanceCaptureRows({ ...captureSet, inventedEvaluationInput: {} } as never, compiledPolicy)).toThrow(/forbidden field inventedEvaluationInput/);
  });

  it('uses raw-kind schemas and policy-defined columns for canonical optional cells', () => {
    const coverage = deriveAllocationExpectedCoverage({ acceptedRunIds: ['run'], frameCountByRun: { run: 1 } }, compiledPolicy);
    const rgba = coverage.find((entry) => entry.byteSemantics === 'rgba-transfer-footprint');
    const countOnly = coverage.find((entry) => entry.byteSemantics === 'count-only-unavailable');
    if (!rgba || !countOnly) throw new Error('expected frame allocation coverage fixtures');
    const rows = [allocationRow(rgba, 1), allocationRow(countOnly, 1)];
    const encoded = encodePerformanceEvidence('frame-request', rows, compiledPolicy);
    expect(encoded.columns).toEqual(compiledPolicy.policy.performanceEvidenceChunkPolicy.rawKinds['frame-request'].columns);
    expect(encoded.chunkDictionaries[0].map((entry: { state: number }) => entry.state)).toEqual(expect.arrayContaining([0, 1, 2]));
    expect(decodePerformanceEvidence(encoded)).toEqual([rows[0], rows[1]]);
    expect(() => encodePerformanceEvidence('frame-request', [{ ...rows[0], unexpected: true }], compiledPolicy)).toThrow(/unrecognized column/);
    const missingRunId = { ...rows[0] };
    delete missingRunId.runId;
    expect(() => encodePerformanceEvidence('frame-request', [missingRunId], compiledPolicy)).toThrow(/missing required column runId/);
    expect(() => encodePerformanceEvidence('frame-request', [{ ...rows[0], byteValue: undefined }], compiledPolicy)).toThrow(/JSON values or null/);

    const workerMessage = {
      sourceSha: runtimeEvidenceProvenance.captureProvenance.sourceSha,
      policyHash,
      experimentId,
      pairPlanChecksum: hash,
      ledgerSequence: 8,
      experimentRole: 'reference-comparison',
      scopeKind: 'run',
      scopeId: 'worker-run',
      captureKind: 'workload',
      runId: 'worker-run',
      metricSessionId: 'worker-session',
      comparisonKind: 'instrumentation-overhead',
      backend: 'webgpu',
      pairIndex: 1,
      attemptIndex: 1,
      comparisonSide: 'A',
      buildVariant: 'harness-control',
      launchOrdinal: 1,
      externalExecutionId: 'worker-external',
      observationBoundaryId: 'worker-boundary',
      captureOrdinal: 1,
      launchId: 'worker-launch',
      messageKind: 'acknowledgement',
      clockDomain: 'renderer-performance-now-v1',
      observedAt: 1,
      measurementWindowId: 'worker-window',
      measurementEpochId: null,
      sourceSequence: 1,
      diagnosticFrameId: null,
      frameToken: 1,
      tagged: true,
      outcome: 'webgpu-queue-submit-completed'
    };
    expect(decodePerformanceEvidence(encodePerformanceEvidence('worker-message', [workerMessage], compiledPolicy), compiledPolicy)).toEqual([workerMessage]);
    expect(() => encodePerformanceEvidence('worker-message', [{ ...workerMessage, clockDomain: 'external-performance-now-v1' }], compiledPolicy)).toThrow(/exactly one raw row shape/);
    expect(() => encodePerformanceEvidence('worker-message', [{ ...workerMessage, outcome: 'worker-terminal-error' }], compiledPolicy)).toThrow(/exactly one raw row shape/);
    expect(() => encodePerformanceEvidence('worker-message', [{ ...workerMessage, frameToken: 0 }], compiledPolicy)).toThrow(/positive safe-integer token/);
    expect(() => encodePerformanceEvidence('worker-message', [{ ...workerMessage, frameToken: '1' }], compiledPolicy)).toThrow(/positive safe-integer token/);
  });

  it('enforces the raw-row cap per run and raw kind', () => {
    const acceptedAcrossRuns = [
      ...Array.from({ length: 8193 }, (_, index) => cpuRawRow('run-a', index + 1, 8193)),
      ...Array.from({ length: 8192 }, (_, index) => cpuRawRow('run-b', index + 1, 8192))
    ];
    expect(encodePerformanceEvidence('cpu-sample', acceptedAcrossRuns, compiledPolicy).chunks).not.toHaveLength(0);
    const overflowOneRun = Array.from({ length: 16385 }, (_, index) => cpuRawRow('run-overflow', index + 1, 16385));
    expect(() => encodePerformanceEvidence('cpu-sample', overflowOneRun, compiledPolicy)).toThrow(/scope run.*run-overflow exceeds 16384 rows/);
  });

  it('keeps performance ordering stable when locale comparison behavior changes', () => {
    const input = { acceptedRunIds: ['z-run', 'a-run', 'ä-run'], frameCountByRun: { 'z-run': 1, 'a-run': 1, 'ä-run': 1 } };
    const baseline = deriveAllocationExpectedCoverage(input, compiledPolicy);
    const originalLocaleCompare = String.prototype.localeCompare;
    let contrasted: ReturnType<typeof deriveAllocationExpectedCoverage>;
    try {
      String.prototype.localeCompare = () => -1;
      contrasted = deriveAllocationExpectedCoverage(input, compiledPolicy);
    } finally {
      String.prototype.localeCompare = originalLocaleCompare;
    }
    expect(contrasted).toEqual(baseline);
  });

  it('allows only contiguous, bounded retries after completed two-launch attempts', () => {
    const first = completePairAttempt({ sessionId: 'pair-1-attempt-1', pairIndex: 1, attemptIndex: 1, retryReason: null, sequenceOffset: 0, timeOffset: 0 });
    const retry = completePairAttempt({ sessionId: 'pair-1-attempt-2', pairIndex: 1, attemptIndex: 2, retryReason: 'cpu-boundary-overlap', sequenceOffset: 6, timeOffset: 6 });
    expect(validatePerformanceLedger([...first, ...retry] as never)).toEqual([...first, ...retry]);
    const nonCpuCompletedRetry = completePairAttempt({ sessionId: 'pair-1-attempt-2', pairIndex: 1, attemptIndex: 2, retryReason: 'sample-floor', sequenceOffset: 6, timeOffset: 6 });
    expect(validatePerformanceLedger([...first, ...nonCpuCompletedRetry] as never)).toEqual([...first, ...nonCpuCompletedRetry]);
    const fourthAttempt = completePairAttempt({ sessionId: 'pair-1-attempt-4', pairIndex: 1, attemptIndex: 4, retryReason: 'cpu-boundary-overlap', sequenceOffset: 18, timeOffset: 18 });
    expect(() => validatePerformanceLedger([...first, ...retry, ...completePairAttempt({ sessionId: 'pair-1-attempt-3', pairIndex: 1, attemptIndex: 3, retryReason: 'cpu-boundary-overlap', sequenceOffset: 12, timeOffset: 12 }), ...fourthAttempt] as never)).toThrow(/retry limit|attempt indices/);
    const harnessOptions = { experimentId, backend: 'webgpu' as const, comparisonKind: 'harness-overhead' as const };
    const instrumentationOptions = { experimentId, backend: 'webgpu' as const, comparisonKind: 'instrumentation-overhead' as const };
    const harnessFirstAttempt = completePairAttempt({
      sessionId: 'harness-pair-1-attempt-1', pairIndex: 1, attemptIndex: 1, retryReason: null,
      sequenceOffset: 0, timeOffset: 0, ledgerOptions: harnessOptions
    });
    const crossKindAttemptTwo = completePairAttempt({
      sessionId: 'instrumentation-pair-1-attempt-2', pairIndex: 1, attemptIndex: 2, retryReason: 'cpu-boundary-overlap',
      sequenceOffset: 6, timeOffset: 6, ledgerOptions: instrumentationOptions
    });
    expect(() => validatePerformanceLedger([...harnessFirstAttempt, ...crossKindAttemptTwo] as never)).toThrow(/attempt indices must be contiguous/);
    const instrumentationFirstAttempt = completePairAttempt({
      sessionId: 'instrumentation-pair-1-attempt-1', pairIndex: 1, attemptIndex: 1, retryReason: null,
      sequenceOffset: 6, timeOffset: 6, ledgerOptions: instrumentationOptions
    });
    expect(validatePerformanceLedger([...harnessFirstAttempt, ...instrumentationFirstAttempt] as never)).toEqual([...harnessFirstAttempt, ...instrumentationFirstAttempt]);
    expect(classifyFailure({ phase: 'measurement', backend: 'webgpu', reason: 'cpu-boundary-overlap' })).toBe('retryable-pair-invalid');
  });

  it('rejects mixed retry representations before a later legacy launch can be accepted', () => {
    const ledgerOptions = { experimentId, backend: 'webgpu' as const, comparisonKind: 'instrumentation-overhead' as const };
    const abortReason = { phase: 'side-a', backend: 'webgpu', reason: 'host-noise' };
    const explicitAbortedAttempt = completePairAttempt({
      sessionId: 'explicit-aborted', pairIndex: 1, attemptIndex: 1, retryReason: null,
      sequenceOffset: 0, timeOffset: 0, ledgerOptions
    }).slice(0, 3) as Array<Record<string, any>>;
    explicitAbortedAttempt[2] = {
      ...explicitAbortedAttempt[2],
      outcome: 'failed',
      abortReason,
      lastBoundary: 'reset-a'
    };
    explicitAbortedAttempt.push({
      sequence: 4,
      operationId: 'metric-adapter-session-close',
      start: 3,
      end: 4,
      metricSessionId: 'explicit-aborted',
      outcome: 'aborted',
      abortReason,
      lastBoundary: 'reset-a',
      closure: explicitAbortedAttempt[2].cleanup
    });
    const legacySession = (sequenceOffset: number, prefix: string) => validLedger(ledgerOptions).map((entry) => {
      const remapped = {
        ...entry,
        sequence: entry.sequence + sequenceOffset,
        start: entry.start + sequenceOffset,
        end: entry.end + sequenceOffset
      } as Record<string, any>;
      if ('metricSessionId' in remapped) remapped.metricSessionId = `${prefix}-session`;
      if (remapped.operationId === 'internal-reset') remapped.resetId = `${prefix}-${remapped.resetId}`;
      if (remapped.operationId === 'electron-harness-spawn') {
        remapped.runId = `${prefix}-${remapped.runId}`;
        remapped.launchId = `${prefix}-${remapped.launchId}`;
        remapped.executionId = `${prefix}-${remapped.executionId}`;
        if (remapped.measurementEpochId) remapped.measurementEpochId = `${prefix}-${remapped.measurementEpochId}`;
      }
      return remapped;
    });
    const laterLegacyAttempt = legacySession(4, 'legacy-after-abort');
    expect(() => deriveAcceptedInstrumentedLedgerRuns(
      [...explicitAbortedAttempt, ...laterLegacyAttempt] as never,
      { experimentId, backend: 'webgpu' },
      compiledPolicy
    )).toThrow(/attempt metadata/);
    expect(() => validatePerformanceLedger([
      ...validLedger(ledgerOptions),
      ...legacySession(6, 'second-legacy')
    ] as never)).toThrow(/legacy ledger representation/);
  });

  it('fails closed on invalid failure tuples and metric-session grammar', () => {
    const ledger = validLedger();
    expect(validatePerformanceLedger(ledger)).toEqual(ledger);
    expect(() => validatePerformanceLedger([...ledger, { sequence: 7, operationId: 'internal-reset', start: 6, end: 7, metricSessionId: 'session', resetId: 'late', boundary: 'reset-before-a' }])).toThrow(/out of metric-session order/);
    expect(() => validatePerformanceLedger(ledger.map((entry, index) => index === 2 ? { ...entry, start: 1.5 } : entry))).toThrow(/must not overlap/);
    expect(() => validatePerformanceLedger(ledger.map((entry, index) => index === 4 ? { ...entry, comparisonSide: 'A' } : entry))).toThrow(/must be side B/);
    expect(() => validatePerformanceLedger(ledger.map((entry, index) => index === 2 ? { ...entry, buildVariant: 'production' } : entry))).toThrow(/harness variant/);
    const resourceOwnedAbort = [
      { sequence: 1, operationId: 'metric-adapter-session-open', start: 0, end: 1, metricSessionId: 'resource-owned', outcome: 'failed-resource-owned', abortReason: { phase: 'open', backend: 'none', reason: 'metric-adapter-resource-owned' }, lastBoundary: 'open' },
      { sequence: 2, operationId: 'metric-adapter-session-close', start: 1, end: 2, metricSessionId: 'resource-owned', outcome: 'aborted', abortReason: { phase: 'open', backend: 'none', reason: 'metric-adapter-resource-owned' }, lastBoundary: 'open', closure: { closed: true, stdoutDrained: true, stderrDrained: true, inputClosed: true, exit: { code: 0, durationMs: 1 }, zeroSurvivors: true } }
    ];
    expect(validatePerformanceLedger(resourceOwnedAbort)).toEqual(resourceOwnedAbort);
    expect(() => validatePerformanceLedger([resourceOwnedAbort[0], { sequence: 2, operationId: 'internal-reset', start: 1, end: 2, metricSessionId: 'resource-owned', resetId: 'late', boundary: 'reset-before-a' }])).toThrow(/out of metric-session order/);
    const duplicateSession = validLedger().map((entry) => ({ ...entry, sequence: entry.sequence + ledger.length, start: entry.start + ledger.length, end: entry.end + ledger.length }));
    expect(() => validatePerformanceLedger([...ledger, ...duplicateSession])).toThrow(/metric session IDs must be unique/);
    expect(classifyFailure({ phase: 'qualification', backend: 'webgpu', reason: 'webgpu-api-unavailable' })).toBe('qualification-unavailable');
    expect(() => classifyFailure({ phase: 'startup', backend: 'webgpu', reason: 'webgpu-api-unavailable' })).toThrow(/only valid/);
    expect(() => classifyFailure({ phase: 'measurement', backend: 'webgpu', reason: 'invented' })).toThrow(/unsupported/);
    expect(() => classifyFailure({ phase: 'measurement', backend: 'webgpu', reason: 'worker-error', extra: true } as never)).toThrow(/forbidden field/);
  });

  it('executes the operation registry grammar and exact canonical run joins', () => {
    const ledger = canonicalLedger();
    expect(validatePerformanceLedger(ledger as never)).toEqual(ledger);
    const multiBackendLedger = canonicalMultiBackendLedger();
    expect(validatePerformanceLedger(multiBackendLedger as never)).toEqual(multiBackendLedger);

    const mismatchedBackendPlan = JSON.parse(JSON.stringify(multiBackendLedger));
    mismatchedBackendPlan[15].pairPlanChecksum = 'e'.repeat(64);
    expect(() => validatePerformanceLedger(mismatchedBackendPlan)).toThrow(/pairPlanChecksum|webgpu launches must bind one pair plan/);

    const reordered = JSON.parse(JSON.stringify(ledger));
    const generic = reordered[0];
    const electron = reordered[4];
    reordered[0] = { ...electron, sequence: 1, start: 0, end: 1, applicationDescendantClosureEnd: 1 };
    reordered[4] = { ...generic, sequence: 5, start: 4, end: 5, transportClosureEnd: 5 };
    expect(() => validatePerformanceLedger(reordered)).toThrow(/registry root|pre-loop ledger prefix|predecessor grammar/);

    const missingJoinKey = JSON.parse(JSON.stringify(ledger));
    delete missingJoinKey[7].pairPlanChecksum;
    expect(() => validatePerformanceLedger(missingJoinKey)).toThrow(/pairPlanChecksum/);

    const mismatchedLedgerSequence = JSON.parse(JSON.stringify(ledger));
    mismatchedLedgerSequence[7].ledgerSequence = 9;
    expect(() => validatePerformanceLedger(mismatchedLedgerSequence)).toThrow(/ledgerSequence must equal sequence/);

    const missingDiscriminator = JSON.parse(JSON.stringify(ledger));
    delete missingDiscriminator[4].purpose;
    expect(() => validatePerformanceLedger(missingDiscriminator)).toThrow(/exactly one discriminator-aware/);

    const missingRegistryField = JSON.parse(JSON.stringify(ledger));
    delete missingRegistryField[6].resetIdentity;
    expect(() => validatePerformanceLedger(missingRegistryField)).toThrow(/registry-required field resetIdentity/);

    const forbiddenRegistryField = JSON.parse(JSON.stringify(ledger));
    forbiddenRegistryField[6].metricSessionId = 'canonical-session';
    expect(() => validatePerformanceLedger(forbiddenRegistryField)).toThrow(/registry-forbidden field metricSessionId/);

    const callerClockDomain = JSON.parse(JSON.stringify(ledger));
    callerClockDomain[7].clockDomain = 'runner';
    expect(() => validatePerformanceLedger(callerClockDomain)).toThrow(/registry-undeclared field clockDomain/);

    const callerPairLoopStart = JSON.parse(JSON.stringify(ledger));
    callerPairLoopStart[5].pairLoopStart = 5;
    expect(() => validatePerformanceLedger(callerPairLoopStart)).toThrow(/registry-undeclared field pairLoopStart/);
  });

  it('binds allocation rows to completed instrumented ledger runs and rejects fabricated joins', () => {
    const policy = loadBaselinePolicy();
    const ledger = validLedger({ experimentId, backend: 'webgpu', comparisonKind: 'instrumentation-overhead' });
    const acceptedRuns = deriveAcceptedInstrumentedLedgerRuns(ledger, { experimentId, backend: 'webgpu' }, policy);
    expect(acceptedRuns).toHaveLength(1);
    expect(acceptedRuns[0]).toMatchObject({ runId: 'run', measurementEpochId: 'epoch', buildVariant: 'instrumented', comparisonKind: 'instrumentation-overhead', policyHash: policy.policyHash });
    const expected = deriveAllocationExpectedCoverage({ acceptedRunIds: ['run'], frameCountByRun: { run: 1 } }, policy);
    const completeRows = expected.flatMap((entry) => Array.from({ length: entry.expectedCardinality }, (_, offset) => allocationRow(entry, offset + 1)));
    expect(deriveAllocationEvidence(allocationInput(completeRows), policy).state).toBe('measured-request-proxy');
    const frame = completeRows.find((row) => row.carrier === 'frame-request')!;
    expect(() => deriveAllocationEvidence(allocationInput([{ ...frame, runId: 'fabricated-run' }]), policy)).toThrow(/unknown operation or source location|accepted instrumented run/);
    expect(() => deriveAllocationEvidence(allocationInput([{ ...frame, measurementEpochId: 'wrong-epoch' }]), policy)).toThrow(/run epoch/);
    expect(() => deriveAllocationEvidence(allocationInput([{ ...frame, policyHash: 'b'.repeat(64) }]), policy)).toThrow(/experiment, backend, and policy identity/);
    expect(() => deriveAllocationEvidence({ ...allocationInput([frame]), experimentId: 'wrong-experiment' }, policy)).toThrow(/ledger does not bind/);
  });

  it('rejects mismatched comparison variants, arbitrary abort tuples, duplicate boundaries, and pre-loop reentry', () => {
    const ledger = validLedger();
    expect(() => validatePerformanceLedger(ledger.map((entry, index) => index === 4 ? { ...entry, comparisonKind: 'instrumentation-overhead' } : entry))).toThrow(/incompatible with instrumentation-overhead/);
    expect(() => validatePerformanceLedger(ledger.map((entry, index) => index === 2 ? { ...entry, buildVariant: 'instrumented', measurementEpochId: 'epoch', frameSourceSequences: [1] } : entry))).toThrow(/incompatible with harness-overhead/);
    expect(() => validatePerformanceLedger(ledger.map((entry, index) => index === 4 ? { ...entry, runId: 'a' } : entry))).toThrow(/run IDs must be unique/);
    expect(() => validatePerformanceLedger(ledger.map((entry, index) => index === 3 ? { ...entry, resetId: 'a' } : entry))).toThrow(/reset IDs must be unique/);
    const resetAbort = [
      { sequence: 1, operationId: 'metric-adapter-session-open', start: 0, end: 1, metricSessionId: 'abort', outcome: 'ready' },
      { sequence: 2, operationId: 'metric-adapter-session-close', start: 1, end: 2, metricSessionId: 'abort', outcome: 'aborted', abortReason: { phase: 'reset-a', backend: 'none', reason: 'reset-failure' }, lastBoundary: 'open', closure: { closed: true, stdoutDrained: true, stderrDrained: true, inputClosed: true, exit: { code: 0, durationMs: 1 }, zeroSurvivors: true } }
    ];
    expect(validatePerformanceLedger(resetAbort)).toEqual(resetAbort);
    expect(() => validatePerformanceLedger(resetAbort.map((entry, index) => index === 1 ? { ...entry, abortReason: { phase: 'reset-a', backend: 'none', reason: 'arbitrary-abort' } } : entry))).toThrow(/policy-valid metric-session tuple/);
    const sideAbort: any[] = validLedger({ experimentId, backend: 'webgpu', comparisonKind: 'instrumentation-overhead' }).slice(0, 2);
    sideAbort.push({
      sequence: 3,
      operationId: 'metric-adapter-session-close',
      start: 2,
      end: 3,
      metricSessionId: 'session',
      outcome: 'aborted',
      abortReason: { phase: 'side-a', backend: 'webgpu', reason: 'worker-error' },
      lastBoundary: 'reset-a',
      closure: { closed: true, stdoutDrained: true, stderrDrained: true, inputClosed: true, exit: { code: 0, durationMs: 1 }, zeroSurvivors: true }
    });
    expect(validatePerformanceLedger(sideAbort)).toEqual(sideAbort);
    expect(() => validatePerformanceLedger([...ledger, { sequence: 7, operationId: 'build-spawn', start: 6, end: 7, buildId: 'late-build', closure: { closed: true, stdoutDrained: true, stderrDrained: true, inputClosed: true, exit: { code: 0, durationMs: 1 }, zeroSurvivors: true } }])).toThrow(/pre-loop ledger prefix/);
  });

  it('fully rejects malformed nested baseline-policy sections', () => {
    const mutations: Array<[string, (policy: any) => void]> = [
      ['environment unknown field', (policy) => { policy.performanceEnvironmentPolicy.extra = true; }],
      ['environment cadence null', (policy) => { policy.performanceEnvironmentPolicy.pollCadenceMs.minimum = null; }],
      ['environment clock mapping missing', (policy) => { policy.performanceEnvironmentPolicy.clockDomainMappings.pop(); }],
      ['operation field missing', (policy) => { delete policy.performanceOperationRegistry.operations[0].variant; }],
      ['adapter incompatible source', (policy) => { policy.processAdapterRegistry.adapters[0].metricSource = 'ps'; }],
      ['failure tuple extra field', (policy) => { policy.performanceFailurePolicy.metricSessionAbortTuples[0].extra = true; }],
      ['disposition missing field', (policy) => { delete policy.performanceDispositionPolicy.advisoryDispositionIsAuthority; }],
      ['metric score null', (policy) => { policy.performanceMetricPolicy.scoreCountByComparisonKind['instrumentation-overhead'] = null; }],
      ['capacity encoding invalid', (policy) => { policy.capacityFixturePolicy.encoding = 'runtime-allocation-rows-v1'; }],
      ['capacity callback encoding invalid', (policy) => { policy.capacityFixturePolicy.callbackCohortEncoding = 'runtime-source-sequences-v1'; }],
      ['comparison fingerprint unknown', (policy) => { policy.comparisonFingerprintPolicy.extra = true; }],
      ['qualification fingerprint incomplete', (policy) => { policy.qualificationFingerprintPolicy.includedFields.pop(); }],
      ['chunk schema unknown raw kind', (policy) => { policy.performanceEvidenceChunkPolicy.rawKinds.unknown = { sortKeys: [] }; }],
      ['chunk schema missing columns', (policy) => { delete policy.performanceEvidenceChunkPolicy.rawKinds['cpu-sample'].columns; }],
      ['chunk schema has nonrequired reference', (policy) => { policy.performanceEvidenceChunkPolicy.rawKinds['cpu-sample'].referenceColumns = ['processIdentity']; }],
      ['limit nested shape malformed', (policy) => { delete policy.performanceLimits.window.minimumCallbacks; }],
      ['allocation nested schema malformed', (policy) => { policy.allocationEvidencePolicy.webgpu.coverage[0].lifecyclePhase = 'startup'; }],
      ['transcode impacts reordered', (policy) => { policy.transcodeDecisionPolicy.rows[0].impactedContractIds.reverse(); }],
      ['transcode option strategy mapping changed', (policy) => {
        [policy.transcodeDecisionPolicy.rows[0].strategy, policy.transcodeDecisionPolicy.rows[1].strategy] = [
          policy.transcodeDecisionPolicy.rows[1].strategy,
          policy.transcodeDecisionPolicy.rows[0].strategy
        ];
      }],
      ['transcode test mapping changed', (policy) => { policy.transcodeDecisionPolicy.rows[1].impactedTestIds = ['unlisted-progress-test']; }],
      ['transcode closure test mapping changed', (policy) => { policy.transcodeDecisionPolicy.contracts[1].closureTestIds = ['transcode-other-semantics']; }]
    ];
    for (const [label, mutate] of mutations) {
      const policy = JSON.parse(JSON.stringify(compiledPolicy.policy));
      mutate(policy);
      expect(() => validateBaselinePolicy(policy), label).toThrow(/Performance evidence failed/);
    }
  });

  it('pins the policy-owned transcode registry as an immutable v1 semantic matrix', () => {
    const clonePolicy = () => JSON.parse(JSON.stringify(compiledPolicy.policy));
    const semanticBody = (policy: any) => {
      const { version, contracts, rows } = policy.transcodeDecisionPolicy;
      return { version, contracts, rows };
    };
    const expectRejected = (label: string, mutate: (policy: any) => void, message: RegExp = /Performance evidence failed/) => {
      const policy = clonePolicy();
      mutate(policy);
      expect(() => validateBaselinePolicy(policy), label).toThrow(message);
    };

    expect(validateBaselinePolicy(clonePolicy()).transcodeDecisionPolicy.semanticIntegritySha256)
      .toBe(compiledPolicy.policy.transcodeDecisionPolicy.semanticIntegritySha256);

    expectRejected('arbitrary alpha beta gamma triples', (policy) => {
      const triples = [['alpha', 'first', false], ['beta', 'second', false], ['gamma', 'third', true]];
      policy.transcodeDecisionPolicy.rows.forEach((row: any, index: number) => {
        [row.option, row.strategy, row.blocked] = triples[index];
      });
    }, /semantic integrity checksum is stale/);

    for (const [left, right] of [[0, 1], [0, 2], [1, 2]]) {
      expectRejected(`off-diagonal semantic swap ${left}-${right}`, (policy) => {
        const rows = policy.transcodeDecisionPolicy.rows;
        const leftState = { strategy: rows[left].strategy, blocked: rows[left].blocked };
        rows[left].strategy = rows[right].strategy;
        rows[left].blocked = rows[right].blocked;
        rows[right].strategy = leftState.strategy;
        rows[right].blocked = leftState.blocked;
      }, /semantic integrity checksum is stale/);
    }

    expectRejected('stale policy-owned semantic integrity checksum', (policy) => {
      policy.transcodeDecisionPolicy.rows[0].option = 'alpha';
    }, /semantic integrity checksum is stale/);
    expectRejected('recomputed policy-owned semantic integrity checksum', (policy) => {
      policy.transcodeDecisionPolicy.rows[0].option = 'alpha';
      policy.transcodeDecisionPolicy.semanticIntegritySha256 = canonicalSha256(semanticBody(policy));
    }, /frozen v1 integrity pin/);
    expectRejected('recomputed checksum after an omitted contract impact', (policy) => {
      policy.transcodeDecisionPolicy.rows[0].impactedContractIds.splice(0, 1);
      policy.transcodeDecisionPolicy.semanticIntegritySha256 = canonicalSha256(semanticBody(policy));
    }, /frozen v1 integrity pin/);

    for (const [rowIndex, row] of compiledPolicy.policy.transcodeDecisionPolicy.rows.entries()) {
      for (const [impactIndex, contractId] of row.impactedContractIds.entries()) {
        expectRejected(`row ${rowIndex} omits contract impact ${contractId}`, (policy) => {
          policy.transcodeDecisionPolicy.rows[rowIndex].impactedContractIds.splice(impactIndex, 1);
        });
        expectRejected(`row ${rowIndex} misspells contract impact ${contractId}`, (policy) => {
          policy.transcodeDecisionPolicy.rows[rowIndex].impactedContractIds[impactIndex] = `${contractId}-misspelled`;
        });
      }
      for (const [impactIndex, testId] of row.impactedTestIds.entries()) {
        expectRejected(`row ${rowIndex} omits test impact ${testId}`, (policy) => {
          policy.transcodeDecisionPolicy.rows[rowIndex].impactedTestIds.splice(impactIndex, 1);
        });
        expectRejected(`row ${rowIndex} misspells test impact ${testId}`, (policy) => {
          policy.transcodeDecisionPolicy.rows[rowIndex].impactedTestIds[impactIndex] = `${testId}-misspelled`;
        });
      }
    }
  });

  it('classifies pair attempts without requiring the runner to parse evaluator errors', () => {
    const completedLedger = completePairAttempt({
      sessionId: 'completed-attempt-1', pairIndex: 1, attemptIndex: 1, retryReason: null,
      sequenceOffset: 0, timeOffset: 0,
      ledgerOptions: { experimentId, backend: 'canvas2d', comparisonKind: 'harness-overhead' }
    });
    const completedRawEvidence = rawEvidence(completedLedger as ReturnType<typeof validLedger>);
    expect(assessPerformancePairAttempt({ ledger: completedLedger, rawEvidence: completedRawEvidence }, compiledPolicy)).toEqual({
      disposition: 'accepted', reason: null, retryAllowed: false, nextAttemptIndex: null
    });
    for (const side of ['A', 'B'] as const) {
      expect(assessPerformancePairAttempt({
        ledger: abortedPairAttempt({ side, reason: side === 'A' ? 'sample-floor' : 'cadence-insufficient' }),
        rawEvidence: null
      }, compiledPolicy)).toEqual({
        disposition: 'fatal',
        reason: side === 'A' ? 'sample-floor' : 'cadence-insufficient',
        retryAllowed: false,
        nextAttemptIndex: null
      });
    }
    const overlapRawEvidence = JSON.parse(JSON.stringify(completedRawEvidence));
    overlapRawEvidence.runs[0].cpuSamples.forEach((sample: { cumulativeCpuSeconds: number }, index: number) => {
      sample.cumulativeCpuSeconds = index * 0.056;
    });
    expect(assessPerformancePairAttempt({ ledger: completedLedger, rawEvidence: overlapRawEvidence }, compiledPolicy)).toEqual({
      disposition: 'retryable', reason: 'cpu-boundary-overlap', retryAllowed: true, nextAttemptIndex: 2
    });
    const unsafeCleanup = abortedPairAttempt({ side: 'B', reason: 'host-noise' });
    unsafeCleanup.at(-1).closure.zeroSurvivors = false;
    expect(assessPerformancePairAttempt({ ledger: unsafeCleanup, rawEvidence: null }, compiledPolicy)).toEqual({
      disposition: 'fatal', reason: 'unclean-shutdown', retryAllowed: false, nextAttemptIndex: null
    });
    const regressionRawEvidence = JSON.parse(JSON.stringify(completedRawEvidence));
    regressionRawEvidence.runs[0].cpuSamples.forEach((sample: { cumulativeCpuSeconds: number }, index: number) => {
      sample.cumulativeCpuSeconds = index * 0.5;
    });
    expect(assessPerformancePairAttempt({ ledger: completedLedger, rawEvidence: regressionRawEvidence }, compiledPolicy)).toEqual({
      disposition: 'rejected-regression', reason: 'definite-regression:external-cpu-p95', retryAllowed: false, nextAttemptIndex: null
    });
    const aborted = abortedPairAttempt({ side: 'B', reason: 'host-noise' });
    const later = completePairAttempt({
      sessionId: 'attempt-after-abort', pairIndex: 1, attemptIndex: 2, retryReason: 'host-noise',
      sequenceOffset: aborted.length, timeOffset: aborted.at(-1).end,
      ledgerOptions: { experimentId, backend: 'canvas2d', comparisonKind: 'harness-overhead' }
    });
    expect(() => validatePerformanceLedger([...aborted, ...later] as never)).toThrow(/aborted metric sessions never authorize a retry/);
  });

  it('rejects caller-authored legacy finalizer fields instead of splicing evaluator authority', () => {
    const input = validCiCanvasEvaluationInput();
    expect(() => finalizeCiCanvasPerformanceExperiment(input as never, compiledPolicy)).toThrow(/forbidden field experimentId/);
  });

  it('seals full evaluator inputs and retains purpose/provenance in non-publishable capacity parents', () => {
    const input = validCiCanvasEvaluationInput();
    const rawInput = createPerformanceRawArchive({
      experimentId,
      rowsByRawKind: Object.fromEntries(compiledPolicy.rawKindOrder.map((rawKind) => [rawKind, []]))
    }, compiledPolicy).rawEvidenceBody;
    const sealed = createPerformanceEvaluatorInput({
      evaluationContext: {
        experimentId,
        experimentRole: 'ci-integrity',
        sourceSha: ciRuntimeEvidenceProvenance.captureProvenance.sourceSha,
        policyHash
      },
      semanticAuthority: input.semanticAuthority,
      finalizationPurpose: input.finalizationPurpose,
      evidenceProvenance: input.evidenceProvenance,
      buildManifest: input.buildManifest,
      productionBundleEvidence: input.productionBundleEvidence,
      ledger: input.ledger,
      pairPlans: input.pairPlans,
      qualificationBody: null,
      rawInput
    }, compiledPolicy);
    expect(Object.isFrozen(sealed)).toBe(true);
    expect(Object.isFrozen(sealed.semanticAuthority.repository)).toBe(true);
    expect(() => createPerformanceEvaluatorInput({ ...sealed, invented: true } as never, compiledPolicy)).toThrow(/forbidden field invented/);
    expect(() => createPerformanceEvaluatorInput({
      ...sealed,
      evaluationContext: { ...sealed.evaluationContext, sourceSha: 'b'.repeat(40) }
    }, compiledPolicy)).toThrow(/repository does not match/);
    const forgedBuild = JSON.parse(JSON.stringify(sealed));
    forgedBuild.buildManifest.variants[0].bundle.entries[0].bytes += 1;
    expect(() => createPerformanceEvaluatorInput(forgedBuild, compiledPolicy)).toThrow(/bundle checksum is invalid/);
    const forgedBundleRoot = JSON.parse(JSON.stringify(sealed));
    forgedBundleRoot.productionBundleEvidence.codeRoots[0].entries[0].path = 'preload/index.js';
    expect(() => createPerformanceEvaluatorInput(forgedBundleRoot, compiledPolicy)).toThrow(/missing, duplicated, or assigned to the wrong root/);
    expect(() => createPerformanceEvaluationBody({
      experimentId,
      experimentRole: 'ci-integrity',
      finalizationPurpose: 'capacity-fixture',
      ledger: [],
      retryTopology: {},
      backendEvaluations: [],
      qualificationFingerprint: null,
      failureDisposition: null,
      rawEvidenceChecksum: hash,
      evidenceProvenance: {
        kind: 'capacity-fixture', fixtureId: 'fixture', scenarioId: 'scenario', seedHash: hash,
        runtimeProjection: ciRuntimeEvidenceProvenance.captureProvenance
      },
      topology: {},
      publicationEligible: true
    } as never)).toThrow(/publication eligibility/);

    const capacityInput = JSON.parse(JSON.stringify(input));
    capacityInput.finalizationPurpose = 'capacity-fixture';
    capacityInput.evidenceProvenance = {
      kind: 'capacity-fixture',
      fixtureId: 'capacity-fixture',
      scenarioId: 'ci-canvas-maximum',
      seedHash: hash,
      runtimeProjection: ciRuntimeEvidenceProvenance.captureProvenance
    };
    expect(() => finalizeCiCanvasPerformanceExperiment(capacityInput as never, compiledPolicy)).toThrow(/forbidden field experimentId/);
  });

  it('requires raw cohort evidence and recomputes CPU, timing, environment, process, and score bounds before publication', () => {
    const input = validRuntimeEvaluationInput();
    const evaluation = evaluatePerformanceExperiment(input, compiledPolicy);
    expect(evaluation.publicationEligible).toBe(false);
    expect(evaluation.rawEvidence.scores).toHaveLength(6);
    expect(() => requirePublishablePerformanceEvidence(evaluation)).toThrow(/complete semantic topology/);
    expect(() => evaluatePerformanceExperiment({ ...input, rawEvidence: undefined } as never, compiledPolicy)).toThrow(/requires raw CPU/);

    const invalidCadence = JSON.parse(JSON.stringify(input));
    invalidCadence.rawEvidence.runs[0].cpuSamples[1].readStart = 2;
    invalidCadence.rawEvidence.runs[0].cpuSamples[1].readEnd = 2.01;
    expect(() => evaluatePerformanceExperiment(invalidCadence, compiledPolicy)).toThrow(/cadence/);

    const delayedCpuStart = JSON.parse(JSON.stringify(input));
    delayedCpuStart.rawEvidence.runs[0].cpuSamples.forEach((sample: { readStart: number; readEnd: number }, index: number) => {
      sample.readStart += 0.5;
      sample.readEnd += 0.5;
      delayedCpuStart.rawEvidence.runs[0].process.observations[index].observedAt = (sample.readStart + sample.readEnd) / 2;
    });
    expect(() => evaluatePerformanceExperiment(delayedCpuStart, compiledPolicy)).toThrow(/immediate workload-start/);

    const missingTerminalCpuSample = JSON.parse(JSON.stringify(input));
    missingTerminalCpuSample.rawEvidence.runs[0].cpuSamples.pop();
    missingTerminalCpuSample.rawEvidence.runs[0].process.observations.pop();
    expect(() => evaluatePerformanceExperiment(missingTerminalCpuSample, compiledPolicy)).toThrow(/terminal CPU sample/);

    const straddlingTerminalCpuSample = JSON.parse(JSON.stringify(input));
    const straddlingRun = straddlingTerminalCpuSample.rawEvidence.runs[0];
    const straddlingSample = straddlingRun.cpuSamples.at(-1);
    straddlingSample.readStart = 29.995;
    straddlingSample.readEnd = 30.005;
    straddlingRun.process.observations.at(-1).observedAt = 30;
    expect(() => evaluatePerformanceExperiment(straddlingTerminalCpuSample, compiledPolicy)).toThrow(/exactly the first terminal CPU sample/);

    const extraPostClosureCpuSample = JSON.parse(JSON.stringify(input));
    const extraPostClosureRun = extraPostClosureCpuSample.rawEvidence.runs[0];
    const firstTerminal = extraPostClosureRun.cpuSamples.at(-1);
    const trailingSample = {
      ...firstTerminal,
      ordinal: firstTerminal.ordinal + 1,
      readStart: firstTerminal.readStart + 0.5,
      readEnd: firstTerminal.readEnd + 0.5,
      cumulativeCpuSeconds: firstTerminal.cumulativeCpuSeconds + 0.05
    };
    extraPostClosureRun.cpuSamples.push(trailingSample);
    extraPostClosureRun.process.observations.push({
      sequence: trailingSample.ordinal,
      observedAt: (trailingSample.readStart + trailingSample.readEnd) / 2,
      identity: extraPostClosureRun.process.identity,
      alive: true
    });
    expect(() => evaluatePerformanceExperiment(extraPostClosureCpuSample, compiledPolicy)).toThrow(/exactly the first terminal CPU sample/);

    const terminalWorkingSetSpike = JSON.parse(JSON.stringify(input));
    const instrumentedRun = terminalWorkingSetSpike.rawEvidence.runs.find((run: { runId: string }) => run.runId === 'run');
    instrumentedRun.cpuSamples.slice(-4).forEach((sample: { workingSetMiB: number }) => {
      sample.workingSetMiB = 1024;
    });
    const inWindowWorkingSetEvaluation = evaluatePerformanceExperiment(terminalWorkingSetSpike, compiledPolicy);
    expect(inWindowWorkingSetEvaluation.rawEvidence.scores.find((score: { metricId: string }) => score.metricId === 'external-working-set-p95')).toMatchObject({ scoreUpper: 0 });

    const invalidTiming = JSON.parse(JSON.stringify(input));
    invalidTiming.rawEvidence.runs[0].callbackTiming.timingSpans[0].firstSourceSequence = 2;
    expect(() => evaluatePerformanceExperiment(invalidTiming, compiledPolicy)).toThrow(/safe integer|partition/);

    const undersizedRuntimeCohort = JSON.parse(JSON.stringify(input));
    undersizedRuntimeCohort.rawEvidence.runs[0].callbackTiming.callbackCohort.sourceSequences.pop();
    undersizedRuntimeCohort.rawEvidence.runs[0].callbackTiming.timingSpans[0].lastSourceSequence = runtimeCallbackCount - 1;
    expect(() => evaluatePerformanceExperiment(undersizedRuntimeCohort, compiledPolicy)).toThrow(/closed workload/);

    const invalidEnvironment = JSON.parse(JSON.stringify(input));
    invalidEnvironment.rawEvidence.runs[0].environment.traces[0].dynamicState.power = 'battery';
    expect(() => evaluatePerformanceExperiment(invalidEnvironment, compiledPolicy)).toThrow(/transition/);

    const invalidProcess = JSON.parse(JSON.stringify(input));
    invalidProcess.rawEvidence.runs[0].process.observations[1].identity = 'replacement';
    expect(() => evaluatePerformanceExperiment(invalidProcess, compiledPolicy)).toThrow(/stable live process identity/);

    const synthetic = JSON.parse(JSON.stringify(input));
    synthetic.evidenceProvenance = { kind: 'synthetic-capacity-fixture', scenario: 'unit', publicationEligible: false, runtimeMeasurement: false };
    synthetic.allocationEvidence.evidenceProvenance = synthetic.evidenceProvenance;
    const syntheticEvaluation = evaluatePerformanceExperiment(synthetic, compiledPolicy);
    expect(syntheticEvaluation.publicationEligible).toBe(false);
    expect(() => requirePublishablePerformanceEvidence(syntheticEvaluation)).toThrow(/synthetic/);
  });

  it('requires immediate aborted cleanup after a launched side fails and never advances it to a completed close', () => {
    const closure = { closed: true, stdoutDrained: true, stderrDrained: true, inputClosed: true, exit: { code: 1, durationMs: 1 }, zeroSurvivors: true };
    const noResource = [...canonicalLedger().slice(0, 5), {
      sequence: 6,
      operationId: 'metric-adapter-session-open',
      start: 5,
      end: 6,
      outcome: 'failed-no-resource',
      zeroSpawned: true,
      failedAt: 6,
      metricSessionId: 'no-resource',
      comparisonKind: 'harness-overhead',
      backend: 'canvas2d',
      pairIndex: 1,
      attemptIndex: 1
    }];
    expect(validatePerformanceLedger(noResource)).toEqual(noResource);
    expect(() => validatePerformanceLedger(noResource.map((entry, index) => index === 5
      ? { ...entry, zeroSpawned: false }
      : entry))).toThrow(/discriminator|shape/);
    expect(() => validatePerformanceLedger([...noResource, {
      sequence: 7, operationId: 'internal-reset', start: 6, end: 7,
      outcome: 'completed', resetIdentity: 'illegal-successor'
    }])).toThrow(/successor|predecessor|out of metric-session order/);

    const resetB = validLedger({ experimentId, backend: 'webgpu', comparisonKind: 'instrumentation-overhead' }).slice(0, 3) as any[];
    resetB.push({
      sequence: 4,
      operationId: 'metric-adapter-session-close',
      start: 3,
      end: 4,
      metricSessionId: 'session',
      outcome: 'aborted',
      abortReason: { phase: 'reset-b', backend: 'none', reason: 'reset-failure' },
      lastBoundary: 'side-a',
      closure
    });
    expect(validatePerformanceLedger(resetB)).toEqual(resetB);
    expect(() => validatePerformanceLedger([...resetB, {
      sequence: 5,
      operationId: 'metric-adapter-session-open',
      start: 4,
      end: 5,
      outcome: 'ready',
      metricSessionId: 'illegal-retry',
    }])).toThrow(/aborted metric sessions never authorize a retry|successor|unclosed metric session/);

    const sideA = validLedger({ experimentId, backend: 'webgpu', comparisonKind: 'instrumentation-overhead' }).slice(0, 3) as any[];
    sideA[2] = {
      ...sideA[2], outcome: 'failed', abortReason: { phase: 'side-a', backend: 'webgpu', reason: 'worker-error' }, lastBoundary: 'reset-a', cleanup: closure
    };
    sideA.push({ sequence: 4, operationId: 'metric-adapter-session-close', start: 3, end: 4, metricSessionId: 'session', outcome: 'aborted', abortReason: { phase: 'side-a', backend: 'webgpu', reason: 'worker-error' }, lastBoundary: 'reset-a', closure });
    expect(validatePerformanceLedger(sideA)).toEqual(sideA);
    expect(() => validatePerformanceLedger(sideA.map((entry, index) => index === 3 ? { ...entry, outcome: 'completed' } : entry))).toThrow(/incomplete metric session must close as aborted/);
    expect(() => validatePerformanceLedger(sideA.map((entry, index) => index === 2 ? { ...entry, cleanup: { ...closure, stdoutDrained: false } } : entry))).toThrow(/drained output/);
    expect(() => validatePerformanceLedger(sideA.map((entry, index) => index === 3 ? { ...entry, lastBoundary: 'side-a' } : entry))).toThrow(/lastBoundary|last boundary/);

    const sideB = validLedger({ experimentId, backend: 'webgpu', comparisonKind: 'instrumentation-overhead' }).slice(0, 5) as any[];
    sideB[4] = {
      ...sideB[4], outcome: 'failed', abortReason: { phase: 'side-b', backend: 'webgpu', reason: 'worker-error' }, lastBoundary: 'reset-b', cleanup: closure
    };
    sideB.push({ sequence: 6, operationId: 'metric-adapter-session-close', start: 5, end: 6, metricSessionId: 'session', outcome: 'aborted', abortReason: { phase: 'side-b', backend: 'webgpu', reason: 'worker-error' }, lastBoundary: 'reset-b', closure });
    expect(validatePerformanceLedger(sideB)).toEqual(sideB);
    expect(() => validatePerformanceLedger([...sideB.slice(0, 5), { sequence: 6, operationId: 'internal-reset', start: 5, end: 6, metricSessionId: 'session', resetId: 'illegal', boundary: 'reset-before-a' }])).toThrow(/out of metric-session order/);

    const closeFailure = validLedger({ experimentId, backend: 'canvas2d', comparisonKind: 'harness-overhead' }) as any[];
    closeFailure[5] = {
      ...closeFailure[5],
      outcome: 'aborted',
      abortReason: { phase: 'close', backend: 'none', reason: 'metric-adapter-close-failure' },
      lastBoundary: 'side-b'
    };
    expect(validatePerformanceLedger(closeFailure)).toEqual(closeFailure);
    expect(() => validatePerformanceLedger(closeFailure.map((entry, index) => index === 5
      ? { ...entry, lastBoundary: 'completed-close' }
      : entry))).toThrow(/lastBoundary/);
    expect(() => validatePerformanceLedger([...closeFailure, {
      sequence: 7,
      operationId: 'metric-adapter-session-open',
      start: 6,
      end: 7,
      outcome: 'ready',
      metricSessionId: 'illegal-close-retry',
    }])).toThrow(/aborted metric sessions never authorize a retry|successor|unclosed metric session/);
  });
});
