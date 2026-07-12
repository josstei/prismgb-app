import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stableStringify } from './lib/baseline-report.js';
import { loadBaselinePolicy } from './lib/performance-evidence.js';
import { readPerformanceExternalMetricCaptures } from './lib/performance-external-metric-capture.js';
import {
  createPerformancePairPlan,
  PERFORMANCE_PAIR_CARDINALITIES,
  resolvePerformancePairPlanLaunch,
  validatePerformancePairPlan
} from './lib/performance-pair-plan.js';
import { readPerformanceSentinelCaptures } from './lib/performance-sentinel-capture.js';
import { readPerformanceWorkloadCaptures } from './lib/performance-workload-capture.js';

export {
  createPerformancePairPlan,
  PERFORMANCE_PAIR_CARDINALITIES
};

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PERFORMANCE_BUILD_MANIFEST = 'performance-build-manifest.json';
const PERFORMANCE_COMMAND_LEDGER = 'performance-command-ledger.json';
const PERFORMANCE_PAIR_PLAN = 'performance-pair-plan.json';
const PERFORMANCE_EXTERNAL_METRIC_CAPTURE_INDEX = 'performance-external-metric-captures.json';
const PERFORMANCE_SENTINEL_CAPTURE_INDEX = 'performance-sentinel-captures.json';
const PERFORMANCE_WORKLOAD_CAPTURE_INDEX = 'performance-workload-captures.json';
const PERFORMANCE_PRODUCTION_BUNDLE_EVIDENCE = 'performance-production-bundle-evidence.json';
const PRODUCTION_CODE_ROOTS = Object.freeze(['main', 'preload', 'renderer', 'worker']);
const PERFORMANCE_PLAYWRIGHT_ARGS = Object.freeze(['playwright', 'test', '--config', 'playwright.performance.config.js']);
const PERFORMANCE_BASELINE_POLICY = loadBaselinePolicy().policy;
const PERFORMANCE_METRIC_POLICY = PERFORMANCE_BASELINE_POLICY.performanceMetricPolicy;
const PERFORMANCE_LIMITS = PERFORMANCE_BASELINE_POLICY.performanceLimits;

export const PERFORMANCE_BUILD_VARIANTS = Object.freeze([
  Object.freeze({ id: 'production', harness: false, instrumentation: false }),
  Object.freeze({ id: 'harness-control', harness: true, instrumentation: false }),
  Object.freeze({ id: 'instrumented', harness: true, instrumentation: true })
]);

function fail(message) {
  throw new Error(`Performance baseline runner failed: ${message}`);
}

function compareCodeUnitStrings(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function normalizeRelativePath(value) {
  const normalized = value.replaceAll(path.sep, '/');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) {
    fail(`invalid bundle path ${value}`);
  }
  return normalized;
}

function npmCommand(platform = process.platform) {
  return platform === 'win32' ? 'npm.cmd' : 'npm';
}

