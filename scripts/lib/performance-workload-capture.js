import fs from 'node:fs/promises';
import path from 'node:path';
import { canonicalSha256, stableStringify } from './baseline-report.js';
import {
  validatePerformanceRunJoin,
  validatePerformanceRunRawKinds
} from './performance-pair-plan.js';

export const PERFORMANCE_WORKLOAD_CAPTURE_SCHEMA_VERSION = 9;
export const PERFORMANCE_WORKLOAD_CAPTURE_INDEX_SCHEMA_VERSION = 9;
export const PERFORMANCE_WORKLOAD_CAPTURE_DIRECTORY = 'raw-workload-captures';

function fail(message) {
  throw new TypeError(`Performance workload capture failed: ${message}`);
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

function freeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) freeze(nested, seen);
  return Object.freeze(value);
}

function body(input) {
  exact(input, ['experimentId', 'sourceSha', 'policyHash', 'captureKind', 'join', 'rawKinds'], 'capture input');
  if (input.captureKind !== 'workload') fail('captureKind must be workload');
  const join = validatePerformanceRunJoin(input.join, { label: 'workload run join' });
  if (input.experimentId !== join.experimentId || input.sourceSha !== join.sourceSha || input.policyHash !== join.policyHash) {
    fail('capture identity does not match the run join');
  }
  if (join.comparisonKind !== 'instrumentation-overhead') fail('workload capture requires instrumentation-overhead');
  if (join.buildVariant === 'production') fail('workload capture forbids the production build');
  const rawKinds = validatePerformanceRunRawKinds(input.rawKinds, {
    captureKind: 'workload',
    join,
    label: 'workload rawKinds'
  });
  return {
    schemaVersion: PERFORMANCE_WORKLOAD_CAPTURE_SCHEMA_VERSION,
    experimentId: join.experimentId,
    sourceSha: join.sourceSha,
    policyHash: join.policyHash,
    captureKind: 'workload',
    join,
    rawKinds
  };
}

export function createPerformanceWorkloadCapture(input) {
  const normalized = body(input);
  return freeze({ ...normalized, checksum: canonicalSha256(normalized) });
}

export function validatePerformanceWorkloadCapture(value) {
  exact(value, ['schemaVersion', 'experimentId', 'sourceSha', 'policyHash', 'captureKind', 'join', 'rawKinds', 'checksum'], 'capture');
  if (value.schemaVersion !== PERFORMANCE_WORKLOAD_CAPTURE_SCHEMA_VERSION) fail('capture schema version is invalid');
  if (typeof value.checksum !== 'string' || !/^[a-f0-9]{64}$/.test(value.checksum)) fail('capture checksum must be a lowercase SHA-256');
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
  return `${PERFORMANCE_WORKLOAD_CAPTURE_DIRECTORY}/${capture.checksum}.json`;
}

export async function writePerformanceWorkloadCapture({ outputDirectory, ...input } = {}) {
  if (typeof outputDirectory !== 'string' || outputDirectory.length === 0) fail('outputDirectory must be a nonempty string');
  const capture = createPerformanceWorkloadCapture(input);
  const capturePath = path.join(outputDirectory, relativePath(capture));
  await fs.mkdir(path.dirname(capturePath), { recursive: true });
  await fs.writeFile(capturePath, `${stableStringify(capture)}\n`, { encoding: 'utf8', flag: 'wx' });
  return freeze({ relativePath: relativePath(capture), capture });
}

export async function readPerformanceWorkloadCaptures({ outputDirectory } = {}) {
  if (typeof outputDirectory !== 'string' || outputDirectory.length === 0) fail('outputDirectory must be a nonempty string');
  const directory = path.join(outputDirectory, PERFORMANCE_WORKLOAD_CAPTURE_DIRECTORY);
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
    const capture = validatePerformanceWorkloadCapture(JSON.parse(await fs.readFile(path.join(directory, name), 'utf8')));
    if (name !== `${capture.checksum}.json`) fail('capture filename does not match checksum');
    captures.push(freeze({ relativePath: `${PERFORMANCE_WORKLOAD_CAPTURE_DIRECTORY}/${name}`, capture }));
  }
  return freeze(captures);
}
