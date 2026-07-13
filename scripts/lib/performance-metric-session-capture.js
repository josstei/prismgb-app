import fs from 'node:fs/promises';
import path from 'node:path';
import { canonicalSha256, stableStringify } from './baseline-report.js';
import {
  PERFORMANCE_PAIR_ATTEMPT_CARDINALITY,
  PERFORMANCE_PAIR_CARDINALITIES,
  validatePerformanceScopedRawRow
} from './performance-pair-plan.js';

export const PERFORMANCE_METRIC_SESSION_CAPTURE_SCHEMA_VERSION = 2;
export const PERFORMANCE_METRIC_SESSION_CAPTURE_INDEX_SCHEMA_VERSION = 2;
export const PERFORMANCE_METRIC_SESSION_CAPTURE_DIRECTORY = 'raw-metric-session-captures';

const BACKENDS = new Set(['canvas2d', 'webgpu']);
const FORBIDDEN_ROW_FIELDS = new Set([
  'runId', 'comparisonSide', 'buildVariant', 'launchOrdinal', 'externalExecutionId',
  'observationBoundaryId', 'launchId', 'executionId', 'browserPid', 'browserCreationTime'
]);

function fail(message) {
  throw new TypeError(`Performance metric session capture failed: ${message}`);
}

function isObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exact(value, keys, label) {
  if (!isObject(value)) fail(`${label} must be an object`);
  const expected = new Set(keys);
  for (const key of Object.keys(value)) if (!expected.has(key)) fail(`${label} has an unknown field ${key}`);
  for (const key of keys) if (!(key in value)) fail(`${label} is missing ${key}`);
}

