import { canonicalSha256 } from './baseline-report.js';
import {
  createPerformancePairPlan,
  PERFORMANCE_PAIR_ATTEMPT_CARDINALITY
} from './performance-pair-plan.js';
import { createPerformanceExternalMetricCapture } from './performance-external-metric-capture.js';
import { createPerformanceMetricSessionCapture } from './performance-metric-session-capture.js';
import { createPerformanceSentinelCapture } from './performance-sentinel-capture.js';
import { createPerformanceWorkloadCapture } from './performance-workload-capture.js';
import {
  createPerformanceCaptureIndex,
  createPerformanceExperimentEnvironmentCapture,
  createPerformanceQualificationCapture,
  createPerformanceTransportCapture
} from './performance-raw-capture-manifest.js';
import {
  createPerformanceLaunchAuthority,
  createPerformancePreLoopAuthority,
  createPerformanceRunJoinFromAuthority
} from '../run-performance-baseline.js';

const SOURCE_SHA = '9a7839ce47c61982f6eab836c496b8469f01a9ca';
const ANALYSIS_SHA256 = '0c6a4ccbe48b9b12e4c58bd153ae6f5c04bed82fb489c5a2402d21934b4c8fba';
const BUILD_VARIANTS = Object.freeze([
  { id: 'production', harness: false, instrumentation: false },
  { id: 'harness-control', harness: true, instrumentation: false },
  { id: 'instrumented', harness: true, instrumentation: true }
]);

function fail(message) {
  throw new Error(`Performance capacity capture set failed: ${message}`);
}

function uuidFactory(seed = 1) {
  let value = seed;
  return () => {
    const suffix = value.toString(16).padStart(12, '0');
    value += 1;
    return `00000000-0000-4000-8000-${suffix}`;
  };
}

function closure() {
  return {
    closed: true,
    stdoutDrained: true,
    stderrDrained: true,
    inputClosed: true,
    exit: { code: 0, durationMs: 1 },
    zeroSurvivors: true
  };
}

function webgpuIdentity() {
  return {
    backend: 'webgpu',
    driver: 'webgpu-driver-v1',
    workerProtocol: 'webgpu-worker-ready-v1',
    adapterIdentity: { vendor: null, architecture: null, device: null, description: null },
    limits: { maxTextureDimension2D: 8192, maxBindGroups: 4 },
    isFallbackAdapter: false,
    powerPreference: 'low-power'
  };
}

function environmentIdentity() {
  return {
    staticIdentity: { host: 'capacity-fixture', runtime: 'electron', gpu: 'fixture-gpu', switches: 'none' },
    dynamicState: {
      power: 'ac', display: 'single', refreshRate: 60, devicePixelRatio: 1,
      thermal: 'nominal', gpuSwitch: 'stable'
    }
  };
}

function runtimeProjection(role, experimentId) {
  if (role === 'ci-integrity') {
    return {
      provider: 'github-actions',
      sourceSha: SOURCE_SHA,
      analysisSha256: ANALYSIS_SHA256,
      repository: 'prismgb/prismgb-app',
      workflowRef: 'prismgb/prismgb-app/.github/workflows/codebase-baseline.yml@refs/heads/main',
      workflowRunId: '1',
      workflowRunAttempt: 1,
      eventName: 'workflow_dispatch',
      producer: { jobId: 'capacity', targetId: null, artifactName: `performance-${experimentId}` }
    };
  }
  return {
    provider: 'local',
    sourceSha: SOURCE_SHA,
    analysisSha256: ANALYSIS_SHA256,
    captureSessionId: `capacity-${experimentId}`,
    producer: { role: 'capacity', targetId: 'selected', reportSetId: `performance-${experimentId}` }
  };
}

function buildEvidence() {
  const bundle = (mainBytes) => {
    const entries = [
      { path: 'main/index.js', bytes: mainBytes, sha256: '1'.repeat(64) },
      { path: 'preload/index.js', bytes: 20_000, sha256: '2'.repeat(64) },
      { path: 'renderer/assets/main-capacity.js', bytes: 30_000, sha256: '3'.repeat(64) },
      { path: 'renderer/assets/worker-entry-capacity.js', bytes: 10_000, sha256: '4'.repeat(64) }
    ];
    return { sha256: canonicalSha256(entries), entries };
  };
  const variants = BUILD_VARIANTS.map((variant, index) => ({ ...variant, bundle: bundle(40_000 + (index * 100)) }));
  const buildManifest = { schemaVersion: 2, sourceSha: SOURCE_SHA, variants };
  const production = variants[0];
  const codeRoots = production.bundle.entries.map((entry, index) => ({
    id: ['main', 'preload', 'renderer', 'worker'][index],
    entrypoint: entry,
    byteTotal: entry.bytes,
    entries: [entry],
    sha256: canonicalSha256([entry])
  }));
  const productionBundleBody = {
    schemaVersion: 1,
    sourceSha: SOURCE_SHA,
    build: { id: 'production', harness: false, instrumentation: false, bundleSha256: production.bundle.sha256 },
    codeByteTotal: codeRoots.reduce((total, root) => total + root.byteTotal, 0),
    codeRoots
  };
  return {
    buildManifest,
    productionBundleEvidence: { ...productionBundleBody, checksum: canonicalSha256(productionBundleBody) }
  };
}

