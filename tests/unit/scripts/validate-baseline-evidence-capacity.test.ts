import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createCompressorIdentity,
  createEvidenceStore,
  EVIDENCE_HARD_LIMITS,
  encodeEvidenceArchive
} from '../../../scripts/lib/baseline-evidence-store.js';
import {
  CAPACITY_OUTPUT_ROOT,
  assertSelectedPreviewHeadroom,
  calculateQualifiedIncompleteEnvelope,
  measureQualifiedIncompleteCompactVector,
  resolveCapacityOutputRoot,
  runCapacityCli,
  runCapacityValidation,
  runCodecBoundaries,
  runHeadroomCapacity,
  summarizeCapacityValidation,
  writeSelectedPreviewArchive
} from '../../../scripts/validate-baseline-evidence-capacity.js';

const roots: string[] = [];

function hasBoundedExplicitAttempts(representation: any) {
  return representation.sessions.length === representation.pairs.length
    && representation.sessions.every((attempt: any, index: number) => (
      attempt.pairIndex === index + 1
      && attempt.attemptIndex === 1
      && attempt.retryReason === null
    ))
    && representation.pairs.every((pair: any, index: number) => (
      pair.pairIndex === index + 1
      && pair.attempts.length >= 1
      && pair.attempts.length <= 3
      && pair.attempts.every((attempt: any, attemptIndex: number) => (
        attempt.attemptIndex === attemptIndex + 1
        && (attemptIndex === 0 ? attempt.retryReason === null : typeof attempt.retryReason === 'string')
      ))
    ));
}

