import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PERFORMANCE_WORKLOAD_CAPTURE_DIRECTORY,
  createPerformanceWorkloadCapture,
  readPerformanceWorkloadCaptures,
  validatePerformanceWorkloadCapture,
  writePerformanceWorkloadCapture
} from '../../../scripts/lib/performance-workload-capture.js';

const temporaryDirectories: string[] = [];

function captureInput() {
  return {
    sourceSha: 'a'.repeat(40),
    launchId: '123e4567-e89b-42d3-a456-426614174000',
    pair: {
      experimentId: '123e4567-e89b-42d3-a456-426614174001',
      metricSessionId: 'instrumentation-pair-1-attempt-1',
      comparisonKind: 'instrumentation-overhead',
      backend: 'canvas2d',
      pairIndex: 1,
      attemptIndex: 1,
      comparisonSide: 'B'
    },
    build: {
      id: 'instrumented',
      harness: true,
      instrumentation: true,
      bundleSha256: 'b'.repeat(64)
    },
    workload: {
      id: 'phase0-animated-160x144-v1',
      pattern: 'animated',
      width: 160,
      height: 144,
      frameRate: 60
    },
    warmup: {
      sourceOpportunityCount: 600,
      elapsedMs: 10_000
    },
    window: {
      minimumCallbacks: 2,
      minimumDurationMs: 30_000,
      maximumCallbacks: 4,
      maximumDurationMs: 45_000,
      deliveredCallbackCount: 2,
      startedAt: 100,
      closedAt: 30_100,
      closureReason: 'minimum-reached'
    },
    sourceSequences: [41, 42],
    controlWrites: [{ kind: 'source-opportunity', sourceSequence: 41 }],
    diagnostics: { source: { sourceOpportunities: 2 } }
  };
}

async function createTemporaryDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'prismgb-workload-capture-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe('performance workload capture', () => {
  it('binds a complete raw workload observation to a canonical checksum', () => {
    const capture = createPerformanceWorkloadCapture(captureInput());

    expect(capture).toMatchObject({
      schemaVersion: 2,
      checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
      window: { closureReason: 'minimum-reached', deliveredCallbackCount: 2 },
      sourceSequences: [41, 42]
    });
    expect(Object.isFrozen(capture.diagnostics)).toBe(true);
    expect(() => validatePerformanceWorkloadCapture({
      ...capture,
      warmup: { ...capture.warmup, elapsedMs: 10_001 }
    })).toThrow(/checksum/);
    expect(() => createPerformanceWorkloadCapture({
      ...captureInput(),
      sourceSequences: [41, 43]
    })).toThrow(/contiguous/);
  });

  it('persists only no-clobber checksum-bound capture files and reads them back', async () => {
    const outputDirectory = await createTemporaryDirectory();
    const written = await writePerformanceWorkloadCapture({ outputDirectory, ...captureInput() });

    expect(written.relativePath).toMatch(new RegExp(`^${PERFORMANCE_WORKLOAD_CAPTURE_DIRECTORY}/123e4567-e89b-42d3-a456-426614174000-[a-f0-9]{64}\\.json$`));
    await expect(readPerformanceWorkloadCaptures({ outputDirectory })).resolves.toEqual([
      expect.objectContaining({
        relativePath: written.relativePath,
        capture: expect.objectContaining({ checksum: written.capture.checksum })
      })
    ]);
    await expect(writePerformanceWorkloadCapture({ outputDirectory, ...captureInput() })).rejects.toMatchObject({ code: 'EEXIST' });
  });
});
