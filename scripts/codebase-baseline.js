import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  BASELINE_SCHEMA_VERSION,
  canonicalSha256,
  createBaselineEnvelope,
  readBaselineReport,
  stableStringify,
  validateCaptureProvenance,
  writeBaselineReport
} from './lib/baseline-report.js';
import { VITE_ELECTRON_RENDERER_PLACEHOLDER } from './clean-generated.js';
import { loadBaselinePolicy } from './lib/performance-evidence.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANALYSIS_FILE = 'CODEBASE_NORMALIZATION_AND_REDUCTION_ANALYSIS.md';

function fail(message) {
  throw new Error(`Codebase baseline failed: ${message}`);
}

function compareCodeUnitStrings(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function normalizeRelativePath(value) {
  const normalized = value.replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) fail(`invalid repository path ${value}`);
  return normalized;
}

function bytesFromResult(result, label) {
  if (result.error) fail(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : String(result.stderr ?? '');
    fail(`${label} exited ${result.status}${stderr ? `: ${stderr.trim()}` : ''}`);
  }
  return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? '', 'utf8');
}

export function runGit(args, { cwd = PROJECT_ROOT, spawn = spawnSync } = {}) {
  if (!Array.isArray(args) || args.some((argument) => typeof argument !== 'string')) fail('git arguments must be a string array');
  const result = spawn('git', args, { cwd, encoding: 'buffer', windowsHide: true });
  return bytesFromResult(result, `git ${args.join(' ')}`);
}

function splitNul(buffer) {
  return buffer.toString('utf8').split('\0').filter(Boolean).map(normalizeRelativePath);
}

export function getTrackedFiles({ cwd = PROJECT_ROOT, spawn = spawnSync } = {}) {
  return splitNul(runGit(['ls-files', '-z'], { cwd, spawn })).sort();
}

export function getOriginFiles(programOriginSha, { cwd = PROJECT_ROOT, spawn = spawnSync } = {}) {
  if (!/^[a-f0-9]{40,64}$/.test(programOriginSha)) fail('programOriginSha is invalid');
  return splitNul(runGit(['ls-tree', '-rz', '--name-only', programOriginSha], { cwd, spawn })).sort();
}

export function readOriginFile(programOriginSha, relativePath, { cwd = PROJECT_ROOT, spawn = spawnSync } = {}) {
  const normalized = normalizeRelativePath(relativePath);
  return runGit(['show', `${programOriginSha}:${normalized}`], { cwd, spawn });
}

export function countPhysicalLines(buffer) {
  let lines = 0;
  for (const byte of buffer) if (byte === 10) lines += 1;
  return lines;
}

export function countNonblankLines(buffer) {
  return buffer.toString('utf8').split(/\r\n|\r|\n/).filter((line) => line.trim().length > 0).length;
}

export function classifyRepositoryArea(relativePath) {
  const firstSegment = normalizeRelativePath(relativePath).split('/')[0];
  if (['src', 'tests', 'scripts', 'docs'].includes(firstSegment)) return firstSegment;
  return 'root';
}

function extensionOf(relativePath) {
  return path.posix.extname(normalizeRelativePath(relativePath)).toLowerCase() || '[none]';
}

function sourcePolicyExtensions(policy) {
  return new Set(Object.values(policy.sourcePolicy.countedExtensions).flat());
}

function addMetrics(target, { physicalLines, nonblankLines, counted }) {
  target.files += 1;
  target.physicalLines += physicalLines;
  target.nonblankLines += nonblankLines;
  if (counted) target.countedFiles += 1;
}

function newMetricBucket() {
  return { files: 0, countedFiles: 0, physicalLines: 0, nonblankLines: 0 };
}

function directDependencies(packageBytes, label) {
  let packageJson;
  try {
    packageJson = JSON.parse(packageBytes.toString('utf8'));
  } catch (error) {
    fail(`${label} package.json cannot be parsed: ${error.message}`);
  }
  const runtime = Object.keys(packageJson.dependencies ?? {}).sort();
  const development = Object.keys(packageJson.devDependencies ?? {}).sort();
  return {
    runtime: { count: runtime.length, names: runtime },
    development: { count: development.length, names: development },
    total: runtime.length + development.length
  };
}

