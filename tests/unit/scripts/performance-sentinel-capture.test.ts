import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createPerformanceSentinelCapture,
  readPerformanceSentinelCaptures,
  validatePerformanceSentinelCapture,
  writePerformanceSentinelCapture
} from '../../../scripts/lib/performance-sentinel-capture.js';

const directories: string[] = [];
const sourceSha = 'a'.repeat(40);
const policyHash = 'b'.repeat(64);

afterEach(async () => Promise.all(directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true }))));

function join() {
  return {
    sourceSha,
    policyHash,
    experimentId: '123e4567-e89b-42d3-a456-426614174001',
    pairPlanChecksum: 'c'.repeat(64),
    ledgerSequence: 8,
    experimentRole: 'ci-integrity',
    metricSessionId: 'sentinel-session-1',
    comparisonKind: 'harness-overhead',
    backend: 'webgpu',
    pairIndex: 1,
    attemptIndex: 1,
    comparisonSide: 'B',
    buildVariant: 'harness-control',
    ordinal: 2,
    runId: 'sentinel-run-1',
    externalExecutionId: '123e4567-e89b-42d3-a456-426614174002',
    observationBoundaryId: 'sentinel-window-1',
    launchId: '123e4567-e89b-42d3-a456-426614174003',
    executionId: '123e4567-e89b-42d3-a456-426614174004'
  } as const;
}

function binding() {
  const value = join();
  return {
    sourceSha: value.sourceSha,
    policyHash: value.policyHash,
    experimentId: value.experimentId,
    pairPlanChecksum: value.pairPlanChecksum,
    ledgerSequence: value.ledgerSequence,
    experimentRole: value.experimentRole,
    scopeKind: 'run',
    scopeId: value.runId,
    captureKind: 'sentinel',
    runId: value.runId,
    metricSessionId: value.metricSessionId,
    comparisonKind: value.comparisonKind,
    backend: value.backend,
    pairIndex: value.pairIndex,
    attemptIndex: value.attemptIndex,
    comparisonSide: value.comparisonSide,
    buildVariant: value.buildVariant,
    launchOrdinal: value.ordinal,
    externalExecutionId: value.externalExecutionId,
    observationBoundaryId: value.observationBoundaryId
  } as const;
}

function input() {
  const runJoin = join();
  const common = binding();
  return {
    experimentId: runJoin.experimentId,
    sourceSha,
    policyHash,
    captureKind: 'sentinel',
    join: runJoin,
    rawKinds: [
      { rawKind: 'backend-operation', rows: [{ ...common, captureOrdinal: 2, callbackOrdinal: 1, operationId: 'frame-post', observedAt: 2 }] },
      { rawKind: 'worker-message', rows: [{ ...common, captureOrdinal: 3, messageOrdinal: 1, messageKind: 'acknowledgement', clockDomain: 'external-performance-now-v1', observedAt: 3, tagged: true, frameToken: 1, outcome: 'webgpu-queue-submit-completed' }] },
      { rawKind: 'sentinel-observation', rows: [
        { ...common, captureOrdinal: 1, observationBoundaryId: common.observationBoundaryId, observationKind: 'boundary', observedAt: 1, boundary: 'window-start' },
        { ...common, captureOrdinal: 4, observationBoundaryId: common.observationBoundaryId, observationKind: 'callback', observedAt: 4, callbackOrdinal: 1, mediaTime: 0 },
        { ...common, captureOrdinal: 5, observationBoundaryId: common.observationBoundaryId, observationKind: 'boundary', observedAt: 5, boundary: 'window-close' },
        { ...common, captureOrdinal: 6, observationBoundaryId: common.observationBoundaryId, observationKind: 'pending', observedAt: 6, pendingCount: 0 },
        { ...common, captureOrdinal: 7, observationBoundaryId: common.observationBoundaryId, observationKind: 'closure', observedAt: 7, closureReason: 'window-complete' }
      ] },
      { rawKind: 'controller-operation', rows: [
        { ...common, controlSequence: 1, operationKind: 'control-write', clockDomain: 'renderer-performance-now-v1', writeKind: 'backend-ready', rawWrite: { kind: 'backend-ready', launchId: runJoin.launchId, observedAt: 1, requestedBackend: 'webgpu', selectedBackend: 'webgpu', selectionReason: 'webgpu-selected', backendExecutionIdentity: { backend: 'webgpu', driver: 'webgpu-driver-v1', workerProtocol: 'webgpu-worker-ready-v1', adapterIdentity: { vendor: null, architecture: null, device: null, description: null }, limits: { maxTextureDimension2D: 8192, maxBindGroups: 4 }, isFallbackAdapter: false, powerPreference: 'low-power' } }, writtenAt: 1, outcome: 'recorded' },
        { ...common, controlSequence: 2, operationKind: 'controller-lifecycle', clockDomain: 'electron-main', lifecyclePhase: 'finalize', rawLifecycleEvent: { sequence: 1, event: 'finalize', at: 8 }, observedAt: 8, outcome: 'recorded' }
      ] }
    ]
  } as const;
}