function text(value, label) {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a nonempty string`);
}

function integer(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(`${label} must be a safe integer >= ${minimum}`);
}

function sha(value, label, length) {
  if (typeof value !== 'string' || !new RegExp(`^[a-f0-9]{${length}}$`).test(value)) fail(`${label} is invalid`);
}

function uuid(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    fail(`${label} must be a UUID`);
  }
}

function freeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) freeze(nested, seen);
  return Object.freeze(value);
}

function validateJoin(value) {
  exact(value, ['metricSessionId', 'comparisonKind', 'backend', 'pairIndex', 'attemptIndex', 'metricSessionOpenSequence'], 'metric session join');
  text(value.metricSessionId, 'metric session join.metricSessionId');
  if (!Object.hasOwn(PERFORMANCE_PAIR_CARDINALITIES, value.comparisonKind)) fail('metric session join comparisonKind is invalid');
  if (!BACKENDS.has(value.backend)) fail('metric session join backend is invalid');
  integer(value.pairIndex, 'metric session join.pairIndex', 1);
  if (value.pairIndex > PERFORMANCE_PAIR_CARDINALITIES[value.comparisonKind]) fail('metric session join pairIndex exceeds its comparison-kind cardinality');
  integer(value.attemptIndex, 'metric session join.attemptIndex', 1);
  if (value.attemptIndex > PERFORMANCE_PAIR_ATTEMPT_CARDINALITY) fail('metric session join attemptIndex exceeds the preallocated cardinality');
  integer(value.metricSessionOpenSequence, 'metric session join.metricSessionOpenSequence', 1);
  return {
    metricSessionId: value.metricSessionId,
    comparisonKind: value.comparisonKind,
    backend: value.backend,
    pairIndex: value.pairIndex,
    attemptIndex: value.attemptIndex,
    metricSessionOpenSequence: value.metricSessionOpenSequence
  };
}

function validateRawKinds(value, identity, join) {
  if (!Array.isArray(value) || value.length !== 1) fail('metric session rawKinds must contain only process-observation');
  exact(value[0], ['rawKind', 'rows'], 'metric session rawKinds[0]');
  if (value[0].rawKind !== 'process-observation') fail('metric session rawKinds[0].rawKind is invalid');
  if (!Array.isArray(value[0].rows) || value[0].rows.length === 0) fail('metric session process observations must be nonempty');
  let pairPlanChecksum = null;
  let experimentRole = null;
  const rows = value[0].rows.map((row, index) => {
    if (!isObject(row)) fail(`metric session process row ${index} must be an object`);
    for (const field of FORBIDDEN_ROW_FIELDS) if (field in row) fail(`metric session process row ${index} forbids ${field}`);
    const expected = {
      sourceSha: identity.sourceSha,
      policyHash: identity.policyHash,
      experimentId: identity.experimentId,
      scopeKind: 'metric-session',
      scopeId: join.metricSessionId,
      captureKind: 'metric-session',
      metricSessionId: join.metricSessionId,
      comparisonKind: join.comparisonKind,
      backend: join.backend,
      pairIndex: join.pairIndex,
      attemptIndex: join.attemptIndex,
      metricSessionOpenSequence: join.metricSessionOpenSequence
    };
    for (const [key, expectedValue] of Object.entries(expected)) {
      if (row[key] !== expectedValue) fail(`metric session process row ${index}.${key} does not match the capture join`);
    }
    sha(row.pairPlanChecksum, `metric session process row ${index}.pairPlanChecksum`, 64);
    if (!['ci-integrity', 'reference-comparison'].includes(row.experimentRole)) fail(`metric session process row ${index}.experimentRole is invalid`);
    pairPlanChecksum ??= row.pairPlanChecksum;
    experimentRole ??= row.experimentRole;
    if (row.pairPlanChecksum !== pairPlanChecksum || row.experimentRole !== experimentRole) fail('metric session process rows disagree on family identity');
    return validatePerformanceScopedRawRow(row, 'process-observation', 'metric-session', {
      label: `metric session process row ${index}`
    });
  });
  return [{ rawKind: 'process-observation', rows }];
}

function body(input) {
  exact(input, ['experimentId', 'sourceSha', 'policyHash', 'captureKind', 'join', 'rawKinds'], 'capture input');
  uuid(input.experimentId, 'capture experimentId');
  sha(input.sourceSha, 'capture sourceSha', 40);
  sha(input.policyHash, 'capture policyHash', 64);
  if (input.captureKind !== 'metric-session') fail('captureKind must be metric-session');
  const join = validateJoin(input.join);
  const rawKinds = validateRawKinds(input.rawKinds, input, join);
  return {
    schemaVersion: PERFORMANCE_METRIC_SESSION_CAPTURE_SCHEMA_VERSION,
    experimentId: input.experimentId,
    sourceSha: input.sourceSha,
    policyHash: input.policyHash,
    captureKind: 'metric-session',
    join,
    rawKinds
  };
}

export function createPerformanceMetricSessionCapture(input) {
  const normalized = body(input);
  return freeze({ ...normalized, checksum: canonicalSha256(normalized) });
}

export function validatePerformanceMetricSessionCapture(value) {
  exact(value, ['schemaVersion', 'experimentId', 'sourceSha', 'policyHash', 'captureKind', 'join', 'rawKinds', 'checksum'], 'capture');
  if (value.schemaVersion !== PERFORMANCE_METRIC_SESSION_CAPTURE_SCHEMA_VERSION) fail('capture schema version is invalid');
  sha(value.checksum, 'capture checksum', 64);
  const normalized = body({
    experimentId: value.experimentId,
    sourceSha: value.sourceSha,
    policyHash: value.policyHash,
    captureKind: value.captureKind,
    join: value.join,
    rawKinds: value.rawKinds
  });
  if (value.checksum !== canonicalSha256(normalized)) fail('capture checksum does not match its canonical body');
  return freeze({ ...normalized, checksum: value.checksum });
}

function relativePath(capture) {
  return `${PERFORMANCE_METRIC_SESSION_CAPTURE_DIRECTORY}/${capture.checksum}.json`;
}

export async function writePerformanceMetricSessionCapture({ outputDirectory, ...input } = {}) {
  text(outputDirectory, 'outputDirectory');
  const capture = createPerformanceMetricSessionCapture(input);
  const capturePath = path.join(outputDirectory, relativePath(capture));
  await fs.mkdir(path.dirname(capturePath), { recursive: true });
  await fs.writeFile(capturePath, `${stableStringify(capture)}\n`, { encoding: 'utf8', flag: 'wx' });
  return freeze({ relativePath: relativePath(capture), capture });
}

export async function readPerformanceMetricSessionCaptures({ outputDirectory } = {}) {
  text(outputDirectory, 'outputDirectory');
  const directory = path.join(outputDirectory, PERFORMANCE_METRIC_SESSION_CAPTURE_DIRECTORY);
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return freeze([]);
    throw error;
  }
  const names = entries.filter((entry) => entry.isFile() && /^[a-f0-9]{64}\.json$/.test(entry.name))
    .map((entry) => entry.name).sort();
  if (names.length !== entries.length) fail('capture directory contains an unexpected entry');
  const captures = [];
  for (const name of names) {
    const capture = validatePerformanceMetricSessionCapture(JSON.parse(await fs.readFile(path.join(directory, name), 'utf8')));
    if (name !== `${capture.checksum}.json`) fail('capture filename does not match checksum');
    captures.push(freeze({ relativePath: `${PERFORMANCE_METRIC_SESSION_CAPTURE_DIRECTORY}/${name}`, capture }));
  }
  return freeze(captures);
}
