import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PERFORMANCE_BUILD_VARIANTS,
  createBundleManifest,
  createPerformancePairPlan,
  createPerformanceCommandLedger,
  createPerformanceBuildEnvironment,
  createProductionBundleEvidence,
  collectPerformanceExternalMetricCaptures,
  collectPerformanceSentinelCaptures,
  parsePerformanceBaselineArgs,
  resolvePerformancePlaywrightCommand,
  runPerformanceBaseline
} from '../../../scripts/run-performance-baseline.js';
import { createPerformanceSentinelCapture } from '../../../scripts/lib/performance-sentinel-capture.js';
import { createPerformanceExternalMetricCapture } from '../../../scripts/lib/performance-external-metric-capture.js';
import { createPerformanceWorkloadCapture } from '../../../scripts/lib/performance-workload-capture.js';

const tempDirectories: string[] = [];

async function createTemporaryWorkspace(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'prismgb-performance-runner-'));
  tempDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

const BUILD_VARIANT_FLAGS = Object.freeze({
  production: Object.freeze({ harness: false, instrumentation: false }),
  'harness-control': Object.freeze({ harness: true, instrumentation: false }),
  instrumented: Object.freeze({ harness: true, instrumentation: true })
});
const DEFAULT_HARNESS_PAIR = Object.freeze({
  experimentId: '123e4567-e89b-42d3-a456-426614174001',
  pairPlanChecksum: 'b'.repeat(64),
  metricSessionId: 'harness-pair-1-attempt-1',
  comparisonKind: 'harness-overhead',
  backend: 'canvas2d',
  pairIndex: 1,
  attemptIndex: 1,
  comparisonSide: 'B'
});
const DEFAULT_INSTRUMENTATION_PAIR = Object.freeze({
  experimentId: '123e4567-e89b-42d3-a456-426614174002',
  pairPlanChecksum: 'c'.repeat(64),
  metricSessionId: 'instrumentation-pair-1-attempt-1',
  comparisonKind: 'instrumentation-overhead',
  backend: 'canvas2d',
  pairIndex: 1,
  attemptIndex: 1,
  comparisonSide: 'B'
});

function fixtureUuid(sequence: number) {
  return `123e4567-e89b-42d3-a456-${sequence.toString(16).padStart(12, '0')}`;
}

function createFixturePairPlan() {
  let session = 0;
  return createPerformancePairPlan({
    experimentId: fixtureUuid(1),
    backend: 'canvas2d',
    createSessionId: () => `fixture-session-${++session}`
  });
}

function buildMetadata(id: keyof typeof BUILD_VARIANT_FLAGS, bundleSha256: string) {
  return { id, ...BUILD_VARIANT_FLAGS[id], bundleSha256 };
}

function createPairBinding(plan: ReturnType<typeof createPerformancePairPlan>, pair: any, launch: any) {
  return {
    experimentId: plan.experimentId,
    pairPlanChecksum: plan.checksum,
    metricSessionId: pair.metricSessionId,
    comparisonKind: pair.comparisonKind,
    backend: pair.backend,
    pairIndex: pair.pairIndex,
    attemptIndex: pair.attemptIndex,
    comparisonSide: launch.comparisonSide
  };
}

function createCanvasSentinelCapture({
  sourceSha = 'a'.repeat(40),
  bundleSha256 = 'b'.repeat(64),
  buildId = 'harness-control' as const,
  pair = DEFAULT_HARNESS_PAIR,
  externalExecutionId = fixtureUuid(10),
  runId = `external-sentinel:${externalExecutionId}`,
  observationBoundaryId = `external-sentinel-window:${externalExecutionId}`
}: {
  sourceSha?: string;
  bundleSha256?: string;
  buildId?: 'production' | 'harness-control';
  pair?: Record<string, unknown>;
  externalExecutionId?: string;
  runId?: string;
  observationBoundaryId?: string;
} = {}) {
  return createPerformanceSentinelCapture({
    sourceSha,
    runId,
    externalExecutionId,
    observationBoundaryId,
    pair,
    build: buildMetadata(buildId, bundleSha256),
    backend: 'canvas2d',
    workload: {
      id: 'phase0-animated-160x144-v1',
      pattern: 'animated',
      width: 160,
      height: 144,
      frameRate: 60
    },
    warmup: { callbackCount: 600, elapsedMs: 10_000 },
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
      callbacks: [{
        sequence: 1,
        kind: 'renderer-callback',
        observedAt: 11,
        callbackOrdinal: 1,
        mediaTime: 0.1
      }],
      canvasDraws: [{
        sequence: 2,
        kind: 'canvas-draw-completed',
        observedAt: 13,
        callbackOrdinal: 1,
        startedAt: 12,
        endedAt: 13
      }],
      workerFramePosts: [],
      acknowledgements: [],
      errors: [],
      postPauseCanvasDrawCount: 0,
      callbackOverlapCount: 0,
      outstandingWorkerFrames: 0
    }
  });
}

