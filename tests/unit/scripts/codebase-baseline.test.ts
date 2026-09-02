import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  classifyRepositoryArea,
  countNonblankLines,
  countPhysicalLines,
  createSourceBaseline,
  parseCodebaseBaselineArgs,
  runGit
} from '../../../scripts/codebase-baseline.js';
import { VITE_ELECTRON_RENDERER_PLACEHOLDER } from '../../../scripts/clean-generated.js';
import { loadBaselinePolicy } from '../../../scripts/lib/performance-evidence.js';

const roots: string[] = [];
const projectRoot = process.cwd();
const originSha = '9a7839ce47c61982f6eab836c496b8469f01a9ca';

afterEach(() => {
  while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

function createRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-codebase-baseline-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { runtime: '1' }, devDependencies: { development: '1', '@electron/asar': '1' } }));
  fs.writeFileSync(path.join(root, 'src/a.ts'), 'const current = true;\n\n');
  fs.writeFileSync(path.join(root, 'dist/ignored.js'), 'this is ignored by the tracked universe\n');
  fs.copyFileSync(path.join(projectRoot, 'CODEBASE_NORMALIZATION_AND_REDUCTION_ANALYSIS.md'), path.join(root, 'CODEBASE_NORMALIZATION_AND_REDUCTION_ANALYSIS.md'));
  return root;
}

function createFakeGitSpawn(options: {
  originFiles?: string[];
  trackedFiles?: string[];
  originContents?: Record<string, string | Buffer>;
  numstat?: string;
  hunks?: string;
  status?: string;
} = {}) {
  const originFiles = options.originFiles ?? ['package.json', 'src/a.ts'];
  const trackedFiles = options.trackedFiles ?? ['CODEBASE_NORMALIZATION_AND_REDUCTION_ANALYSIS.md', 'package.json', 'src/a.ts'];
  const originContents: Record<string, string | Buffer> = {
    'package.json': JSON.stringify({ dependencies: { runtime: '1' }, devDependencies: { development: '1' } }),
    'src/a.ts': 'const origin = true;\n',
    ...options.originContents
  };
  const numstat = options.numstat ?? '1\t1\tpackage.json\n1\t1\tsrc/a.ts\n';
  const hunks = options.hunks ?? 'diff --git a/package.json b/package.json\n@@ -1 +1 @@\ndiff --git a/src/a.ts b/src/a.ts\n@@ -1 +1 @@\n';
  const response = (stdout: Buffer | string) => ({ status: 0, stdout: Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout), stderr: Buffer.alloc(0) });
  return (_command: string, args: string[]) => {
    if (args[0] === 'ls-tree') return response(`${originFiles.join('\0')}\0`);
    if (args[0] === 'ls-files') return response(`${trackedFiles.join('\0')}\0`);
    if (args[0] === 'show') {
      const prefix = `${originSha}:`;
      const relativePath = args[1]?.startsWith(prefix) ? args[1].slice(prefix.length) : undefined;
      if (relativePath && originContents[relativePath] !== undefined) return response(originContents[relativePath]);
    }
    if (args[0] === 'diff' && args.includes('--numstat')) return response(numstat);
    if (args[0] === 'diff' && args.includes('--unified=0')) return response(hunks);
    if (args[0] === 'merge-base' && args[1] === '--is-ancestor') return response(Buffer.alloc(0));
    if (args[0] === 'rev-parse' && args[1] === 'HEAD') return response(`${originSha}\n`);
    if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return response('main\n');
    if (args[0] === 'status') return response(options.status ?? '');
    return { status: 1, stdout: Buffer.alloc(0), stderr: Buffer.from(`unexpected git invocation: ${args.join(' ')}`) };
  };
}

const fakeGitSpawn = createFakeGitSpawn();

