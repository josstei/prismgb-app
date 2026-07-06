import { describe, it, expect } from 'vitest';
import { readdirSync, type Dirent } from 'node:fs';
import { join, relative, sep } from 'node:path';
import picomatch from 'picomatch';
import vitestConfig from '../../../vitest.config.js';

/**
 * Governance guard: a vitest `projects` include list that fails to enumerate a
 * test directory silently drops those tests while every other gate stays
 * green. This test fails when any *.test/spec file on disk is not collected by
 * some project, so a dropped suite can never hide.
 */

const ROOT = process.cwd();
const TEST_FILE = /\.(test|spec)\.[jt]s$/;
const SKIP_DIRS: ReadonlySet<string> = new Set(['node_modules', 'e2e']);

function walk(dir: string, acc: string[]): string[] {
  let entries: Dirent[];
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

function collectTestFilesOnDisk(): string[] {
  return walk(join(ROOT, 'tests'), []);
}

const includeGlobs = vitestConfig.test.projects.flatMap((project) =>
  typeof project === 'object' && project !== null && 'test' in project ? project.test.include : []
);
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
