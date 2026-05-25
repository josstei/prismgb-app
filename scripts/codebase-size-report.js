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
  ['packages/prismgb-gpu/tests', 'tests'],
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
const DEFAULT_THRESHOLD_PATH = 'scripts/codebase-size-thresholds.json';
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
    artifactPaths: DEFAULT_ARTIFACT_PATHS,
    enforceThresholds: false,
    thresholdPath: DEFAULT_THRESHOLD_PATH
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
      continue;
    }
    if (arg === '--enforce-thresholds') {
      options.enforceThresholds = true;
      continue;
    }
    if (arg === '--thresholds') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --thresholds');
      }
      options.thresholdPath = value;
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
function listGitFiles(projectRoot, args) {
  const result = spawnSync('git', ['-C', projectRoot, 'ls-files', '-z', ...args], {
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error('Git ls-files is unavailable in this environment.');
  }
  const files = result.stdout
    .split('\0')
    .filter(Boolean)
    .map((relativePath) => path.resolve(projectRoot, relativePath))
    .filter((filePath) => fs.existsSync(filePath));
  return Array.from(new Set(files));
}
function getTrackedFilesFromGit(projectRoot) {
  return listGitFiles(projectRoot, ['--cached', '--others', '--exclude-standard']);
}
function getUntrackedFilesFromGit(projectRoot) {
  return listGitFiles(projectRoot, ['--others', '--exclude-standard']);
}
function isRelativePathInScope(relativePath, scope) {
  const normalizedScope = toPosix(scope).replace(/\/$/, '');
  return normalizedScope === '.'
    || relativePath === normalizedScope
    || relativePath.startsWith(`${normalizedScope}/`);
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
export function collectGitSourceDelta(projectRoot, { baseRef, scopes }) {
  if (!baseRef || typeof baseRef !== 'string') {
    return null;
  }
  const sourceScopes = Array.isArray(scopes) && scopes.length > 0 ? scopes : ['.'];
  const result = spawnSync('git', ['-C', projectRoot, 'diff', '--numstat', baseRef, '--', ...sourceScopes], {
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    return {
      baseRef,
      scopes: sourceScopes,
      status: 'unavailable',
      error: result.stderr || result.stdout || 'git diff failed',
      added: 0,
      deleted: 0,
      net: 0,
      filesChanged: 0
    };
  }
  let added = 0;
  let deleted = 0;
  let filesChanged = 0;
  for (const line of result.stdout.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    const [rawAdded, rawDeleted] = line.split('\t');
    const addedLines = Number(rawAdded);
    const deletedLines = Number(rawDeleted);
    if (!Number.isFinite(addedLines) || !Number.isFinite(deletedLines)) {
      continue;
    }
    added += addedLines;
    deleted += deletedLines;
    filesChanged += 1;
  }
  try {
    for (const filePath of getUntrackedFilesFromGit(projectRoot)) {
      const relativePath = normalizeTrackedFile(projectRoot, filePath);
      if (
        !sourceScopes.some((scope) => isRelativePathInScope(relativePath, scope))
        || !SOURCE_EXTENSIONS.has(path.extname(relativePath).toLowerCase())
      ) {
        continue;
      }
      added += countFileLines(filePath);
      filesChanged += 1;
    }
  } catch {
    // Untracked files are a worktree-only refinement; keep the base git diff usable.
  }
  return {
    baseRef,
    scopes: sourceScopes,
    status: 'available',
    added,
    deleted,
    net: added - deleted,
    filesChanged
  };
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
function countRendererEventManifestChannels(projectRoot) {
  const manifestPath = path.join(projectRoot, 'src/shared/events/event.manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const rendererScope = (manifest.scopes || []).find((scope) => scope.scope === 'renderer');
  if (!rendererScope) {
    return 0;
  }
  return new Set((rendererScope.events || []).map((entry) => entry.value).filter(Boolean)).size;
}
export function countEventContractEntries(projectRoot) {
  const channelsPath = path.join(projectRoot, 'src/shared/events/event-channels.ts');
  const payloadsPath = path.join(projectRoot, 'src/shared/events/event-payloads.ts');
  let channelCount = countRendererEventManifestChannels(projectRoot);
  if (channelCount === null && fs.existsSync(channelsPath)) {
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
    const packageOwned = leftFiles.size > 0 && rightFiles.size === 0;
    const status = packageOwned
      ? 'package-owned'
      : mismatches || missingInSourceA || missingInSourceB ? 'diverged' : 'synchronized';
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
      status
    });
  }
  return {
    pairs: results,
    allSynchronized: results.every((entry) => entry.status === 'synchronized'),
    cleanOwnership: results.every((entry) => entry.status === 'synchronized' || entry.status === 'package-owned')
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
export function readCodebaseSizeThresholds(thresholdPath = DEFAULT_THRESHOLD_PATH) {
  const absolutePath = path.isAbsolute(thresholdPath)
    ? thresholdPath
    : path.resolve(process.cwd(), thresholdPath);
  const thresholds = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  if (thresholds.version !== 1) {
    throw new Error('Codebase size thresholds file missing supported "version": 1 payload.');
  }
  if (!thresholds.limits || typeof thresholds.limits !== 'object') {
    throw new Error('Codebase size thresholds file is missing "limits".');
  }
  return {
    absolutePath,
    mode: thresholds.mode || 'warning',
    limits: thresholds.limits,
    baseline: thresholds.baseline || null
  };
}
function addLimitFailure(failures, { limit, actual, type, message }) {
  if (typeof limit !== 'number') {
    return;
  }
  if (actual > limit) {
    failures.push({
      type,
      actual,
      limit,
      message
    });
  }
}
export function evaluateCodebaseSizeReport(report, thresholds) {
  const limits = thresholds.limits || {};
  const failures = [];
  addLimitFailure(failures, {
    type: 'tracked-file-count',
    actual: report.trackedFileCounts.total,
    limit: limits.trackedFilesTotalMax,
    message: `Tracked file count ${report.trackedFileCounts.total} exceeds limit ${limits.trackedFilesTotalMax}.`
  });
  addLimitFailure(failures, {
    type: 'source-loc-total',
    actual: report.sourceLocByArea.totalLines,
    limit: limits.sourceLocTotalMax,
    message: `Source LOC ${report.sourceLocByArea.totalLines} exceeds limit ${limits.sourceLocTotalMax}.`
  });
  for (const [area, limit] of Object.entries(limits.sourceLocByAreaMax || {})) {
    addLimitFailure(failures, {
      type: 'source-loc-area',
      actual: report.sourceLocByArea.byArea[area]?.loc || 0,
      limit,
      message: `Source LOC for ${area} exceeds limit ${limit}.`
    });
  }
  const shaderDuplicateDivergenceCount = report.duplicateShaders.pairs
    .filter((pair) => pair.status === 'diverged').length;
  addLimitFailure(failures, {
    type: 'shader-duplicate-divergence',
    actual: shaderDuplicateDivergenceCount,
    limit: limits.shaderDuplicateDivergenceCountMax,
    message: `Shader duplicate divergence count ${shaderDuplicateDivergenceCount} exceeds limit ${limits.shaderDuplicateDivergenceCountMax}.`
  });
  const rendererShaderDuplicateFileCount = report.duplicateShaders.pairs
    .reduce((sum, pair) => sum + pair.rightFileCount, 0);
  addLimitFailure(failures, {
    type: 'renderer-shader-duplicate-files',
    actual: rendererShaderDuplicateFileCount,
    limit: limits.rendererShaderDuplicateFileCountMax,
    message: `Renderer shader duplicate file count ${rendererShaderDuplicateFileCount} exceeds limit ${limits.rendererShaderDuplicateFileCountMax}.`
  });
  if (thresholds.baseline?.ref) {
    if (!report.runtimeSourceDelta || report.runtimeSourceDelta.status !== 'available') {
      failures.push({
        type: 'runtime-source-delta-unavailable',
        actual: report.runtimeSourceDelta?.status || 'missing',
        limit: 'available',
        message: `Runtime source delta against ${thresholds.baseline.ref} could not be computed.`
      });
    } else {
      addLimitFailure(failures, {
        type: 'runtime-source-net-growth',
        actual: report.runtimeSourceDelta.net,
        limit: limits.runtimeSourceNetGrowthMax,
        message: `Runtime source net growth ${report.runtimeSourceDelta.net} exceeds limit ${limits.runtimeSourceNetGrowthMax}.`
      });
    }
  }
  return {
    mode: thresholds.mode,
    passed: failures.length === 0,
    failures
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
  const runtimeSourceDelta = options.baseline
    ? collectGitSourceDelta(projectRoot, {
      baseRef: options.baseline.ref,
      scopes: options.baseline.scopes
    })
    : null;
  return {
    generatedAt: new Date().toISOString(),
    projectRoot,
    trackedFileCounts,
    sourceLocByArea,
    ipcContract,
    eventContract,
    testMockCounts: mockCounts,
    duplicateShaders,
    generatedArtifacts,
    runtimeSourceDelta
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
  if (report.runtimeSourceDelta) {
    console.log('Runtime source delta:');
    console.log(
      `  - base=${report.runtimeSourceDelta.baseRef}, status=${report.runtimeSourceDelta.status}, `
        + `added=${report.runtimeSourceDelta.added}, deleted=${report.runtimeSourceDelta.deleted}, net=${report.runtimeSourceDelta.net}`
    );
  }
}
function printThresholdEvaluation(evaluation) {
  if (!evaluation) {
    return;
  }
  if (evaluation.passed) {
    console.log('Codebase size thresholds satisfied.');
    return;
  }
  console.error(`Codebase size threshold failures: ${evaluation.failures.length}`);
  for (const failure of evaluation.failures) {
    console.error(`- ${failure.type}: ${failure.message}`);
  }
}
function main() {
  const options = parseArgs(process.argv.slice(2));
  const thresholds = options.enforceThresholds
    ? readCodebaseSizeThresholds(options.thresholdPath)
    : null;
  const report = buildCodebaseSizeReport(options.root, {
    baseline: thresholds?.baseline || null
  });
  const evaluation = thresholds
    ? evaluateCodebaseSizeReport(report, thresholds)
    : null;
  if (options.json) {
    console.log(JSON.stringify({
      ...report,
      thresholdEvaluation: evaluation
    }, null, 2));
    if (evaluation && thresholds.mode === 'enforce' && !evaluation.passed) {
      process.exit(1);
    }
    return;
  }
  printTextReport(report);
  printThresholdEvaluation(evaluation);
  if (evaluation && thresholds.mode === 'enforce' && !evaluation.passed) {
    process.exit(1);
  }
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
