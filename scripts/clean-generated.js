import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const GENERATED_PATHS = [
  'artifacts',
  'tests/coverage',
  '.vitest',
  'playwright-report',
  'test-results',
  'tests/e2e/test-results'
];

export function resolveGeneratedPaths(paths = GENERATED_PATHS, root = PROJECT_ROOT) {
  return paths.map((relativePath) => path.join(root, relativePath));
};

function toDeletionSummary(targetPath, removed, failed) {
  return {
    target: targetPath,
    removed,
    failed
  };
}

function normalizeOptions(options = {}) {
  return {
    dryRun: options.dryRun ?? false,
    paths: options.paths ?? GENERATED_PATHS,
    root: options.root ?? PROJECT_ROOT
  };
}

export function cleanGeneratedOutputs(options = {}) {
  const { dryRun, paths, root } = normalizeOptions(options);

  const absolutePaths = resolveGeneratedPaths(paths, root);
  const deleted = [];
  const skipped = [];

  for (const generatedPath of absolutePaths) {
    if (!fs.existsSync(generatedPath)) {
      continue;
    }

    const relativePath = path.relative(PROJECT_ROOT, generatedPath);
    if (dryRun) {
      deleted.push(toDeletionSummary(relativePath, true, false));
      continue;
    }

    try {
      fs.rmSync(generatedPath, { recursive: true, force: true });
      deleted.push(toDeletionSummary(relativePath, true, false));
    } catch (error) {
      skipped.push(toDeletionSummary(relativePath, false, error));
    }
  }

  return { deleted, skipped };
}

export function printSummary(result) {
  for (const entry of result.deleted) {
    if (entry.removed) {
      console.log(`removed: ${entry.target}`);
    }
  }

  for (const entry of result.skipped) {
    if (entry.failed) {
      console.error(`failed: ${entry.target} (${entry.failed.message})`);
    }
  }

  if (result.skipped.length === 0 && result.deleted.length > 0) {
    console.log(`clean:generated removed ${result.deleted.length} target(s).`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dryRun = process.argv.includes('--dry-run');
  const result = cleanGeneratedOutputs({ dryRun });
  if (dryRun) {
    if (result.deleted.length === 0) {
      console.log('clean:generated had no matches');
    } else {
      console.log(`clean:generated would remove ${result.deleted.length} target(s):`);
      printSummary(result);
    }
  } else {
    printSummary(result);
  }
}
