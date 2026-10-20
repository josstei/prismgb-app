import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Governance guard: packages whose module identity is observable must install exactly one copy.
 * A second copy passes typecheck and most tests while code on each side of the split reads
 * different module state, so the split surfaces only as a behavior difference.
 *
 * Adding a singleton is a declaration: add a row with the reason its identity is observable.
 */
const SINGLETON_DEPENDENCIES: Readonly<Record<string, string>> = {
  '@inversifyjs/core':
    'tests/support/di/class-metadata.ts reads constructor metadata that inversify writes through its own core'
};

type Lockfile = {
  packages: Record<string, { version?: string }>;
};

function findInstalledCopies(lockfile: Lockfile, name: string): string[] {
  const installPath = `node_modules/${name}`;
  return Object.keys(lockfile.packages).filter(
    (entry) => entry === installPath || entry.endsWith(`/${installPath}`)
  );
}

function findSingletonViolations(lockfile: Lockfile, names: readonly string[]): string[] {
  return names.flatMap((name) => {
    const copies = findInstalledCopies(lockfile, name);
    if (copies.length === 0) {
      return [`${name} is declared a singleton but is not installed`];
    }
    if (copies.length > 1) {
      const listing = copies.map((entry) => `${entry}@${lockfile.packages[entry].version}`).join(', ');
      return [`${name} is installed ${copies.length} times: ${listing}`];
    }
    return [];
  });
}

function readProjectLockfile(): Lockfile {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package-lock.json'), 'utf8')) as Lockfile;
}

describe('dependency singleton guard', () => {
  it('installs exactly one copy of every declared singleton', () => {
    const violations = findSingletonViolations(readProjectLockfile(), Object.keys(SINGLETON_DEPENDENCIES));
    expect(
      violations,
      `Singleton dependencies must resolve to one installed copy:\n${violations.join('\n')}`
    ).toEqual([]);
  });
});
