import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { walkPaths } from '../../../scripts/lib/fs-walk.js';

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) fs.rmSync(tempRoots.pop(), { recursive: true, force: true });
});

function createTree(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-fs-walk-'));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, 'nested/deep'), { recursive: true });
  fs.writeFileSync(path.join(root, 'top.txt'), '');
  fs.writeFileSync(path.join(root, 'nested/deep/leaf.txt'), '');
  return root;
}

describe('walkPaths', () => {
  it('returns every directory and file below the root', () => {
    const root = createTree();
    const relativePaths = walkPaths(root).map((entry) => path.relative(root, entry)).sort();
    expect(relativePaths).toEqual(
      ['nested', path.join('nested', 'deep'), path.join('nested', 'deep', 'leaf.txt'), 'top.txt'].sort()
    );
  });

  it('returns an empty list for a missing root', () => {
    expect(walkPaths(path.join(os.tmpdir(), 'prismgb-fs-walk-missing'))).toEqual([]);
  });
});
