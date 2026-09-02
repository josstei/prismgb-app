import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createPerformanceWorkloadCapture,
  readPerformanceWorkloadCaptures,
  validatePerformanceWorkloadCapture,
  writePerformanceWorkloadCapture
} from '../../../scripts/lib/performance-workload-capture.js';

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true }))));

function join(buildVariant: 'harness-control' | 'instrumented' = 'instrumented') {
  return {
    sourceSha: 'a'.repeat(40), policyHash: 'b'.repeat(64), experimentId: '123e4567-e89b-42d3-a456-426614174001',
    pairPlanChecksum: 'c'.repeat(64), ledgerSequence: 30, experimentRole: 'reference-comparison', metricSessionId: 'workload-session-1',
    comparisonKind: 'instrumentation-overhead', backend: 'webgpu', pairIndex: 1, attemptIndex: 1, comparisonSide: 'B',
    buildVariant, ordinal: 4, runId: 'workload-run-1', externalExecutionId: '123e4567-e89b-42d3-a456-426614174002',
    observationBoundaryId: 'workload-window-1', launchId: '123e4567-e89b-42d3-a456-426614174003',
    executionId: '123e4567-e89b-42d3-a456-426614174004'
  } as const;
}

function input() {
  const runJoin = join();
  const common = {
    sourceSha: runJoin.sourceSha, policyHash: runJoin.policyHash, experimentId: runJoin.experimentId,
    pairPlanChecksum: runJoin.pairPlanChecksum, ledgerSequence: runJoin.ledgerSequence, experimentRole: runJoin.experimentRole,
    scopeKind: 'run', scopeId: runJoin.runId, captureKind: 'workload', runId: runJoin.runId,
    metricSessionId: runJoin.metricSessionId, comparisonKind: runJoin.comparisonKind, backend: runJoin.backend,
    pairIndex: runJoin.pairIndex, attemptIndex: runJoin.attemptIndex, comparisonSide: runJoin.comparisonSide,
    buildVariant: runJoin.buildVariant, launchOrdinal: runJoin.ordinal, externalExecutionId: runJoin.externalExecutionId,
    observationBoundaryId: runJoin.observationBoundaryId
  } as const;
  return {
    experimentId: runJoin.experimentId, sourceSha: runJoin.sourceSha, policyHash: runJoin.policyHash,
    captureKind: 'workload', join: runJoin,
    rawKinds: [
      { rawKind: 'source-opportunity', rows: [
        { ...common, captureOrdinal: 1, eventKind: 'source-opportunity', launchId: runJoin.launchId, measurementWindowId: 'window-1', measurementEpochId: 'epoch-1', sourceSequence: 1, diagnosticFrameId: 'frame-1', mediaTime: 0, sessionPresent: true, sessionActive: true, duplicateMediaTime: false, readyState: 4, hasCurrentData: true },
        { ...common, captureOrdinal: 2, eventKind: 'advisory-disposition', launchId: runJoin.launchId, measurementWindowId: 'window-1', measurementEpochId: 'epoch-1', sourceSequence: 1, diagnosticFrameId: 'frame-1', advisoryOutcome: 'accepted', advisoryFrameToken: null }
      ] },
      { rawKind: 'controller-operation', rows: [{ ...common, controlSequence: 1, operationKind: 'control-write', clockDomain: 'renderer-performance-now-v1', writeKind: 'backend-ready', rawWrite: { kind: 'backend-ready', launchId: runJoin.launchId, observedAt: 3, requestedBackend: 'webgpu', selectedBackend: 'webgpu', selectionReason: 'webgpu-selected', backendExecutionIdentity: { backend: 'webgpu', driver: 'webgpu-driver-v1', workerProtocol: 'webgpu-worker-ready-v1', adapterIdentity: { vendor: null, architecture: null, device: null, description: null }, limits: { maxTextureDimension2D: 8192, maxBindGroups: 4 }, isFallbackAdapter: false, powerPreference: 'low-power' } }, writtenAt: 3, outcome: 'recorded' }] }
    ]
  } as const;
}

