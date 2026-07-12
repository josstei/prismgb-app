import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { stableStringify } from './baseline-report.js';
import { validatePerformancePairBinding } from './performance-pair-plan.js';

export const PERFORMANCE_SENTINEL_CAPTURE_SCHEMA_VERSION = 3;
export const PERFORMANCE_SENTINEL_CAPTURE_DIRECTORY = 'raw-sentinel-captures';

const BUILD_VARIANTS = Object.freeze({
  production: Object.freeze({ harness: false, instrumentation: false }),
  'harness-control': Object.freeze({ harness: true, instrumentation: false })
});
const BACKENDS = new Set(['canvas2d', 'webgpu']);
const CLOSURE_REASONS = new Set(['minimum-reached', 'callback-cap-reached', 'duration-cap-reached']);

function fail(message) {
  throw new TypeError('Performance sentinel capture failed: ' + message);
}

function isObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exact(value, keys, label) {
  if (!isObject(value)) fail(label + ' must be an object');
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(label + ' has an unknown field ' + key);
  }
  for (const key of keys) {
    if (!(key in value)) fail(label + ' is missing ' + key);
  }
}

function text(value, label) {
  if (typeof value !== 'string' || value.length === 0) fail(label + ' must be a nonempty string');
}

function integer(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(label + ' must be a safe integer >= ' + minimum);
}

function finite(value, label, minimum = 0) {
  if (!Number.isFinite(value) || value < minimum) fail(label + ' must be finite and >= ' + minimum);
}

function uuid(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    fail(label + ' must be a UUID');
  }
}

function sha(value, label, length) {
  if (typeof value !== 'string' || !new RegExp('^[a-f0-9]{' + length + '}$').test(value)) {
    fail(label + ' must be a lowercase hexadecimal digest');
  }
}

function freeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) freeze(nested, seen);
  return Object.freeze(value);
}

function validateBuild(value) {
  exact(value, ['id', 'harness', 'instrumentation', 'bundleSha256'], 'capture.build');
  text(value.id, 'capture.build.id');
  const expected = BUILD_VARIANTS[value.id];
  if (!expected || value.harness !== expected.harness || value.instrumentation !== expected.instrumentation) {
    fail('capture.build must be a registered sentinel variant');
  }
  sha(value.bundleSha256, 'capture.build.bundleSha256', 64);
  return { ...value };
}

function validateWorkload(value) {
  exact(value, ['id', 'pattern', 'width', 'height', 'frameRate'], 'capture.workload');
  text(value.id, 'capture.workload.id');
  text(value.pattern, 'capture.workload.pattern');
  integer(value.width, 'capture.workload.width', 1);
  integer(value.height, 'capture.workload.height', 1);
  finite(value.frameRate, 'capture.workload.frameRate', Number.EPSILON);
  return { ...value };
}

function validateWindow(value) {
  exact(value, [
    'minimumCallbacks', 'minimumDurationMs', 'maximumCallbacks', 'maximumDurationMs',
    'deliveredCallbackCount', 'startedAt', 'closedAt', 'terminalClosureEnd', 'closureReason'
  ], 'capture.window');
  integer(value.minimumCallbacks, 'capture.window.minimumCallbacks', 1);
  finite(value.minimumDurationMs, 'capture.window.minimumDurationMs', Number.EPSILON);
  integer(value.maximumCallbacks, 'capture.window.maximumCallbacks', value.minimumCallbacks);
  finite(value.maximumDurationMs, 'capture.window.maximumDurationMs', value.minimumDurationMs);
  integer(value.deliveredCallbackCount, 'capture.window.deliveredCallbackCount', value.minimumCallbacks);
  if (value.deliveredCallbackCount > value.maximumCallbacks) fail('capture.window exceeds its callback cap');
  finite(value.startedAt, 'capture.window.startedAt');
  finite(value.closedAt, 'capture.window.closedAt', value.startedAt);
  finite(value.terminalClosureEnd, 'capture.window.terminalClosureEnd', value.closedAt);
  text(value.closureReason, 'capture.window.closureReason');
  if (!CLOSURE_REASONS.has(value.closureReason)) fail('capture.window has an unsupported closure reason');
  const duration = value.closedAt - value.startedAt;
  if (value.closureReason === 'minimum-reached' && duration < value.minimumDurationMs) {
    fail('capture.window closed before its minimum duration');
  }
  if (duration > value.maximumDurationMs) fail('capture.window exceeds its duration cap');
  return { ...value };
}

function validateEvent(event, label, keys, kind, window) {
  exact(event, keys, label);
  integer(event.sequence, label + '.sequence', 1);
  if (event.kind !== kind) fail(label + '.kind is invalid');
  finite(event.observedAt, label + '.observedAt', window.startedAt);
  if (event.observedAt > window.terminalClosureEnd) fail(label + '.observedAt is after terminal closure');
  return { ...event };
}

