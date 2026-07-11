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
  return [...references].sort((left, right) => `${left.kind}:${left.hash}`.localeCompare(`${right.kind}:${right.hash}`));
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
    ledger.push({ sequence: sequence++, operationId: 'metric-adapter-session-open', start: start(), end: end(), metricSessionId: sessionId, outcome: 'ready' });
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

function createRawRunEvidence(launch, callbacksPerRun, policy) {
  const callbackCount = launch.buildVariant === 'instrumented'
    ? launch.frameSourceSequences.length
    : callbacksPerRun;
  const identity = `${launch.runId}-renderer`;
  const counterQuantumSeconds = policy.adapters.get('linux-procfs-v1').counterQuantumSeconds;
  const cpuSamples = Array.from({ length: policy.policy.performanceMetricPolicy.minimumRawSamples }, (_, index) => {
    const readStart = index * 0.5;
    const readEnd = readStart + 0.01;
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
  const traces = ['external', 'controller'].flatMap((source) => Array.from({ length: 29 }, (_, index) => ({
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
        windowStart: 0,
        windowEnd: 30,
        dropCount: 0,
        sealed: true,
        drained: true
      },
      timingSpans: [{
        firstSourceSequence: 1,
        lastSourceSequence: callbackCount,
        startedAt: 0,
        endedAt: callbackCount / 1000
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
  const acceptedArchive = await writeEvidenceArchive({
    outputPath: outputDirectory ? path.join(outputDirectory, `${archiveStem}.accepted.jsonl.gz`) : undefined,
    objects: core.store.objectMap(),
    rootReferences: acceptedRoots,
    rootProjection: acceptedRootProjection,
    rootBytes,
    compressorIdentity: core.compressorIdentity
  });
  const acceptedRoot = createAcceptedRootBody({
    acceptedEvidenceBody: (() => {
      const { acceptedEvidenceChecksum, ...body } = acceptedEvidence;
      return body;
    })(),
    acceptedEvidenceChecksum: acceptedEvidence.acceptedEvidenceChecksum,
    compressedArchiveSha256: acceptedArchive.compressedArchiveSha256,
    compressedBytes: acceptedArchive.compressedBytes,
    compressorIdentity: core.compressorIdentity
  });
  const utilization = measureEvidenceArchiveUtilization({
    rootBytes: Buffer.byteLength(stableStringify(acceptedRoot), 'utf8'),
    compressedBytes: acceptedArchive.compressedBytes,
    expandedJsonlBytes: acceptedProjection.expandedJsonlBytes,
    maximumRecordBytes: acceptedProjection.maximumRecordBytes,
    objectCount: acceptedProjection.objectCount,
    recordCount: acceptedProjection.recordCount
  });
  if (!utilization.publicationHeadroomPassed) fail(`${name} exceeded publication headroom: ${utilization.publicationFailures.join(', ')}`);
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
    acceptedRootChecksum: acceptedRoot.acceptedRootChecksum,
    rawEvidenceReplayed,
    archiveReplayed: replayedArchive,
    allocationShape: reference ? allocationShape : null
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

function symmetricCoverageVectorKey(vector) {
  if (vector.length === 1) return stableStringify(vector);
  // The compact oracle measures bytes/counts, not the run label's hash. For two
  // equal-width run IDs, independently swapping the two run labels for one policy
  // operation preserves every serialized field width, chunk row count, root count,
  // and fixed-width object hash. Canonicalize that proven component symmetry before
  // invoking the real constructor/store projection.
  return stableStringify(vector[0].map((_, coverageIndex) => vector.map((runVector) => runVector[coverageIndex]).sort()));
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

function compactOracleCompressorIdentity() {
  return {
    codec: 'node:zlib.gzip',
    nodeVersion: process.version,
    zlibVersion: process.versions.zlib,
    level: 9,
    strategy: 'Z_DEFAULT_STRATEGY',
    windowBits: 15,
    memLevel: 8,
    inputChunkBytes: 65536,
    intermediateFlush: 'Z_NO_FLUSH',
    finishFlush: 'Z_FINISH',
    mtime: 0,
    filename: null,
    comment: null,
    osByte: 255,
    compressorProbePolicyHash: 'a'.repeat(64),
    compressorProbeSha256: 'b'.repeat(64)
  };
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
  const { acceptedEvidenceChecksum, ...acceptedEvidenceBody } = acceptedEvidence;
  const acceptedRoot = createAcceptedRootBody({
    acceptedEvidenceBody,
    acceptedEvidenceChecksum,
    compressedArchiveSha256: 'c'.repeat(64),
    compressedBytes: 0,
    compressorIdentity: compactOracleCompressorIdentity()
  });
  return {
    rootBytes: Buffer.byteLength(stableStringify(acceptedRoot), 'utf8'),
    maximumRecordBytes: acceptedProjection.maximumRecordBytes,
    expandedJsonlBytes: acceptedProjection.expandedJsonlBytes,
    objectCount: acceptedProjection.objectCount,
    recordCount: acceptedProjection.recordCount,
    evaluatorChecksum: canonicalSha256({ ledger, allocationEvidence })
  };
}

function expandCompactCoverageVector(vector, runCount) {
  if (!Number.isSafeInteger(runCount) || runCount < 1) fail('expanded coverage vector runCount is invalid');
  if (vector.length === 0) fail('compact coverage vector must not be empty');
  const leading = vector[0];
  const terminal = vector.at(-1);
  return Array.from({ length: runCount }, (_, index) => [...(index === runCount - 1 ? terminal : leading)]);
}

export function calculateQualifiedIncompleteEnvelope({ runCount = 2, policy = loadBaselinePolicy() } = {}) {
  const cacheKey = `${policy.policyHash}:${runCount}`;
  const cached = qualifiedIncompleteEnvelopeCache.get(cacheKey);
  if (cached) return cached;
  const enumeration = enumerateQualifiedIncompleteCoverageVectors({ runCount, policy });
  const base = createCompactOracleBase(policy, runCount);
  const symmetricProjectionCache = new Map();
  const evaluated = enumeration.vectors.map((vector) => {
    const key = symmetricCoverageVectorKey(vector);
    let components = symmetricProjectionCache.get(key);
    if (!components) {
      components = materializeCompactQualifiedIncompleteVector(vector, base, policy);
      symmetricProjectionCache.set(key, components);
    }
    return { vector, components };
  });
  const componentNames = ['rootBytes', 'maximumRecordBytes', 'expandedJsonlBytes', 'objectCount', 'recordCount'];
  const componentMaxima = Object.fromEntries(componentNames.map((component) => {
    const maximum = Math.max(...evaluated.map((entry) => entry.components[component]));
    const representative = evaluated.filter((entry) => entry.components[component] === maximum)
      .sort((left, right) => coverageVectorKey(left.vector).localeCompare(coverageVectorKey(right.vector)))[0];
    return [component, { value: maximum, vector: representative.vector, vectorKey: coverageVectorKey(representative.vector) }];
  }));
  const shapesByVector = new Map();
  for (const [component, maximum] of Object.entries(componentMaxima)) {
    const shape = shapesByVector.get(maximum.vectorKey) ?? {
      name: `qualified-incomplete-${shapesByVector.size + 1}`,
      compactVector: maximum.vector,
      compactVectorKey: maximum.vectorKey,
      maximumComponents: []
    };
    shape.maximumComponents.push(component);
    shapesByVector.set(maximum.vectorKey, shape);
  }
  const materializedComponentMaxima = Object.fromEntries(componentNames.map((component) => [component, Math.max(...evaluated.map((entry) => entry.components[component]))]));
  for (const component of componentNames) {
    if (materializedComponentMaxima[component] !== componentMaxima[component].value) {
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
    componentMaxima,
    materializedComponentMaxima,
    shapes: [...shapesByVector.values()].map((shape) => ({
      ...shape,
      allocationVector: expandCompactCoverageVector(shape.compactVector, runCount)
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
  scenarios.push(await constructScenario('qualified-measured-request-proxy', 'qualified', {
    runBodies: qualifiedRunBodies,
    callbacksPerRun,
    allocationShape: 'complete',
    outputDirectory,
    policy
  }));
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
      allocationVector: expandCompactCoverageVector(shape.compactVector, referenceRunBodies / 2),
      outputDirectory,
      archiveStem: `qualified-incomplete-request-coverage.${shape.name}`,
      policy
    }));
  }
  const fullSizeComponentMaxima = Object.fromEntries([
    ['rootBytes', 'rootBytes'],
    ['maximumRecordBytes', 'maximumRecordBytes'],
    ['expandedJsonlBytes', 'expandedJsonlBytes'],
    ['objectCount', 'objectCount'],
    ['recordCount', 'recordCount']
  ].map(([name, rawKey]) => [name, Math.max(...incompleteCases.map((scenario) => scenario.utilization.raw[rawKey]))]));
  const oracleProvenComponentMaxima = Object.fromEntries(Object.entries(envelope.componentMaxima)
    .map(([component, maximum]) => [component, maximum.value]));
  if (stableStringify(oracleProvenComponentMaxima) !== stableStringify(envelope.materializedComponentMaxima)) {
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
      utilization: scenario.utilization
    })),
    materializedComponentMaxima: oracleProvenComponentMaxima,
    fullSizeComponentMaxima
  });
  for (const [name, branch] of [
    ['hardware-unavailable-webgpu-api', 'webgpu-api-unavailable'],
    ['hardware-unavailable-webgpu-adapter', 'webgpu-adapter-unavailable'],
    ['hardware-unavailable-transfer-api', 'transfer-api-unavailable'],
    ['hardware-unavailable-transfer-method', 'transfer-method-unavailable'],
    ['hardware-unavailable-transfer-allowlisted', 'transfer-allowlisted-not-supported'],
    ['hardware-unavailable-worker-fallback', 'worker-fallback-adapter']
  ]) {
    scenarios.push(await constructScenario(name, 'hardware-unavailable', {
      runBodies: hardwareUnavailableRunBodies,
      callbacksPerRun,
      unavailabilityBranch: branch,
      outputDirectory,
      policy
    }));
  }
  scenarios.push(await constructScenario('no-host', 'no-host', {
    callbacksPerRun,
    outputDirectory,
    policy
  }));
  return {
    scenarios,
    envelope,
    qualifiedMaximums: { runBodies: scenarios[0].runBodies, windowCallbacks: scenarios[0].windowCallbacks },
    compressionClaim: 'observed-per-scenario-not-universal'
  };
}

function makeRows(count) {
  return Array.from({ length: count }, (_, index) => ({ runId: 'run-1', ordinal: index }));
}

export function runCodecBoundaries({ objectCount = EVIDENCE_HARD_LIMITS.maxIndexedObjects, limits = EVIDENCE_HARD_LIMITS } = {}) {
  const policy = loadBaselinePolicy();
  encodePerformanceEvidence('cpu-sample', makeRows(policy.policy.performanceEvidenceChunkPolicy.maximumRowsPerRunAndKind), policy);
  let rawOverflowRejected = false;
  try {
    encodePerformanceEvidence('cpu-sample', makeRows(policy.policy.performanceEvidenceChunkPolicy.maximumRowsPerRunAndKind + 1), policy);
  } catch {
    rawOverflowRejected = true;
  }
  if (!rawOverflowRejected) fail('raw-kind cap-plus-one was accepted');
  if (!Number.isSafeInteger(objectCount) || objectCount < 7) fail('objectCount must be at least seven for a closed core projection');
  const createBoundaryGraph = (count) => {
    const store = createEvidenceStore();
    const singletonReferences = ['source', 'events', 'lifecycle', 'behavior'].map((evidenceId) => {
      const singleton = store.putObject('singleton-report', { evidenceId, boundary: true });
      return { kind: singleton.kind, hash: singleton.hash };
    });
    const packageReport = store.putObject('package-report', { evidenceId: 'package:boundary:release' });
    const rawManifestReferences = [];
    for (let index = 0; index < count - 7; index += 1) {
      const rawManifest = store.putObject('raw-kind-manifest', { boundaryIndex: index });
      rawManifestReferences.push({ kind: rawManifest.kind, hash: rawManifest.hash });
    }
    const child = store.putObject('experiment-child-manifest', { rawKindManifestReferences: sortedReferences(rawManifestReferences) });
    const parent = store.putObject('ci-experiment-parent', { childManifest: { kind: child.kind, hash: child.hash } });
    const rootReferences = sortedReferences([...singletonReferences, { kind: packageReport.kind, hash: packageReport.hash }, { kind: parent.kind, hash: parent.hash }]);
    return { store, rootReferences, rootProjection: coreProjection(rootReferences) };
  };
  const boundary = createBoundaryGraph(objectCount);
  const projection = boundary.store.project(boundary.rootReferences, boundary.rootProjection);
  if (projection.recordCount !== objectCount + 1) fail('boundary record count is inconsistent');
  const rootBytes = 0;
  const accepted = measureEvidenceArchiveUtilization({
    rootBytes,
    compressedBytes: 0,
    expandedJsonlBytes: projection.expandedJsonlBytes,
    maximumRecordBytes: projection.maximumRecordBytes,
    objectCount: projection.objectCount,
    recordCount: projection.recordCount
  }, { limits });
  if (!accepted.hardLimitPassed) fail(`hard codec boundary rejected at cap: ${accepted.hardFailures.join(', ')}`);
  let overflowRejected = false;
  try {
    const overflow = createBoundaryGraph(objectCount + 1);
    const overProjection = overflow.store.project(overflow.rootReferences, overflow.rootProjection);
    const over = measureEvidenceArchiveUtilization({
      rootBytes,
      compressedBytes: 0,
      expandedJsonlBytes: overProjection.expandedJsonlBytes,
      maximumRecordBytes: overProjection.maximumRecordBytes,
      objectCount: overProjection.objectCount,
      recordCount: overProjection.recordCount
    }, { limits });
    overflowRejected = !over.hardLimitPassed;
  } catch {
    overflowRejected = true;
  }
  if (!overflowRejected) fail('hard codec cap-plus-one was accepted');
  return { objectCount, recordCount: projection.recordCount, rawOverflowRejected, overflowRejected };
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
    if (mode === 'codec-boundaries' || mode === 'all') result.codecBoundaries = runCodecBoundaries();
    return result;
  } finally {
    removeCapacityWorkspace(workspace);
  }
}

export async function runCapacityCli(argv = process.argv.slice(2), { stdout = process.stdout } = {}) {
  const options = parseArgs(argv);
  const result = await runCapacityValidation(options);
  const summary = {
    mode: result.mode,
    headroom: result.headroom && {
      qualifiedMaximums: result.headroom.qualifiedMaximums,
      compressionClaim: result.headroom.compressionClaim,
      scenarios: result.headroom.scenarios.map((scenario) => ({
        name: scenario.name,
        allocationState: scenario.allocationState,
        allocationEvidenceClass: scenario.allocationEvidenceClass,
        capacityRepresentation: scenario.capacityRepresentation,
        callbackCohortRepresentation: scenario.callbackCohortRepresentation,
        publicationEligible: scenario.publicationEligible,
        runBodies: scenario.runBodies,
        windowCallbacks: scenario.windowCallbacks,
        publicationHeadroomPassed: scenario.utilization.publicationHeadroomPassed
      }))
    },
    codecBoundaries: result.codecBoundaries
  };
  stdout.write(`${stableStringify(summary)}\n`);
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCapacityCli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
