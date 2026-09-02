import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { canonicalSha256, stableStringify } from './lib/baseline-report.js';
import { loadBaselinePolicy } from './lib/performance-evidence.js';
import { readPerformanceExternalMetricCaptures } from './lib/performance-external-metric-capture.js';
import { readPerformanceMetricSessionCaptures } from './lib/performance-metric-session-capture.js';
import {
  createPerformancePairPlan,
  PERFORMANCE_PAIR_CARDINALITIES,
  resolvePerformancePairPlanLaunch,
  validatePerformanceRunJoin,
  validatePerformancePairPlan
} from './lib/performance-pair-plan.js';
import {
  createPerformanceCaptureIndex,
  createPerformanceExperimentEnvironmentCapture,
  createPerformanceQualificationCapture,
  createPerformanceTransportCapture,
  readPerformanceRawCaptureManifest,
  writePerformanceRawCaptureManifest
} from './lib/performance-raw-capture-manifest.js';
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
const PERFORMANCE_LAUNCH_AUTHORITY = 'performance-launch-authority.json';
const PERFORMANCE_PRELOOP_AUTHORITY = 'performance-preloop-authority.json';
const PERFORMANCE_EXTERNAL_METRIC_CAPTURE_INDEX = 'performance-external-metric-captures.json';
const PERFORMANCE_METRIC_SESSION_CAPTURE_INDEX = 'performance-metric-session-captures.json';
const PERFORMANCE_SENTINEL_CAPTURE_INDEX = 'performance-sentinel-captures.json';
const PERFORMANCE_WORKLOAD_CAPTURE_INDEX = 'performance-workload-captures.json';
const PERFORMANCE_PRODUCTION_BUNDLE_EVIDENCE = 'performance-production-bundle-evidence.json';
const PERFORMANCE_LEDGER = 'performance-ledger.json';
const PERFORMANCE_EXPERIMENT_ENVIRONMENT_CAPTURE = 'experiment-evidence/environment.json';
const PERFORMANCE_LIVE_EXPERIMENT_ENVIRONMENT_CAPTURE = 'experiment-evidence/environment-live.json';
const PERFORMANCE_EXPERIMENT_ENVIRONMENT_INDEX = 'performance-experiment-environment.json';
const PERFORMANCE_TRANSPORT_CAPTURE_DIRECTORY = 'experiment-evidence/transport';
const PERFORMANCE_TRANSPORT_INDEX = 'performance-transport-captures.json';
const PERFORMANCE_QUALIFICATION_CAPTURE = 'experiment-evidence/qualification.json';
const PERFORMANCE_QUALIFICATION_INDEX = 'performance-qualification-captures.json';
const PRODUCTION_CODE_ROOTS = Object.freeze(['main', 'preload', 'renderer', 'worker']);
const PERFORMANCE_PLAYWRIGHT_ARGS = Object.freeze(['playwright', 'test', '--config', 'playwright.performance.config.js']);
const PERFORMANCE_BASELINE = loadBaselinePolicy();
const PERFORMANCE_BASELINE_POLICY = PERFORMANCE_BASELINE.policy;
export const PERFORMANCE_POLICY_HASH = PERFORMANCE_BASELINE.policyHash;
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
  if (value.includes('\\')) {
    fail(`invalid bundle path ${value}`);
  }
  const normalized = value.replaceAll(path.sep, '/');
  const segments = normalized.split('/');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..') ||
    Buffer.byteLength(normalized, 'utf8') > 4096
  ) {
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
  return Number(process.hrtime.bigint()) / 1_000_000_000;
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
    sha256: createSha256(entries),
    entries: Object.freeze(entries)
  });
}

function createSha256(value) {
  return crypto.createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}

async function readPerformanceArtifact(outputDirectory, relativePath, label) {
  let value;
  try {
    value = JSON.parse(await fs.readFile(path.join(outputDirectory, relativePath), 'utf8'));
  } catch (error) {
    fail(`${label} is not readable JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be a JSON object`);
  }
  return value;
}