function createCanvasExternalMetricCapture({
  sourceSha = 'a'.repeat(40),
  bundleSha256 = 'b'.repeat(64),
  buildId = 'harness-control' as const,
  pair = DEFAULT_HARNESS_PAIR,
  externalExecutionId = fixtureUuid(10),
  runId = `external-sentinel:${externalExecutionId}`,
  observationBoundaryId = `external-sentinel-window:${externalExecutionId}`,
  pid = 42
}: {
  sourceSha?: string;
  bundleSha256?: string;
  buildId?: 'production' | 'harness-control' | 'instrumented';
  pair?: Record<string, unknown>;
  externalExecutionId?: string;
  runId?: string;
  observationBoundaryId?: string;
  pid?: number;
} = {}) {
  const processIdentity = `renderer:${externalExecutionId}:${pid}`;
  const metricRead = (ordinal: number, readStart: number, cumulativeCpuSeconds: number) => ({
    sample: {
      ordinal,
      readStart,
      readEnd: readStart + 0.01,
      cumulativeCpuSeconds,
      counterQuantumSeconds: 0.01,
      processIdentity,
      workingSetMiB: 128
    },
    raw: {
      pid,
      userTicks: cumulativeCpuSeconds * 100,
      systemTicks: 0,
      startTicks: 30,
      residentPages: 32768,
      pageSize: 4096,
      clockTicks: 100
    }
  });
  return createPerformanceExternalMetricCapture({
    sourceSha,
    runId,
    externalExecutionId,
    observationBoundaryId,
    pair,
    build: buildMetadata(buildId, bundleSha256),
    adapterId: 'linux-procfs-v1',
    target: {
      pid,
      creationIdentity: '30',
      processIdentity,
      counterQuantumSeconds: 0.01
    },
    window: { start: 10, terminalClosureEnd: 40.25 },
    prime: metricRead(0, 9.5, 1),
    inWindowSamples: Array.from({ length: 61 }, (_, index) => metricRead(index + 1, 10 + (index * 0.5), index + 2)),
    terminalSample: metricRead(62, 40.5, 63)
  });
}

function createInstrumentedWorkloadCapture({
  sourceSha = 'a'.repeat(40),
  bundleSha256 = 'd'.repeat(64),
  pair = DEFAULT_INSTRUMENTATION_PAIR,
  launchId = fixtureUuid(20)
}: {
  sourceSha?: string;
  bundleSha256?: string;
  pair?: Record<string, unknown>;
  launchId?: string;
} = {}) {
  return createPerformanceWorkloadCapture({
    sourceSha,
    launchId,
    pair,
    build: buildMetadata('instrumented', bundleSha256),
    workload: { id: 'phase0-animated-160x144-v1', pattern: 'animated', width: 160, height: 144, frameRate: 60 },
    warmup: { sourceOpportunityCount: 600, elapsedMs: 10_000 },
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
    sourceSequences: [1, 2],
    controlWrites: [],
    diagnostics: { source: { sourceOpportunities: 2 } }
  });
}

function writeRawCaptureSync(outputDirectory: string, directory: string, identity: string, capture: { checksum: string }) {
  const target = path.join(outputDirectory, directory);
  fsSync.mkdirSync(target, { recursive: true });
  const relativePath = `${directory}/${identity}-${capture.checksum}.json`;
  fsSync.writeFileSync(path.join(outputDirectory, relativePath), JSON.stringify(capture));
  return relativePath;
}

function createFixtureManifest(bundles = {
  production: 'c'.repeat(64),
  'harness-control': 'b'.repeat(64),
  instrumented: 'd'.repeat(64)
}) {
  return {
    variants: Object.entries(BUILD_VARIANT_FLAGS).map(([id, flags]) => ({
      id,
      ...flags,
      bundle: { sha256: bundles[id as keyof typeof bundles] }
    }))
  };
}

