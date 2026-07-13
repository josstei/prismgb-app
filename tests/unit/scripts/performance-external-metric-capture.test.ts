import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createPerformanceExternalMetricCapture,
  readPerformanceExternalMetricCaptures,
  validatePerformanceExternalMetricCapture,
  writePerformanceExternalMetricCapture
} from '../../../scripts/lib/performance-external-metric-capture.js';

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true }))));

function join() {
  return {
    sourceSha: 'a'.repeat(40), policyHash: 'b'.repeat(64), experimentId: '123e4567-e89b-42d3-a456-426614174001',
    pairPlanChecksum: 'c'.repeat(64), ledgerSequence: 9, experimentRole: 'ci-integrity', metricSessionId: 'metric-session-1',
    comparisonKind: 'harness-overhead', backend: 'canvas2d', pairIndex: 1, attemptIndex: 1, comparisonSide: 'A',
    buildVariant: 'production', ordinal: 1, runId: 'metric-run-1', externalExecutionId: '123e4567-e89b-42d3-a456-426614174002',
    observationBoundaryId: 'metric-window-1', browserPid: 42, browserCreationTime: '2026-07-12T00:00:00.000Z'
  } as const;
}

function input() {
  const runJoin = join();
  const common = {
    sourceSha: runJoin.sourceSha, policyHash: runJoin.policyHash, experimentId: runJoin.experimentId,
    pairPlanChecksum: runJoin.pairPlanChecksum, ledgerSequence: runJoin.ledgerSequence, experimentRole: runJoin.experimentRole,
    scopeKind: 'run', scopeId: runJoin.runId, captureKind: 'external-metric', runId: runJoin.runId,
    metricSessionId: runJoin.metricSessionId, comparisonKind: runJoin.comparisonKind, backend: runJoin.backend,
    pairIndex: runJoin.pairIndex, attemptIndex: runJoin.attemptIndex, comparisonSide: runJoin.comparisonSide,
    buildVariant: runJoin.buildVariant, launchOrdinal: runJoin.ordinal, externalExecutionId: runJoin.externalExecutionId,
    observationBoundaryId: runJoin.observationBoundaryId
  } as const;
  const rawSample = { pid: 42, creationIdentity: 'created', cpuTime: '00:00', residentSetKiB: 131072 };
  const rawAuthority = (adapterSample: Record<string, unknown>, readStart: number, readEnd: number) => ({
    adapterSample,
    readStart,
    readEnd
  });
  const processIdentity = `renderer:${runJoin.externalExecutionId}:42`;
  return {
    experimentId: runJoin.experimentId, sourceSha: runJoin.sourceSha, policyHash: runJoin.policyHash,
    captureKind: 'external-metric', join: runJoin,
    rawKinds: [
      { rawKind: 'process-observation', rows: [{ ...common, observationOrdinal: 1, observedAt: 1, observationKind: 'membership', observationSource: 'external', adapterId: 'macos-ps-v1', subjectKind: 'renderer', pid: 42, creationIdentity: 'created', processIdentity, rawAdapterKind: 'macos-ps-v1', rawIdentity: rawSample, rawMembership: rawSample, processClass: 'application-renderer', ownership: 'application-owned', alive: true }] },
      { rawKind: 'cpu-sample', rows: [
        { ...common, ordinal: 1, samplePhase: 'prime', adapterId: 'macos-ps-v1', pid: 42, creationIdentity: 'created', processIdentity, readStart: 1, readEnd: 1.01, counterQuantumSeconds: 0.01, cumulativeCpuSeconds: 0, workingSetMiB: 128, rawAdapterKind: 'macos-ps-v1', rawAdapterSample: rawAuthority(rawSample, 1, 1.01) },
        { ...common, ordinal: 2, samplePhase: 'in-window', adapterId: 'macos-ps-v1', pid: 42, creationIdentity: 'created', processIdentity, readStart: 2, readEnd: 2.01, counterQuantumSeconds: 0.01, cumulativeCpuSeconds: 1, workingSetMiB: 128, rawAdapterKind: 'macos-ps-v1', rawAdapterSample: rawAuthority({ ...rawSample, cpuTime: '00:01' }, 2, 2.01) },
        { ...common, ordinal: 3, samplePhase: 'terminal-closure', adapterId: 'macos-ps-v1', pid: 42, creationIdentity: 'created', processIdentity, readStart: 3, readEnd: 3.01, counterQuantumSeconds: 0.01, cumulativeCpuSeconds: 2, workingSetMiB: 128, rawAdapterKind: 'macos-ps-v1', rawAdapterSample: rawAuthority({ ...rawSample, cpuTime: '00:02' }, 3, 3.01) }
      ] }
    ]
  } as const;
}

