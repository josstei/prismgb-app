import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { stableStringify } from './baseline-report.js';
import { validatePerformanceControllerAudit } from './performance-controller-audit.js';
import { validatePerformancePairBinding } from './performance-pair-plan.js';

export const PERFORMANCE_WORKLOAD_CAPTURE_SCHEMA_VERSION = 5;
export const PERFORMANCE_WORKLOAD_CAPTURE_DIRECTORY = 'raw-workload-captures';

const BUILD_VARIANTS = Object.freeze({
  production: Object.freeze({ harness: false, instrumentation: false }),
  'harness-control': Object.freeze({ harness: true, instrumentation: false }),
  instrumented: Object.freeze({ harness: true, instrumentation: true })
});
const WINDOW_CLOSURE_REASONS = new Set([
  'minimum-reached',
  'callback-cap-reached',
  'duration-cap-reached'
]);

function fail(message) {
  throw new TypeError(`Performance workload capture failed: ${message}`);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertObject(value, label) {
  if (!isPlainObject(value)) fail(`${label} must be an object`);
}

function assertExactKeys(value, keys, label) {
  assertObject(value, label);
  const expected = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) fail(`${label} has an unknown field ${key}`);
  }
  for (const key of keys) {
    if (!(key in value)) fail(`${label} is missing ${key}`);
  }
}