function validateObservations(value, window, backend) {
  exact(value, [
    'callbacks', 'canvasDraws', 'workerFramePosts', 'acknowledgements', 'errors',
    'postPauseCanvasDrawCount', 'callbackOverlapCount', 'outstandingWorkerFrames'
  ], 'capture.observations');
  if (!Array.isArray(value.callbacks) || !Array.isArray(value.canvasDraws)
    || !Array.isArray(value.workerFramePosts) || !Array.isArray(value.acknowledgements)
    || !Array.isArray(value.errors)) {
    fail('capture.observations event fields must be arrays');
  }
  const callbacks = value.callbacks.map((event, index) => {
    const row = validateEvent(event, 'capture.observations.callbacks[' + index + ']', [
      'sequence', 'kind', 'observedAt', 'callbackOrdinal', 'mediaTime'
    ], 'renderer-callback', window);
    integer(row.callbackOrdinal, 'capture.observations.callbacks[' + index + '].callbackOrdinal', 1);
    if (!(row.mediaTime === null || Number.isFinite(row.mediaTime))) fail('capture callback mediaTime is invalid');
    if (row.observedAt > window.closedAt) fail('capture callback is after the cutoff');
    return row;
  });
  const validateBackendRows = (rows, field, kind) => rows.map((event, index) => {
    const label = 'capture.observations.' + field + '[' + index + ']';
    const row = validateEvent(event, label, [
      'sequence', 'kind', 'observedAt', 'callbackOrdinal', 'startedAt', 'endedAt'
    ], kind, window);
    integer(row.callbackOrdinal, label + '.callbackOrdinal', 1);
    if (row.callbackOrdinal > window.deliveredCallbackCount) fail(label + ' is outside the callback cohort');
    finite(row.startedAt, label + '.startedAt', window.startedAt);
    finite(row.endedAt, label + '.endedAt', row.startedAt);
    if (row.endedAt > window.terminalClosureEnd) fail(label + ' ends after terminal closure');
    return row;
  });
  const canvasDraws = validateBackendRows(value.canvasDraws, 'canvasDraws', 'canvas-draw-completed');
  const workerFramePosts = validateBackendRows(value.workerFramePosts, 'workerFramePosts', 'worker-frame-posted');
  const acknowledgements = value.acknowledgements.map((event, index) => {
    const row = validateEvent(event, 'capture.observations.acknowledgements[' + index + ']', [
      'sequence', 'kind', 'observedAt', 'tagged'
    ], 'worker-frame-acknowledged', window);
    if (typeof row.tagged !== 'boolean') fail('capture acknowledgement tagged state is invalid');
    return row;
  });
  const errors = value.errors.map((event, index) => {
    const label = 'capture.observations.errors[' + index + ']';
    if (!isObject(event)) fail(label + ' must be an object');
    const row = validateEvent(event, label, ['sequence', 'kind', 'observedAt'], event.kind, window);
    if (!['worker-message-error', 'worker-error-event'].includes(row.kind)) fail(label + '.kind is invalid');
    return row;
  });

  if (callbacks.length !== window.deliveredCallbackCount) fail('capture callback count does not match the window');
  callbacks.forEach((row, index) => {
    if (row.callbackOrdinal !== index + 1) fail('capture callback ordinals must be contiguous');
  });
  const all = [...callbacks, ...canvasDraws, ...workerFramePosts, ...acknowledgements, ...errors]
    .sort((left, right) => left.sequence - right.sequence);
  all.forEach((row, index) => {
    if (row.sequence !== index + 1) fail('capture event sequences must be globally contiguous');
  });
  integer(value.postPauseCanvasDrawCount, 'capture.observations.postPauseCanvasDrawCount');
  integer(value.callbackOverlapCount, 'capture.observations.callbackOverlapCount');
  integer(value.outstandingWorkerFrames, 'capture.observations.outstandingWorkerFrames');
  if (value.postPauseCanvasDrawCount !== 0 || value.callbackOverlapCount !== 0) {
    fail('capture retains a post-pause draw or overlapping callback');
  }
  const balance = workerFramePosts.length - acknowledgements.length - errors.length;
  if (value.outstandingWorkerFrames !== balance || balance !== 0) {
    fail('capture worker frame evidence is not balanced and drained');
  }
  if (backend === 'canvas2d') {
    if (canvasDraws.length === 0 || workerFramePosts.length || acknowledgements.length || errors.length) {
      fail('Canvas sentinel captures require draws and no worker evidence');
    }
  } else if (canvasDraws.length || workerFramePosts.length === 0 || errors.length) {
    fail('WebGPU sentinel captures require successful worker evidence and no Canvas/error rows');
  }
  return {
    callbacks, canvasDraws, workerFramePosts, acknowledgements, errors,
    postPauseCanvasDrawCount: value.postPauseCanvasDrawCount,
    callbackOverlapCount: value.callbackOverlapCount,
    outstandingWorkerFrames: value.outstandingWorkerFrames
  };
}

