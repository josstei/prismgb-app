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

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'prismgb-external-metric-capture-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, {
    recursive: true,
    force: true
  })));
});

function metricRead(ordinal: number, readStart: number, cumulativeCpuSeconds: number, raw: Record<string, unknown>) {
  return {
    sample: {
      ordinal,
      readStart,
      readEnd: readStart + 0.01,
      cumulativeCpuSeconds,
      counterQuantumSeconds: 0.01,
      processIdentity: 'renderer:external-42:42',
      workingSetMiB: 128
    },
    raw
  };
}

function macosRaw(cpuTime: string) {
  return {
    pid: 42,
    creationIdentity: 'Fri Jul 11 02:35:00 2026',
    cpuTime,
    residentSetKiB: 131072
  };
}

function baseCapture() {
  return {
    sourceSha: 'a'.repeat(40),
    runId: 'external-sentinel:123e4567-e89b-42d3-a456-426614174000',
    externalExecutionId: '123e4567-e89b-42d3-a456-426614174000',
    observationBoundaryId: 'external-sentinel-window:123e4567-e89b-42d3-a456-426614174000',
    pair: {
      experimentId: '123e4567-e89b-42d3-a456-426614174001',
      metricSessionId: 'harness-pair-1-attempt-1',
      comparisonKind: 'harness-overhead',
      backend: 'canvas2d',
      pairIndex: 1,
      attemptIndex: 1,
      comparisonSide: 'A'
    },
    build: {
      id: 'production',
      harness: false,
      instrumentation: false,
      bundleSha256: 'b'.repeat(64)
    },
    adapterId: 'macos-ps-v1',
    target: {
      pid: 42,
      creationIdentity: 'Fri Jul 11 02:35:00 2026',
      processIdentity: 'renderer:external-42:42',
      counterQuantumSeconds: 0.01
    },
    window: { start: 10, terminalClosureEnd: 10.75 },
    prime: metricRead(0, 9.5, 1, macosRaw('00:01')),
    inWindowSamples: [
      metricRead(1, 10, 2, macosRaw('00:02')),
      metricRead(2, 10.5, 3, macosRaw('00:03'))
    ],
    terminalSample: metricRead(3, 11, 4, macosRaw('00:04'))
  };
}

describe('performance external metric capture', () => {
  it('retains raw platform endpoints separately from projected metric samples', () => {
    const capture = createPerformanceExternalMetricCapture(baseCapture());

    expect(capture).toMatchObject({
      schemaVersion: 2,
      adapterId: 'macos-ps-v1',
      window: { start: 10, terminalClosureEnd: 10.75 },
      inWindowSamples: [
        { sample: { ordinal: 1 }, raw: { cpuTime: '00:02' } },
        { sample: { ordinal: 2 }, raw: { residentSetKiB: 131072 } }
      ],
      terminalSample: { sample: { ordinal: 3, readStart: 11 } },
      checksum: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
    expect(Object.isFrozen(capture)).toBe(true);
    expect(validatePerformanceExternalMetricCapture(JSON.parse(JSON.stringify(capture)))).toEqual(capture);
  });

  it('rejects cadence drift, PID-target mismatch, and a terminal read before closure', () => {
    const cadenceDrift = baseCapture();
    cadenceDrift.inWindowSamples[1] = metricRead(2, 10.4, 3, macosRaw('00:03'));
    expect(() => createPerformanceExternalMetricCapture(cadenceDrift)).toThrow(/cadence/);

    const mismatchedTarget = baseCapture();
    mismatchedTarget.inWindowSamples[0].sample.processIdentity = 'renderer:other:42';
    expect(() => createPerformanceExternalMetricCapture(mismatchedTarget)).toThrow(/process identity/);

    const earlyTerminal = baseCapture();
    earlyTerminal.terminalSample = metricRead(3, 10.5, 4, macosRaw('00:04'));
    expect(() => createPerformanceExternalMetricCapture(earlyTerminal)).toThrow(/terminal metric sample/);

    const forgedRawEndpoint = baseCapture();
    forgedRawEndpoint.inWindowSamples[0].raw.residentSetKiB = 65536;
    expect(() => createPerformanceExternalMetricCapture(forgedRawEndpoint)).toThrow(/does not reproduce/);
  });

  it('writes and reloads a checksum-bound capture without overwrite', async () => {
    const outputDirectory = await temporaryDirectory();
    const written = await writePerformanceExternalMetricCapture({ outputDirectory, ...baseCapture() });

    expect(written.relativePath).toMatch(/^raw-external-metric-captures\//);
    await expect(writePerformanceExternalMetricCapture({ outputDirectory, ...baseCapture() })).rejects.toMatchObject({ code: 'EEXIST' });
    await expect(readPerformanceExternalMetricCaptures({ outputDirectory })).resolves.toEqual([
      expect.objectContaining({
        relativePath: written.relativePath,
        capture: written.capture
      })
    ]);
  });
});