async function readPerformanceArrayArtifact(outputDirectory, relativePath, label) {
  let value;
  try {
    value = JSON.parse(await fs.readFile(path.join(outputDirectory, relativePath), 'utf8'));
  } catch (error) {
    fail(`${label} is not readable JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(value)) fail(`${label} must be a JSON array`);
  return value;
}

function artifactReference(relativePath, value) {
  return Object.freeze({
    relativePath,
    checksum: typeof value.checksum === 'string' && /^[a-f0-9]{64}$/.test(value.checksum)
      ? value.checksum
      : canonicalSha256(value)
  });
}

const PERFORMANCE_ENVIRONMENT_MONITOR_WORKER_SOURCE = String.raw`
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parentPort, workerData } = require('node:worker_threads');

if (parentPort === null) throw new Error('Performance environment monitor requires a worker parent port');
const pollCadenceMs = workerData?.pollCadenceMs;
if (!Number.isSafeInteger(pollCadenceMs) || pollCadenceMs < 900 || pollCadenceMs > 1100) {
  throw new Error('Performance environment monitor cadence is invalid');
}
const liveCapturePath = workerData?.liveCapturePath;
const binding = workerData?.binding;
if (typeof liveCapturePath !== 'string' || liveCapturePath.length === 0
  || !binding || typeof binding !== 'object') {
  throw new Error('Performance environment monitor live capture authority is invalid');
}

const staticIdentity = Object.freeze({
  host: Object.freeze({ hostname: os.hostname(), platform: os.platform(), release: os.release(), architecture: os.arch() }),
  runtime: Object.freeze({ nodeVersion: process.version, executable: process.execPath }),
  gpu: Object.freeze({ availability: 'external-monitor-unavailable' }),
  switches: Object.freeze({ execArgv: Object.freeze([...process.execArgv]) })
});
function dynamicState() {
  return Object.freeze({
    power: Object.freeze({ availability: 'external-monitor-unavailable' }),
    display: Object.freeze({ displayEnvironment: process.env.DISPLAY ?? null }),
    refreshRate: null,
    devicePixelRatio: null,
    thermal: Object.freeze({ availability: 'external-monitor-unavailable' }),
    gpuSwitch: Object.freeze({ availability: 'external-monitor-unavailable' })
  });
}
function stable(value) { return JSON.stringify(value); }
function runnerMonotonicSeconds() { return Number(process.hrtime.bigint()) / 1_000_000_000; }

const rows = [];
let sourceSequence = 0;
let runnerReceiptSequence = 0;
let previousDynamicState = dynamicState();
let stopped = false;
let pairLoopBoundaryRecorded = false;
let pairLoopBoundaryPrepared = false;
function publishRows() {
  const temporaryPath = liveCapturePath + '.tmp';
  fs.mkdirSync(path.dirname(liveCapturePath), { recursive: true });
  fs.writeFileSync(temporaryPath, JSON.stringify({ schemaVersion: 1, rows: rows.map((row) => ({ ...binding, ...row })) }) + '\n');
  fs.renameSync(temporaryPath, liveCapturePath);
}
function appendSnapshot(observationKind, currentDynamicState, observedAt = runnerMonotonicSeconds()) {
  sourceSequence += 1;
  runnerReceiptSequence += 1;
  const rawObservation = { staticIdentity, dynamicState: currentDynamicState };
  rows.push({
    source: 'external-monitor', sourceSequence, clockDomain: 'runner', runnerReceiptSequence, observedAt,
    observationKind, rawAdapterKind: 'external-host-snapshot-v1', rawObservation,
    ...(observationKind === 'initial-snapshot'
      ? { staticIdentity, dynamicState: currentDynamicState }
      : { dynamicState: currentDynamicState })
  });
  publishRows();
}
function poll() {
  if (stopped) return;
  const currentDynamicState = dynamicState();
  appendSnapshot('poll-snapshot', currentDynamicState);
  if (stable(currentDynamicState) !== stable(previousDynamicState)) {
    sourceSequence += 1;
    runnerReceiptSequence += 1;
    rows.push({
      source: 'external-monitor', sourceSequence, clockDomain: 'runner', runnerReceiptSequence,
      observedAt: runnerMonotonicSeconds(), observationKind: 'event', eventName: 'poll-transition',
      rawAdapterKind: 'external-host-transition-v1',
      rawObservation: { eventName: 'poll-transition', previousDynamicState, currentDynamicState },
      dynamicState: currentDynamicState
    });
    publishRows();
  }
  previousDynamicState = currentDynamicState;
}

appendSnapshot('initial-snapshot', previousDynamicState);
let timer = setInterval(poll, pollCadenceMs);
parentPort.postMessage({ kind: 'ready' });
parentPort.on('message', (message) => {
  if (message?.kind === 'prepare-pair-loop-boundary' && !stopped) {
    if (pairLoopBoundaryPrepared || pairLoopBoundaryRecorded) {
      throw new Error('Performance environment monitor pair-loop preparation is invalid');
    }
    pairLoopBoundaryPrepared = true;
    clearInterval(timer);
    parentPort.postMessage({ kind: 'pair-loop-boundary-prepared' });
    return;
  }
  if (message?.kind === 'pair-loop-boundary' && !stopped) {
    if (!pairLoopBoundaryPrepared || pairLoopBoundaryRecorded) {
      throw new Error('Performance environment monitor pair-loop boundary is invalid');
    }
    pairLoopBoundaryRecorded = true;
    const currentDynamicState = dynamicState();
    const observedAt = runnerMonotonicSeconds();
    appendSnapshot('poll-snapshot', currentDynamicState, observedAt);
    previousDynamicState = currentDynamicState;
    timer = setInterval(poll, pollCadenceMs);
    parentPort.postMessage({ kind: 'pair-loop-boundary-recorded', observedAt });
    return;
  }
  if (message?.kind !== 'stop' || stopped) return;
  stopped = true;
  clearInterval(timer);
  const lastSourceSequence = sourceSequence;
  sourceSequence += 1;
  runnerReceiptSequence += 1;
  rows.push({
    source: 'external-monitor', sourceSequence, clockDomain: 'runner', runnerReceiptSequence,
    observedAt: runnerMonotonicSeconds(), observationKind: 'cleanup', rawAdapterKind: 'external-host-cleanup-v1',
    rawObservation: {
      cleanupState: 'disposed', lastSourceSequence, remainingPollTimerCount: 0, remainingListenerCount: 0
    },
    cleanupState: 'disposed'
  });
  publishRows();
  parentPort.postMessage({ kind: 'stopped', rows });
});
`;

async function startPerformanceEnvironmentMonitor({ experimentId, sourceSha, experimentRole, outputDirectory }) {
  const liveCapturePath = path.join(outputDirectory, PERFORMANCE_LIVE_EXPERIMENT_ENVIRONMENT_CAPTURE);
  const binding = {
    sourceSha,
    policyHash: PERFORMANCE_POLICY_HASH,
    experimentId,
    experimentRole,
    scopeKind: 'experiment',
    scopeId: experimentId,
    captureKind: 'experiment-environment'
  };
  const worker = new Worker(PERFORMANCE_ENVIRONMENT_MONITOR_WORKER_SOURCE, {
    eval: true,
    workerData: { pollCadenceMs: 1000, liveCapturePath, binding }
  });
  let settled = false;
  let pairLoopBoundaryPrepared = false;
  let pairLoopBoundaryMarked = false;
  const stopped = new Promise((resolve, reject) => {
    worker.once('error', reject);
    worker.on('message', (message) => {
      if (message?.kind === 'stopped') resolve(message.rows);
    });
  });
  await new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    worker.once('error', onError);
    worker.on('message', function onMessage(message) {
      if (message?.kind !== 'ready') return;
      worker.off('error', onError);
      worker.off('message', onMessage);
      resolve();
    });
  });
  return Object.freeze({
    async preparePairLoopBoundary() {
      if (settled || pairLoopBoundaryPrepared || pairLoopBoundaryMarked) {
        fail('performance environment pair-loop boundary preparation is invalid');
      }
      pairLoopBoundaryPrepared = true;
      await new Promise((resolve, reject) => {
        const onError = (error) => reject(error);
        const onMessage = (message) => {
          if (message?.kind !== 'pair-loop-boundary-prepared') return;
          worker.off('error', onError);
          worker.off('message', onMessage);
          resolve();
        };
        worker.once('error', onError);
        worker.on('message', onMessage);
        worker.postMessage({ kind: 'prepare-pair-loop-boundary' });
      });
    },
    async markPairLoopBoundary() {
      if (settled || !pairLoopBoundaryPrepared || pairLoopBoundaryMarked) {
        fail('performance environment pair-loop boundary is invalid');
      }
      pairLoopBoundaryMarked = true;
      return new Promise((resolve, reject) => {
        const onError = (error) => reject(error);
        const onMessage = (message) => {
          if (message?.kind !== 'pair-loop-boundary-recorded') return;
          worker.off('error', onError);
          worker.off('message', onMessage);
          if (!Number.isFinite(message.observedAt) || message.observedAt < 0) {
            reject(new Error('performance environment pair-loop boundary acknowledgement has an invalid timestamp'));
            return;
          }
          resolve(message.observedAt);
        };
        worker.once('error', onError);
        worker.on('message', onMessage);
        worker.postMessage({ kind: 'pair-loop-boundary' });
      });
    },
    async stop(outputDirectory) {
      if (settled) fail('performance environment monitor cannot stop more than once');
      settled = true;
      worker.postMessage({ kind: 'stop' });
      const rawRows = await stopped;
      const capture = createPerformanceExperimentEnvironmentCapture({
        experimentId,
        sourceSha,
        policyHash: PERFORMANCE_POLICY_HASH,
        scopeKind: 'experiment',
        rawKinds: [{
          rawKind: 'environment-observation',
          rows: rawRows.map((row) => ({ ...binding, ...row }))
        }]
      });
      const capturePath = path.join(outputDirectory, PERFORMANCE_EXPERIMENT_ENVIRONMENT_CAPTURE);
      await fs.mkdir(path.dirname(capturePath), { recursive: true });
      await fs.writeFile(capturePath, `${stableStringify(capture)}\n`, { encoding: 'utf8', flag: 'wx' });
      const index = createPerformanceCaptureIndex({
        schemaVersion: 1,
        experimentId,
        captureKind: 'experiment-environment',
        entryCount: 1,
        entries: [{
          scopeKind: 'experiment',
          scopeId: experimentId,
          relativePath: PERFORMANCE_EXPERIMENT_ENVIRONMENT_CAPTURE,
          checksum: capture.checksum
        }]
      });
      const indexPath = path.join(outputDirectory, PERFORMANCE_EXPERIMENT_ENVIRONMENT_INDEX);
      await fs.writeFile(indexPath, `${stableStringify(index)}\n`, { encoding: 'utf8', flag: 'wx' });
      await fs.rm(liveCapturePath, { force: true });
      await worker.terminate();
      return Object.freeze({ capture, capturePath, index, indexPath });
    }
  });
}

const GENERIC_TRANSPORT_CHILD_SOURCE = [
  "const input = JSON.parse(process.env.PRISMGB_GENERIC_TRANSPORT_INPUT);",
  'const observedAt = Number(process.hrtime.bigint()) / 1_000_000_000;',
  'process.stdout.write(JSON.stringify({',
  '  pid: process.pid,',
  '  parentPid: process.ppid,',
  '  cwd: process.cwd(),',
  '  executable: process.execPath,',
  '  observedAt,',
  '  executionId: input.executionId,',
  '  externalExecutionId: input.externalExecutionId,',
  '  operationMarker: input.operationMarker,',
  '  preloadEchoLaunchId: input.operationMarker,',
  '  rendererEchoLaunchId: input.operationMarker,',
  '  transportId: input.transportId,',
  '  observationBoundaryId: input.observationBoundaryId',
  '}));'
].join('\n');

function runGenericTransportProbe({ cwd, baseEnvironment, experimentId, sourceSha, clock, transportSpawn = spawnSync }) {
  const operationMarker = crypto.randomUUID();
  const executionId = crypto.randomUUID();
  const externalExecutionId = crypto.randomUUID();
  const transportId = crypto.randomUUID();
  const observationBoundaryId = crypto.randomUUID();
  const input = { operationMarker, executionId, externalExecutionId, transportId, observationBoundaryId };
  const start = readClock(clock);
  const result = transportSpawn(process.execPath, ['--input-type=module', '--eval', GENERIC_TRANSPORT_CHILD_SOURCE], {
    cwd,
    env: {
      ...baseEnvironment,
      PRISMGB_GENERIC_TRANSPORT_INPUT: JSON.stringify(input)
    },
    encoding: 'utf8',
    stdio: 'pipe',
    windowsHide: true
  });
  const stdout = readCommandOutput(result, 'generic transport child');
  const end = readClock(clock);
  let observation;
  try {
    observation = JSON.parse(stdout);
  } catch (error) {
    fail(`generic transport child did not return exact JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (result.pid !== observation.pid || result.status !== 0 || result.signal !== null
    || observation.executionId !== executionId || observation.externalExecutionId !== externalExecutionId
    || observation.operationMarker !== operationMarker
    || observation.preloadEchoLaunchId !== operationMarker
    || observation.rendererEchoLaunchId !== operationMarker
    || observation.transportId !== transportId
    || observation.observationBoundaryId !== observationBoundaryId) {
    fail('generic transport child did not preserve its sealed execution, marker, and transport identity');
  }
  const closure = Object.freeze({
    closed: true,
    stdoutDrained: true,
    stderrDrained: true,
    inputClosed: true,
    exit: Object.freeze({ code: result.status, durationMs: (end - start) * 1000 }),
    zeroSurvivors: true
  });
  const entry = Object.freeze({
    sequence: 1,
    operationId: 'generic-transport-spawn',
    start,
    end,
    outcome: 'completed',
    executionIdentity: Object.freeze({ externalExecutionId, executionId }),
    markerIdentity: Object.freeze({
      operationMarker,
      launchId: operationMarker,
      preloadEchoLaunchId: observation.preloadEchoLaunchId,
      rendererEchoLaunchId: observation.rendererEchoLaunchId
    }),
    transportIdentity: Object.freeze({ transportId, observationBoundaryId }),
    transportClosureEnd: end
  });
  const binding = {
    sourceSha,
    policyHash: PERFORMANCE_POLICY_HASH,
    experimentId,
    experimentRole: null,
    scopeKind: 'ledger-operation',
    scopeId: 1,
    captureKind: 'transport',
    ledgerSequence: 1,
    operationId: 'generic-transport-spawn'
  };
  const rawIdentity = { pid: observation.pid, creationIdentity: externalExecutionId };
  const processIdentity = `external:${observation.pid}:${externalExecutionId}`;
  const captureRows = [{
    ...binding,
    observationOrdinal: 1,
    observedAt: observation.observedAt,
    observationKind: 'membership',
    observationSource: 'generic-transport-child',
    adapterId: 'external-membership-v1',
    subjectKind: 'transport-child',
    pid: observation.pid,
    creationIdentity: externalExecutionId,
    processIdentity,
    rawAdapterKind: 'external-process-membership',
    rawIdentity,
    rawMembership: {
      spawnBoundary: { runnerStart: start, childObservedAt: observation.observedAt },
      rendererEvaluation: {
        preloadEchoLaunchId: observation.preloadEchoLaunchId,
        rendererEchoLaunchId: observation.rendererEchoLaunchId
      },
      ancestry: { pid: observation.pid, parentPid: observation.parentPid },
      processGroup: { detached: false, platform: process.platform },
      job: null,
      pathIdentity: { cwd: observation.cwd, executable: observation.executable }
    },
    processClass: 'application-renderer',
    ownership: 'application-owned',
    alive: true
  }, {
    ...binding,
    observationOrdinal: 2,
    observedAt: observation.observedAt,
    observationKind: 'health',
    observationSource: 'generic-transport-child',
    adapterId: 'external-health-v1',
    subjectKind: 'transport-child',
    pid: observation.pid,
    creationIdentity: externalExecutionId,
    processIdentity,
    rawAdapterKind: 'external-process-health',
    rawIdentity,
    rawHealth: { alive: true, status: 'reported', exitObservation: null },
    processClass: 'application-renderer',
    ownership: 'application-owned',
    alive: true,
    healthState: 'live'
  }, {
    ...binding,
    observationOrdinal: 3,
    observedAt: end,
    observationKind: 'closure',
    observationSource: 'generic-transport-parent',
    adapterId: 'external-closure-v1',
    subjectKind: 'transport-child',
    pid: observation.pid,
    creationIdentity: externalExecutionId,
    processIdentity,
    rawAdapterKind: 'external-process-closure',
    rawIdentity,
    rawClosure: { terminalStatus: 'closed', exitCode: result.status, signal: result.signal, zeroSurvivors: true },
    processClass: 'application-renderer',
    ownership: 'application-owned',
    alive: false,
    closureState: 'closed'
  }];
  return Object.freeze({ entry, closure, observationBoundaryId, captureRows });
}

async function persistGenericTransportCapture({ outputDirectory, experimentId, experimentRole, sourceSha, probe }) {
  const rows = probe.captureRows.map((row) => ({ ...row, experimentRole }));
  const capture = createPerformanceTransportCapture({
    experimentId,
    sourceSha,
    policyHash: PERFORMANCE_POLICY_HASH,
    captureKind: 'transport',
    ledgerSequence: 1,
    operationId: 'generic-transport-spawn',
    observationBoundaryId: probe.observationBoundaryId,
    rawKinds: [{ rawKind: 'process-observation', rows }]
  });
  const capturePath = path.join(outputDirectory, PERFORMANCE_TRANSPORT_CAPTURE_DIRECTORY, 'generic.json');
  await fs.mkdir(path.dirname(capturePath), { recursive: true });
  await fs.writeFile(capturePath, `${stableStringify(capture)}\n`, { encoding: 'utf8', flag: 'wx' });
  return Object.freeze({ capture, capturePath });
}

async function persistPerformanceLedgerPrefix({ outputDirectory, genericProbe, commandLedger }) {
  const buildEntries = commandLedger.entries.map((entry, index) => Object.freeze({
    sequence: index + 2,
    operationId: entry.operationId,
    start: entry.start,
    end: entry.end,
    buildId: entry.buildId,
    closure: entry.closure,
    outcome: 'completed'
  }));
  const entries = Object.freeze([genericProbe.entry, ...buildEntries]);
  const ledgerPath = path.join(outputDirectory, PERFORMANCE_LEDGER);
  await fs.writeFile(ledgerPath, `${stableStringify(entries)}\n`, { encoding: 'utf8', flag: 'wx' });
  return Object.freeze({ entries, ledgerPath });
}

export async function finalizePerformancePreLoopBoundary({ outputDirectory, role }) {
  const ledger = await readPerformanceArrayArtifact(outputDirectory, PERFORMANCE_LEDGER, 'semantic performance ledger');
  const expectedLength = role === 'reference-comparison' ? 6 : 5;
  if (ledger.length !== expectedLength || !Number.isFinite(ledger.at(-1)?.end)) {
    fail('performance pre-loop ledger does not have the exact sealed prefix');
  }
  for (const [index, entry] of ledger.entries()) {
    if (!Number.isFinite(entry.start) || !Number.isFinite(entry.end) || entry.start < 0 || entry.end < entry.start
      || entry.sequence !== index + 1 || (index > 0 && entry.start < ledger[index - 1].end)) {
      fail('performance pre-loop ledger does not retain monotonic observed operation boundaries');
    }
  }
  let qualificationCapture = null;
  if (role === 'reference-comparison') {
    const existing = await readPerformanceArtifact(
      outputDirectory,
      PERFORMANCE_QUALIFICATION_CAPTURE,
      'qualification capture'
    );
    qualificationCapture = createPerformanceQualificationCapture({
      experimentId: existing.experimentId,
      sourceSha: existing.sourceSha,
      policyHash: existing.policyHash,
      captureKind: existing.captureKind,
      ledgerSequence: existing.ledgerSequence,
      observationBoundaryId: existing.observationBoundaryId,
      captureBody: existing.captureBody,
      captureBodyChecksum: existing.captureBodyChecksum,
      rawKinds: existing.rawKinds
    });
    if (qualificationCapture.checksum !== existing.checksum) {
      fail('qualification capture changed after its pre-loop producer sealed it');
    }
    const qualificationIndex = await readPerformanceArtifact(
      outputDirectory,
      PERFORMANCE_QUALIFICATION_INDEX,
      'qualification capture index'
    );
    if (qualificationIndex.entryCount !== 1 || qualificationIndex.entries?.length !== 1
      || qualificationIndex.entries[0].checksum !== qualificationCapture.checksum
      || qualificationIndex.entries[0].relativePath !== PERFORMANCE_QUALIFICATION_CAPTURE) {
      fail('qualification capture index does not retain the producer-sealed checksum');
    }
    const cleanup = qualificationCapture.captureBody.cleanup;
    const terminal = ledger.at(-1);
    const terminalEnds = [
      terminal.end,
      terminal.applicationDescendantClosureEnd,
      cleanup.applicationDescendantClosureEnd,
      cleanup.brokerDisposeEnd,
      cleanup.rootExitObservedAt,
      cleanup.terminalClosureEnd
    ];
    if (terminalEnds.some((value) => !Number.isFinite(value) || value !== terminal.end)
      || terminal.capabilityEvidence?.captureBodyChecksum !== qualificationCapture.captureBodyChecksum) {
      fail('qualification cleanup and ledger do not retain one actual terminal observation');
    }
  } else if (ledger.at(-1).applicationDescendantClosureEnd !== ledger.at(-1).end) {
    fail('Electron transport cleanup does not retain its actual ledger end');
  }
  const observedEnd = Math.max(...ledger.flatMap((entry) => [
    entry.end,
    ...['applicationDescendantClosureEnd', 'transportClosureEnd'].flatMap((field) => (
      Number.isFinite(entry[field]) ? [entry[field]] : []
    ))
  ]));
  return Object.freeze({
    ledger: Object.freeze(ledger),
    qualificationCapture,
    observedEnd,
    backends: Object.freeze(qualificationCapture?.captureBody.selectionResult.qualificationState === 'qualified-webgpu'
      ? ['canvas2d', 'webgpu']
      : ['canvas2d'])
  });
}

function backendArtifactFile(baseFile, backend) {
  return backend === 'canvas2d' ? baseFile : baseFile.replace(/\.json$/, `-${backend}.json`);
}

function createRuntimeCaptureProvenance({ sourceSha, experimentId, role, environment }) {
  const analysisSha256 = PERFORMANCE_BASELINE_POLICY.analysisSha256;
  if (environment.GITHUB_ACTIONS === 'true') {
    const required = {
      repository: environment.GITHUB_REPOSITORY,
      workflowRef: environment.GITHUB_WORKFLOW_REF,
      workflowRunId: environment.GITHUB_RUN_ID,
      eventName: environment.GITHUB_EVENT_NAME,
      jobId: environment.GITHUB_JOB,
      artifactName: environment.PRISMGB_PERFORMANCE_ARTIFACT_NAME
    };
    for (const [key, value] of Object.entries(required)) {
      if (typeof value !== 'string' || value.length === 0) fail(`GitHub capture provenance requires ${key}`);
    }
    const workflowRunAttempt = Number(environment.GITHUB_RUN_ATTEMPT);
    if (!Number.isSafeInteger(workflowRunAttempt) || workflowRunAttempt <= 0) {
      fail('GitHub capture provenance requires a positive GITHUB_RUN_ATTEMPT');
    }
    return Object.freeze({
      provider: 'github-actions',
      sourceSha,
      analysisSha256,
      repository: required.repository,
      workflowRef: required.workflowRef,
      workflowRunId: required.workflowRunId,
      workflowRunAttempt,
      eventName: required.eventName,
      producer: Object.freeze({
        jobId: required.jobId,
        targetId: environment.PRISMGB_TARGET_ID ?? null,
        artifactName: required.artifactName
      })
    });
  }
  return Object.freeze({
    provider: 'local',
    sourceSha,
    analysisSha256,
    captureSessionId: experimentId,
    producer: Object.freeze({
      role: `performance-${role}`,
      targetId: environment.PRISMGB_TARGET_ID ?? null,
      reportSetId: experimentId
    })
  });
}

function hasExactKeys(value, expectedKeys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const actualKeys = Object.keys(value).sort(compareCodeUnitStrings);
  return actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === [...expectedKeys].sort(compareCodeUnitStrings)[index]);
}

