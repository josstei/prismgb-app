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
import { createPerformanceControllerAuditFixture } from './performance-controller-audit.fixture.js';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'prismgb-sentinel-capture-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, {
    recursive: true,
    force: true
  })));
});

function baseCapture(backend: 'canvas2d' | 'webgpu' = 'canvas2d') {
  const callbacks = [{
    sequence: 1,
    kind: 'renderer-callback',
    observedAt: 11,
    callbackOrdinal: 1,
    mediaTime: 0.1
  }];
  const canvasDraws = backend === 'canvas2d'
    ? [{
      sequence: 2,
      kind: 'canvas-draw-completed',
      observedAt: 13,
      callbackOrdinal: 1,
      startedAt: 12,
      endedAt: 13
    }]
    : [];
  const workerFramePosts = backend === 'webgpu'
    ? [{
      sequence: 2,
      kind: 'worker-frame-posted',
      observedAt: 13,
      callbackOrdinal: 1,
      startedAt: 12,
      endedAt: 13
    }]
    : [];
  const acknowledgements = backend === 'webgpu'
    ? [{
      sequence: 3,
      kind: 'worker-frame-acknowledged',
      observedAt: 14,
      tagged: false
    }]
    : [];

  return {
    sourceSha: 'a'.repeat(40),
    runId: backend + '-run',
    externalExecutionId: backend === 'canvas2d'
      ? '123e4567-e89b-42d3-a456-426614174000'
      : '123e4567-e89b-42d3-a456-426614174001',
    observationBoundaryId: backend + '-boundary',
    pair: {
      experimentId: '123e4567-e89b-42d3-a456-426614174002',
      pairPlanChecksum: 'c'.repeat(64),
      metricSessionId: backend + '-harness-pair-1-attempt-1',
      comparisonKind: 'harness-overhead',
      backend,
      pairIndex: 1,
      attemptIndex: 1,
      comparisonSide: backend === 'canvas2d' ? 'A' : 'B'
    },
    build: {
      id: backend === 'canvas2d' ? 'production' : 'harness-control',
      harness: backend === 'webgpu',
      instrumentation: false,
      bundleSha256: 'b'.repeat(64)
    },
    backend,
    workload: {
      id: 'phase0-animated-160x144-v1',
      pattern: 'animated',
      width: 160,
      height: 144,
      frameRate: 60
    },
    warmup: {
      callbackCount: 600,
      elapsedMs: 10000
    },
    window: {
      minimumCallbacks: 1,
      minimumDurationMs: 10,
      maximumCallbacks: 2,
      maximumDurationMs: 45,
      deliveredCallbackCount: 1,
      startedAt: 10,
      closedAt: 20,
      terminalClosureEnd: 25,
      closureReason: 'minimum-reached'
    },
    observations: {
      callbacks,
      canvasDraws,
      workerFramePosts,
      acknowledgements,
      errors: [],
      postPauseCanvasDrawCount: 0,
      callbackOverlapCount: 0,
      outstandingWorkerFrames: 0
    },
    controllerAudit: backend === 'canvas2d'
      ? null
      : createPerformanceControllerAuditFixture({
        launchId: '123e4567-e89b-42d3-a456-426614174003',
        instrumentation: false
      })
  };
}

describe('performance sentinel capture', () => {
  it('binds production sentinel observations without a harness launch ID', () => {
    const capture = createPerformanceSentinelCapture(baseCapture());

    expect(capture).toMatchObject({
      schemaVersion: 6,
      build: { id: 'production', harness: false, instrumentation: false },
      backend: 'canvas2d',
      observations: {
        callbacks: [{ callbackOrdinal: 1 }],
        canvasDraws: [{ callbackOrdinal: 1 }],
        workerFramePosts: [],
        acknowledgements: []
      },
      checksum: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
    expect(capture).not.toHaveProperty('launchId');
    expect(Object.isFrozen(capture)).toBe(true);
    expect(validatePerformanceSentinelCapture(JSON.parse(JSON.stringify(capture)))).toEqual(capture);
  });

  it('accepts a token-free WebGPU acknowledgement count while retaining the external frame balance', () => {
    const capture = createPerformanceSentinelCapture(baseCapture('webgpu'));

    expect(capture.observations).toMatchObject({
      workerFramePosts: [{ kind: 'worker-frame-posted', callbackOrdinal: 1 }],
      acknowledgements: [{ kind: 'worker-frame-acknowledged', tagged: false }],
      outstandingWorkerFrames: 0
    });
  });

  it('rejects token-bearing, unbalanced, and post-pause sentinel evidence', () => {
    const tokenBearing = baseCapture('webgpu');
    (tokenBearing.observations.acknowledgements[0] as Record<string, unknown>).frameToken = 1;
    expect(() => createPerformanceSentinelCapture(tokenBearing)).toThrow(/unknown field frameToken/);

    const unbalanced = baseCapture('webgpu');
    unbalanced.observations.acknowledgements = [];
    unbalanced.observations.outstandingWorkerFrames = 1;
    expect(() => createPerformanceSentinelCapture(unbalanced)).toThrow(/not balanced and drained/);

    const postPauseDraw = baseCapture();
    postPauseDraw.observations.postPauseCanvasDrawCount = 1;
    expect(() => createPerformanceSentinelCapture(postPauseDraw)).toThrow(/post-pause draw/);
  });

  it('writes and reads a checksum-bound capture without overwriting it', async () => {
    const outputDirectory = await temporaryDirectory();
    const input = baseCapture();
    const written = await writePerformanceSentinelCapture({ outputDirectory, ...input });

    expect(written.relativePath).toMatch(/^raw-sentinel-captures\//);
    await expect(writePerformanceSentinelCapture({ outputDirectory, ...input })).rejects.toMatchObject({
      code: 'EEXIST'
    });
    await expect(readPerformanceSentinelCaptures({ outputDirectory })).resolves.toEqual([
      expect.objectContaining({
        relativePath: written.relativePath,
        capture: written.capture
      })
    ]);
  });
});