describe('codebase source baseline', () => {
  it('uses tracked and origin Git universes, never an ignored worktree walk', () => {
    const root = createRoot();
    const report = createSourceBaseline({
      cwd: root,
      spawn: fakeGitSpawn as never,
      policy: loadBaselinePolicy(),
      now: () => '2026-07-11T00:00:00.000Z'
    });
    expect(report.repository.dirty).toBe(false);
    expect(report.metrics.originProgramSurface.totals.files).toBe(2);
    expect(report.metrics.evidenceWorkspaceSurface.totals.files).toBe(3);
    expect(report.metrics.phase0ToolingOverhead.phase0OwnedPaths).toEqual(['CODEBASE_NORMALIZATION_AND_REDUCTION_ANALYSIS.md']);
    expect(report.inputs.paths).not.toContain('dist/ignored.js');
  });

  it('accounts for paired metric capture tooling as Phase 0-owned evidence', () => {
    const root = createRoot();
    const ownedPaths = [
      'scripts/lib/performance-metric-session-capture.js',
      'scripts/lib/performance-pair-plan.js',
      'scripts/lib/performance-raw-capture-manifest.js',
      'tests/unit/scripts/performance-metric-session-capture.test.ts',
      'tests/unit/scripts/performance-pair-plan.test.ts',
      'tests/unit/scripts/performance-raw-capture-manifest.test.ts'
    ];
    for (const relativePath of ownedPaths) {
      const outputPath = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, 'export const phase0Owned = true;\n');
    }
    const report = createSourceBaseline({
      cwd: root,
      spawn: createFakeGitSpawn({
        trackedFiles: ['CODEBASE_NORMALIZATION_AND_REDUCTION_ANALYSIS.md', 'package.json', 'src/a.ts', ...ownedPaths]
      }) as never,
      policy: loadBaselinePolicy(),
      now: () => '2026-07-11T00:00:00.000Z'
    });
    expect(report.metrics.phase0ToolingOverhead.phase0OwnedPaths).toEqual([
      'CODEBASE_NORMALIZATION_AND_REDUCTION_ANALYSIS.md',
      ...ownedPaths
    ].sort());
    expect(report.metrics.phase0ToolingOverhead.unknownNewPaths).toEqual([]);
  });

  it('classifies the reconciled Phase 0.3 additions and modifications as owned', () => {
    const root = createRoot();
    const addedPaths = [
      'scripts/lib/performance-controller-audit.js',
      'tests/unit/scripts/gpu-performance-baseline-helper.test.ts',
      'tests/unit/scripts/performance-controller-audit.fixture.ts',
      'tests/unit/scripts/performance.fixture.test.ts'
    ];
    const modifiedPaths = [
      'src/platform/gpu/application/renderer.service.ts',
      'tests/e2e/fixtures/chromatic-device.fixture.js'
    ];
    for (const relativePath of [...addedPaths, ...modifiedPaths]) {
      const outputPath = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, 'export const phase0Owned = true;\n');
    }
    const diffPaths = ['package.json', 'src/a.ts', ...modifiedPaths];
    const report = createSourceBaseline({
      cwd: root,
      spawn: createFakeGitSpawn({
        originFiles: ['package.json', 'src/a.ts', ...modifiedPaths],
        trackedFiles: [
          'CODEBASE_NORMALIZATION_AND_REDUCTION_ANALYSIS.md',
          'package.json',
          'src/a.ts',
          ...modifiedPaths,
          ...addedPaths
        ],
        originContents: Object.fromEntries(modifiedPaths.map((relativePath) => [
          relativePath,
          'export const phase0Owned = false;\n'
        ])),
        numstat: diffPaths.map((relativePath) => `1\t1\t${relativePath}\n`).join(''),
        hunks: diffPaths.map((relativePath) => (
          `diff --git a/${relativePath} b/${relativePath}\n@@ -1 +1 @@\n`
        )).join('')
      }) as never,
      policy: loadBaselinePolicy(),
      now: () => '2026-07-11T00:00:00.000Z'
    });
    const overhead = report.metrics.phase0ToolingOverhead;
    expect(overhead.phase0OwnedPaths).toEqual([
      'CODEBASE_NORMALIZATION_AND_REDUCTION_ANALYSIS.md',
      ...addedPaths
    ].sort());
    expect(overhead.unknownNewPaths).toEqual([]);
    expect(overhead.originToWorkspace.phase0OwnedModifiedPaths.map(({ path: relativePath }) => relativePath)).toEqual(
      [...modifiedPaths].sort()
    );
    for (const relativePath of modifiedPaths) {
      expect(overhead.originToWorkspace.nonPhase0ModifiedPaths).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ path: relativePath })
      ]));
    }
  });

  it('keeps line semantics and command parsing deterministic', () => {
    expect(countPhysicalLines(Buffer.from('one\n\n'))).toBe(2);
    expect(countNonblankLines(Buffer.from('one\n \n'))).toBe(1);
    expect(classifyRepositoryArea('tests/unit/file.ts')).toBe('tests');
    expect(parseCodebaseBaselineArgs(['--output', 'out.json', '--format', 'summary', '--allow-dirty'])).toEqual({
      output: 'out.json', compare: null, format: 'summary', allowDirty: true, captureProvenance: null
    });
    expect(() => runGit(['status'], { spawn: () => ({ status: 1, stdout: Buffer.alloc(0), stderr: Buffer.from('boom') }) as never })).toThrow(/boom/);
  });

  it('keeps source-report ordering stable when locale comparison behavior changes', () => {
    const root = createRoot();
    const baseline = createSourceBaseline({
      cwd: root,
      spawn: fakeGitSpawn as never,
      policy: loadBaselinePolicy(),
      now: () => '2026-07-11T00:00:00.000Z'
    });
    const originalLocaleCompare = String.prototype.localeCompare;
    let contrasted: ReturnType<typeof createSourceBaseline>;
    try {
      String.prototype.localeCompare = () => -1;
      contrasted = createSourceBaseline({
        cwd: root,
        spawn: fakeGitSpawn as never,
        policy: loadBaselinePolicy(),
        now: () => '2026-07-11T00:00:00.000Z'
      });
    } finally {
      String.prototype.localeCompare = originalLocaleCompare;
    }
    expect(contrasted).toEqual(baseline);
  });

  it('accounts for origin-existing hunks and direct dependency deltas without publishing product reduction', () => {
    const root = createRoot();
    const report = createSourceBaseline({
      cwd: root,
      spawn: fakeGitSpawn as never,
      policy: loadBaselinePolicy(),
      now: () => '2026-07-11T00:00:00.000Z'
    });
    const delta = report.metrics.phase0ToolingOverhead.originToWorkspace;
    expect(delta.modifiedPaths).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'src/a.ts', hunkCount: 1, addedLines: 1, deletedLines: 1 })
    ]));
    expect(delta.dependencyDelta.development.added).toEqual(['@electron/asar']);
    expect(report.metrics.productReduction).toEqual({
      published: false,
      reason: 'Phase 0 source reporter does not publish an S-derived product reduction.'
    });
  });

  it('accounts for removed measurements, compile-gated hunks, and a removed direct ASAR dependency', () => {
    const root = createRoot();
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { runtime: '1' }, devDependencies: { development: '1' } }));
    fs.writeFileSync(path.join(root, 'src/compile-gated.ts'), 'export const compileGated = true;\n');
    const report = createSourceBaseline({
      cwd: root,
      spawn: createFakeGitSpawn({
        originFiles: ['package.json', 'src/a.ts', 'src/compile-gated.ts', 'tests/measurement.ts'],
        trackedFiles: ['CODEBASE_NORMALIZATION_AND_REDUCTION_ANALYSIS.md', 'package.json', 'src/a.ts', 'src/compile-gated.ts'],
        originContents: {
          'package.json': JSON.stringify({ dependencies: { runtime: '1' }, devDependencies: { development: '1', '@electron/asar': '1' } }),
          'src/compile-gated.ts': 'export const compileGated = false;\n',
          'tests/measurement.ts': 'export const measurement = true;\n'
        },
        numstat: '1\t1\tpackage.json\n1\t1\tsrc/a.ts\n1\t1\tsrc/compile-gated.ts\n',
        hunks: 'diff --git a/package.json b/package.json\n@@ -1 +1 @@\ndiff --git a/src/a.ts b/src/a.ts\n@@ -1 +1 @@\ndiff --git a/src/compile-gated.ts b/src/compile-gated.ts\n@@ -1 +1 @@\n'
      }) as never,
      policy: loadBaselinePolicy(),
      now: () => '2026-07-11T00:00:00.000Z'
    });
    const overhead = report.metrics.phase0ToolingOverhead;
    expect(overhead.removedPaths).toEqual(['tests/measurement.ts']);
    expect(overhead.originToWorkspace.nonPhase0ModifiedPaths).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'src/compile-gated.ts', hunkCount: 1, addedLines: 1, deletedLines: 1 })
    ]));
    expect(overhead.originToWorkspace.dependencyDelta.development.removed).toEqual(['@electron/asar']);
  });

  it('accepts only owned generated residue and records every unexpected untracked path', () => {
    const root = createRoot();
    fs.mkdirSync(path.join(root, 'release'), { recursive: true });
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tests/e2e/.generated'), { recursive: true });
    fs.writeFileSync(path.join(root, 'release/ignored.js'), 'release output\n');
    fs.writeFileSync(path.join(root, 'artifacts/ignored.json'), '{}\n');
    fs.writeFileSync(path.join(root, 'tests/e2e/.generated/fixture.json'), '{}\n');
    fs.writeFileSync(path.join(root, 'index.html'), VITE_ELECTRON_RENDERER_PLACEHOLDER);
    const generatedStatus = '?? dist/ignored.js\0?? release/ignored.js\0?? artifacts/ignored.json\0?? tests/e2e/.generated/fixture.json\0?? index.html\0';
    const generatedReport = createSourceBaseline({
      cwd: root,
      spawn: createFakeGitSpawn({ status: generatedStatus }) as never,
      policy: loadBaselinePolicy(),
      now: () => '2026-07-11T00:00:00.000Z'
    });
    expect(generatedReport.repository.dirty).toBe(false);
    expect(generatedReport.inputs.paths).not.toContain('release/ignored.js');

    const nonPlaceholderRoot = createRoot();
    fs.writeFileSync(path.join(nonPlaceholderRoot, 'index.html'), `${VITE_ELECTRON_RENDERER_PLACEHOLDER}<script>not-owned</script>`);
    expect(() => createSourceBaseline({
      cwd: nonPlaceholderRoot,
      spawn: createFakeGitSpawn({ status: '?? index.html\0' }) as never,
      policy: loadBaselinePolicy(),
      now: () => '2026-07-11T00:00:00.000Z'
    })).toThrow(/unexpected source state: index.html/);

    const whitespaceAlteredPlaceholderRoot = createRoot();
    fs.writeFileSync(path.join(whitespaceAlteredPlaceholderRoot, 'index.html'), `\n${VITE_ELECTRON_RENDERER_PLACEHOLDER}\n`);
    expect(() => createSourceBaseline({
      cwd: whitespaceAlteredPlaceholderRoot,
      spawn: createFakeGitSpawn({ status: '?? index.html\0' }) as never,
      policy: loadBaselinePolicy(),
      now: () => '2026-07-11T00:00:00.000Z'
    })).toThrow(/unexpected source state: index.html/);

    const untrackedRoot = createRoot();
    expect(() => createSourceBaseline({
      cwd: untrackedRoot,
      spawn: createFakeGitSpawn({ status: '?? notes.txt\0' }) as never,
      policy: loadBaselinePolicy(),
      now: () => '2026-07-11T00:00:00.000Z'
    })).toThrow(/unexpected source state: notes.txt/);
    const dirtyReport = createSourceBaseline({
      cwd: untrackedRoot,
      spawn: createFakeGitSpawn({ status: '?? notes.txt\0' }) as never,
      policy: loadBaselinePolicy(),
      now: () => '2026-07-11T00:00:00.000Z',
      allowDirty: true
    });
    expect(dirtyReport.metrics.repositoryUnexpectedPaths).toEqual(['notes.txt']);
  });

  it('binds supplied capture provenance to the current source and validated analysis', () => {
    const root = createRoot();
    const capture = {
      provider: 'local' as const,
      sourceSha: 'b'.repeat(40),
      analysisSha256: '0c6a4ccbe48b9b12e4c58bd153ae6f5c04bed82fb489c5a2402d21934b4c8fba',
      captureSessionId: 'test-session',
      producer: { role: 'source-test', targetId: null, reportSetId: 'test-set' }
    };
    expect(() => createSourceBaseline({
      cwd: root,
      spawn: fakeGitSpawn as never,
      policy: loadBaselinePolicy(),
      captureProvenance: capture
    })).toThrow(/sourceSha must match repository HEAD/);
    expect(() => createSourceBaseline({
      cwd: root,
      spawn: fakeGitSpawn as never,
      policy: loadBaselinePolicy(),
      captureProvenance: { ...capture, sourceSha: originSha, analysisSha256: 'b'.repeat(64) }
    })).toThrow(/analysisSha256 must match the validated analysis digest/);
  });
});