function sortReferences(references: { kind: string, hash: string }[]) {
  return [...references].sort((left, right) => {
    const leftKey = `${left.kind}:${left.hash}`;
    const rightKey = `${right.kind}:${right.hash}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

function requiredUtilization(scenario: { utilization?: any }) {
  if (!scenario.utilization) throw new Error('scenario utilization is missing');
  return scenario.utilization;
}

function legacyColumnPermutationKey(vector: number[][]) {
  return JSON.stringify(vector[0].map((_, coverageIndex) => vector
    .map((runVector) => runVector[coverageIndex])
    .sort()));
}

function createSelectedPreviewGraph(payload: string) {
  const store = createEvidenceStore();
  const singletonReferences = ['source', 'events', 'lifecycle', 'behavior'].map((evidenceId) => {
    const object = store.putObject('singleton-report', { evidenceId, fixture: 'selected-preview-gate' });
    return { kind: object.kind, hash: object.hash };
  });
  const packageReport = store.putObject('package-report', { evidenceId: 'package:selected-preview-gate:release' });
  const ciChild = store.putObject('experiment-child-manifest', { fixture: 'selected-preview-gate-ci' });
  const ciParent = store.putObject('ci-experiment-parent', {
    childManifest: { kind: ciChild.kind, hash: ciChild.hash }
  });
  const rawChunk = store.putObject('raw-chunk', { fixture: 'selected-preview-gate', payload });
  const rawManifest = store.putObject('raw-kind-manifest', {
    chunkReferences: sortReferences([{ kind: rawChunk.kind, hash: rawChunk.hash }])
  });
  const referenceChild = store.putObject('experiment-child-manifest', {
    rawKindManifestReferences: sortReferences([{ kind: rawManifest.kind, hash: rawManifest.hash }])
  });
  const referenceParent = store.putObject('reference-experiment-parent', {
    childManifest: { kind: referenceChild.kind, hash: referenceChild.hash }
  });
  const coreReferences = sortReferences([
    ...singletonReferences,
    { kind: packageReport.kind, hash: packageReport.hash },
    { kind: ciParent.kind, hash: ciParent.hash }
  ]);
  const rootReferences = sortReferences([...coreReferences, { kind: referenceParent.kind, hash: referenceParent.hash }]);
  return {
    store,
    rootReferences,
    rootProjection: { mode: 'selected-reference' as const, rootReferences, coreReferences }
  };
}

function deterministicPreviewPayload(length: number) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let state = 0x9e3779b9;
  let payload = '';
  for (let index = 0; index < length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    payload += alphabet[(state >>> 26) & 0x3f];
  }
  return payload;
}

afterEach(() => {
  while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('baseline evidence capacity runner', () => {
  it('keeps the compact semantic envelope separate from full-size fixtures', async () => {
    const envelope = calculateQualifiedIncompleteEnvelope({ runCount: 2 });
    expect(envelope.coverage).toHaveLength(6);
    expect(envelope.compactPerRunVectorCount).toBe(120);
    expect(envelope.compactVectorCount).toBe(14399);
    expect(envelope.evaluatedCompactVectorCount).toBe(envelope.compactVectorCount);
    expect(Object.keys(envelope.semanticComponentMaxima)).toEqual(['maximumRecordBytes', 'expandedJsonlBytes', 'objectCount', 'recordCount']);
    const expectedMaterializedMaxima = Object.fromEntries(Object.keys(envelope.semanticComponentMaxima)
      .map((component) => [component, envelope.semanticComponentMaxima[component].value]));
    expect(envelope.materializedSemanticComponentMaxima).toEqual(expectedMaterializedMaxima);
    const independentlyPermutedLeft = [[0, 0, 0, 0, 0, 1], [0, 1, 1, 1, 1, 1]];
    const independentlyPermutedRight = [[0, 0, 0, 0, 1, 1], [0, 1, 1, 1, 0, 1]];
    expect(legacyColumnPermutationKey(independentlyPermutedLeft)).toBe(legacyColumnPermutationKey(independentlyPermutedRight));
    const leftComponents = measureQualifiedIncompleteCompactVector({ vector: independentlyPermutedLeft });
    const rightComponents = measureQualifiedIncompleteCompactVector({ vector: independentlyPermutedRight });
    expect(leftComponents.expandedJsonlBytes).toBe(15328);
    expect(rightComponents.expandedJsonlBytes).toBe(15327);
    expect(leftComponents.expandedJsonlBytes).not.toBe(rightComponents.expandedJsonlBytes);
    expect(envelope.shapes.length).toBeGreaterThanOrEqual(2);
    expect(envelope.shapes.every((shape) => shape.allocationVector.length === 2)).toBe(true);
    expect(envelope.shapes.map((shape) => shape.name)).toEqual(expect.arrayContaining(['max-observed-min-missing', 'max-missing-minimal-deficit']));
    const result = await runHeadroomCapacity({ qualifiedRunBodies: 2, hardwareUnavailableRunBodies: 1, callbacksPerRun: 4 });
    expect(result.scenarios).toHaveLength(9);
    expect(result.qualifiedMaximums).toEqual({ runBodies: 4, windowCallbacks: 16 });
    expect(result.compressionClaim).toBe('observed-per-scenario-not-universal');
    expect(result.scenarios.map((scenario) => scenario.name)).toEqual([
      'qualified-measured-request-proxy',
      'qualified-incomplete-request-coverage',
      'hardware-unavailable-webgpu-api',
      'hardware-unavailable-webgpu-adapter',
      'hardware-unavailable-transfer-api',
      'hardware-unavailable-transfer-method',
      'hardware-unavailable-transfer-allowlisted',
      'hardware-unavailable-worker-fallback',
      'no-host'
    ]);
    expect(result.scenarios[0]).toMatchObject({
      allocationState: 'measured-request-proxy',
      allocationEvidenceClass: 'synthetic-capacity-only',
      capacityRepresentation: 'synthetic-allocation-coverage-v1',
      callbackCohortRepresentation: 'synthetic-callback-cohort-v1',
      publicationEligible: false,
      coreCandidateChecksum: expect.any(String),
      resolvedCandidateChecksum: expect.any(String),
      acceptedRootChecksum: expect.any(String),
      evaluatorChecksum: expect.any(String),
      acceptedInstrumentedRunIds: expect.any(Array)
    });
    expect(result.scenarios[0].acceptedInstrumentedRunIds.length).toBeGreaterThan(0);
    expect(result.scenarios[0].instrumentedCallbackCohorts.every((cohort: { callbackCount: number }) => cohort.callbackCount === 4)).toBe(true);
    expect(result.scenarios[0].logicalCallbackCohorts).toHaveLength(4);
    expect(result.scenarios[0].logicalCallbackCohorts.every((cohort: { callbackCount: number }) => cohort.callbackCount === 4)).toBe(true);
    expect(result.scenarios[0].windowCallbacks).toBe(16);
    expect(result.scenarios[1]).toMatchObject({ allocationState: 'unavailable-incomplete-request-coverage', resolution: { mode: 'selected-reference' } });
    expect(result.scenarios[1]).toMatchObject({ allocationEvidenceClass: 'synthetic-capacity-only', capacityRepresentation: 'synthetic-allocation-coverage-v1', callbackCohortRepresentation: 'synthetic-callback-cohort-v1', publicationEligible: false });
    expect(result.scenarios[1].semanticEnvelopeCases).toHaveLength(envelope.shapes.length);
    expect(result.scenarios[1].semanticEnvelopeCases.flatMap((entry) => entry.maximumComponents).sort()).toEqual(Object.keys(envelope.semanticComponentMaxima).sort());
    expect(result.scenarios[1].semanticEnvelopeCases.every((entry) => entry.utilization.publicationHeadroomPassed)).toBe(true);
    const maxObserved = result.scenarios[1].semanticEnvelopeCases.find((entry) => entry.shape === 'max-observed-min-missing');
    expect(maxObserved?.allocationSummary).toMatchObject({ missingTupleCount: 1, missingDeficits: [1] });
    expect(maxObserved?.allocationSummary?.missingCoverage).toEqual([expect.objectContaining({
      operationId: 'render-pass-plan-materialization',
      expectedCardinality: 4,
      observedCardinality: 3
    })]);
    const maxMissing = result.scenarios[1].semanticEnvelopeCases.find((entry) => entry.shape === 'max-missing-minimal-deficit');
    expect(maxMissing?.allocationSummary?.missingTupleCount).toBeGreaterThan(1);
    expect(maxMissing?.allocationSummary?.missingDeficits).toEqual([1]);
    expect(maxMissing?.allocationSummary?.missingCoverage.some((entry) => entry.expectedCardinality === 4 && entry.observedCardinality === 3)).toBe(true);
    expect(result.scenarios.every((scenario) => scenario.cpuWindowCoverage.every((coverage) => (
      coverage.firstReadStart === coverage.windowStart
      && coverage.beforeTerminalReadEnd < coverage.windowEnd
      && coverage.terminalReadStart === coverage.windowEnd
      && coverage.terminalReadEnd > coverage.windowEnd
    )))).toBe(true);
    expect(result.scenarios.every((scenario) => scenario.attemptRepresentations.every(hasBoundedExplicitAttempts))).toBe(true);
    expect(result.scenarios.slice(2, 8).map((scenario) => scenario.resolution.unavailabilityBranch)).toEqual([
      'webgpu-api-unavailable', 'webgpu-adapter-unavailable', 'transfer-api-unavailable',
      'transfer-method-unavailable', 'transfer-allowlisted-not-supported', 'worker-fallback-adapter'
    ]);
    expect(result.scenarios[8].resolution).toEqual({ mode: 'no-host-selected', blocker: 'phase-5-selected-reference-host' });
    expect(result.scenarios.every((scenario) => requiredUtilization(scenario).publicationHeadroomPassed === true)).toBe(true);
    expect(() => assertSelectedPreviewHeadroom({
      rootBytes: 1,
      compressedBytes: Math.floor((EVIDENCE_HARD_LIMITS.maxCompressedBytes * 4) / 5) + 1,
      expandedJsonlBytes: 1,
      maximumRecordBytes: 1,
      objectCount: 0,
      recordCount: 1
    })).toThrow(/selected preview exceeded publication headroom: compressedBytes/);
    const summary = summarizeCapacityValidation({ mode: 'headroom', headroom: result, codecBoundaries: null });
    if (!summary.headroom) throw new Error('headroom summary is missing');
    const semanticMaxima = summary.headroom.semanticMaxima;
    expect(semanticMaxima.maximumRecordBytes.value).toBe(Math.max(...result.scenarios
      .map((scenario) => requiredUtilization(scenario).raw.maximumRecordBytes)));
    expect(semanticMaxima.maximumRecordBytes.producers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scenario: expect.any(String),
        resolution: expect.any(Object),
        allocationShape: expect.any(String),
        observedCompressedUtilization: expect.objectContaining({ compressedBytes: expect.any(Number) })
      })
    ]));
    expect(summary.headroom.compactOracleSemanticComponentMaxima.maximumRecordBytes.value)
      .toBeLessThan(semanticMaxima.maximumRecordBytes.value);
    const rootMax = semanticMaxima.rootBytes;
    expect(rootMax.value).toBe(Math.max(...result.scenarios
      .map((scenario) => requiredUtilization(scenario).raw.rootBytes)));
    const rootScenario = result.scenarios.find((scenario) => scenario.name === 'hardware-unavailable-transfer-allowlisted');
    if (!rootScenario) throw new Error('expected root producer scenario is missing');
    const rootProducer = rootMax.producers.find((producer: { scenario: string }) => producer.scenario === 'hardware-unavailable-transfer-allowlisted');
    expect(rootProducer).toMatchObject({
      resolutionKind: 'hardware-unavailable',
      resolution: {
        mode: 'selected-reference',
        qualificationState: 'hardware-capability-unavailable',
        unavailabilityBranch: 'transfer-allowlisted-not-supported'
      },
      allocationShape: 'complete',
      componentValue: rootMax.value,
      rootBytes: rootMax.value,
      compressedBytes: expect.any(Number),
      compressorProbeSha256: expect.any(String)
    });
    expect(rootScenario.acceptedRootTransport.compressedBytes).toBe(requiredUtilization(rootScenario).raw.compressedBytes);
    expect(rootProducer?.compressedBytes).toBe(requiredUtilization(rootScenario).raw.compressedBytes);
    expect(rootProducer?.compressedBytes).toBeGreaterThan(0);
    expect(rootProducer?.compressorProbeSha256).not.toBe('b'.repeat(64));
    expect(rootProducer?.rootBytes).toBeGreaterThan(6857);
  }, 120000);

  it('rejects an encoded nonrepresentative selected preview before output', async () => {
    const graph = createSelectedPreviewGraph(deterministicPreviewPayload(131072));
    const identity = await createCompressorIdentity({ compressorProbePolicyHash: 'a'.repeat(64) });
    const probe = await encodeEvidenceArchive({
      objects: graph.store.objectMap(),
      rootReferences: graph.rootReferences,
      rootProjection: graph.rootProjection,
      rootBytes: 1,
      compressorIdentity: identity
    });
    const limits = {
      ...EVIDENCE_HARD_LIMITS,
      maxCompressedBytes: Math.ceil((probe.compressedBytes * 10) / 9)
    };
    expect(probe.compressedBytes).toBeGreaterThan(Math.floor((limits.maxCompressedBytes * 4) / 5));
    const outputRoot = path.join(CAPACITY_OUTPUT_ROOT, `preview-gate-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    fs.mkdirSync(outputRoot, { recursive: true });
    roots.push(outputRoot);
    const outputPath = path.join(outputRoot, 'rejected-selected-preview.jsonl.gz');
    await expect(writeSelectedPreviewArchive({
      outputPath,
      objects: graph.store.objectMap(),
      rootReferences: graph.rootReferences,
      rootProjection: graph.rootProjection,
      archiveRootBytes: 1,
      compressorIdentity: identity,
      limits,
      createPreviewRoot: (archive) => ({
        schemaVersion: 1,
        fixture: 'nonrepresentative-selected-preview',
        compressedArchiveSha256: archive.compressedArchiveSha256,
        compressedBytes: archive.compressedBytes
      })
    })).rejects.toThrow(/selected preview exceeded publication headroom: compressedBytes/);
    expect(fs.existsSync(outputPath)).toBe(false);
  }, 30000);

  it('uses contained compact workspaces and rejects output-root escape or symlink traversal', async () => {
    const limits = {
      maxRootBytes: 4096,
      maxCompressedBytes: 8192,
      maxExpandedJsonlBytes: 32768,
      maxRecordBytes: 16384,
      maxIndexedObjects: 16,
      maxTotalRecords: 17
    };
    const codec = await runCodecBoundaries({ objectCount: 16, limits });
    expect(codec).toMatchObject({
      objectCount: 16,
      recordCount: 17,
      rawOverflowRejected: true,
      rootOverflowRejected: true,
      compressedOverflowRejected: true,
      expandedOverflowRejected: true,
      recordOverflowRejected: true,
      totalOverflowRejected: true,
      objectOverflowRejected: true,
      archiveReplayed: true,
      rootArchiveReplayed: true
    });
    expect(codec.exactHardLimitBoundaries).toEqual({
      atCap: {
        rootBytes: limits.maxRootBytes,
        compressedBytes: limits.maxCompressedBytes,
        expandedJsonlBytes: limits.maxExpandedJsonlBytes,
        maximumRecordBytes: limits.maxRecordBytes,
        objectCount: limits.maxIndexedObjects,
        recordCount: limits.maxTotalRecords
      },
      capPlusOneRejected: {
        rootBytes: true,
        compressedBytes: true,
        expandedJsonlBytes: true,
        maximumRecordBytes: true,
        objectCount: true,
        recordCount: true
      }
    });
    expect(codec.streamedArchive).toMatchObject({ objectCount: 16, recordCount: 17 });
    expect(codec.physicalFixtures).toMatchObject({
      totalRecords: { atCap: 17, capPlusOne: 18 },
      indexedObjects: { atCap: 16, capPlusOne: 17 }
    });
    const root = path.join(CAPACITY_OUTPUT_ROOT, `unit-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    fs.mkdirSync(root, { recursive: true });
    roots.push(root);
    const workspace = 'contained-workspace';
    const completed = await runCapacityValidation({
      mode: 'headroom',
      capacityRoot: root,
      workspaceId: workspace,
      headroomOptions: { qualifiedRunBodies: 2, hardwareUnavailableRunBodies: 1, callbacksPerRun: 2048 }
    });
    expect(completed.headroom?.scenarios).toHaveLength(9);
    expect(completed.headroom?.scenarios.every((scenario) => scenario.archiveReplayed && scenario.rawEvidenceReplayed)).toBe(true);
    expect(completed.headroom?.scenarios.every((scenario) => scenario.logicalCallbackCohorts.every((cohort: { callbackCount: number }) => cohort.callbackCount === 2048))).toBe(true);
    expect(completed.headroom?.scenarios.every((scenario) => scenario.attemptRepresentations.every(hasBoundedExplicitAttempts))).toBe(true);
    const fullIncompleteCases = completed.headroom?.scenarios[1].semanticEnvelopeCases;
    const fullMaxObserved = fullIncompleteCases?.find((entry: { shape: string }) => entry.shape === 'max-observed-min-missing');
    expect(fullMaxObserved?.allocationSummary).toMatchObject({ missingTupleCount: 1, missingDeficits: [1] });
    expect(fullMaxObserved?.allocationSummary?.missingCoverage).toEqual([expect.objectContaining({
      operationId: 'render-pass-plan-materialization',
      expectedCardinality: 2048,
      observedCardinality: 2047
    })]);
    const fullMaxMissing = fullIncompleteCases?.find((entry: { shape: string }) => entry.shape === 'max-missing-minimal-deficit');
    expect(fullMaxMissing?.allocationSummary).toMatchObject({ missingTupleCount: 5, missingDeficits: [1] });
    expect(fullMaxMissing?.allocationSummary?.missingCoverage.filter((entry: { expectedCardinality: number, observedCardinality: number }) => entry.expectedCardinality === 2048 && entry.observedCardinality === 2047)).toHaveLength(3);
    expect(fs.existsSync(path.join(root, workspace))).toBe(false);
    const failedWorkspace = 'failed-workspace';
    await expect(runCapacityValidation({
      mode: 'headroom',
      capacityRoot: root,
      workspaceId: failedWorkspace,
      headroomOptions: { qualifiedRunBodies: 2, hardwareUnavailableRunBodies: 1, callbacksPerRun: 2049 }
    })).rejects.toThrow(/callback cohort is invalid/);
    expect(fs.existsSync(path.join(root, failedWorkspace))).toBe(false);
    expect(() => resolveCapacityOutputRoot(path.join(os.tmpdir(), 'outside-capacity'))).toThrow(/must stay beneath/);
    const symlink = path.join(root, 'escape-link');
    fs.symlinkSync(os.tmpdir(), symlink);
    expect(() => resolveCapacityOutputRoot(symlink)).toThrow(/symlink/);
    await expect(runCapacityCli(['--output-root', path.join(os.tmpdir(), 'outside-capacity')], { stdout: { write: () => undefined } as never })).rejects.toThrow(/unknown argument/);
  }, 30000);
});