function isExecutableFile(candidate) {
  try {
    fsSync.accessSync(candidate, fsSync.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves the closed Playwright invocation for the performance runner. Linux
 * measurements without a display must run under a fresh Xvfb display so the
 * renderer does not silently fall back to a different launch environment.
 *
 * @param {{ cwd?: string, platform?: NodeJS.Platform, environment?: NodeJS.ProcessEnv, isExecutable?: (candidate: string) => boolean }} options
 */
export function resolvePerformancePlaywrightCommand({
  cwd = PROJECT_ROOT,
  platform = process.platform,
  environment = process.env,
  isExecutable = isExecutableFile
} = {}) {
  if (typeof cwd !== 'string' || cwd.length === 0) fail('Playwright command cwd must be nonempty');
  if (typeof platform !== 'string' || platform.length === 0) fail('Playwright command platform must be nonempty');
  if (!environment || typeof environment !== 'object') fail('Playwright command environment must be an object');
  if (typeof isExecutable !== 'function') fail('Playwright command executable resolver must be a function');
  const hasDisplay = typeof environment.DISPLAY === 'string' && environment.DISPLAY.trim().length > 0;
  if (platform !== 'linux' || hasDisplay) {
    return Object.freeze({ command: 'npx', args: PERFORMANCE_PLAYWRIGHT_ARGS });
  }

  const pathValue = environment.PATH;
  if (typeof pathValue !== 'string' || pathValue.length === 0) {
    fail('Linux performance runner requires xvfb-run -a when DISPLAY is unavailable, but PATH is empty');
  }
  const xvfbRun = pathValue.split(path.delimiter)
    .map((directory) => path.resolve(directory.length === 0 ? cwd : directory, 'xvfb-run'))
    .find((candidate) => isExecutable(candidate));
  if (!xvfbRun) {
    fail('Linux performance runner requires xvfb-run -a when DISPLAY is unavailable');
  }
  return Object.freeze({ command: xvfbRun, args: Object.freeze(['-a', 'npx', ...PERFORMANCE_PLAYWRIGHT_ARGS]) });
}

function commandOutput(value) {
  return Buffer.isBuffer(value) ? value.toString('utf8') : String(value ?? '');
}

function readCommandOutput(result, label, { timeoutMilliseconds = null } = {}) {
  if (result.error) {
    if (result.error.code === 'ETIMEDOUT' && timeoutMilliseconds !== null) {
      fail(`${label} exceeded its ${timeoutMilliseconds / 1000}-second deadline`);
    }
    fail(`${label} could not start: ${result.error.message}`);
  }
  const stdout = commandOutput(result.stdout);
  const stderr = commandOutput(result.stderr);
  if (result.status !== 0) {
    const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
    fail(`${label} exited ${result.status}${output ? `:\n${output}` : ''}`);
  }
  return stdout;
}

function runCommand(command, args, { cwd, env, spawn = spawnSync, timeoutMilliseconds = null }) {
  if (timeoutMilliseconds !== null && (!Number.isSafeInteger(timeoutMilliseconds) || timeoutMilliseconds <= 0)) {
    fail('command timeout must be a positive safe integer in milliseconds');
  }
  const result = spawn(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: 'pipe',
    windowsHide: true,
    ...(timeoutMilliseconds === null ? {} : { timeout: timeoutMilliseconds })
  });
  return readCommandOutput(result, `${command} ${args.join(' ')}`, { timeoutMilliseconds });
}

function monotonicSeconds() {
  return performance.now() / 1000;
}

function readClock(clock) {
  const value = clock();
  if (!Number.isFinite(value) || value < 0) fail('clock must return a nonnegative finite number of seconds');
  return value;
}

function cloneCommandLedgerEntry(entry) {
  return Object.freeze({
    ...entry,
    closure: Object.freeze({
      ...entry.closure,
      exit: Object.freeze({ ...entry.closure.exit })
    })
  });
}

/**
 * @param {{ sourceSha: string, clock?: () => number }} options
 */
export function createPerformanceCommandLedger({ sourceSha, clock = monotonicSeconds } = {}) {
  if (typeof sourceSha !== 'string' || !/^[a-f0-9]{40}$/i.test(sourceSha)) {
    fail('command ledger sourceSha must be a Git commit SHA');
  }
  if (typeof clock !== 'function') fail('command ledger clock must be a function');

  const entries = [];
  let previousEnd = 0;
  let recording = false;

  return Object.freeze({
    async recordBuild(buildId, work) {
      if (typeof buildId !== 'string' || buildId.length === 0) fail('command ledger buildId must be nonempty');
      if (typeof work !== 'function') fail('command ledger build work must be a function');
      if (recording) fail('command ledger cannot record overlapping commands');
      const start = readClock(clock);
      if (start < previousEnd) fail('command ledger clock regressed before a build command');
      recording = true;
      try {
        const value = await work();
        const end = readClock(clock);
        if (end < start) fail('command ledger clock regressed during a build command');
        const entry = Object.freeze({
          sequence: entries.length + 1,
          operationId: 'build-spawn',
          start,
          end,
          buildId,
          closure: Object.freeze({
            closed: true,
            stdoutDrained: true,
            stderrDrained: true,
            inputClosed: true,
            exit: Object.freeze({ code: 0, durationMs: (end - start) * 1000 }),
            zeroSurvivors: true
          })
        });
        entries.push(entry);
        previousEnd = end;
        return value;
      } finally {
        recording = false;
      }
    },

    snapshot() {
      return Object.freeze({
        schemaVersion: 1,
        sourceSha: sourceSha.toLowerCase(),
        entries: Object.freeze(entries.map(cloneCommandLedgerEntry))
      });
    }
  });
}

function parseRole(value) {
  if (value === 'ci-integrity' || value === 'reference-comparison') {
    return value;
  }
  fail(`unsupported experiment role ${value}`);
}

export function resolvePerformanceExperimentDeadline(role) {
  const parsedRole = parseRole(role);
  const seconds = parsedRole === 'ci-integrity'
    ? PERFORMANCE_LIMITS.ciExperimentSeconds
    : PERFORMANCE_LIMITS.referenceExperimentSeconds;
  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    fail(`performance experiment deadline is invalid for ${parsedRole}`);
  }
  return seconds;
}

export function parsePerformanceBaselineArgs(argv, { cwd = PROJECT_ROOT } = {}) {
  if (!Array.isArray(argv)) fail('argv must be an array');

  let outputDirectory = null;
  let role = null;
  let selectedHost = false;
  let buildOnly = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--output') {
      const value = argv[++index];
      if (typeof value !== 'string' || value.length === 0) fail('--output requires a directory');
      outputDirectory = path.resolve(cwd, value);
      continue;
    }
    if (argument === '--role') {
      role = parseRole(argv[++index]);
      continue;
    }
    if (argument === '--selected-host') {
      selectedHost = true;
      continue;
    }
    if (argument === '--build-only') {
      buildOnly = true;
      continue;
    }
    fail(`unknown argument ${argument}`);
  }

  if (outputDirectory === null) fail('--output is required');
  if (outputDirectory === path.resolve(cwd)) fail('--output cannot be the repository root');
  if (role === null) fail('--role is required');
  if (role === 'reference-comparison' && !selectedHost) {
    fail('reference-comparison requires --selected-host');
  }
  if (role === 'ci-integrity' && selectedHost) {
    fail('--selected-host is only valid for reference-comparison');
  }

  return Object.freeze({ outputDirectory, role, selectedHost, buildOnly });
}

