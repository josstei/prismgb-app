#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';

const SOURCE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.css',
  '.html',
  '.json',
  '.md',
  '.glsl',
  '.wgsl'
]);

const DEFAULT_EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.next',
  'dist',
  'node_modules',
  'release',
  'build',
  'out'
]);

const AREA_PREFIXES = [
  ['src/main', 'main'],
  ['src/renderer', 'renderer'],
  ['src/preload', 'preload'],
  ['src/shared', 'shared'],
  ['packages/prismgb-gpu', 'gpu-package'],
  ['scripts', 'scripts'],
  ['tests', 'tests'],
  ['docs', 'docs']
];

const SHADER_DUPLICATE_PAIRS = [
  {
    name: 'webgpu',
    sourceA: 'packages/prismgb-gpu/src/infrastructure/webgpu/shaders',
    sourceB: 'src/renderer/infrastructure/rendering/shaders/webgpu'
  },
  {
    name: 'webgl2',
    sourceA: 'packages/prismgb-gpu/src/infrastructure/webgl2/shaders',
    sourceB: 'src/renderer/infrastructure/rendering/shaders/webgl2'
  }
];

const SHADER_EXTENSIONS = new Set(['.glsl', '.wgsl']);

const DEFAULT_ARTIFACT_PATHS = [
  'artifacts',
  'tests/coverage',
  '.vitest',
  'tests/e2e/test-results',
  'tests/e2e/screenshots',
  'playwright-report',
  'test-results',
  'dist',
  'release',
  'build',
  'out'
];

const PACKAGE_ARTIFACT_DIRECTORIES = [
  'dist',
  'build',
  'coverage',
  '.turbo',
  'node_modules'
];

function toPosix(value) {
  return value.split(path.sep).join('/');
}

export function parseArgs(argv) {
  const options = {
    root: process.cwd(),
    json: false,
    artifactPaths: DEFAULT_ARTIFACT_PATHS
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg === '--root') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --root');
      }
      options.root = path.resolve(process.cwd(), value);
      index += 1;
    }
  }

  return options;
}

function collectStringLeaves(value, collector = []) {
  if (typeof value === 'string') {
    collector.push(value);
    return collector;
  }

  if (!value || typeof value !== 'object') {
    return collector;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStringLeaves(item, collector);
    }
    return collector;
  }

  for (const child of Object.values(value)) {
    collectStringLeaves(child, collector);
  }

  return collector;
}

function normalizeTrackedFile(projectRoot, filePath) {
  return toPosix(path.relative(projectRoot, filePath));
}

function getAreaForFile(relativePath) {
  for (const [prefix, area] of AREA_PREFIXES) {
    if (relativePath === prefix || relativePath.startsWith(`${prefix}/`)) {
      return area;
    }
  }

  return 'other';
}

function readFileLinesSafe(filePath) {
  if (!fs.existsSync(filePath)) {
    return '';
  }

  return fs.readFileSync(filePath, 'utf8');
}

export function countFileLines(filePath) {
  const source = readFileLinesSafe(filePath);
  if (!source) {
    return 0;
  }

  const normalized = source.replace(/\r/g, '').replace(/\n+$/, '');
  if (!normalized) {
    return 0;
  }

  return normalized.split('\n').length;
}

function getTrackedFilesFromGit(projectRoot) {
  const result = spawnSync('git', ['-C', projectRoot, 'ls-files', '-z'], {
    encoding: 'utf8'
  });

  if (result.status !== 0 || !result.stdout) {
    throw new Error('Git ls-files is unavailable in this environment.');
  }

  return result.stdout
    .split('\0')
    .filter(Boolean)
    .map((relativePath) => path.resolve(projectRoot, relativePath));
}

function walkFiles(rootDir, baseDir = rootDir, files = []) {
  const entries = fs.existsSync(rootDir)
    ? fs.readdirSync(rootDir, { withFileTypes: true })
    : [];

  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);
    const relativePath = toPosix(path.relative(baseDir, absolutePath));

    if (entry.isDirectory()) {
      if (DEFAULT_EXCLUDED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      walkFiles(absolutePath, baseDir, files);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (relativePath.startsWith('..')) {
      continue;
    }

    files.push(absolutePath);
  }

  return files;
}

function getTrackedFiles(projectRoot) {
  try {
    return getTrackedFilesFromGit(projectRoot);
  } catch {
    return walkFiles(projectRoot);
  }
}