function body(input) {
  exact(input, [
    'sourceSha', 'runId', 'externalExecutionId', 'observationBoundaryId', 'pair', 'build',
    'backend', 'workload', 'warmup', 'window', 'observations'
  ], 'capture input');
  sha(input.sourceSha, 'capture.sourceSha', 40);
  text(input.runId, 'capture.runId');
  uuid(input.externalExecutionId, 'capture.externalExecutionId');
  text(input.observationBoundaryId, 'capture.observationBoundaryId');
  text(input.backend, 'capture.backend');
  if (!BACKENDS.has(input.backend)) fail('capture.backend is invalid');
  exact(input.warmup, ['callbackCount', 'elapsedMs'], 'capture.warmup');
  integer(input.warmup.callbackCount, 'capture.warmup.callbackCount', 1);
  finite(input.warmup.elapsedMs, 'capture.warmup.elapsedMs', Number.EPSILON);
  const window = validateWindow(input.window);
  const build = validateBuild(input.build);
  const pair = validatePerformancePairBinding(input.pair, {
    label: 'capture.pair',
    buildVariant: build.id
  });
  return {
    schemaVersion: PERFORMANCE_SENTINEL_CAPTURE_SCHEMA_VERSION,
    sourceSha: input.sourceSha,
    runId: input.runId,
    externalExecutionId: input.externalExecutionId,
    observationBoundaryId: input.observationBoundaryId,
    pair,
    build,
    backend: input.backend,
    workload: validateWorkload(input.workload),
    warmup: { ...input.warmup },
    window,
    observations: validateObservations(input.observations, window, input.backend)
  };
}

function digest(value) {
  return crypto.createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}

export function createPerformanceSentinelCapture(input) {
  const normalized = body(input);
  return freeze({ ...normalized, checksum: digest(normalized) });
}

export function validatePerformanceSentinelCapture(value) {
  exact(value, [
    'schemaVersion', 'sourceSha', 'runId', 'externalExecutionId', 'observationBoundaryId', 'pair',
    'build', 'backend', 'workload', 'warmup', 'window', 'observations', 'checksum'
  ], 'capture');
  if (value.schemaVersion !== PERFORMANCE_SENTINEL_CAPTURE_SCHEMA_VERSION) fail('capture schema version is invalid');
  sha(value.checksum, 'capture.checksum', 64);
  const normalized = body({
    sourceSha: value.sourceSha,
    runId: value.runId,
    externalExecutionId: value.externalExecutionId,
    observationBoundaryId: value.observationBoundaryId,
    pair: value.pair,
    build: value.build,
    backend: value.backend,
    workload: value.workload,
    warmup: value.warmup,
    window: value.window,
    observations: value.observations
  });
  if (digest(normalized) !== value.checksum) fail('capture checksum does not match its body');
  return freeze({ ...normalized, checksum: value.checksum });
}

function relativePath(capture) {
  return PERFORMANCE_SENTINEL_CAPTURE_DIRECTORY + '/' + capture.externalExecutionId + '-' + capture.checksum + '.json';
}

export async function writePerformanceSentinelCapture({ outputDirectory, ...input } = {}) {
  text(outputDirectory, 'capture outputDirectory');
  const capture = createPerformanceSentinelCapture(input);
  const root = path.resolve(outputDirectory);
  const relative = relativePath(capture);
  const absolute = path.resolve(root, relative);
  const outputRelative = path.relative(root, absolute);
  if (outputRelative.startsWith('..') || path.isAbsolute(outputRelative)) fail('capture output path escapes its output directory');
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, stableStringify(capture) + '\n', { encoding: 'utf8', flag: 'wx' });
  return Object.freeze({ capture, absolutePath: absolute, relativePath: relative });
}

export async function readPerformanceSentinelCaptures({ outputDirectory } = {}) {
  text(outputDirectory, 'capture outputDirectory');
  const root = path.resolve(outputDirectory);
  const directory = path.join(root, PERFORMANCE_SENTINEL_CAPTURE_DIRECTORY);
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return Object.freeze([]);
    throw error;
  }
  const captures = [];
  const executionIds = new Set();
  const checksums = new Set();
  for (const entry of entries.sort((left, right) => left.name === right.name ? 0 : left.name < right.name ? -1 : 1)) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) fail('capture directory contains an unsupported entry ' + entry.name);
    const absolute = path.join(directory, entry.name);
    const capture = validatePerformanceSentinelCapture(JSON.parse(await fs.readFile(absolute, 'utf8')));
    if (entry.name !== capture.externalExecutionId + '-' + capture.checksum + '.json') {
      fail('capture filename does not bind its execution and checksum');
    }
    if (executionIds.has(capture.externalExecutionId) || checksums.has(capture.checksum)) {
      fail('capture directory contains a duplicate external execution or checksum');
    }
    executionIds.add(capture.externalExecutionId);
    checksums.add(capture.checksum);
    captures.push(Object.freeze({
      capture,
      absolutePath: absolute,
      relativePath: PERFORMANCE_SENTINEL_CAPTURE_DIRECTORY + '/' + entry.name
    }));
  }
  return Object.freeze(captures);
}
