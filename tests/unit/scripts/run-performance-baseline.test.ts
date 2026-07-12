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
  createPerformanceCommandLedger,
  createPerformanceBuildEnvironment,
  createProductionBundleEvidence,
  parsePerformanceBaselineArgs,
  runPerformanceBaseline
} from '../../../scripts/run-performance-baseline.js';
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
      baseEnvironment: { PATH: '/bin' },
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
      baseEnvironment: { PATH: '/bin' },
      spawn: spawn as unknown as typeof spawnSync,
      platform: 'linux'
    })).rejects.toThrow(/playwright assertion detail[\s\S]*playwright warning/);
  });

  it('indexes the checksum-bound instrumented workload capture produced by the Playwright lane', async () => {
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
        if (!manifestPath || !outputDirectory) throw new Error('expected performance output environment');
        const manifest = JSON.parse(fsSync.readFileSync(manifestPath, 'utf8'));
        const instrumented = manifest.variants.find((variant: { id: string }) => variant.id === 'instrumented');
        const capture = createPerformanceWorkloadCapture({
          sourceSha: 'a'.repeat(40),
          launchId: '123e4567-e89b-42d3-a456-426614174000',
          build: {
            id: instrumented.id,
            harness: instrumented.harness,
            instrumentation: instrumented.instrumentation,
            bundleSha256: instrumented.bundle.sha256
          },
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
        const directory = path.join(outputDirectory, 'raw-workload-captures');
        fsSync.mkdirSync(directory, { recursive: true });
        fsSync.writeFileSync(path.join(directory, `${capture.launchId}-${capture.checksum}.json`), JSON.stringify(capture));
        return { status: 0, stdout: '', stderr: '' };
      }
      throw new Error(`unexpected command ${command}`);
    });

    const result = await runPerformanceBaseline({
      cwd,
      argv: ['--output', 'performance-output', '--role', 'ci-integrity'],
      baseEnvironment: { PATH: '/bin' },
      spawn: spawn as unknown as typeof spawnSync,
      platform: 'linux'
    });

    if (result.playwrightExecuted !== true) throw new Error('expected the Playwright lane to execute');
    expect(result.workloadCapture.index).toMatchObject({
      sourceSha: 'a'.repeat(40),
      captures: [expect.objectContaining({ buildId: 'instrumented', sourceOpportunityCount: 2 })]
    });
    await expect(fs.readFile(result.workloadCapture.indexPath, 'utf8')).resolves.toContain('raw-workload-captures/');
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
      baseEnvironment: { PATH: '/bin' },
      spawn: spawn as unknown as typeof spawnSync,
      platform: 'linux'
    })).rejects.toThrow(/expected exactly one instrumented workload capture/);
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