function assertString(value, label) {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a nonempty string`);
}

function assertSafeInteger(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail(`${label} must be a safe integer >= ${minimum}`);
  }
}

function assertFiniteNumber(value, label, minimum = 0) {
  if (!Number.isFinite(value) || value < minimum) {
    fail(`${label} must be a finite number >= ${minimum}`);
  }
}

function assertSha(value, label, length) {
  if (typeof value !== 'string' || !new RegExp(`^[a-f0-9]{${length}}$`).test(value)) {
    fail(`${label} must be a lowercase ${length}-character hexadecimal digest`);
  }
}

function assertUuid(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    fail(`${label} must be a UUID`);
  }
}

function cloneJson(value, label) {
  try {
    return JSON.parse(stableStringify(value));
  } catch (error) {
    fail(`${label} must contain only finite plain JSON values: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function validateBuild(value) {
  assertExactKeys(value, ['id', 'harness', 'instrumentation', 'bundleSha256'], 'capture.build');
  assertString(value.id, 'capture.build.id');
  const expected = BUILD_VARIANTS[value.id];
  if (!expected || value.harness !== expected.harness || value.instrumentation !== expected.instrumentation) {
    fail('capture.build does not match a registered build variant');
  }
  assertSha(value.bundleSha256, 'capture.build.bundleSha256', 64);
  return { ...value };
}

function validateWorkload(value) {
  assertExactKeys(value, ['id', 'pattern', 'width', 'height', 'frameRate'], 'capture.workload');
  assertString(value.id, 'capture.workload.id');
  assertString(value.pattern, 'capture.workload.pattern');
  assertSafeInteger(value.width, 'capture.workload.width', 1);
  assertSafeInteger(value.height, 'capture.workload.height', 1);
  assertFiniteNumber(value.frameRate, 'capture.workload.frameRate', Number.EPSILON);
  return { ...value };
}

function validateWarmup(value) {
  assertExactKeys(value, ['sourceOpportunityCount', 'elapsedMs'], 'capture.warmup');
  assertSafeInteger(value.sourceOpportunityCount, 'capture.warmup.sourceOpportunityCount', 1);
  assertFiniteNumber(value.elapsedMs, 'capture.warmup.elapsedMs', Number.EPSILON);
  return { ...value };
}

function validateWindow(value) {
  assertExactKeys(value, [
    'minimumCallbacks',
    'minimumDurationMs',
    'maximumCallbacks',
    'maximumDurationMs',
    'deliveredCallbackCount',
    'startedAt',
    'closedAt',
    'closureReason'
  ], 'capture.window');
  assertSafeInteger(value.minimumCallbacks, 'capture.window.minimumCallbacks', 1);
  assertFiniteNumber(value.minimumDurationMs, 'capture.window.minimumDurationMs', Number.EPSILON);
  assertSafeInteger(value.maximumCallbacks, 'capture.window.maximumCallbacks', value.minimumCallbacks);
  assertFiniteNumber(value.maximumDurationMs, 'capture.window.maximumDurationMs', value.minimumDurationMs);
  assertSafeInteger(value.deliveredCallbackCount, 'capture.window.deliveredCallbackCount', value.minimumCallbacks);
  if (value.deliveredCallbackCount > value.maximumCallbacks) {
    fail('capture.window delivered callback count exceeds its cap');
  }
  assertFiniteNumber(value.startedAt, 'capture.window.startedAt');
  assertFiniteNumber(value.closedAt, 'capture.window.closedAt', value.startedAt);
  assertString(value.closureReason, 'capture.window.closureReason');
  if (!WINDOW_CLOSURE_REASONS.has(value.closureReason)) {
    fail('capture.window closure reason is unsupported');
  }

  const durationMs = value.closedAt - value.startedAt;
  if (value.closureReason === 'minimum-reached' && durationMs < value.minimumDurationMs) {
    fail('capture.window minimum closure is shorter than its required duration');
  }
  if (durationMs > value.maximumDurationMs) {
    fail('capture.window duration exceeds its cap');
  }
  return { ...value };
}

function validateSourceSequences(value, expectedCount) {
  if (!Array.isArray(value)) fail('capture.sourceSequences must be an array');
  if (value.length !== expectedCount) {
    fail('capture.sourceSequences must match the delivered callback count');
  }
  value.forEach((sourceSequence, index) => {
    assertSafeInteger(sourceSequence, `capture.sourceSequences[${index}]`, 1);
    if (index > 0 && sourceSequence !== value[index - 1] + 1) {
      fail('capture.sourceSequences must be contiguous');
    }
  });
  return [...value];
}

function checksum(body) {
  return crypto.createHash('sha256').update(stableStringify(body), 'utf8').digest('hex');
}

function captureBody(input) {
  assertExactKeys(input, [
    'sourceSha',
    'launchId',
    'externalExecutionId',
    'observationBoundaryId',
    'pair',
    'build',
    'workload',
    'warmup',
    'window',
    'sourceSequences',
    'controlWrites',
    'diagnostics',
    'controllerAudit'
  ], 'capture input');
  assertSha(input.sourceSha, 'capture.sourceSha', 40);
  assertUuid(input.launchId, 'capture.launchId');
  assertUuid(input.externalExecutionId, 'capture.externalExecutionId');
  assertString(input.observationBoundaryId, 'capture.observationBoundaryId');
  const build = validateBuild(input.build);
  const pair = validatePerformancePairBinding(input.pair, {
    label: 'capture.pair',
    buildVariant: build.id
  });
  const workload = validateWorkload(input.workload);
  const warmup = validateWarmup(input.warmup);
  const window = validateWindow(input.window);
  const sourceSequences = validateSourceSequences(input.sourceSequences, window.deliveredCallbackCount);
  if (!Array.isArray(input.controlWrites)) fail('capture.controlWrites must be an array');
  assertObject(input.diagnostics, 'capture.diagnostics');
  const diagnostics = cloneJson(input.diagnostics, 'capture.diagnostics');
  if (build.id === 'harness-control' && Object.keys(diagnostics).length !== 0) {
    fail('capture.diagnostics must be empty for the harness-control build');
  }
  const controllerAudit = validatePerformanceControllerAudit(input.controllerAudit, {
    launchId: input.launchId,
    instrumentation: build.instrumentation,
    label: 'capture.controllerAudit'
  });

  return {
    schemaVersion: PERFORMANCE_WORKLOAD_CAPTURE_SCHEMA_VERSION,
    sourceSha: input.sourceSha,
    launchId: input.launchId,
    externalExecutionId: input.externalExecutionId,
    observationBoundaryId: input.observationBoundaryId,
    pair,
    build,
    workload,
    warmup,
    window,
    sourceSequences,
    controlWrites: cloneJson(input.controlWrites, 'capture.controlWrites'),
    diagnostics,
    controllerAudit
  };
}

export function createPerformanceWorkloadCapture(input) {
  const body = captureBody(input);
  return deepFreeze({ ...body, checksum: checksum(body) });
}

export function validatePerformanceWorkloadCapture(value) {
  assertExactKeys(value, [
    'schemaVersion',
    'sourceSha',
    'launchId',
    'externalExecutionId',
    'observationBoundaryId',
    'pair',
    'build',
    'workload',
    'warmup',
    'window',
    'sourceSequences',
    'controlWrites',
    'diagnostics',
    'controllerAudit',
    'checksum'
  ], 'capture');
  if (value.schemaVersion !== PERFORMANCE_WORKLOAD_CAPTURE_SCHEMA_VERSION) {
    fail('capture schema version is invalid');
  }
  assertSha(value.checksum, 'capture.checksum', 64);
  const body = captureBody({
    sourceSha: value.sourceSha,
    launchId: value.launchId,
    externalExecutionId: value.externalExecutionId,
    observationBoundaryId: value.observationBoundaryId,
    pair: value.pair,
    build: value.build,
    workload: value.workload,
    warmup: value.warmup,
    window: value.window,
    sourceSequences: value.sourceSequences,
    controlWrites: value.controlWrites,
    diagnostics: value.diagnostics,
    controllerAudit: value.controllerAudit
  });
  if (checksum(body) !== value.checksum) fail('capture checksum does not match its body');
  return deepFreeze({ ...body, checksum: value.checksum });
}

function captureRelativePath(capture) {
  return `${PERFORMANCE_WORKLOAD_CAPTURE_DIRECTORY}/${capture.launchId}-${capture.checksum}.json`;
}

export async function writePerformanceWorkloadCapture({ outputDirectory, ...input } = {}) {
  assertString(outputDirectory, 'capture outputDirectory');
  const capture = createPerformanceWorkloadCapture(input);
  const root = path.resolve(outputDirectory);
  const relativePath = captureRelativePath(capture);
  const absolutePath = path.resolve(root, relativePath);
  const outputRelativePath = path.relative(root, absolutePath);
  if (outputRelativePath.startsWith('..') || path.isAbsolute(outputRelativePath)) {
    fail('capture output path escapes its output directory');
  }
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, `${stableStringify(capture)}\n`, { encoding: 'utf8', flag: 'wx' });
  return Object.freeze({ capture, absolutePath, relativePath });
}