export function createPerformanceBuildEnvironment(baseEnvironment, variant) {
  if (!PERFORMANCE_BUILD_VARIANTS.includes(variant)) {
    fail('build variant is not registered');
  }
  return Object.freeze({
    ...baseEnvironment,
    PRISMGB_PERF_HARNESS_BUILD: variant.harness ? '1' : '0',
    PRISMGB_PERF_INSTRUMENTATION_BUILD: variant.instrumentation ? '1' : '0'
  });
}

async function walkBundle(root, directory = root) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => compareCodeUnitStrings(left.name, right.name))) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkBundle(root, absolutePath));
      continue;
    }
    if (!entry.isFile()) {
      fail(`bundle contains unsupported entry ${path.relative(root, absolutePath)}`);
    }
    files.push(absolutePath);
  }
  return files;
}

export async function createBundleManifest(directory) {
  const files = await walkBundle(directory);
  const entries = [];
  for (const absolutePath of files) {
    const relativePath = normalizeRelativePath(path.relative(directory, absolutePath));
    const bytes = await fs.readFile(absolutePath);
    entries.push(Object.freeze({
      path: relativePath,
      bytes: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex')
    }));
  }
  entries.sort((left, right) => compareCodeUnitStrings(left.path, right.path));
  return Object.freeze({
    sha256: crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex'),
    entries: Object.freeze(entries)
  });
}

function createSha256(value) {
  return crypto.createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}

function classifyProductionCodeRoot(entryPath) {
  if (entryPath.startsWith('main/')) return 'main';
  if (entryPath.startsWith('preload/')) return 'preload';
  if (/^renderer\/assets\/worker-entry-[A-Za-z0-9_-]+\.js$/.test(entryPath)) return 'worker';
  if (entryPath.startsWith('renderer/')) return 'renderer';
  fail(`production code entry ${entryPath} does not belong to a registered bundle root`);
}

function selectProductionEntrypoint(entries, rootId) {
  const predicate = rootId === 'main'
    ? (entry) => entry.path === 'main/index.js'
    : rootId === 'preload'
      ? (entry) => entry.path === 'preload/index.js'
      : rootId === 'renderer'
        ? (entry) => /^renderer\/assets\/main-[A-Za-z0-9_-]+\.js$/.test(entry.path)
        : (entry) => /^renderer\/assets\/worker-entry-[A-Za-z0-9_-]+\.js$/.test(entry.path);
  const matches = entries.filter(predicate);
  if (matches.length !== 1) {
    fail(`production ${rootId} code root must contain exactly one canonical entrypoint`);
  }
  return matches[0];
}

/**
 * Builds the production-only bundle evidence domain. It intentionally records
 * built code provenance separately from source/dependency reduction metrics.
 *
 * @param {{
 *   sourceSha: string,
 *   variant: Readonly<{ id: string, harness: boolean, instrumentation: boolean, bundle: Readonly<{ sha256: string, entries: readonly Readonly<{ path: string, bytes: number, sha256: string }>[] }> }>
 * }} input
 */