function validateAndCloneBundleManifest(bundle, label) {
  if (!hasExactKeys(bundle, ['sha256', 'entries']) ||
    typeof bundle.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(bundle.sha256) ||
    !Array.isArray(bundle.entries) ||
    bundle.entries.length === 0) {
    fail(`${label} bundle manifest is invalid`);
  }

  let previousPath = null;
  const entries = bundle.entries.map((entry) => {
    if (!hasExactKeys(entry, ['path', 'bytes', 'sha256']) ||
      typeof entry.path !== 'string' ||
      normalizeRelativePath(entry.path) !== entry.path ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0 ||
      typeof entry.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      fail(`${label} bundle entry is invalid`);
    }
    if (previousPath !== null && compareCodeUnitStrings(previousPath, entry.path) >= 0) {
      fail(`${label} bundle entries are not uniquely path-sorted`);
    }
    previousPath = entry.path;
    return Object.freeze({ path: entry.path, bytes: entry.bytes, sha256: entry.sha256 });
  });
  if (createSha256(entries) !== bundle.sha256) {
    fail(`${label} bundle aggregate hash is invalid`);
  }
  return Object.freeze({ sha256: bundle.sha256, entries: Object.freeze(entries) });
}

export function createBuildManifestBody({ sourceSha, variants } = {}) {
  if (typeof sourceSha !== 'string' || !/^[a-f0-9]{40}$/.test(sourceSha)) {
    fail('build manifest sourceSha is invalid');
  }
  if (!Array.isArray(variants) || variants.length !== PERFORMANCE_BUILD_VARIANTS.length) {
    fail('build manifest variants are invalid');
  }

  const normalizedVariants = PERFORMANCE_BUILD_VARIANTS.map((expected, index) => {
    const variant = variants[index];
    if (!hasExactKeys(variant, ['id', 'harness', 'instrumentation', 'bundle']) ||
      variant.id !== expected.id ||
      variant.harness !== expected.harness ||
      variant.instrumentation !== expected.instrumentation) {
      fail('build manifest variants do not match the registered order and flags');
    }
    return Object.freeze({
      id: variant.id,
      harness: variant.harness,
      instrumentation: variant.instrumentation,
      bundle: validateAndCloneBundleManifest(variant.bundle, variant.id)
    });
  });

  return Object.freeze({
    schemaVersion: 2,
    sourceSha,
    variants: Object.freeze(normalizedVariants)
  });
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function assertUuid(value, label) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) fail(`${label} is invalid`);
}

