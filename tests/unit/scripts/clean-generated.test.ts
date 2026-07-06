import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BUILD_OUTPUT_ARTIFACT_PATHS,
  BUILD_OUTPUT_PATHS,
  cleanBuildOutputs,
  cleanGeneratedOutputs,
  GENERATED_ARTIFACT_PATHS,
  GENERATED_PATHS,
  getArtifactOwnership
} from '../../../scripts/clean-generated.js';

function createWorkspace(): string {
  const prefix = path.join(os.tmpdir(), 'prismgb-clean-generated-');
  return fs.mkdtempSync(prefix);
}

function createFile(root: string, relativePath: string): void {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(fullPath, { recursive: true });
  fs.writeFileSync(path.join(fullPath, 'artifact.txt'), 'generated');
}

function cleanup(root: string): void {
  if (fs.existsSync(root)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe('clean-generated script', () => {
  let workspace: ReturnType<typeof createWorkspace>;

  beforeEach(() => {
    workspace = createWorkspace();
  });

  afterEach(() => {
    cleanup(workspace);
  });

  it('removes configured generated artifact directories and marks ownership', () => {
    expect(GENERATED_PATHS).not.toContain('tests/coverage');
    expect(GENERATED_PATHS).not.toEqual(expect.arrayContaining(BUILD_OUTPUT_PATHS));

    GENERATED_ARTIFACT_PATHS.forEach((entry) => {
      createFile(workspace, entry.path);
    });
    BUILD_OUTPUT_PATHS.forEach((relativePath) => {
      createFile(workspace, relativePath);
    });

    const result = cleanGeneratedOutputs({ root: workspace });

    for (const entry of GENERATED_ARTIFACT_PATHS) {
      expect(fs.existsSync(path.join(workspace, entry.path))).toBe(false);
      const summary = result.deleted.find((item) => item.target === entry.path);
      expect(summary).toMatchObject({
        target: entry.path,
        owner: entry.owner,
        removed: true,
        failed: false
      });
    }

    for (const relativePath of BUILD_OUTPUT_PATHS) {
      expect(fs.existsSync(path.join(workspace, relativePath))).toBe(true);
    }
  });

  it('removes configured build output directories through the build cleanup path', () => {
    BUILD_OUTPUT_ARTIFACT_PATHS.forEach((entry) => {
      createFile(workspace, entry.path);
    });
    GENERATED_PATHS.forEach((relativePath) => {
      createFile(workspace, relativePath);
    });

    const result = cleanBuildOutputs({ root: workspace });

    for (const entry of BUILD_OUTPUT_ARTIFACT_PATHS) {
      expect(fs.existsSync(path.join(workspace, entry.path))).toBe(false);
      expect(result.deleted).toContainEqual(
        expect.objectContaining({
          target: entry.path,
          owner: entry.owner,
          removed: true,
          failed: false
        })
      );
    }

    for (const relativePath of GENERATED_PATHS) {
      expect(fs.existsSync(path.join(workspace, relativePath))).toBe(true);
    }
  });

  it('does not delete generated artifacts in dry-run mode', () => {
    GENERATED_PATHS.forEach((entry) => {
      createFile(workspace, entry);
    });

    const result = cleanGeneratedOutputs({ root: workspace, dryRun: true });

    expect(result.deleted).toHaveLength(GENERATED_PATHS.length);
    for (const relativePath of GENERATED_PATHS) {
      expect(fs.existsSync(path.join(workspace, relativePath))).toBe(true);
      expect(getArtifactOwnership(relativePath)).toBeTruthy();
    }
  });

  it('supports custom cleanup paths scoped to an alternate root', () => {
    createFile(workspace, '.custom-artifacts');
    createFile(workspace, 'artifacts');

    const customPaths = ['artifacts', '.custom-artifacts'];
    const result = cleanGeneratedOutputs({
      root: workspace,
      paths: customPaths
    });

    expect(fs.existsSync(path.join(workspace, 'artifacts'))).toBe(false);
    expect(fs.existsSync(path.join(workspace, '.custom-artifacts'))).toBe(false);
    expect(result.deleted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: 'artifacts', owner: 'Generated repository artifacts' }),
        expect.objectContaining({ target: '.custom-artifacts', owner: 'custom-path' })
      ])
    );
  });
});