export function collectSurface({ files, readFile, policy, packageBytes }) {
  const countedExtensions = sourcePolicyExtensions(policy);
  const totals = { ...newMetricBucket(), trackedFiles: files.length };
  const areas = {};
  const extensions = {};
  for (const file of files) {
    const bytes = readFile(file);
    const area = classifyRepositoryArea(file);
    const extension = extensionOf(file);
    const measurement = {
      physicalLines: countPhysicalLines(bytes),
      nonblankLines: countNonblankLines(bytes),
      counted: countedExtensions.has(extension)
    };
    if (!measurement.counted) continue;
    areas[area] ??= newMetricBucket();
    extensions[extension] ??= newMetricBucket();
    addMetrics(totals, measurement);
    addMetrics(areas[area], measurement);
    addMetrics(extensions[extension], measurement);
  }
  const sourceLines = areas.src?.physicalLines ?? 0;
  const testLines = areas.tests?.physicalLines ?? 0;
  const scriptLines = areas.scripts?.physicalLines ?? 0;
  return {
    totals,
    areas: Object.fromEntries(Object.entries(areas).sort(([left], [right]) => compareCodeUnitStrings(left, right))),
    extensions: Object.fromEntries(Object.entries(extensions).sort(([left], [right]) => compareCodeUnitStrings(left, right))),
    directDependencies: directDependencies(packageBytes, 'surface'),
    ratios: {
      testToSource: sourceLines === 0 ? null : testLines / sourceLines,
      scriptToSource: sourceLines === 0 ? null : scriptLines / sourceLines,
      sourceToTest: testLines === 0 ? null : sourceLines / testLines
    }
  };
}

function difference(left, right) {
  const value = {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of [...keys].sort()) {
    if (typeof left[key] === 'number' && typeof right[key] === 'number') value[key] = right[key] - left[key];
  }
  return value;
}

function surfaceDelta(origin, current) {
  return {
    totals: difference(origin.totals, current.totals),
    dependencies: {
      runtime: current.directDependencies.runtime.count - origin.directDependencies.runtime.count,
      development: current.directDependencies.development.count - origin.directDependencies.development.count,
      total: current.directDependencies.total - origin.directDependencies.total
    }
  };
}

function dependencyNameDelta(originNames, workspaceNames) {
  const origin = new Set(originNames);
  const workspace = new Set(workspaceNames);
  return {
    added: [...workspace].filter((name) => !origin.has(name)).sort(),
    removed: [...origin].filter((name) => !workspace.has(name)).sort()
  };
}

function parseNumstat(buffer) {
  const entries = new Map();
  for (const line of buffer.toString('utf8').split('\n').filter(Boolean)) {
    const [added, deleted, file] = line.split('\t');
    if (!file || !/^\d+$/.test(added) || !/^\d+$/.test(deleted)) fail(`git diff emitted malformed numstat: ${line}`);
    entries.set(normalizeRelativePath(file), { addedLines: Number(added), deletedLines: Number(deleted) });
  }
  return entries;
}

function parseZeroContextHunks(buffer) {
  const hunks = new Map();
  let currentPath = null;
  for (const line of buffer.toString('utf8').split('\n')) {
    if (line.startsWith('diff --git ')) {
      const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
      currentPath = match ? normalizeRelativePath(match[2]) : null;
      continue;
    }
    if (currentPath && line.startsWith('@@ ')) hunks.set(currentPath, (hunks.get(currentPath) ?? 0) + 1);
  }
  return hunks;
}

