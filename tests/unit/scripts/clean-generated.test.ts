import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanGeneratedOutputs } from '../../../scripts/clean-generated.js';

describe('generated output cleanup', () => {
  let workspace: string;

  function writeArtifact(relativePath: string): void {
    const fullPath = path.join(workspace, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, 'artifact');
  }

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-clean-generated-'));
    writeArtifact('src/renderer/index.ts');
    writeArtifact('tsconfig.paths.generated.json');
    writeArtifact('dist/main/index.js');
    writeArtifact('release/PrismGB.AppImage');
    writeArtifact('artifacts/coverage/index.html');
    writeArtifact('tests/e2e/.generated/main.cjs');
    writeArtifact('test-results/.last-run.json');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('removes disposable test output while preserving source, committed generated files and builds', () => {
    const result = cleanGeneratedOutputs({ root: workspace });

    expect(result).toEqual({
      deleted: ['artifacts', 'test-results', 'tests/e2e/.generated'],
      skipped: []
    });
    for (const target of result.deleted) {
      expect(fs.existsSync(path.join(workspace, target))).toBe(false);
    }
    for (const target of ['src/renderer/index.ts', 'tsconfig.paths.generated.json', 'dist/main/index.js', 'release/PrismGB.AppImage']) {
      expect(fs.existsSync(path.join(workspace, target))).toBe(true);
    }
  });

  it('cleans builds separately from test output', () => {
    expect(cleanGeneratedOutputs({ root: workspace, build: true })).toEqual({
      deleted: ['dist', 'release'], skipped: []
    });
    expect(fs.existsSync(path.join(workspace, 'dist'))).toBe(false);
    expect(fs.existsSync(path.join(workspace, 'release'))).toBe(false);
    expect(fs.existsSync(path.join(workspace, 'artifacts/coverage/index.html'))).toBe(true);
  });

  it('reports dry-run targets without removing them', () => {
    const result = cleanGeneratedOutputs({ root: workspace, dryRun: true });
    expect(result.deleted).toHaveLength(3);
    for (const target of result.deleted) {
      expect(fs.existsSync(path.join(workspace, target))).toBe(true);
    }
  });

  it('reports deletion failures and continues cleaning independent outputs', () => {
    const remove = fs.rmSync;
    const failure = new Error('permission denied');
    vi.spyOn(fs, 'rmSync').mockImplementation((target, options) => {
      if (target === path.join(workspace, 'artifacts')) throw failure;
      return remove(target, options);
    });

    expect(cleanGeneratedOutputs({ root: workspace })).toEqual({
      deleted: ['test-results', 'tests/e2e/.generated'],
      skipped: [{ target: 'artifacts', error: failure }]
    });
  });
});