export function summarizeTrackedFileCounts(trackedFiles, projectRoot) {
  const byArea = {};
  const byExtension = {};

  for (const filePath of trackedFiles) {
    const relativePath = normalizeTrackedFile(projectRoot, filePath);
    const area = getAreaForFile(relativePath);
    const extension = path.extname(relativePath).toLowerCase();

    byArea[area] = (byArea[area] || 0) + 1;
    byExtension[extension] = (byExtension[extension] || 0) + 1;
  }

  return {
    total: trackedFiles.length,
    byArea,
    byExtension
  };
}

export function summarizeSourceLocByArea(trackedFiles, projectRoot) {
  const byArea = {};
  let totalLines = 0;

  for (const filePath of trackedFiles) {
    const relativePath = normalizeTrackedFile(projectRoot, filePath);
    const area = getAreaForFile(relativePath);
    const extension = path.extname(relativePath).toLowerCase();
    if (!SOURCE_EXTENSIONS.has(extension)) {
      continue;
    }

    const loc = countFileLines(filePath);
    const bucket = byArea[area] || { files: 0, loc: 0 };
    bucket.files += 1;
    bucket.loc += loc;
    byArea[area] = bucket;
    totalLines += loc;
  }

  return {
    totalLines,
    byArea
  };
}

export function countIpcContractEntries(projectRoot) {
  const channelsPath = path.join(projectRoot, 'src/shared/ipc/channels.json');
  if (!fs.existsSync(channelsPath)) {
    return {
      namespaces: 0,
      channels: 0
    };
  }

  const channelsRaw = fs.readFileSync(channelsPath, 'utf8');
  const channels = JSON.parse(channelsRaw);
  const values = collectStringLeaves(channels);

  return {
    namespaces: Object.keys(channels).length,
    channels: values.length
  };
}

function extractEventChannelLines(content) {
  const values = [];
  const linePattern = /:\s*['"]([^'"]+)['"]/g;

  for (const match of content.matchAll(linePattern)) {
    const value = match[1];
    if (value.includes(':')) {
      values.push(value);
    }
  }

  return values;
}

export function countEventContractEntries(projectRoot) {
  const channelsPath = path.join(projectRoot, 'src/shared/events/event-channels.ts');
  const payloadsPath = path.join(projectRoot, 'src/shared/events/event-payloads.ts');

  let channelCount = 0;
  if (fs.existsSync(channelsPath)) {
    const channelsSource = fs.readFileSync(channelsPath, 'utf8');
    const channelValues = extractEventChannelLines(channelsSource);
    channelCount = new Set(channelValues).size;
  }

  let payloadEntries = 0;
  if (fs.existsSync(payloadsPath)) {
    const payloadSource = fs.readFileSync(payloadsPath, 'utf8');
    payloadEntries = [...payloadSource.matchAll(/^\s*\[EventChannels\.[^\]]+\]\s*:/gm)].length;
  }

  return {
    channels: channelCount,
    payloadEntries
  };
}

export function countMockFiles(trackedFiles, projectRoot) {
  const byLocation = {
    testsMocks: 0,
    e2eMocks: 0,
    namedMockFiles: 0,
    otherMockPaths: 0
  };

  for (const filePath of trackedFiles) {
    const relativePath = normalizeTrackedFile(projectRoot, filePath);
    const fileName = path.basename(relativePath).toLowerCase();
    const hasNamedMock = /(\.mock\.[cm]?[jt]sx?$|mock)/i.test(fileName);
    const inTestsMocks = relativePath.startsWith('tests/mocks/');
    const inE2eMocks = relativePath.startsWith('tests/e2e/mocks/');
    const inMocksDir = /(^|\/)mocks(\/|$)/.test(relativePath);

    if (!hasNamedMock && !inMocksDir) {
      continue;
    }

    if (inTestsMocks) {
      byLocation.testsMocks += 1;
    } else if (inE2eMocks) {
      byLocation.e2eMocks += 1;
    } else if (hasNamedMock) {
      byLocation.namedMockFiles += 1;
    } else {
      byLocation.otherMockPaths += 1;
    }
  }

  return {
    total: Object.values(byLocation).reduce((sum, count) => sum + count, 0),
    byLocation
  };
}

function fileHash(filePath) {
  const source = readFileLinesSafe(filePath);
  return crypto.createHash('sha256').update(source).digest('hex');
}