function runBinding(join, captureKind) {
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

function runIndexEntry(capture) {
  const join = capture.join;
  return {
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
    observationBoundaryId: join.observationBoundaryId,
    relativePath: `capacity/${capture.captureKind}/${capture.checksum}.json`,
    checksum: capture.checksum
  };
}

function backendIndex(captureKind, captures, context, pairPlan) {
  const entries = captures.map(runIndexEntry);
  return createPerformanceCaptureIndex({
    schemaVersion: { sentinel: 7, 'external-metric': 4, workload: 9, 'metric-session': 2 }[captureKind],
    experimentId: context.experimentId,
    captureKind,
    sourceSha: context.sourceSha,
    policyHash: context.policyHash,
    backend: pairPlan.backend,
    pairPlanChecksum: pairPlan.checksum,
    entryCount: entries.length,
    entries
  }, { ...context, backend: pairPlan.backend, pairPlanChecksum: pairPlan.checksum });
}

function metricSessionIndex(captures, context, pairPlan) {
  const entries = captures.map((capture) => ({
    metricSessionId: capture.join.metricSessionId,
    comparisonKind: capture.join.comparisonKind,
    backend: capture.join.backend,
    pairIndex: capture.join.pairIndex,
    attemptIndex: capture.join.attemptIndex,
    relativePath: `capacity/metric-session/${capture.checksum}.json`,
    checksum: capture.checksum
  }));
  return createPerformanceCaptureIndex({
    schemaVersion: 2,
    experimentId: context.experimentId,
    captureKind: 'metric-session',
    sourceSha: context.sourceSha,
    policyHash: context.policyHash,
    backend: pairPlan.backend,
    pairPlanChecksum: pairPlan.checksum,
    entryCount: entries.length,
    entries
  }, { ...context, backend: pairPlan.backend, pairPlanChecksum: pairPlan.checksum });
}

function createPrefixLedger(preLoop, role, buildCommandLedger, qualificationCapture = null) {
  const closed = closure();
  const genericMarker = '00000000-0000-4000-8000-00000000f001';
  const genericBoundary = '00000000-0000-4000-8000-00000000f002';
  const genericExternal = '00000000-0000-4000-8000-00000000f003';
  const genericExecution = '00000000-0000-4000-8000-00000000f004';
  const ledger = [{
    sequence: 1,
    operationId: 'generic-transport-spawn',
    start: 0,
    end: 1,
    outcome: 'completed',
    executionIdentity: { externalExecutionId: genericExternal, executionId: genericExecution },
    markerIdentity: {
      operationMarker: genericMarker,
      launchId: genericMarker,
      preloadEchoLaunchId: genericMarker,
      rendererEchoLaunchId: genericMarker
    },
    transportIdentity: { transportId: 'capacity-generic-transport', observationBoundaryId: genericBoundary },
    transportClosureEnd: 1
  }];
  for (const [index, buildId] of ['production', 'harness-control', 'instrumented'].entries()) {
    const entry = {
      sequence: index + 2,
      operationId: 'build-spawn',
      start: index + 1,
      end: index + 2,
      buildId,
      closure: closed,
      outcome: 'completed'
    };
    ledger.push(entry);
    buildCommandLedger.entries.push({
      sequence: index + 1,
      operationId: 'build-spawn',
      start: entry.start,
      end: entry.end,
      buildId,
      closure: closed
    });
  }
  const transport = preLoop.transport;
  ledger.push({
    sequence: 5,
    operationId: 'electron-harness-spawn',
    start: 4,
    end: 5,
    purpose: 'transport-probe',
    outcome: 'completed',
    executionIdentity: { externalExecutionId: transport.externalExecutionId, executionId: transport.executionId },
    markerIdentity: {
      operationMarker: transport.operationMarker,
      launchId: transport.launchId,
      preloadEchoLaunchId: transport.launchId,
      rendererEchoLaunchId: transport.launchId
    },
    transportIdentity: { transportId: 'capacity-electron-transport', observationBoundaryId: transport.observationBoundaryId },
    applicationDescendantClosureEnd: 5
  });
  if (role === 'reference-comparison') {
    if (!qualificationCapture) fail('reference prefix ledger requires qualification capture authority');
    const qualification = preLoop.qualification;
    const cleanup = qualificationCapture.captureBody.cleanup;
    const readinessEvidence = qualificationCapture.captureBody.readinessEvidence;
    const capabilityEvidence = { captureBodyChecksum: qualificationCapture.captureBodyChecksum };
    ledger.push({
      sequence: 6,
      operationId: 'electron-harness-spawn',
      start: 5,
      end: 6,
      purpose: 'qualification-probe',
      outcome: 'completed',
      experimentId: preLoop.experimentId,
      policyHash: preLoop.policyHash,
      buildVariant: 'harness-control',
      operationMarker: qualification.operationMarker,
      launchId: qualification.launchId,
      executionId: qualification.executionId,
      externalExecutionId: qualification.externalExecutionId,
      observationBoundaryId: qualification.observationBoundaryId,
      executionIdentity: { externalExecutionId: qualification.externalExecutionId, executionId: qualification.executionId },
      markerIdentity: {
        operationMarker: qualification.operationMarker,
        launchId: qualification.launchId,
        preloadEchoLaunchId: qualification.launchId,
        rendererEchoLaunchId: qualification.launchId
      },
      transportIdentity: { transportId: 'capacity-qualification-transport', observationBoundaryId: qualification.observationBoundaryId },
      capabilityEvidence,
      readinessEvidence,
      ownership: { class: 'application-owned' },
      cleanup,
      applicationDescendantClosureEnd: 6
    });
  }
  return ledger;
}

function appendBackendLedger({ ledger, pairPlan, launchAuthority, callbacksPerRun, ordinalStart }) {
  let ordinal = ordinalStart;
  let slotOffset = 0;
  const joins = [];
  const sessionJoins = new Map();
  for (const pair of pairPlan.pairs) {
    for (const attempt of pair.attempts) {
      const retryReason = attempt.attemptIndex === 1 ? null : 'sample-floor';
      let time = ledger.at(-1).end;
      const openSequence = ledger.length + 1;
      ledger.push({
        sequence: openSequence,
        operationId: 'metric-adapter-session-open',
        start: time,
        end: time + 1,
        outcome: 'ready',
        readyAt: time + 1,
        metricSessionId: attempt.metricSessionId,
        comparisonKind: pair.comparisonKind,
        backend: pair.backend,
        pairIndex: pair.pairIndex,
        attemptIndex: attempt.attemptIndex,
        ...(retryReason === null ? {} : { retryReason })
      });
      time += 1;
      const pairJoins = [];
      for (const [launchIndex, launch] of attempt.launches.entries()) {
        ledger.push({
          sequence: ledger.length + 1,
          operationId: 'internal-reset',
          start: time,
          end: time + 1,
          outcome: 'completed',
          resetIdentity: `${attempt.metricSessionId}:reset-${launchIndex + 1}`
        });
        time += 1;
        ordinal += 1;
        const slot = launchAuthority.slots[slotOffset++];
        const runtimeIdentity = launch.buildVariant === 'production'
          ? {
              externalExecutionId: slot.externalExecutionId,
              browserPid: 10_000 + ordinal,
              browserCreationTime: String(20_000 + ordinal)
            }
          : {
              externalExecutionId: slot.externalExecutionId,
              launchId: slot.launchId,
              executionId: slot.executionId
            };
        const join = createPerformanceRunJoinFromAuthority({
          authority: launchAuthority,
          slot,
          runtimeIdentity,
          ledgerSequence: ledger.length + 1,
          ordinal
        });
        pairJoins.push(join);
        joins.push(join);
        const harness = launch.buildVariant !== 'production';
        ledger.push({
          sequence: join.ledgerSequence,
          operationId: harness ? 'electron-harness-spawn' : 'production-sentinel-spawn',
          start: time,
          end: time + 1,
          purpose: 'measurement-side',
          ...join,
          ownership: { class: 'application-owned' },
          cleanup: closure(),
          outcome: 'completed',
          applicationDescendantClosureEnd: time + 1,
          ...(launch.buildVariant === 'instrumented'
            ? {
                measurementEpochId: `epoch:${join.runId}`,
                frameSourceSequences: Array.from({ length: callbacksPerRun }, (_, index) => index + 1)
              }
            : {})
        });
        time += 1;
      }
      ledger.push({
        sequence: ledger.length + 1,
        operationId: 'metric-adapter-session-close',
        start: time,
        end: time + 1,
        metricSessionId: attempt.metricSessionId,
        outcome: 'completed',
        closure: closure(),
        closureEnd: time + 1
      });
      sessionJoins.set(attempt.metricSessionId, { openSequence, joins: pairJoins, pair, attempt });
    }
  }
  if (slotOffset !== launchAuthority.slots.length) fail(`${pairPlan.backend} launch authority was not fully consumed`);
  return { joins, sessionJoins, ordinal };
}

function createExternalMetricCapture(join, accepted) {
  const binding = runBinding(join, 'external-metric');
  const pid = 10_000 + join.ordinal;
  const creationIdentity = String(30_000 + join.ordinal);
  const processIdentity = `renderer:${join.externalExecutionId}:${pid}`;
  const rawSample = (ordinal) => ({
    pid,
    userTicks: ordinal * 5,
    systemTicks: 0,
    startTicks: Number(creationIdentity),
    residentPages: 32768,
    pageSize: 4096,
    clockTicks: 100
  });
  const sampleCount = accepted ? 61 : 2;
  const processRows = [{
    ...binding,
    observationOrdinal: 1,
    observedAt: 0,
    observationKind: 'membership',
    observationSource: 'external-metric-adapter',
    adapterId: 'linux-procfs-v1',
    subjectKind: 'renderer',
    pid,
    creationIdentity,
    processIdentity,
    rawAdapterKind: 'linux-procfs-v1',
    rawIdentity: rawSample(1),
    rawMembership: rawSample(1),
    processClass: 'application-renderer',
    ownership: 'application-owned',
    alive: true
  }];
  const cpuRows = Array.from({ length: sampleCount }, (_, index) => {
    const ordinal = index + 1;
    const readStart = index * 0.5;
    const readEnd = readStart + 0.01;
    return {
      ...binding,
      ordinal,
      samplePhase: ordinal === 1 ? 'prime' : ordinal === sampleCount ? 'terminal-closure' : 'in-window',
      adapterId: 'linux-procfs-v1',
      pid,
      creationIdentity,
      processIdentity,
      readStart,
      readEnd,
      counterQuantumSeconds: 0.01,
      cumulativeCpuSeconds: (ordinal * 5) / 100,
      workingSetMiB: 128,
      rawAdapterKind: 'linux-procfs-v1',
      rawAdapterSample: { adapterSample: rawSample(ordinal), readStart, readEnd }
    };
  });
  return createPerformanceExternalMetricCapture({
    experimentId: join.experimentId,
    sourceSha: join.sourceSha,
    policyHash: join.policyHash,
    captureKind: 'external-metric',
    join,
    rawKinds: [
      { rawKind: 'process-observation', rows: processRows },
      { rawKind: 'cpu-sample', rows: cpuRows }
    ]
  });
}

function createMetricSessionCapture(context, pairPlan, session) {
  const { pair, attempt, joins, openSequence } = session;
  const join = {
    metricSessionId: attempt.metricSessionId,
    comparisonKind: pair.comparisonKind,
    backend: pair.backend,
    pairIndex: pair.pairIndex,
    attemptIndex: attempt.attemptIndex,
    metricSessionOpenSequence: openSequence
  };
  const common = {
    sourceSha: context.sourceSha,
    policyHash: context.policyHash,
    experimentId: context.experimentId,
    pairPlanChecksum: pairPlan.checksum,
    experimentRole: context.experimentRole,
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
  const identities = joins.map((runJoin) => {
    const pid = 10_000 + runJoin.ordinal;
    const creationIdentity = String(30_000 + runJoin.ordinal);
    const processIdentity = `renderer:${runJoin.externalExecutionId}:${pid}`;
    const rawIdentity = {
      pid, userTicks: 5, systemTicks: 0, startTicks: Number(creationIdentity),
      residentPages: 32768, pageSize: 4096, clockTicks: 100
    };
    return {
      pid, creationIdentity, processIdentity, rawIdentity,
      target: { pid, creationIdentity, processIdentity, counterQuantumSeconds: 0.01 }
    };
  });
  const sessionCarrier = {
    adapterId: 'linux-procfs-v1',
    result: { status: 'closed' },
    transitions: [
      ...identities.map(({ target }, index) => ({ sequence: index + 1, operation: 'attach', at: openSequence, target })),
      ...identities.map(({ target }, index) => ({ sequence: identities.length + index + 1, operation: 'detach', at: openSequence + 5, target }))
    ]
  };
  const rows = [
    ...identities.map((identity, index) => ({
      ...common,
      observationOrdinal: index + 1,
      observedAt: openSequence,
      observationKind: 'membership',
      pid: identity.pid,
      creationIdentity: identity.creationIdentity,
      processIdentity: identity.processIdentity,
      rawIdentity: identity.rawIdentity,
      rawMembership: sessionCarrier,
      alive: true
    })),
    ...identities.map((identity, index) => ({
      ...common,
      observationOrdinal: identities.length + index + 1,
      observedAt: openSequence + 5,
      observationKind: 'closure',
      pid: identity.pid,
      creationIdentity: identity.creationIdentity,
      processIdentity: identity.processIdentity,
      rawIdentity: identity.rawIdentity,
      rawClosure: sessionCarrier,
      alive: false,
      closureState: 'detached'
    }))
  ];
  return createPerformanceMetricSessionCapture({
    experimentId: context.experimentId,
    sourceSha: context.sourceSha,
    policyHash: context.policyHash,
    captureKind: 'metric-session',
    join,
    rawKinds: [{ rawKind: 'process-observation', rows }]
  });
}

function backendReadyRow(join, captureKind, controlSequence = 1) {
  const requestedBackend = join.backend;
  return {
    ...runBinding(join, captureKind),
    controlSequence,
    operationKind: 'control-write',
    clockDomain: 'renderer-performance-now-v1',
    writeKind: 'backend-ready',
    rawWrite: {
      kind: 'backend-ready',
      launchId: join.launchId,
      observedAt: 0,
      requestedBackend,
      selectedBackend: requestedBackend,
      selectionReason: requestedBackend === 'webgpu' ? 'webgpu-selected' : 'requested-canvas2d',
      backendExecutionIdentity: requestedBackend === 'webgpu' ? webgpuIdentity() : null
    },
    writtenAt: 0,
    outcome: 'recorded'
  };
}

function createSentinelCapture(join, callbackCount) {
  const binding = runBinding(join, 'sentinel');
  const webgpu = join.backend === 'webgpu';
  let captureOrdinal = 0;
  const observations = [];
  const backendRows = [];
  const workerRows = [];
  observations.push({
    ...binding, captureOrdinal: ++captureOrdinal, observationBoundaryId: join.observationBoundaryId,
    observationKind: 'boundary', observedAt: 10, boundary: 'window-start'
  });
  for (let index = 0; index < callbackCount; index += 1) {
    const callbackOrdinal = index + 1;
    observations.push({
      ...binding, captureOrdinal: ++captureOrdinal, observationBoundaryId: join.observationBoundaryId,
      observationKind: 'callback', observedAt: 11, callbackOrdinal, mediaTime: callbackOrdinal / 60
    });
    backendRows.push({
      ...binding, captureOrdinal: ++captureOrdinal, callbackOrdinal,
      operationId: webgpu ? 'frame-post' : 'canvas-draw-completed', observedAt: 11
    });
    if (webgpu) {
      workerRows.push({
        ...binding, captureOrdinal: ++captureOrdinal, messageOrdinal: callbackOrdinal,
        messageKind: 'acknowledgement', clockDomain: 'external-performance-now-v1', observedAt: 11,
        tagged: join.buildVariant !== 'production',
        frameToken: join.buildVariant === 'production' ? null : callbackOrdinal,
        outcome: 'webgpu-queue-submit-completed'
      });
    }
  }
  observations.push({
    ...binding, captureOrdinal: ++captureOrdinal, observationBoundaryId: join.observationBoundaryId,
    observationKind: 'boundary', observedAt: 20, boundary: 'window-close'
  }, {
    ...binding, captureOrdinal: ++captureOrdinal, observationBoundaryId: join.observationBoundaryId,
    observationKind: 'pending', observedAt: 11, pendingCount: 0
  }, {
    ...binding, captureOrdinal: ++captureOrdinal, observationBoundaryId: join.observationBoundaryId,
    observationKind: 'closure', observedAt: 22, closureReason: 'minimum-reached'
  });
  return createPerformanceSentinelCapture({
    experimentId: join.experimentId,
    sourceSha: join.sourceSha,
    policyHash: join.policyHash,
    captureKind: 'sentinel',
    join,
    rawKinds: [
      { rawKind: 'backend-operation', rows: backendRows },
      { rawKind: 'worker-message', rows: workerRows },
      { rawKind: 'sentinel-observation', rows: observations },
      ...(join.buildVariant === 'production'
        ? []
        : [{ rawKind: 'controller-operation', rows: [backendReadyRow(join, 'sentinel')] }])
    ]
  });
}

function allocationByteFields(rule) {
  if (rule.byteSemantics === 'rgba-transfer-footprint') {
    return {
      byteKind: rule.byteSemantics, byteValue: 160 * 144 * 4,
      sourceWidth: 160, sourceHeight: 144, requestedByteLength: null,
      descriptorSize: null, textureDescriptor: null
    };
  }
  if (rule.byteSemantics === 'requested-byte-length') {
    return {
      byteKind: rule.byteSemantics, byteValue: 64,
      sourceWidth: null, sourceHeight: null, requestedByteLength: 64,
      descriptorSize: null, textureDescriptor: null
    };
  }
  if (rule.byteSemantics === 'descriptor-size') {
    return {
      byteKind: rule.byteSemantics, byteValue: 4096,
      sourceWidth: null, sourceHeight: null, requestedByteLength: null,
      descriptorSize: 4096, textureDescriptor: null
    };
  }
  if (rule.byteSemantics === 'logical-texel-footprint') {
    const textureDescriptor = {
      width: 160, height: 144, depth: 1, format: 'rgba8unorm',
      usage: 'render-attachment', logicalTexelFootprint: 160 * 144 * 4
    };
    return {
      byteKind: rule.byteSemantics, byteValue: textureDescriptor.logicalTexelFootprint,
      sourceWidth: null, sourceHeight: null, requestedByteLength: null,
      descriptorSize: null, textureDescriptor
    };
  }
  return {
    byteKind: rule.byteSemantics, byteValue: null,
    sourceWidth: null, sourceHeight: null, requestedByteLength: null,
    descriptorSize: null, textureDescriptor: null
  };
}

function createAllocationRows(join, callbackCount, allocationVector, policy) {
  if (join.backend !== 'webgpu' || join.buildVariant !== 'instrumented' || join.attemptIndex !== PERFORMANCE_PAIR_ATTEMPT_CARDINALITY) {
    return { frameRows: [], lifecycleRows: [] };
  }
  const coverage = policy.policy.allocationEvidencePolicy.webgpu.coverage;
  const vector = allocationVector ?? coverage.map((rule) => rule.cardinality === 'per-frame' ? callbackCount : rule.cardinality);
  if (!Array.isArray(vector) || vector.length !== coverage.length) fail('allocation vector does not cover the policy registry');
  const binding = runBinding(join, 'workload');
  const frameRows = [];
  const frameRequestOrdinals = new Map();
  for (const [coverageIndex, rule] of coverage.entries()) {
    const observed = vector[coverageIndex];
    const maximum = rule.cardinality === 'per-frame' ? callbackCount : rule.cardinality;
    if (!Number.isSafeInteger(observed) || observed < 0 || observed > maximum) fail('allocation vector cardinality is invalid');
    if (rule.carrier !== 'frame-request') continue;
    for (let sourceSequence = 1; sourceSequence <= observed; sourceSequence += 1) {
      const requestOrdinal = (frameRequestOrdinals.get(sourceSequence) ?? 0) + 1;
      frameRequestOrdinals.set(sourceSequence, requestOrdinal);
      frameRows.push({
        ...binding,
        backend: 'webgpu',
        ...allocationByteFields(rule),
        carrier: 'frame-request',
        diagnosticFrameId: `frame:${join.runId}:${sourceSequence}`,
        frameToken: sourceSequence,
        measurementEpochId: `epoch:${join.runId}`,
        measurementWindowId: join.observationBoundaryId,
        operationId: rule.operationId,
        outcome: 'success',
        requestOrdinal,
        sourceLocationId: rule.sourceLocationId,
        sourceSequence
      });
    }
  }
  const lifecycleRows = [];
  let phaseSequence = 0;
  for (const [coverageIndex, rule] of coverage.entries()) {
    if (rule.carrier !== 'lifecycle-request') continue;
    const observed = vector[coverageIndex];
    for (let requestOrdinal = 1; requestOrdinal <= observed; requestOrdinal += 1) {
      lifecycleRows.push({
        ...binding,
        backend: 'webgpu',
        ...allocationByteFields(rule),
        carrier: 'lifecycle-request',
        executionId: join.executionId,
        lifecyclePhase: rule.lifecyclePhase,
        operationId: rule.operationId,
        outcome: 'success',
        phaseSequence: ++phaseSequence,
        requestOrdinal,
        sourceLocationId: rule.sourceLocationId
      });
    }
  }
  return { frameRows, lifecycleRows };
}

function createWorkloadCapture(join, callbackCount, allocationVector, policy) {
  const binding = runBinding(join, 'workload');
  const webgpu = join.backend === 'webgpu';
  const instrumented = join.buildVariant === 'instrumented';
  const measurementEpochId = instrumented ? `epoch:${join.runId}` : null;
  let captureOrdinal = 0;
  const sourceRows = [];
  const backendRows = [];
  const workerRows = [];
  const timingRows = [];
  for (let index = 0; index < callbackCount; index += 1) {
    const sourceSequence = index + 1;
    const diagnosticFrameId = instrumented ? `frame:${join.runId}:${sourceSequence}` : null;
    const identity = {
      launchId: join.launchId,
      measurementWindowId: join.observationBoundaryId,
      measurementEpochId,
      sourceSequence,
      diagnosticFrameId
    };
    sourceRows.push({
      ...binding, captureOrdinal: ++captureOrdinal, eventKind: 'source-opportunity', ...identity,
      mediaTime: sourceSequence / 60, sessionPresent: true, sessionActive: true,
      duplicateMediaTime: false, readyState: 4, hasCurrentData: true
    }, {
      ...binding, captureOrdinal: ++captureOrdinal, eventKind: 'session-branch', ...identity,
      workerPresent: webgpu, workerReady: webgpu, outstandingFrameCount: 0, outstandingFrameLimit: 2,
      bitmapOutcome: 'created',
      canvasDrawOutcome: webgpu ? 'not-applicable' : 'canvas-draw-completed',
      framePostOutcome: webgpu ? 'posted' : 'not-applicable'
    });
    const frameToken = webgpu ? sourceSequence : null;
    const timingSpanId = `timing:${join.runId}:${sourceSequence}`;
    backendRows.push({
      ...binding, captureOrdinal: ++captureOrdinal, ...identity,
      operationId: webgpu ? 'webgpu-frame-submit' : 'canvas-draw-call',
      outcome: webgpu ? 'webgpu-queue-submit-completed' : 'canvas-draw-completed',
      frameToken,
      timingSpanId
    });
    sourceRows.push({
      ...binding, captureOrdinal: ++captureOrdinal, eventKind: 'advisory-disposition', ...identity,
      advisoryOutcome: 'accepted', advisoryFrameToken: frameToken
    });
    if (webgpu) {
      workerRows.push({
        ...binding, captureOrdinal: ++captureOrdinal, messageKind: 'acknowledgement',
        clockDomain: 'renderer-performance-now-v1', observedAt: sourceSequence,
        ...identity, frameToken, tagged: true, outcome: 'webgpu-queue-submit-completed'
      });
    }
    timingRows.push({
      ...binding,
      measurementWindowId: identity.measurementWindowId,
      measurementEpochId,
      sourceSequence,
      diagnosticFrameId,
      metricId: 'backend-operation-duration',
      spanOrdinal: 1,
      timingSpanId,
      frameToken,
      unit: 'milliseconds',
      clock: 'renderer-performance-now-v1',
      startedAt: index * 20,
      endedAt: (index * 20) + 1,
      outcome: 'completed'
    });
  }
  const allocation = createAllocationRows(join, callbackCount, allocationVector, policy);
  return createPerformanceWorkloadCapture({
    experimentId: join.experimentId,
    sourceSha: join.sourceSha,
    policyHash: join.policyHash,
    captureKind: 'workload',
    join,
    rawKinds: [
      { rawKind: 'source-opportunity', rows: sourceRows },
      { rawKind: 'backend-operation', rows: backendRows },
      { rawKind: 'worker-message', rows: workerRows },
      { rawKind: 'process-observation', rows: [] },
      { rawKind: 'environment-observation', rows: [] },
      { rawKind: 'controller-operation', rows: [backendReadyRow(join, 'workload')] },
      { rawKind: 'timing-span', rows: timingRows },
      ...(instrumented
        ? [
            { rawKind: 'frame-request', rows: allocation.frameRows },
            { rawKind: 'lifecycle-request', rows: allocation.lifecycleRows }
          ]
        : [])
    ]
  });
}

function scopedBinding(context, captureKind, scopeKind, scopeId, extra = {}) {
  return {
    sourceSha: context.sourceSha,
    policyHash: context.policyHash,
    experimentId: context.experimentId,
    experimentRole: context.experimentRole,
    scopeKind,
    scopeId,
    captureKind,
    ...extra
  };
}

function externalMembershipRow(binding, { ordinal, observedAt, subjectKind, pid, creationIdentity }) {
  return {
    ...binding,
    observationOrdinal: ordinal,
    observedAt,
    observationKind: 'membership',
    observationSource: 'capacity-external',
    adapterId: 'external-membership-v1',
    subjectKind,
    pid,
    creationIdentity,
    processIdentity: `external:${pid}:${creationIdentity}`,
    rawAdapterKind: 'external-process-membership',
    rawIdentity: { pid, creationIdentity },
    rawMembership: {
      spawnBoundary: {}, rendererEvaluation: {}, ancestry: {},
      processGroup: null, job: null, pathIdentity: {}
    },
    processClass: 'application-renderer',
    ownership: 'application-owned',
    alive: true
  };
}

function createTransportCaptures(context, preLoop) {
  const genericBoundary = '00000000-0000-4000-8000-00000000f002';
  const genericBinding = scopedBinding(context, 'transport', 'ledger-operation', 1, {
    ledgerSequence: 1,
    operationId: 'generic-transport-spawn'
  });
  const generic = createPerformanceTransportCapture({
    experimentId: context.experimentId,
    sourceSha: context.sourceSha,
    policyHash: context.policyHash,
    captureKind: 'transport',
    ledgerSequence: 1,
    operationId: 'generic-transport-spawn',
    observationBoundaryId: genericBoundary,
    rawKinds: [{
      rawKind: 'process-observation',
      rows: [externalMembershipRow(genericBinding, {
        ordinal: 1, observedAt: 0, subjectKind: 'transport', pid: 9001, creationIdentity: 'generic'
      })]
    }]
  });
  const electronBinding = scopedBinding(context, 'transport', 'ledger-operation', 5, {
    ledgerSequence: 5,
    operationId: 'electron-harness-spawn'
  });
  const electronScopedBinding = { ...electronBinding, observationBoundaryId: preLoop.transport.observationBoundaryId };
  const currentState = { environment: 'capacity-electron-transport' };
  const electron = createPerformanceTransportCapture({
    experimentId: context.experimentId,
    sourceSha: context.sourceSha,
    policyHash: context.policyHash,
    captureKind: 'transport',
    ledgerSequence: 5,
    operationId: 'electron-harness-spawn',
    observationBoundaryId: preLoop.transport.observationBoundaryId,
    rawKinds: [
      {
        rawKind: 'process-observation',
        rows: [externalMembershipRow(electronBinding, {
          ordinal: 1, observedAt: 4, subjectKind: 'transport', pid: 9005, creationIdentity: 'electron'
        })]
      },
      {
        rawKind: 'environment-observation',
        rows: [{
          ...electronScopedBinding,
          source: 'electron-main', sourceSequence: 1, clockDomain: 'electron-main',
          runnerReceiptSequence: 1, observedAt: 4.5, observationKind: 'initial-snapshot',
          rawAdapterKind: 'electron-environment-v1',
          rawObservation: {
            launchId: preLoop.transport.launchId, callSequence: 1, phase: 'initial',
            capturedAt: 4.5, currentState, eventBoundary: null
          },
          staticIdentity: currentState,
          dynamicState: currentState
        }]
      },
      {
        rawKind: 'controller-operation',
        rows: [{
          ...electronScopedBinding,
          controlSequence: 1, operationKind: 'request', clockDomain: 'electron-main',
          controllerRequestId: 'capacity-transport-request', channel: 'browser-window',
          requestKind: 'transport', rawRequest: {}, sentAt: 4.1
        }, {
          ...electronScopedBinding,
          controlSequence: 2, operationKind: 'response', clockDomain: 'electron-main',
          controllerRequestId: 'capacity-transport-request', channel: 'browser-window',
          responseKind: 'transport', rawResponse: {}, receivedAt: 4.9, outcome: 'recorded'
        }]
      }
    ]
  });
  return [generic, electron];
}

function createExperimentEnvironmentCapture(context, ledger) {
  const identity = environmentIdentity();
  const binding = scopedBinding(context, 'experiment-environment', 'experiment', context.experimentId);
  const snapshotTimes = Array.from({ length: Math.ceil(ledger.at(-1).end) + 1 }, (_, index) => index);
  const rows = snapshotTimes.map((observedAt, index) => ({
    ...binding,
    source: 'external-monitor',
    sourceSequence: index + 1,
    clockDomain: 'runner',
    runnerReceiptSequence: index + 1,
    observedAt,
    observationKind: index === 0 ? 'initial-snapshot' : 'poll-snapshot',
    rawAdapterKind: 'external-host-snapshot-v1',
    rawObservation: identity,
    ...(index === 0 ? { staticIdentity: identity.staticIdentity } : {}),
    dynamicState: identity.dynamicState
  }));
  const lastSourceSequence = rows.length;
  rows.push({
    ...binding,
    source: 'external-monitor',
    sourceSequence: lastSourceSequence + 1,
    clockDomain: 'runner',
    runnerReceiptSequence: lastSourceSequence + 1,
    observedAt: ledger.at(-1).end + 1,
    observationKind: 'cleanup',
    rawAdapterKind: 'external-host-cleanup-v1',
    rawObservation: {
      cleanupState: 'disposed', lastSourceSequence,
      remainingPollTimerCount: 0, remainingListenerCount: 0
    },
    cleanupState: 'disposed'
  });
  return createPerformanceExperimentEnvironmentCapture({
    experimentId: context.experimentId,
    sourceSha: context.sourceSha,
    policyHash: context.policyHash,
    scopeKind: 'experiment',
    rawKinds: [{ rawKind: 'environment-observation', rows }]
  });
}

function createQualificationCapture(context, preLoop, unavailabilityBranch = 'none') {
  const slot = preLoop.qualification;
  const identity = webgpuIdentity();
  const qualified = unavailabilityBranch === 'none';
  const workerFallback = unavailabilityBranch === 'worker-fallback-adapter';
  const webgpuStage = {
    backend: 'webgpu', backendReadyObservedAt: 5.2, sourceSequence: 1, sourceObservedAt: 5.3,
    terminalFrame: {
      kind: 'worker-frame-acknowledged', frameToken: 1, submittedAt: 5.4,
      acknowledgedAt: 5.5, outcome: 'webgpu-queue-submit-completed'
    }
  };
  const canvasStage = {
    backend: 'canvas2d', backendReadyObservedAt: 5.2, sourceSequence: 1, sourceObservedAt: 5.3,
    terminalFrame: { kind: 'canvas-draw-completed', observedAt: 5.5, outcome: 'canvas-draw-completed' }
  };
  const readinessEvidence = { stages: qualified ? [webgpuStage] : workerFallback ? [webgpuStage, canvasStage] : [canvasStage] };
  const cleanup = {
    controllerFatalReasons: [], listenersRemoved: true, restorationOutcome: 'restored',
    applicationDescendantClosureEnd: 5.7, brokerDisposeEnd: 5.8,
    rootExitObservedAt: 5.9, terminalClosureEnd: 6
  };
  const capabilityStatus = unavailabilityBranch === 'webgpu-api-unavailable'
    ? 'api-unavailable'
    : unavailabilityBranch === 'webgpu-adapter-unavailable'
      ? 'adapter-unavailable'
      : 'available';
  const capabilityResult = capabilityStatus === 'available'
    ? {
        status: 'available', adapterIdentity: identity.adapterIdentity, limits: identity.limits,
        isFallbackAdapter: workerFallback,
        strictSelection: { requestedBackend: 'webgpu', powerPreference: 'low-power', forceFallbackAdapter: false }
      }
    : { status: capabilityStatus };
  const transferStatus = ({
    'transfer-api-unavailable': 'api-unavailable',
    'transfer-method-unavailable': 'method-unavailable',
    'transfer-allowlisted-not-supported': 'allowlisted-not-supported'
  })[unavailabilityBranch] ?? (capabilityStatus === 'available' ? 'available' : 'api-unavailable');
  const preWorkerUnavailable = !qualified && !workerFallback;
  const captureBody = {
    schemaVersion: 1,
    experimentId: context.experimentId,
    ledgerSequence: 6,
    observationBoundaryId: slot.observationBoundaryId,
    sourceSha: context.sourceSha,
    policyHash: context.policyHash,
    buildVariant: 'harness-control',
    requestedBackend: 'webgpu',
    readinessEvidence,
    capabilityResult,
    transferResult: { status: transferStatus },
    selectionResult: {
      qualificationState: qualified ? 'qualified-webgpu' : 'hardware-capability-unavailable',
      unavailabilityBranch,
      requestedBackend: 'webgpu', selectedBackend: qualified ? 'webgpu' : 'canvas2d',
      observedBackend: qualified || workerFallback ? 'webgpu' : 'canvas2d',
      selectionReason: qualified ? 'webgpu-selected' : unavailabilityBranch
    },
    adapterIdentity: preWorkerUnavailable ? null : identity.adapterIdentity,
    fallbackState: preWorkerUnavailable
      ? null
      : workerFallback
        ? {
            isFallbackAdapter: true, branch: unavailabilityBranch,
            observedBackendExecutionIdentity: { ...identity, isFallbackAdapter: true },
            fallbackBackend: 'canvas2d'
          }
        : { isFallbackAdapter: false, branch: null },
    backendExecutionIdentity: qualified ? identity : null,
    cleanup
  };
  const binding = scopedBinding(context, 'qualification', 'ledger-operation', 6, {
    ledgerSequence: 6,
    operationId: 'electron-harness-spawn'
  });
  const scoped = { ...binding, observationBoundaryId: slot.observationBoundaryId };
  const pid = 9006;
  const creationIdentity = 'qualification';
  const processIdentity = `external:${pid}:${creationIdentity}`;
  const processCommon = {
    ...binding,
    observationSource: 'external', subjectKind: 'qualification', pid, creationIdentity,
    processIdentity, rawIdentity: { pid, creationIdentity },
    processClass: 'application-renderer', ownership: 'application-owned'
  };
  const environment = environmentIdentity();
  const rawKinds = [{
    rawKind: 'process-observation',
    rows: [{
      ...processCommon, observationOrdinal: 1, observedAt: 5.1, observationKind: 'membership',
      adapterId: 'external-membership-v1', rawAdapterKind: 'external-process-membership',
      rawMembership: { spawnBoundary: {}, rendererEvaluation: {}, ancestry: {}, processGroup: null, job: null, pathIdentity: {} },
      alive: true
    }, {
      ...processCommon, observationOrdinal: 2, observedAt: 5.6, observationKind: 'health',
      adapterId: 'external-health-v1', rawAdapterKind: 'external-process-health',
      rawHealth: { alive: true, status: 'live', exitObservation: null }, alive: true, healthState: 'live'
    }, {
      ...processCommon, observationOrdinal: 3, observedAt: 6, observationKind: 'closure',
      adapterId: 'external-closure-v1', rawAdapterKind: 'external-process-closure',
      rawClosure: { terminalStatus: 'closed', exitCode: 0, signal: null, zeroSurvivors: true },
      alive: false, closureState: 'closed'
    }]
  }, {
    rawKind: 'environment-observation',
    rows: [{
      ...scoped, source: 'external-monitor', sourceSequence: 1, clockDomain: 'runner',
      runnerReceiptSequence: 1, observedAt: 5.1, observationKind: 'initial-snapshot',
      rawAdapterKind: 'external-host-snapshot-v1', rawObservation: environment,
      staticIdentity: environment.staticIdentity, dynamicState: environment.dynamicState
    }, {
      ...scoped, source: 'external-monitor', sourceSequence: 2, clockDomain: 'runner',
      runnerReceiptSequence: 2, observedAt: 6, observationKind: 'cleanup',
      rawAdapterKind: 'external-host-cleanup-v1',
      rawObservation: { cleanupState: 'disposed', lastSourceSequence: 1, remainingPollTimerCount: 0, remainingListenerCount: 0 },
      cleanupState: 'disposed'
    }]
  }, {
    rawKind: 'controller-operation',
    rows: [{
      ...scoped, controlSequence: 1, operationKind: 'request', clockDomain: 'electron-main',
      controllerRequestId: 'capacity-qualification', channel: 'browser-window',
      requestKind: 'qualification', rawRequest: {}, sentAt: 5.1
    }, {
      ...scoped, controlSequence: 2, operationKind: 'response', clockDomain: 'electron-main',
      controllerRequestId: 'capacity-qualification', channel: 'browser-window',
      responseKind: 'qualification', rawResponse: {}, receivedAt: 5.15, outcome: 'recorded'
    }, {
      ...scoped, controlSequence: 3, operationKind: 'control-write', clockDomain: 'renderer-performance-now-v1',
      writeKind: 'backend-ready',
      rawWrite: {
        kind: 'backend-ready', launchId: slot.launchId, observedAt: 5.2,
        requestedBackend: 'webgpu', selectedBackend: qualified || workerFallback ? 'webgpu' : 'canvas2d',
        selectionReason: qualified || workerFallback ? 'webgpu-selected' : unavailabilityBranch,
        backendExecutionIdentity: qualified ? identity : workerFallback ? { ...identity, isFallbackAdapter: true } : null
      },
      writtenAt: 5.2, outcome: 'recorded'
    }, ...(workerFallback ? [{
      ...scoped, controlSequence: 4, operationKind: 'control-write', clockDomain: 'renderer-performance-now-v1',
      writeKind: 'backend-ready',
      rawWrite: {
        kind: 'backend-ready', launchId: slot.launchId, observedAt: 5.2,
        requestedBackend: 'webgpu', selectedBackend: 'canvas2d',
        selectionReason: 'fatal-detector-reason', backendExecutionIdentity: null
      },
      writtenAt: 5.2, outcome: 'recorded'
    }] : [])]
  }];
  return createPerformanceQualificationCapture({
    experimentId: context.experimentId,
    sourceSha: context.sourceSha,
    policyHash: context.policyHash,
    captureKind: 'qualification',
    ledgerSequence: 6,
    observationBoundaryId: slot.observationBoundaryId,
    captureBody,
    captureBodyChecksum: canonicalSha256(captureBody),
    rawKinds
  });
}

function createExperimentIndex(capture, context) {
  return createPerformanceCaptureIndex({
    schemaVersion: 1,
    experimentId: context.experimentId,
    captureKind: 'experiment-environment',
    entryCount: 1,
    entries: [{
      scopeKind: 'experiment', scopeId: context.experimentId,
      relativePath: `capacity/experiment-environment/${capture.checksum}.json`, checksum: capture.checksum
    }]
  }, context);
}

function createTransportIndex(captures, context) {
  return createPerformanceCaptureIndex({
    schemaVersion: 1,
    experimentId: context.experimentId,
    captureKind: 'transport',
    entryCount: captures.length,
    entries: captures.map((capture) => ({
      ledgerSequence: capture.ledgerSequence,
      operationId: capture.operationId,
      observationBoundaryId: capture.observationBoundaryId,
      relativePath: `capacity/transport/${capture.checksum}.json`,
      checksum: capture.checksum
    }))
  }, context);
}

function createQualificationIndex(capture, context) {
  return createPerformanceCaptureIndex({
    schemaVersion: 1,
    experimentId: context.experimentId,
    captureKind: 'qualification',
    entryCount: 1,
    entries: [{
      ledgerSequence: capture.ledgerSequence,
      operationId: 'electron-harness-spawn',
      observationBoundaryId: capture.observationBoundaryId,
      relativePath: `capacity/qualification/${capture.checksum}.json`,
      checksum: capture.checksum
    }]
  }, context);
}

export function createPerformanceCapacityCaptureSet({
  scenarioId,
  experimentRole,
  callbacksPerRun,
  unavailabilityBranch = 'none',
  backends = experimentRole === 'ci-integrity' || unavailabilityBranch !== 'none'
    ? ['canvas2d']
    : ['canvas2d', 'webgpu'],
  webgpuAllocationVectors = undefined,
  policy
} = {}) {
  if (typeof scenarioId !== 'string' || scenarioId.length === 0) fail('scenarioId is required');
  if (!['ci-integrity', 'reference-comparison'].includes(experimentRole)) fail('experimentRole is invalid');
  if (experimentRole === 'ci-integrity' && unavailabilityBranch !== 'none') fail('CI capacity capture cannot carry qualification unavailability');
  const unavailableReasons = policy.policy.performanceFailurePolicy.qualificationUnavailableReasons;
  if (unavailabilityBranch !== 'none' && !unavailableReasons.includes(unavailabilityBranch)) fail('capacity qualification unavailability branch is invalid');
  if (!Number.isSafeInteger(callbacksPerRun) || callbacksPerRun < policy.policy.performanceLimits.window.minimumCallbacks
    || callbacksPerRun > policy.policy.performanceLimits.window.maximumCallbacks) {
    fail('callbacksPerRun must be inside the production measurement window');
  }
  const expectedBackends = experimentRole === 'ci-integrity' || unavailabilityBranch !== 'none'
    ? ['canvas2d']
    : ['canvas2d', 'webgpu'];
  if (JSON.stringify(backends) !== JSON.stringify(expectedBackends)) fail('capacity backends must be the full role topology');
  const createUuid = uuidFactory(experimentRole === 'ci-integrity' ? 1 : 100_000);
  const experimentId = createUuid();
  const context = {
    experimentId,
    experimentRole,
    sourceSha: SOURCE_SHA,
    policyHash: policy.policyHash
  };
  const preLoop = createPerformancePreLoopAuthority({ ...context, createUuid });
  const pairPlans = backends.map((backend) => createPerformancePairPlan({
    experimentId,
    backend,
    createSessionId: createUuid
  }));
  const launchAuthorities = new Map(pairPlans.map((pairPlan) => [pairPlan.backend, createPerformanceLaunchAuthority({
    sourceSha: context.sourceSha,
    policyHash: context.policyHash,
    experimentRole,
    pairPlan,
    createUuid
  })]));
  const buildCommandLedger = { schemaVersion: 1, sourceSha: context.sourceSha, entries: [] };
  const qualification = experimentRole === 'reference-comparison'
    ? createQualificationCapture(context, preLoop, unavailabilityBranch)
    : null;
  const ledger = createPrefixLedger(preLoop, experimentRole, buildCommandLedger, qualification);
  const executions = new Map();
  let ordinal = 0;
  for (const pairPlan of pairPlans) {
    const executed = appendBackendLedger({
      ledger,
      pairPlan,
      launchAuthority: launchAuthorities.get(pairPlan.backend),
      callbacksPerRun,
      ordinalStart: ordinal
    });
    ordinal = executed.ordinal;
    executions.set(pairPlan.backend, executed);
  }
  const families = {};
  let allocationVectorOffset = 0;
  for (const pairPlan of pairPlans) {
    const executed = executions.get(pairPlan.backend);
    const sentinel = [];
    const externalMetric = [];
    const workload = [];
    for (const join of executed.joins) {
      const accepted = join.attemptIndex === PERFORMANCE_PAIR_ATTEMPT_CARDINALITY;
      externalMetric.push(createExternalMetricCapture(join, accepted));
      if (join.comparisonKind === 'harness-overhead') {
        sentinel.push(createSentinelCapture(join, callbacksPerRun));
      } else {
        const allocationVector = join.backend === 'webgpu' && join.buildVariant === 'instrumented' && accepted
          ? webgpuAllocationVectors?.[allocationVectorOffset++]
          : undefined;
        workload.push(createWorkloadCapture(join, callbacksPerRun, allocationVector, policy));
      }
    }
    const metricSession = [...executed.sessionJoins.values()].map((session) => (
      createMetricSessionCapture(context, pairPlan, session)
    ));
    families[pairPlan.backend] = {
      pairPlan,
      indexes: {
        sentinel: backendIndex('sentinel', sentinel, context, pairPlan),
        externalMetric: backendIndex('external-metric', externalMetric, context, pairPlan),
        workload: backendIndex('workload', workload, context, pairPlan),
        metricSession: metricSessionIndex(metricSession, context, pairPlan)
      },
      captures: { sentinel, externalMetric, workload, metricSession }
    };
  }
  if (webgpuAllocationVectors !== undefined && allocationVectorOffset !== webgpuAllocationVectors.length) {
    fail('WebGPU allocation vectors do not exactly bind accepted instrumented runs');
  }
  const environment = createExperimentEnvironmentCapture(context, ledger);
  const transports = createTransportCaptures(context, preLoop);
  const evidenceProvenance = {
    kind: 'capacity-fixture',
    fixtureId: `performance-capacity-${experimentRole}`,
    scenarioId,
    seedHash: canonicalSha256({ scenarioId, experimentRole, callbacksPerRun, backends }),
    runtimeProjection: runtimeProjection(experimentRole, experimentId)
  };
  const semanticAuthority = {
    generatedAt: '2026-07-12T00:00:00.000Z',
    repository: { commitSha: context.sourceSha, dirty: false, branch: null },
    environment: {
      os: experimentRole === 'ci-integrity' ? 'linux' : 'darwin',
      arch: experimentRole === 'ci-integrity' ? 'x64' : 'arm64',
      nodeVersion: 'v24.0.0',
      targetId: experimentRole === 'ci-integrity' ? null : 'selected'
    },
    inputs: {
      workload: { id: 'phase0-animated-160x144-v1' },
      processAdapter: { id: 'linux-procfs-v1' },
      callbacksPerRun,
      pairPlansChecksum: canonicalSha256(pairPlans)
    },
    reset: { version: 'phase0-cold-launch-reset-v1' },
    seed: { hash: evidenceProvenance.seedHash }
  };
  const builds = buildEvidence();
  return {
    manifest: {
      mode: experimentRole === 'ci-integrity' ? 'ci-core' : 'selected-reference',
      finalizationPurpose: 'capacity-fixture',
      evaluationContext: context,
      semanticAuthority,
      evidenceProvenance
    },
    ...builds,
    buildCommandLedger,
    performanceLedger: ledger,
    ...(qualification ? { qualificationEvidence: { index: createQualificationIndex(qualification, context), capture: qualification } } : {}),
    experimentEvidence: {
      indexes: { environment: createExperimentIndex(environment, context), transport: createTransportIndex(transports, context) },
      captures: { environment, transport: transports }
    },
    backendFamilies: families
  };
}
