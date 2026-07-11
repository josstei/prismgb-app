import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const BASELINE_SCHEMA_VERSION = 1;

const SINGLETON_KINDS = new Set(['source', 'events', 'lifecycle', 'behavior']);
const PERFORMANCE_ROLES = new Set(['ci-integrity', 'reference-comparison']);
const COMPARISON_KINDS = new Set(['harness-overhead', 'instrumentation-overhead']);
const BUILD_VARIANTS = new Set(['production', 'harness-control', 'instrumented']);
const MAX_TEXT_BYTES = 1024;

function fail(message) {
  throw new TypeError(`Baseline report validation failed: ${message}`);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPlainObject(value, label) {
  if (!isPlainObject(value)) fail(`${label} must be an object`);
}

function assertExactKeys(value, keys, label) {
  assertPlainObject(value, label);
  const expected = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) fail(`${label} has unknown key ${key}`);
  }
  for (const key of keys) {
    if (!(key in value)) fail(`${label} is missing key ${key}`);
  }
}

function assertString(value, label, { nullable = false, maxBytes = MAX_TEXT_BYTES } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a nonempty string`);
  if (Buffer.byteLength(value, 'utf8') > maxBytes) fail(`${label} exceeds ${maxBytes} UTF-8 bytes`);
}

function assertHex(value, label, lengths = [40, 64]) {
  assertString(value, label);
  if (!lengths.includes(value.length) || !/^[a-f0-9]+$/.test(value)) {
    fail(`${label} must be a lowercase hexadecimal digest`);
  }
}

function assertSafePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) fail(`${label} must be a positive safe integer`);
}

function normalizeRelativePath(value, label) {
  assertString(value, label, { maxBytes: 4096 });
  const normalized = value.replaceAll('\\', '/');
  if (normalized.startsWith('/') || normalized.split('/').includes('..') || normalized === '.') {
    fail(`${label} must be a normalized repository-relative path`);
  }
  return normalized;
}

function assertJsonValue(value, label, stack = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${label} must not contain a non-finite number`);
    return;
  }
  if (typeof value === 'undefined' || typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
    fail(`${label} is not JSON-serializable`);
  }
  if (stack.has(value)) fail(`${label} must not contain a cycle`);
  stack.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertJsonValue(entry, `${label}[${index}]`, stack));
  } else if (isPlainObject(value)) {
    Object.entries(value).forEach(([key, entry]) => {
      if (typeof key !== 'string') fail(`${label} has a non-string key`);
      assertJsonValue(entry, `${label}.${key}`, stack);
    });
  } else {
    fail(`${label} must contain only plain JSON values`);
  }
  stack.delete(value);
}

export function stableStringify(value) {
  assertJsonValue(value, 'canonical value');
  const stringify = (entry) => {
    if (entry === null) return 'null';
    if (typeof entry === 'string' || typeof entry === 'boolean') return JSON.stringify(entry);
    if (typeof entry === 'number') return JSON.stringify(Object.is(entry, -0) ? 0 : entry);
    if (Array.isArray(entry)) return `[${entry.map(stringify).join(',')}]`;
    return `{${Object.keys(entry).sort().map((key) => `${JSON.stringify(key)}:${stringify(entry[key])}`).join(',')}}`;
  };
  return stringify(value);
}

export function canonicalSha256(value) {
  return crypto.createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}

function validateRepository(repository) {
  assertExactKeys(repository, ['commitSha', 'dirty', 'branch'], 'repository');
  assertHex(repository.commitSha, 'repository.commitSha');
  if (typeof repository.dirty !== 'boolean') fail('repository.dirty must be boolean');
  assertString(repository.branch, 'repository.branch', { nullable: true });
  return { commitSha: repository.commitSha, dirty: repository.dirty, branch: repository.branch };
}

function validateEnvironment(environment) {
  assertExactKeys(environment, ['os', 'arch', 'nodeVersion', 'targetId'], 'environment');
  assertString(environment.os, 'environment.os');
  assertString(environment.arch, 'environment.arch');
  assertString(environment.nodeVersion, 'environment.nodeVersion');
  assertString(environment.targetId, 'environment.targetId', { nullable: true });
  return { ...environment };
}

