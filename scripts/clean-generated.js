import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const GENERATED = ['artifacts', 'playwright-report', 'tests/e2e/test-results', 'tests/e2e/.generated'];
export const BUILD = ['dist', 'release'];

export function clean(paths, { root = PROJECT_ROOT, dryRun = false } = {}) {
  const removed = [];
  const failed = [];
  for (const relativePath of paths) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }
    try {
      if (!dryRun) {
        fs.rmSync(absolutePath, { recursive: true, force: true });
      }
      removed.push(relativePath);
    } catch (error) {
      failed.push({ path: relativePath, error });
    }
  }
  return { removed, failed };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dryRun = process.argv.includes('--dry-run');
  const { removed, failed } = clean(process.argv.includes('--build') ? BUILD : GENERATED, { dryRun });
  for (const target of removed) {
    console.log(`${dryRun ? 'would remove' : 'removed'}: ${target}`);
  }
  for (const { path: target, error } of failed) {
    console.error(`failed: ${target} (${error.message})`);
  }
}
