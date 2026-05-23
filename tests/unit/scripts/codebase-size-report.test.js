import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { describe, expect, it } from 'vitest';
import {
  buildCodebaseSizeReport,
  collectGitSourceDelta,
  countEventContractEntries,
  countGeneratedArtifacts,
  countIpcContractEntries,
  countMockFiles,
  evaluateCodebaseSizeReport,
  getShaderDuplicateStatus,
  parseArgs,
  readCodebaseSizeThresholds,
  summarizeSourceLocByArea,
  summarizeTrackedFileCounts
} from '../../../scripts/codebase-size-report.js';

function createTempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codebase-size-report-'));
}

function writeWorkspaceFile(root, relativePath, content = '') {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
  return absolutePath;
}

function runGit(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`);
  }
}

describe('codebase-size-report args', () => {
  it('parses --json and --root flags', () => {
    const options = parseArgs([
      '--json',
      '--root',
      'repo-root',
      '--enforce-thresholds',
      '--thresholds',
      'scripts/size-thresholds.json'
    ]);
    expect(options.json).toBe(true);
    expect(options.root).toBe(path.resolve(process.cwd(), 'repo-root'));
    expect(options.enforceThresholds).toBe(true);
    expect(options.thresholdPath).toBe('scripts/size-thresholds.json');
  });
});

describe('codebase-size-report metrics', () => {
  it('counts existing tracked and untracked non-ignored files in git worktrees', () => {
    const workspace = createTempWorkspace();
    try {
      runGit(workspace, ['init']);
      const deletedTracked = writeWorkspaceFile(workspace, 'src/preload/deleted.js', 'export {};\n');
      runGit(workspace, ['add', 'src/preload/deleted.js']);
      fs.rmSync(deletedTracked);
      writeWorkspaceFile(workspace, 'src/preload/current.ts', 'export const current = true;\n');

      const report = buildCodebaseSizeReport(workspace);

      expect(report.trackedFileCounts.total).toBe(1);
      expect(report.sourceLocByArea.byArea.preload).toEqual({ files: 1, loc: 1 });
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('adds untracked source files to runtime source delta', () => {
    const workspace = createTempWorkspace();
    try {
      runGit(workspace, ['init']);
      writeWorkspaceFile(workspace, 'src/preload/base.ts', 'export const base = true;\n');
      runGit(workspace, ['add', 'src/preload/base.ts']);
      runGit(workspace, [
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '-m',
        'baseline'
      ]);
      writeWorkspaceFile(workspace, 'src/preload/current.ts', 'export const current = true;\n');

      const delta = collectGitSourceDelta(workspace, {
        baseRef: 'HEAD',
        scopes: ['src/preload']
      });

      expect(delta).toMatchObject({
        status: 'available',
        added: 1,
        deleted: 0,
        net: 1,
        filesChanged: 1
      });
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('counts tracked files and LOC by source area', () => {
    const workspace = createTempWorkspace();
    try {
      const trackedFiles = [
        writeWorkspaceFile(workspace, 'src/main/index.ts', 'const x = 1;\n'),
        writeWorkspaceFile(workspace, 'src/main/service.js', 'console.log(x);\nconsole.log(y);\n'),
        writeWorkspaceFile(workspace, 'src/renderer/index.ts', 'function run() {}\n'),
        writeWorkspaceFile(workspace, 'src/shared/contract.ts', 'export const x = {}\n'),
        writeWorkspaceFile(workspace, 'scripts/report.js', 'module.exports = {}\n'),
        writeWorkspaceFile(workspace, 'packages/prismgb-gpu/index.ts', 'export default true\n'),
        writeWorkspaceFile(workspace, 'packages/prismgb-gpu/tests/unit/pipeline.test.ts', 'test(() => {})\n')
      ];

      const trackedSummary = summarizeTrackedFileCounts(trackedFiles, workspace);
      const locSummary = summarizeSourceLocByArea(trackedFiles, workspace);

      expect(trackedSummary.total).toBe(7);
      expect(trackedSummary.byArea).toEqual({
        main: 2,
        renderer: 1,
        shared: 1,
        scripts: 1,
        'gpu-package': 1,
        tests: 1
      });

      expect(locSummary.totalLines).toBe(8);
      expect(locSummary.byArea.main).toEqual({ files: 2, loc: 3 });
      expect(locSummary.byArea.renderer).toEqual({ files: 1, loc: 1 });
      expect(locSummary.byArea.shared).toEqual({ files: 1, loc: 1 });
      expect(locSummary.byArea['gpu-package']).toEqual({ files: 1, loc: 1 });
      expect(locSummary.byArea.tests).toEqual({ files: 1, loc: 1 });
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('counts mock files from tracking snapshots', () => {
    const workspace = createTempWorkspace();
    try {
      const trackedFiles = [
        writeWorkspaceFile(workspace, 'tests/mocks/mock-device.js', 'export {};\n'),
        writeWorkspaceFile(workspace, 'tests/e2e/mocks/device-mock.js', 'export {};\n'),
        writeWorkspaceFile(workspace, 'tests/support/lazy-mock.js', 'export {};\n'),
        writeWorkspaceFile(workspace, 'tests/mocks/index.js', 'export {};\n'),
        writeWorkspaceFile(workspace, 'src/main/logic.js', 'export {};\n')
      ];

      const mockCounts = countMockFiles(trackedFiles, workspace);

      expect(mockCounts.total).toBe(4);
      expect(mockCounts.byLocation).toEqual({
        testsMocks: 2,
        e2eMocks: 1,
        namedMockFiles: 1,
        otherMockPaths: 0
      });
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('detects shader duplicates and mismatches', () => {
    const workspace = createTempWorkspace();
    try {
      writeWorkspaceFile(
        workspace,
        'packages/prismgb-gpu/src/infrastructure/webgpu/shaders/common.glsl',
        'void main() {}\n'
      );
      writeWorkspaceFile(
        workspace,
        'src/renderer/infrastructure/rendering/shaders/webgpu/common.glsl',
        'void main() {}\n'
      );
      writeWorkspaceFile(
        workspace,
        'packages/prismgb-gpu/src/infrastructure/webgpu/shaders/mismatch.glsl',
        'void mismatch() {}\n'
      );
      writeWorkspaceFile(
        workspace,
        'src/renderer/infrastructure/rendering/shaders/webgpu/mismatch.glsl',
        'void mismatchA() {}\n'
      );
      writeWorkspaceFile(
        workspace,
        'packages/prismgb-gpu/src/infrastructure/webgpu/shaders/package-only.glsl',
        'void packageOnly() {}\n'
      );
      writeWorkspaceFile(
        workspace,
        'src/renderer/infrastructure/rendering/shaders/webgpu/extra.glsl',
        'void extra() {}\n'
      );

      const result = getShaderDuplicateStatus(workspace);
      const webgpuPair = result.pairs.find((entry) => entry.name === 'webgpu');

      expect(result.allSynchronized).toBe(false);
      expect(webgpuPair).toBeDefined();
      expect(webgpuPair.matching).toBe(1);
      expect(webgpuPair.mismatches).toBe(1);
      expect(webgpuPair.missingInSourceA).toBe(1);
      expect(webgpuPair.missingInSourceB).toBe(1);
      expect(webgpuPair.status).toBe('diverged');
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('reports package-owned shader status when the renderer duplicate tree is gone', () => {
    const workspace = createTempWorkspace();
    try {
      writeWorkspaceFile(
        workspace,
        'packages/prismgb-gpu/src/infrastructure/webgpu/shaders/package-only.wgsl',
        'fn packageOnly() {}\n'
      );

      const result = getShaderDuplicateStatus(workspace);
      const webgpuPair = result.pairs.find((entry) => entry.name === 'webgpu');

      expect(webgpuPair.missingInSourceA).toBe(0);
      expect(webgpuPair.missingInSourceB).toBe(1);
      expect(webgpuPair.status).toBe('package-owned');
      expect(result.cleanOwnership).toBe(true);
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('reports shader files missing in sourceA when only the renderer copy has them', () => {
    const workspace = createTempWorkspace();
    try {
      writeWorkspaceFile(
        workspace,
        'src/renderer/infrastructure/rendering/shaders/webgpu/renderer-only.wgsl',
        'fn rendererOnly() {}\n'
      );

      const result = getShaderDuplicateStatus(workspace);
      const webgpuPair = result.pairs.find((entry) => entry.name === 'webgpu');

      expect(webgpuPair.missingInSourceA).toBe(1);
      expect(webgpuPair.missingInSourceB).toBe(0);
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('discovers package build outputs and vendored dependency artifacts separately', () => {
    const workspace = createTempWorkspace();
    try {
      writeWorkspaceFile(workspace, 'artifacts/report.json', '{}\n');
      writeWorkspaceFile(workspace, 'packages/prismgb-gpu/dist/index.js', 'export {};\n');
      writeWorkspaceFile(workspace, 'packages/prismgb-gpu/.turbo/cache.json', '{}\n');
      writeWorkspaceFile(workspace, 'packages/prismgb-gpu/node_modules/.package-lock.json', '{}\n');

      const artifacts = countGeneratedArtifacts(workspace, ['artifacts']);
      const locationsByPath = Object.fromEntries(
        artifacts.locations.map((location) => [location.path, location])
      );

      expect(locationsByPath.artifacts).toMatchObject({
        category: 'local-artifact',
        exists: true,
        fileCount: 1
      });
      expect(locationsByPath['packages/prismgb-gpu/dist']).toMatchObject({
        category: 'package-output',
        exists: true,
        fileCount: 1
      });
      expect(locationsByPath['packages/prismgb-gpu/.turbo']).toMatchObject({
        category: 'package-output',
        exists: true,
        fileCount: 1
      });
      expect(locationsByPath['packages/prismgb-gpu/node_modules']).toMatchObject({
        category: 'vendored-dependency',
        exists: true,
        fileCount: 1
      });
      expect(artifacts.byCategory['package-output']).toMatchObject({
        existingLocations: 2,
        fileCount: 2
      });
      expect(artifacts.byCategory['vendored-dependency']).toMatchObject({
        existingLocations: 1,
        fileCount: 1
      });
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('counts IPC and event contract entries from contract files', () => {
    const workspace = createTempWorkspace();
    try {
      writeWorkspaceFile(
        workspace,
        'src/shared/ipc/channels.json',
        JSON.stringify({
          DEVICE: { GET_STATUS: 'device:get-status', CONNECTED: 'device:connected' },
          UPDATE: { CHECK: 'update:check', DOWNLOAD: 'update:download' },
          DUP: { TEST: 'update:check' }
        }) + '\n'
      );

      writeWorkspaceFile(
        workspace,
        'src/shared/events/event-channels.ts',
        [
          "export const EventChannels = {",
          "  DEVICE: {",
          "    STATUS: 'device:status',",
          "    CONNECTED: 'device:connected',",
          "  },",
          "  STREAM: {",
          "    STARTED: 'stream:started',",
          "  },",
          '} as const;'
        ].join('\n')
      );

      writeWorkspaceFile(
        workspace,
        'src/shared/events/event-payloads.ts',
        [
          "import { EventChannels } from './event-channels.js';",
          'export type EventPayloadMap = {',
          '  [EventChannels.DEVICE.STATUS]: { id: string };',
          '  [EventChannels.STREAM.STARTED]: { status: string };',
          '  [EventChannels.DEVICE.CONNECTED]: void;',
          '};'
        ].join('\n')
      );

      const ipc = countIpcContractEntries(workspace);
      const event = countEventContractEntries(workspace);

      expect(ipc.namespaces).toBe(3);
      expect(ipc.channels).toBe(5);

      expect(event.channels).toBe(3);
      expect(event.payloadEntries).toBe(3);

      const fullReport = buildCodebaseSizeReport(workspace, {
        trackedFiles: [
          path.join(workspace, 'src/shared/ipc/channels.json'),
          path.join(workspace, 'src/shared/events/event-channels.ts'),
          path.join(workspace, 'src/shared/events/event-payloads.ts')
        ]
      });

      expect(fullReport.ipcContract.channels).toBe(5);
      expect(fullReport.eventContract.channels).toBe(3);
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('reads and evaluates enforced codebase-size thresholds', () => {
    const workspace = createTempWorkspace();
    try {
      const thresholdPath = writeWorkspaceFile(
        workspace,
        'scripts/codebase-size-thresholds.json',
        JSON.stringify({
          version: 1,
          mode: 'enforce',
          baseline: {
            ref: 'base-ref',
            scopes: ['src/main']
          },
          limits: {
            trackedFilesTotalMax: 2,
            sourceLocTotalMax: 10,
            sourceLocByAreaMax: {
              main: 4
            },
            runtimeSourceNetGrowthMax: 0,
            shaderDuplicateDivergenceCountMax: 0,
            rendererShaderDuplicateFileCountMax: 0
          }
        })
      );
      const thresholds = readCodebaseSizeThresholds(thresholdPath);
      const report = {
        trackedFileCounts: { total: 3 },
        sourceLocByArea: {
          totalLines: 11,
          byArea: {
            main: { files: 1, loc: 5 }
          }
        },
        duplicateShaders: {
          pairs: [
            { status: 'diverged', rightFileCount: 1 }
          ]
        },
        runtimeSourceDelta: {
          status: 'available',
          net: 1
        }
      };

      const evaluation = evaluateCodebaseSizeReport(report, thresholds);

      expect(evaluation.passed).toBe(false);
      expect(evaluation.failures.map((failure) => failure.type)).toEqual([
        'tracked-file-count',
        'source-loc-total',
        'source-loc-area',
        'shader-duplicate-divergence',
        'renderer-shader-duplicate-files',
        'runtime-source-net-growth'
      ]);
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });
});