export function createProductionBundleEvidence({ sourceSha, variant } = {}) {
  if (typeof sourceSha !== 'string' || !/^[a-f0-9]{40}$/.test(sourceSha)) {
    fail('production bundle evidence sourceSha is invalid');
  }
  if (!variant || variant.id !== 'production' || variant.harness !== false || variant.instrumentation !== false) {
    fail('production bundle evidence requires the production build variant');
  }
  if (!variant.bundle || !/^[a-f0-9]{64}$/.test(variant.bundle.sha256) || !Array.isArray(variant.bundle.entries)) {
    fail('production bundle evidence requires a canonical production bundle manifest');
  }

  const codeEntries = variant.bundle.entries.filter((entry) => /\.(?:cjs|mjs|js)$/.test(entry.path));
  if (codeEntries.length === 0) fail('production bundle evidence contains no JavaScript code entries');
  const entriesByRoot = new Map(PRODUCTION_CODE_ROOTS.map((rootId) => [rootId, []]));
  for (const entry of codeEntries) {
    const rootId = classifyProductionCodeRoot(entry.path);
    entriesByRoot.get(rootId).push(entry);
  }

  const codeRoots = PRODUCTION_CODE_ROOTS.map((id) => {
    const entries = entriesByRoot.get(id);
    if (!entries || entries.length === 0) fail(`production ${id} code root is empty`);
    const byteTotal = entries.reduce((total, entry) => total + entry.bytes, 0);
    if (!Number.isSafeInteger(byteTotal)) fail(`production ${id} code byte total exceeds safe integer precision`);
    return Object.freeze({
      id,
      entrypoint: Object.freeze({ ...selectProductionEntrypoint(entries, id) }),
      byteTotal,
      entries: Object.freeze(entries.map((entry) => Object.freeze({ ...entry }))),
      sha256: createSha256(entries)
    });
  });
  const codeByteTotal = codeRoots.reduce((total, root) => total + root.byteTotal, 0);
  if (!Number.isSafeInteger(codeByteTotal)) fail('production code byte total exceeds safe integer precision');
  const body = {
    schemaVersion: 1,
    sourceSha,
    build: {
      id: variant.id,
      harness: variant.harness,
      instrumentation: variant.instrumentation,
      bundleSha256: variant.bundle.sha256
    },
    codeByteTotal,
    codeRoots
  };
  return Object.freeze({ ...body, checksum: createSha256(body) });
}

async function assertBuiltVariant(distDirectory) {
  const requiredPaths = [
    'main/index.js',
    'preload/index.js',
    'renderer'
  ];
  for (const relativePath of requiredPaths) {
    try {
      await fs.access(path.join(distDirectory, relativePath));
    } catch {
      fail(`build did not produce dist/${relativePath}`);
    }
  }
}

async function createEmptyOutputDirectory(outputDirectory) {
  await fs.mkdir(outputDirectory, { recursive: true });
  const existing = await fs.readdir(outputDirectory);
  if (existing.length > 0) {
    fail(`output directory must be empty: ${outputDirectory}`);
  }
}

function readCleanSourceSha({ cwd, env, spawn }) {
  const sourceStatus = runCommand('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd,
    env,
    spawn
  });
  if (sourceStatus.trim() !== '') {
    fail('source tree must be clean before creating a performance baseline');
  }

  const sourceSha = runCommand('git', ['rev-parse', 'HEAD'], {
    cwd,
    env,
    spawn
  }).trim();
  if (!/^[a-f0-9]{40}$/i.test(sourceSha)) fail('git did not return a commit SHA');
  return sourceSha.toLowerCase();
}