function collectFilesByExtension(rootPath, extensionSet, map = new Map()) {
  if (!fs.existsSync(rootPath)) {
    return map;
  }

  const walk = (current) => {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const childPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(childPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!extensionSet.has(path.extname(entry.name).toLowerCase())) {
        continue;
      }

      const relative = toPosix(path.relative(rootPath, childPath));
      map.set(relative, {
        absolute: childPath,
        hash: fileHash(childPath)
      });
    }
  };

  walk(rootPath);
  return map;
}

export function getShaderDuplicateStatus(projectRoot) {
  const results = [];

  for (const pair of SHADER_DUPLICATE_PAIRS) {
    const leftRoot = path.resolve(projectRoot, pair.sourceA);
    const rightRoot = path.resolve(projectRoot, pair.sourceB);

    const leftFiles = collectFilesByExtension(leftRoot, SHADER_EXTENSIONS);
    const rightFiles = collectFilesByExtension(rightRoot, SHADER_EXTENSIONS);

    let matching = 0;
    let mismatches = 0;
    let missingInSourceB = 0;

    for (const [name, leftMeta] of leftFiles) {
      const rightMeta = rightFiles.get(name);
      if (!rightMeta) {
        missingInSourceB += 1;
        continue;
      }

      if (leftMeta.hash === rightMeta.hash) {
        matching += 1;
      } else {
        mismatches += 1;
      }
    }

    let missingInSourceA = 0;
    for (const name of rightFiles.keys()) {
      if (!leftFiles.has(name)) {
        missingInSourceA += 1;
      }
    }

    results.push({
      name: pair.name,
      sourceA: pair.sourceA,
      sourceB: pair.sourceB,
      leftFileCount: leftFiles.size,
      rightFileCount: rightFiles.size,
      matching,
      mismatches,
      missingInSourceA,
      missingInSourceB,
      status: mismatches || missingInSourceA || missingInSourceB ? 'diverged' : 'synchronized'
    });
  }

  return {
    pairs: results,
    allSynchronized: results.every((entry) => entry.status === 'synchronized')
  };
}

function getDirectoryStats(dirPath) {
  let count = 0;
  let bytes = 0;

  if (!fs.existsSync(dirPath)) {
    return { exists: false, count: 0, bytes: 0 };
  }

  const walk = (current) => {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(child);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const stat = fs.statSync(child);
      count += 1;
      bytes += stat.size;
    }
  };

  walk(dirPath);
  return { exists: true, count, bytes };
}

function categorizeArtifactPath(artifactPath) {
  if (artifactPath === 'node_modules' || artifactPath.endsWith('/node_modules')) {
    return 'vendored-dependency';
  }

  if (artifactPath.startsWith('packages/')) {
    return 'package-output';
  }

  if (artifactPath === 'release') {
    return 'release-output';
  }

  if (['dist', 'build', 'out'].includes(artifactPath)) {
    return 'build-output';
  }

  if (
    artifactPath.includes('coverage') ||
    artifactPath.includes('playwright') ||
    artifactPath.includes('test-results') ||
    artifactPath.includes('screenshots') ||
    artifactPath === '.vitest'
  ) {
    return 'test-artifact';
  }

  return 'local-artifact';
}

function normalizeArtifactLocation(location) {
  if (typeof location === 'string') {
    return {
      path: location,
      category: categorizeArtifactPath(location)
    };
  }

  return {
    path: location.path,
    category: location.category || categorizeArtifactPath(location.path)
  };
}

