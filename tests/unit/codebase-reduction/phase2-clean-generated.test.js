import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanGeneratedOutputs, GENERATED_PATHS } from '../../../scripts/clean-generated.js';

function createTempWorkspace() {
  const prefix = path.join(os.tmpdir(), 'prismgb-phase2-clean-');
  const root = fs.mkdtempSync(prefix);
  return root;
}

function ensureGeneratedFixture(root, relativePath) {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(fullPath, { recursive: true });
  fs.writeFileSync(path.join(fullPath, 'marker.txt'), `generated:${relativePath}`);
}

function ensureKeeptarget(root, relativePath) {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(fullPath, { recursive: true });
  fs.writeFileSync(path.join(fullPath, 'keep.txt'), 'keep');
}

function cleanRoot(root) {
  if (!fs.existsSync(root)) {
    return;
  }

  fs.rmSync(root, { recursive: true, force: true });
}

describe('clean:generated script policy', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = createTempWorkspace();
    GENERATED_PATHS.forEach((entry) => ensureGeneratedFixture(tempRoot, entry));
    ensureKeeptarget(tempRoot, 'dist');
  });

  afterEach(() => {
    cleanRoot(tempRoot);
  });

  it('removes configured generated output directories and leaves tracked package dist', () => {
    const result = cleanGeneratedOutputs({ root: tempRoot });

    for (const relativePath of GENERATED_PATHS) {
      expect(fs.existsSync(path.join(tempRoot, relativePath))).toBe(false);
    }

    expect(fs.existsSync(path.join(tempRoot, 'dist'))).toBe(true);
    expect(result.deleted.length).toBe(GENERATED_PATHS.length);
  });

  it('reports cleanup targets in dry-run mode without deleting', () => {
    const result = cleanGeneratedOutputs({ root: tempRoot, dryRun: true });

    expect(fs.existsSync(path.join(tempRoot, GENERATED_PATHS[0]))).toBe(true);
    expect(result.deleted.length).toBe(GENERATED_PATHS.length);
    expect(result.skipped.length).toBe(0);
  });
});
