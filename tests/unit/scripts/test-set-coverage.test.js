import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import picomatch from 'picomatch';
import vitestConfig from '../../../vitest.config.js';

/**
 * Governance guard (ADR-0001 family): the coverage ratchet enforces coverage %
 * over src/** scopes but does NOT guard the executed-test set. A vitest `projects`
 * include list that fails to enumerate a test directory silently drops those tests
 * while every coverage gate stays green. This test fails when any *.test/spec file
 * on disk is not collected by some project, so a dropped suite can never hide again.
 */

const ROOT = process.cwd();
const TEST_FILE = /\.(test|spec)\.[jt]s$/;
const SKIP_DIRS = new Set(['node_modules', 'e2e']);

function walk(dir, acc) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), acc);
    } else if (TEST_FILE.test(entry.name)) {
      acc.push(relative(ROOT, join(dir, entry.name)).split(sep).join('/'));
    }
  }
  return acc;
}

function collectTestFilesOnDisk() {
  return walk(join(ROOT, 'tests'), []);
}

const includeGlobs = vitestConfig.test.projects.flatMap((project) => project.test.include);
const isCollected = picomatch(includeGlobs);

describe('vitest executed-test-set coverage guard (B4)', () => {
  it('declares at least one include glob per project', () => {
    expect(includeGlobs.length).toBeGreaterThan(0);
  });

  it('collects every *.test/spec file on disk under some vitest project', () => {
    const orphaned = collectTestFilesOnDisk().filter((file) => !isCollected(file));
    expect(
      orphaned,
      `Test files on disk not matched by any vitest project include (they will silently not run):\n${orphaned.join('\n')}`
    ).toEqual([]);
  });
});
