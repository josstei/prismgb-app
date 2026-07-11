import { describe, expect, it } from 'vitest';
import { canonicalSha256 } from '../../../scripts/lib/baseline-report.js';
import {
  classifyFailure,
  computeComparisonFingerprint,
  computeQualificationFingerprint,
  decodePerformanceEvidence,
  deriveAllocationEvidence,
  deriveAllocationExpectedCoverage,
  deriveCpuScore,
  deriveCpuWindow,
  deriveAcceptedInstrumentedLedgerRuns,
  encodePerformanceEvidence,
  evaluatePerformanceExperiment,
  loadBaselinePolicy,
  requirePublishablePerformanceEvidence,
  validateBaselinePolicy,
  validatePerformanceLedger
} from '../../../scripts/lib/performance-evidence.js';

const hash = 'a'.repeat(64);
const compiledPolicy = loadBaselinePolicy();
const policyHash = compiledPolicy.policyHash;
const experimentId = 'performance-evidence-experiment';

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

function allocationRow(entry: ReturnType<typeof deriveAllocationExpectedCoverage>[number], sequence: number) {
  const common = {
    experimentId,
    backend: 'webgpu',
    policyHash,
    runId: 'run', operationId: entry.operationId, sourceLocationId: entry.sourceLocationId,
    carrier: entry.carrier, requestOrdinal: sequence, outcome: 'success', byteKind: entry.byteSemantics
  } as Record<string, unknown>;
  if (entry.carrier === 'frame-request') {
    common.measurementEpochId = 'epoch';
    common.sourceSequence = sequence;
  } else {
    common.executionId = 'run-execution';
    common.lifecyclePhase = entry.lifecyclePhase;
    common.phaseSequence = sequence;
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
    rows,
    evidenceProvenance: runtimeEvidenceProvenance
  };
}

