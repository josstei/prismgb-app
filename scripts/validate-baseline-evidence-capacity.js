import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalSha256, stableStringify } from './lib/baseline-report.js';
import {
  createAcceptedEvidenceBody,
  createAcceptedRootBody,
  createCoreCandidateBody,
  createCoreEvidenceRecord,
  createResolvedCandidateBody,
  createResolvedEvidenceRecord
} from './lib/baseline-evidence-contract.js';
import {
  EVIDENCE_HARD_LIMITS,
  encodeCanonicalEvidenceArchive,
  encodeEvidenceArchive,
  createCompressorIdentity,
  createEvidenceStore,
  measureEvidenceArchiveUtilization,
  projectEvidenceArchive,
  readEvidenceArchive,
  writeEvidenceArchive
} from './lib/baseline-evidence-store.js';
import {
  deriveAllocationEvidence,
  deriveAllocationExpectedCoverage,
  encodePerformanceEvidence,
  evaluatePerformanceExperiment,
  loadBaselinePolicy,
  requirePublishablePerformanceEvidence
} from './lib/performance-evidence.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CAPACITY_OUTPUT_ROOT = path.join(PROJECT_ROOT, 'artifacts', 'codebase-baseline', 'capacity');

// The compact oracle has no encoded archive, so it may prove only projection
// dimensions that do not depend on transport. Accepted-root bytes are measured
// from each materialized production archive below.
const COMPACT_SEMANTIC_COMPONENTS = Object.freeze([
  'maximumRecordBytes',
  'expandedJsonlBytes',
  'objectCount',
  'recordCount'
]);
const PRODUCTION_COMPONENTS = Object.freeze([
  'rootBytes',
  ...COMPACT_SEMANTIC_COMPONENTS
]);

function fail(message) {
  throw new Error(`Baseline evidence capacity validation failed: ${message}`);
}

function parseArgs(argv) {
  const options = { mode: 'all' };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--mode') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) fail(`${argument} requires a value`);
      index += 1;
      if (argument === '--mode') options.mode = value;
      continue;
    }
    fail(`unknown argument ${argument}`);
  }
  if (!['headroom', 'codec-boundaries', 'all'].includes(options.mode)) fail('--mode must be headroom, codec-boundaries, or all');
  return options;
}

function isContainedPath(basePath, candidatePath) {
  return candidatePath === basePath || candidatePath.startsWith(`${basePath}${path.sep}`);
}

function assertNoSymlinkInExistingPath(absolutePath) {
  const relative = path.relative(PROJECT_ROOT, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) fail('capacity output path escapes the repository');
  let current = PROJECT_ROOT;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) continue;
    const stats = fs.lstatSync(current);
    if (stats.isSymbolicLink()) fail(`capacity output path contains a symlink: ${current}`);
  }
}

export function resolveCapacityOutputRoot(candidate = CAPACITY_OUTPUT_ROOT) {
  if (typeof candidate !== 'string' || candidate.length === 0) fail('capacity output root must be a nonempty path');
  const expectedRoot = path.resolve(CAPACITY_OUTPUT_ROOT);
  const resolvedCandidate = path.resolve(candidate);
  if (!isContainedPath(expectedRoot, resolvedCandidate)) fail('capacity output root must stay beneath artifacts/codebase-baseline/capacity');
  assertNoSymlinkInExistingPath(resolvedCandidate);
  return resolvedCandidate;
}

function createCapacityWorkspace(capacityRoot, workspaceId = crypto.randomUUID()) {
  if (typeof workspaceId !== 'string' || !/^[a-z0-9-]{1,128}$/i.test(workspaceId)) fail('capacity workspace ID is invalid');
  const root = resolveCapacityOutputRoot(capacityRoot);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  assertNoSymlinkInExistingPath(root);
  const workspace = resolveCapacityOutputRoot(path.join(root, workspaceId));
  try {
    fs.mkdirSync(workspace, { recursive: false, mode: 0o700 });
  } catch (error) {
    fail(`unable to create isolated capacity workspace: ${error.message}`);
  }
  return workspace;
}

function removeCapacityWorkspace(workspace) {
  const resolved = resolveCapacityOutputRoot(workspace);
  const stats = fs.lstatSync(resolved);
  if (stats.isSymbolicLink() || !stats.isDirectory()) fail('capacity workspace must be a real directory before cleanup');
  fs.rmSync(resolved, { recursive: true, force: false });
}