function performanceLaunchAuthorityBody({ sourceSha, policyHash, experimentId, experimentRole, pairPlanChecksum, slots }) {
  return {
    schemaVersion: 2,
    sourceSha,
    policyHash,
    experimentId,
    experimentRole,
    pairPlanChecksum,
    slots
  };
}

function performancePreLoopAuthoritySlot(ledgerSequence, createUuid) {
  const operationMarker = createUuid();
  const executionId = createUuid();
  const externalExecutionId = createUuid();
  assertUuid(operationMarker, 'pre-loop authority operation marker');
  assertUuid(executionId, 'pre-loop authority execution ID');
  assertUuid(externalExecutionId, 'pre-loop authority external execution ID');
  return Object.freeze({
    ledgerSequence,
    buildVariant: 'harness-control',
    operationMarker,
    launchId: operationMarker,
    executionId,
    externalExecutionId,
    observationBoundaryId: operationMarker
  });
}

export function createPerformancePreLoopAuthority({
  sourceSha,
  policyHash,
  experimentId,
  experimentRole,
  createUuid = () => String(crypto.randomUUID())
} = /** @type {any} */ ({})) {
  if (typeof sourceSha !== 'string' || !/^[a-f0-9]{40}$/.test(sourceSha)) {
    fail('pre-loop authority sourceSha is invalid');
  }
  if (typeof policyHash !== 'string' || !/^[a-f0-9]{64}$/.test(policyHash)) {
    fail('pre-loop authority policyHash is invalid');
  }
  assertUuid(experimentId, 'pre-loop authority experiment ID');
  if (experimentRole !== 'ci-integrity' && experimentRole !== 'reference-comparison') {
    fail('pre-loop authority experimentRole is invalid');
  }
  if (typeof createUuid !== 'function') fail('pre-loop authority UUID factory is invalid');
  const transport = performancePreLoopAuthoritySlot(5, createUuid);
  const qualification = experimentRole === 'reference-comparison'
    ? performancePreLoopAuthoritySlot(6, createUuid)
    : null;
  const identities = [transport, ...(qualification === null ? [] : [qualification])]
    .flatMap((slot) => [slot.operationMarker, slot.executionId, slot.externalExecutionId]);
  if (new Set(identities).size !== identities.length) {
    fail('pre-loop authority runtime identities must be globally unique');
  }
  const body = {
    schemaVersion: 1,
    sourceSha,
    policyHash,
    experimentId,
    experimentRole,
    transport,
    qualification
  };
  return Object.freeze({ ...body, checksum: createSha256(body) });
}

export function validatePerformancePreLoopAuthority(value) {
  if (!hasExactKeys(value, [
    'schemaVersion', 'sourceSha', 'policyHash', 'experimentId', 'experimentRole',
    'transport', 'qualification', 'checksum'
  ]) || value.schemaVersion !== 1 ||
    typeof value.sourceSha !== 'string' || !/^[a-f0-9]{40}$/.test(value.sourceSha) ||
    typeof value.policyHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.policyHash) ||
    !UUID_PATTERN.test(value.experimentId) ||
    !['ci-integrity', 'reference-comparison'].includes(value.experimentRole) ||
    typeof value.checksum !== 'string' || !/^[a-f0-9]{64}$/.test(value.checksum)) {
    fail('pre-loop authority is invalid');
  }
  const validateSlot = (slot, expectedSequence, label) => {
    if (!hasExactKeys(slot, [
      'ledgerSequence', 'buildVariant', 'operationMarker', 'launchId', 'executionId',
      'externalExecutionId', 'observationBoundaryId'
    ]) || slot.ledgerSequence !== expectedSequence || slot.buildVariant !== 'harness-control' ||
      slot.launchId !== slot.operationMarker || slot.observationBoundaryId !== slot.operationMarker) {
      fail(`${label} slot is invalid`);
    }
    for (const [key, identity] of Object.entries({
      operationMarker: slot.operationMarker,
      executionId: slot.executionId,
      externalExecutionId: slot.externalExecutionId
    })) assertUuid(identity, `${label} ${key}`);
    return Object.freeze({ ...slot });
  };
  const transport = validateSlot(value.transport, 5, 'transport authority');
  const qualification = value.qualification === null
    ? null
    : validateSlot(value.qualification, 6, 'qualification authority');
  if ((value.experimentRole === 'reference-comparison') !== (qualification !== null)) {
    fail('pre-loop qualification authority does not match the experiment role');
  }
  const identities = [transport, ...(qualification === null ? [] : [qualification])]
    .flatMap((slot) => [slot.operationMarker, slot.executionId, slot.externalExecutionId]);
  if (new Set(identities).size !== identities.length) {
    fail('pre-loop authority runtime identities must be globally unique');
  }
  const body = {
    schemaVersion: 1,
    sourceSha: value.sourceSha,
    policyHash: value.policyHash,
    experimentId: value.experimentId,
    experimentRole: value.experimentRole,
    transport,
    qualification
  };
  if (value.checksum !== createSha256(body)) fail('pre-loop authority checksum is invalid');
  return Object.freeze({ ...body, checksum: value.checksum });
}

/**
 * @param {{
 *   sourceSha: string,
 *   policyHash: string,
 *   experimentRole: 'ci-integrity' | 'reference-comparison',
 *   pairPlan: object,
 *   createUuid?: () => string
 * }} options
 */
export function createPerformanceLaunchAuthority({
  sourceSha,
  policyHash,
  experimentRole,
  pairPlan: pairPlanInput,
  createUuid = () => String(crypto.randomUUID())
} = /** @type {any} */ ({})) {
  if (typeof sourceSha !== 'string' || !/^[a-f0-9]{40}$/.test(sourceSha)) {
    fail('launch authority sourceSha is invalid');
  }
  if (typeof policyHash !== 'string' || !/^[a-f0-9]{64}$/.test(policyHash)) {
    fail('launch authority policyHash is invalid');
  }
  if (experimentRole !== 'ci-integrity' && experimentRole !== 'reference-comparison') {
    fail('launch authority experimentRole is invalid');
  }
  if (typeof createUuid !== 'function') fail('launch authority UUID factory is invalid');
  const pairPlan = validatePerformancePairPlan(pairPlanInput);
  if (pairPlan.backend === 'webgpu' && experimentRole !== 'reference-comparison') {
    fail('WebGPU launch authority requires a selected-reference experiment');
  }
  const slots = [];
  for (const pair of pairPlan.pairs) {
    for (const attempt of pair.attempts) {
      for (const launch of attempt.launches) {
        const externalExecutionId = createUuid();
        assertUuid(externalExecutionId, 'launch authority external execution ID');
        const common = {
          metricSessionId: attempt.metricSessionId,
          comparisonKind: pair.comparisonKind,
          backend: pair.backend,
          pairIndex: pair.pairIndex,
          attemptIndex: attempt.attemptIndex,
          comparisonSide: launch.comparisonSide,
          buildVariant: launch.buildVariant,
          externalExecutionId
        };
        if (launch.buildVariant === 'production') {
          slots.push(Object.freeze({
            ...common,
            observationBoundaryId: `performance-window:${externalExecutionId}`
          }));
        } else {
          const launchId = createUuid();
          assertUuid(launchId, 'launch authority launch ID');
          slots.push(Object.freeze({
            ...common,
            observationBoundaryId: launchId,
            launchId,
            executionId: launchId
          }));
        }
      }
    }
  }
  const body = performanceLaunchAuthorityBody({
    sourceSha,
    policyHash,
    experimentId: pairPlan.experimentId,
    experimentRole,
    pairPlanChecksum: pairPlan.checksum,
    slots: Object.freeze(slots)
  });
  return Object.freeze({ ...body, checksum: createSha256(body) });
}

