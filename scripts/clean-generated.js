import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function normalizeRelativePath(relativePath) {
  return relativePath.split(path.sep).join('/');
}

export const GENERATED_ARTIFACT_PATHS = [
  {
    path: 'artifacts',
    owner: 'Generated repository artifacts'
  },
  {
    path: 'artifacts/coverage',
    owner: 'Vitest coverage report'
  },
  {
    path: '.vitest',
    owner: 'Vitest cache'
  },
  {
    path: 'playwright-report',
    owner: 'Playwright report'
  },
  {
    path: 'test-results',
    owner: 'Playwright test artifacts'
  },
  {
    path: 'tests/e2e/test-results',
    owner: 'End-to-end test artifacts'
  },
  {
    path: 'tests/e2e/screenshots',
    owner: 'End-to-end screenshots'
  }
];
export const GENERATED_PATHS = GENERATED_ARTIFACT_PATHS.map(({ path: artifactPath }) => artifactPath);

export function getArtifactOwnership(pathName, paths = GENERATED_ARTIFACT_PATHS) {
  const normalizedPath = normalizeRelativePath(pathName);
  const match = paths.find((entry) => entry.path === normalizedPath);
  return match ? match.owner : 'custom-path';
}

export function resolveGeneratedPaths(paths = GENERATED_PATHS, root = PROJECT_ROOT) {
  const sorted = [...paths].sort((a, b) => {
    const aDepth = a.split(/[\\/]/).length;
    const bDepth = b.split(/[\\/]/).length;
    if (aDepth === bDepth) {
      return a.localeCompare(b);
    }
    return bDepth - aDepth;
  });

  return sorted.map((relativePath) => path.join(root, relativePath));
};

function toDeletionSummary(targetPath, removed, failed) {
  return {
    target: targetPath,
    owner: getArtifactOwnership(targetPath),
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

    const relativePath = normalizeRelativePath(path.relative(root, generatedPath));
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