export async function buildPerformanceVariants({
  cwd = PROJECT_ROOT,
  outputDirectory,
  baseEnvironment = process.env,
  spawn = spawnSync,
  platform = process.platform,
  clock = monotonicSeconds
} = {}) {
  if (typeof outputDirectory !== 'string' || outputDirectory.length === 0) {
    fail('outputDirectory is required');
  }

  const sourceSha = readCleanSourceSha({
    cwd,
    env: baseEnvironment,
    spawn
  });
  await createEmptyOutputDirectory(outputDirectory);

  const distDirectory = path.join(cwd, 'dist');
  const buildsDirectory = path.join(outputDirectory, 'builds');
  await fs.mkdir(buildsDirectory, { recursive: true });
  const commandLedger = createPerformanceCommandLedger({ sourceSha, clock });
  const variants = [];

  for (const variant of PERFORMANCE_BUILD_VARIANTS) {
    await fs.rm(distDirectory, { recursive: true, force: true });
    const environment = createPerformanceBuildEnvironment(baseEnvironment, variant);
    await commandLedger.recordBuild(variant.id, () => runCommand(npmCommand(platform), ['run', 'build:vite'], {
      cwd,
      env: environment,
      spawn
    }));
    await assertBuiltVariant(distDirectory);

    const buildDirectory = path.join(buildsDirectory, variant.id);
    await fs.cp(distDirectory, buildDirectory, { recursive: true, force: false, errorOnExist: true });
    const bundle = await createBundleManifest(buildDirectory);
    variants.push(Object.freeze({
      id: variant.id,
      harness: variant.harness,
      instrumentation: variant.instrumentation,
      bundle
    }));
  }

  const manifest = Object.freeze({
    schemaVersion: 1,
    sourceSha,
    variants: Object.freeze(variants)
  });
  const manifestPath = path.join(outputDirectory, PERFORMANCE_BUILD_MANIFEST);
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const productionVariant = variants.find((variant) => variant.id === 'production');
  const productionBundleEvidence = createProductionBundleEvidence({ sourceSha, variant: productionVariant });
  const productionBundleEvidencePath = path.join(outputDirectory, PERFORMANCE_PRODUCTION_BUNDLE_EVIDENCE);
  await fs.writeFile(productionBundleEvidencePath, `${stableStringify(productionBundleEvidence)}\n`, { encoding: 'utf8', flag: 'wx' });
  const commandLedgerPath = path.join(outputDirectory, PERFORMANCE_COMMAND_LEDGER);
  const commandLedgerSnapshot = commandLedger.snapshot();
  await fs.writeFile(commandLedgerPath, `${JSON.stringify(commandLedgerSnapshot, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return Object.freeze({
    manifest,
    manifestPath,
    buildsDirectory,
    productionBundleEvidence,
    productionBundleEvidencePath,
    commandLedger: commandLedgerSnapshot,
    commandLedgerPath
  });
}

function performancePairCaptureKey(pair) {
  return `${pair.pairPlanChecksum}\u0000${pair.metricSessionId}\u0000${pair.comparisonSide}`;
}

function expectedPerformancePairLaunches(pairPlan, predicate) {
  const expected = [];
  for (const pair of pairPlan.pairs) {
    for (const launch of pair.launches) {
      if (!predicate({ pair, launch })) continue;
      expected.push(Object.freeze({
        pair: Object.freeze({
          experimentId: pairPlan.experimentId,
          pairPlanChecksum: pairPlan.checksum,
          metricSessionId: pair.metricSessionId,
          comparisonKind: pair.comparisonKind,
          backend: pair.backend,
          pairIndex: pair.pairIndex,
          attemptIndex: pair.attemptIndex,
          comparisonSide: launch.comparisonSide
        }),
        launch: Object.freeze({ ...launch })
      }));
    }
  }
  return Object.freeze(expected);
}

/**
 * Binds raw launch captures to the runner-authored immutable pair plan. File
 * discovery order is intentionally discarded: every accepted set is returned
 * in the plan's canonical pair/side order.
 */
function collectPlannedCaptureSet({ captures, pairPlan: pairPlanInput, label, predicate }) {
  let pairPlan;
  try {
    pairPlan = validatePerformancePairPlan(pairPlanInput);
  } catch (error) {
    fail(`${label} pair plan is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(captures)) fail(`${label} captures must be an array`);
  if (typeof predicate !== 'function') fail(`${label} predicate must be a function`);
  const expected = expectedPerformancePairLaunches(pairPlan, predicate);
  if (captures.length !== expected.length) {
    fail(`expected exactly ${expected.length} ${label} captures, found ${captures.length}`);
  }
  const expectedByKey = new Map(expected.map((entry) => [performancePairCaptureKey(entry.pair), entry]));
  const capturesByKey = new Map();
  for (const entry of captures) {
    if (!entry || typeof entry !== 'object' || !entry.capture || typeof entry.capture !== 'object') {
      fail(`${label} capture entry is invalid`);
    }
    const capture = entry.capture;
    let planned;
    try {
      planned = resolvePerformancePairPlanLaunch(pairPlan, capture.pair);
    } catch (error) {
      fail(`${label} capture does not bind one planned launch: ${error instanceof Error ? error.message : String(error)}`);
    }
    const key = performancePairCaptureKey(capture.pair);
    const expectedEntry = expectedByKey.get(key);
    if (!expectedEntry || !predicate(planned)) {
      fail(`${label} capture is not expected for this performance experiment`);
    }
    if (capture.build.id !== planned.launch.buildVariant) {
      fail(`${label} capture build does not match its planned launch side`);
    }
    if (capturesByKey.has(key)) fail(`${label} captures duplicate one planned launch side`);
    capturesByKey.set(key, Object.freeze({ ...entry, planned }));
  }
  if (capturesByKey.size !== expectedByKey.size) {
    fail(`${label} captures do not cover every planned launch side`);
  }
  return Object.freeze({
    pairPlan,
    expected,
    captures: Object.freeze(expected.map((entry) => capturesByKey.get(performancePairCaptureKey(entry.pair))))
  });
}