function writePlannedCaptureFixturesSync({
  outputDirectory,
  pairPlan,
  manifest,
  sourceSha = 'a'.repeat(40)
}: {
  outputDirectory: string;
  pairPlan: ReturnType<typeof createPerformancePairPlan>;
  manifest: ReturnType<typeof createFixtureManifest>;
  sourceSha?: string;
}) {
  const sentinels: Array<{ capture: any; relativePath: string }> = [];
  const metrics: Array<{ capture: any; relativePath: string }> = [];
  const workloads: Array<{ capture: any; relativePath: string }> = [];
  let execution = 0;
  for (const pair of pairPlan.pairs) {
    for (const launch of pair.launches) {
      execution += 1;
      const externalExecutionId = fixtureUuid(100 + execution);
      const binding = createPairBinding(pairPlan, pair, launch);
      const build = manifest.variants.find((variant) => variant.id === launch.buildVariant);
      if (!build) throw new Error(`missing fixture build ${launch.buildVariant}`);
      const runId = `external-sentinel:${externalExecutionId}`;
      const observationBoundaryId = `external-sentinel-window:${externalExecutionId}`;
      if (pair.comparisonKind === 'harness-overhead') {
        const sentinel = createCanvasSentinelCapture({
          sourceSha,
          bundleSha256: build.bundle.sha256,
          buildId: launch.buildVariant as 'production' | 'harness-control',
          pair: binding,
          externalExecutionId,
          runId,
          observationBoundaryId
        });
        sentinels.push({
          capture: sentinel,
          relativePath: writeRawCaptureSync(outputDirectory, 'raw-sentinel-captures', sentinel.externalExecutionId, sentinel)
        });
      }
      const metric = createCanvasExternalMetricCapture({
        sourceSha,
        bundleSha256: build.bundle.sha256,
        buildId: launch.buildVariant,
        pair: binding,
        externalExecutionId,
        runId,
        observationBoundaryId,
        pid: 1000 + execution
      });
      metrics.push({
        capture: metric,
        relativePath: writeRawCaptureSync(outputDirectory, 'raw-external-metric-captures', metric.externalExecutionId, metric)
      });
      if (launch.buildVariant === 'instrumented') {
        const workload = createInstrumentedWorkloadCapture({
          sourceSha,
          bundleSha256: build.bundle.sha256,
          pair: binding,
          launchId: fixtureUuid(200 + execution)
        });
        workloads.push({
          capture: workload,
          relativePath: writeRawCaptureSync(outputDirectory, 'raw-workload-captures', workload.launchId, workload)
        });
      }
    }
  }
  return { sentinels, metrics, workloads };
}

describe('parsePerformanceBaselineArgs', () => {
  it('requires an isolated output directory and accepts the closed experiment roles', () => {
    expect(() => parsePerformanceBaselineArgs([])).toThrow(/--output is required/);
    expect(() => parsePerformanceBaselineArgs(['--output', '.', '--role', 'unknown'])).toThrow(/unsupported experiment role/);
    expect(() => parsePerformanceBaselineArgs(['--output', 'artifacts/performance'])).toThrow(/--role is required/);
    expect(() => parsePerformanceBaselineArgs(['--output', 'artifacts/performance', '--role', 'reference-comparison'])).toThrow(
      /requires --selected-host/
    );
    expect(parsePerformanceBaselineArgs([
      '--output',
      'artifacts/performance',
      '--role',
      'reference-comparison',
      '--selected-host'
    ], {
      cwd: '/workspace'
    })).toEqual({
      outputDirectory: '/workspace/artifacts/performance',
      role: 'reference-comparison',
      selectedHost: true,
      buildOnly: false
    });
  });
});

describe('createPerformanceBuildEnvironment', () => {
  it('sets both compile-time switches for each registered build variant', () => {
    expect(createPerformanceBuildEnvironment({ PATH: '/bin' }, PERFORMANCE_BUILD_VARIANTS[0])).toMatchObject({
      PATH: '/bin',
      PRISMGB_PERF_HARNESS_BUILD: '0',
      PRISMGB_PERF_INSTRUMENTATION_BUILD: '0'
    });
    expect(createPerformanceBuildEnvironment({}, PERFORMANCE_BUILD_VARIANTS[2])).toMatchObject({
      PRISMGB_PERF_HARNESS_BUILD: '1',
      PRISMGB_PERF_INSTRUMENTATION_BUILD: '1'
    });
  });
});

