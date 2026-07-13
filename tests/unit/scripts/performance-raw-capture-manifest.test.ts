import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalSha256, stableStringify } from '../../../scripts/lib/baseline-report.js';
import { createPerformancePairPlan } from '../../../scripts/lib/performance-pair-plan.js';
import {
  createPerformanceCaptureIndex,
  createPerformanceExperimentEnvironmentCapture,
  createPerformanceQualificationCapture,
  createPerformanceRawCaptureManifest,
  createPerformanceTransportCapture,
  readPerformanceRawCaptureManifest,
  validatePerformanceManifestRunJoin,
  validatePerformanceQualificationCapture,
  validatePerformanceRawCaptureManifest,
  writePerformanceRawCaptureManifest
} from '../../../scripts/lib/performance-raw-capture-manifest.js';

const directories: string[] = [];
const sourceSha = 'a'.repeat(40);
const policyHash = 'b'.repeat(64);
const experimentId = '123e4567-e89b-42d3-a456-426614174010';

afterEach(async () => Promise.all(directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true }))));

async function temporaryDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'raw-manifest-v2-'));
  directories.push(directory);
  return directory;
}

function checksumBody<T extends Record<string, unknown>>(body: T) {
  return { ...body, checksum: canonicalSha256(body) };
}

function fixture() {
  let session = 0;
  const pairPlan = createPerformancePairPlan({ experimentId, backend: 'canvas2d', createSessionId: () => `session-${++session}` });
  const entries = [
    { path: 'main/index.js', bytes: 1, sha256: '1'.repeat(64) },
    { path: 'preload/index.js', bytes: 2, sha256: '2'.repeat(64) },
    { path: 'renderer/assets/main-a.js', bytes: 3, sha256: '3'.repeat(64) },
    { path: 'renderer/assets/worker-entry-a.js', bytes: 4, sha256: '4'.repeat(64) }
  ];
  const buildManifest = {
    schemaVersion: 2,
    sourceSha,
    variants: [
      { id: 'production', harness: false, instrumentation: false, bundle: { sha256: canonicalSha256(entries), entries } },
      { id: 'harness-control', harness: true, instrumentation: false, bundle: { sha256: canonicalSha256([{ path: 'control.txt', bytes: 0, sha256: '5'.repeat(64) }]), entries: [{ path: 'control.txt', bytes: 0, sha256: '5'.repeat(64) }] } },
      { id: 'instrumented', harness: true, instrumentation: true, bundle: { sha256: canonicalSha256([{ path: 'instrumented.txt', bytes: 0, sha256: '6'.repeat(64) }]), entries: [{ path: 'instrumented.txt', bytes: 0, sha256: '6'.repeat(64) }] } }
    ]
  };
  const productionBundleBody = {
    schemaVersion: 1,
    sourceSha,
    build: { id: 'production', harness: false, instrumentation: false, bundleSha256: buildManifest.variants[0].bundle.sha256 },
    codeByteTotal: 10,
    codeRoots: [
      { id: 'main', entrypoint: entries[0], byteTotal: 1, entries: [entries[0]], sha256: canonicalSha256([entries[0]]) },
      { id: 'preload', entrypoint: entries[1], byteTotal: 2, entries: [entries[1]], sha256: canonicalSha256([entries[1]]) },
      { id: 'renderer', entrypoint: entries[2], byteTotal: 3, entries: [entries[2]], sha256: canonicalSha256([entries[2]]) },
      { id: 'worker', entrypoint: entries[3], byteTotal: 4, entries: [entries[3]], sha256: canonicalSha256([entries[3]]) }
    ]
  };
  const productionBundleEvidence = checksumBody(productionBundleBody);
  const buildCommandLedger = {
    schemaVersion: 1,
    sourceSha,
    entries: ['production', 'harness-control', 'instrumented'].map((buildId, index) => ({ sequence: index + 1, operationId: 'build-spawn', buildId }))
  };
  const performanceLedger: any[] = [];
  const environmentCapture = createPerformanceExperimentEnvironmentCapture({
    experimentId, sourceSha, policyHash, scopeKind: 'experiment',
    rawKinds: [{ rawKind: 'environment-observation', rows: [{
      sourceSha, policyHash, experimentId, experimentRole: 'ci-integrity', captureKind: 'experiment-environment',
      scopeKind: 'experiment', scopeId: experimentId, source: 'external-monitor', sourceSequence: 1,
      clockDomain: 'runner', runnerReceiptSequence: 1, observedAt: 1, observationKind: 'initial-snapshot',
      rawAdapterKind: 'external-host-snapshot-v1',
      rawObservation: {
        staticIdentity: { host: {}, runtime: {}, gpu: {}, switches: {} },
        dynamicState: { power: {}, display: {}, refreshRate: null, devicePixelRatio: null, thermal: {}, gpuSwitch: {} }
      },
      staticIdentity: { host: {}, runtime: {}, gpu: {}, switches: {} },
      dynamicState: { power: {}, display: {}, refreshRate: null, devicePixelRatio: null, thermal: {}, gpuSwitch: {} }
    }] }]
  });
  const transportCaptures = [1, 2].map((ledgerSequence) => {
    const operationId = ledgerSequence === 1 ? 'generic-transport-spawn' : 'electron-harness-spawn';
    const observationBoundaryId = `transport-${ledgerSequence}`;
    const binding = {
      sourceSha, policyHash, experimentId, experimentRole: 'ci-integrity', captureKind: 'transport',
      scopeKind: 'ledger-operation', scopeId: ledgerSequence, ledgerSequence, operationId, observationBoundaryId
    } as const;
    const processBinding = { ...binding } as Record<string, unknown>;
    delete processBinding.observationBoundaryId;
    const rawKinds: any[] = [{ rawKind: 'process-observation', rows: [{
      ...processBinding, observationOrdinal: 1, observedAt: 1, observationKind: 'membership', observationSource: 'external',
      adapterId: 'external-membership-v1', subjectKind: 'transport', pid: 42 + ledgerSequence,
      creationIdentity: `created-${ledgerSequence}`, processIdentity: `external:${42 + ledgerSequence}:created-${ledgerSequence}`,
      rawAdapterKind: 'external-process-membership', rawIdentity: { pid: 42 + ledgerSequence, creationIdentity: `created-${ledgerSequence}` },
      rawMembership: { spawnBoundary: {}, rendererEvaluation: {}, ancestry: {}, processGroup: null, job: null, pathIdentity: {} },
      processClass: 'application-renderer', ownership: 'application-owned', alive: true
    }] }];
    if (ledgerSequence === 2) {
      const currentState = { power: {}, display: {}, refreshRate: null, devicePixelRatio: null, thermal: {}, gpuSwitch: {} };
      rawKinds.push({ rawKind: 'environment-observation', rows: [{
        ...binding, source: 'electron-main', sourceSequence: 1, clockDomain: 'electron-main', runnerReceiptSequence: 1,
        observedAt: 2, observationKind: 'initial-snapshot', rawAdapterKind: 'electron-environment-v1',
        rawObservation: { launchId: 'launch-2', callSequence: 1, phase: 'initial', capturedAt: 2, currentState, eventBoundary: null },
        staticIdentity: currentState, dynamicState: currentState
      }] });
      rawKinds.push({ rawKind: 'controller-operation', rows: [{
        ...binding, controlSequence: 1, operationKind: 'request', clockDomain: 'electron-main', controllerRequestId: 'transport-request',
        channel: 'browser-window', requestKind: 'transport', rawRequest: {}, sentAt: 3
      }, {
        ...binding, controlSequence: 2, operationKind: 'response', clockDomain: 'electron-main', controllerRequestId: 'transport-request',
        channel: 'browser-window', responseKind: 'transport', rawResponse: {}, receivedAt: 4, outcome: 'recorded'
      }] });
    }
    return createPerformanceTransportCapture({
      experimentId, sourceSha, policyHash, captureKind: 'transport', ledgerSequence, operationId, observationBoundaryId, rawKinds
    });
  });
  const environmentIndex = createPerformanceCaptureIndex({
    schemaVersion: 1, experimentId, captureKind: 'experiment-environment', entryCount: 1,
    entries: [{ scopeKind: 'experiment', scopeId: experimentId, relativePath: 'captures/environment.json', checksum: environmentCapture.checksum }]
  });
  const transportIndex = createPerformanceCaptureIndex({
    schemaVersion: 1, experimentId, captureKind: 'transport', entryCount: 2,
    entries: transportCaptures.map((capture, index) => ({ ledgerSequence: index + 1, operationId: capture.operationId, observationBoundaryId: capture.observationBoundaryId, relativePath: `captures/transport-${index + 1}.json`, checksum: capture.checksum }))
  });
  const emptyBackendIndex = (captureKind: 'sentinel' | 'external-metric' | 'workload' | 'metric-session', schemaVersion: number) => createPerformanceCaptureIndex({
    schemaVersion, experimentId, captureKind, sourceSha, policyHash, backend: 'canvas2d', pairPlanChecksum: pairPlan.checksum,
    entryCount: 0, entries: []
  });
  const indexes = {
    sentinel: emptyBackendIndex('sentinel', 7),
    externalMetric: emptyBackendIndex('external-metric', 4),
    workload: emptyBackendIndex('workload', 9),
    metricSession: emptyBackendIndex('metric-session', 2)
  };
  const paths = {
    buildManifest: 'members/build-manifest.json', productionBundleEvidence: 'members/production-bundle.json',
    buildCommandLedger: 'members/build-ledger.json', performanceLedger: 'members/performance-ledger.json',
    pairPlan: 'members/canvas-pair-plan.json', environmentIndex: 'indexes/environment.json', transportIndex: 'indexes/transport.json',
    sentinel: 'indexes/canvas-sentinel.json', externalMetric: 'indexes/canvas-external.json', workload: 'indexes/canvas-workload.json', metricSession: 'indexes/canvas-session.json'
  };
  const references = {
    buildManifest: { relativePath: paths.buildManifest, checksum: canonicalSha256(buildManifest) },
    productionBundleEvidence: { relativePath: paths.productionBundleEvidence, checksum: productionBundleEvidence.checksum },
    buildCommandLedger: { relativePath: paths.buildCommandLedger, checksum: canonicalSha256(buildCommandLedger) },
    performanceLedger: { relativePath: paths.performanceLedger, checksum: canonicalSha256(performanceLedger) },
    qualificationEvidence: null,
    experimentEvidence: { indexes: {
      environment: { relativePath: paths.environmentIndex, checksum: environmentIndex.checksum },
      transport: { relativePath: paths.transportIndex, checksum: transportIndex.checksum }
    } },
    backendFamilies: [{
      backend: 'canvas2d', pairPlan: { relativePath: paths.pairPlan, checksum: pairPlan.checksum },
      indexes: Object.fromEntries(Object.entries(indexes).map(([key, index]) => [key, { relativePath: paths[key as keyof typeof paths], checksum: index.checksum }]))
    }]
  };
  const manifestInput = {
    mode: 'ci-core', finalizationPurpose: 'capacity-fixture',
    evaluationContext: { experimentId, experimentRole: 'ci-integrity', sourceSha, policyHash },
    semanticAuthority: { generatedAt: '2026-07-12T00:00:00.000Z', repository: {}, environment: {}, inputs: {}, reset: {}, seed: {} },
    evidenceProvenance: {
      kind: 'capacity-fixture', fixtureId: 'raw-manifest-reader', scenarioId: 'empty-topology', seedHash: 'e'.repeat(64),
      runtimeProjection: {
        provider: 'github-actions', sourceSha, analysisSha256: 'd'.repeat(64), repository: 'owner/repo', workflowRef: 'workflow.yml@refs/heads/main',
        workflowRunId: '1', workflowRunAttempt: 1, eventName: 'workflow_dispatch', producer: { jobId: 'performance', targetId: null, artifactName: 'captures' }
      }
    },
    backendFamilies: ['canvas2d'], pairPlansChecksum: canonicalSha256([pairPlan]), memberReferences: references
  };
  return { pairPlan, buildManifest, productionBundleEvidence, buildCommandLedger, performanceLedger, environmentCapture, transportCaptures, environmentIndex, transportIndex, indexes, paths, manifestInput };
}