function sortedReferences(references) {
  return [...references].sort((left, right) => {
    const leftKey = `${left.kind}:${left.hash}`;
    const rightKey = `${right.kind}:${right.hash}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

function coreProjection(rootReferences) {
  return { mode: 'core', rootReferences };
}

function selectedProjection(rootReferences, coreReferences) {
  return { mode: 'selected-reference', rootReferences, coreReferences };
}

function noHostProjection(rootReferences, coreReferences) {
  return { mode: 'no-reference-host', rootReferences, coreReferences };
}

function acceptedSelectedProjection(rootReferences, coreReferences, resolvedReferences) {
  return { mode: 'accepted-selected-reference', rootReferences, coreReferences, resolvedReferences };
}

function acceptedNoHostProjection(rootReferences, coreReferences, resolvedReferences) {
  return { mode: 'accepted-no-reference-host', rootReferences, coreReferences, resolvedReferences };
}

function syntheticFixtureProvenance(scenario) {
  return {
    kind: 'synthetic-capacity-fixture',
    scenario,
    publicationEligible: false,
    runtimeMeasurement: false
  };
}

function workflowProvenance() {
  return {
    captureIdentity: {
      provider: 'github-actions',
      sourceSha: '9a7839ce47c61982f6eab836c496b8469f01a9ca',
      analysisSha256: '0c6a4ccbe48b9b12e4c58bd153ae6f5c04bed82fb489c5a2402d21934b4c8fba',
      repository: 'prismgb/prismgb-app',
      workflowRef: 'prismgb/prismgb-app/.github/workflows/codebase-baseline.yml@refs/heads/main',
      workflowRunId: '1',
      workflowRunAttempt: 1,
      eventName: 'workflow_dispatch'
    },
    producers: [{ jobId: 'validate-linux', targetId: null, artifactName: 'singleton-evidence' }]
  };
}

function createComparisonInput(backend) {
  return {
    schemaVersion: 1,
    policyHashes: { fixture: 'a'.repeat(64) },
    initialEnvironment: { host: 'capacity-fixture' },
    workload: { id: 'phase0-animated-160x144-v1' },
    reset: { version: 'phase0-cold-launch-reset-v1' },
    processAdapter: { id: 'linux-procfs-v1' },
    seed: { hash: 'b'.repeat(64) },
    backend,
    backendExecutionIdentity: backend === 'canvas2d' ? 'not-applicable' : { adapter: 'fixture-adapter', isFallbackAdapter: false }
  };
}

function createQualificationInput() {
  return {
    schemaVersion: 1,
    sourceSha: '9a7839ce47c61982f6eab836c496b8469f01a9ca',
    controlBundle: { hash: 'c'.repeat(64), mode: 'harness-control' },
    workload: { id: 'phase0-animated-160x144-v1' },
    initialEnvironment: { host: 'capacity-fixture' },
    requestedBackend: 'webgpu',
    selectedBackend: 'webgpu',
    observedBackend: 'webgpu',
    qualificationState: 'qualified-webgpu',
    unavailabilityBranch: 'none',
    adapter: { id: 'fixture-adapter', isFallbackAdapter: false },
    backendExecutionIdentity: { adapter: 'fixture-adapter', isFallbackAdapter: false },
    resetVersion: 'phase0-cold-launch-reset-v1',
    policyHashes: { fixture: 'a'.repeat(64) },
    processAdapter: { id: 'linux-procfs-v1' },
    seedManifestHash: 'b'.repeat(64)
  };
}

function createUnavailableQualificationInput(unavailabilityBranch) {
  return {
    ...createQualificationInput(),
    selectedBackend: 'canvas2d',
    observedBackend: 'canvas2d',
    qualificationState: 'hardware-capability-unavailable',
    unavailabilityBranch,
    adapter: { id: 'unavailable', isFallbackAdapter: false },
    backendExecutionIdentity: 'not-applicable'
  };
}

function createInstrumentationLedger({ prefix, runIds, experimentId, backend, callbacksPerRun, policy }) {
  if (!Array.isArray(runIds) || runIds.length < 2 || runIds.length % 2 !== 0) {
    fail('capacity instrumentation ledgers require an even nonempty control/instrumented run set');
  }
  if (!['canvas2d', 'webgpu'].includes(backend)) fail('capacity instrumentation ledger backend is invalid');
  if (!Number.isSafeInteger(callbacksPerRun) || callbacksPerRun < 1 || callbacksPerRun > policy.policy.performanceLimits.window.maximumCallbacks) {
    fail('capacity instrumentation ledger callback cohort is invalid');
  }
  const closure = {
    closed: true,
    stdoutDrained: true,
    stderrDrained: true,
    inputClosed: true,
    exit: { code: 0, durationMs: 1 },
    zeroSurvivors: true
  };
  const frameSourceSequences = Array.from({ length: callbacksPerRun }, (_, index) => index + 1);
  const ledger = [];
  let sequence = 1;
  let time = 0;
  for (let runIndex = 0; runIndex < runIds.length; runIndex += 2) {
    const pairIndex = runIndex / 2 + 1;
    const sessionId = `${prefix}-session-${pairIndex}`;
    const start = () => time;
    const end = () => {
      time += 1;
      return time;
    };
    ledger.push({
      sequence: sequence++, operationId: 'metric-adapter-session-open', start: start(), end: end(), metricSessionId: sessionId, outcome: 'ready',
      attempt: { pairIndex, attemptIndex: 1, retryReason: null }
    });
    ledger.push({ sequence: sequence++, operationId: 'internal-reset', start: start(), end: end(), metricSessionId: sessionId, resetId: `${prefix}-reset-a-${pairIndex}`, boundary: 'reset-before-a' });
    ledger.push({
      sequence: sequence++, operationId: 'electron-harness-spawn', start: start(), end: end(), metricSessionId: sessionId,
      comparisonSide: 'A', comparisonKind: 'instrumentation-overhead', buildVariant: 'harness-control', runId: runIds[runIndex],
      experimentId, backend, policyHash: policy.policyHash, launchId: `${prefix}-launch-control-${pairIndex}`, executionId: `${prefix}-execution-control-${pairIndex}`,
      ownership: { class: 'application-owned' }, cleanup: closure, outcome: 'completed'
    });
    ledger.push({ sequence: sequence++, operationId: 'internal-reset', start: start(), end: end(), metricSessionId: sessionId, resetId: `${prefix}-reset-b-${pairIndex}`, boundary: 'reset-before-b' });
    ledger.push({
      sequence: sequence++, operationId: 'electron-harness-spawn', start: start(), end: end(), metricSessionId: sessionId,
      comparisonSide: 'B', comparisonKind: 'instrumentation-overhead', buildVariant: 'instrumented', runId: runIds[runIndex + 1],
      experimentId, backend, policyHash: policy.policyHash, launchId: `${prefix}-launch-instrumented-${pairIndex}`, executionId: `${prefix}-execution-instrumented-${pairIndex}`,
      measurementEpochId: `${prefix}-epoch-${pairIndex}`, frameSourceSequences, ownership: { class: 'application-owned' }, cleanup: closure, outcome: 'completed'
    });
    ledger.push({ sequence: sequence++, operationId: 'metric-adapter-session-close', start: start(), end: end(), metricSessionId: sessionId, outcome: 'completed', closure });
  }
  return ledger;
}

function validateCapacityAttemptRepresentation(ledger, evaluation, expectedPairCount, label) {
  const sessionAttempts = ledger
    .filter((entry) => entry.operationId === 'metric-adapter-session-open')
    .map((entry) => ({ metricSessionId: entry.metricSessionId, ...entry.attempt }));
  if (sessionAttempts.length !== expectedPairCount) {
    fail(`${label} does not represent every capacity pair attempt`);
  }
  sessionAttempts.forEach((attempt, index) => {
    if (attempt.pairIndex !== index + 1 || attempt.attemptIndex !== 1 || attempt.retryReason !== null) {
      fail(`${label} capacity pair attempts must carry the explicit original-attempt metadata`);
    }
  });
  const retryTopology = evaluation.retryTopology;
  if (retryTopology.mode !== 'explicit-attempts' || retryTopology.pairs.length !== expectedPairCount) {
    fail(`${label} evaluator did not preserve explicit capacity pair attempts`);
  }
  retryTopology.pairs.forEach((pair, index) => {
    const sessionAttempt = sessionAttempts[index];
    if (pair.pairIndex !== index + 1 || pair.attempts.length < 1 || pair.attempts.length > 3) {
      fail(`${label} capacity pair attempt representation is not bounded`);
    }
    if (pair.attempts.length !== 1) {
      fail(`${label} capacity fixture must materialize one original attempt per pair`);
    }
    const attempt = pair.attempts[0];
    if (attempt.metricSessionId !== sessionAttempt.metricSessionId
      || attempt.attemptIndex !== sessionAttempt.attemptIndex
      || attempt.retryReason !== sessionAttempt.retryReason
      || attempt.outcome !== 'completed') {
      fail(`${label} evaluator retry topology does not match the capacity ledger metadata`);
    }
  });
  return {
    sessions: sessionAttempts,
    pairs: retryTopology.pairs
  };
}

function createRawRunEvidence(launch, callbacksPerRun, policy) {
  const callbackWindowStart = 0;
  const callbackClosureAt = 30;
  const callbackWindowEnd = callbackClosureAt;
  const cpuSampleIntervalSeconds = 0.5;
  const cpuReadDurationSeconds = 0.01;
  const callbackCount = launch.buildVariant === 'instrumented'
    ? launch.frameSourceSequences.length
    : callbacksPerRun;
  const identity = `${launch.runId}-renderer`;
  const counterQuantumSeconds = policy.adapters.get('linux-procfs-v1').counterQuantumSeconds;
  const terminalSampleIndex = Math.ceil(callbackWindowEnd / cpuSampleIntervalSeconds);
  const cpuSampleCount = Math.max(policy.policy.performanceMetricPolicy.minimumRawSamples, terminalSampleIndex + 1);
  const cpuSamples = Array.from({ length: cpuSampleCount }, (_, index) => {
    const readStart = index * cpuSampleIntervalSeconds;
    const readEnd = readStart + cpuReadDurationSeconds;
    return {
      ordinal: index + 1,
      readStart,
      readEnd,
      cumulativeCpuSeconds: index * 0.05,
      counterQuantumSeconds,
      processIdentity: identity,
      workingSetMiB: 128
    };
  });
  const firstCpuSample = cpuSamples[0];
  const terminalCpuSample = cpuSamples.at(-1);
  const beforeTerminalCpuSample = cpuSamples.at(-2);
  if (
    firstCpuSample.readStart !== callbackWindowStart
    || !beforeTerminalCpuSample
    || beforeTerminalCpuSample.readEnd >= callbackClosureAt
    || terminalCpuSample.readStart < callbackClosureAt
    || terminalCpuSample.readEnd <= callbackClosureAt
  ) {
    fail('capacity CPU evidence must run from the immediate callback-window start through the first terminal sample after callback closure');
  }
  const terminalCpuMidpoint = (terminalCpuSample.readStart + terminalCpuSample.readEnd) / 2;
  const traceCount = Math.ceil(terminalCpuMidpoint) + 2;
  const traces = ['external', 'controller'].flatMap((source) => Array.from({ length: traceCount }, (_, index) => ({
    source,
    sourceSequence: index + 1,
    observedAt: index,
    dynamicState: {
      power: 'ac', display: 'single', refreshRate: 60, devicePixelRatio: 1,
      thermal: 'nominal', gpuSwitch: 'stable'
    }
  })));
  return {
    runId: launch.runId,
    callbackTiming: {
      callbackCohort: {
        sourceSequenceEncoding: policy.policy.capacityFixturePolicy.callbackCohortEncoding,
        firstSourceSequence: 1,
        callbackCount,
        windowStart: callbackWindowStart,
        windowEnd: callbackWindowEnd,
        dropCount: 0,
        sealed: true,
        drained: true
      },
      timingSpans: [{
        firstSourceSequence: 1,
        lastSourceSequence: callbackCount,
        startedAt: 0,
        endedAt: callbackClosureAt
      }]
    },
    cpuSamples,
    environment: {
      staticIdentity: { host: 'capacity-fixture', runtime: 'electron', gpu: 'fixture-gpu', switches: 'none' },
      dynamicState: { power: 'ac', display: 'single', refreshRate: 60, devicePixelRatio: 1, thermal: 'nominal', gpuSwitch: 'stable' },
      traces
    },
    process: {
      adapterId: 'linux-procfs-v1',
      identity,
      observations: cpuSamples.map((sample) => ({
        sequence: sample.ordinal,
        observedAt: (sample.readStart + sample.readEnd) / 2,
        identity,
        alive: true
      }))
    }
  };
}

function createRawPerformanceEvidence(ledger, callbacksPerRun, policy) {
  const launches = ledger.filter((entry) => entry.operationId === 'electron-harness-spawn');
  return { runs: launches.map((launch) => createRawRunEvidence(launch, callbacksPerRun, policy)) };
}

function createAllocationInput({ acceptedRuns, ledger, experimentId, fixtureProvenance, allocationVector = undefined, shape = 'complete', policy }) {
  const runIds = acceptedRuns.map((run) => run.runId);
  const frameCountByRun = Object.fromEntries(acceptedRuns.map((run) => [run.runId, run.frameSourceSequences.length]));
  const expected = deriveAllocationExpectedCoverage({ acceptedRunIds: runIds, frameCountByRun }, policy);
  const coverage = policy.policy.allocationEvidencePolicy.webgpu.coverage;
  if (allocationVector !== undefined) {
    if (!Array.isArray(allocationVector) || allocationVector.length !== acceptedRuns.length) fail('allocation vector must bind every accepted instrumented run');
    allocationVector.forEach((runVector, runIndex) => {
      if (!Array.isArray(runVector) || runVector.length !== coverage.length) fail(`allocation vector run ${runIndex} must cover every policy entry`);
      runVector.forEach((observed, coverageIndex) => {
        const expectedCardinality = coverage[coverageIndex].cardinality === 'per-frame'
          ? acceptedRuns[runIndex].frameSourceSequences.length
          : coverage[coverageIndex].cardinality;
        if (!Number.isSafeInteger(observed) || observed < 0 || observed > expectedCardinality) {
          fail(`allocation vector run ${runIndex} has an invalid observed cardinality`);
        }
      });
    });
  }
  if (allocationVector === undefined && !['complete', 'max-observed-min-missing', 'max-missing-minimal-observed'].includes(shape)) fail(`unknown allocation fixture shape ${shape}`);
  const acceptedRunIndex = new Map(acceptedRuns.map((run, index) => [run.runId, index]));
  const observedCoverage = expected.map((entry, entryIndex) => {
    const runIndex = acceptedRunIndex.get(entry.runId);
    const coverageIndex = coverage.findIndex((candidate) => candidate.operationId === entry.operationId && candidate.sourceLocationId === entry.sourceLocationId);
    if (runIndex === undefined || coverageIndex < 0) fail('allocation expected coverage is not represented in the policy map');
    let observedCardinality;
    if (allocationVector !== undefined) {
      observedCardinality = allocationVector[runIndex][coverageIndex];
    } else if (shape === 'complete') {
      observedCardinality = entry.expectedCardinality;
    } else if (shape === 'max-observed-min-missing') {
      observedCardinality = entryIndex === expected.length - 1 ? entry.expectedCardinality - 1 : entry.expectedCardinality;
    } else {
      observedCardinality = entry.carrier === 'frame-request' && entry.operationId === 'video-frame-image-bitmap-request' ? 1 : 0;
    }
    if (!Number.isSafeInteger(observedCardinality) || observedCardinality < 0 || observedCardinality > entry.expectedCardinality) {
      fail('synthetic allocation coverage has an invalid observed cardinality');
    }
    return {
      runId: entry.runId,
      operationId: entry.operationId,
      sourceLocationId: entry.sourceLocationId,
      observedCardinality
    };
  });
  return {
    experimentId,
    backend: 'webgpu',
    policyHash: policy.policyHash,
    ledger,
    syntheticCoverage: {
      encoding: policy.policy.capacityFixturePolicy.encoding,
      frameCohorts: Object.entries(frameCountByRun)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([runId, callbackCount]) => ({ runId, callbackCount })),
      observedCoverage
    },
    evidenceProvenance: fixtureProvenance
  };
}

function addPerformanceFixtureGraph(store, {
  scenario,
  runBodies,
  callbacksPerRun,
  parentKind,
  experimentRole,
  backend,
  allocationShape = 'complete',
  allocationVector = undefined,
  unavailabilityBranch = undefined,
  verifySyntheticAcceptance = true,
  replayRawEvidence = true,
  policy = loadBaselinePolicy()
}) {
  if (!Number.isSafeInteger(runBodies) || runBodies < 1) fail('performance fixture graphs require at least one run body');
  const effectiveRunBodies = Math.max(2, runBodies + (runBodies % 2));
  const fixtureProvenance = syntheticFixtureProvenance(scenario);
  const runReferences = [];
  const rawKindManifestReferences = [];
  const experimentId = `${scenario}-${experimentRole}-${backend}-experiment`;
  const runIds = Array.from({ length: effectiveRunBodies }, (_, index) => `${experimentRole}-${backend}-run-${index + 1}`);
  const ledger = createInstrumentationLedger({
    prefix: `${scenario}-${experimentRole}-${backend}`,
    runIds,
    experimentId,
    backend,
    callbacksPerRun,
    policy
  });
  const ledgerRuns = new Map(ledger.filter((entry) => entry.operationId === 'electron-harness-spawn').map((entry) => [entry.runId, entry]));
  const acceptedInstrumentedRuns = ledger.filter((entry) => entry.operationId === 'electron-harness-spawn' && entry.comparisonKind === 'instrumentation-overhead' && entry.buildVariant === 'instrumented');
  if (acceptedInstrumentedRuns.some((run) => run.frameSourceSequences.length !== callbacksPerRun)) {
    fail('capacity instrumented runs did not materialize the declared callback/frame cohort');
  }
  for (const runId of runIds) {
    const ledgerRun = ledgerRuns.get(runId);
    if (!ledgerRun) fail(`capacity ledger did not materialize run ${runId}`);
    const run = store.putObject('run', {
      runId,
      callbacks: callbacksPerRun,
      backend,
      experimentRole,
      fixtureProvenance,
      rawRunEvidence: {
        runId,
        experimentId: ledgerRun.experimentId,
        backend: ledgerRun.backend,
        policyHash: ledgerRun.policyHash,
        executionId: ledgerRun.executionId,
        ...(ledgerRun.buildVariant === 'instrumented' ? {
          measurementEpochId: ledgerRun.measurementEpochId,
          frameSourceSequences: ledgerRun.frameSourceSequences
        } : {}),
        buildVariant: ledgerRun.buildVariant
      }
    });
    runReferences.push({ kind: run.kind, hash: run.hash });
    const chunkReferences = [];
    for (let start = 0; start < callbacksPerRun; start += 256) {
      const count = Math.min(256, callbacksPerRun - start);
      const rows = Array.from({ length: count }, (_, offset) => ({ sequence: start + offset + 1, callback: 'window' }));
      const chunk = store.putObject('raw-chunk', { runId, rows });
      chunkReferences.push({ kind: chunk.kind, hash: chunk.hash });
    }
    const rawKindManifest = store.putObject('raw-kind-manifest', {
      chunkReferences: sortedReferences(chunkReferences)
    });
    rawKindManifestReferences.push({ kind: rawKindManifest.kind, hash: rawKindManifest.hash });
  }
  const rawAllocationEvidence = backend === 'webgpu'
    ? createAllocationInput({
      acceptedRuns: acceptedInstrumentedRuns,
      ledger,
      experimentId,
      fixtureProvenance,
      allocationVector,
      shape: allocationShape,
      policy
    })
    : { backend: 'canvas2d', rows: [], evidenceProvenance: fixtureProvenance };
  const allocationEvidence = rawAllocationEvidence;
  const qualificationInput = experimentRole === 'reference-comparison'
    ? (backend === 'webgpu' ? createQualificationInput() : createUnavailableQualificationInput(unavailabilityBranch))
    : undefined;
  const failureTuple = unavailabilityBranch === undefined
    ? undefined
    : { phase: 'qualification', backend: 'webgpu', reason: unavailabilityBranch };
  const rawEvidence = createRawPerformanceEvidence(ledger, callbacksPerRun, policy);
  const cpuWindowCoverage = rawEvidence.runs.map((run) => {
    const firstCpuSample = run.cpuSamples[0];
    const terminalCpuSample = run.cpuSamples.at(-1);
    const beforeTerminalCpuSample = run.cpuSamples.at(-2);
    const { windowStart, windowEnd } = run.callbackTiming.callbackCohort;
    if (
      firstCpuSample.readStart !== windowStart
      || !beforeTerminalCpuSample
      || beforeTerminalCpuSample.readEnd >= windowEnd
      || terminalCpuSample.readStart < windowEnd
      || terminalCpuSample.readEnd <= windowEnd
    ) {
      fail('capacity CPU evidence does not cover the callback window through its first terminal sample');
    }
    return {
      runId: run.runId,
      windowStart,
      windowEnd,
      firstReadStart: firstCpuSample.readStart,
      beforeTerminalReadEnd: beforeTerminalCpuSample.readEnd,
      terminalReadStart: terminalCpuSample.readStart,
      terminalReadEnd: terminalCpuSample.readEnd
    };
  });
  const logicalCallbackCohorts = rawEvidence.runs.map((run) => ({
    runId: run.runId,
    callbackCount: run.callbackTiming.callbackCohort.callbackCount
  })).sort((left, right) => left.runId.localeCompare(right.runId));
  if (logicalCallbackCohorts.length !== effectiveRunBodies || logicalCallbackCohorts.some((cohort) => cohort.callbackCount !== callbacksPerRun)) {
    fail('capacity raw callback cohorts do not exactly match every logical run body');
  }
  const evaluatorInput = {
    experimentId,
    experimentRole,
    backend,
    ledger,
    comparisonInputs: [createComparisonInput(backend)],
    allocationEvidence,
    rawEvidence,
    evidenceProvenance: fixtureProvenance,
    ...(qualificationInput === undefined ? {} : { qualificationInput }),
    ...(failureTuple === undefined ? {} : { failureTuple })
  };
  const evaluation = evaluatePerformanceExperiment(evaluatorInput, policy);
  if (evaluation.publicationEligible !== false) fail('synthetic capacity fixture unexpectedly became publication eligible');
  const attemptRepresentation = validateCapacityAttemptRepresentation(
    ledger,
    evaluation,
    effectiveRunBodies / 2,
    `${scenario} ${experimentRole} ${backend}`
  );
  let publishableEvidenceRejected = false;
  try {
    requirePublishablePerformanceEvidence(evaluation);
  } catch {
    publishableEvidenceRejected = true;
  }
  if (!publishableEvidenceRejected) fail('synthetic capacity fixture bypassed production evidence acceptance');
  if (verifySyntheticAcceptance) {
    let syntheticAcceptanceRejected = false;
    try {
      evaluatePerformanceExperiment({ ...evaluatorInput, acceptanceContext: true }, policy);
    } catch {
      syntheticAcceptanceRejected = true;
    }
    if (!syntheticAcceptanceRejected) fail('synthetic capacity fixture was accepted as a production measurement');
  }
  if (replayRawEvidence) {
    const replayed = evaluatePerformanceExperiment(evaluatorInput, policy);
    if (replayed.checksum !== evaluation.checksum) fail('capacity fixture raw evaluator input does not replay identically');
  }
  if (backend === 'webgpu') {
    const capacityCoverageChunk = store.putObject('raw-chunk', {
      rawKind: policy.policy.capacityFixturePolicy.encoding,
      fixtureProvenance,
      syntheticCoverage: allocationEvidence.syntheticCoverage
    });
    const capacityCoverageManifest = store.putObject('raw-kind-manifest', {
      rawKind: policy.policy.capacityFixturePolicy.encoding,
      chunkReferences: [{ kind: capacityCoverageChunk.kind, hash: capacityCoverageChunk.hash }]
    });
    rawKindManifestReferences.push({ kind: capacityCoverageManifest.kind, hash: capacityCoverageManifest.hash });
  }
  const evaluatorRawChunk = store.putObject('raw-chunk', {
    rawKind: 'capacity-evaluator-input-v1',
    fixtureProvenance,
    evaluatorInput
  });
  const evaluatorRawManifest = store.putObject('raw-kind-manifest', {
    rawKind: 'capacity-evaluator-input-v1',
    chunkReferences: [{ kind: evaluatorRawChunk.kind, hash: evaluatorRawChunk.hash }]
  });
  rawKindManifestReferences.push({ kind: evaluatorRawManifest.kind, hash: evaluatorRawManifest.hash });
  const child = store.putObject('experiment-child-manifest', {
    runReferences: sortedReferences(runReferences),
    rawKindManifestReferences: sortedReferences(rawKindManifestReferences)
  });
  const parent = store.putObject(parentKind, {
    childManifest: { kind: child.kind, hash: child.hash },
    experimentRole,
    backend,
    fixtureProvenance,
    evaluatorInput,
    evaluatorChecksum: evaluation.checksum,
    publicationEligible: evaluation.publicationEligible
  });
  return {
    rootReference: { kind: parent.kind, hash: parent.hash },
    runIds,
    runBodies: effectiveRunBodies,
    acceptedInstrumentedRunIds: acceptedInstrumentedRuns.map((run) => run.runId),
    instrumentedCallbackCohorts: acceptedInstrumentedRuns.map((run) => ({ runId: run.runId, callbackCount: run.frameSourceSequences.length })),
    logicalCallbackCohorts,
    logicalCallbackCount: logicalCallbackCohorts.reduce((total, cohort) => total + cohort.callbackCount, 0),
    cpuWindowCoverage,
    attemptRepresentation,
    allocationEvidenceClass: evaluation.allocationEvidence.evidenceClass,
    evaluation,
    evaluatorInput,
    fixtureProvenance
  };
}

async function createCoreFixture({ scenario, ciRunBodies, callbacksPerRun, store = createEvidenceStore(), policy = loadBaselinePolicy() }) {
  if (!Number.isSafeInteger(ciRunBodies) || ciRunBodies < 1) fail('core fixture requires nonempty CI run evidence');
  const fixtureProvenance = syntheticFixtureProvenance(scenario);
  const singletonReferences = ['source', 'events', 'lifecycle', 'behavior'].map((kind) => {
    const object = store.putObject('singleton-report', { evidenceId: kind, scenario, schemaVersion: 1, fixtureProvenance });
    return { kind: object.kind, hash: object.hash };
  });
  const packageObject = store.putObject('package-report', { evidenceId: 'package:fixture:release', scenario, schemaVersion: 1, fixtureProvenance });
  const ci = addPerformanceFixtureGraph(store, {
    scenario,
    runBodies: ciRunBodies,
    callbacksPerRun,
    parentKind: 'ci-experiment-parent',
    experimentRole: 'ci-integrity',
    backend: 'canvas2d',
    policy
  });
  const rootReferences = sortedReferences([...singletonReferences, { kind: packageObject.kind, hash: packageObject.hash }, ci.rootReference]);
  const rootProjection = coreProjection(rootReferences);
  const projection = store.project(rootReferences, rootProjection);
  const coreEvidenceBody = {
    schemaVersion: 1,
    status: 'complete',
    programOriginSha: policy.policy.programOriginSha,
    analysisSha256: policy.policy.analysisSha256,
    sourceSha: policy.policy.programOriginSha,
    policyHashes: policy.sectionHashes,
    rootReferences,
    canonicalArchiveSha256: projection.canonicalArchiveSha256,
    objectIndexSha256: projection.objectIndexSha256,
    expandedJsonlBytes: projection.expandedJsonlBytes,
    objectCount: projection.objectCount,
    recordCount: projection.recordCount,
    dedupStatistics: projection.dedupStatistics,
    workflowProvenance: workflowProvenance()
  };
  const coreRecord = createCoreEvidenceRecord({ coreEvidenceBody });
  const rootBytes = Buffer.byteLength(stableStringify(coreEvidenceBody), 'utf8');
  const compressorIdentity = await createCompressorIdentity({ compressorProbePolicyHash: policy.sectionHashes.performanceEvidenceChunkPolicy });
  const archive = await writeEvidenceArchive({
    objects: store.objectMap(),
    rootReferences,
    rootProjection,
    rootBytes,
    compressorIdentity
  });
  const coreCandidate = createCoreCandidateBody({
    ...coreRecord,
    compressedArchiveSha256: archive.compressedArchiveSha256,
    compressedBytes: archive.compressedBytes,
    compressorIdentity
  });
  return { store, policy, rootReferences, rootProjection, projection, coreEvidenceBody, coreRecord, coreCandidate, archive, rootBytes, compressorIdentity, ci };
}

function createNoHostAdministrativeLedger(fixtureProvenance) {
  return {
    schemaVersion: 1,
    state: 'no-launch',
    entries: [],
    fixtureProvenance
  };
}

/**
 * Apply the publication headroom rule to a selected-preview candidate. Keeping this
 * check beside the capacity runner makes a nonrepresentative preview unable to borrow
 * the green result of any representative fixture.
 */
export function assertSelectedPreviewHeadroom(values, { limits = EVIDENCE_HARD_LIMITS } = {}) {
  const utilization = measureEvidenceArchiveUtilization(values, { limits });
  if (!utilization.publicationHeadroomPassed) {
    fail(`selected preview exceeded publication headroom: ${utilization.publicationFailures.join(', ')}`);
  }
  return utilization;
}

/**
 * Evaluate the exact production archive before it is allowed to become an
 * output artifact. The writer invokes this gate after closed-codec encoding
 * but before its atomic publication step, so a nonrepresentative preview
 * cannot leave an artifact when the shared headroom policy rejects it.
 */
export async function writeSelectedPreviewArchive({
  outputPath = undefined,
  objects,
  rootReferences,
  rootProjection,
  archiveRootBytes,
  createPreviewRoot,
  compressorIdentity,
  limits = EVIDENCE_HARD_LIMITS
}) {
  if (typeof createPreviewRoot !== 'function') fail('selected preview requires a root factory');
  let previewRoot;
  let utilization;
  const archive = await writeEvidenceArchive({
    outputPath,
    objects,
    rootReferences,
    rootProjection,
    rootBytes: archiveRootBytes,
    compressorIdentity,
    limits,
    beforeWrite: (encodedArchive) => {
      previewRoot = createPreviewRoot(encodedArchive);
      utilization = assertSelectedPreviewHeadroom({
        rootBytes: Buffer.byteLength(stableStringify(previewRoot), 'utf8'),
        compressedBytes: encodedArchive.compressedBytes,
        expandedJsonlBytes: encodedArchive.expandedJsonlBytes,
        maximumRecordBytes: encodedArchive.maximumRecordBytes,
        objectCount: encodedArchive.objectCount,
        recordCount: encodedArchive.recordCount
      }, { limits });
    }
  });
  if (!previewRoot || !utilization) fail('selected preview was not evaluated before publication');
  return { archive, previewRoot, utilization };
}

async function constructScenario(name, resolutionKind, {
  runBodies = 0,
  callbacksPerRun = 0,
  allocationShape = 'complete',
  allocationVector = undefined,
  unavailabilityBranch = undefined,
  outputDirectory = undefined,
  archiveStem = name,
  policy = loadBaselinePolicy()
} = {}) {
  const effectiveCallbacksPerRun = Math.max(1, callbacksPerRun);
  const evenRunBodies = (count) => Math.max(2, count + (count % 2));
  const ciRunBodies = evenRunBodies(resolutionKind === 'no-host'
    ? 2
    : Math.min(18, Math.max(2, runBodies - 2)));
  const referenceRunBodies = resolutionKind === 'no-host' ? 0 : evenRunBodies(Math.max(2, runBodies - ciRunBodies));
  const core = await createCoreFixture({ scenario: name, ciRunBodies, callbacksPerRun: effectiveCallbacksPerRun, policy });
  let resolution;
  let resolutionRoot;
  let reference = null;
  let allocationSummary = null;
  if (resolutionKind === 'no-host') {
    const fixtureProvenance = syntheticFixtureProvenance(name);
    const administrativeLedger = createNoHostAdministrativeLedger(fixtureProvenance);
    const blocker = core.store.putObject('no-host-blocker', {
      state: 'no-host-selected',
      coreEvidenceChecksum: core.coreRecord.coreEvidenceChecksum,
      administrativeLedger
    });
    resolutionRoot = { kind: blocker.kind, hash: blocker.hash };
    resolution = { mode: 'no-host-selected', blocker: 'phase-5-selected-reference-host' };
  } else {
    const backend = resolutionKind === 'hardware-unavailable' ? 'canvas2d' : 'webgpu';
    reference = addPerformanceFixtureGraph(core.store, {
      scenario: name,
      runBodies: referenceRunBodies,
      callbacksPerRun: effectiveCallbacksPerRun,
      parentKind: 'reference-experiment-parent',
      experimentRole: 'reference-comparison',
      backend,
      allocationShape,
      allocationVector,
      unavailabilityBranch,
      replayRawEvidence: outputDirectory === undefined,
      policy
    });
    resolutionRoot = reference.rootReference;
    if (resolutionKind === 'qualified' && allocationShape !== 'complete') {
      allocationSummary = assertQualifiedIncompleteEnvelopeSemantics({
        allocationShape,
        allocationEvidence: reference.evaluation.allocationEvidence,
        acceptedInstrumentedRunIds: reference.acceptedInstrumentedRunIds,
        callbacksPerRun: effectiveCallbacksPerRun,
        policy
      });
    }
    if (resolutionKind === 'hardware-unavailable') {
      resolution = { mode: 'selected-reference', qualificationState: 'hardware-capability-unavailable', unavailabilityBranch };
    } else {
      resolution = { mode: 'selected-reference', allocationState: reference.evaluation.allocationEvidence.state };
    }
  }
  const resolvedRoots = sortedReferences([...core.rootReferences, resolutionRoot]);
  const resolvedRootProjection = resolutionKind === 'no-host'
    ? noHostProjection(resolvedRoots, core.rootReferences)
    : selectedProjection(resolvedRoots, core.rootReferences);
  const resolvedProjection = core.store.project(resolvedRoots, resolvedRootProjection);
  const resolvedEvidenceBody = {
    ...core.coreRecord,
    resolutionMode: resolutionKind === 'no-host' ? 'no-reference-host' : 'selected-reference',
    status: 'complete',
    rootReferences: resolvedRoots,
    canonicalArchiveSha256: resolvedProjection.canonicalArchiveSha256,
    objectIndexSha256: resolvedProjection.objectIndexSha256,
    expandedJsonlBytes: resolvedProjection.expandedJsonlBytes,
    objectCount: resolvedProjection.objectCount,
    recordCount: resolvedProjection.recordCount,
    dedupStatistics: resolvedProjection.dedupStatistics,
    resolution
  };
  const resolved = createResolvedEvidenceRecord({ resolvedEvidenceBody });
  const resolvedRootBytes = Buffer.byteLength(stableStringify(resolvedEvidenceBody), 'utf8');
  const resolvedArchive = await writeEvidenceArchive({
    objects: core.store.objectMap(),
    rootReferences: resolvedRoots,
    rootProjection: resolvedRootProjection,
    rootBytes: resolvedRootBytes,
    compressorIdentity: core.compressorIdentity
  });
  const resolvedCandidate = createResolvedCandidateBody({
    ...resolved,
    coreCandidateChecksum: core.coreCandidate.coreCandidateChecksum,
    compressedArchiveSha256: resolvedArchive.compressedArchiveSha256,
    compressedBytes: resolvedArchive.compressedBytes,
    compressorIdentity: core.compressorIdentity
  });
  const decision = { option: 'unresolved', strategy: 'unresolved', blocked: true };
  const decisionObject = core.store.putObject('decision-evidence', decision);
  const acceptedRoots = sortedReferences([...resolvedRoots, { kind: decisionObject.kind, hash: decisionObject.hash }]);
  const acceptedRootProjection = resolutionKind === 'no-host'
    ? acceptedNoHostProjection(acceptedRoots, core.rootReferences, resolvedRoots)
    : acceptedSelectedProjection(acceptedRoots, core.rootReferences, resolvedRoots);
  const acceptedProjection = core.store.project(acceptedRoots, acceptedRootProjection);
  const acceptedEvidence = createAcceptedEvidenceBody({
    ...resolved,
    decision,
    decisionChecksum: canonicalSha256(decision),
    rootReferences: acceptedRoots
  });
  const rootBytes = Buffer.byteLength(stableStringify(acceptedEvidence), 'utf8');
  const selectedPreview = await writeSelectedPreviewArchive({
    outputPath: outputDirectory ? path.join(outputDirectory, `${archiveStem}.accepted.jsonl.gz`) : undefined,
    objects: core.store.objectMap(),
    rootReferences: acceptedRoots,
    rootProjection: acceptedRootProjection,
    archiveRootBytes: rootBytes,
    compressorIdentity: core.compressorIdentity,
    createPreviewRoot: (archive) => createAcceptedRootBody({
      acceptedEvidenceBody: (() => {
        const { acceptedEvidenceChecksum, ...body } = acceptedEvidence;
        return body;
      })(),
      acceptedEvidenceChecksum: acceptedEvidence.acceptedEvidenceChecksum,
      compressedArchiveSha256: archive.compressedArchiveSha256,
      compressedBytes: archive.compressedBytes,
      compressorIdentity: core.compressorIdentity
    })
  });
  const acceptedArchive = selectedPreview.archive;
  const acceptedRoot = selectedPreview.previewRoot;
  const utilization = selectedPreview.utilization;
  let replayedArchive = false;
  let rawEvidenceReplayed = false;
  if (outputDirectory) {
    const replayed = await readEvidenceArchive(path.join(outputDirectory, `${archiveStem}.accepted.jsonl.gz`), {
      compressedArchiveSha256: acceptedArchive.compressedArchiveSha256,
      canonicalArchiveSha256: acceptedArchive.canonicalArchiveSha256,
      objectIndexSha256: acceptedArchive.objectIndexSha256,
      expectedExpandedJsonlBytes: acceptedArchive.expandedJsonlBytes,
      expectedRecordCount: acceptedArchive.recordCount,
      rootProjection: acceptedRootProjection
    });
    if (replayed.canonicalArchiveSha256 !== acceptedArchive.canonicalArchiveSha256) fail(`${name} persisted archive did not replay`);
    const parentReference = reference?.rootReference ?? core.ci.rootReference;
    const persistedParent = replayed.objects.get(parentReference.hash);
    if (!persistedParent || persistedParent.kind !== parentReference.kind) fail(`${name} replay is missing its persisted evaluator parent`);
    const persistedEvaluation = evaluatePerformanceExperiment(persistedParent.body.evaluatorInput, policy);
    if (persistedEvaluation.checksum !== persistedParent.body.evaluatorChecksum || persistedEvaluation.publicationEligible !== false) {
      fail(`${name} persisted raw evaluator evidence did not replay identically`);
    }
    if (reference?.allocationEvidenceClass === 'synthetic-capacity-only') {
      const persistedCoverage = persistedParent.body.evaluatorInput.allocationEvidence.syntheticCoverage;
      if (stableStringify(persistedCoverage) !== stableStringify(reference.evaluatorInput.allocationEvidence.syntheticCoverage)) {
        fail(`${name} persisted capacity-only coverage did not replay byte-for-byte`);
      }
    }
    replayedArchive = true;
    rawEvidenceReplayed = true;
  }
  const instrumentedCallbackCohorts = reference?.instrumentedCallbackCohorts ?? core.ci.instrumentedCallbackCohorts;
  if (instrumentedCallbackCohorts.length === 0 || instrumentedCallbackCohorts.some((cohort) => cohort.callbackCount !== effectiveCallbacksPerRun)) {
    fail(`${name} does not account for the declared callback cohort on every instrumented run`);
  }
  const logicalCallbackCohorts = [...core.ci.logicalCallbackCohorts, ...(reference?.logicalCallbackCohorts ?? [])]
    .sort((left, right) => left.runId.localeCompare(right.runId));
  const runBodyCount = core.ci.runBodies + (reference?.runBodies ?? 0);
  const logicalCallbackCount = logicalCallbackCohorts.reduce((total, cohort) => total + cohort.callbackCount, 0);
  if (logicalCallbackCohorts.length !== runBodyCount || logicalCallbackCohorts.some((cohort) => cohort.callbackCount !== effectiveCallbacksPerRun) || logicalCallbackCount !== runBodyCount * effectiveCallbacksPerRun) {
    fail(`${name} logical callback cohorts do not match the declared run/frame cardinalities`);
  }
  const cpuWindowCoverage = [...core.ci.cpuWindowCoverage, ...(reference?.cpuWindowCoverage ?? [])]
    .sort((left, right) => left.runId.localeCompare(right.runId));
  if (cpuWindowCoverage.length !== runBodyCount || cpuWindowCoverage.some((coverage) => (
    coverage.firstReadStart !== coverage.windowStart
    || coverage.beforeTerminalReadEnd >= coverage.windowEnd
    || coverage.terminalReadStart < coverage.windowEnd
    || coverage.terminalReadEnd <= coverage.windowEnd
  ))) {
    fail(`${name} CPU evidence does not span every callback window through its first terminal sample`);
  }
  const attemptRepresentations = [core.ci.attemptRepresentation, ...(reference ? [reference.attemptRepresentation] : [])];
  if (attemptRepresentations.some((representation) => representation.sessions.length !== representation.pairs.length)) {
    fail(`${name} capacity attempt representations do not cover every pair`);
  }
  return {
    name,
    resolutionKind,
    resolution,
    allocationState: reference?.evaluation.allocationEvidence?.state ?? null,
    allocationEvidenceClass: reference?.allocationEvidenceClass ?? null,
    capacityRepresentation: reference?.allocationEvidenceClass === 'synthetic-capacity-only'
      ? policy.policy.capacityFixturePolicy.encoding
      : null,
    callbackCohortRepresentation: policy.policy.capacityFixturePolicy.callbackCohortEncoding,
    publicationEligible: false,
    runBodies: runBodyCount,
    windowCallbacks: logicalCallbackCount,
    utilization,
    coreCandidateChecksum: core.coreCandidate.coreCandidateChecksum,
    resolvedCandidateChecksum: resolvedCandidate.resolvedCandidateChecksum,
    evaluatorChecksum: reference?.evaluation.checksum ?? core.ci.evaluation.checksum,
    acceptedInstrumentedRunIds: reference?.acceptedInstrumentedRunIds ?? core.ci.acceptedInstrumentedRunIds,
    instrumentedCallbackCohorts,
    logicalCallbackCohorts,
    cpuWindowCoverage,
    attemptRepresentations,
    acceptedRootChecksum: acceptedRoot.acceptedRootChecksum,
    acceptedRootTransport: {
      compressedArchiveSha256: acceptedRoot.compressedArchiveSha256,
      compressedBytes: acceptedRoot.compressedBytes,
      compressorIdentity: acceptedRoot.compressorIdentity
    },
    rawEvidenceReplayed,
    archiveReplayed: replayedArchive,
    allocationShape: reference ? allocationShape : null,
    allocationSummary
  };
}

function expectedCoverageForCompactRun(coverage) {
  return coverage.map((entry) => entry.cardinality === 'per-frame' ? 1 : entry.cardinality);
}

function enumerateCompactRunVectors(coverage) {
  const expected = expectedCoverageForCompactRun(coverage);
  const vectors = [];
  const visit = (index, vector) => {
    if (index === expected.length) {
      const frameObservations = vector.reduce((total, observed, coverageIndex) => total + (coverage[coverageIndex].carrier === 'frame-request' ? observed : 0), 0);
      if (frameObservations > 0) vectors.push(vector);
      return;
    }
    for (let observed = 0; observed <= expected[index]; observed += 1) visit(index + 1, [...vector, observed]);
  };
  visit(0, []);
  return vectors;
}

function coverageVectorKey(vector) {
  return stableStringify(vector);
}

export function enumerateQualifiedIncompleteCoverageVectors({ runCount = 2, policy = loadBaselinePolicy() } = {}) {
  if (!Number.isSafeInteger(runCount) || runCount < 1 || runCount > 2) fail('qualified incomplete compact enumeration supports one or two runs');
  const coverage = policy.policy.allocationEvidencePolicy.webgpu.coverage.map((entry) => ({
    operationId: entry.operationId,
    sourceLocationId: entry.sourceLocationId,
    carrier: entry.carrier,
    lifecyclePhase: entry.lifecyclePhase ?? null,
    cardinality: entry.cardinality,
    byteSemantics: entry.byteSemantics
  }));
  if (coverage.length !== 6) fail('qualified incomplete envelope requires all six policy-derived coverage entries');
  const perRunVectors = enumerateCompactRunVectors(coverage);
  const vectors = [];
  const visit = (runIndex, vector) => {
    if (runIndex === runCount) {
      if (vector.some((runVector) => runVector.some((observed, coverageIndex) => observed !== expectedCoverageForCompactRun(coverage)[coverageIndex]))) {
        vectors.push(vector);
      }
      return;
    }
    for (const perRun of perRunVectors) visit(runIndex + 1, [...vector, perRun]);
  };
  visit(0, []);
  return { coverage, perRunVectors, vectors };
}

const qualifiedIncompleteEnvelopeCache = new Map();

function mergeObjectMaps(...maps) {
  const merged = new Map();
  for (const map of maps) {
    for (const [hash, entry] of map.entries()) {
      const existing = merged.get(hash);
      if (existing && stableStringify(existing) !== stableStringify(entry)) fail(`capacity object-map collision for ${hash}`);
      merged.set(hash, entry);
    }
  }
  return merged;
}

function createCompactOracleBase(policy, runCount) {
  const store = createEvidenceStore();
  const fixtureProvenance = syntheticFixtureProvenance('qualified-incomplete-oracle');
  const singletonReferences = ['source', 'events', 'lifecycle', 'behavior'].map((kind) => {
    const object = store.putObject('singleton-report', { evidenceId: kind, scenario: 'qualified-incomplete-oracle', schemaVersion: 1, fixtureProvenance });
    return { kind: object.kind, hash: object.hash };
  });
  const packageObject = store.putObject('package-report', { evidenceId: 'package:fixture:release', scenario: 'qualified-incomplete-oracle', schemaVersion: 1, fixtureProvenance });
  const ciChild = store.putObject('experiment-child-manifest', { fixtureProvenance, rawKindManifestReferences: [] });
  const ciParent = store.putObject('ci-experiment-parent', {
    childManifest: { kind: ciChild.kind, hash: ciChild.hash },
    fixtureProvenance,
    publicationEligible: false
  });
  const coreReferences = sortedReferences([...singletonReferences, { kind: packageObject.kind, hash: packageObject.hash }, { kind: ciParent.kind, hash: ciParent.hash }]);
  const projection = store.project(coreReferences, coreProjection(coreReferences));
  const coreEvidenceBody = {
    schemaVersion: 1,
    status: 'complete',
    programOriginSha: policy.policy.programOriginSha,
    analysisSha256: policy.policy.analysisSha256,
    sourceSha: policy.policy.programOriginSha,
    policyHashes: policy.sectionHashes,
    rootReferences: coreReferences,
    canonicalArchiveSha256: projection.canonicalArchiveSha256,
    objectIndexSha256: projection.objectIndexSha256,
    expandedJsonlBytes: projection.expandedJsonlBytes,
    objectCount: projection.objectCount,
    recordCount: projection.recordCount,
    dedupStatistics: projection.dedupStatistics,
    workflowProvenance: workflowProvenance()
  };
  const scenario = 'qualified-incomplete-oracle';
  const experimentId = `${scenario}-reference-comparison-webgpu-experiment`;
  const runIds = Array.from({ length: runCount * 2 }, (_, index) => `${scenario}-run-${index + 1}`);
  const ledger = createInstrumentationLedger({
    prefix: scenario,
    runIds,
    experimentId,
    backend: 'webgpu',
    callbacksPerRun: 1,
    policy
  });
  return {
    objects: store.objectMap(),
    coreReferences,
    coreRecord: createCoreEvidenceRecord({ coreEvidenceBody }),
    allocationTemplate: {
      scenario,
      experimentId,
      ledger,
      acceptedRuns: ledger.filter((entry) => entry.operationId === 'electron-harness-spawn' && entry.buildVariant === 'instrumented')
    }
  };
}

function materializeCompactQualifiedIncompleteVector(vector, base, policy) {
  const store = createEvidenceStore();
  const { scenario, experimentId, ledger, acceptedRuns } = base.allocationTemplate;
  const fixtureProvenance = syntheticFixtureProvenance(scenario);
  const allocationInput = createAllocationInput({
    acceptedRuns,
    ledger,
    experimentId,
    fixtureProvenance,
    allocationVector: vector,
    shape: 'compact-oracle',
    policy
  });
  const allocationEvidence = deriveAllocationEvidence(allocationInput, policy);
  if (allocationEvidence.state !== 'unavailable-incomplete-request-coverage') {
    fail('compact coverage oracle materialized a non-incomplete allocation state');
  }
  const runReferences = acceptedRuns.map((run) => {
    const object = store.putObject('run', {
      runId: run.runId,
      experimentId,
      backend: 'webgpu',
      frameSourceSequences: run.frameSourceSequences,
      allocationCoverage: allocationEvidence.observedCoverage.filter((entry) => entry.runId === run.runId)
    });
    return { kind: object.kind, hash: object.hash };
  });
  const chunk = store.putObject('raw-chunk', {
    rawKind: policy.policy.capacityFixturePolicy.encoding,
    syntheticCoverage: allocationInput.syntheticCoverage
  });
  const manifest = store.putObject('raw-kind-manifest', {
    rawKind: policy.policy.capacityFixturePolicy.encoding,
    chunkReferences: [{ kind: chunk.kind, hash: chunk.hash }]
  });
  const child = store.putObject('experiment-child-manifest', {
    runReferences: sortedReferences(runReferences),
    rawKindManifestReferences: [{ kind: manifest.kind, hash: manifest.hash }]
  });
  const parent = store.putObject('reference-experiment-parent', {
    childManifest: { kind: child.kind, hash: child.hash },
    experimentRole: 'reference-comparison',
    backend: 'webgpu',
    fixtureProvenance,
    allocationEvidence,
    publicationEligible: false
  });
  const referenceRoot = { kind: parent.kind, hash: parent.hash };
  const resolvedRoots = sortedReferences([...base.coreReferences, referenceRoot]);
  let objects = mergeObjectMaps(base.objects, store.objectMap());
  const resolvedProjection = projectEvidenceArchive(objects, resolvedRoots, selectedProjection(resolvedRoots, base.coreReferences));
  const resolvedRecord = createResolvedEvidenceRecord({
    resolvedEvidenceBody: {
      ...base.coreRecord,
      resolutionMode: 'selected-reference',
      status: 'complete',
      rootReferences: resolvedRoots,
      canonicalArchiveSha256: resolvedProjection.canonicalArchiveSha256,
      objectIndexSha256: resolvedProjection.objectIndexSha256,
      expandedJsonlBytes: resolvedProjection.expandedJsonlBytes,
      objectCount: resolvedProjection.objectCount,
      recordCount: resolvedProjection.recordCount,
      dedupStatistics: resolvedProjection.dedupStatistics,
      resolution: { mode: 'selected-reference', allocationState: allocationEvidence.state }
    }
  });
  const decision = { option: 'unresolved', strategy: 'unresolved', blocked: true };
  const decisionObject = store.putObject('decision-evidence', decision);
  const acceptedRoots = sortedReferences([...resolvedRoots, { kind: decisionObject.kind, hash: decisionObject.hash }]);
  objects = mergeObjectMaps(base.objects, store.objectMap());
  const acceptedProjection = projectEvidenceArchive(objects, acceptedRoots, acceptedSelectedProjection(acceptedRoots, base.coreReferences, resolvedRoots));
  const acceptedEvidence = createAcceptedEvidenceBody({
    ...resolvedRecord,
    decision,
    decisionChecksum: canonicalSha256(decision),
    rootReferences: acceptedRoots
  });
  // Preserve the semantic constructor check in the compact path without
  // inventing an archive hash, byte count, or compressor identity. Transport
  // root sizing is calculated only after a real production archive exists.
  if (!acceptedEvidence.acceptedEvidenceChecksum) fail('compact oracle did not construct accepted semantic evidence');
  return {
    maximumRecordBytes: acceptedProjection.maximumRecordBytes,
    expandedJsonlBytes: acceptedProjection.expandedJsonlBytes,
    objectCount: acceptedProjection.objectCount,
    recordCount: acceptedProjection.recordCount,
    evaluatorChecksum: canonicalSha256({ ledger, allocationEvidence })
  };
}

/**
 * @param {{ vector?: number[][], policy?: any }} [options]
 */
export function measureQualifiedIncompleteCompactVector({ vector, policy = loadBaselinePolicy() } = {}) {
  const coverage = policy.policy.allocationEvidencePolicy.webgpu.coverage;
  if (!Array.isArray(vector) || vector.length < 1 || vector.length > 2) {
    fail('compact coverage measurement requires one or two run vectors');
  }
  const expected = expectedCoverageForCompactRun(coverage);
  for (const runVector of vector) {
    if (!Array.isArray(runVector) || runVector.length !== expected.length
      || runVector.some((observed, index) => !Number.isSafeInteger(observed) || observed < 0 || observed > expected[index])) {
      fail('compact coverage measurement has an invalid run vector');
    }
  }
  const base = createCompactOracleBase(policy, vector.length);
  return materializeCompactQualifiedIncompleteVector(vector, base, policy);
}

function compactExpectedCardinality(entry) {
  return entry.cardinality === 'per-frame' ? 1 : entry.cardinality;
}

function completeCompactCoverageVector(coverage, runCount) {
  return Array.from({ length: runCount }, () => expectedCoverageForCompactRun(coverage));
}

function maxObservedMinMissingCompactVector(coverage, runCount) {
  const vector = completeCompactCoverageVector(coverage, runCount);
  const lastFrameOperationIndex = coverage.map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.carrier === 'frame-request')
    .at(-1)?.index;
  if (lastFrameOperationIndex === undefined) fail('qualified incomplete envelope requires a frame-request operation');
  vector.at(-1)[lastFrameOperationIndex] -= 1;
  return vector;
}

function maxMissingMinimalDeficitCompactVector(coverage, runCount) {
  return Array.from({ length: runCount }, () => coverage.map((entry) => {
    const expected = compactExpectedCardinality(entry);
    const requiredFrameAnchor = entry.carrier === 'frame-request' && entry.operationId === 'video-frame-image-bitmap-request';
    return requiredFrameAnchor ? expected : expected - 1;
  }));
}

function liftCompactObservedCardinality(observed, entry, callbacksPerRun) {
  const compactExpected = compactExpectedCardinality(entry);
  const fullExpected = entry.cardinality === 'per-frame' ? callbacksPerRun : entry.cardinality;
  if (!Number.isSafeInteger(observed) || observed < 0 || observed > compactExpected) fail('compact allocation coverage has an invalid observed cardinality');
  if (observed === compactExpected) return fullExpected;
  if (entry.cardinality === 'per-frame' && observed === compactExpected - 1) return fullExpected - 1;
  return observed;
}

function expandCompactCoverageVector(vector, runCount, coverage, callbacksPerRun = 1) {
  if (!Number.isSafeInteger(runCount) || runCount < 1) fail('expanded coverage vector runCount is invalid');
  if (vector.length === 0) fail('compact coverage vector must not be empty');
  if (!Array.isArray(coverage) || coverage.length === 0) fail('compact coverage expansion requires policy coverage');
  if (!Number.isSafeInteger(callbacksPerRun) || callbacksPerRun < 1) fail('expanded callback cardinality is invalid');
  vector.forEach((runVector, runIndex) => {
    if (!Array.isArray(runVector) || runVector.length !== coverage.length) fail(`compact coverage vector run ${runIndex} is incompatible with policy coverage`);
  });
  const leading = vector[0];
  const terminal = vector.at(-1);
  return Array.from({ length: runCount }, (_, index) => (index === runCount - 1 ? terminal : leading)
    .map((observed, coverageIndex) => liftCompactObservedCardinality(observed, coverage[coverageIndex], callbacksPerRun)));
}

function summarizeIncompleteAllocationEvidence(allocationEvidence) {
  const deficits = allocationEvidence.missingCoverage
    .map((entry) => entry.expectedCardinality - entry.observedCardinality)
    .sort((left, right) => left - right);
  return {
    missingTupleCount: allocationEvidence.missingCoverage.length,
    missingDeficits: [...new Set(deficits)],
    missingCoverage: allocationEvidence.missingCoverage.map((entry) => ({
      runId: entry.runId,
      operationId: entry.operationId,
      sourceLocationId: entry.sourceLocationId,
      expectedCardinality: entry.expectedCardinality,
      observedCardinality: entry.observedCardinality
    }))
  };
}

function assertQualifiedIncompleteEnvelopeSemantics({ allocationShape, allocationEvidence, acceptedInstrumentedRunIds, callbacksPerRun, policy }) {
  if (allocationEvidence.state !== 'unavailable-incomplete-request-coverage') {
    fail(`${allocationShape} did not produce qualified incomplete allocation evidence`);
  }
  const summary = summarizeIncompleteAllocationEvidence(allocationEvidence);
  if (allocationShape === 'max-observed-min-missing') {
    const terminalFrameOperation = policy.policy.allocationEvidencePolicy.webgpu.coverage
      .filter((entry) => entry.carrier === 'frame-request')
      .at(-1);
    const [missing] = summary.missingCoverage;
    if (summary.missingTupleCount !== 1 || summary.missingDeficits.length !== 1 || summary.missingDeficits[0] !== 1 || !missing || missing.operationId !== terminalFrameOperation.operationId || missing.expectedCardinality !== callbacksPerRun || missing.observedCardinality !== callbacksPerRun - 1) {
      fail('max-observed-min-missing did not retain exactly one full-size per-frame deficit');
    }
  }
  if (allocationShape === 'max-missing-minimal-deficit') {
    const expectedMissingTupleCount = acceptedInstrumentedRunIds.length * (policy.policy.allocationEvidencePolicy.webgpu.coverage.length - 1);
    const anchors = new Map(allocationEvidence.observedCoverage
      .filter((entry) => entry.operationId === 'video-frame-image-bitmap-request')
      .map((entry) => [entry.runId, entry.observedCardinality]));
    if (summary.missingTupleCount !== expectedMissingTupleCount || summary.missingDeficits.length !== 1 || summary.missingDeficits[0] !== 1 || anchors.size !== acceptedInstrumentedRunIds.length || [...anchors.values()].some((observed) => observed !== callbacksPerRun)) {
      fail('max-missing-minimal-deficit did not retain one full-size deficit per non-anchor tuple');
    }
  }
  return summary;
}

export function calculateQualifiedIncompleteEnvelope({ runCount = 2, policy = loadBaselinePolicy() } = {}) {
  const cacheKey = `${policy.policyHash}:${runCount}`;
  const cached = qualifiedIncompleteEnvelopeCache.get(cacheKey);
  if (cached) return cached;
  const enumeration = enumerateQualifiedIncompleteCoverageVectors({ runCount, policy });
  const base = createCompactOracleBase(policy, runCount);
  const evaluated = enumeration.vectors.map((vector) => ({
    vector,
    components: materializeCompactQualifiedIncompleteVector(vector, base, policy)
  }));
  const semanticComponentMaxima = Object.fromEntries(COMPACT_SEMANTIC_COMPONENTS.map((component) => {
    const maximum = Math.max(...evaluated.map((entry) => entry.components[component]));
    const representative = evaluated.filter((entry) => entry.components[component] === maximum)
      .sort((left, right) => coverageVectorKey(left.vector).localeCompare(coverageVectorKey(right.vector)))[0];
    return [component, { value: maximum, vector: representative.vector, vectorKey: coverageVectorKey(representative.vector) }];
  }));
  const shapesByVector = new Map();
  const requiredShapes = [
    { name: 'max-observed-min-missing', compactVector: maxObservedMinMissingCompactVector(enumeration.coverage, runCount) },
    { name: 'max-missing-minimal-deficit', compactVector: maxMissingMinimalDeficitCompactVector(enumeration.coverage, runCount) }
  ];
  for (const required of requiredShapes) {
    const compactVectorKey = coverageVectorKey(required.compactVector);
    shapesByVector.set(compactVectorKey, {
      name: required.name,
      compactVector: required.compactVector,
      compactVectorKey,
      maximumComponents: []
    });
  }
  for (const [component, maximum] of Object.entries(semanticComponentMaxima)) {
    const shape = shapesByVector.get(maximum.vectorKey) ?? {
      name: `additional-component-maximum-${shapesByVector.size + 1}`,
      compactVector: maximum.vector,
      compactVectorKey: maximum.vectorKey,
      maximumComponents: []
    };
    shape.maximumComponents.push(component);
    shapesByVector.set(maximum.vectorKey, shape);
  }
  const materializedSemanticComponentMaxima = Object.fromEntries(COMPACT_SEMANTIC_COMPONENTS
    .map((component) => [component, Math.max(...evaluated.map((entry) => entry.components[component]))]));
  for (const component of COMPACT_SEMANTIC_COMPONENTS) {
    if (materializedSemanticComponentMaxima[component] !== semanticComponentMaxima[component].value) {
      fail(`compact oracle ${component} maximum does not equal its materialized production projection`);
    }
  }
  const result = {
    coverage: enumeration.coverage,
    expectedCoverage: deriveAllocationExpectedCoverage({
      acceptedRunIds: Array.from({ length: runCount }, (_, index) => `envelope-run-${index + 1}`),
      frameCountByRun: Object.fromEntries(Array.from({ length: runCount }, (_, index) => [`envelope-run-${index + 1}`, 1]))
    }, policy),
    compactVectorCount: enumeration.vectors.length,
    compactPerRunVectorCount: enumeration.perRunVectors.length,
    evaluatedCompactVectorCount: evaluated.length,
    semanticComponentMaxima,
    materializedSemanticComponentMaxima,
    shapes: [...shapesByVector.values()].map((shape) => ({
      ...shape,
      allocationVector: expandCompactCoverageVector(shape.compactVector, runCount, enumeration.coverage)
    }))
  };
  qualifiedIncompleteEnvelopeCache.set(cacheKey, result);
  return result;
}

export async function runHeadroomCapacity({
  policy = loadBaselinePolicy(),
  qualifiedRunBodies = 162,
  hardwareUnavailableRunBodies = 81,
  callbacksPerRun = 2048,
  outputDirectory = undefined
} = {}) {
  for (const [label, value] of Object.entries({ qualifiedRunBodies, hardwareUnavailableRunBodies, callbacksPerRun })) {
    if (!Number.isSafeInteger(value) || value < 1) fail(`${label} must be a positive safe integer`);
  }
  if (outputDirectory !== undefined) resolveCapacityOutputRoot(outputDirectory);
  const scenarios = [];
  const materializedProductionScenarios = [];
  const qualifiedMeasured = await constructScenario('qualified-measured-request-proxy', 'qualified', {
    runBodies: qualifiedRunBodies,
    callbacksPerRun,
    allocationShape: 'complete',
    outputDirectory,
    policy
  });
  scenarios.push(qualifiedMeasured);
  materializedProductionScenarios.push(qualifiedMeasured);
  const evenRunBodies = (count) => Math.max(2, count + (count % 2));
  const coreRunBodies = evenRunBodies(Math.min(18, Math.max(2, qualifiedRunBodies - 2)));
  const referenceRunBodies = evenRunBodies(Math.max(2, qualifiedRunBodies - coreRunBodies));
  const envelope = calculateQualifiedIncompleteEnvelope({ runCount: 2, policy });
  const incompleteCases = [];
  for (const shape of envelope.shapes) {
    incompleteCases.push(await constructScenario('qualified-incomplete-request-coverage', 'qualified', {
      runBodies: qualifiedRunBodies,
      callbacksPerRun,
      allocationShape: shape.name,
      allocationVector: expandCompactCoverageVector(shape.compactVector, referenceRunBodies / 2, envelope.coverage, callbacksPerRun),
      outputDirectory,
      archiveStem: `qualified-incomplete-request-coverage.${shape.name}`,
      policy
    }));
  }
  materializedProductionScenarios.push(...incompleteCases);
  const oracleProvenSemanticComponentMaxima = Object.fromEntries(Object.entries(envelope.semanticComponentMaxima)
    .map(([component, maximum]) => [component, maximum.value]));
  if (stableStringify(oracleProvenSemanticComponentMaxima) !== stableStringify(envelope.materializedSemanticComponentMaxima)) {
    fail('qualified-incomplete materialized oracle maxima do not equal the exhaustive proven maxima');
  }
  scenarios.push({
    ...incompleteCases[0],
    semanticEnvelopeCases: incompleteCases.map((scenario) => ({
      shape: scenario.allocationShape,
      maximumComponents: envelope.shapes.find((shape) => shape.name === scenario.allocationShape).maximumComponents,
      acceptedRootChecksum: scenario.acceptedRootChecksum,
      rawEvidenceReplayed: scenario.rawEvidenceReplayed,
      components: scenario.utilization.raw,
      utilization: scenario.utilization,
      allocationSummary: scenario.allocationSummary
    })),
    materializedSemanticComponentMaxima: oracleProvenSemanticComponentMaxima
  });
  for (const [name, branch] of [
    ['hardware-unavailable-webgpu-api', 'webgpu-api-unavailable'],
    ['hardware-unavailable-webgpu-adapter', 'webgpu-adapter-unavailable'],
    ['hardware-unavailable-transfer-api', 'transfer-api-unavailable'],
    ['hardware-unavailable-transfer-method', 'transfer-method-unavailable'],
    ['hardware-unavailable-transfer-allowlisted', 'transfer-allowlisted-not-supported'],
    ['hardware-unavailable-worker-fallback', 'worker-fallback-adapter']
  ]) {
    const scenario = await constructScenario(name, 'hardware-unavailable', {
      runBodies: hardwareUnavailableRunBodies,
      callbacksPerRun,
      unavailabilityBranch: branch,
      outputDirectory,
      policy
    });
    scenarios.push(scenario);
    materializedProductionScenarios.push(scenario);
  }
  const noHost = await constructScenario('no-host', 'no-host', {
    callbacksPerRun,
    outputDirectory,
    policy
  });
  scenarios.push(noHost);
  materializedProductionScenarios.push(noHost);
  const observedProductionComponentMaxima = collectObservedProductionComponentMaxima(materializedProductionScenarios);
  return {
    scenarios,
    envelope,
    observedProductionComponentMaxima,
    qualifiedMaximums: { runBodies: scenarios[0].runBodies, windowCallbacks: scenarios[0].windowCallbacks },
    compressionClaim: 'observed-per-scenario-not-universal'
  };
}

function makeRows(count) {
  return Array.from({ length: count }, (_, index) => ({ runId: 'run-1', ordinal: index }));
}

function assertCodecFixtureLimits(limits) {
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)) fail('codec fixture limits must be an object');
  const expectedKeys = Object.keys(EVIDENCE_HARD_LIMITS);
  if (Object.keys(limits).sort().join('\u0000') !== expectedKeys.sort().join('\u0000')) fail('codec fixture limits have missing or unknown fields');
  for (const [key, hardLimit] of Object.entries(EVIDENCE_HARD_LIMITS)) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > hardLimit) fail('codec fixture limit ' + key + ' is invalid');
  }
  if (limits.maxTotalRecords !== limits.maxIndexedObjects + 1) {
    fail('codec fixture total-record and indexed-object limits must remain coupled');
  }
}

function assertExactHardLimitBoundaries(limits) {
  const atCap = {
    rootBytes: limits.maxRootBytes,
    compressedBytes: limits.maxCompressedBytes,
    expandedJsonlBytes: limits.maxExpandedJsonlBytes,
    maximumRecordBytes: limits.maxRecordBytes,
    objectCount: limits.maxIndexedObjects,
    recordCount: limits.maxTotalRecords
  };
  const accepted = measureEvidenceArchiveUtilization(atCap, { limits });
  if (!accepted.hardLimitPassed) fail('exact hard-limit boundary was rejected: ' + accepted.hardFailures.join(', '));
  const capPlusOneRejected = {};
  for (const key of Object.keys(atCap)) {
    const overflowValues = { ...atCap, [key]: atCap[key] + 1 };
    if (key === 'objectCount') overflowValues.recordCount += 1;
    if (key === 'recordCount') overflowValues.objectCount += 1;
    const overflow = measureEvidenceArchiveUtilization(overflowValues, { limits });
    if (overflow.hardLimitPassed || !overflow.hardFailures.includes(key)) fail(key + ' cap-plus-one was accepted');
    capPlusOneRejected[key] = true;
  }
  return { atCap, capPlusOneRejected };
}

const CODEC_FIXTURE_ALPHABET = Buffer.from('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', 'ascii');

function codecFixturePayload(length, { entropy = false, ordinal = 0, salt = 0 } = {}) {
  if (!Number.isSafeInteger(length) || length < 0) fail('codec fixture payload length is invalid');
  if (!Number.isSafeInteger(salt) || salt < 0) fail('codec fixture payload salt is invalid');
  if (!entropy) return 'x'.repeat(length);
  const bytes = Buffer.allocUnsafe(length);
  let state = (0x9e3779b9 ^ Math.imul(ordinal + 1, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35)) >>> 0;
  for (let index = 0; index < bytes.length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    bytes[index] = CODEC_FIXTURE_ALPHABET[(state >>> 26) & 0x3f];
  }
  return bytes.toString('ascii');
}

/**
 * Build fixture objects only through the production evidence store. The returned
 * projection is therefore the exact graph, canonical JSONL, dedup accounting, and
 * index construction that a publication would use.
 */
function createProductionCodecFixture({ payloadLengths = [], emptyManifestCount = 0, entropyPayloads = false, entropyTailSalt = 0 } = {}) {
  if (!Array.isArray(payloadLengths) || !payloadLengths.every((length) => Number.isSafeInteger(length) && length >= 0)) {
    fail('codec fixture payload lengths must be nonnegative safe integers');
  }
  if (!Number.isSafeInteger(emptyManifestCount) || emptyManifestCount < 0) {
    fail('codec fixture empty manifest count is invalid');
  }
  const store = createEvidenceStore();
  const chunks = payloadLengths.map((length, index) => {
    const object = store.putObject('raw-chunk', {
      fixture: 'codec-boundary',
      ordinal: index + 1,
      payload: codecFixturePayload(length, {
        entropy: entropyPayloads,
        ordinal: index,
        salt: index === payloadLengths.length - 1 ? entropyTailSalt : 0
      })
    });
    return { kind: object.kind, hash: object.hash };
  });
  const manifests = [];
  if (chunks.length > 0) {
    const object = store.putObject('raw-kind-manifest', { chunkReferences: sortedReferences(chunks) });
    manifests.push({ kind: object.kind, hash: object.hash });
  }
  for (let index = 0; index < emptyManifestCount; index += 1) {
    const object = store.putObject('raw-kind-manifest', { boundaryOrdinal: index + 1 });
    manifests.push({ kind: object.kind, hash: object.hash });
  }
  const child = store.putObject('experiment-child-manifest', {
    rawKindManifestReferences: sortedReferences(manifests)
  });
  const parent = store.putObject('ci-experiment-parent', {
    childManifest: { kind: child.kind, hash: child.hash },
    fixture: 'codec-boundary'
  });
  const singletonReferences = ['source', 'events', 'lifecycle', 'behavior'].map((evidenceId) => {
    const object = store.putObject('singleton-report', { evidenceId, fixture: 'codec-boundary' });
    return { kind: object.kind, hash: object.hash };
  });
  const packageReport = store.putObject('package-report', { evidenceId: 'package:codec-boundary:release' });
  const rootReferences = sortedReferences([
    ...singletonReferences,
    { kind: packageReport.kind, hash: packageReport.hash },
    { kind: parent.kind, hash: parent.hash }
  ]);
  const rootProjection = coreProjection(rootReferences);
  return {
    store,
    rootReferences,
    rootProjection,
    projection: store.project(rootReferences, rootProjection)
  };
}

function fixtureArchiveInput(graph, { rootBytes, compressorIdentity, limits }) {
  return {
    objects: graph.store.objectMap(),
    rootReferences: graph.rootReferences,
    rootProjection: graph.rootProjection,
    rootBytes,
    compressorIdentity,
    limits
  };
}

function createRootSerializationFixture(targetBytes) {
  const base = { schemaVersion: 1, payload: '' };
  const fixedBytes = Buffer.byteLength(stableStringify(base), 'utf8');
  if (!Number.isSafeInteger(targetBytes) || targetBytes < fixedBytes) {
    fail('root-byte fixture cannot materialize the requested boundary');
  }
  const root = { schemaVersion: 1, payload: 'r'.repeat(targetBytes - fixedBytes) };
  if (Buffer.byteLength(stableStringify(root), 'utf8') !== targetBytes) {
    fail('root-byte fixture did not serialize to the requested boundary');
  }
  return root;
}

function adjustPayloadLengths(payloadLengths, adjustment, maximumPayloadLength) {
  const adjusted = [...payloadLengths];
  let remaining = adjustment;
  for (let index = adjusted.length - 1; index >= 0 && remaining !== 0; index -= 1) {
    const available = remaining > 0 ? maximumPayloadLength - adjusted[index] : adjusted[index];
    const applied = remaining > 0 ? Math.min(available, remaining) : -Math.min(available, -remaining);
    adjusted[index] += applied;
    remaining -= applied;
  }
  if (remaining !== 0 || adjusted.some((length) => !Number.isSafeInteger(length) || length < 0 || length > maximumPayloadLength)) {
    fail('codec fixture payload cannot be adjusted to the requested boundary');
  }
  return adjusted;
}

function distributePayload(total, count, maximumPayloadLength) {
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(maximumPayloadLength) || maximumPayloadLength < 1) {
    fail('codec fixture payload distribution is invalid');
  }
  const payloads = Array.from({ length: count }, () => 0);
  let remaining = total;
  for (let index = 0; index < payloads.length; index += 1) {
    const length = Math.min(maximumPayloadLength, remaining);
    payloads[index] = length;
    remaining -= length;
  }
  if (remaining !== 0) fail('codec fixture payload distribution exceeds the per-record boundary');
  return payloads;
}

function tuneFixtureProjection({ target, metric, payloadLengths, maximumPayloadLength }) {
  let currentPayloadLengths = [...payloadLengths];
  const seen = new Set();
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const signature = currentPayloadLengths.join(',');
    if (seen.has(signature)) break;
    seen.add(signature);
    const graph = createProductionCodecFixture({ payloadLengths: currentPayloadLengths });
    const actual = graph.projection[metric];
    if (actual === target) return graph;
    currentPayloadLengths = adjustPayloadLengths(currentPayloadLengths, target - actual, maximumPayloadLength);
  }
  fail('codec fixture could not tune ' + metric + ' to its exact cap');
}

function createPerRecordBoundaryFixture(target) {
  const baseline = createProductionCodecFixture({ payloadLengths: [0] });
  if (target < baseline.projection.maximumRecordBytes) {
    fail('per-record boundary target is below the smallest production fixture record');
  }
  return tuneFixtureProjection({
    target,
    metric: 'maximumRecordBytes',
    payloadLengths: [Math.max(0, target - baseline.projection.maximumRecordBytes)],
    maximumPayloadLength: target
  });
}

function createExpandedBoundaryFixture(target, limits) {
  const maximumPayloadLength = limits.maxRecordBytes - 2048;
  if (maximumPayloadLength < 1) fail('codec fixture per-record cap is too small for expanded JSONL materialization');
  let chunkCount = 1;
  while (chunkCount <= limits.maxIndexedObjects - 8) {
    const empty = createProductionCodecFixture({ payloadLengths: Array.from({ length: chunkCount }, () => 0) });
    const payloadBytes = target - empty.projection.expandedJsonlBytes;
    if (payloadBytes >= 0 && payloadBytes <= chunkCount * maximumPayloadLength) {
      const graph = tuneFixtureProjection({
        target,
        metric: 'expandedJsonlBytes',
        payloadLengths: distributePayload(payloadBytes, chunkCount, maximumPayloadLength),
        maximumPayloadLength
      });
      if (graph.projection.maximumRecordBytes <= limits.maxRecordBytes) return graph;
    }
    chunkCount += 1;
  }
  fail('codec fixture expanded JSONL materialization exceeds the object boundary');
}

async function createCompressedBoundaryFixture({ target, limits, compressorIdentity }) {
  const maximumPayloadLength = limits.maxRecordBytes - 2048;
  if (maximumPayloadLength < 1) fail('codec fixture per-record cap is too small for compressed materialization');
  const encodedCandidates = new Set();
  let best = null;
  let attemptedCandidates = 0;
  const encodeCandidate = async (payloadLengths, entropyTailSalt = 0) => {
    const signature = `${entropyTailSalt}:${payloadLengths.join(',')}`;
    if (encodedCandidates.has(signature)) return null;
    encodedCandidates.add(signature);
    const graph = createProductionCodecFixture({ payloadLengths, entropyPayloads: true, entropyTailSalt });
    if (graph.projection.maximumRecordBytes > limits.maxRecordBytes) {
      fail('compressed fixture exceeded the per-record hard limit before encoding');
    }
    const archive = await encodeEvidenceArchive(fixtureArchiveInput(graph, {
      rootBytes: 1,
      compressorIdentity,
      limits
    }));
    attemptedCandidates += 1;
    const candidate = { graph, archive, payloadLengths: [...payloadLengths], entropyTailSalt };
    if (!best || Math.abs(target - archive.compressedBytes) < Math.abs(target - best.archive.compressedBytes)) {
      best = candidate;
    }
    return candidate;
  };

  const payloadTotal = Math.max(1, Math.ceil(target / 0.74));
  const chunkCount = Math.max(1, Math.ceil(payloadTotal / maximumPayloadLength));
  let payloadLengths = distributePayload(payloadTotal, chunkCount, maximumPayloadLength);
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const candidate = await encodeCandidate(payloadLengths);
    if (!candidate) break;
    if (candidate.archive.compressedBytes === target) return candidate;
    const ratio = candidate.archive.compressedBytes / Math.max(1, payloadLengths.reduce((total, length) => total + length, 0));
    let adjustment = Math.round((target - candidate.archive.compressedBytes) / Math.max(ratio, 0.1));
    if (adjustment === 0) adjustment = target > candidate.archive.compressedBytes ? 1 : -1;
    try {
      payloadLengths = adjustPayloadLengths(payloadLengths, adjustment, maximumPayloadLength);
    } catch {
      break;
    }
  }
  if (!best) fail('compressed fixture did not produce an initial production candidate');

  const neighborhood = best.payloadLengths;
  for (let offset = 1; offset <= 192; offset += 1) {
    for (const signedOffset of [offset, -offset]) {
      let candidatePayloadLengths;
      try {
        candidatePayloadLengths = adjustPayloadLengths(neighborhood, signedOffset, maximumPayloadLength);
      } catch {
        continue;
      }
      const candidate = await encodeCandidate(candidatePayloadLengths);
      if (candidate?.archive.compressedBytes === target) return candidate;
    }
  }

  for (let entropyTailSalt = 1; entropyTailSalt <= 64; entropyTailSalt += 1) {
    const candidate = await encodeCandidate(neighborhood, entropyTailSalt);
    if (candidate?.archive.compressedBytes === target) return candidate;
  }

  const tailIndex = neighborhood.length - 1;
  const donorIndex = neighborhood.findLastIndex((length, index) => index < tailIndex && length > 0);
  if (donorIndex >= 0) {
    for (let transfer = 1; transfer <= 96; transfer += 1) {
      if (neighborhood[donorIndex] < transfer || neighborhood[tailIndex] + transfer > maximumPayloadLength) break;
      const candidatePayloadLengths = [...neighborhood];
      candidatePayloadLengths[donorIndex] -= transfer;
      candidatePayloadLengths[tailIndex] += transfer;
      for (let entropyTailSalt = 0; entropyTailSalt <= 8; entropyTailSalt += 1) {
        const candidate = await encodeCandidate(candidatePayloadLengths, entropyTailSalt);
        if (candidate?.archive.compressedBytes === target) return candidate;
      }
    }
  }
  fail('codec fixture could not tune compressed gzip bytes to its exact cap through the production encoder: ' + stableStringify({
    target,
    attemptedCandidates,
    best: {
      compressedBytes: best.archive.compressedBytes,
      payloadLengths: best.payloadLengths,
      entropyTailSalt: best.entropyTailSalt
    }
  }));
}

async function replayProductionFixture({ graph, archive, inputPath, limits }) {
  const replayed = await readEvidenceArchive(inputPath, {
    compressedArchiveSha256: archive.compressedArchiveSha256,
    canonicalArchiveSha256: archive.canonicalArchiveSha256,
    objectIndexSha256: archive.objectIndexSha256,
    expectedExpandedJsonlBytes: graph.projection.expandedJsonlBytes,
    expectedRecordCount: graph.projection.recordCount,
    rootProjection: graph.rootProjection,
    limits
  });
  if (replayed.compressedBytes !== archive.compressedBytes || replayed.objectCount !== graph.projection.objectCount || replayed.recordCount !== graph.projection.recordCount) {
    fail('production codec fixture at-cap replay did not preserve canonical archive identity');
  }
  return replayed;
}

async function writeProductionFixture({ graph, rootBytes, compressorIdentity, limits, outputPath }) {
  const archive = await writeEvidenceArchive({
    outputPath,
    ...fixtureArchiveInput(graph, { rootBytes, compressorIdentity, limits })
  });
  return { archive, outputPath };
}

async function assertProductionFixtureRejected({ label, graph, rootBytes, compressorIdentity, limits, outputPath, pattern }) {
  let writerRejected = false;
  try {
    await writeEvidenceArchive({
      outputPath,
      ...fixtureArchiveInput(graph, { rootBytes, compressorIdentity, limits })
    });
  } catch {
    writerRejected = true;
  }
  if (!writerRejected) fail(label + ' cap-plus-one fixture was accepted by the publication writer');
  if (fs.existsSync(outputPath)) fail(label + ' cap-plus-one writer left a publication artifact behind');
  const archive = await encodeEvidenceArchive(fixtureArchiveInput(graph, {
    rootBytes,
    compressorIdentity,
    limits
  }));
  fs.writeFileSync(outputPath, archive.gzip, { flag: 'wx', mode: 0o600 });
  try {
    await readEvidenceArchive(outputPath, { rootProjection: graph.rootProjection, limits });
  } catch (error) {
    if (pattern.test(error.message)) return archive;
    fail(label + ' cap-plus-one fixture failed for an unexpected replay reason: ' + error.message);
  }
  fail(label + ' cap-plus-one fixture was accepted by the decoder');
}

async function assertRootBoundary({ graph, targetBytes, compressorIdentity, limits, outputPath }) {
  const root = createRootSerializationFixture(targetBytes);
  const rootBytes = Buffer.byteLength(stableStringify(root), 'utf8');
  const fixture = await writeProductionFixture({
    graph,
    rootBytes,
    compressorIdentity,
    limits,
    outputPath
  });
  if (rootBytes !== targetBytes) fail('root-byte fixture did not materialize the exact cap');
  return { rootBytes, archive: fixture.archive, outputPath };
}

async function assertRootOverflowRejected({ graph, targetBytes, compressorIdentity, limits, outputPath }) {
  const root = createRootSerializationFixture(targetBytes);
  let rejected = false;
  try {
    await writeEvidenceArchive({
      outputPath,
      ...fixtureArchiveInput(graph, {
        rootBytes: Buffer.byteLength(stableStringify(root), 'utf8'),
        compressorIdentity,
        limits
      })
    });
  } catch {
    rejected = true;
  }
  if (!rejected) fail('root-byte cap-plus-one fixture was accepted');
  if (fs.existsSync(outputPath)) fail('root-byte cap-plus-one writer left a publication artifact behind');
  return true;
}

export async function runCodecBoundaries({
  objectCount = EVIDENCE_HARD_LIMITS.maxIndexedObjects,
  limits = EVIDENCE_HARD_LIMITS,
  outputDirectory = undefined
} = {}) {
  assertCodecFixtureLimits(limits);
  if (limits.maxIndexedObjects < 9) fail('codec fixture object limit must accommodate the smallest typed raw-kind graph');
  const exactHardLimitBoundaries = assertExactHardLimitBoundaries(limits);
  const policy = loadBaselinePolicy();
  const compressorIdentity = await createCompressorIdentity({
    compressorProbePolicyHash: policy.sectionHashes.performanceEvidenceChunkPolicy
  });
  encodePerformanceEvidence('cpu-sample', makeRows(policy.policy.performanceEvidenceChunkPolicy.maximumRowsPerRunAndKind), policy);
  let rawOverflowRejected = false;
  try {
    encodePerformanceEvidence('cpu-sample', makeRows(policy.policy.performanceEvidenceChunkPolicy.maximumRowsPerRunAndKind + 1), policy);
  } catch {
    rawOverflowRejected = true;
  }
  if (!rawOverflowRejected) fail('raw-kind cap-plus-one was accepted');
  if (!Number.isSafeInteger(objectCount) || objectCount < 7 || objectCount > limits.maxIndexedObjects) {
    fail('objectCount must fit the requested closed core projection limit');
  }
  const ownsWorkspace = outputDirectory === undefined;
  const workspace = ownsWorkspace
    ? createCapacityWorkspace(CAPACITY_OUTPUT_ROOT)
    : resolveCapacityOutputRoot(outputDirectory);
  if (!fs.existsSync(workspace)) fs.mkdirSync(workspace, { recursive: true, mode: 0o700 });
  try {
    const rootGraph = createProductionCodecFixture();
    const rootAtCap = await assertRootBoundary({
      graph: rootGraph,
      targetBytes: limits.maxRootBytes,
      compressorIdentity,
      limits,
      outputPath: path.join(workspace, 'codec-root-at-cap.jsonl.gz')
    });
    await replayProductionFixture({
      graph: rootGraph,
      archive: rootAtCap.archive,
      inputPath: rootAtCap.outputPath,
      limits
    });
    const rootOverflowRejected = await assertRootOverflowRejected({
      graph: rootGraph,
      targetBytes: limits.maxRootBytes + 1,
      compressorIdentity,
      limits,
      outputPath: path.join(workspace, 'codec-root-cap-plus-one.jsonl.gz')
    });

    const compressedAtCap = await createCompressedBoundaryFixture({
      target: limits.maxCompressedBytes,
      limits,
      compressorIdentity
    });
    const compressedAtCapPath = path.join(workspace, 'codec-compressed-at-cap.jsonl.gz');
    const compressedAtCapWritten = await writeProductionFixture({
      graph: compressedAtCap.graph,
      rootBytes: 1,
      compressorIdentity,
      limits,
      outputPath: compressedAtCapPath
    });
    if (compressedAtCapWritten.archive.compressedBytes !== limits.maxCompressedBytes) {
      fail('compressed fixture did not materialize the exact cap');
    }
    await replayProductionFixture({ graph: compressedAtCap.graph, archive: compressedAtCapWritten.archive, inputPath: compressedAtCapPath, limits });
    const compressedCapPlusOne = await createCompressedBoundaryFixture({
      target: limits.maxCompressedBytes + 1,
      limits,
      compressorIdentity
    });
    const compressedOverflowArchive = await assertProductionFixtureRejected({
      label: 'compressed',
      graph: compressedCapPlusOne.graph,
      rootBytes: 1,
      compressorIdentity,
      limits,
      outputPath: path.join(workspace, 'codec-compressed-cap-plus-one.jsonl.gz'),
      pattern: /compressed archive exceeds its hard limit/
    });

    const expandedAtCapGraph = createExpandedBoundaryFixture(limits.maxExpandedJsonlBytes, limits);
    const expandedAtCapPath = path.join(workspace, 'codec-expanded-at-cap.jsonl.gz');
    const expandedAtCapWritten = await writeProductionFixture({
      graph: expandedAtCapGraph,
      rootBytes: 1,
      compressorIdentity,
      limits,
      outputPath: expandedAtCapPath
    });
    if (expandedAtCapWritten.archive.expandedJsonlBytes !== limits.maxExpandedJsonlBytes) {
      fail('expanded JSONL fixture did not materialize the exact cap');
    }
    await replayProductionFixture({ graph: expandedAtCapGraph, archive: expandedAtCapWritten.archive, inputPath: expandedAtCapPath, limits });
    const expandedCapPlusOneGraph = createExpandedBoundaryFixture(limits.maxExpandedJsonlBytes + 1, limits);
    const expandedOverflowArchive = await assertProductionFixtureRejected({
      label: 'expanded JSONL',
      graph: expandedCapPlusOneGraph,
      rootBytes: 1,
      compressorIdentity,
      limits,
      outputPath: path.join(workspace, 'codec-expanded-cap-plus-one.jsonl.gz'),
      pattern: /expanded archive exceeds its hard limit/
    });

    const recordAtCapGraph = createPerRecordBoundaryFixture(limits.maxRecordBytes);
    const recordAtCapPath = path.join(workspace, 'codec-record-at-cap.jsonl.gz');
    const recordAtCapWritten = await writeProductionFixture({
      graph: recordAtCapGraph,
      rootBytes: 1,
      compressorIdentity,
      limits,
      outputPath: recordAtCapPath
    });
    if (recordAtCapWritten.archive.maximumRecordBytes !== limits.maxRecordBytes) {
      fail('per-record fixture did not materialize the exact cap');
    }
    await replayProductionFixture({ graph: recordAtCapGraph, archive: recordAtCapWritten.archive, inputPath: recordAtCapPath, limits });
    const recordCapPlusOneGraph = createPerRecordBoundaryFixture(limits.maxRecordBytes + 1);
    const recordOverflowArchive = await assertProductionFixtureRejected({
      label: 'per-record',
      graph: recordCapPlusOneGraph,
      rootBytes: 1,
      compressorIdentity,
      limits,
      outputPath: path.join(workspace, 'codec-record-cap-plus-one.jsonl.gz'),
      pattern: /per-record hard limit/
    });

    const totalAtCapGraph = createProductionCodecFixture({ emptyManifestCount: objectCount - 7 });
    if (totalAtCapGraph.projection.objectCount !== objectCount || totalAtCapGraph.projection.recordCount !== objectCount + 1) {
      fail('total-record fixture did not materialize the requested indexed-object cap');
    }
    const totalAtCapPath = path.join(workspace, 'codec-total-at-cap.jsonl.gz');
    const totalAtCapWritten = await writeProductionFixture({
      graph: totalAtCapGraph,
      rootBytes: 1,
      compressorIdentity,
      limits,
      outputPath: totalAtCapPath
    });
    await replayProductionFixture({ graph: totalAtCapGraph, archive: totalAtCapWritten.archive, inputPath: totalAtCapPath, limits });

    const objectCapPlusOneGraph = createProductionCodecFixture({ emptyManifestCount: objectCount - 6 });
    if (objectCapPlusOneGraph.projection.objectCount !== objectCount + 1 || objectCapPlusOneGraph.projection.recordCount !== totalAtCapGraph.projection.recordCount + 1) {
      fail('indexed-object fixture did not materialize the requested cap-plus-one graph');
    }
    const objectOverflowArchive = await assertProductionFixtureRejected({
      label: 'indexed-object',
      graph: objectCapPlusOneGraph,
      rootBytes: 1,
      compressorIdentity,
      limits,
      outputPath: path.join(workspace, 'codec-object-cap-plus-one.jsonl.gz'),
      pattern: /indexed-object hard limit/
    });

    // The typed graph at maxIndexedObjects has maxTotalRecords records. A 65,537th
    // typed object would first trip the independent indexed-object guard, so append
    // one deliberately invalid canonical record and encode it through the same closed
    // production transport to exercise the decoder's total-record guard itself.
    const totalOverflowCanonicalJsonl = Buffer.concat([
      totalAtCapWritten.archive.canonicalJsonl,
      Buffer.from(stableStringify({ recordType: 'total-record-overflow-fixture' }) + '\n', 'utf8')
    ]);
    const totalOverflowArchive = await encodeCanonicalEvidenceArchive(totalOverflowCanonicalJsonl, { compressorIdentity });
    const totalCapPlusOnePath = path.join(workspace, 'codec-total-cap-plus-one.jsonl.gz');
    fs.writeFileSync(totalCapPlusOnePath, totalOverflowArchive.gzip, { flag: 'wx', mode: 0o600 });
    let totalOverflowRejected = false;
    try {
      await readEvidenceArchive(totalCapPlusOnePath, { rootProjection: totalAtCapGraph.rootProjection, limits });
    } catch (error) {
      if (!/total-record hard limit/.test(error.message)) {
        fail('total-record cap-plus-one fixture failed for an unexpected replay reason: ' + error.message);
      }
      totalOverflowRejected = true;
    }
    if (!totalOverflowRejected) fail('total-record cap-plus-one fixture was accepted by the decoder');

    return {
      objectCount,
      recordCount: totalAtCapGraph.projection.recordCount,
      rawOverflowRejected,
      overflowRejected: true,
      rootOverflowRejected,
      rootArchiveReplayed: true,
      compressedOverflowRejected: compressedOverflowArchive.compressedBytes === limits.maxCompressedBytes + 1,
      expandedOverflowRejected: expandedOverflowArchive.expandedJsonlBytes === limits.maxExpandedJsonlBytes + 1,
      recordOverflowRejected: recordOverflowArchive.maximumRecordBytes === limits.maxRecordBytes + 1,
      totalOverflowRejected,
      objectOverflowRejected: objectOverflowArchive.objectCount === limits.maxIndexedObjects + 1,
      archiveReplayed: true,
      exactHardLimitBoundaries,
      streamedArchive: {
        rootBytes: rootAtCap.rootBytes,
        compressedBytes: compressedAtCapWritten.archive.compressedBytes,
        expandedJsonlBytes: expandedAtCapWritten.archive.expandedJsonlBytes,
        maximumRecordBytes: recordAtCapWritten.archive.maximumRecordBytes,
        objectCount: totalAtCapGraph.projection.objectCount,
        recordCount: totalAtCapGraph.projection.recordCount
      },
      physicalFixtures: {
        codec: 'production-closed-node-zlib-gzip',
        compressed: {
          atCapBytes: compressedAtCapWritten.archive.compressedBytes,
          capPlusOneBytes: compressedOverflowArchive.compressedBytes
        },
        expandedJsonl: {
          atCapBytes: expandedAtCapWritten.archive.expandedJsonlBytes,
          capPlusOneBytes: expandedOverflowArchive.expandedJsonlBytes
        },
        maximumRecord: {
          atCapBytes: recordAtCapWritten.archive.maximumRecordBytes,
          capPlusOneBytes: recordOverflowArchive.maximumRecordBytes
        },
        totalRecords: {
          atCap: totalAtCapGraph.projection.recordCount,
          capPlusOne: totalAtCapGraph.projection.recordCount + 1
        },
        indexedObjects: {
          atCap: totalAtCapGraph.projection.objectCount,
          capPlusOne: objectCapPlusOneGraph.projection.objectCount
        }
      }
    };
  } finally {
    if (ownsWorkspace) removeCapacityWorkspace(workspace);
  }
}

export async function runCapacityValidation({
  mode = 'all',
  capacityRoot = CAPACITY_OUTPUT_ROOT,
  workspaceId = undefined,
  headroomOptions = undefined
} = {}) {
  if (!['headroom', 'codec-boundaries', 'all'].includes(mode)) fail('mode is invalid');
  const workspace = createCapacityWorkspace(capacityRoot, workspaceId);
  const result = { mode, headroom: null, codecBoundaries: null };
  try {
    if (mode === 'headroom' || mode === 'all') {
      result.headroom = await runHeadroomCapacity({ ...(headroomOptions ?? {}), outputDirectory: workspace });
    }
    if (mode === 'codec-boundaries' || mode === 'all') result.codecBoundaries = await runCodecBoundaries({ outputDirectory: workspace });
    return result;
  } finally {
    removeCapacityWorkspace(workspace);
  }
}

function observedCompressionSummary(utilization) {
  return {
    compressedBytes: utilization.raw.compressedBytes,
    publicationThresholdBytes: utilization.publicationLimits.compressedBytes,
    hardLimitBytes: utilization.hardLimits.compressedBytes,
    fractionOfPublicationThreshold: utilization.utilization.compressedBytes,
    fractionOfHardLimit: utilization.raw.compressedBytes / utilization.hardLimits.compressedBytes
  };
}

function collectObservedProductionComponentMaxima(scenarios) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    fail('observed production component maxima require at least one scenario');
  }
  return Object.fromEntries(PRODUCTION_COMPONENTS.map((component) => {
    const values = scenarios.map((scenario) => scenario.utilization?.raw?.[component]);
    if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
      fail(`production scenario has an invalid ${component} measurement`);
    }
    const value = Math.max(...values);
    const producers = scenarios
      .filter((scenario) => scenario.utilization.raw[component] === value)
      .map((scenario) => ({
        scenario: scenario.name,
        resolutionKind: scenario.resolutionKind,
        resolution: scenario.resolution,
        allocationShape: scenario.allocationShape,
        componentValue: scenario.utilization.raw[component],
        rootBytes: scenario.utilization.raw.rootBytes,
        compressedBytes: scenario.acceptedRootTransport.compressedBytes,
        compressorProbeSha256: scenario.acceptedRootTransport.compressorIdentity.compressorProbeSha256,
        observedCompressedUtilization: observedCompressionSummary(scenario.utilization)
      }));
    return [component, { value, producers }];
  }));
}

export function summarizeCapacityValidation(result) {
  return {
    mode: result.mode,
    headroom: result.headroom && {
      qualifiedMaximums: result.headroom.qualifiedMaximums,
      compressionClaim: result.headroom.compressionClaim,
      compressionClaimLabel: 'observed compressed utilization is per scenario and is not a universal compression ratio',
      compactOracleSemanticComponentMaxima: result.headroom.envelope.semanticComponentMaxima,
      semanticMaxima: result.headroom.observedProductionComponentMaxima,
      semanticCaseMap: result.headroom.scenarios
        .filter((scenario) => Array.isArray(scenario.semanticEnvelopeCases))
        .flatMap((scenario) => scenario.semanticEnvelopeCases.map((entry) => ({
          scenario: scenario.name,
          shape: entry.shape,
          maximumComponents: entry.maximumComponents,
          components: entry.components,
          observedCompressedUtilization: observedCompressionSummary(entry.utilization)
        }))),
      scenarios: result.headroom.scenarios.map((scenario) => ({
        name: scenario.name,
        allocationState: scenario.allocationState,
        allocationEvidenceClass: scenario.allocationEvidenceClass,
        capacityRepresentation: scenario.capacityRepresentation,
        callbackCohortRepresentation: scenario.callbackCohortRepresentation,
        publicationEligible: scenario.publicationEligible,
        runBodies: scenario.runBodies,
        windowCallbacks: scenario.windowCallbacks,
        publicationHeadroomPassed: scenario.utilization.publicationHeadroomPassed,
        observedCompressedUtilization: observedCompressionSummary(scenario.utilization)
      }))
    },
    codecBoundaries: result.codecBoundaries
  };
}

export async function runCapacityCli(argv = process.argv.slice(2), { stdout = process.stdout } = {}) {
  const options = parseArgs(argv);
  const result = await runCapacityValidation(options);
  const summary = summarizeCapacityValidation(result);
  stdout.write(`${stableStringify(summary)}\n`);
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCapacityCli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