function delegatedInput() {
  const value = structuredClone(input()) as Record<string, any>;
  const source = value.rawKinds[0].rows[0];
  const identity = {
    launchId: source.launchId,
    measurementWindowId: source.measurementWindowId,
    measurementEpochId: source.measurementEpochId,
    sourceSequence: source.sourceSequence,
    diagnosticFrameId: source.diagnosticFrameId
  };
  const branch: Record<string, any> = {
    ...source,
    captureOrdinal: 3,
    eventKind: 'session-branch',
    ...identity,
    workerPresent: true,
    workerReady: true,
    outstandingFrameCount: 0,
    outstandingFrameLimit: 2,
    bitmapOutcome: 'created',
    canvasDrawOutcome: 'not-applicable',
    framePostOutcome: 'posted'
  };
  for (const key of ['mediaTime', 'sessionPresent', 'sessionActive', 'duplicateMediaTime', 'readyState', 'hasCurrentData']) {
    delete branch[key];
  }
  value.rawKinds[0].rows = [
    source,
    branch,
    {
      ...value.rawKinds[0].rows[1],
      captureOrdinal: 4,
      advisoryFrameToken: 1
    }
  ];
  const {
    captureOrdinal: _captureOrdinal,
    eventKind: _eventKind,
    launchId: _launchId,
    mediaTime: _mediaTime,
    sessionPresent: _sessionPresent,
    sessionActive: _sessionActive,
    duplicateMediaTime: _duplicateMediaTime,
    readyState: _readyState,
    hasCurrentData: _hasCurrentData,
    ...common
  } = source;
  value.rawKinds.splice(1, 0,
    {
      rawKind: 'backend-operation',
      rows: [{ ...common, captureOrdinal: 2, ...identity, operationId: 'webgpu-frame-submit', outcome: 'webgpu-queue-submit-completed', frameToken: 1, timingSpanId: null }]
    },
    {
      rawKind: 'worker-message',
      rows: [{ ...common, captureOrdinal: 5, ...identity, messageKind: 'acknowledgement', clockDomain: 'renderer-performance-now-v1', observedAt: 5, frameToken: 1, tagged: true, outcome: 'webgpu-queue-submit-completed' }]
    }
  );
  return value;
}

function allocationRow(value: Record<string, any>, overrides: Record<string, unknown>) {
  const source = value.rawKinds[0].rows[0];
  const {
    captureOrdinal: _captureOrdinal,
    eventKind: _eventKind,
    launchId: _launchId,
    mediaTime: _mediaTime,
    sessionPresent: _sessionPresent,
    sessionActive: _sessionActive,
    duplicateMediaTime: _duplicateMediaTime,
    readyState: _readyState,
    hasCurrentData: _hasCurrentData,
    ...binding
  } = source;
  return {
    ...binding,
    backend: 'webgpu',
    byteKind: 'count-only-unavailable',
    byteValue: null,
    carrier: 'frame-request',
    descriptorSize: null,
    diagnosticFrameId: source.diagnosticFrameId,
    frameToken: 1,
    measurementEpochId: source.measurementEpochId,
    measurementWindowId: source.measurementWindowId,
    operationId: 'bind-group-create',
    outcome: 'success',
    requestOrdinal: 1,
    requestedByteLength: null,
    sourceHeight: null,
    sourceLocationId: 'webgpu-driver:create-bind-group',
    sourceSequence: source.sourceSequence,
    sourceWidth: null,
    textureDescriptor: null,
    ...overrides
  };
}

