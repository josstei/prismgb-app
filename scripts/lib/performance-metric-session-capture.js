import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { stableStringify } from './baseline-report.js';
import {
  PERFORMANCE_PAIR_BUILD_VARIANTS,
  validatePerformancePairBinding
} from './performance-pair-plan.js';

export const PERFORMANCE_METRIC_SESSION_CAPTURE_SCHEMA_VERSION = 1;
export const PERFORMANCE_METRIC_SESSION_CAPTURE_DIRECTORY = 'raw-metric-session-captures';

const ADAPTER_QUANTA = new Map([
  ['linux-procfs-v1', 0.01],
  ['macos-ps-v1', 0.01],
  ['windows-powershell-v1', 0.0000001]
]);
const COMPARISON_SIDES = Object.freeze(['A', 'B']);

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
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label} has an unknown field ${key}`);
  }
  for (const key of keys) {
    if (!(key in value)) fail(`${label} is missing ${key}`);
  }
}

function text(value, label) {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a nonempty string`);
}

function integer(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(`${label} must be a safe integer >= ${minimum}`);
}

function finite(value, label, minimum = 0) {
  if (!Number.isFinite(value) || value < minimum) fail(`${label} must be finite and >= ${minimum}`);
}

function sha(value, label, length) {
  if (typeof value !== 'string' || !new RegExp(`^[a-f0-9]{${length}}$`).test(value)) {
    fail(`${label} must be a lowercase hexadecimal digest`);
  }
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

function targetKey(target) {
  return [
    target.pid,
    target.creationIdentity,
    target.processIdentity,
    target.counterQuantumSeconds
  ].join('\u0000');
}

function validateTarget(value, adapterId, label) {
  exact(value, ['pid', 'creationIdentity', 'processIdentity', 'counterQuantumSeconds'], label);
  integer(value.pid, `${label}.pid`, 1);
  text(value.creationIdentity, `${label}.creationIdentity`);
  text(value.processIdentity, `${label}.processIdentity`);
  const expectedQuantum = ADAPTER_QUANTA.get(adapterId);
  if (value.counterQuantumSeconds !== expectedQuantum) {
    fail(`${label}.counterQuantumSeconds does not match the selected adapter`);
  }
  return { ...value };
}

function validatePair(value) {
  exact(value, [
    'experimentId', 'pairPlanChecksum', 'metricSessionId', 'comparisonKind',
    'backend', 'pairIndex', 'attemptIndex'
  ], 'capture.pair');
  const binding = validatePerformancePairBinding({ ...value, comparisonSide: 'A' }, {
    label: 'capture.pair'
  });
  return {
    experimentId: binding.experimentId,
    pairPlanChecksum: binding.pairPlanChecksum,
    metricSessionId: binding.metricSessionId,
    comparisonKind: binding.comparisonKind,
    backend: binding.backend,
    pairIndex: binding.pairIndex,
    attemptIndex: binding.attemptIndex
  };
}

function validateSide(value, pair, adapterId, expectedSide) {
  exact(value, [
    'comparisonSide', 'buildVariant', 'externalExecutionId', 'metricCaptureChecksum', 'target'
  ], `capture.sides.${expectedSide}`);
  if (value.comparisonSide !== expectedSide) {
    fail(`capture.sides must retain the planned ${expectedSide}-then-${expectedSide === 'A' ? 'B' : 'end'} side order`);
  }
  if (!PERFORMANCE_PAIR_BUILD_VARIANTS[pair.comparisonKind].includes(value.buildVariant)) {
    fail(`capture.sides.${expectedSide}.buildVariant is not valid for the comparison kind`);
  }
  uuid(value.externalExecutionId, `capture.sides.${expectedSide}.externalExecutionId`);
  sha(value.metricCaptureChecksum, `capture.sides.${expectedSide}.metricCaptureChecksum`, 64);
  return {
    comparisonSide: expectedSide,
    buildVariant: value.buildVariant,
    externalExecutionId: value.externalExecutionId,
    metricCaptureChecksum: value.metricCaptureChecksum,
    target: validateTarget(value.target, adapterId, `capture.sides.${expectedSide}.target`)
  };
}

function sameTarget(left, right) {
  return targetKey(left) === targetKey(right);
}

function validateClosure(value, adapterId, sides) {
  exact(value, ['adapterId', 'transitions'], 'capture.closure');
  if (value.adapterId !== adapterId) fail('capture.closure adapter identity does not match the session');
  if (!Array.isArray(value.transitions)) fail('capture.closure.transitions must be an array');
  if (value.transitions.length < 10) fail('capture.closure.transitions is too short for two measured sides');

  const transitions = [];
  let previousAt = 0;
  for (const [index, rawTransition] of value.transitions.entries()) {
    if (!isObject(rawTransition)) fail(`capture.closure.transitions[${index}] must be an object`);
    const operation = rawTransition.operation;
    const targetOperation = new Set(['attach', 'prime', 'sample', 'detach']).has(operation);
    exact(rawTransition, targetOperation
      ? ['sequence', 'operation', 'at', 'target']
      : ['sequence', 'operation', 'at'], `capture.closure.transitions[${index}]`);
    integer(rawTransition.sequence, `capture.closure.transitions[${index}].sequence`, 1);
    if (rawTransition.sequence !== index + 1) fail('capture.closure transition sequences must be contiguous');
    finite(rawTransition.at, `capture.closure.transitions[${index}].at`);
    if (rawTransition.at < previousAt) fail('capture.closure transition clock regressed');
    previousAt = rawTransition.at;
    if (targetOperation) {
      transitions.push({
        sequence: rawTransition.sequence,
        operation,
        at: rawTransition.at,
        target: validateTarget(rawTransition.target, adapterId, `capture.closure.transitions[${index}].target`)
      });
    } else {
      transitions.push({ sequence: rawTransition.sequence, operation, at: rawTransition.at });
    }
  }

  const first = transitions[0];
  const last = transitions.at(-1);
  if (first.operation !== 'open' || last.operation !== 'close') {
    fail('capture.closure must begin with open and end with close');
  }

  let offset = 1;
  const seenTargets = new Set();
  for (const side of sides) {
    const expectedTargetKey = targetKey(side.target);
    if (seenTargets.has(expectedTargetKey)) fail('capture.sides must not reuse one metric target');
    seenTargets.add(expectedTargetKey);
    for (const operation of ['attach', 'prime']) {
      const transition = transitions[offset++];
      if (!transition || transition.operation !== operation || !('target' in transition)
        || !sameTarget(transition.target, side.target)) {
        fail(`capture.closure does not ${operation} the ${side.comparisonSide} metric target`);
      }
    }
    let sampleCount = 0;
    while (transitions[offset]?.operation === 'sample') {
      const transition = transitions[offset++];
      if (!('target' in transition) || !sameTarget(transition.target, side.target)) {
        fail(`capture.closure samples a target other than side ${side.comparisonSide}`);
      }
      sampleCount += 1;
    }
    if (sampleCount === 0) fail(`capture.closure does not sample side ${side.comparisonSide}`);
    const detach = transitions[offset++];
    if (!detach || detach.operation !== 'detach' || !('target' in detach) || !sameTarget(detach.target, side.target)) {
      fail(`capture.closure does not detach the ${side.comparisonSide} metric target`);
    }
  }
  if (offset !== transitions.length - 1) {
    fail('capture.closure retains an unsupported operation between pair sides or before close');
  }
  return {
    adapterId,
    transitions
  };
}

function body(input) {
  exact(input, ['sourceSha', 'pair', 'adapterId', 'sides', 'closure'], 'capture input');
  sha(input.sourceSha, 'capture.sourceSha', 40);
  text(input.adapterId, 'capture.adapterId');
  if (!ADAPTER_QUANTA.has(input.adapterId)) fail('capture.adapterId is not registered');
  const pair = validatePair(input.pair);
  if (!Array.isArray(input.sides) || input.sides.length !== COMPARISON_SIDES.length) {
    fail('capture.sides must contain exactly two comparison sides');
  }
  const sides = COMPARISON_SIDES.map((side, index) => validateSide(input.sides[index], pair, input.adapterId, side));
  if (sides[0].externalExecutionId === sides[1].externalExecutionId) {
    fail('capture.sides must retain distinct external executions');
  }
  if (sides[0].metricCaptureChecksum === sides[1].metricCaptureChecksum) {
    fail('capture.sides must retain distinct external metric captures');
  }
  return {
    schemaVersion: PERFORMANCE_METRIC_SESSION_CAPTURE_SCHEMA_VERSION,
    sourceSha: input.sourceSha,
    pair,
    adapterId: input.adapterId,
    sides,
    closure: validateClosure(input.closure, input.adapterId, sides)
  };
}

function digest(value) {
  return crypto.createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}

export function createPerformanceMetricSessionCapture(input) {
  const normalized = body(input);
  return freeze({ ...normalized, checksum: digest(normalized) });
}

export function validatePerformanceMetricSessionCapture(value) {
  exact(value, ['schemaVersion', 'sourceSha', 'pair', 'adapterId', 'sides', 'closure', 'checksum'], 'capture');
  if (value.schemaVersion !== PERFORMANCE_METRIC_SESSION_CAPTURE_SCHEMA_VERSION) {
    fail('capture schema version is invalid');
  }
  sha(value.checksum, 'capture.checksum', 64);
  const normalized = body({
    sourceSha: value.sourceSha,
    pair: value.pair,
    adapterId: value.adapterId,
    sides: value.sides,
    closure: value.closure
  });
  if (digest(normalized) !== value.checksum) fail('capture checksum does not match its body');
  return freeze({ ...normalized, checksum: value.checksum });
}

function relativePath(capture) {
  return `${PERFORMANCE_METRIC_SESSION_CAPTURE_DIRECTORY}/${capture.checksum}.json`;
}

export async function writePerformanceMetricSessionCapture({ outputDirectory, ...input } = {}) {
  text(outputDirectory, 'capture outputDirectory');
  const capture = createPerformanceMetricSessionCapture(input);
  const root = path.resolve(outputDirectory);
  const relative = relativePath(capture);
  const absolute = path.resolve(root, relative);
  const outputRelative = path.relative(root, absolute);
  if (outputRelative.startsWith('..') || path.isAbsolute(outputRelative)) {
    fail('capture output path escapes its output directory');
  }
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, `${stableStringify(capture)}\n`, { encoding: 'utf8', flag: 'wx' });
  return Object.freeze({ capture, absolutePath: absolute, relativePath: relative });
}