export function validatePerformanceLaunchAuthority(value, pairPlanInput) {
  if (!hasExactKeys(value, [
    'schemaVersion', 'sourceSha', 'policyHash', 'experimentId', 'experimentRole',
    'pairPlanChecksum', 'slots', 'checksum'
  ]) || value.schemaVersion !== 2 ||
    typeof value.sourceSha !== 'string' || !/^[a-f0-9]{40}$/.test(value.sourceSha) ||
    typeof value.policyHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.policyHash) ||
    !['ci-integrity', 'reference-comparison'].includes(value.experimentRole) ||
    typeof value.checksum !== 'string' || !/^[a-f0-9]{64}$/.test(value.checksum) ||
    !Array.isArray(value.slots)) {
    fail('launch authority is invalid');
  }
  const pairPlan = validatePerformancePairPlan(pairPlanInput);
  if (value.experimentId !== pairPlan.experimentId || value.pairPlanChecksum !== pairPlan.checksum) {
    fail('launch authority does not match its pair plan');
  }
  const expectedSlotCount = pairPlan.pairs.reduce(
    (count, pair) => count + pair.attempts.reduce((attemptCount, attempt) => attemptCount + attempt.launches.length, 0),
    0
  );
  if (value.slots.length !== expectedSlotCount) {
    fail(`launch authority must contain exactly ${expectedSlotCount} preallocated attempt slots`);
  }
  if (pairPlan.backend === 'webgpu' && value.experimentRole !== 'reference-comparison') {
    fail('WebGPU launch authority requires a selected-reference experiment');
  }
  const slots = [];
  const identities = new Set();
  let slotOffset = 0;
  for (const pair of pairPlan.pairs) {
    for (const attempt of pair.attempts) {
      for (const launch of attempt.launches) {
        const slot = value.slots[slotOffset];
        const commonKeys = [
          'metricSessionId', 'comparisonKind', 'backend', 'pairIndex', 'attemptIndex',
          'comparisonSide', 'buildVariant', 'externalExecutionId', 'observationBoundaryId'
        ];
        const harness = launch.buildVariant !== 'production';
        if (!hasExactKeys(slot, harness ? [...commonKeys, 'launchId', 'executionId'] : commonKeys)) {
          fail(`launch authority slot ${slotOffset + 1} has an invalid shape`);
        }
        const expected = {
          metricSessionId: attempt.metricSessionId,
          comparisonKind: pair.comparisonKind,
          backend: pair.backend,
          pairIndex: pair.pairIndex,
          attemptIndex: attempt.attemptIndex,
          comparisonSide: launch.comparisonSide,
          buildVariant: launch.buildVariant
        };
        for (const [key, expectedValue] of Object.entries(expected)) {
          if (slot[key] !== expectedValue) fail(`launch authority slot ${slotOffset + 1}.${key} is invalid`);
        }
        const expectedObservationBoundaryId = harness
          ? slot.launchId
          : `performance-window:${slot.externalExecutionId}`;
        if (slot.observationBoundaryId !== expectedObservationBoundaryId ||
          (harness && slot.executionId !== slot.launchId)) {
          fail(`launch authority slot ${slotOffset + 1} derived identity is invalid`);
        }
        assertUuid(slot.externalExecutionId, `launch authority slot ${slotOffset + 1} external execution ID`);
        for (const identity of new Set([slot.externalExecutionId, ...(harness ? [slot.launchId, slot.executionId] : [])])) {
          assertUuid(identity, `launch authority slot ${slotOffset + 1} identity`);
          if (identities.has(identity)) fail('launch authority runtime identities must be globally unique');
          identities.add(identity);
        }
        slots.push(Object.freeze({ ...slot }));
        slotOffset += 1;
      }
    }
  }
  const body = performanceLaunchAuthorityBody({
    sourceSha: value.sourceSha,
    policyHash: value.policyHash,
    experimentId: value.experimentId,
    experimentRole: value.experimentRole,
    pairPlanChecksum: value.pairPlanChecksum,
    slots: Object.freeze(slots)
  });
  if (value.checksum !== createSha256(body)) fail('launch authority checksum is invalid');
  return Object.freeze({ ...body, checksum: value.checksum });
}