function originToWorkspaceDiff(programOriginSha, { cwd, spawn, originFileSet, trackedFileSet }) {
  const numstat = parseNumstat(runGit(['diff', '--numstat', programOriginSha, '--'], { cwd, spawn }));
  const hunks = parseZeroContextHunks(runGit(['diff', '--no-color', '--unified=0', programOriginSha, '--'], { cwd, spawn }));
  const modifiedPaths = [...numstat.entries()]
    .filter(([file]) => originFileSet.has(file) && trackedFileSet.has(file))
    .map(([file, stat]) => ({ path: file, ...stat, hunkCount: hunks.get(file) ?? 0 }))
    .sort((left, right) => compareCodeUnitStrings(left.path, right.path));
  return {
    modifiedPaths,
    modifiedHunkCount: modifiedPaths.reduce((total, entry) => total + entry.hunkCount, 0),
    addedLines: modifiedPaths.reduce((total, entry) => total + entry.addedLines, 0),
    deletedLines: modifiedPaths.reduce((total, entry) => total + entry.deletedLines, 0)
  };
}

function isPhase0OwnedPath(relativePath, policy) {
  return policy.sourcePolicy.phase0OwnedPathPrefixes.some((prefix) => relativePath === prefix || relativePath.startsWith(prefix));
}

function surfaceForSubset(files, selectedPaths, readFile, policy) {
  const subset = files.filter((file) => selectedPaths.has(file));
  const packageBytes = subset.includes('package.json') ? readFile('package.json') : Buffer.from('{"dependencies":{},"devDependencies":{}}');
  return collectSurface({ files: subset, readFile, policy, packageBytes });
}

function statusEntries({ cwd, spawn }) {
  const buffer = runGit(['status', '--porcelain=v1', '-z'], { cwd, spawn });
  const parts = buffer.toString('utf8').split('\0').filter(Boolean);
  const entries = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part.length < 4) fail('git status emitted a malformed entry');
    const status = part.slice(0, 2);
    const file = normalizeRelativePath(part.slice(3));
    entries.push({ status, path: file });
    if (status.includes('R') || status.includes('C')) index += 1;
  }
  return entries.sort((left, right) => compareCodeUnitStrings(left.path, right.path));
}

function allowedGeneratedResidue(entry, { cwd, policy }) {
  if (policy.sourcePolicy.generatedArtifactPaths.some((prefix) => entry.path === prefix || entry.path.startsWith(`${prefix}/`))) return true;
  if (policy.sourcePolicy.buildOutputArtifactPaths.some((prefix) => entry.path === prefix || entry.path.startsWith(`${prefix}/`))) {
    if (entry.path !== 'index.html') return true;
    try {
      const placeholder = fs.readFileSync(path.join(cwd, entry.path), 'utf8');
      return placeholder === VITE_ELECTRON_RENDERER_PLACEHOLDER;
    } catch {
      return false;
    }
  }
  return entry.path === 'scripts/manifests/codebase-reduction-baseline.json' || entry.path === 'scripts/manifests/codebase-reduction-evidence.v1.jsonl.gz';
}

function createRepository({ cwd, spawn, policy }) {
  const commitSha = runGit(['rev-parse', 'HEAD'], { cwd, spawn }).toString('utf8').trim();
  const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, spawn }).toString('utf8').trim();
  const unexpectedPaths = statusEntries({ cwd, spawn }).filter((entry) => !allowedGeneratedResidue(entry, { cwd, policy })).map((entry) => entry.path);
  return {
    commitSha,
    dirty: unexpectedPaths.length > 0,
    branch: branch === 'HEAD' ? null : branch,
    unexpectedPaths
  };
}

function createDefaultCaptureProvenance({ sourceSha, analysisSha256 }) {
  return {
    provider: 'local',
    sourceSha,
    analysisSha256,
    captureSessionId: process.env.PRISMGB_BASELINE_CAPTURE_SESSION_ID ?? 'local-source-characterization',
    producer: {
      role: 'source-reporter',
      targetId: null,
      reportSetId: process.env.PRISMGB_BASELINE_REPORT_SET_ID ?? 'local-source'
    }
  };
}

function bindCaptureProvenanceToSource(captureProvenance, { sourceSha, analysisSha256 }) {
  const provenance = validateCaptureProvenance(captureProvenance);
  if (provenance.sourceSha !== sourceSha) {
    fail(`capture provenance sourceSha must match repository HEAD: expected ${sourceSha}, received ${provenance.sourceSha}`);
  }
  if (provenance.analysisSha256 !== analysisSha256) {
    fail(`capture provenance analysisSha256 must match the validated analysis digest: expected ${analysisSha256}, received ${provenance.analysisSha256}`);
  }
  return provenance;
}

