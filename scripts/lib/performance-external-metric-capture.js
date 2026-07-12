import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { stableStringify } from './baseline-report.js';
import {
  parseLinuxProcfsMetricSnapshot,
  parseMacosPsMetricIdentitySnapshot,
  parseWindowsPowerShellMetricSnapshot
} from './process-runner.js';

export const PERFORMANCE_EXTERNAL_METRIC_CAPTURE_SCHEMA_VERSION = 1;
export const PERFORMANCE_EXTERNAL_METRIC_CAPTURE_DIRECTORY = 'raw-external-metric-captures';

const BUILD_VARIANTS = Object.freeze({
  production: Object.freeze({ harness: false, instrumentation: false }),
  'harness-control': Object.freeze({ harness: true, instrumentation: false })
});
const ADAPTER_QUANTA = new Map([
  ['linux-procfs-v1', 0.01],
  ['macos-ps-v1', 0.01],
  ['windows-powershell-v1', 0.0000001]
]);

function fail(message) {
  throw new TypeError(`Performance external metric capture failed: ${message}`);
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

function cloneJson(value, label) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${label} contains a non-finite number`);
    return value;
  }
  if (Array.isArray(value)) return value.map((entry, index) => cloneJson(entry, `${label}[${index}]`));
  if (!isObject(value)) fail(`${label} must contain only JSON values`);
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneJson(entry, `${label}.${key}`)]));
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
    fail('capture.build must be a registered external metric variant');
  }
  sha(value.bundleSha256, 'capture.build.bundleSha256', 64);
  return { ...value };
}

function validateTarget(value, adapterId) {
  exact(value, ['pid', 'creationIdentity', 'processIdentity', 'counterQuantumSeconds'], 'capture.target');
  integer(value.pid, 'capture.target.pid', 1);
  text(value.creationIdentity, 'capture.target.creationIdentity');
  text(value.processIdentity, 'capture.target.processIdentity');
  const expectedQuantum = ADAPTER_QUANTA.get(adapterId);
  if (value.counterQuantumSeconds !== expectedQuantum) fail('capture.target counter quantum does not match the selected adapter');
  return { ...value };
}

function validateWindow(value) {
  exact(value, ['start', 'terminalClosureEnd'], 'capture.window');
  finite(value.start, 'capture.window.start');
  finite(value.terminalClosureEnd, 'capture.window.terminalClosureEnd', value.start);
  return { ...value };
}

function validateProjectedSnapshot(snapshot, read, target, label) {
  if (snapshot.cumulativeCpuSeconds !== read.sample.cumulativeCpuSeconds
    || snapshot.workingSetMiB !== read.sample.workingSetMiB
    || snapshot.counterQuantumSeconds !== target.counterQuantumSeconds) {
    fail(`${label}.raw does not reproduce its projected metric sample`);
  }
}

function decimal(value, label, minimum = 0) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) fail(`${label} must be an unsigned decimal integer`);
  const parsed = BigInt(value);
  if (parsed < BigInt(minimum)) fail(`${label} is below its minimum`);
  return parsed;
}

function validateLinuxRaw(value, read, target, label) {
  exact(value, [
    'pid', 'userTicks', 'systemTicks', 'startTicks', 'residentPages', 'pageSize', 'clockTicks'
  ], `${label}.raw`);
  const statFields = ['R', ...Array(19).fill('0')];
  statFields[11] = String(value.userTicks);
  statFields[12] = String(value.systemTicks);
  statFields[19] = String(value.startTicks);
  const snapshot = parseLinuxProcfsMetricSnapshot({
    stat: `${value.pid} (renderer) ${statFields.join(' ')}`,
    statm: `0 ${value.residentPages} 0 0 0 0 0`,
    pageSize: value.pageSize,
    clockTicks: value.clockTicks
  });
  if (snapshot.raw.pid !== target.pid || String(snapshot.raw.startTicks) !== target.creationIdentity) {
    fail(`${label}.raw does not match the attached Linux process identity`);
  }
  validateProjectedSnapshot(snapshot, read, target, label);
}

function validateMacosRaw(value, read, target, label) {
  exact(value, ['pid', 'creationIdentity', 'cpuTime', 'residentSetKiB'], `${label}.raw`);
  const snapshot = parseMacosPsMetricIdentitySnapshot([
    value.pid,
    value.creationIdentity,
    value.cpuTime,
    value.residentSetKiB
  ].join(' '));
  if (snapshot.raw.pid !== target.pid || snapshot.raw.creationIdentity !== target.creationIdentity) {
    fail(`${label}.raw does not match the attached macOS process identity`);
  }
  validateProjectedSnapshot(snapshot, read, target, label);
}

function validateWindowsRaw(value, read, target, label) {
  exact(value, ['totalProcessorTimeTicks', 'workingSetBytes', 'sampler'], `${label}.raw`);
  exact(value.sampler, [
    'pid', 'creationIdentity', 'readStartTicks', 'readEndTicks', 'stopwatchFrequency', 'bracketSeconds'
  ], `${label}.raw.sampler`);
  const snapshot = parseWindowsPowerShellMetricSnapshot({
    totalProcessorTimeTicks: value.totalProcessorTimeTicks,
    workingSetBytes: value.workingSetBytes
  });
  if (value.sampler.pid !== target.pid || value.sampler.creationIdentity !== target.creationIdentity) {
    fail(`${label}.raw does not match the attached Windows process identity`);
  }
  const readStartTicks = decimal(value.sampler.readStartTicks, `${label}.raw.sampler.readStartTicks`);
  const readEndTicks = decimal(value.sampler.readEndTicks, `${label}.raw.sampler.readEndTicks`);
  const stopwatchFrequency = decimal(value.sampler.stopwatchFrequency, `${label}.raw.sampler.stopwatchFrequency`, 1);
  if (readEndTicks < readStartTicks) fail(`${label}.raw.sampler read bracket is inverted`);
  const bracketSeconds = Number(readEndTicks - readStartTicks) / Number(stopwatchFrequency);
  if (!Number.isFinite(bracketSeconds) || bracketSeconds < 0 || bracketSeconds > 0.05
    || value.sampler.bracketSeconds !== bracketSeconds) {
    fail(`${label}.raw.sampler read bracket is invalid`);
  }
  validateProjectedSnapshot(snapshot, read, target, label);
}

function validateRawAdapterEndpoint(value, read, target, adapterId, label) {
  if (!isObject(value)) fail(`${label}.raw must be an object`);
  if (adapterId === 'linux-procfs-v1') {
    validateLinuxRaw(value, read, target, label);
    return;
  }
  if (adapterId === 'macos-ps-v1') {
    validateMacosRaw(value, read, target, label);
    return;
  }
  if (adapterId === 'windows-powershell-v1') {
    validateWindowsRaw(value, read, target, label);
    return;
  }
  fail(`${label}.raw has an unsupported metric adapter`);
}

function validateRead(value, label, target, adapterId, expectedOrdinal) {
  exact(value, ['sample', 'raw'], label);
  exact(value.sample, [
    'ordinal', 'readStart', 'readEnd', 'cumulativeCpuSeconds',
    'counterQuantumSeconds', 'processIdentity', 'workingSetMiB'
  ], `${label}.sample`);
  const sample = value.sample;
  if (sample.ordinal !== expectedOrdinal) fail(`${label}.sample ordinal is not contiguous`);
  finite(sample.readStart, `${label}.sample.readStart`);
  finite(sample.readEnd, `${label}.sample.readEnd`, sample.readStart);
  if (sample.readEnd - sample.readStart > 0.05) fail(`${label}.sample read bracket exceeds 50 milliseconds`);
  finite(sample.cumulativeCpuSeconds, `${label}.sample.cumulativeCpuSeconds`);
  if (sample.counterQuantumSeconds !== target.counterQuantumSeconds) fail(`${label}.sample counter quantum does not match the target`);
  if (sample.processIdentity !== target.processIdentity) fail(`${label}.sample process identity does not match the target`);
  finite(sample.workingSetMiB, `${label}.sample.workingSetMiB`);
  validateRawAdapterEndpoint(value.raw, value, target, adapterId, label);
  return {
    sample: { ...sample },
    raw: cloneJson(value.raw, `${label}.raw`)
  };
}

function midpoint(read) {
  return (read.sample.readStart + read.sample.readEnd) / 2;
}

function validateTranscript({ prime, inWindowSamples, terminalSample, target, window, adapterId }) {
  const normalizedPrime = validateRead(prime, 'capture.prime', target, adapterId, 0);
  if (!Array.isArray(inWindowSamples) || inWindowSamples.length === 0) {
    fail('capture.inWindowSamples must contain at least one sample');
  }
  const normalizedInWindow = inWindowSamples.map((read, index) => validateRead(
    read,
    `capture.inWindowSamples[${index}]`,
    target,
    adapterId,
    index + 1
  ));
  const normalizedTerminal = validateRead(
    terminalSample,
    'capture.terminalSample',
    target,
    adapterId,
    normalizedInWindow.length + 1
  );
  if (normalizedInWindow[0].sample.readStart !== window.start) {
    fail('capture must retain the immediate workload-start metric sample');
  }
  if (normalizedInWindow.some((read) => read.sample.readEnd > window.terminalClosureEnd)) {
    fail('capture retains an in-window metric sample after terminal closure');
  }
  if (normalizedTerminal.sample.readStart < window.terminalClosureEnd || normalizedTerminal.sample.readEnd <= window.terminalClosureEnd) {
    fail('capture terminal metric sample must begin after terminal closure');
  }
  const samples = [...normalizedInWindow, normalizedTerminal];
  samples.forEach((read, index) => {
    if (index === 0) return;
    const previous = samples[index - 1];
    if (read.sample.cumulativeCpuSeconds < previous.sample.cumulativeCpuSeconds) {
      fail('capture cumulative CPU counter regressed');
    }
    const cadenceMs = (midpoint(read) - midpoint(previous)) * 1000;
    if (cadenceMs < 450 || cadenceMs > 550) fail('capture metric cadence is outside the 450-550ms policy interval');
  });
  return {
    prime: normalizedPrime,
    inWindowSamples: normalizedInWindow,
    terminalSample: normalizedTerminal
  };
}

function body(input) {
  exact(input, [
    'sourceSha', 'runId', 'externalExecutionId', 'observationBoundaryId', 'build',
    'adapterId', 'target', 'window', 'prime', 'inWindowSamples', 'terminalSample'
  ], 'capture input');
  sha(input.sourceSha, 'capture.sourceSha', 40);
  text(input.runId, 'capture.runId');
  uuid(input.externalExecutionId, 'capture.externalExecutionId');
  text(input.observationBoundaryId, 'capture.observationBoundaryId');
  text(input.adapterId, 'capture.adapterId');
  if (!ADAPTER_QUANTA.has(input.adapterId)) fail('capture.adapterId is not registered');
  const target = validateTarget(input.target, input.adapterId);
  const window = validateWindow(input.window);
  const transcript = validateTranscript({
    prime: input.prime,
    inWindowSamples: input.inWindowSamples,
    terminalSample: input.terminalSample,
    target,
    window,
    adapterId: input.adapterId
  });
  return {
    schemaVersion: PERFORMANCE_EXTERNAL_METRIC_CAPTURE_SCHEMA_VERSION,
    sourceSha: input.sourceSha,
    runId: input.runId,
    externalExecutionId: input.externalExecutionId,
    observationBoundaryId: input.observationBoundaryId,
    build: validateBuild(input.build),
    adapterId: input.adapterId,
    target,
    window,
    ...transcript
  };
}

function digest(value) {
  return crypto.createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}

export function createPerformanceExternalMetricCapture(input) {
  const normalized = body(input);
  return freeze({ ...normalized, checksum: digest(normalized) });
}

export function validatePerformanceExternalMetricCapture(value) {
  exact(value, [
    'schemaVersion', 'sourceSha', 'runId', 'externalExecutionId', 'observationBoundaryId',
    'build', 'adapterId', 'target', 'window', 'prime', 'inWindowSamples', 'terminalSample', 'checksum'
  ], 'capture');
  if (value.schemaVersion !== PERFORMANCE_EXTERNAL_METRIC_CAPTURE_SCHEMA_VERSION) fail('capture schema version is invalid');
  sha(value.checksum, 'capture.checksum', 64);
  const normalized = body({
    sourceSha: value.sourceSha,
    runId: value.runId,
    externalExecutionId: value.externalExecutionId,
    observationBoundaryId: value.observationBoundaryId,
    build: value.build,
    adapterId: value.adapterId,
    target: value.target,
    window: value.window,
    prime: value.prime,
    inWindowSamples: value.inWindowSamples,
    terminalSample: value.terminalSample
  });
  if (digest(normalized) !== value.checksum) fail('capture checksum does not match its body');
  return freeze({ ...normalized, checksum: value.checksum });
}

function relativePath(capture) {
  return `${PERFORMANCE_EXTERNAL_METRIC_CAPTURE_DIRECTORY}/${capture.externalExecutionId}-${capture.checksum}.json`;
}

export async function writePerformanceExternalMetricCapture({ outputDirectory, ...input } = {}) {
  text(outputDirectory, 'capture outputDirectory');
  const capture = createPerformanceExternalMetricCapture(input);
  const root = path.resolve(outputDirectory);
  const relative = relativePath(capture);
  const absolute = path.resolve(root, relative);
  const outputRelative = path.relative(root, absolute);
  if (outputRelative.startsWith('..') || path.isAbsolute(outputRelative)) fail('capture output path escapes its output directory');
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, `${stableStringify(capture)}\n`, { encoding: 'utf8', flag: 'wx' });
  return Object.freeze({ capture, absolutePath: absolute, relativePath: relative });
}

export async function readPerformanceExternalMetricCaptures({ outputDirectory } = {}) {
  text(outputDirectory, 'capture outputDirectory');
  const root = path.resolve(outputDirectory);
  const directory = path.join(root, PERFORMANCE_EXTERNAL_METRIC_CAPTURE_DIRECTORY);
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
    if (!entry.isFile() || !entry.name.endsWith('.json')) fail(`capture directory contains an unsupported entry ${entry.name}`);
    const absolute = path.join(directory, entry.name);
    const capture = validatePerformanceExternalMetricCapture(JSON.parse(await fs.readFile(absolute, 'utf8')));
    if (entry.name !== `${capture.externalExecutionId}-${capture.checksum}.json`) {
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
      relativePath: `${PERFORMANCE_EXTERNAL_METRIC_CAPTURE_DIRECTORY}/${entry.name}`
    }));
  }
  return Object.freeze(captures);
}
