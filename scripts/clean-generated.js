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
    path: '.vitest',
    owner: 'Vitest cache'
  },
  {
    path: 'playwright-report',
    owner: 'Playwright report'
  },
  {
    path: 'tests/e2e/test-results',
    owner: 'End-to-end test artifacts'
  },
  {
    path: 'tests/e2e/screenshots',
    owner: 'End-to-end screenshots'
  },
  {
    path: 'tests/e2e/.generated',
    owner: 'Generated end-to-end fixtures'
  }
];
export const GENERATED_PATHS = GENERATED_ARTIFACT_PATHS.map(({ path: artifactPath }) => artifactPath);

export const BUILD_OUTPUT_ARTIFACT_PATHS = [
  {
    path: 'dist',
    owner: 'Vite/Electron build output'
  },
  {
    path: 'release',
    owner: 'Electron Builder release output'
  }
];
export const BUILD_OUTPUT_PATHS = BUILD_OUTPUT_ARTIFACT_PATHS.map(({ path: artifactPath }) => artifactPath);

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

function toDeletionSummary(targetPath, removed, failed, ownershipPaths = GENERATED_ARTIFACT_PATHS) {
  return {
    target: targetPath,
    owner: getArtifactOwnership(targetPath, ownershipPaths),
    removed,
    failed
  };
}

function normalizeOptions(options = {}) {
  return {
    dryRun: options.dryRun ?? false,
    paths: options.paths ?? GENERATED_PATHS,
    ownershipPaths: options.ownershipPaths ?? GENERATED_ARTIFACT_PATHS,
    root: options.root ?? PROJECT_ROOT
  };
}

export function cleanGeneratedOutputs(options = {}) {
  const { dryRun, paths, ownershipPaths, root } = normalizeOptions(options);

  const absolutePaths = resolveGeneratedPaths(paths, root);
  const deleted = [];
  const skipped = [];

  for (const generatedPath of absolutePaths) {
    if (!fs.existsSync(generatedPath)) {
      continue;
    }

    const relativePath = normalizeRelativePath(path.relative(root, generatedPath));
    if (dryRun) {
      deleted.push(toDeletionSummary(relativePath, true, false, ownershipPaths));
      continue;
    }

    try {
      fs.rmSync(generatedPath, { recursive: true, force: true });
      deleted.push(toDeletionSummary(relativePath, true, false, ownershipPaths));
    } catch (error) {
      skipped.push(toDeletionSummary(relativePath, false, error, ownershipPaths));
    }
  }

  return { deleted, skipped };
}

export function cleanBuildOutputs(options = {}) {
  return cleanGeneratedOutputs({
    ...options,
    paths: options.paths ?? BUILD_OUTPUT_PATHS,
    ownershipPaths: options.ownershipPaths ?? BUILD_OUTPUT_ARTIFACT_PATHS
  });
}

export function printSummary(result, commandName = 'clean:generated', dryRun = false) {
  const actionLabel = dryRun ? 'would remove' : 'removed';
  for (const entry of result.deleted) {
    if (entry.removed) {
      console.log(`${actionLabel}: ${entry.target}`);
    }
  }

  for (const entry of result.skipped) {
    if (entry.failed) {
      console.error(`failed: ${entry.target} (${entry.failed.message})`);
    }
  }

  if (!dryRun && result.skipped.length === 0 && result.deleted.length > 0) {
    console.log(`${commandName} removed ${result.deleted.length} target(s).`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dryRun = process.argv.includes('--dry-run');
  const cleanBuild = process.argv.includes('--build');
  const commandName = cleanBuild ? 'clean:build' : 'clean:generated';
  const result = cleanBuild ? cleanBuildOutputs({ dryRun }) : cleanGeneratedOutputs({ dryRun });
  if (dryRun) {
    if (result.deleted.length === 0) {
      console.log(`${commandName} had no matches`);
    } else {
      console.log(`${commandName} would remove ${result.deleted.length} target(s):`);
      printSummary(result, commandName, true);
    }
  } else {
    printSummary(result, commandName);
  }
}