export function validateCaptureProvenance(captureProvenance) {
  assertPlainObject(captureProvenance, 'captureProvenance');
  if (captureProvenance.provider === 'github-actions') {
    assertExactKeys(captureProvenance, [
      'provider', 'sourceSha', 'analysisSha256', 'repository', 'workflowRef', 'workflowRunId', 'workflowRunAttempt', 'eventName', 'producer'
    ], 'captureProvenance');
    assertHex(captureProvenance.sourceSha, 'captureProvenance.sourceSha');
    assertHex(captureProvenance.analysisSha256, 'captureProvenance.analysisSha256', [64]);
    ['repository', 'workflowRef', 'workflowRunId', 'eventName'].forEach((key) => assertString(captureProvenance[key], `captureProvenance.${key}`));
    assertSafePositiveInteger(captureProvenance.workflowRunAttempt, 'captureProvenance.workflowRunAttempt');
    assertExactKeys(captureProvenance.producer, ['jobId', 'targetId', 'artifactName'], 'captureProvenance.producer');
    assertString(captureProvenance.producer.jobId, 'captureProvenance.producer.jobId');
    assertString(captureProvenance.producer.targetId, 'captureProvenance.producer.targetId', { nullable: true });
    assertString(captureProvenance.producer.artifactName, 'captureProvenance.producer.artifactName');
    return {
      ...captureProvenance,
      producer: { ...captureProvenance.producer }
    };
  }
  if (captureProvenance.provider === 'local') {
    assertExactKeys(captureProvenance, ['provider', 'sourceSha', 'analysisSha256', 'captureSessionId', 'producer'], 'captureProvenance');
    assertHex(captureProvenance.sourceSha, 'captureProvenance.sourceSha');
    assertHex(captureProvenance.analysisSha256, 'captureProvenance.analysisSha256', [64]);
    assertString(captureProvenance.captureSessionId, 'captureProvenance.captureSessionId');
    assertExactKeys(captureProvenance.producer, ['role', 'targetId', 'reportSetId'], 'captureProvenance.producer');
    assertString(captureProvenance.producer.role, 'captureProvenance.producer.role');
    assertString(captureProvenance.producer.targetId, 'captureProvenance.producer.targetId', { nullable: true });
    assertString(captureProvenance.producer.reportSetId, 'captureProvenance.producer.reportSetId');
    return {
      ...captureProvenance,
      producer: { ...captureProvenance.producer }
    };
  }
  fail('captureProvenance.provider must be github-actions or local');
}

export function coreCaptureIdentity(captureProvenance) {
  const provenance = validateCaptureProvenance(captureProvenance);
  const { producer, ...identity } = provenance;
  return identity;
}

function requireDimension(dimensions, key) {
  if (!(key in dimensions)) fail(`evidence dimensions are missing ${key}`);
  return dimensions[key];
}