export async function collectPerformanceWorkloadCaptures({ outputDirectory, sourceSha, manifest, pairPlan } = {}) {
  if (typeof outputDirectory !== 'string' || outputDirectory.length === 0) {
    fail('workload capture outputDirectory is required');
  }
  if (typeof sourceSha !== 'string' || !/^[a-f0-9]{40}$/.test(sourceSha)) {
    fail('workload capture sourceSha is invalid');
  }
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.variants)) {
    fail('workload capture build manifest is invalid');
  }

  const rawCaptures = await readPerformanceWorkloadCaptures({ outputDirectory });
  const plannedCaptures = collectPlannedCaptureSet({
    captures: rawCaptures,
    pairPlan,
    label: 'instrumented workload',
    predicate: ({ pair, launch }) => pair.comparisonKind === 'instrumentation-overhead' && launch.buildVariant === 'instrumented'
  });
  const entries = plannedCaptures.captures.map(({ capture, relativePath }) => {
    if (capture.sourceSha !== sourceSha) {
      fail('workload capture source SHA does not match the clean build');
    }
    if (capture.build.id !== 'instrumented' || capture.build.harness !== true || capture.build.instrumentation !== true) {
      fail('workload capture must come from the instrumented build');
    }
    const variant = manifest.variants.find((entry) => entry.id === capture.build.id);
    if (!variant || variant.harness !== capture.build.harness || variant.instrumentation !== capture.build.instrumentation) {
      fail('workload capture build variant does not match the build manifest');
    }
    if (variant.bundle?.sha256 !== capture.build.bundleSha256) {
      fail('workload capture bundle hash does not match the build manifest');
    }
    return {
      relativePath,
      checksum: capture.checksum,
      launchId: capture.launchId,
      pair: capture.pair,
      buildId: capture.build.id,
      sourceOpportunityCount: capture.window.deliveredCallbackCount,
      firstSourceSequence: capture.sourceSequences[0],
      lastSourceSequence: capture.sourceSequences.at(-1)
    };
  });
  const body = {
    schemaVersion: 3,
    sourceSha,
    captures: entries
  };
  const index = Object.freeze({
    ...body,
    checksum: crypto.createHash('sha256').update(stableStringify(body), 'utf8').digest('hex')
  });
  const indexPath = path.join(outputDirectory, PERFORMANCE_WORKLOAD_CAPTURE_INDEX);
  await fs.writeFile(indexPath, `${stableStringify(index)}\n`, { encoding: 'utf8', flag: 'wx' });
  return Object.freeze({ index, indexPath, captures: plannedCaptures.captures });
}

export async function collectPerformanceSentinelCaptures({ outputDirectory, sourceSha, manifest, pairPlan } = {}) {
  if (typeof outputDirectory !== 'string' || outputDirectory.length === 0) {
    fail('sentinel capture outputDirectory is required');
  }
  if (typeof sourceSha !== 'string' || !/^[a-f0-9]{40}$/.test(sourceSha)) {
    fail('sentinel capture sourceSha is invalid');
  }
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.variants)) {
    fail('sentinel capture build manifest is invalid');
  }

  const rawCaptures = await readPerformanceSentinelCaptures({ outputDirectory });
  const plannedCaptures = collectPlannedCaptureSet({
    captures: rawCaptures,
    pairPlan,
    label: 'external sentinel',
    predicate: ({ pair }) => pair.comparisonKind === 'harness-overhead'
  });
  const entries = plannedCaptures.captures.map(({ capture, relativePath }) => {
    if (capture.sourceSha !== sourceSha) {
      fail('sentinel capture source SHA does not match the clean build');
    }
    const variant = manifest.variants.find((entry) => entry.id === capture.build.id);
    if (!variant || variant.harness !== capture.build.harness || variant.instrumentation !== capture.build.instrumentation) {
      fail('sentinel capture build variant does not match the build manifest');
    }
    if (variant.bundle?.sha256 !== capture.build.bundleSha256) {
      fail('sentinel capture bundle hash does not match the build manifest');
    }
    if (capture.backend !== capture.pair.backend) {
      fail('sentinel capture backend does not match its planned pair backend');
    }
    const backendOperationCount = capture.backend === 'canvas2d'
      ? capture.observations.canvasDraws.length
      : capture.observations.workerFramePosts.length;
    const eventCount = capture.observations.callbacks.length
      + capture.observations.canvasDraws.length
      + capture.observations.workerFramePosts.length
      + capture.observations.acknowledgements.length
      + capture.observations.errors.length;
    return {
      relativePath,
      checksum: capture.checksum,
      runId: capture.runId,
      externalExecutionId: capture.externalExecutionId,
      observationBoundaryId: capture.observationBoundaryId,
      pair: capture.pair,
      buildId: capture.build.id,
      backend: capture.backend,
      callbackCount: capture.window.deliveredCallbackCount,
      backendOperationCount,
      acknowledgementCount: capture.observations.acknowledgements.length,
      eventCount
    };
  });
  const body = {
    schemaVersion: 3,
    sourceSha,
    captures: entries
  };
  const index = Object.freeze({
    ...body,
    checksum: crypto.createHash('sha256').update(stableStringify(body), 'utf8').digest('hex')
  });
  const indexPath = path.join(outputDirectory, PERFORMANCE_SENTINEL_CAPTURE_INDEX);
  await fs.writeFile(indexPath, `${stableStringify(index)}\n`, { encoding: 'utf8', flag: 'wx' });
  return Object.freeze({ index, indexPath, captures: plannedCaptures.captures });
}