export function createPerformanceRunJoinFromAuthority({
  authority,
  slot,
  runtimeIdentity,
  ledgerSequence,
  ordinal
} = {}) {
  if (!authority || typeof authority !== 'object' || !Array.isArray(authority.slots) ||
    !authority.slots.some((candidate) => stableStringify(candidate) === stableStringify(slot))) {
    fail('run join requires one sealed launch authority slot');
  }
  if (!runtimeIdentity || typeof runtimeIdentity !== 'object') fail('run join runtime identity is invalid');
  if (!Number.isSafeInteger(ledgerSequence) || ledgerSequence < 1
    || !Number.isSafeInteger(ordinal) || ordinal < 1) {
    fail('run join ledger sequence and ordinal are invalid');
  }
  const common = {
    sourceSha: authority.sourceSha,
    policyHash: authority.policyHash,
    experimentId: authority.experimentId,
    pairPlanChecksum: authority.pairPlanChecksum,
    ledgerSequence,
    experimentRole: authority.experimentRole,
    metricSessionId: slot.metricSessionId,
    comparisonKind: slot.comparisonKind,
    backend: slot.backend,
    pairIndex: slot.pairIndex,
    attemptIndex: slot.attemptIndex,
    comparisonSide: slot.comparisonSide,
    buildVariant: slot.buildVariant,
    ordinal,
    runId: `performance-run:${authority.experimentId}:${ordinal}`,
    externalExecutionId: slot.externalExecutionId,
    observationBoundaryId: slot.observationBoundaryId
  };
  let join;
  if (slot.buildVariant === 'production') {
    if (!hasExactKeys(runtimeIdentity, ['externalExecutionId', 'browserPid', 'browserCreationTime']) ||
      runtimeIdentity.externalExecutionId !== slot.externalExecutionId) {
      fail('production run join runtime identity does not match its authority slot');
    }
    join = {
      ...common,
      browserPid: runtimeIdentity.browserPid,
      browserCreationTime: runtimeIdentity.browserCreationTime
    };
  } else {
    if (!hasExactKeys(runtimeIdentity, ['externalExecutionId', 'launchId', 'executionId']) ||
      runtimeIdentity.externalExecutionId !== slot.externalExecutionId ||
      runtimeIdentity.launchId !== slot.launchId ||
      runtimeIdentity.executionId !== slot.executionId) {
      fail('harness run join runtime identity does not match its authority slot');
    }
    join = { ...common, launchId: slot.launchId, executionId: slot.executionId };
  }
  return validatePerformanceRunJoin(join);
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
  const bundle = validateAndCloneBundleManifest(variant.bundle, 'production');

  const codeEntries = bundle.entries.filter((entry) => /\.(?:cjs|mjs|js)$/.test(entry.path));
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
      bundleSha256: bundle.sha256
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
  clock = monotonicSeconds,
  preparedSourceSha = null,
  outputDirectoryPrepared = false
} = {}) {
  if (typeof outputDirectory !== 'string' || outputDirectory.length === 0) {
    fail('outputDirectory is required');
  }

  const sourceSha = preparedSourceSha === null
    ? readCleanSourceSha({ cwd, env: baseEnvironment, spawn })
    : preparedSourceSha;
  if (typeof sourceSha !== 'string' || !/^[a-f0-9]{40}$/.test(sourceSha)) {
    fail('prepared build sourceSha is invalid');
  }
  if (typeof outputDirectoryPrepared !== 'boolean') fail('prepared output directory flag is invalid');
  if (!outputDirectoryPrepared) await createEmptyOutputDirectory(outputDirectory);

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
      spawn,
      timeoutMilliseconds: PERFORMANCE_LIMITS.buildSeconds * 1000
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

  const manifest = createBuildManifestBody({ sourceSha, variants });
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

function performanceMetricSessionCaptureKey(pair) {
  return `${pair.pairPlanChecksum}\u0000${pair.metricSessionId}`;
}

function performanceMetricSessionPair(pairPlan, pair, attempt) {
  return {
    experimentId: pairPlan.experimentId,
    pairPlanChecksum: pairPlan.checksum,
    metricSessionId: attempt.metricSessionId,
    comparisonKind: pair.comparisonKind,
    backend: pair.backend,
    pairIndex: pair.pairIndex,
    attemptIndex: attempt.attemptIndex
  };
}

function plannedPerformancePairLaunches(pairPlan, predicate) {
  const expected = [];
  for (const pair of pairPlan.pairs) {
    for (const attempt of pair.attempts) {
      for (const launch of attempt.launches) {
        if (!predicate({ pair, attempt, launch })) continue;
        expected.push(Object.freeze({
          pair: Object.freeze({
            ...performanceMetricSessionPair(pairPlan, pair, attempt),
            comparisonSide: launch.comparisonSide
          }),
          launch: Object.freeze({ ...launch })
        }));
      }
    }
  }
  return Object.freeze(expected);
}

function performancePairBindingFromRunJoin(join) {
  return {
    experimentId: join.experimentId,
    pairPlanChecksum: join.pairPlanChecksum,
    metricSessionId: join.metricSessionId,
    comparisonKind: join.comparisonKind,
    backend: join.backend,
    pairIndex: join.pairIndex,
    attemptIndex: join.attemptIndex,
    comparisonSide: join.comparisonSide
  };
}

/**
 * Binds raw launch captures to the runner-authored immutable pair plan. File
 * discovery order is intentionally discarded: every accepted set is returned
 * in the plan's canonical pair/side order.
 */
export function collectPlannedCaptureSet({ captures, pairPlan: pairPlanInput, label, predicate }) {
  let pairPlan;
  try {
    pairPlan = validatePerformancePairPlan(pairPlanInput);
  } catch (error) {
    fail(`${label} pair plan is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(captures)) fail(`${label} captures must be an array`);
  if (typeof predicate !== 'function') fail(`${label} predicate must be a function`);
  const planned = plannedPerformancePairLaunches(pairPlan, predicate);
  const plannedByKey = new Map(planned.map((entry) => [performancePairCaptureKey(entry.pair), entry]));
  const capturesByKey = new Map();
  for (const entry of captures) {
    if (!entry || typeof entry !== 'object' || !entry.capture || typeof entry.capture !== 'object') {
      fail(`${label} capture entry is invalid`);
    }
    const capture = entry.capture;
    let planned;
    try {
      planned = resolvePerformancePairPlanLaunch(pairPlan, performancePairBindingFromRunJoin(capture.join));
    } catch (error) {
      fail(`${label} capture does not bind one planned launch: ${error instanceof Error ? error.message : String(error)}`);
    }
    const key = performancePairCaptureKey(performancePairBindingFromRunJoin(capture.join));
    const expectedEntry = plannedByKey.get(key);
    if (!expectedEntry || !predicate(planned)) {
      fail(`${label} capture is not expected for this performance experiment`);
    }
    if (capture.join.buildVariant !== planned.launch.buildVariant) {
      fail(`${label} capture build does not match its planned launch side`);
    }
    if (capturesByKey.has(key)) fail(`${label} captures duplicate one planned launch side`);
    capturesByKey.set(key, Object.freeze({ ...entry, planned }));
  }
  const expected = [];
  for (const pair of pairPlan.pairs) {
    if (!predicate({ pair, attempt: pair.attempts[0], launch: pair.attempts[0].launches[0] })) continue;
    let executedAttemptCount = 0;
    let encounteredGap = false;
    for (const attempt of pair.attempts) {
      const entries = attempt.launches.map((launch) => plannedByKey.get(performancePairCaptureKey({
        ...performanceMetricSessionPair(pairPlan, pair, attempt),
        comparisonSide: launch.comparisonSide
      })));
      const presentCount = entries.filter((entry) => entry && capturesByKey.has(performancePairCaptureKey(entry.pair))).length;
      if (presentCount === 0) {
        encounteredGap = true;
        continue;
      }
      if (encounteredGap || presentCount !== attempt.launches.length) {
        fail(`${label} captures must cover a contiguous prefix of complete two-launch attempts`);
      }
      executedAttemptCount += 1;
      expected.push(...entries);
    }
    if (executedAttemptCount === 0) {
      fail(`${label} captures are missing the first planned attempt for one logical pair`);
    }
  }
  if (capturesByKey.size !== expected.length) {
    fail(`${label} captures include an unexpected or incomplete planned attempt`);
  }
  return Object.freeze({
    pairPlan,
    expected,
    captures: Object.freeze(expected.map((entry) => capturesByKey.get(performancePairCaptureKey(entry.pair))))
  });
}

function validateCollectedRunCapture({ capture, sourceSha, manifest, pairPlan, captureKind, label }) {
  if (capture.sourceSha !== sourceSha || capture.experimentId !== pairPlan.experimentId ||
    capture.policyHash !== PERFORMANCE_POLICY_HASH || capture.captureKind !== captureKind ||
    capture.join.sourceSha !== sourceSha || capture.join.pairPlanChecksum !== pairPlan.checksum) {
    fail(`${label} capture identity does not match the runner authority`);
  }
  const variant = manifest.variants.find((entry) => entry.id === capture.join.buildVariant);
  if (!variant) fail(`${label} capture build variant does not exist in the build manifest`);
}

function runCaptureIndexEntry({ capture, relativePath }) {
  return {
    runId: capture.join.runId,
    metricSessionId: capture.join.metricSessionId,
    comparisonKind: capture.join.comparisonKind,
    backend: capture.join.backend,
    pairIndex: capture.join.pairIndex,
    attemptIndex: capture.join.attemptIndex,
    comparisonSide: capture.join.comparisonSide,
    buildVariant: capture.join.buildVariant,
    launchOrdinal: capture.join.ordinal,
    externalExecutionId: capture.join.externalExecutionId,
    observationBoundaryId: capture.join.observationBoundaryId,
    relativePath,
    checksum: capture.checksum
  };
}

async function writeRunCaptureIndex({
  outputDirectory,
  indexFile,
  schemaVersion,
  captureKind,
  sourceSha,
  pairPlan,
  captures
}) {
  const body = {
    schemaVersion,
    experimentId: pairPlan.experimentId,
    captureKind,
    sourceSha,
    policyHash: PERFORMANCE_POLICY_HASH,
    backend: pairPlan.backend,
    pairPlanChecksum: pairPlan.checksum,
    entryCount: captures.length,
    entries: captures.map(runCaptureIndexEntry)
  };
  const index = createPerformanceCaptureIndex(body, {
    experimentId: pairPlan.experimentId,
    sourceSha,
    policyHash: PERFORMANCE_POLICY_HASH,
    backend: pairPlan.backend,
    pairPlanChecksum: pairPlan.checksum
  });
  const indexPath = path.join(outputDirectory, indexFile);
  await fs.writeFile(indexPath, `${stableStringify(index)}\n`, { encoding: 'utf8', flag: 'wx' });
  return Object.freeze({ index, indexPath, captures });
}

export async function collectPerformanceWorkloadCaptures({
  outputDirectory,
  sourceSha,
  manifest,
  pairPlan,
  externalMetricCaptures,
  indexFile: requestedIndexFile
} = {}) {
  const indexFile = requestedIndexFile ?? PERFORMANCE_WORKLOAD_CAPTURE_INDEX;
  if (typeof outputDirectory !== 'string' || outputDirectory.length === 0) {
    fail('workload capture outputDirectory is required');
  }
  if (typeof sourceSha !== 'string' || !/^[a-f0-9]{40}$/.test(sourceSha)) {
    fail('workload capture sourceSha is invalid');
  }
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.variants)) {
    fail('workload capture build manifest is invalid');
  }
  if (!Array.isArray(externalMetricCaptures)) {
    fail('workload capture requires the completed external metric captures');
  }

  const rawCaptures = (await readPerformanceWorkloadCaptures({ outputDirectory }))
    .filter((entry) => entry.capture.join.pairPlanChecksum === pairPlan.checksum);
  const plannedCaptures = collectPlannedCaptureSet({
    captures: rawCaptures,
    pairPlan,
    label: 'instrumentation workload',
    predicate: ({ pair }) => pair.comparisonKind === 'instrumentation-overhead'
  });
  const externalMetricsByPairKey = new Map();
  for (const entry of externalMetricCaptures) {
    if (!entry || typeof entry !== 'object' || !entry.capture || typeof entry.capture !== 'object') {
      fail('workload capture external metric entry is invalid');
    }
    const externalMetric = entry.capture;
    const binding = performancePairBindingFromRunJoin(externalMetric.join);
    const planned = resolvePerformancePairPlanLaunch(plannedCaptures.pairPlan, binding);
    if (planned.pair.comparisonKind !== 'instrumentation-overhead') {
      continue;
    }
    const key = performancePairCaptureKey(binding);
    if (externalMetricsByPairKey.has(key)) {
      fail('workload capture external metrics duplicate one instrumentation planned launch side');
    }
    externalMetricsByPairKey.set(key, externalMetric);
  }
  if (externalMetricsByPairKey.size !== plannedCaptures.captures.length) {
    fail('workload capture external metrics do not cover every instrumentation planned launch side');
  }
  for (const { capture } of plannedCaptures.captures) {
    validateCollectedRunCapture({
      capture,
      sourceSha,
      manifest,
      pairPlan: plannedCaptures.pairPlan,
      captureKind: 'workload',
      label: 'workload'
    });
    if (capture.join.buildVariant !== 'harness-control' && capture.join.buildVariant !== 'instrumented') {
      fail('workload capture must come from a harness build');
    }
    const externalMetric = externalMetricsByPairKey.get(
      performancePairCaptureKey(performancePairBindingFromRunJoin(capture.join))
    );
    if (!externalMetric) {
      fail('workload capture has no external metric transcript for its planned launch side');
    }
    if (stableStringify(externalMetric.join) !== stableStringify(capture.join)) {
      fail('workload capture does not bind the external metric run join');
    }
  }
  return writeRunCaptureIndex({
    outputDirectory,
    indexFile,
    schemaVersion: 9,
    captureKind: 'workload',
    sourceSha,
    pairPlan: plannedCaptures.pairPlan,
    captures: plannedCaptures.captures
  });
}

export async function collectPerformanceSentinelCaptures({
  outputDirectory,
  sourceSha,
  manifest,
  pairPlan,
  indexFile: requestedIndexFile
} = {}) {
  const indexFile = requestedIndexFile ?? PERFORMANCE_SENTINEL_CAPTURE_INDEX;
  if (typeof outputDirectory !== 'string' || outputDirectory.length === 0) {
    fail('sentinel capture outputDirectory is required');
  }
  if (typeof sourceSha !== 'string' || !/^[a-f0-9]{40}$/.test(sourceSha)) {
    fail('sentinel capture sourceSha is invalid');
  }
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.variants)) {
    fail('sentinel capture build manifest is invalid');
  }

  const rawCaptures = (await readPerformanceSentinelCaptures({ outputDirectory }))
    .filter((entry) => entry.capture.join.pairPlanChecksum === pairPlan.checksum);
  const plannedCaptures = collectPlannedCaptureSet({
    captures: rawCaptures,
    pairPlan,
    label: 'external sentinel',
    predicate: ({ pair }) => pair.comparisonKind === 'harness-overhead'
  });
  for (const { capture } of plannedCaptures.captures) {
    validateCollectedRunCapture({
      capture,
      sourceSha,
      manifest,
      pairPlan: plannedCaptures.pairPlan,
      captureKind: 'sentinel',
      label: 'sentinel'
    });
  }
  return writeRunCaptureIndex({
    outputDirectory,
    indexFile,
    schemaVersion: 7,
    captureKind: 'sentinel',
    sourceSha,
    pairPlan: plannedCaptures.pairPlan,
    captures: plannedCaptures.captures
  });
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
  pairPlan,
  indexFile: requestedIndexFile
} = {}) {
  const indexFile = requestedIndexFile ?? PERFORMANCE_EXTERNAL_METRIC_CAPTURE_INDEX;
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
    const key = performancePairCaptureKey(performancePairBindingFromRunJoin(sentinel.join));
    if (sentinelsByPairKey.has(key)) {
      fail('external metric capture sentinel pair sides must be unique');
    }
    sentinelsByPairKey.set(key, sentinel);
  }

  const rawCaptures = (await readPerformanceExternalMetricCaptures({ outputDirectory }))
    .filter((entry) => entry.capture.join.pairPlanChecksum === pairPlan.checksum);
  const plannedCaptures = collectPlannedCaptureSet({
    captures: rawCaptures,
    pairPlan,
    label: 'external metric',
    predicate: () => true
  });
  for (const { capture } of plannedCaptures.captures) {
    validateCollectedRunCapture({
      capture,
      sourceSha,
      manifest,
      pairPlan: plannedCaptures.pairPlan,
      captureKind: 'external-metric',
      label: 'external metric'
    });
    if (capture.join.comparisonKind === 'harness-overhead') {
      const sentinel = sentinelsByPairKey.get(
        performancePairCaptureKey(performancePairBindingFromRunJoin(capture.join))
      );
      if (!sentinel) {
        fail('external metric capture does not bind a sentinel pair side');
      }
      if (stableStringify(capture.join) !== stableStringify(sentinel.join)) {
        fail('external metric capture does not bind the sentinel run join');
      }
    }
  }
  return writeRunCaptureIndex({
    outputDirectory,
    indexFile,
    schemaVersion: 4,
    captureKind: 'external-metric',
    sourceSha,
    pairPlan: plannedCaptures.pairPlan,
    captures: plannedCaptures.captures
  });
}

/**
 * Joins one checksum-bound external metric adapter session to the two planned
 * raw metric transcripts it owned. This is intentionally raw session evidence:
 * later evidence assembly remains responsible for semantic experiment closure.
 *
 * @param {{
 *   outputDirectory: string,
 *   sourceSha: string,
 *   externalMetricCaptures: ReadonlyArray<{ capture: object }>,
 *   pairPlan: object
 * }} options
 */
export async function collectPerformanceMetricSessionCaptures({
  outputDirectory,
  sourceSha,
  externalMetricCaptures,
  pairPlan: pairPlanInput,
  indexFile: requestedIndexFile
} = {}) {
  const indexFile = requestedIndexFile ?? PERFORMANCE_METRIC_SESSION_CAPTURE_INDEX;
  if (typeof outputDirectory !== 'string' || outputDirectory.length === 0) {
    fail('metric session capture outputDirectory is required');
  }
  if (typeof sourceSha !== 'string' || !/^[a-f0-9]{40}$/.test(sourceSha)) {
    fail('metric session capture sourceSha is invalid');
  }
  if (!Array.isArray(externalMetricCaptures)) {
    fail('metric session capture requires the completed external metric captures');
  }

  let pairPlan;
  try {
    pairPlan = validatePerformancePairPlan(pairPlanInput);
  } catch (error) {
    fail(`metric session capture pair plan is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }

  const plannedExternalCaptures = collectPlannedCaptureSet({
    captures: externalMetricCaptures,
    pairPlan,
    label: 'metric session external metric',
    predicate: () => true
  });
  const expectedAttempts = [];
  const expectedAttemptKeys = new Set();
  for (const entry of plannedExternalCaptures.expected) {
    const key = performanceMetricSessionCaptureKey(entry.pair);
    if (expectedAttemptKeys.has(key)) continue;
    expectedAttemptKeys.add(key);
    const pair = pairPlan.pairs.find((candidate) =>
      candidate.comparisonKind === entry.pair.comparisonKind &&
      candidate.pairIndex === entry.pair.pairIndex
    );
    const attempt = pair?.attempts.find((candidate) => candidate.attemptIndex === entry.pair.attemptIndex);
    if (!pair || !attempt) fail('metric session external metric does not resolve one planned attempt');
    expectedAttempts.push({ pair, attempt, binding: performanceMetricSessionPair(pairPlan, pair, attempt) });
  }

  const rawCaptures = (await readPerformanceMetricSessionCaptures({ outputDirectory }))
    .filter((entry) => entry.capture.rawKinds[0].rows[0].pairPlanChecksum === pairPlan.checksum);
  if (rawCaptures.length !== expectedAttempts.length) {
    fail(`expected exactly ${expectedAttempts.length} metric session captures, found ${rawCaptures.length}`);
  }
  const sessionsByKey = new Map();
  for (const entry of rawCaptures) {
    const capture = entry.capture;
    if (capture.sourceSha !== sourceSha || capture.experimentId !== pairPlan.experimentId ||
      capture.policyHash !== PERFORMANCE_POLICY_HASH || capture.captureKind !== 'metric-session') {
      fail('metric session capture identity does not match the runner authority');
    }
    const key = performanceMetricSessionCaptureKey({
      pairPlanChecksum: pairPlan.checksum,
      metricSessionId: capture.join.metricSessionId
    });
    const plannedAttempt = expectedAttempts.find(({ binding }) =>
      binding.metricSessionId === capture.join.metricSessionId &&
      binding.comparisonKind === capture.join.comparisonKind &&
      binding.backend === capture.join.backend &&
      binding.pairIndex === capture.join.pairIndex &&
      binding.attemptIndex === capture.join.attemptIndex
    );
    if (!plannedAttempt) {
      fail('metric session capture does not bind one planned metric session');
    }
    if (sessionsByKey.has(key)) fail('metric session captures duplicate one planned metric session');
    sessionsByKey.set(key, entry);
  }

  const entries = expectedAttempts.map(({ binding: sessionPair }) => {
    const entry = sessionsByKey.get(performanceMetricSessionCaptureKey(sessionPair));
    if (!entry) fail('metric session captures do not cover every planned metric session');
    const capture = entry.capture;
    return {
      metricSessionId: capture.join.metricSessionId,
      comparisonKind: capture.join.comparisonKind,
      backend: capture.join.backend,
      pairIndex: capture.join.pairIndex,
      attemptIndex: capture.join.attemptIndex,
      relativePath: entry.relativePath,
      checksum: capture.checksum
    };
  });
  const body = {
    schemaVersion: 2,
    experimentId: pairPlan.experimentId,
    captureKind: 'metric-session',
    sourceSha,
    policyHash: PERFORMANCE_POLICY_HASH,
    backend: pairPlan.backend,
    pairPlanChecksum: pairPlan.checksum,
    entryCount: entries.length,
    entries
  };
  const index = createPerformanceCaptureIndex(body, {
    experimentId: pairPlan.experimentId,
    sourceSha,
    policyHash: PERFORMANCE_POLICY_HASH,
    backend: pairPlan.backend,
    pairPlanChecksum: pairPlan.checksum
  });
  const indexPath = path.join(outputDirectory, indexFile);
  await fs.writeFile(indexPath, `${stableStringify(index)}\n`, { encoding: 'utf8', flag: 'wx' });
  return Object.freeze({
    index,
    indexPath,
    captures: Object.freeze(expectedAttempts.map(({ binding }) => sessionsByKey.get(
      performanceMetricSessionCaptureKey(binding)
    )))
  });
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
  if (options.buildOnly) {
    const build = await buildPerformanceVariants({
      cwd,
      outputDirectory: options.outputDirectory,
      baseEnvironment,
      spawn,
      platform,
      clock
    });
    return Object.freeze({
      ...build,
      role: options.role,
      selectedHost: options.selectedHost,
      playwrightExecuted: false
    });
  }

  const sourceSha = readCleanSourceSha({ cwd, env: baseEnvironment, spawn });
  await createEmptyOutputDirectory(options.outputDirectory);
  const experimentId = crypto.randomUUID();
  const experimentDeadlineSeconds = resolvePerformanceExperimentDeadline(options.role);
  const environmentMonitor = await startPerformanceEnvironmentMonitor({
    experimentId,
    sourceSha,
    experimentRole: options.role,
    outputDirectory: options.outputDirectory
  });
  const experimentStartedAt = readClock(clock);
  let genericTransport;
  let build;
  try {
    const genericProbe = runGenericTransportProbe({
      cwd,
      baseEnvironment,
      experimentId,
      sourceSha,
      clock
    });
    const genericCapture = await persistGenericTransportCapture({
      outputDirectory: options.outputDirectory,
      experimentId,
      experimentRole: options.role,
      sourceSha,
      probe: genericProbe
    });
    genericTransport = Object.freeze({ probe: genericProbe, ...genericCapture });
    build = await buildPerformanceVariants({
      cwd,
      outputDirectory: options.outputDirectory,
      baseEnvironment,
      spawn,
      platform,
      clock,
      preparedSourceSha: sourceSha,
      outputDirectoryPrepared: true
    });
  } catch (error) {
    await environmentMonitor.stop(options.outputDirectory).catch(() => {});
    throw error;
  }
  const performanceLedgerPrefix = await persistPerformanceLedgerPrefix({
    outputDirectory: options.outputDirectory,
    genericProbe: genericTransport.probe,
    commandLedger: build.commandLedger
  });
  const preLoopAuthority = createPerformancePreLoopAuthority({
    sourceSha: build.manifest.sourceSha,
    policyHash: PERFORMANCE_POLICY_HASH,
    experimentId,
    experimentRole: options.role
  });
  const preLoopAuthorityPath = path.join(options.outputDirectory, PERFORMANCE_PRELOOP_AUTHORITY);
  await fs.writeFile(preLoopAuthorityPath, `${stableStringify(preLoopAuthority)}\n`, { encoding: 'utf8', flag: 'wx' });
  const playwright = resolvePerformancePlaywrightCommand({
    cwd,
    platform,
    environment: baseEnvironment
  });
  const performanceEnvironment = {
    ...baseEnvironment,
    PRISMGB_PERFORMANCE_BUILD_MANIFEST: build.manifestPath,
    PRISMGB_PERFORMANCE_BUILDS_DIRECTORY: build.buildsDirectory,
    PRISMGB_PERFORMANCE_OUTPUT: options.outputDirectory,
    PRISMGB_PERFORMANCE_CAPTURE_OUTPUT: options.outputDirectory,
    PRISMGB_PERFORMANCE_ROLE: options.role,
    PRISMGB_PERFORMANCE_EXPERIMENT_ID: experimentId,
    PRISMGB_PERFORMANCE_PRELOOP_AUTHORITY: preLoopAuthorityPath,
    PRISMGB_PERFORMANCE_LIVE_ENVIRONMENT_CAPTURE: path.join(
      options.outputDirectory,
      PERFORMANCE_LIVE_EXPERIMENT_ENVIRONMENT_CAPTURE
    ),
    PRISMGB_PERF_SELECTED_HOST: options.selectedHost ? '1' : '0',
    PRISMGB_PERFORMANCE_EXPERIMENT_DEADLINE_SECONDS: String(experimentDeadlineSeconds)
  };
  const backendRuns = [];
  let preLoopBoundary;
  let pairLoopStart;
  try {
    runCommand(playwright.command, playwright.args, {
      cwd,
      env: {
        ...performanceEnvironment,
        PRISMGB_PERFORMANCE_EXECUTION_PHASE: 'pre-loop'
      },
      spawn,
      timeoutMilliseconds: experimentDeadlineSeconds * 1000
    });
    await environmentMonitor.preparePairLoopBoundary();
    preLoopBoundary = await finalizePerformancePreLoopBoundary({
      outputDirectory: options.outputDirectory,
      role: options.role
    });
    const monitorPairLoopBoundary = await environmentMonitor.markPairLoopBoundary();
    pairLoopStart = Math.max(preLoopBoundary.observedEnd, monitorPairLoopBoundary);
    for (const backend of preLoopBoundary.backends) {
      const pairPlan = createPerformancePairPlan({ experimentId, backend });
      const pairPlanFile = backendArtifactFile(PERFORMANCE_PAIR_PLAN, backend);
      const pairPlanPath = path.join(options.outputDirectory, pairPlanFile);
      await fs.writeFile(pairPlanPath, `${stableStringify(pairPlan)}\n`, { encoding: 'utf8', flag: 'wx' });
      const launchAuthority = createPerformanceLaunchAuthority({
        sourceSha: build.manifest.sourceSha,
        policyHash: PERFORMANCE_POLICY_HASH,
        experimentRole: options.role,
        pairPlan
      });
      const launchAuthorityFile = backendArtifactFile(PERFORMANCE_LAUNCH_AUTHORITY, backend);
      const launchAuthorityPath = path.join(options.outputDirectory, launchAuthorityFile);
      await fs.writeFile(launchAuthorityPath, `${stableStringify(launchAuthority)}\n`, { encoding: 'utf8', flag: 'wx' });
      backendRuns.push(Object.freeze({
        backend,
        pairPlan,
        pairPlanFile,
        pairPlanPath,
        launchAuthority,
        launchAuthorityFile,
        launchAuthorityPath
      }));
      runCommand(playwright.command, playwright.args, {
        cwd,
        env: {
          ...performanceEnvironment,
          PRISMGB_PERFORMANCE_EXECUTION_PHASE: 'pair-loop',
          PRISMGB_PERFORMANCE_PAIR_PLAN: pairPlanPath,
          PRISMGB_PERFORMANCE_LAUNCH_AUTHORITY: launchAuthorityPath
        },
        spawn,
        timeoutMilliseconds: experimentDeadlineSeconds * 1000
      });
    }
  } catch (error) {
    await environmentMonitor.stop(options.outputDirectory).catch(() => {});
    throw error;
  }
  const experimentElapsedSeconds = readClock(clock) - experimentStartedAt;
  const experimentEnvironment = await environmentMonitor.stop(options.outputDirectory);
  if (experimentElapsedSeconds < 0) {
    fail('performance experiment clock regressed during the Playwright lane');
  }
  if (experimentElapsedSeconds > experimentDeadlineSeconds) {
    fail(`${options.role} performance experiment exceeded its ${experimentDeadlineSeconds}-second deadline`);
  }

  const captureFamilies = [];
  for (const backendRun of backendRuns) {
    const sentinelCapture = await collectPerformanceSentinelCaptures({
      outputDirectory: options.outputDirectory,
      sourceSha: build.manifest.sourceSha,
      manifest: build.manifest,
      pairPlan: backendRun.pairPlan,
      indexFile: backendArtifactFile(PERFORMANCE_SENTINEL_CAPTURE_INDEX, backendRun.backend)
    });
    const externalMetricCapture = await collectPerformanceExternalMetricCaptures({
      outputDirectory: options.outputDirectory,
      sourceSha: build.manifest.sourceSha,
      manifest: build.manifest,
      sentinelCaptures: sentinelCapture.captures,
      pairPlan: backendRun.pairPlan,
      indexFile: backendArtifactFile(PERFORMANCE_EXTERNAL_METRIC_CAPTURE_INDEX, backendRun.backend)
    });
    const workloadCapture = await collectPerformanceWorkloadCaptures({
      outputDirectory: options.outputDirectory,
      sourceSha: build.manifest.sourceSha,
      manifest: build.manifest,
      pairPlan: backendRun.pairPlan,
      externalMetricCaptures: externalMetricCapture.captures,
      indexFile: backendArtifactFile(PERFORMANCE_WORKLOAD_CAPTURE_INDEX, backendRun.backend)
    });
    const metricSessionCapture = await collectPerformanceMetricSessionCaptures({
      outputDirectory: options.outputDirectory,
      sourceSha: build.manifest.sourceSha,
      externalMetricCaptures: externalMetricCapture.captures,
      pairPlan: backendRun.pairPlan,
      indexFile: backendArtifactFile(PERFORMANCE_METRIC_SESSION_CAPTURE_INDEX, backendRun.backend)
    });
    captureFamilies.push(Object.freeze({
      ...backendRun,
      sentinelCapture,
      externalMetricCapture,
      workloadCapture,
      metricSessionCapture
    }));
  }
  const performanceLedger = await readPerformanceArrayArtifact(
    options.outputDirectory,
    PERFORMANCE_LEDGER,
    'semantic performance ledger'
  );
  const experimentEnvironmentIndex = await readPerformanceArtifact(
    options.outputDirectory,
    PERFORMANCE_EXPERIMENT_ENVIRONMENT_INDEX,
    'experiment environment capture index'
  );
  const transportIndex = await readPerformanceArtifact(
    options.outputDirectory,
    PERFORMANCE_TRANSPORT_INDEX,
    'transport capture index'
  );
  const qualificationIndex = options.role === 'reference-comparison'
    ? await readPerformanceArtifact(
      options.outputDirectory,
      PERFORMANCE_QUALIFICATION_INDEX,
      'qualification capture index'
    )
    : null;
  const captureProvenance = createRuntimeCaptureProvenance({
    sourceSha: build.manifest.sourceSha,
    experimentId,
    role: options.role,
    environment: baseEnvironment
  });
  const pairPlans = Object.freeze(backendRuns.map((entry) => entry.pairPlan));
  const pairPlansChecksum = canonicalSha256(pairPlans);
  const semanticAuthority = Object.freeze({
    generatedAt: new Date().toISOString(),
    repository: Object.freeze({ commitSha: build.manifest.sourceSha, dirty: false, branch: null }),
    environment: Object.freeze({ os: platform, arch: process.arch, nodeVersion: process.version, targetId: null }),
    inputs: Object.freeze({
      role: options.role,
      selectedHost: options.selectedHost,
      experimentDeadlineSeconds,
      pairPlansChecksum
    }),
    reset: Object.freeze({ version: 'phase0-cold-launch-reset-v1' }),
    seed: Object.freeze({ pairPlansChecksum })
  });
  const rawCaptureManifest = await writePerformanceRawCaptureManifest({
    outputDirectory: options.outputDirectory,
    mode: options.role === 'ci-integrity' ? 'ci-core' : 'selected-reference',
    finalizationPurpose: 'publication',
    evaluationContext: {
      experimentId,
      experimentRole: options.role,
      sourceSha: build.manifest.sourceSha,
      policyHash: PERFORMANCE_POLICY_HASH
    },
    semanticAuthority,
    evidenceProvenance: { kind: 'runtime-capture', captureProvenance },
    backendFamilies: pairPlans.map((pairPlan) => pairPlan.backend),
    pairPlansChecksum,
    memberReferences: {
      buildManifest: artifactReference(PERFORMANCE_BUILD_MANIFEST, build.manifest),
      productionBundleEvidence: artifactReference(
        PERFORMANCE_PRODUCTION_BUNDLE_EVIDENCE,
        build.productionBundleEvidence
      ),
      buildCommandLedger: artifactReference(PERFORMANCE_COMMAND_LEDGER, build.commandLedger),
      performanceLedger: artifactReference(PERFORMANCE_LEDGER, performanceLedger),
      qualificationEvidence: qualificationIndex === null
        ? null
        : { index: artifactReference(PERFORMANCE_QUALIFICATION_INDEX, qualificationIndex) },
      experimentEvidence: {
        indexes: {
          environment: artifactReference(PERFORMANCE_EXPERIMENT_ENVIRONMENT_INDEX, experimentEnvironmentIndex),
          transport: artifactReference(PERFORMANCE_TRANSPORT_INDEX, transportIndex)
        }
      },
      backendFamilies: captureFamilies.map((family) => ({
        backend: family.backend,
        pairPlan: artifactReference(family.pairPlanFile, family.pairPlan),
        indexes: {
          sentinel: artifactReference(
            backendArtifactFile(PERFORMANCE_SENTINEL_CAPTURE_INDEX, family.backend),
            family.sentinelCapture.index
          ),
          externalMetric: artifactReference(
            backendArtifactFile(PERFORMANCE_EXTERNAL_METRIC_CAPTURE_INDEX, family.backend),
            family.externalMetricCapture.index
          ),
          workload: artifactReference(
            backendArtifactFile(PERFORMANCE_WORKLOAD_CAPTURE_INDEX, family.backend),
            family.workloadCapture.index
          ),
          metricSession: artifactReference(
            backendArtifactFile(PERFORMANCE_METRIC_SESSION_CAPTURE_INDEX, family.backend),
            family.metricSessionCapture.index
          )
        }
      }))
    }
  });
  const rawCaptureReplay = await readPerformanceRawCaptureManifest({ outputDirectory: options.outputDirectory });
  if (rawCaptureReplay.manifest.checksum !== rawCaptureManifest.manifest.checksum) {
    fail('raw capture manifest replay changed its sealed checksum');
  }

  return Object.freeze({
    ...build,
    role: options.role,
    selectedHost: options.selectedHost,
    experimentId,
    experimentDeadlineSeconds,
    experimentElapsedSeconds,
    pairPlan: backendRuns[0].pairPlan,
    pairPlanPath: backendRuns[0].pairPlanPath,
    pairPlans,
    backendRuns: Object.freeze(backendRuns),
    preLoopAuthority,
    preLoopAuthorityPath,
    launchAuthority: backendRuns[0].launchAuthority,
    launchAuthorityPath: backendRuns[0].launchAuthorityPath,
    playwrightExecuted: true,
    workloadCapture: captureFamilies[0].workloadCapture,
    sentinelCapture: captureFamilies[0].sentinelCapture,
    externalMetricCapture: captureFamilies[0].externalMetricCapture,
    metricSessionCapture: captureFamilies[0].metricSessionCapture,
    captureFamilies: Object.freeze(captureFamilies),
    genericTransport,
    performanceLedgerPrefix,
    pairLoopStart,
    preLoopBoundary,
    experimentEnvironment,
    rawCaptureManifest
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPerformanceBaseline().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