export function validateAnalysisDigest({ cwd = PROJECT_ROOT, policy }) {
  const bytes = fs.readFileSync(path.join(cwd, ANALYSIS_FILE));
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  if (digest !== policy.policy.analysisSha256) fail(`analysis SHA-256 mismatch: expected ${policy.policy.analysisSha256}, received ${digest}`);
  return digest;
}

export function createSourceBaseline({
  cwd = PROJECT_ROOT,
  spawn = spawnSync,
  policy = loadBaselinePolicy(),
  now = () => new Date().toISOString(),
  captureProvenance = undefined,
  allowDirty = false
} = {}) {
  const analysisSha256 = validateAnalysisDigest({ cwd, policy });
  runGit(['merge-base', '--is-ancestor', policy.policy.programOriginSha, 'HEAD'], { cwd, spawn });
  const originFiles = getOriginFiles(policy.policy.programOriginSha, { cwd, spawn });
  const trackedFiles = getTrackedFiles({ cwd, spawn });
  if (!trackedFiles.includes(ANALYSIS_FILE)) fail(`${ANALYSIS_FILE} must be tracked at the source checkpoint`);
  const originFileSet = new Set(originFiles);
  const trackedFileSet = new Set(trackedFiles);
  const originReadFile = (relativePath) => readOriginFile(policy.policy.programOriginSha, relativePath, { cwd, spawn });
  const trackedReadFile = (relativePath) => fs.readFileSync(path.join(cwd, relativePath));
  const originProgramSurface = collectSurface({
    files: originFiles,
    readFile: originReadFile,
    policy: policy.policy,
    packageBytes: originReadFile('package.json')
  });
  const evidenceWorkspaceSurface = collectSurface({
    files: trackedFiles,
    readFile: trackedReadFile,
    policy: policy.policy,
    packageBytes: trackedReadFile('package.json')
  });
  const addedPaths = trackedFiles.filter((file) => !originFileSet.has(file));
  const removedPaths = originFiles.filter((file) => !trackedFileSet.has(file));
  const phase0OwnedPaths = addedPaths.filter((file) => isPhase0OwnedPath(file, policy.policy));
  const unknownNewPaths = addedPaths.filter((file) => !isPhase0OwnedPath(file, policy.policy));
  const originToWorkspace = originToWorkspaceDiff(policy.policy.programOriginSha, {
    cwd,
    spawn,
    originFileSet,
    trackedFileSet
  });
  const dependencyDelta = {
    runtime: dependencyNameDelta(originProgramSurface.directDependencies.runtime.names, evidenceWorkspaceSurface.directDependencies.runtime.names),
    development: dependencyNameDelta(originProgramSurface.directDependencies.development.names, evidenceWorkspaceSurface.directDependencies.development.names)
  };
  const phase0ToolingOverhead = {
    addedPaths: [...addedPaths].sort(),
    removedPaths: [...removedPaths].sort(),
    phase0OwnedPaths: [...phase0OwnedPaths].sort(),
    unknownNewPaths: [...unknownNewPaths].sort(),
    ownedSurface: surfaceForSubset(trackedFiles, new Set(phase0OwnedPaths), trackedReadFile, policy.policy),
    grossDeltaFromOrigin: surfaceDelta(originProgramSurface, evidenceWorkspaceSurface),
    originToWorkspace: {
      ...originToWorkspace,
      phase0OwnedModifiedPaths: originToWorkspace.modifiedPaths.filter((entry) => isPhase0OwnedPath(entry.path, policy.policy)),
      nonPhase0ModifiedPaths: originToWorkspace.modifiedPaths.filter((entry) => !isPhase0OwnedPath(entry.path, policy.policy)),
      dependencyDelta
    }
  };
  const repository = createRepository({ cwd, spawn, policy: policy.policy });
  if (repository.dirty && !allowDirty) {
    fail(`repository has unexpected source state: ${repository.unexpectedPaths.join(', ')}`);
  }
  const warnings = repository.dirty ? [`unexpected-source-state:${repository.unexpectedPaths.join(',')}`] : [];
  const provenance = bindCaptureProvenanceToSource(
    captureProvenance ?? createDefaultCaptureProvenance({ sourceSha: repository.commitSha, analysisSha256 }),
    { sourceSha: repository.commitSha, analysisSha256 }
  );
  const report = createBaselineEnvelope({
    schemaVersion: BASELINE_SCHEMA_VERSION,
    kind: 'source',
    generatedAt: now(),
    repository: { commitSha: repository.commitSha, dirty: repository.dirty, branch: repository.branch },
    environment: { os: process.platform, arch: process.arch, nodeVersion: process.version, targetId: null },
    captureProvenance: provenance,
    inputs: {
      paths: trackedFiles,
      policyVersion: policy.policy.schemaVersion,
      policyHash: policy.policyHash,
      analysisSha256
    },
    metrics: {
      programOriginSha: policy.policy.programOriginSha,
      analysisSha256,
      originProgramSurface,
      evidenceWorkspaceSurface,
      phase0ToolingOverhead,
      productReduction: {
        published: false,
        reason: 'Phase 0 source reporter does not publish an S-derived product reduction.'
      },
      repositoryUnexpectedPaths: repository.unexpectedPaths
    },
    warnings
  });
  return report;
}