export async function readPerformanceWorkloadCaptures({ outputDirectory } = {}) {
  assertString(outputDirectory, 'capture outputDirectory');
  const root = path.resolve(outputDirectory);
  const directory = path.join(root, PERFORMANCE_WORKLOAD_CAPTURE_DIRECTORY);
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return Object.freeze([]);
    throw error;
  }

  const captures = [];
  const launchIds = new Set();
  const checksums = new Set();
  for (const entry of entries.sort((left, right) => left.name === right.name ? 0 : left.name < right.name ? -1 : 1)) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      fail(`capture directory contains an unsupported entry ${entry.name}`);
    }
    const relativePath = `${PERFORMANCE_WORKLOAD_CAPTURE_DIRECTORY}/${entry.name}`;
    const absolutePath = path.join(directory, entry.name);
    let parsed;
    try {
      parsed = JSON.parse(await fs.readFile(absolutePath, 'utf8'));
    } catch (error) {
      fail(`capture ${entry.name} is not readable JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    const capture = validatePerformanceWorkloadCapture(parsed);
    if (entry.name !== `${capture.launchId}-${capture.checksum}.json`) {
      fail(`capture filename does not bind its launch and checksum: ${entry.name}`);
    }
    if (launchIds.has(capture.launchId) || checksums.has(capture.checksum)) {
      fail('capture directory contains a duplicate launch or checksum');
    }
    launchIds.add(capture.launchId);
    checksums.add(capture.checksum);
    captures.push(Object.freeze({ capture, absolutePath, relativePath }));
  }
  return Object.freeze(captures);
}
