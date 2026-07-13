import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createPerformanceMetricSessionCapture,
  readPerformanceMetricSessionCaptures,
  validatePerformanceMetricSessionCapture,
  writePerformanceMetricSessionCapture
} from '../../../scripts/lib/performance-metric-session-capture.js';

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true }))));

function input() {
  const experimentId = '123e4567-e89b-42d3-a456-426614174001';
  const sourceSha = 'a'.repeat(40);
  const policyHash = 'b'.repeat(64);
  const pairPlanChecksum = 'c'.repeat(64);
  const join = {
    metricSessionId: 'metric-session-1', comparisonKind: 'instrumentation-overhead', backend: 'canvas2d',
    pairIndex: 1, attemptIndex: 2, metricSessionOpenSequence: 20
  } as const;
  return {
    experimentId, sourceSha, policyHash, captureKind: 'metric-session', join,
    rawKinds: [{
      rawKind: 'process-observation',
      rows: [{
        sourceSha, policyHash, experimentId, pairPlanChecksum, experimentRole: 'ci-integrity', scopeKind: 'metric-session',
        scopeId: join.metricSessionId, captureKind: 'metric-session', metricSessionId: join.metricSessionId,
        comparisonKind: join.comparisonKind, backend: join.backend, pairIndex: join.pairIndex, attemptIndex: join.attemptIndex,
        metricSessionOpenSequence: join.metricSessionOpenSequence, observationOrdinal: 1, observedAt: 1,
        observationKind: 'membership', observationSource: 'sampler', adapterId: 'macos-ps-v1', subjectKind: 'sampler',
        pid: 42, creationIdentity: 'created', processIdentity: 'sampler:42', rawAdapterKind: 'macos-ps-v1',
        rawIdentity: { pid: 42, creationIdentity: 'created', cpuTime: '00:00', residentSetKiB: 1024 },
        rawMembership: { adapterId: 'macos-ps-v1', result: null, transitions: [{ sequence: 1, operation: 'attach', at: 1, target: { pid: 42, creationIdentity: 'created', processIdentity: 'sampler:42', counterQuantumSeconds: 0.01 } }] },
        processClass: 'application-renderer', ownership: 'application-owned', alive: true
      }]
    }]
  } as const;
}

describe('performance metric session capture v2', () => {
  it('retains one metric-session-scoped process stream', () => {
    const capture = createPerformanceMetricSessionCapture(input());
    expect(capture).toMatchObject({ schemaVersion: 2, captureKind: 'metric-session', join: { attemptIndex: 2, metricSessionOpenSequence: 20 } });
    expect(validatePerformanceMetricSessionCapture(structuredClone(capture))).toEqual(capture);
  });

  it('rejects run-bound fields, attempt overflow, and stale checksum', () => {
    const runBound = structuredClone(input()) as Record<string, any>;
    (runBound.rawKinds[0].rows[0] as Record<string, unknown>).runId = 'forbidden';
    expect(() => createPerformanceMetricSessionCapture(runBound)).toThrow(/forbids runId/);
    const overflow = structuredClone(input()) as Record<string, any>;
    overflow.join.attemptIndex = 4;
    expect(() => createPerformanceMetricSessionCapture(overflow)).toThrow(/preallocated cardinality/);
    const capture = createPerformanceMetricSessionCapture(input());
    expect(() => validatePerformanceMetricSessionCapture({ ...capture, checksum: 'd'.repeat(64) })).toThrow(/checksum does not match/);
  });

  it('writes and reloads the exact session wrapper', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'metric-session-v2-'));
    directories.push(directory);
    const written = await writePerformanceMetricSessionCapture({ outputDirectory: directory, ...input() });
    await expect(readPerformanceMetricSessionCaptures({ outputDirectory: directory })).resolves.toEqual([{ relativePath: written.relativePath, capture: written.capture }]);
  });
});