/**
 * Indexes raw OS metric transcripts for every planned side. Sentinel sides
 * additionally bind the external transcript to their external callback
 * evidence; instrumentation pairs retain their independent pair binding.
 *
 * @param {{
 *   outputDirectory: string,
 *   sourceSha: string,
 *   manifest: { variants: Array<object> },
 *   sentinelCaptures: ReadonlyArray<{ capture: object }>,
 *   pairPlan: object
 * }} options
 */
export async function collectPerformanceExternalMetricCaptures({
  outputDirectory,
  sourceSha,
  manifest,
  sentinelCaptures,
  pairPlan
} = {}) {
  if (typeof outputDirectory !== 'string' || outputDirectory.length === 0) {
    fail('external metric capture outputDirectory is required');
  }
  if (typeof sourceSha !== 'string' || !/^[a-f0-9]{40}$/.test(sourceSha)) {
    fail('external metric capture sourceSha is invalid');
  }
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.variants)) {
    fail('external metric capture build manifest is invalid');
  }
  if (!Array.isArray(sentinelCaptures) || sentinelCaptures.length === 0) {
    fail('external metric capture requires the completed sentinel captures');
  }

  const sentinelsByPairKey = new Map();
  for (const entry of sentinelCaptures) {
    if (!entry || typeof entry !== 'object' || !entry.capture || typeof entry.capture !== 'object') {
      fail('external metric capture sentinel entry is invalid');
    }
    const sentinel = entry.capture;
    const key = performancePairCaptureKey(sentinel.pair);
    if (sentinelsByPairKey.has(key)) {
      fail('external metric capture sentinel pair sides must be unique');
    }
    sentinelsByPairKey.set(key, sentinel);
  }

  const rawCaptures = await readPerformanceExternalMetricCaptures({ outputDirectory });
  const plannedCaptures = collectPlannedCaptureSet({
    captures: rawCaptures,
    pairPlan,
    label: 'external metric',
    predicate: () => true
  });
  const entries = plannedCaptures.captures.map(({ capture, relativePath }) => {
    if (capture.sourceSha !== sourceSha) {
      fail('external metric capture source SHA does not match the clean build');
    }
    const variant = manifest.variants.find((entry) => entry.id === capture.build.id);
    if (!variant || variant.harness !== capture.build.harness || variant.instrumentation !== capture.build.instrumentation) {
      fail('external metric capture build variant does not match the build manifest');
    }
    if (variant.bundle?.sha256 !== capture.build.bundleSha256) {
      fail('external metric capture bundle hash does not match the build manifest');
    }
    if (capture.pair.comparisonKind === 'harness-overhead') {
      const sentinel = sentinelsByPairKey.get(performancePairCaptureKey(capture.pair));
      if (!sentinel) {
        fail('external metric capture does not bind a sentinel pair side');
      }
      if (capture.externalExecutionId !== sentinel.externalExecutionId
        || capture.runId !== sentinel.runId
        || capture.observationBoundaryId !== sentinel.observationBoundaryId) {
        fail('external metric capture does not bind the sentinel run and observation boundary');
      }
      if (stableStringify(capture.build) !== stableStringify(sentinel.build)
        || stableStringify(capture.pair) !== stableStringify(sentinel.pair)) {
        fail('external metric capture does not bind the sentinel build and pair identity');
      }
    }
    if (capture.inWindowSamples.length < PERFORMANCE_METRIC_POLICY.minimumRawSamples) {
      fail('external metric capture does not meet the policy raw sample floor');
    }
    if (capture.window.terminalClosureEnd - capture.window.start < 30) {
      fail('external metric capture does not span the policy workload duration');
    }
    if (capture.terminalSample.sample.readEnd - capture.window.start < 30) {
      fail('external metric capture does not retain a terminal sample after the policy workload duration');
    }
    return {
      relativePath,
      checksum: capture.checksum,
      runId: capture.runId,
      externalExecutionId: capture.externalExecutionId,
      observationBoundaryId: capture.observationBoundaryId,
      pair: capture.pair,
      buildId: capture.build.id,
      adapterId: capture.adapterId,
      rendererPid: capture.target.pid,
      processIdentity: capture.target.processIdentity,
      inWindowSampleCount: capture.inWindowSamples.length,
      terminalSampleOrdinal: capture.terminalSample.sample.ordinal
    };
  });
  const body = {
    schemaVersion: 3,
    sourceSha,
    captures: entries
  };
  const index = Object.freeze({
    ...body,
    checksum: crypto.createHash('sha256').update(stableStringify(body), 'utf8').digest('hex')
  });
  const indexPath = path.join(outputDirectory, PERFORMANCE_EXTERNAL_METRIC_CAPTURE_INDEX);
  await fs.writeFile(indexPath, `${stableStringify(index)}\n`, { encoding: 'utf8', flag: 'wx' });
  return Object.freeze({ index, indexPath, captures: plannedCaptures.captures });
}