export async function readPerformanceMetricSessionCaptures({ outputDirectory } = {}) {
  text(outputDirectory, 'capture outputDirectory');
  const root = path.resolve(outputDirectory);
  const directory = path.join(root, PERFORMANCE_METRIC_SESSION_CAPTURE_DIRECTORY);
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return Object.freeze([]);
    throw error;
  }
  const captures = [];
  const metricSessionIds = new Set();
  const checksums = new Set();
  for (const entry of entries.sort((left, right) => left.name === right.name ? 0 : left.name < right.name ? -1 : 1)) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      fail(`capture directory contains an unsupported entry ${entry.name}`);
    }
    const absolute = path.join(directory, entry.name);
    let parsed;
    try {
      parsed = JSON.parse(await fs.readFile(absolute, 'utf8'));
    } catch (error) {
      fail(`capture ${entry.name} is not readable JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    const capture = validatePerformanceMetricSessionCapture(parsed);
    if (entry.name !== `${capture.checksum}.json`) {
      fail('capture filename does not bind its checksum');
    }
    if (metricSessionIds.has(capture.pair.metricSessionId) || checksums.has(capture.checksum)) {
      fail('capture directory contains a duplicate metric session or checksum');
    }
    metricSessionIds.add(capture.pair.metricSessionId);
    checksums.add(capture.checksum);
    captures.push(Object.freeze({
      capture,
      absolutePath: absolute,
      relativePath: `${PERFORMANCE_METRIC_SESSION_CAPTURE_DIRECTORY}/${entry.name}`
    }));
  }
  return Object.freeze(captures);
}
