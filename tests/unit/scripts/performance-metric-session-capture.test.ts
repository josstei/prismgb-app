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

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'prismgb-metric-session-capture-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, {
    recursive: true,
    force: true
  })));
});

function target(externalExecutionId: string, pid: number) {
  return {
    pid,
    creationIdentity: String(1000 + pid),
    processIdentity: `renderer:${externalExecutionId}:${pid}`,
    counterQuantumSeconds: 0.01
  };
}

function baseCapture() {
  const externalExecutionA = '123e4567-e89b-42d3-a456-426614174010';
  const externalExecutionB = '123e4567-e89b-42d3-a456-426614174011';
  const sideA = {
    comparisonSide: 'A',
    buildVariant: 'production',
    externalExecutionId: externalExecutionA,
    metricCaptureChecksum: 'd'.repeat(64),
    target: target(externalExecutionA, 42)
  };
  const sideB = {
    comparisonSide: 'B',
    buildVariant: 'harness-control',
    externalExecutionId: externalExecutionB,
    metricCaptureChecksum: 'e'.repeat(64),
    target: target(externalExecutionB, 43)
  };
  let sequence = 0;
  let at = 0;
  const transition = (operation: string, metricTarget?: Record<string, unknown>) => ({
    sequence: ++sequence,
    operation,
    at: ++at,
    ...(metricTarget ? { target: metricTarget } : {})
  });
  return {
    sourceSha: 'a'.repeat(40),
    pair: {
      experimentId: '123e4567-e89b-42d3-a456-426614174001',
      pairPlanChecksum: 'b'.repeat(64),
      metricSessionId: 'harness-pair-1-attempt-1',
      comparisonKind: 'harness-overhead',
      backend: 'canvas2d',
      pairIndex: 1,
      attemptIndex: 1
    },
    adapterId: 'linux-procfs-v1',
    sides: [sideA, sideB],
    closure: {
      adapterId: 'linux-procfs-v1',
      transitions: [
        transition('open'),
        transition('attach', sideA.target),
        transition('prime', sideA.target),
        transition('sample', sideA.target),
        transition('detach', sideA.target),
        transition('attach', sideB.target),
        transition('prime', sideB.target),
        transition('sample', sideB.target),
        transition('detach', sideB.target),
        transition('close')
      ]
    }
  };
}

describe('performance metric session capture', () => {
  it('binds both external metric sides to one opened adapter session', () => {
    const capture = createPerformanceMetricSessionCapture(baseCapture());

    expect(capture).toMatchObject({
      schemaVersion: 1,
      adapterId: 'linux-procfs-v1',
      pair: { pairPlanChecksum: 'b'.repeat(64), metricSessionId: 'harness-pair-1-attempt-1' },
      sides: [
        { comparisonSide: 'A', buildVariant: 'production' },
        { comparisonSide: 'B', buildVariant: 'harness-control' }
      ],
      checksum: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
    expect(capture.closure.transitions[0]).toMatchObject({ sequence: 1, operation: 'open' });
    expect(capture.closure.transitions.at(-1)).toMatchObject({ sequence: 10, operation: 'close' });
    expect(Object.isFrozen(capture)).toBe(true);
    expect(validatePerformanceMetricSessionCapture(JSON.parse(JSON.stringify(capture)))).toEqual(capture);
  });

  it('rejects a mismatched target, malformed side order, and stale checksum', () => {
    const mismatchedTarget = baseCapture();
    mismatchedTarget.closure.transitions[2].target = {
      ...mismatchedTarget.closure.transitions[2].target,
      processIdentity: 'renderer:wrong:42'
    };
    expect(() => createPerformanceMetricSessionCapture(mismatchedTarget)).toThrow(/does not prime the A metric target/);

    const malformedSideOrder = baseCapture();
    malformedSideOrder.sides[1].comparisonSide = 'A';
    expect(() => createPerformanceMetricSessionCapture(malformedSideOrder)).toThrow(/planned B-then-end side order/);

    const capture = createPerformanceMetricSessionCapture(baseCapture());
    const staleChecksum = { ...capture, checksum: 'f'.repeat(64) };
    expect(() => validatePerformanceMetricSessionCapture(staleChecksum)).toThrow(/checksum does not match/);
  });

  it('writes and reloads a checksum-bound session without overwrite', async () => {
    const outputDirectory = await temporaryDirectory();
    const written = await writePerformanceMetricSessionCapture({ outputDirectory, ...baseCapture() });

    expect(written.relativePath).toMatch(/^raw-metric-session-captures\/[a-f0-9]{64}\.json$/);
    await expect(writePerformanceMetricSessionCapture({ outputDirectory, ...baseCapture() })).rejects.toMatchObject({ code: 'EEXIST' });
    await expect(readPerformanceMetricSessionCaptures({ outputDirectory })).resolves.toEqual([
      expect.objectContaining({
        relativePath: written.relativePath,
        capture: written.capture
      })
    ]);
  });
});