export function deriveEvidenceId(kind, dimensions = {}) {
  assertString(kind, 'kind');
  assertPlainObject(dimensions, 'evidence dimensions');
  if (SINGLETON_KINDS.has(kind)) return kind;
  if (kind === 'package') {
    const targetId = requireDimension(dimensions, 'targetId');
    const buildMode = requireDimension(dimensions, 'buildMode');
    assertString(targetId, 'dimensions.targetId');
    assertString(buildMode, 'dimensions.buildMode');
    return `package:${targetId}:${buildMode}`;
  }
  if (kind === 'performance-experiment') {
    const experimentId = requireDimension(dimensions, 'experimentId');
    assertString(experimentId, 'dimensions.experimentId');
    return `performance-experiment:${experimentId}`;
  }
  if (kind === 'performance-run') {
    const role = requireDimension(dimensions, 'experimentRole');
    const fingerprint = requireDimension(dimensions, 'comparisonFingerprint');
    const comparisonKind = requireDimension(dimensions, 'comparisonKind');
    const backend = requireDimension(dimensions, 'backend');
    const pairIndex = requireDimension(dimensions, 'pairIndex');
    const buildVariant = requireDimension(dimensions, 'buildVariant');
    const attemptIndex = requireDimension(dimensions, 'attemptIndex');
    if (!PERFORMANCE_ROLES.has(role)) fail('dimensions.experimentRole is invalid');
    assertHex(fingerprint, 'dimensions.comparisonFingerprint', [64]);
    if (!COMPARISON_KINDS.has(comparisonKind)) fail('dimensions.comparisonKind is invalid');
    assertString(backend, 'dimensions.backend');
    assertSafePositiveInteger(pairIndex, 'dimensions.pairIndex');
    if (!BUILD_VARIANTS.has(buildVariant)) fail('dimensions.buildVariant is invalid');
    assertSafePositiveInteger(attemptIndex, 'dimensions.attemptIndex');
    return `performance-run:${role}:${fingerprint}:${comparisonKind}:${backend}:${pairIndex}:${buildVariant}:${attemptIndex}`;
  }
  if (kind === 'performance-aggregate') {
    const role = requireDimension(dimensions, 'experimentRole');
    const fingerprint = requireDimension(dimensions, 'comparisonFingerprint');
    const comparisonKind = requireDimension(dimensions, 'comparisonKind');
    const backend = requireDimension(dimensions, 'backend');
    const buildVariant = requireDimension(dimensions, 'buildVariant');
    if (!PERFORMANCE_ROLES.has(role)) fail('dimensions.experimentRole is invalid');
    assertHex(fingerprint, 'dimensions.comparisonFingerprint', [64]);
    if (!COMPARISON_KINDS.has(comparisonKind)) fail('dimensions.comparisonKind is invalid');
    assertString(backend, 'dimensions.backend');
    if (!BUILD_VARIANTS.has(buildVariant)) fail('dimensions.buildVariant is invalid');
    return `performance-aggregate:${role}:${fingerprint}:${comparisonKind}:${backend}:${buildVariant}`;
  }
  if (kind === 'performance-comparison') {
    const role = requireDimension(dimensions, 'experimentRole');
    const fingerprint = requireDimension(dimensions, 'comparisonFingerprint');
    const comparisonKind = requireDimension(dimensions, 'comparisonKind');
    const backend = requireDimension(dimensions, 'backend');
    if (!PERFORMANCE_ROLES.has(role)) fail('dimensions.experimentRole is invalid');
    assertHex(fingerprint, 'dimensions.comparisonFingerprint', [64]);
    if (!COMPARISON_KINDS.has(comparisonKind)) fail('dimensions.comparisonKind is invalid');
    assertString(backend, 'dimensions.backend');
    return `performance-comparison:${role}:${fingerprint}:${comparisonKind}:${backend}`;
  }
  if (kind === 'hardware-qualification') {
    if (dimensions.noHostSelected === true) return 'hardware-qualification:no-host-selected';
    const fingerprint = requireDimension(dimensions, 'qualificationFingerprint');
    assertHex(fingerprint, 'dimensions.qualificationFingerprint', [64]);
    return `hardware-qualification:${fingerprint}`;
  }
  fail(`kind ${kind} does not have an evidence ID definition`);
}

function validateInputs(inputs) {
  assertPlainObject(inputs, 'inputs');
  const keys = Object.keys(inputs);
  if (keys.length === 0) fail('inputs must not be empty');
  const normalized = {};
  for (const [key, value] of Object.entries(inputs)) {
    if (key === 'paths') {
      if (!Array.isArray(value)) fail('inputs.paths must be an array');
      const paths = value.map((entry, index) => normalizeRelativePath(entry, `inputs.paths[${index}]`));
      if (new Set(paths).size !== paths.length || paths.join('\u0000') !== [...paths].sort().join('\u0000')) {
        fail('inputs.paths must be sorted and unique');
      }
      normalized.paths = paths;
      continue;
    }
    assertJsonValue(value, `inputs.${key}`);
    normalized[key] = value;
  }
  return normalized;
}

function normalizeWarnings(warnings) {
  if (!Array.isArray(warnings)) fail('warnings must be an array');
  const normalized = warnings.map((warning, index) => {
    assertString(warning, `warnings[${index}]`);
    return warning;
  });
  if (new Set(normalized).size !== normalized.length || normalized.join('\u0000') !== [...normalized].sort().join('\u0000')) {
    fail('warnings must be sorted and unique');
  }
  return normalized;
}