export async function runPerformanceBaseline({
  cwd = PROJECT_ROOT,
  argv = process.argv.slice(2),
  baseEnvironment = process.env,
  spawn = spawnSync,
  platform = process.platform,
  clock = monotonicSeconds
} = {}) {
  const options = parsePerformanceBaselineArgs(argv, { cwd });
  const build = await buildPerformanceVariants({
    cwd,
    outputDirectory: options.outputDirectory,
    baseEnvironment,
    spawn,
    platform,
    clock
  });

  if (options.buildOnly) {
    return Object.freeze({
      ...build,
      role: options.role,
      selectedHost: options.selectedHost,
      playwrightExecuted: false
    });
  }

  const experimentId = crypto.randomUUID();
  const experimentDeadlineSeconds = resolvePerformanceExperimentDeadline(options.role);
  const pairPlan = createPerformancePairPlan({ experimentId, backend: 'canvas2d' });
  const pairPlanPath = path.join(options.outputDirectory, PERFORMANCE_PAIR_PLAN);
  await fs.writeFile(pairPlanPath, `${stableStringify(pairPlan)}\n`, { encoding: 'utf8', flag: 'wx' });

  const playwright = resolvePerformancePlaywrightCommand({
    cwd,
    platform,
    environment: baseEnvironment
  });
  const experimentStartedAt = readClock(clock);
  runCommand(playwright.command, playwright.args, {
    cwd,
    env: {
      ...baseEnvironment,
      PRISMGB_PERFORMANCE_BUILD_MANIFEST: build.manifestPath,
      PRISMGB_PERFORMANCE_BUILDS_DIRECTORY: build.buildsDirectory,
      PRISMGB_PERFORMANCE_OUTPUT: options.outputDirectory,
      PRISMGB_PERFORMANCE_CAPTURE_OUTPUT: options.outputDirectory,
      PRISMGB_PERFORMANCE_ROLE: options.role,
      PRISMGB_PERFORMANCE_EXPERIMENT_ID: experimentId,
      PRISMGB_PERFORMANCE_PAIR_PLAN: pairPlanPath,
      PRISMGB_PERF_SELECTED_HOST: options.selectedHost ? '1' : '0',
      PRISMGB_PERFORMANCE_EXPERIMENT_DEADLINE_SECONDS: String(experimentDeadlineSeconds)
    },
    spawn,
    timeoutMilliseconds: experimentDeadlineSeconds * 1000
  });
  const experimentElapsedSeconds = readClock(clock) - experimentStartedAt;
  if (experimentElapsedSeconds < 0) {
    fail('performance experiment clock regressed during the Playwright lane');
  }
  if (experimentElapsedSeconds > experimentDeadlineSeconds) {
    fail(`${options.role} performance experiment exceeded its ${experimentDeadlineSeconds}-second deadline`);
  }

  const workloadCapture = await collectPerformanceWorkloadCaptures({
    outputDirectory: options.outputDirectory,
    sourceSha: build.manifest.sourceSha,
    manifest: build.manifest,
    pairPlan
  });
  const sentinelCapture = await collectPerformanceSentinelCaptures({
    outputDirectory: options.outputDirectory,
    sourceSha: build.manifest.sourceSha,
    manifest: build.manifest,
    pairPlan
  });
  const externalMetricCapture = await collectPerformanceExternalMetricCaptures({
    outputDirectory: options.outputDirectory,
    sourceSha: build.manifest.sourceSha,
    manifest: build.manifest,
    sentinelCaptures: sentinelCapture.captures,
    pairPlan
  });

  return Object.freeze({
    ...build,
    role: options.role,
    selectedHost: options.selectedHost,
    experimentId,
    experimentDeadlineSeconds,
    experimentElapsedSeconds,
    pairPlan,
    pairPlanPath,
    playwrightExecuted: true,
    workloadCapture,
    sentinelCapture,
    externalMetricCapture
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPerformanceBaseline().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
