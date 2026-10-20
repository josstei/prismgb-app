import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BUILD, clean, GENERATED } from '../../../scripts/clean-generated.js';

function createArtifact(root: string, relativePath: string): void {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(fullPath, { recursive: true });
  fs.writeFileSync(path.join(fullPath, 'artifact.txt'), 'generated');
}

function exists(root: string, relativePath: string): boolean {
  return fs.existsSync(path.join(root, relativePath));
}

describe('clean-generated script', () => {
  let workspace: string;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-clean-generated-'));
    [...GENERATED, ...BUILD].forEach((relativePath) => createArtifact(workspace, relativePath));
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('removes generated outputs and leaves build outputs alone, and vice versa', () => {
    expect(clean(GENERATED, { root: workspace })).toEqual({ removed: GENERATED, failed: [] });
    GENERATED.forEach((relativePath) => expect(exists(workspace, relativePath)).toBe(false));
    BUILD.forEach((relativePath) => expect(exists(workspace, relativePath)).toBe(true));

    expect(clean(BUILD, { root: workspace })).toEqual({ removed: BUILD, failed: [] });
    BUILD.forEach((relativePath) => expect(exists(workspace, relativePath)).toBe(false));
  });

  it('reports matches without deleting anything in dry-run mode', () => {
    expect(clean(GENERATED, { root: workspace, dryRun: true })).toEqual({ removed: GENERATED, failed: [] });
    GENERATED.forEach((relativePath) => expect(exists(workspace, relativePath)).toBe(true));
  });
});