describe('performance sentinel capture v8', () => {
  it('seals an exact run join and registry-ordered raw groups', () => {
    const capture = createPerformanceSentinelCapture(input());
    expect(capture).toMatchObject({ schemaVersion: 8, captureKind: 'sentinel', join: { ordinal: 2 }, checksum: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(validatePerformanceSentinelCapture(structuredClone(capture))).toEqual(capture);
    expect(Object.isFrozen(capture.rawKinds[0].rows[0])).toBe(true);
  });

  it('accepts production sentinel evidence without harness controller rows', () => {
    const production = structuredClone(input()) as Record<string, any>;
    production.join = {
      ...production.join,
      buildVariant: 'production',
      browserPid: 42,
      browserCreationTime: 'created'
    };
    delete production.join.launchId;
    delete production.join.executionId;
    production.rawKinds = production.rawKinds
      .filter((group: Record<string, any>) => group.rawKind !== 'controller-operation')
      .map((group: Record<string, any>) => ({
        ...group,
        rows: group.rows.map((row: Record<string, any>) => ({
          ...row,
          buildVariant: 'production',
          ...(group.rawKind === 'worker-message' ? { tagged: false, frameToken: null } : {})
        }))
      }));
    expect(createPerformanceSentinelCapture(production).join).toMatchObject({
      buildVariant: 'production',
      browserPid: 42,
      browserCreationTime: 'created'
    });
  });

  it('rejects forged external-sentinel worker discriminants', () => {
    for (const outcome of ['worker-message-error', 'worker-error-event']) {
      const terminalError = structuredClone(input()) as Record<string, any>;
      terminalError.rawKinds[1].rows[0].messageKind = 'error';
      terminalError.rawKinds[1].rows[0].outcome = outcome;
      expect(() => createPerformanceSentinelCapture(terminalError), outcome).not.toThrow();
    }
    for (const field of ['messageKind', 'clockDomain', 'outcome']) {
      const forged = structuredClone(input()) as Record<string, any>;
      forged.rawKinds[1].rows[0][field] = 'FORGED';
      expect(() => createPerformanceSentinelCapture(forged), field).toThrow(/matches 0 policy row shapes/);
    }
  });

  it('rejects stale identities, reordered kinds, and legacy fields', () => {
    expect(() => createPerformanceSentinelCapture({ ...input(), runId: 'legacy' } as never)).toThrow(/unknown field runId/);
    const stale = structuredClone(input()) as Record<string, any>;
    stale.rawKinds[0].rows[0].runId = 'other-run';
    expect(() => createPerformanceSentinelCapture(stale)).toThrow(/does not match the run join/);
    const reordered = structuredClone(input()) as Record<string, any>;
    reordered.rawKinds.reverse();
    expect(() => createPerformanceSentinelCapture(reordered)).toThrow(/registry ordered/);

    const unknown = structuredClone(input()) as Record<string, any>;
    unknown.rawKinds[0].rows[0].summary = 1;
    expect(() => createPerformanceSentinelCapture(unknown)).toThrow(/unknown field summary/);

    const missing = structuredClone(input()) as Record<string, any>;
    delete missing.rawKinds[0].rows[0].callbackOrdinal;
    expect(() => createPerformanceSentinelCapture(missing)).toThrow(/missing callbackOrdinal/);

    const unknownOperationOutcome = structuredClone(input()) as Record<string, any>;
    unknownOperationOutcome.rawKinds.at(-1).rows[0].outcome = 'closed';
    expect(() => createPerformanceSentinelCapture(unknownOperationOutcome)).toThrow(/outcome is not registered/);

    const productionController = structuredClone(input()) as Record<string, any>;
    productionController.join.buildVariant = 'production';
    productionController.join.browserPid = 42;
    productionController.join.browserCreationTime = 'created';
    delete productionController.join.launchId;
    delete productionController.join.executionId;
    productionController.rawKinds = [productionController.rawKinds.at(-1)];
    productionController.rawKinds[0].rows[0].buildVariant = 'production';
    expect(() => createPerformanceSentinelCapture(productionController)).toThrow(/not permitted for sentinel/);
  });

  it('writes and reads checksum-named captures without overwrite', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sentinel-v8-'));
    directories.push(directory);
    const written = await writePerformanceSentinelCapture({ outputDirectory: directory, ...input() });
    await expect(writePerformanceSentinelCapture({ outputDirectory: directory, ...input() })).rejects.toMatchObject({ code: 'EEXIST' });
    await expect(readPerformanceSentinelCaptures({ outputDirectory: directory })).resolves.toEqual([{ relativePath: written.relativePath, capture: written.capture }]);
  });
});