export function createBaselineEnvelope(options) {
  assertPlainObject(options, 'baseline envelope options');
  const allowedKeys = new Set(['schemaVersion', 'kind', 'evidenceId', 'dimensions', 'generatedAt', 'repository', 'environment', 'captureProvenance', 'inputs', 'metrics', 'warnings']);
  for (const key of Object.keys(options)) {
    if (!allowedKeys.has(key)) fail(`baseline envelope options have unknown key ${key}`);
  }
  const schemaVersion = options.schemaVersion ?? BASELINE_SCHEMA_VERSION;
  if (schemaVersion !== BASELINE_SCHEMA_VERSION) fail(`schemaVersion must be ${BASELINE_SCHEMA_VERSION}`);
  assertString(options.kind, 'kind');
  const dimensions = options.dimensions ?? {};
  const evidenceId = deriveEvidenceId(options.kind, dimensions);
  if (options.evidenceId !== undefined && options.evidenceId !== evidenceId) {
    fail('evidenceId does not match its canonical dimensions');
  }
  assertString(options.generatedAt, 'generatedAt');
  if (Number.isNaN(Date.parse(options.generatedAt))) fail('generatedAt must be an ISO-compatible timestamp');
  const repository = validateRepository(options.repository);
  const environment = validateEnvironment(options.environment);
  const captureProvenance = validateCaptureProvenance(options.captureProvenance);
  const inputs = validateInputs(options.inputs);
  assertPlainObject(options.metrics, 'metrics');
  assertJsonValue(options.metrics, 'metrics');
  const warnings = normalizeWarnings(options.warnings ?? []);
  return {
    schemaVersion,
    kind: options.kind,
    evidenceId,
    generatedAt: options.generatedAt,
    repository,
    environment,
    captureProvenance,
    inputs,
    metrics: options.metrics,
    warnings
  };
}

export function validateBaselineEnvelope(report, expectedKind) {
  assertExactKeys(report, ['schemaVersion', 'kind', 'evidenceId', 'generatedAt', 'repository', 'environment', 'captureProvenance', 'inputs', 'metrics', 'warnings'], 'baseline envelope');
  if (expectedKind !== undefined && report.kind !== expectedKind) fail(`expected ${expectedKind} report but received ${report.kind}`);
  return createBaselineEnvelope({ ...report, dimensions: inferEvidenceDimensions(report) });
}

function inferEvidenceDimensions(report) {
  const id = report.evidenceId;
  if (SINGLETON_KINDS.has(report.kind)) return {};
  const segments = id.split(':');
  if (report.kind === 'package' && segments.length === 3) return { targetId: segments[1], buildMode: segments[2] };
  if (report.kind === 'performance-experiment' && segments.length === 2) return { experimentId: segments[1] };
  if (report.kind === 'performance-run' && segments.length === 8) return { experimentRole: segments[1], comparisonFingerprint: segments[2], comparisonKind: segments[3], backend: segments[4], pairIndex: Number(segments[5]), buildVariant: segments[6], attemptIndex: Number(segments[7]) };
  if (report.kind === 'performance-aggregate' && segments.length === 6) return { experimentRole: segments[1], comparisonFingerprint: segments[2], comparisonKind: segments[3], backend: segments[4], buildVariant: segments[5] };
  if (report.kind === 'performance-comparison' && segments.length === 5) return { experimentRole: segments[1], comparisonFingerprint: segments[2], comparisonKind: segments[3], backend: segments[4] };
  if (report.kind === 'hardware-qualification') {
    return id === 'hardware-qualification:no-host-selected' ? { noHostSelected: true } : { qualificationFingerprint: segments[1] };
  }
  fail('evidenceId cannot be parsed for its kind');
}

export function writeBaselineReport(outputPath, report) {
  const normalized = validateBaselineEnvelope(report);
  if (typeof outputPath !== 'string' || outputPath.length === 0) fail('outputPath must be a nonempty path');
  const directory = path.dirname(outputPath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = path.join(directory, `.${path.basename(outputPath)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporaryPath, `${stableStringify(normalized)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    fs.renameSync(temporaryPath, outputPath);
  } catch (error) {
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
      // The original write error is more actionable.
    }
    throw error;
  }
  return normalized;
}

export function readBaselineReport(inputPath, expectedKind) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read baseline report ${inputPath}: ${error.message}`);
  }
  return validateBaselineEnvelope(parsed, expectedKind);
}
