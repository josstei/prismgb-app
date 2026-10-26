import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED_PATHS = [
  'artifacts',
  '.vitest',
  'playwright-report',
  'test-results',
  'tests/e2e/test-results',
  'tests/e2e/screenshots',
  'tests/e2e/.generated'
];
const BUILD_OUTPUT_PATHS = ['dist', 'release'];

export function cleanGeneratedOutputs({ dryRun = false, build = false, root = PROJECT_ROOT } = {}) {
  const deleted = [];
  const skipped = [];

  for (const target of build ? BUILD_OUTPUT_PATHS : GENERATED_PATHS) {
    const absolutePath = path.join(root, target);
    if (!fs.existsSync(absolutePath)) continue;

    try {
      if (!dryRun) fs.rmSync(absolutePath, { recursive: true, force: true });
      deleted.push(target);
    } catch (error) {
      skipped.push({ target, error });
    }
  }

  return { deleted, skipped };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dryRun = process.argv.includes('--dry-run');
  const build = process.argv.includes('--build');
  const commandName = build ? 'clean:build' : 'clean:generated';
  const result = cleanGeneratedOutputs({ dryRun, build });

  for (const target of result.deleted) {
    console.log(`${dryRun ? 'would remove' : 'removed'}: ${target}`);
  }
  for (const { target, error } of result.skipped) {
    console.error(`failed: ${target} (${error.message})`);
  }
  if (result.deleted.length > 0) {
    console.log(`${commandName} ${dryRun ? 'would remove' : 'removed'} ${result.deleted.length} target(s).`);
  } else if (dryRun) {
    console.log(`${commandName} had no matches`);
  }
  process.exitCode = result.skipped.length > 0 ? 1 : 0;
}