async function writeFixture(directory: string, data: ReturnType<typeof fixture>) {
  const artifacts: Array<[string, unknown]> = [
    [data.paths.buildManifest, data.buildManifest], [data.paths.productionBundleEvidence, data.productionBundleEvidence],
    [data.paths.buildCommandLedger, data.buildCommandLedger], [data.paths.performanceLedger, data.performanceLedger],
    [data.paths.pairPlan, data.pairPlan], [data.paths.environmentIndex, data.environmentIndex], [data.paths.transportIndex, data.transportIndex],
    [data.paths.sentinel, data.indexes.sentinel], [data.paths.externalMetric, data.indexes.externalMetric],
    [data.paths.workload, data.indexes.workload], [data.paths.metricSession, data.indexes.metricSession],
    ['captures/environment.json', data.environmentCapture], ['captures/transport-1.json', data.transportCaptures[0]], ['captures/transport-2.json', data.transportCaptures[1]]
  ];
  for (const [relativePath, value] of artifacts) {
    const absolute = path.join(directory, relativePath);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, `${stableStringify(value)}\n`);
  }
}

describe('performance raw capture manifest v2', () => {
  it('reads only sealed references and returns the frozen capture-set topology', async () => {
    const directory = await temporaryDirectory();
    const data = fixture();
    await writeFixture(directory, data);
    const written = await writePerformanceRawCaptureManifest({ outputDirectory: directory, ...data.manifestInput });
    const captureSet = await readPerformanceRawCaptureManifest({ outputDirectory: directory });
    expect(written.manifest.schemaVersion).toBe(2);
    expect(captureSet).toMatchObject({
      manifest: { pairPlansChecksum: data.manifestInput.pairPlansChecksum },
      experimentEvidence: { captures: { transport: [{ ledgerSequence: 1 }, { ledgerSequence: 2 }] } },
      backendFamilies: { canvas2d: { pairPlan: { schemaVersion: 3 }, indexes: { sentinel: { entryCount: 0 } } } }
    });
    expect(Object.isFrozen(captureSet.experimentEvidence.captures.environment)).toBe(true);
  });

  it('rejects v1, aliased paths, and tampered referenced bodies', async () => {
    const data = fixture();
    const manifest = createPerformanceRawCaptureManifest(data.manifestInput);
    expect(validatePerformanceRawCaptureManifest(manifest)).toEqual(manifest);
    expect(() => validatePerformanceRawCaptureManifest({ ...manifest, schemaVersion: 1 })).toThrow(/schema version/);
    const aliased = structuredClone(data.manifestInput) as Record<string, any>;
    aliased.memberReferences.performanceLedger.relativePath = aliased.memberReferences.buildCommandLedger.relativePath.toUpperCase();
    expect(() => createPerformanceRawCaptureManifest(aliased)).toThrow(/duplicate or aliased path/);

    const directory = await temporaryDirectory();
    await writeFixture(directory, data);
    await writePerformanceRawCaptureManifest({ outputDirectory: directory, ...data.manifestInput });
    await fs.writeFile(path.join(directory, data.paths.environmentIndex), '{}\n');
    await expect(readPerformanceRawCaptureManifest({ outputDirectory: directory })).rejects.toThrow(/checksum|internal checksum/);
  });

  it('rejects an empty publication ledger and a symlinked manifest before parsing', async () => {
    const directory = await temporaryDirectory();
    const data = fixture();
    const runtimeProjection = data.manifestInput.evidenceProvenance.runtimeProjection;
    data.manifestInput.finalizationPurpose = 'publication';
    data.manifestInput.evidenceProvenance = { kind: 'runtime-capture', captureProvenance: runtimeProjection } as any;
    await writeFixture(directory, data);
    await writePerformanceRawCaptureManifest({ outputDirectory: directory, ...data.manifestInput });
    await expect(readPerformanceRawCaptureManifest({ outputDirectory: directory })).rejects.toThrow(/publication performance ledger must not be empty/);

    const symlinkDirectory = await temporaryDirectory();
    await fs.symlink(path.join(directory, 'performance-raw-capture-manifest.json'), path.join(symlinkDirectory, 'performance-raw-capture-manifest.json'));
    await expect(readPerformanceRawCaptureManifest({ outputDirectory: symlinkDirectory })).rejects.toThrow(/must resolve directly to a regular file/);
  });

  it('rejects a shared JavaScript chunk assigned to the wrong production code root', async () => {
    const directory = await temporaryDirectory();
    const data = fixture();
    const chunk = { path: 'renderer/assets/chunk-a.js', bytes: 5, sha256: '7'.repeat(64) };
    const productionBundle = data.buildManifest.variants[0].bundle;
    productionBundle.entries.splice(2, 0, chunk);
    productionBundle.sha256 = canonicalSha256(productionBundle.entries);
    data.productionBundleEvidence.build.bundleSha256 = productionBundle.sha256;
    data.productionBundleEvidence.codeByteTotal += chunk.bytes;
    const workerRoot = data.productionBundleEvidence.codeRoots[3];
    workerRoot.entries.unshift(chunk);
    workerRoot.byteTotal += chunk.bytes;
    workerRoot.sha256 = canonicalSha256(workerRoot.entries);
    const productionBody = structuredClone(data.productionBundleEvidence) as Record<string, unknown>;
    delete productionBody.checksum;
    data.productionBundleEvidence.checksum = canonicalSha256(productionBody);
    data.manifestInput.memberReferences.buildManifest.checksum = canonicalSha256(data.buildManifest);
    data.manifestInput.memberReferences.productionBundleEvidence.checksum = data.productionBundleEvidence.checksum;
    await writeFixture(directory, data);
    await writePerformanceRawCaptureManifest({ outputDirectory: directory, ...data.manifestInput });
    await expect(readPerformanceRawCaptureManifest({ outputDirectory: directory })).rejects.toThrow(/assigned to the wrong code root/);
  });

  it('compares every canonical run-join field and variant identity against its ledger launch', () => {
    const join = {
      sourceSha,
      policyHash,
      experimentId,
      pairPlanChecksum: 'c'.repeat(64),
      ledgerSequence: 8,
      experimentRole: 'ci-integrity',
      metricSessionId: 'session-1',
      comparisonKind: 'harness-overhead',
      backend: 'canvas2d',
      pairIndex: 1,
      attemptIndex: 1,
      comparisonSide: 'A',
      buildVariant: 'production',
      ordinal: 1,
      runId: 'run-1',
      externalExecutionId: '123e4567-e89b-42d3-a456-426614174011',
      observationBoundaryId: 'boundary-1',
      browserPid: 42,
      browserCreationTime: 'created'
    };
    const ledgerEntry = { ...join, sequence: join.ledgerSequence } as Record<string, any>;
    delete ledgerEntry.ledgerSequence;
    expect(validatePerformanceManifestRunJoin(join, ledgerEntry)).toBe(true);
    const canonicalFields = [
      'sourceSha', 'policyHash', 'experimentId', 'pairPlanChecksum', 'ledgerSequence',
      'experimentRole', 'metricSessionId', 'comparisonKind', 'backend', 'pairIndex',
      'attemptIndex', 'comparisonSide', 'buildVariant', 'ordinal', 'runId',
      'externalExecutionId', 'observationBoundaryId'
    ];
    for (const field of canonicalFields) {
      const changed = structuredClone(join) as Record<string, any>;
      changed[field] = typeof changed[field] === 'number' ? changed[field] + 1 : `${changed[field]}-changed`;
      expect(() => validatePerformanceManifestRunJoin(changed, ledgerEntry), field).toThrow(new RegExp(field));
    }
    const changedBrowserPid = { ...join, browserPid: 43 };
    expect(() => validatePerformanceManifestRunJoin(changedBrowserPid, ledgerEntry)).toThrow(/browser identity/);
    const harnessJoin = {
      ...join,
      buildVariant: 'harness-control',
      launchId: '123e4567-e89b-42d3-a456-426614174012',
      executionId: '123e4567-e89b-42d3-a456-426614174013'
    };
    const harnessLedger = { ...ledgerEntry, buildVariant: 'harness-control', launchId: harnessJoin.launchId, executionId: harnessJoin.executionId };
    expect(validatePerformanceManifestRunJoin(harnessJoin, harnessLedger)).toBe(true);
    expect(() => validatePerformanceManifestRunJoin({ ...harnessJoin, executionId: 'changed' }, harnessLedger)).toThrow(/launch identity/);
  });

  it('derives process liveness and health state from the live rawHealth carrier', () => {
    const data = fixture();
    const body = structuredClone(data.transportCaptures[0]) as Record<string, any>;
    delete body.schemaVersion;
    delete body.checksum;
    const membership = body.rawKinds[0].rows[0];
    const health = {
      ...membership,
      observationOrdinal: 2,
      observedAt: 2,
      observationKind: 'health',
      adapterId: 'external-health-v1',
      rawAdapterKind: 'external-process-health',
      rawHealth: { alive: true, status: 'ready', exitObservation: null },
      alive: true,
      healthState: 'live'
    };
    delete health.rawMembership;
    body.rawKinds[0].rows.push(health);
    expect(() => createPerformanceTransportCapture(body)).not.toThrow();

    const forged = structuredClone(body) as Record<string, any>;
    forged.rawKinds[0].rows[1].rawHealth = {
      alive: false,
      status: 'dead',
      exitObservation: { kind: 'exited', exitCode: 1 }
    };
    expect(() => createPerformanceTransportCapture(forged)).toThrow(/alive does not match policy|healthState does not match its raw health projection/);
  });

  it('seals the compact qualification ingest body separately from its wrapper checksum', () => {
    const adapterIdentity = { vendor: 'vendor', architecture: null, device: 'device', description: null };
    const limits = { maxTextureDimension2D: 8192, maxBindGroups: 4 };
    const backendExecutionIdentity = {
      backend: 'webgpu', driver: 'webgpu-driver-v1', workerProtocol: 'webgpu-worker-ready-v1',
      adapterIdentity, limits, isFallbackAdapter: false, powerPreference: 'low-power'
    };
    const captureBody = {
      schemaVersion: 1, experimentId, ledgerSequence: 4, observationBoundaryId: 'qualification-4', sourceSha, policyHash,
      buildVariant: 'harness-control', requestedBackend: 'webgpu',
      readinessEvidence: { stages: [{
        backend: 'webgpu', backendReadyObservedAt: 1, sourceSequence: 1, sourceObservedAt: 2,
        terminalFrame: { kind: 'worker-frame-acknowledged', frameToken: 1, submittedAt: 3, acknowledgedAt: 4, outcome: 'webgpu-queue-submit-completed' }
      }] },
      capabilityResult: {
        status: 'available', adapterIdentity, limits, isFallbackAdapter: false,
        strictSelection: { requestedBackend: 'webgpu', powerPreference: 'low-power', forceFallbackAdapter: false }
      },
      transferResult: { status: 'available' },
      selectionResult: { qualificationState: 'qualified-webgpu', unavailabilityBranch: 'none', requestedBackend: 'webgpu', selectedBackend: 'webgpu', observedBackend: 'webgpu', selectionReason: 'webgpu-selected' },
      adapterIdentity, fallbackState: { isFallbackAdapter: false, branch: null }, backendExecutionIdentity,
      cleanup: { controllerFatalReasons: [], listenersRemoved: true, restorationOutcome: 'restored', applicationDescendantClosureEnd: 10, brokerDisposeEnd: 11, rootExitObservedAt: 12, terminalClosureEnd: 13 }
    };
    const capture = createPerformanceQualificationCapture({
      experimentId, sourceSha, policyHash, captureKind: 'qualification', ledgerSequence: 4,
      observationBoundaryId: 'qualification-4', captureBody, captureBodyChecksum: canonicalSha256(captureBody),
      rawKinds: [{ rawKind: 'controller-operation', rows: [{
        sourceSha, policyHash, experimentId, experimentRole: 'reference-comparison', captureKind: 'qualification',
        scopeKind: 'ledger-operation', scopeId: 4, ledgerSequence: 4, operationId: 'electron-harness-spawn',
        observationBoundaryId: 'qualification-4', controlSequence: 1, operationKind: 'request', clockDomain: 'electron-main',
        controllerRequestId: 'request-1', channel: 'browser-window', requestKind: 'qualification', rawRequest: {}, sentAt: 1
      }, {
        sourceSha, policyHash, experimentId, experimentRole: 'reference-comparison', captureKind: 'qualification',
        scopeKind: 'ledger-operation', scopeId: 4, ledgerSequence: 4, operationId: 'electron-harness-spawn',
        observationBoundaryId: 'qualification-4', controlSequence: 2, operationKind: 'response', clockDomain: 'electron-main',
        controllerRequestId: 'request-1', channel: 'browser-window', responseKind: 'qualification', rawResponse: {}, receivedAt: 2,
        outcome: 'recorded'
      }] }]
    });
    expect(validatePerformanceQualificationCapture(structuredClone(capture))).toEqual(capture);
    expect(capture.captureBodyChecksum).toBe(canonicalSha256(capture.captureBody));
    expect(capture.checksum).not.toBe(capture.captureBodyChecksum);
  });
});