function validLedger({
  experimentId: ledgerExperimentId = 'canvas-experiment',
  backend = 'canvas2d',
  comparisonKind = 'harness-overhead'
}: {
  experimentId?: string;
  backend?: 'canvas2d' | 'webgpu';
  comparisonKind?: 'harness-overhead' | 'instrumentation-overhead';
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
      ? { sequence: 5, operationId: 'electron-harness-spawn', start: 4, end: 5, metricSessionId: 'session', comparisonSide: 'B', comparisonKind, buildVariant: 'instrumented', runId: 'run', launchId: 'launch-instrumented', executionId: 'run-execution', measurementEpochId: 'epoch', frameSourceSequences: [1], ...common, ownership: { class: 'application-owned' }, cleanup: closure, outcome: 'completed' }
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
  const launches = ledger.filter((entry) => entry.operationId === 'electron-harness-spawn' || entry.operationId === 'production-sentinel-spawn');
  return {
    runs: launches.map((launch: any) => {
      const sourceSequences = launch.buildVariant === 'instrumented' ? launch.frameSourceSequences : [1];
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
        }
      };
    })
  };
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
  const ledger = validLedger({ experimentId, backend: 'webgpu', comparisonKind: 'instrumentation-overhead' });
  const expected = deriveAllocationExpectedCoverage({ acceptedRunIds: ['run'], frameCountByRun: { run: 1 } }, compiledPolicy);
  const rows = expected.flatMap((entry) => Array.from({ length: entry.expectedCardinality }, (_, offset) => allocationRow(entry, offset + 1)));
  return {
    experimentId,
    experimentRole: 'reference-comparison',
    backend: 'webgpu',
    ledger,
    comparisonInputs: [comparisonInput('webgpu')],
    qualificationInput: qualificationInput(),
    allocationEvidence: { experimentId, backend: 'webgpu', policyHash, ledger, rows, evidenceProvenance: runtimeEvidenceProvenance },
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
    expect(() => evaluatePerformanceExperiment({
      experimentId,
      experimentRole: 'reference-comparison',
      backend: 'webgpu',
      ledger: validLedger({ experimentId, backend: 'webgpu', comparisonKind: 'instrumentation-overhead' }),
      comparisonInputs: [comparisonInput('webgpu')],
      allocationEvidence: allocationInput(completeRows),
      rawEvidence: rawEvidence(validLedger({ experimentId, backend: 'webgpu', comparisonKind: 'instrumentation-overhead' })),
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
        frameCohorts: [{ runId: 'run', callbackCount: 1 }]
      }
    });
    if (!('syntheticCapacityCoverage' in derived)) throw new Error('expected synthetic capacity coverage metadata');
    expect(derived.syntheticCapacityCoverage.semanticExpansionChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(() => deriveAllocationEvidence({
      ...syntheticAllocation,
      syntheticCoverage: { ...coverage, frameCohorts: [{ runId: 'run', callbackCount: 2 }] }
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
    const encoded = encodePerformanceEvidence('cpu-sample', [{ runId: 'run', ordinal: 2 }, { runId: 'run', ordinal: 1 }]);
    expect(encoded.columns).toEqual(compiledPolicy.policy.performanceEvidenceChunkPolicy.rawKinds['cpu-sample'].columns);
    expect(decodePerformanceEvidence(encoded)).toEqual([{ runId: 'run', ordinal: 1 }, { runId: 'run', ordinal: 2 }]);
  });

  it('uses raw-kind schemas and policy-defined columns for canonical optional cells', () => {
    const coverage = deriveAllocationExpectedCoverage({ acceptedRunIds: ['run'], frameCountByRun: { run: 1 } }, compiledPolicy);
    const rgba = coverage.find((entry) => entry.byteSemantics === 'rgba-transfer-footprint');
    const countOnly = coverage.find((entry) => entry.byteSemantics === 'count-only-unavailable');
    if (!rgba || !countOnly) throw new Error('expected frame allocation coverage fixtures');
    const rows = [allocationRow(rgba, 1), allocationRow(countOnly, 1)];
    const encoded = encodePerformanceEvidence('frame-request', rows, compiledPolicy);
    expect(encoded.columns).toEqual(compiledPolicy.policy.performanceEvidenceChunkPolicy.rawKinds['frame-request'].columns);
    expect(encoded.dictionary.map((entry: { state: number }) => entry.state)).toEqual(expect.arrayContaining([0, 1, 2]));
    expect(decodePerformanceEvidence(encoded)).toEqual([rows[1], rows[0]]);
    expect(() => encodePerformanceEvidence('frame-request', [{ ...rows[0], unexpected: true }], compiledPolicy)).toThrow(/unrecognized column/);
    const missingRunId = { ...rows[0] };
    delete missingRunId.runId;
    expect(() => encodePerformanceEvidence('frame-request', [missingRunId], compiledPolicy)).toThrow(/missing required column runId/);
    expect(() => encodePerformanceEvidence('frame-request', [{ ...rows[0], byteValue: undefined }], compiledPolicy)).toThrow(/JSON values or null/);
  });

  it('enforces the raw-row cap per run and raw kind', () => {
    const acceptedAcrossRuns = [
      ...Array.from({ length: 8193 }, (_, ordinal) => ({ runId: 'run-a', ordinal })),
      ...Array.from({ length: 8192 }, (_, ordinal) => ({ runId: 'run-b', ordinal }))
    ];
    expect(encodePerformanceEvidence('cpu-sample', acceptedAcrossRuns, compiledPolicy).chunks).not.toHaveLength(0);
    const overflowOneRun = Array.from({ length: 16385 }, (_, ordinal) => ({ runId: 'run-overflow', ordinal }));
    expect(() => encodePerformanceEvidence('cpu-sample', overflowOneRun, compiledPolicy)).toThrow(/run run-overflow exceeds 16384 rows/);
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

  it('allows only contiguous, bounded whole-pair retries and reserves completed retries for CPU-boundary overlap', () => {
    const first = completePairAttempt({ sessionId: 'pair-1-attempt-1', pairIndex: 1, attemptIndex: 1, retryReason: null, sequenceOffset: 0, timeOffset: 0 });
    const retry = completePairAttempt({ sessionId: 'pair-1-attempt-2', pairIndex: 1, attemptIndex: 2, retryReason: 'cpu-boundary-overlap', sequenceOffset: 6, timeOffset: 6 });
    expect(validatePerformanceLedger([...first, ...retry] as never)).toEqual([...first, ...retry]);
    const nonCpuCompletedRetry = completePairAttempt({ sessionId: 'pair-1-attempt-2', pairIndex: 1, attemptIndex: 2, retryReason: 'sample-floor', sequenceOffset: 6, timeOffset: 6 });
    expect(() => validatePerformanceLedger([...first, ...nonCpuCompletedRetry] as never)).toThrow(/completed cpu-boundary-overlap/);
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
      ['operation field missing', (policy) => { delete policy.performanceOperationRegistry.operations[0].variant; }],
      ['adapter incompatible source', (policy) => { policy.processAdapterRegistry.adapters[0].metricSource = 'ps'; }],
      ['failure tuple extra field', (policy) => { policy.performanceFailurePolicy.metricSessionAbortTuples[0].extra = true; }],
      ['disposition missing field', (policy) => { delete policy.performanceDispositionPolicy.advisoryDispositionIsAuthority; }],
      ['metric score null', (policy) => { policy.performanceMetricPolicy.scoreCountByBackend.webgpu = null; }],
      ['capacity encoding invalid', (policy) => { policy.capacityFixturePolicy.encoding = 'runtime-allocation-rows-v1'; }],
      ['capacity callback encoding invalid', (policy) => { policy.capacityFixturePolicy.callbackCohortEncoding = 'runtime-source-sequences-v1'; }],
      ['comparison fingerprint unknown', (policy) => { policy.comparisonFingerprintPolicy.extra = true; }],
      ['qualification fingerprint incomplete', (policy) => { policy.qualificationFingerprintPolicy.includedFields.pop(); }],
      ['chunk schema unknown raw kind', (policy) => { policy.performanceEvidenceChunkPolicy.rawKinds.unknown = { sortKeys: [] }; }],
      ['chunk schema missing columns', (policy) => { delete policy.performanceEvidenceChunkPolicy.rawKinds['cpu-sample'].columns; }],
      ['chunk schema has nonrequired reference', (policy) => { policy.performanceEvidenceChunkPolicy.rawKinds['cpu-sample'].referenceColumns = ['processIdentity']; }],
      ['limit nested shape malformed', (policy) => { delete policy.performanceLimits.window.maximumCallbacks; }],
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

  it('requires raw cohort evidence and recomputes CPU, timing, environment, process, and score bounds before publication', () => {
    const input = validRuntimeEvaluationInput();
    const evaluation = evaluatePerformanceExperiment(input, compiledPolicy);
    expect(evaluation.publicationEligible).toBe(true);
    expect(evaluation.rawEvidence.scores).toHaveLength(6);
    expect(requirePublishablePerformanceEvidence(evaluation)).toBe(evaluation);
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
  });
});