describe('performance external metric capture v4', () => {
  it('retains raw process and CPU carrier rows under the canonical run join', () => {
    const capture = createPerformanceExternalMetricCapture(input());
    expect(capture).toMatchObject({ schemaVersion: 4, captureKind: 'external-metric', join: { browserPid: 42 } });
    expect(validatePerformanceExternalMetricCapture(structuredClone(capture))).toEqual(capture);
  });

  it('rejects legacy summaries and cross-run raw rows', () => {
    expect(() => createPerformanceExternalMetricCapture({ ...input(), target: {} } as never)).toThrow(/unknown field target/);
    const stale = structuredClone(input()) as Record<string, any>;
    stale.rawKinds[1].rows[0].launchOrdinal = 2;
    expect(() => createPerformanceExternalMetricCapture(stale)).toThrow(/does not match the run join/);

    const unknownClass = structuredClone(input()) as Record<string, any>;
    unknownClass.rawKinds[0].rows[0].processClass = 'Tab';
    expect(() => createPerformanceExternalMetricCapture(unknownClass)).toThrow(/processClass is not registered/);

    const unknownOwnership = structuredClone(input()) as Record<string, any>;
    unknownOwnership.rawKinds[0].rows[0].ownership = 'spawn-boundary';
    expect(() => createPerformanceExternalMetricCapture(unknownOwnership)).toThrow(/ownership is not registered/);

    const forgedProcess = structuredClone(input()) as Record<string, any>;
    forgedProcess.rawKinds[0].rows[0].processIdentity = 'renderer:forged:42';
    expect(() => createPerformanceExternalMetricCapture(forgedProcess)).toThrow(/processIdentity does not match its policy derivation/);

    const linuxMismatch = structuredClone(input()) as Record<string, any>;
    const linuxRaw = (seconds: number) => ({ pid: 42, userTicks: seconds * 100, systemTicks: 0, startTicks: 100, residentPages: 32768, pageSize: 4096, clockTicks: 100 });
    const membership = linuxMismatch.rawKinds[0].rows[0];
    membership.adapterId = 'linux-procfs-v1';
    membership.rawAdapterKind = 'linux-procfs-v1';
    membership.creationIdentity = '100';
    membership.rawIdentity = linuxRaw(0);
    membership.rawMembership = linuxRaw(0);
    linuxMismatch.rawKinds[1].rows.forEach((row: Record<string, any>, index: number) => {
      row.adapterId = 'linux-procfs-v1';
      row.rawAdapterKind = 'linux-procfs-v1';
      row.creationIdentity = '100';
      row.rawAdapterSample.adapterSample = linuxRaw(index);
    });
    linuxMismatch.rawKinds[1].rows[1].rawAdapterSample.adapterSample.userTicks = 999;
    expect(() => createPerformanceExternalMetricCapture(linuxMismatch)).toThrow(/normalized CPU sample does not match its raw adapter carrier/);
  });

  it('seals raw CPU authority brackets and derives sample phases outside the raw carrier', () => {
    const forgedStart = structuredClone(input()) as Record<string, any>;
    forgedStart.rawKinds[1].rows[0].rawAdapterSample.readStart = 1.001;
    expect(() => createPerformanceExternalMetricCapture(forgedStart)).toThrow(/read bracket does not match its raw authority wrapper/);

    const oversized = structuredClone(input()) as Record<string, any>;
    oversized.rawKinds[1].rows[0].rawAdapterSample.readEnd = 1.051;
    oversized.rawKinds[1].rows[0].readEnd = 1.051;
    expect(() => createPerformanceExternalMetricCapture(oversized)).toThrow(/invalid read bracket/);

    const carrierPhase = structuredClone(input()) as Record<string, any>;
    carrierPhase.rawKinds[1].rows[0].rawAdapterSample.samplePhase = 'prime';
    expect(() => createPerformanceExternalMetricCapture(carrierPhase)).toThrow(/unknown field samplePhase/);

    const forgedPhase = structuredClone(input()) as Record<string, any>;
    forgedPhase.rawKinds[1].rows[1].samplePhase = 'prime';
    expect(() => createPerformanceExternalMetricCapture(forgedPhase)).toThrow(/phase does not match its ordinal and immutable measurement boundaries/);
  });

  it('closes normalized process health and closure states through policy enums', () => {
    const health = structuredClone(input()) as Record<string, any>;
    const healthRow = structuredClone(health.rawKinds[0].rows[0]);
    healthRow.observationOrdinal = 2;
    healthRow.observationKind = 'health';
    healthRow.rawHealth = structuredClone(healthRow.rawIdentity);
    healthRow.healthState = 'live';
    delete healthRow.rawMembership;
    health.rawKinds[0].rows.push(healthRow);
    expect(() => createPerformanceExternalMetricCapture(health)).not.toThrow();
    healthRow.healthState = 'ready';
    expect(() => createPerformanceExternalMetricCapture(health)).toThrow(/healthState is not registered/);

    const closure = structuredClone(input()) as Record<string, any>;
    const closureRow = closure.rawKinds[0].rows[0];
    closureRow.observationKind = 'closure';
    closureRow.adapterId = 'external-closure-v1';
    closureRow.rawAdapterKind = 'external-process-closure';
    closureRow.rawClosure = { terminalStatus: 'closed', exitCode: 0, signal: null, zeroSurvivors: true };
    closureRow.closureState = 'closed';
    closureRow.alive = false;
    delete closureRow.rawMembership;
    expect(() => createPerformanceExternalMetricCapture(closure)).toThrow(/no process observation schema|unknown field cpuTime/);
  });

  it('derives Windows sampler brackets exactly and rejects forged raw timing', () => {
    const windows = structuredClone(input()) as Record<string, any>;
    const windowsRaw = (seconds: number) => ({
      totalProcessorTimeTicks: String(seconds * 10_000_000),
      workingSetBytes: '134217728',
      sampler: {
        pid: 42,
        creationIdentity: 'created',
        readStartTicks: '1000',
        readEndTicks: '1010',
        stopwatchFrequency: '1000',
        bracketSeconds: 0.01
      }
    });
    const membership = windows.rawKinds[0].rows[0];
    membership.adapterId = 'windows-powershell-v1';
    membership.rawAdapterKind = 'windows-powershell-v1';
    membership.rawIdentity = windowsRaw(0);
    membership.rawMembership = windowsRaw(0);
    windows.rawKinds[1].rows.forEach((row: Record<string, any>, index: number) => {
      row.adapterId = 'windows-powershell-v1';
      row.rawAdapterKind = 'windows-powershell-v1';
      row.counterQuantumSeconds = 0.0000001;
      row.rawAdapterSample.adapterSample = windowsRaw(index);
    });
    expect(() => createPerformanceExternalMetricCapture(windows)).not.toThrow();

    const reversed = structuredClone(windows) as Record<string, any>;
    reversed.rawKinds[1].rows[0].rawAdapterSample.adapterSample.sampler.readStartTicks = '1011';
    expect(() => createPerformanceExternalMetricCapture(reversed)).toThrow(/invalid read bracket/);

    const zeroFrequency = structuredClone(windows) as Record<string, any>;
    zeroFrequency.rawKinds[1].rows[0].rawAdapterSample.adapterSample.sampler.stopwatchFrequency = '0';
    expect(() => createPerformanceExternalMetricCapture(zeroFrequency)).toThrow(/invalid read bracket/);

    const forgedProjection = structuredClone(windows) as Record<string, any>;
    forgedProjection.rawKinds[1].rows[0].rawAdapterSample.adapterSample.sampler.bracketSeconds = 0.02;
    expect(() => createPerformanceExternalMetricCapture(forgedProjection)).toThrow(/bracket projection is invalid/);
  });

  it('writes and replays only checksum-named capture files', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'external-v4-'));
    directories.push(directory);
    const written = await writePerformanceExternalMetricCapture({ outputDirectory: directory, ...input() });
    await expect(readPerformanceExternalMetricCaptures({ outputDirectory: directory })).resolves.toEqual([{ relativePath: written.relativePath, capture: written.capture }]);
    await expect(writePerformanceExternalMetricCapture({ outputDirectory: directory, ...input() })).rejects.toMatchObject({ code: 'EEXIST' });
  });
});
