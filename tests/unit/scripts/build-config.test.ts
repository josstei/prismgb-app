import { describe, it, expect, vi } from 'vitest';
import { readdirSync, type Dirent } from 'node:fs';
import { join, relative, sep } from 'node:path';
import picomatch from 'picomatch';
import type { ElectronOptions } from 'vite-plugin-electron';
import vitestConfig from '../../../vitest.config.js';
import commitlintConfig from '../../../commitlint.config.js';
import '../../../vite.config.js';

const electronPlugin = vi.hoisted(() => vi.fn<
  (options: ElectronOptions | ElectronOptions[]) => []
>(() => []));

vi.mock('vite-plugin-electron', () => ({ default: electronPlugin }));

// Capture the actual main-process options without starting Electron or a build.

const electronOptions = electronPlugin.mock.calls[0]?.[0];

function mainExternal(id: string, resolved = false): boolean {
  const main = (Array.isArray(electronOptions) ? electronOptions : [electronOptions])
    .find((entry) => entry?.entry === 'src/main/index.ts');
  const external = main?.vite?.build?.rollupOptions?.external;
  if (typeof external !== 'function') throw new Error('Main build must provide an external matcher');
  return external(id, undefined, resolved) === true;
}

describe('main build dependency externalization', () => {
  it.each(['electron', 'usb', 'eventemitter3', 'electron-updater', 'electron-log', 'electron-trpc'])(
    'keeps %s external before resolution so packaged imports stay portable', (dependency) => {
      expect(mainExternal(dependency)).toBe(true);
      expect(mainExternal(`${dependency}/subpath`)).toBe(true);
      expect(mainExternal(`/build/node_modules/${dependency}/index.js`, true)).toBe(true);
    }
  );

  it.each(['electron-unrelated', 'usb-unrelated', 'eventemitter3-unrelated'])(
    'does not mistake %s for an external package', (dependency) => {
      expect(mainExternal(dependency)).toBe(false);
      expect(mainExternal(`${dependency}/subpath`)).toBe(false);
      expect(mainExternal(`/build/node_modules/${dependency}/index.js`, true)).toBe(false);
    }
  );
});

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

const projectIncludes = (vitestConfig.test?.projects ?? []).map((project) =>
  typeof project === 'object' && project !== null && 'test' in project ? project.test?.include ?? [] : []
);
const projectMatchers = projectIncludes.map((includes) => picomatch(includes));

describe('Vitest test discovery', () => {
  it('declares at least one include glob per project', () => {
    expect(projectIncludes.length).toBeGreaterThan(0);
    expect(projectIncludes.every((includes) => includes.length > 0)).toBe(true);
  });

  it('collects every *.test/spec file on disk in exactly one vitest project', () => {
    const invalid = collectTestFilesOnDisk().flatMap((file) => {
      const count = projectMatchers.filter((isCollected) => isCollected(file)).length;
      return count === 1 ? [] : [`${file}: matched ${count} projects`];
    });
    expect(
      invalid,
      `Test files must match exactly one vitest project (no dropped or duplicate suites):\n${invalid.join('\n')}`
    ).toEqual([]);
  });
});

type CommitlintRuleTuple = readonly [number, string, readonly string[]];

describe('commitlint configuration', () => {
  it('keeps conventional commits subject to normal linting', () => {
    const typeEnumRule = commitlintConfig.rules['type-enum'] as unknown as CommitlintRuleTuple;
    expect(typeEnumRule[2]).toContain('refactor');
  });
});