function percentageDelta(previous, current) {
  const absolute = current - previous;
  return { absolute, percentage: previous === 0 ? null : absolute / previous };
}

export function compareSourceBaselines(current, accepted) {
  const currentReport = current.kind === 'source' ? current : readBaselineReport(current, 'source');
  const acceptedReport = accepted.kind === 'source' ? accepted : readBaselineReport(accepted, 'source');
  const currentTotals = currentReport.metrics.evidenceWorkspaceSurface.totals;
  const acceptedTotals = acceptedReport.metrics.evidenceWorkspaceSurface.totals;
  return Object.fromEntries(['files', 'countedFiles', 'physicalLines', 'nonblankLines'].map((key) => [key, percentageDelta(acceptedTotals[key], currentTotals[key])]));
}

export function parseCodebaseBaselineArgs(argv) {
  const options = { output: 'artifacts/codebase-baseline/source.json', compare: null, format: 'json', allowDirty: false, captureProvenance: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--allow-dirty') {
      options.allowDirty = true;
      continue;
    }
    if (argument === '--output' || argument === '--compare' || argument === '--format' || argument === '--capture-provenance') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) fail(`${argument} requires a value`);
      index += 1;
      if (argument === '--output') options.output = value;
      if (argument === '--compare') options.compare = value;
      if (argument === '--format') options.format = value;
      if (argument === '--capture-provenance') options.captureProvenance = value;
      continue;
    }
    fail(`unknown argument ${argument}`);
  }
  if (!['json', 'summary'].includes(options.format)) fail('--format must be json or summary');
  return options;
}

export function runCodebaseBaseline(argv = process.argv.slice(2), { cwd = PROJECT_ROOT, stdout = process.stdout, spawn = spawnSync } = {}) {
  const options = parseCodebaseBaselineArgs(argv);
  let captureProvenance;
  if (options.captureProvenance) {
    try {
      captureProvenance = JSON.parse(options.captureProvenance);
    } catch (error) {
      fail(`--capture-provenance must be JSON: ${error.message}`);
    }
  }
  const report = createSourceBaseline({ cwd, spawn, captureProvenance, allowDirty: options.allowDirty });
  if (options.compare) report.metrics.comparison = compareSourceBaselines(report, readBaselineReport(path.resolve(cwd, options.compare), 'source'));
  writeBaselineReport(path.resolve(cwd, options.output), report);
  if (options.format === 'summary') {
    const totals = report.metrics.evidenceWorkspaceSurface.totals;
    stdout.write(`source baseline: ${totals.trackedFiles} tracked files, ${totals.physicalLines} counted physical lines\n`);
  } else {
    stdout.write(`${stableStringify(report)}\n`);
  }
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runCodebaseBaseline();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
