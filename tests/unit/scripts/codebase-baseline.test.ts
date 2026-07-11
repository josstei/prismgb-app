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

function fakeGitSpawn(_command: string, args: string[]) {
  const packageJson = Buffer.from(JSON.stringify({ dependencies: { runtime: '1' }, devDependencies: { development: '1' } }));
  const response = (stdout: Buffer | string) => ({ status: 0, stdout: Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout), stderr: Buffer.alloc(0) });
  if (args[0] === 'ls-tree') return response(`package.json\0src/a.ts\0`);
  if (args[0] === 'ls-files') return response(`CODEBASE_NORMALIZATION_AND_REDUCTION_ANALYSIS.md\0package.json\0src/a.ts\0`);
  if (args[0] === 'show') {
    if (args[1] === `${originSha}:package.json`) return response(packageJson);
    if (args[1] === `${originSha}:src/a.ts`) return response('const origin = true;\n');
  }
  if (args[0] === 'diff' && args.includes('--numstat')) return response('1\t1\tpackage.json\n1\t1\tsrc/a.ts\n');
  if (args[0] === 'diff' && args.includes('--unified=0')) return response('diff --git a/package.json b/package.json\n@@ -1 +1 @@\ndiff --git a/src/a.ts b/src/a.ts\n@@ -1 +1 @@\n');
  if (args[0] === 'merge-base' && args[1] === '--is-ancestor') return response(Buffer.alloc(0));
  if (args[0] === 'rev-parse' && args[1] === 'HEAD') return response(`${originSha}\n`);
  if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return response('main\n');
  if (args[0] === 'status') return response(Buffer.alloc(0));
  return { status: 1, stdout: Buffer.alloc(0), stderr: Buffer.from(`unexpected git invocation: ${args.join(' ')}`) };
}

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

  it('keeps line semantics and command parsing deterministic', () => {
    expect(countPhysicalLines(Buffer.from('one\n\n'))).toBe(2);
    expect(countNonblankLines(Buffer.from('one\n \n'))).toBe(1);
    expect(classifyRepositoryArea('tests/unit/file.ts')).toBe('tests');
    expect(parseCodebaseBaselineArgs(['--output', 'out.json', '--format', 'summary', '--allow-dirty'])).toEqual({
      output: 'out.json', compare: null, format: 'summary', allowDirty: true, captureProvenance: null
    });
    expect(() => runGit(['status'], { spawn: () => ({ status: 1, stdout: Buffer.alloc(0), stderr: Buffer.from('boom') }) as never })).toThrow(/boom/);
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
});