describe('performance workload capture v9', () => {
  it('seals instrumented raw workload rows without producer summaries', () => {
    const capture = createPerformanceWorkloadCapture(input());
    expect(capture).toMatchObject({ schemaVersion: 9, captureKind: 'workload', join: { buildVariant: 'instrumented' } });
    expect(validatePerformanceWorkloadCapture(structuredClone(capture))).toEqual(capture);
  });

  it('allows harness control but rejects production and foreign capture attribution', () => {
    const control = structuredClone(input()) as Record<string, any>;
    control.join = join('harness-control');
    control.rawKinds[0].rows = control.rawKinds[0].rows.map((row: Record<string, unknown>) => ({
      ...row,
      buildVariant: 'harness-control',
      measurementEpochId: null,
      diagnosticFrameId: null
    }));
    control.rawKinds[1].rows[0].buildVariant = 'harness-control';
    expect(createPerformanceWorkloadCapture(control).join.buildVariant).toBe('harness-control');

    const production = structuredClone(input()) as Record<string, any>;
    production.join = { ...production.join, buildVariant: 'production', browserPid: 42, browserCreationTime: 'created' };
    delete production.join.launchId;
    delete production.join.executionId;
    production.rawKinds[0].rows[0].buildVariant = 'production';
    expect(() => createPerformanceWorkloadCapture(production)).toThrow(/does not permit build variant production|forbids the production build/);

    const foreign = structuredClone(input()) as Record<string, any>;
    foreign.rawKinds[0].rows[0].captureKind = 'sentinel';
    expect(() => createPerformanceWorkloadCapture(foreign)).toThrow(/does not match the run join/);
  });

  it('rejects noncontiguous source and frame ordinals and incomplete frame identity', () => {
    const sourceGap = structuredClone(input()) as Record<string, any>;
    sourceGap.rawKinds[0].rows.forEach((row: Record<string, any>) => { row.sourceSequence = 50; });
    expect(() => createPerformanceWorkloadCapture(sourceGap)).toThrow(/sourceSequence must be contiguous from 1/);

    const captureGap = structuredClone(input()) as Record<string, any>;
    captureGap.rawKinds[0].rows[0].captureOrdinal = 41;
    captureGap.rawKinds[0].rows[1].captureOrdinal = 42;
    expect(() => createPerformanceWorkloadCapture(captureGap)).toThrow(/captureOrdinal must be contiguous from 1/);

    const frameRequest = structuredClone(input()) as Record<string, any>;
    const source = frameRequest.rawKinds[0].rows[0];
    const {
      captureOrdinal: _captureOrdinal, eventKind: _eventKind, launchId: _launchId,
      measurementWindowId, measurementEpochId, sourceSequence, diagnosticFrameId,
      mediaTime: _mediaTime, sessionPresent: _sessionPresent, sessionActive: _sessionActive,
      duplicateMediaTime: _duplicateMediaTime, readyState: _readyState, hasCurrentData: _hasCurrentData,
      ...binding
    } = source;
    const row = {
      ...binding, backend: 'webgpu', byteKind: 'rgba-transfer-footprint', byteValue: 16, carrier: 'frame-request',
      descriptorSize: null, diagnosticFrameId, frameToken: null, measurementEpochId, measurementWindowId,
      operationId: 'video-frame-image-bitmap-request', outcome: 'failed', requestOrdinal: 99, requestedByteLength: null,
      sourceHeight: 2, sourceLocationId: 'video-session:create-image-bitmap', sourceSequence, sourceWidth: 2,
      textureDescriptor: null
    };
    frameRequest.rawKinds.push({ rawKind: 'frame-request', rows: [row] });
    expect(() => createPerformanceWorkloadCapture(frameRequest)).toThrow(/requestOrdinal must be contiguous from 1/);

    const incomplete = structuredClone(frameRequest) as Record<string, any>;
    incomplete.rawKinds.at(-1).rows[0].requestOrdinal = 1;
    delete incomplete.rawKinds.at(-1).rows[0].measurementWindowId;
    delete incomplete.rawKinds.at(-1).rows[0].diagnosticFrameId;
    delete incomplete.rawKinds.at(-1).rows[0].frameToken;
    expect(() => createPerformanceWorkloadCapture(incomplete)).toThrow(/missing measurementWindowId|missing diagnosticFrameId|missing frameToken/);
  });

  it('enforces the unified source, backend, advisory, and worker capture state machine', () => {
    expect(createPerformanceWorkloadCapture(delegatedInput()).rawKinds).toHaveLength(4);

    const terminalError = delegatedInput();
    terminalError.rawKinds[1].rows[0].outcome = 'failed';
    terminalError.rawKinds[2].rows[0].messageKind = 'error';
    terminalError.rawKinds[2].rows[0].outcome = 'worker-terminal-error';
    expect(() => createPerformanceWorkloadCapture(terminalError)).not.toThrow();

    for (const field of ['messageKind', 'clockDomain', 'outcome']) {
      const forged = delegatedInput();
      forged.rawKinds[2].rows[0][field] = 'FORGED';
      expect(() => createPerformanceWorkloadCapture(forged), field).toThrow(/matches 0 policy row shapes/);
    }

    const sourceAfterBackend = delegatedInput();
    sourceAfterBackend.rawKinds[0].rows[0].captureOrdinal = 2;
    sourceAfterBackend.rawKinds[1].rows[0].captureOrdinal = 1;
    expect(() => createPerformanceWorkloadCapture(sourceAfterBackend)).toThrow(/synchronous capture must occur after source/);

    const backendAfterAdvisory = delegatedInput();
    backendAfterAdvisory.rawKinds[1].rows[0].captureOrdinal = 5;
    backendAfterAdvisory.rawKinds[2].rows[0].captureOrdinal = 2;
    expect(() => createPerformanceWorkloadCapture(backendAfterAdvisory)).toThrow(/synchronous capture must occur after source and before advisory/);

    const workerBeforeAdvisory = delegatedInput();
    workerBeforeAdvisory.rawKinds[2].rows[0].captureOrdinal = 4;
    workerBeforeAdvisory.rawKinds[0].rows[2].captureOrdinal = 5;
    expect(() => createPerformanceWorkloadCapture(workerBeforeAdvisory)).toThrow(/worker terminal must occur after advisory/);

    const unboundBackend = structuredClone(input()) as Record<string, any>;
    const delegated = delegatedInput();
    unboundBackend.rawKinds.splice(1, 0, delegated.rawKinds[1]);
    unboundBackend.rawKinds[0].rows[1].captureOrdinal = 3;
    expect(() => createPerformanceWorkloadCapture(unboundBackend)).toThrow(/backend activity without a delegated session branch/);
  });

  it('accepts only the pre-token bitmap failure null and requires matching post-token allocation evidence', () => {
    const successful = delegatedInput();
    successful.rawKinds.push({ rawKind: 'frame-request', rows: [
      allocationRow(successful, {
        operationId: 'video-frame-image-bitmap-request',
        sourceLocationId: 'video-session:create-image-bitmap',
        requestOrdinal: 1,
        byteKind: 'rgba-transfer-footprint',
        byteValue: 24,
        sourceWidth: 2,
        sourceHeight: 3
      }),
      allocationRow(successful, {
        operationId: 'uniform-float32-array',
        sourceLocationId: 'webgpu-driver:uniform-float32-array',
        requestOrdinal: 2,
        byteKind: 'requested-byte-length',
        byteValue: 16,
        requestedByteLength: 16
      }),
      allocationRow(successful, { requestOrdinal: 3 }),
      allocationRow(successful, {
        operationId: 'render-pass-plan-materialization',
        sourceLocationId: 'webgpu-driver:materialize-render-plan',
        requestOrdinal: 4
      })
    ] });
    expect(() => createPerformanceWorkloadCapture(successful)).not.toThrow();

    const failedBeforeToken = structuredClone(input()) as Record<string, any>;
    failedBeforeToken.rawKinds.push({ rawKind: 'frame-request', rows: [allocationRow(failedBeforeToken, {
      operationId: 'video-frame-image-bitmap-request',
      sourceLocationId: 'video-session:create-image-bitmap',
      outcome: 'failed',
      frameToken: null,
      byteKind: 'rgba-transfer-footprint',
      byteValue: 24,
      sourceWidth: 2,
      sourceHeight: 3
    })] });
    expect(() => createPerformanceWorkloadCapture(failedBeforeToken)).not.toThrow();

    const successWithoutToken = structuredClone(successful) as Record<string, any>;
    successWithoutToken.rawKinds.at(-1).rows[0].frameToken = null;
    expect(() => createPerformanceWorkloadCapture(successWithoutToken)).toThrow(/invalid frame-token state/);

    const failedWithToken = structuredClone(failedBeforeToken) as Record<string, any>;
    failedWithToken.rawKinds.at(-1).rows[0].frameToken = 1;
    expect(() => createPerformanceWorkloadCapture(failedWithToken)).toThrow(/invalid frame-token state/);

    const postTokenNull = structuredClone(successful) as Record<string, any>;
    postTokenNull.rawKinds.at(-1).rows[1].frameToken = null;
    expect(() => createPerformanceWorkloadCapture(postTokenNull)).toThrow(/invalid frame-token state/);

    const mismatched = structuredClone(successful) as Record<string, any>;
    mismatched.rawKinds.at(-1).rows[2].frameToken = 2;
    expect(() => createPerformanceWorkloadCapture(mismatched)).toThrow(/does not bind its source opportunity and advisory token/);
  });

  it('enforces lifecycle phaseSequence and requestOrdinal in their independent domains', () => {
    const lifecycle = delegatedInput();
    const lifecycleBase: Record<string, any> = {
      ...allocationRow(lifecycle, {}),
      carrier: 'lifecycle-request',
      executionId: lifecycle.join.executionId,
      lifecyclePhase: 'startup',
      phaseSequence: 1
    };
    for (const key of ['measurementWindowId', 'measurementEpochId', 'sourceSequence', 'diagnosticFrameId', 'frameToken']) delete lifecycleBase[key];
    lifecycle.rawKinds.push({ rawKind: 'lifecycle-request', rows: [
      {
        ...lifecycleBase,
        operationId: 'gpu-buffer-request',
        sourceLocationId: 'webgpu-driver:create-buffer',
        requestOrdinal: 1,
        byteKind: 'descriptor-size',
        byteValue: 16,
        descriptorSize: 16
      },
      {
        ...lifecycleBase,
        operationId: 'gpu-texture-request',
        sourceLocationId: 'webgpu-driver:create-texture',
        requestOrdinal: 1,
        phaseSequence: 2,
        byteKind: 'logical-texel-footprint',
        byteValue: 64,
        textureDescriptor: { width: 4, height: 4, depth: 1, format: 'rgba8unorm', usage: 'texture-binding', logicalTexelFootprint: 64 }
      },
      {
        ...lifecycleBase,
        operationId: 'gpu-buffer-request',
        sourceLocationId: 'webgpu-driver:create-buffer',
        requestOrdinal: 2,
        phaseSequence: 3,
        byteKind: 'descriptor-size',
        byteValue: 32,
        descriptorSize: 32
      }
    ] });
    expect(() => createPerformanceWorkloadCapture(lifecycle)).not.toThrow();

    const phaseGap = structuredClone(lifecycle) as Record<string, any>;
    phaseGap.rawKinds.at(-1).rows[2].phaseSequence = 4;
    expect(() => createPerformanceWorkloadCapture(phaseGap)).toThrow(/phaseSequence must be contiguous from 1/);

    const duplicatePhase = structuredClone(lifecycle) as Record<string, any>;
    duplicatePhase.rawKinds.at(-1).rows[2].phaseSequence = 2;
    expect(() => createPerformanceWorkloadCapture(duplicatePhase)).toThrow(/phaseSequence must be contiguous from 1/);

    const requestGap = structuredClone(lifecycle) as Record<string, any>;
    requestGap.rawKinds.at(-1).rows[2].requestOrdinal = 3;
    expect(() => createPerformanceWorkloadCapture(requestGap)).toThrow(/requestOrdinal must be contiguous from 1/);

    const duplicateRequest = structuredClone(lifecycle) as Record<string, any>;
    duplicateRequest.rawKinds.at(-1).rows[2].requestOrdinal = 1;
    expect(() => createPerformanceWorkloadCapture(duplicateRequest)).toThrow(/requestOrdinal must be contiguous from 1/);
  });

  it('binds environment source, adapter, observation, and clock domain through policy', () => {
    const value = structuredClone(input()) as Record<string, any>;
    const source = value.rawKinds[0].rows[0];
    const {
      captureOrdinal: _captureOrdinal,
      eventKind: _eventKind,
      launchId: _launchId,
      measurementWindowId: _measurementWindowId,
      measurementEpochId: _measurementEpochId,
      sourceSequence: _sourceSequence,
      diagnosticFrameId: _diagnosticFrameId,
      mediaTime: _mediaTime,
      sessionPresent: _sessionPresent,
      sessionActive: _sessionActive,
      duplicateMediaTime: _duplicateMediaTime,
      readyState: _readyState,
      hasCurrentData: _hasCurrentData,
      ...binding
    } = source;
    const staticIdentity = { host: 'host', runtime: 'runtime', gpu: 'gpu', switches: [] };
    const dynamicState = { power: 'ac', display: 'display', refreshRate: 60, devicePixelRatio: 1, thermal: 'nominal', gpuSwitch: 'stable' };
    const external = {
      ...binding,
      source: 'external-monitor',
      sourceSequence: 1,
      clockDomain: 'runner',
      runnerReceiptSequence: 1,
      observedAt: 1,
      observationKind: 'initial-snapshot',
      rawAdapterKind: 'external-host-snapshot-v1',
      rawObservation: { staticIdentity, dynamicState },
      staticIdentity,
      dynamicState
    };
    value.rawKinds.splice(1, 0, { rawKind: 'environment-observation', rows: [external] });
    expect(() => createPerformanceWorkloadCapture(value)).not.toThrow();

    const closed = structuredClone(value) as Record<string, any>;
    closed.rawKinds[1].rows.push({
      ...binding,
      source: 'external-monitor',
      sourceSequence: 2,
      clockDomain: 'runner',
      runnerReceiptSequence: 2,
      observedAt: 2,
      observationKind: 'cleanup',
      rawAdapterKind: 'external-host-cleanup-v1',
      rawObservation: { cleanupState: 'disposed', lastSourceSequence: 1, remainingPollTimerCount: 0, remainingListenerCount: 0 },
      cleanupState: 'disposed'
    });
    expect(() => createPerformanceWorkloadCapture(closed)).not.toThrow();

    const afterCleanup = structuredClone(closed) as Record<string, any>;
    afterCleanup.rawKinds[1].rows.push({
      ...binding,
      source: 'external-monitor',
      sourceSequence: 3,
      clockDomain: 'runner',
      runnerReceiptSequence: 3,
      observedAt: 3,
      observationKind: 'poll-snapshot',
      rawAdapterKind: 'external-host-snapshot-v1',
      rawObservation: { staticIdentity, dynamicState },
      dynamicState
    });
    expect(() => createPerformanceWorkloadCapture(afterCleanup)).toThrow(/cleanup must be the unique terminal source high-water/);

    const forgedHighWater = structuredClone(closed) as Record<string, any>;
    forgedHighWater.rawKinds[1].rows[1].rawObservation.lastSourceSequence = 2;
    expect(() => createPerformanceWorkloadCapture(forgedHighWater)).toThrow(/cleanup projection does not match its raw cleanup carrier/);

    const wrongClock = structuredClone(value) as Record<string, any>;
    wrongClock.rawKinds[1].rows[0].clockDomain = 'electron-main';
    expect(() => createPerformanceWorkloadCapture(wrongClock)).toThrow(/clockDomain does not match its policy/);

    const electron = structuredClone(value) as Record<string, any>;
    const electronState = { environment: 'state' };
    electron.rawKinds[1].rows[0] = {
      ...binding,
      source: 'electron-main',
      sourceSequence: 1,
      clockDomain: 'electron-main',
      runnerReceiptSequence: 1,
      observedAt: 1,
      observationKind: 'initial-snapshot',
      rawAdapterKind: 'electron-environment-v1',
      rawObservation: { launchId: value.join.launchId, callSequence: 1, phase: 'initial', capturedAt: 1, currentState: electronState, eventBoundary: null },
      staticIdentity: electronState,
      dynamicState: electronState
    };
    expect(() => createPerformanceWorkloadCapture(electron)).not.toThrow();

    const renderer = structuredClone(value) as Record<string, any>;
    renderer.rawKinds[1].rows[0] = {
      ...binding,
      source: 'renderer-heap',
      sourceSequence: 1,
      clockDomain: 'renderer-performance-now-v1',
      runnerReceiptSequence: 1,
      observedAt: 1,
      observationKind: 'renderer-heap',
      rawAdapterKind: 'chromium-performance-memory-v1',
      rawObservation: { observedAt: 1, usedBytes: 4096 },
      usedBytes: 4096
    };
    expect(() => createPerformanceWorkloadCapture(renderer)).not.toThrow();
  });

  it('writes and reads one checksum-bound capture', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'workload-v9-'));
    directories.push(directory);
    const written = await writePerformanceWorkloadCapture({ outputDirectory: directory, ...input() });
    await expect(readPerformanceWorkloadCaptures({ outputDirectory: directory })).resolves.toEqual([{ relativePath: written.relativePath, capture: written.capture }]);
  });
});