describe('createPerformancePairPlan', () => {
  it('uses the exact three-plus-six cardinality and alternates cold-launch order', () => {
    let session = 0;
    const plan = createPerformancePairPlan({
      experimentId: '123e4567-e89b-42d3-a456-426614174000',
      backend: 'canvas2d',
      createSessionId: () => `session-${++session}`
    });

    expect(plan).toMatchObject({ schemaVersion: 2, backend: 'canvas2d', checksum: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(plan.pairs.map((pair) => ({
      comparisonKind: pair.comparisonKind,
      pairIndex: pair.pairIndex,
      launches: pair.launches
    }))).toEqual([
      {
        comparisonKind: 'harness-overhead',
        pairIndex: 1,
        launches: [{ comparisonSide: 'A', buildVariant: 'production' }, { comparisonSide: 'B', buildVariant: 'harness-control' }]
      },
      {
        comparisonKind: 'harness-overhead',
        pairIndex: 2,
        launches: [{ comparisonSide: 'A', buildVariant: 'harness-control' }, { comparisonSide: 'B', buildVariant: 'production' }]
      },
      {
        comparisonKind: 'harness-overhead',
        pairIndex: 3,
        launches: [{ comparisonSide: 'A', buildVariant: 'production' }, { comparisonSide: 'B', buildVariant: 'harness-control' }]
      },
      {
        comparisonKind: 'instrumentation-overhead',
        pairIndex: 1,
        launches: [{ comparisonSide: 'A', buildVariant: 'harness-control' }, { comparisonSide: 'B', buildVariant: 'instrumented' }]
      },
      {
        comparisonKind: 'instrumentation-overhead',
        pairIndex: 2,
        launches: [{ comparisonSide: 'A', buildVariant: 'instrumented' }, { comparisonSide: 'B', buildVariant: 'harness-control' }]
      },
      {
        comparisonKind: 'instrumentation-overhead',
        pairIndex: 3,
        launches: [{ comparisonSide: 'A', buildVariant: 'harness-control' }, { comparisonSide: 'B', buildVariant: 'instrumented' }]
      },
      {
        comparisonKind: 'instrumentation-overhead',
        pairIndex: 4,
        launches: [{ comparisonSide: 'A', buildVariant: 'instrumented' }, { comparisonSide: 'B', buildVariant: 'harness-control' }]
      },
      {
        comparisonKind: 'instrumentation-overhead',
        pairIndex: 5,
        launches: [{ comparisonSide: 'A', buildVariant: 'harness-control' }, { comparisonSide: 'B', buildVariant: 'instrumented' }]
      },
      {
        comparisonKind: 'instrumentation-overhead',
        pairIndex: 6,
        launches: [{ comparisonSide: 'A', buildVariant: 'instrumented' }, { comparisonSide: 'B', buildVariant: 'harness-control' }]
      }
    ]);
    const byKind = (comparisonKind: string) => plan.pairs.filter((pair) => pair.comparisonKind === comparisonKind);
    expect(byKind('harness-overhead')).toHaveLength(3);
    expect(byKind('instrumentation-overhead')).toHaveLength(6);
    expect(byKind('harness-overhead').flatMap((pair) => pair.launches).filter((launch) => launch.buildVariant === 'production')).toHaveLength(3);
    expect(byKind('instrumentation-overhead').filter((pair) => pair.launches[0].buildVariant === 'harness-control')).toHaveLength(3);
    expect(byKind('instrumentation-overhead').filter((pair) => pair.launches[0].buildVariant === 'instrumented')).toHaveLength(3);
    expect(new Set(plan.pairs.map((pair) => pair.metricSessionId)).size).toBe(9);
    expect(Object.isFrozen(plan.pairs[0].launches)).toBe(true);
  });

  it('rejects invalid experiment/backend/session identities', () => {
    expect(() => createPerformancePairPlan({
      experimentId: 'not-a-uuid',
      backend: 'canvas2d'
    })).toThrow(/experimentId/);
    expect(() => createPerformancePairPlan({
      experimentId: '123e4567-e89b-42d3-a456-426614174000',
      backend: 'unknown' as never
    })).toThrow(/backend/);
    expect(() => createPerformancePairPlan({
      experimentId: '123e4567-e89b-42d3-a456-426614174000',
      backend: 'canvas2d',
      createSessionId: () => ''
    })).toThrow(/session ID/);
  });
});

describe('resolvePerformancePlaywrightCommand', () => {
  it('uses the direct Playwright invocation outside of displayless Linux', () => {
    expect(resolvePerformancePlaywrightCommand({
      cwd: '/workspace',
      platform: 'darwin',
      environment: { PATH: '/bin' },
      isExecutable: vi.fn()
    })).toEqual({
      command: 'npx',
      args: ['playwright', 'test', '--config', 'playwright.performance.config.js']
    });
    expect(resolvePerformancePlaywrightCommand({
      cwd: '/workspace',
      platform: 'linux',
      environment: { DISPLAY: ':99', PATH: '/bin' },
      isExecutable: vi.fn()
    })).toEqual({
      command: 'npx',
      args: ['playwright', 'test', '--config', 'playwright.performance.config.js']
    });
  });

  it('requires and resolves xvfb-run for Linux runs without a display', () => {
    const isExecutable = vi.fn((candidate: string) => candidate === '/fixture/bin/xvfb-run');
    expect(resolvePerformancePlaywrightCommand({
      cwd: '/workspace',
      platform: 'linux',
      environment: { PATH: '/missing:/fixture/bin' },
      isExecutable
    })).toEqual({
      command: '/fixture/bin/xvfb-run',
      args: ['-a', 'npx', 'playwright', 'test', '--config', 'playwright.performance.config.js']
    });
    expect(isExecutable).toHaveBeenCalledWith('/missing/xvfb-run');
    expect(() => resolvePerformancePlaywrightCommand({
      cwd: '/workspace',
      platform: 'linux',
      environment: { PATH: '/missing' },
      isExecutable: () => false
    })).toThrow(/requires xvfb-run -a when DISPLAY is unavailable/);
  });
});

describe('createBundleManifest', () => {
  it('sorts paths and binds each tracked output byte sequence', async () => {
    const directory = await createTemporaryWorkspace();
    await fs.mkdir(path.join(directory, 'nested'));
    await fs.writeFile(path.join(directory, 'z.txt'), 'z');
    await fs.writeFile(path.join(directory, 'nested', 'a.txt'), 'a');

    const manifest = await createBundleManifest(directory);
    expect(manifest.entries.map((entry) => entry.path)).toEqual(['nested/a.txt', 'z.txt']);
    expect(manifest.entries[0]).toEqual({
      path: 'nested/a.txt',
      bytes: 1,
      sha256: crypto.createHash('sha256').update('a').digest('hex')
    });
  });

  it('derives a separate checksummed production code manifest for all four bundle roots', async () => {
    const directory = await createTemporaryWorkspace();
    await fs.mkdir(path.join(directory, 'main'), { recursive: true });
    await fs.mkdir(path.join(directory, 'preload'), { recursive: true });
    await fs.mkdir(path.join(directory, 'renderer', 'assets'), { recursive: true });
    await fs.writeFile(path.join(directory, 'main', 'index.js'), 'main');
    await fs.writeFile(path.join(directory, 'preload', 'index.js'), 'preload');
    await fs.writeFile(path.join(directory, 'renderer', 'assets', 'main-fixture.js'), 'renderer');
    await fs.writeFile(path.join(directory, 'renderer', 'assets', 'worker-entry-fixture.js'), 'worker');
    const bundle = await createBundleManifest(directory);
    const evidence = createProductionBundleEvidence({
      sourceSha: 'a'.repeat(40),
      variant: { id: 'production', harness: false, instrumentation: false, bundle }
    });

    expect(evidence).toMatchObject({
      schemaVersion: 1,
      sourceSha: 'a'.repeat(40),
      build: { id: 'production', bundleSha256: bundle.sha256 },
      codeByteTotal: 25,
      codeRoots: [
        { id: 'main', entrypoint: { path: 'main/index.js' } },
        { id: 'preload', entrypoint: { path: 'preload/index.js' } },
        { id: 'renderer', entrypoint: { path: 'renderer/assets/main-fixture.js' } },
        { id: 'worker', entrypoint: { path: 'renderer/assets/worker-entry-fixture.js' } }
      ],
      checksum: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
    expect(() => createProductionBundleEvidence({
      sourceSha: 'a'.repeat(40),
      variant: { id: 'production', harness: false, instrumentation: false, bundle: { ...bundle, entries: bundle.entries.filter((entry) => entry.path !== 'renderer/assets/worker-entry-fixture.js') } }
    })).toThrow(/worker code root is empty/);
  });
});

describe('createPerformanceCommandLedger', () => {
  it('records append-only build closure evidence on one monotonic runner clock', async () => {
    const clock = vi.fn()
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(2.5)
      .mockReturnValueOnce(3)
      .mockReturnValueOnce(4);
    const ledger = createPerformanceCommandLedger({ sourceSha: 'a'.repeat(40), clock });

    await expect(ledger.recordBuild('production', () => 'production-output')).resolves.toBe('production-output');
    await expect(ledger.recordBuild('instrumented', async () => 'instrumented-output')).resolves.toBe('instrumented-output');
    expect(ledger.snapshot()).toEqual({
      schemaVersion: 1,
      sourceSha: 'a'.repeat(40),
      entries: [
        {
          sequence: 1,
          operationId: 'build-spawn',
          start: 1,
          end: 2.5,
          buildId: 'production',
          closure: {
            closed: true,
            stdoutDrained: true,
            stderrDrained: true,
            inputClosed: true,
            exit: { code: 0, durationMs: 1500 },
            zeroSurvivors: true
          }
        },
        {
          sequence: 2,
          operationId: 'build-spawn',
          start: 3,
          end: 4,
          buildId: 'instrumented',
          closure: {
            closed: true,
            stdoutDrained: true,
            stderrDrained: true,
            inputClosed: true,
            exit: { code: 0, durationMs: 1000 },
            zeroSurvivors: true
          }
        }
      ]
    });
  });
});

describe('planned raw capture collection', () => {
  it('indexes the exact six sentinel, six workload, and eighteen external metric sides', async () => {
    const outputDirectory = await createTemporaryWorkspace();
    const sourceSha = 'a'.repeat(40);
    const pairPlan = createFixturePairPlan();
    const manifest = createFixtureManifest();
    const fixtures = writePlannedCaptureFixturesSync({ outputDirectory, pairPlan, manifest, sourceSha });

    const sentinel = await collectPerformanceSentinelCaptures({ outputDirectory, sourceSha, manifest, pairPlan });
    const externalMetric = await collectPerformanceExternalMetricCaptures({
      outputDirectory,
      sourceSha,
      manifest,
      sentinelCaptures: sentinel.captures,
      pairPlan
    });

    expect(sentinel.index).toMatchObject({
      schemaVersion: 3,
      sourceSha,
      captures: expect.arrayContaining([
        expect.objectContaining({ buildId: 'production', backend: 'canvas2d', pair: expect.objectContaining({ comparisonSide: 'A' }) })
      ])
    });
    expect(sentinel.index.captures).toHaveLength(6);
    expect(externalMetric.index).toMatchObject({ schemaVersion: 3, sourceSha });
    expect(externalMetric.index.captures).toHaveLength(18);
    expect(externalMetric.index.captures.filter((capture) => capture.buildId === 'instrumented')).toHaveLength(6);
    expect(fixtures.workloads).toHaveLength(6);
    await expect(fs.readFile(sentinel.indexPath, 'utf8')).resolves.toContain(fixtures.sentinels[0].relativePath);
  });

  it('rejects a planned capture whose bundle does not belong to the manifest', async () => {
    const outputDirectory = await createTemporaryWorkspace();
    const pairPlan = createFixturePairPlan();
    const manifest = createFixtureManifest();
    writePlannedCaptureFixturesSync({ outputDirectory, pairPlan, manifest });
    const mismatchedManifest = createFixtureManifest({
      production: 'c'.repeat(64),
      'harness-control': 'e'.repeat(64),
      instrumented: 'd'.repeat(64)
    });

    await expect(collectPerformanceSentinelCaptures({
      outputDirectory,
      sourceSha: 'a'.repeat(40),
      manifest: mismatchedManifest,
      pairPlan
    })).rejects.toThrow(/bundle hash does not match the build manifest/);
  });

  it('rejects a harness metric transcript whose pair side does not bind the sentinel boundary', async () => {
    const outputDirectory = await createTemporaryWorkspace();
    const pairPlan = createFixturePairPlan();
    const manifest = createFixtureManifest();
    const fixtures = writePlannedCaptureFixturesSync({ outputDirectory, pairPlan, manifest });
    const sentinel = await collectPerformanceSentinelCaptures({
      outputDirectory,
      sourceSha: 'a'.repeat(40),
      manifest,
      pairPlan
    });
    const malformedSentinels = sentinel.captures.map((entry, index) => index === 0
      ? { capture: { ...entry.capture, observationBoundaryId: 'different-boundary' } }
      : entry);

    await expect(collectPerformanceExternalMetricCaptures({
      outputDirectory,
      sourceSha: 'a'.repeat(40),
      manifest,
      sentinelCaptures: malformedSentinels,
      pairPlan
    })).rejects.toThrow(/sentinel run and observation boundary/);
    expect(fixtures.metrics).toHaveLength(18);
  });
});

describe('runPerformanceBaseline', () => {
  it('clean-builds and preserves all three variant bundles before invoking the performance lane', async () => {
    const cwd = await createTemporaryWorkspace();
    const calls: Array<{ command: string; args: readonly string[]; environment: NodeJS.ProcessEnv }> = [];
    const spawn = vi.fn((command: string, args: readonly string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => {
      calls.push({ command, args, environment: options.env });
      if (command === 'git' && args[0] === 'status') {
        return { status: 0, stdout: '', stderr: '' };
      }

      if (command === 'git' && args[0] === 'rev-parse') {
        return { status: 0, stdout: `${'a'.repeat(40)}\n`, stderr: '' };
      }

      if (command === 'npm') {
        const variant = `${options.env.PRISMGB_PERF_HARNESS_BUILD}:${options.env.PRISMGB_PERF_INSTRUMENTATION_BUILD}`;
        const dist = path.join(options.cwd, 'dist');
        fsSync.mkdirSync(path.join(dist, 'main'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'preload'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'renderer'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'renderer', 'assets'), { recursive: true });
        fsSync.writeFileSync(path.join(dist, 'main', 'index.js'), `main:${variant}`);
        fsSync.writeFileSync(path.join(dist, 'preload', 'index.js'), `preload:${variant}`);
        fsSync.writeFileSync(path.join(dist, 'renderer', 'index.js'), `renderer:${variant}`);
        fsSync.writeFileSync(path.join(dist, 'renderer', 'assets', 'main-fixture.js'), `renderer-entry:${variant}`);
        fsSync.writeFileSync(path.join(dist, 'renderer', 'assets', 'worker-entry-fixture.js'), `worker:${variant}`);
        return { status: 0, stdout: '', stderr: '' };
      }

      throw new Error(`unexpected command ${command}`);
    });

    const result = await runPerformanceBaseline({
      cwd,
      argv: ['--output', 'performance-output', '--role', 'ci-integrity', '--build-only'],
      baseEnvironment: { PATH: '/bin', DISPLAY: ':99' },
      spawn: spawn as unknown as typeof spawnSync,
      platform: 'linux'
    });

    expect(result.playwrightExecuted).toBe(false);
    expect(result.selectedHost).toBe(false);
    expect(result.manifest.sourceSha).toBe('a'.repeat(40));
    expect(result.manifest.variants.map((variant) => variant.id)).toEqual([
      'production',
      'harness-control',
      'instrumented'
    ]);
    expect(calls.filter((call) => call.command === 'npm').map((call) => [
      call.environment.PRISMGB_PERF_HARNESS_BUILD,
      call.environment.PRISMGB_PERF_INSTRUMENTATION_BUILD
    ])).toEqual([
      ['0', '0'],
      ['1', '0'],
      ['1', '1']
    ]);
    await expect(fs.readFile(path.join(result.buildsDirectory, 'instrumented', 'main', 'index.js'), 'utf8'))
      .resolves.toBe('main:1:1');
    await expect(fs.readFile(result.manifestPath, 'utf8')).resolves.toContain('"harness-control"');
    expect(result.productionBundleEvidence).toMatchObject({
      sourceSha: 'a'.repeat(40),
      build: { id: 'production', harness: false, instrumentation: false },
      codeRoots: [
        { id: 'main' },
        { id: 'preload' },
        { id: 'renderer' },
        { id: 'worker' }
      ]
    });
    await expect(fs.readFile(result.productionBundleEvidencePath, 'utf8')).resolves.toContain('worker-entry-fixture.js');
    await expect(fs.readFile(result.commandLedgerPath, 'utf8')).resolves.toContain('"build-spawn"');
    expect(result.commandLedger.entries.map((entry) => entry.buildId)).toEqual([
      'production',
      'harness-control',
      'instrumented'
    ]);
  });

  it('retains command stdout and stderr when the performance lane fails', async () => {
    const cwd = await createTemporaryWorkspace();
    const spawn = vi.fn((command: string, args: readonly string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => {
      if (command === 'git' && args[0] === 'status') return { status: 0, stdout: '', stderr: '' };
      if (command === 'git' && args[0] === 'rev-parse') return { status: 0, stdout: `${'a'.repeat(40)}\n`, stderr: '' };
      if (command === 'npm') {
        const dist = path.join(options.cwd, 'dist');
        fsSync.mkdirSync(path.join(dist, 'main'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'preload'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'renderer'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'renderer', 'assets'), { recursive: true });
        fsSync.writeFileSync(path.join(dist, 'main', 'index.js'), 'main');
        fsSync.writeFileSync(path.join(dist, 'preload', 'index.js'), 'preload');
        fsSync.writeFileSync(path.join(dist, 'renderer', 'index.js'), 'renderer');
        fsSync.writeFileSync(path.join(dist, 'renderer', 'assets', 'main-fixture.js'), 'renderer-entry');
        fsSync.writeFileSync(path.join(dist, 'renderer', 'assets', 'worker-entry-fixture.js'), 'worker');
        return { status: 0, stdout: '', stderr: '' };
      }
      if (command === 'npx') return { status: 1, stdout: 'playwright assertion detail', stderr: 'playwright warning' };
      throw new Error(`unexpected command ${command}`);
    });

    await expect(runPerformanceBaseline({
      cwd,
      argv: ['--output', 'performance-output', '--role', 'ci-integrity'],
      baseEnvironment: { PATH: '/bin', DISPLAY: ':99' },
      spawn: spawn as unknown as typeof spawnSync,
      platform: 'linux'
    })).rejects.toThrow(/playwright assertion detail[\s\S]*playwright warning/);
  });

  it('indexes the exact planned raw capture set produced by the Playwright lane', async () => {
    const cwd = await createTemporaryWorkspace();
    const spawn = vi.fn((command: string, args: readonly string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => {
      if (command === 'git' && args[0] === 'status') return { status: 0, stdout: '', stderr: '' };
      if (command === 'git' && args[0] === 'rev-parse') return { status: 0, stdout: `${'a'.repeat(40)}\n`, stderr: '' };
      if (command === 'npm') {
        const dist = path.join(options.cwd, 'dist');
        fsSync.mkdirSync(path.join(dist, 'main'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'preload'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'renderer'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'renderer', 'assets'), { recursive: true });
        fsSync.writeFileSync(path.join(dist, 'main', 'index.js'), `main:${options.env.PRISMGB_PERF_INSTRUMENTATION_BUILD}`);
        fsSync.writeFileSync(path.join(dist, 'preload', 'index.js'), `preload:${options.env.PRISMGB_PERF_INSTRUMENTATION_BUILD}`);
        fsSync.writeFileSync(path.join(dist, 'renderer', 'index.js'), `renderer:${options.env.PRISMGB_PERF_INSTRUMENTATION_BUILD}`);
        fsSync.writeFileSync(path.join(dist, 'renderer', 'assets', 'main-fixture.js'), `renderer-entry:${options.env.PRISMGB_PERF_INSTRUMENTATION_BUILD}`);
        fsSync.writeFileSync(path.join(dist, 'renderer', 'assets', 'worker-entry-fixture.js'), `worker:${options.env.PRISMGB_PERF_INSTRUMENTATION_BUILD}`);
        return { status: 0, stdout: '', stderr: '' };
      }
      if (command === 'npx') {
        const manifestPath = options.env.PRISMGB_PERFORMANCE_BUILD_MANIFEST;
        const outputDirectory = options.env.PRISMGB_PERFORMANCE_CAPTURE_OUTPUT;
        const pairPlanPath = options.env.PRISMGB_PERFORMANCE_PAIR_PLAN;
        if (!manifestPath || !outputDirectory || !pairPlanPath) throw new Error('expected performance output environment');
        const manifest = JSON.parse(fsSync.readFileSync(manifestPath, 'utf8'));
        const pairPlan = JSON.parse(fsSync.readFileSync(pairPlanPath, 'utf8'));
        if (pairPlan.pairs.length !== 9) throw new Error('expected the exact performance pair plan');
        writePlannedCaptureFixturesSync({
          outputDirectory,
          pairPlan,
          manifest,
          sourceSha: 'a'.repeat(40)
        });
        return { status: 0, stdout: '', stderr: '' };
      }
      throw new Error(`unexpected command ${command}`);
    });

    const result = await runPerformanceBaseline({
      cwd,
      argv: ['--output', 'performance-output', '--role', 'ci-integrity'],
      baseEnvironment: { PATH: '/bin', DISPLAY: ':99' },
      spawn: spawn as unknown as typeof spawnSync,
      platform: 'linux'
    });

    if (result.playwrightExecuted !== true) throw new Error('expected the Playwright lane to execute');
    expect(result.workloadCapture.index).toMatchObject({
      sourceSha: 'a'.repeat(40)
    });
    expect(result.workloadCapture.index.captures).toHaveLength(6);
    expect(result.workloadCapture.index.captures).toEqual(
      expect.arrayContaining([expect.objectContaining({ buildId: 'instrumented', sourceOpportunityCount: 2 })])
    );
    expect(result.sentinelCapture.index).toMatchObject({
      sourceSha: 'a'.repeat(40)
    });
    expect(result.sentinelCapture.index.captures).toHaveLength(6);
    expect(result.sentinelCapture.index.captures).toEqual(
      expect.arrayContaining([expect.objectContaining({ buildId: 'harness-control', backend: 'canvas2d' })])
    );
    expect(result.externalMetricCapture.index).toMatchObject({
      sourceSha: 'a'.repeat(40)
    });
    expect(result.externalMetricCapture.index.captures).toHaveLength(18);
    expect(result.externalMetricCapture.index.captures).toEqual(
      expect.arrayContaining([expect.objectContaining({ buildId: 'harness-control', adapterId: 'linux-procfs-v1' })])
    );
    expect(result.pairPlan).toMatchObject({ backend: 'canvas2d', pairs: expect.any(Array) });
    await expect(fs.readFile(result.pairPlanPath, 'utf8')).resolves.toContain('instrumentation-overhead');
    await expect(fs.readFile(result.workloadCapture.indexPath, 'utf8')).resolves.toContain('raw-workload-captures/');
    await expect(fs.readFile(result.sentinelCapture.indexPath, 'utf8')).resolves.toContain('raw-sentinel-captures/');
    await expect(fs.readFile(result.externalMetricCapture.indexPath, 'utf8')).resolves.toContain('raw-external-metric-captures/');
  });

  it('rejects a passing Playwright lane that does not persist its workload capture', async () => {
    const cwd = await createTemporaryWorkspace();
    const spawn = vi.fn((command: string, args: readonly string[], options: { cwd: string }) => {
      if (command === 'git' && args[0] === 'status') return { status: 0, stdout: '', stderr: '' };
      if (command === 'git' && args[0] === 'rev-parse') return { status: 0, stdout: `${'a'.repeat(40)}\n`, stderr: '' };
      if (command === 'npm') {
        const dist = path.join(options.cwd, 'dist');
        fsSync.mkdirSync(path.join(dist, 'main'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'preload'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'renderer'), { recursive: true });
        fsSync.mkdirSync(path.join(dist, 'renderer', 'assets'), { recursive: true });
        fsSync.writeFileSync(path.join(dist, 'main', 'index.js'), 'main');
        fsSync.writeFileSync(path.join(dist, 'preload', 'index.js'), 'preload');
        fsSync.writeFileSync(path.join(dist, 'renderer', 'index.js'), 'renderer');
        fsSync.writeFileSync(path.join(dist, 'renderer', 'assets', 'main-fixture.js'), 'renderer-entry');
        fsSync.writeFileSync(path.join(dist, 'renderer', 'assets', 'worker-entry-fixture.js'), 'worker');
        return { status: 0, stdout: '', stderr: '' };
      }
      if (command === 'npx') return { status: 0, stdout: '', stderr: '' };
      throw new Error(`unexpected command ${command}`);
    });

    await expect(runPerformanceBaseline({
      cwd,
      argv: ['--output', 'performance-output', '--role', 'ci-integrity'],
      baseEnvironment: { PATH: '/bin', DISPLAY: ':99' },
      spawn: spawn as unknown as typeof spawnSync,
      platform: 'linux'
    })).rejects.toThrow(/expected exactly 6 instrumented workload captures, found 0/);
  });

  it('rejects a dirty source tree before building any variant', async () => {
    const cwd = await createTemporaryWorkspace();
    const spawn = vi.fn((command: string, args: readonly string[]) => {
      if (command === 'git' && args[0] === 'status') {
        return { status: 0, stdout: ' M src/main/index.ts\n', stderr: '' };
      }
      throw new Error(`unexpected command ${command}`);
    });

    await expect(runPerformanceBaseline({
      cwd,
      argv: ['--output', 'performance-output', '--role', 'ci-integrity', '--build-only'],
      baseEnvironment: { PATH: '/bin' },
      spawn: spawn as unknown as typeof spawnSync,
      platform: 'linux'
    })).rejects.toThrow(/source tree must be clean/);
    expect(spawn).toHaveBeenCalledTimes(1);
    await expect(fs.access(path.join(cwd, 'performance-output'))).rejects.toThrow();
  });
});