function discoverPackageArtifactLocations(projectRoot) {
  const packagesRoot = path.resolve(projectRoot, 'packages');
  if (!fs.existsSync(packagesRoot)) {
    return [];
  }

  return fs.readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const packageRoot = path.join(packagesRoot, entry.name);
      return PACKAGE_ARTIFACT_DIRECTORIES
        .map((artifactDirName) => path.join(packageRoot, artifactDirName))
        .filter((artifactPath) => fs.existsSync(artifactPath))
        .map((artifactPath) => {
          const relativePath = toPosix(path.relative(projectRoot, artifactPath));
          return {
            path: relativePath,
            category: categorizeArtifactPath(relativePath)
          };
        });
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function collectArtifactLocations(projectRoot, artifactPaths) {
  const locationsByPath = new Map();

  for (const location of artifactPaths.map(normalizeArtifactLocation)) {
    locationsByPath.set(location.path, location);
  }

  for (const location of discoverPackageArtifactLocations(projectRoot)) {
    if (!locationsByPath.has(location.path)) {
      locationsByPath.set(location.path, location);
    }
  }

  return Array.from(locationsByPath.values());
}

export function countGeneratedArtifacts(projectRoot, artifactPaths = DEFAULT_ARTIFACT_PATHS) {
  const locations = collectArtifactLocations(projectRoot, artifactPaths).map(({ path: artifactPath, category }) => {
    const absolutePath = path.resolve(projectRoot, artifactPath);
    const exists = fs.existsSync(absolutePath);
    const stats = exists ? getDirectoryStats(absolutePath) : { exists: false, count: 0, bytes: 0 };

    return {
      path: artifactPath,
      category,
      absolutePath,
      exists,
      fileCount: stats.count,
      bytes: stats.bytes
    };
  });

  const existing = locations.filter((entry) => entry.exists);
  const byCategory = {};

  for (const location of locations) {
    const bucket = byCategory[location.category] || {
      locations: 0,
      existingLocations: 0,
      fileCount: 0,
      bytes: 0
    };
    bucket.locations += 1;
    if (location.exists) {
      bucket.existingLocations += 1;
      bucket.fileCount += location.fileCount;
      bucket.bytes += location.bytes;
    }
    byCategory[location.category] = bucket;
  }

  return {
    locations,
    byCategory,
    existingCount: existing.length,
    totalFilesInIgnoredLocations: existing.reduce((sum, entry) => sum + entry.fileCount, 0),
    totalBytesInIgnoredLocations: existing.reduce((sum, entry) => sum + entry.bytes, 0)
  };
}

export function buildCodebaseSizeReport(projectRoot = process.cwd(), options = {}) {
  const trackedFiles = options.trackedFiles || getTrackedFiles(projectRoot);
  const trackedFileCounts = summarizeTrackedFileCounts(trackedFiles, projectRoot);
  const sourceLocByArea = summarizeSourceLocByArea(trackedFiles, projectRoot);
  const ipcContract = countIpcContractEntries(projectRoot);
  const eventContract = countEventContractEntries(projectRoot);
  const mockCounts = countMockFiles(trackedFiles, projectRoot);
  const duplicateShaders = getShaderDuplicateStatus(projectRoot);
  const generatedArtifacts = countGeneratedArtifacts(
    projectRoot,
    options.generatedArtifactPaths || DEFAULT_ARTIFACT_PATHS
  );

  return {
    generatedAt: new Date().toISOString(),
    projectRoot,
    trackedFileCounts,
    sourceLocByArea,
    ipcContract,
    eventContract,
    testMockCounts: mockCounts,
    duplicateShaders,
    generatedArtifacts
  };
}

function printAreaCounts(prefix, entries) {
  for (const [area, count] of Object.entries(entries).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${prefix} ${area}: ${count}`);
  }
}

function printTextReport(report) {
  console.log('Codebase Size Report');
  console.log(`generatedAt=${report.generatedAt}`);
  console.log(`projectRoot=${toPosix(path.relative(process.cwd(), report.projectRoot) || '.')}`);

  console.log(`Tracked files total=${report.trackedFileCounts.total}`);
  console.log('Tracked files by area:');
  printAreaCounts('  -', report.trackedFileCounts.byArea);

  console.log(`Source LOC total=${report.sourceLocByArea.totalLines}`);
  console.log('Source LOC by area:');
  for (const [area, entry] of Object.entries(report.sourceLocByArea.byArea)) {
    console.log(`  - ${area}: files=${entry.files}, loc=${entry.loc}`);
  }

  console.log(`IPC contract: namespaces=${report.ipcContract.namespaces}, channels=${report.ipcContract.channels}`);
  console.log(`Event contract: channels=${report.eventContract.channels}, payloadEntries=${report.eventContract.payloadEntries}`);
  console.log(`Test mocks: total=${report.testMockCounts.total}`);
  for (const [bucket, count] of Object.entries(report.testMockCounts.byLocation)) {
    console.log(`  - ${bucket}: ${count}`);
  }

  console.log('Duplicate shader status:');
  for (const pair of report.duplicateShaders.pairs) {
    console.log(`  - ${pair.name}: ${pair.status}`);
    console.log(`    left=${pair.sourceA} (${pair.leftFileCount} files), right=${pair.sourceB} (${pair.rightFileCount} files)`);
  }

  console.log(`Generated artifact locations found=${report.generatedArtifacts.existingCount}`);
  for (const location of report.generatedArtifacts.locations) {
    if (!location.exists) {
      continue;
    }
    console.log(`  - ${location.path}: category=${location.category}, files=${location.fileCount}`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildCodebaseSizeReport(options.root);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printTextReport(report);
}

const invokedScript = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : '';
if (import.meta.url === invokedScript) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
