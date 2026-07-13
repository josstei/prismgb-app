import fs from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import {
  canonicalSha256,
  coreCaptureIdentity,
  createBaselineEnvelope,
  stableStringify,
  validateCaptureProvenance
} from './baseline-report.js';
import { validatePerformancePairPlan, validatePerformanceRunJoin } from './performance-pair-plan.js';
import { validatePerformanceExternalMetricCapture } from './performance-external-metric-capture.js';
import { validatePerformanceMetricSessionCapture } from './performance-metric-session-capture.js';
import { validatePerformanceSentinelCapture } from './performance-sentinel-capture.js';
import { validatePerformanceWorkloadCapture } from './performance-workload-capture.js';

const POLICY_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../manifests/baseline-policy.json');

// Pins the policy-owned v1 transcode registry without duplicating its semantic table in code.
const TRANSCODE_DECISION_POLICY_V1_INTEGRITY_SHA256 = '8c53e47b7ba7fe50368e779dc4e1c2028901acf4e546e02679f9a9a3f78e5bb3';

function compareCodeUnitStrings(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function sortCodeUnitStrings(values) {
  return [...values].sort(compareCodeUnitStrings);
}

const REQUIRED_OPERATION_IDS = [
  'build-spawn',
  'generic-transport-spawn',
  'metric-adapter-session-open',
  'metric-adapter-session-close',
  'electron-harness-spawn',
  'production-sentinel-spawn',
  'internal-reset'
];
const ALLOCATION_OPERATIONS = [
  'video-frame-image-bitmap-request',
  'uniform-float32-array',
  'gpu-buffer-request',
  'gpu-texture-request',
  'bind-group-create',
  'render-pass-plan-materialization'
];
const EXPECTED_RAW_PROCESS_CLASSES = [
  'Browser', 'Tab', 'Utility', 'Zygote', 'Sandbox helper', 'GPU',
  'Pepper Plugin', 'Pepper Plugin Broker', 'Unknown'
];
const EXPECTED_PROCESS_CLASSES = ['application-root', 'application-renderer'];
const EXPECTED_ENVIRONMENT_STATIC_FIELDS = ['host', 'runtime', 'gpu', 'switches'];
const EXPECTED_ENVIRONMENT_DYNAMIC_FIELDS = ['power', 'display', 'refreshRate', 'devicePixelRatio', 'thermal', 'gpuSwitch'];
const EXPECTED_ELECTRON_ENVIRONMENT_EVENTS = [
  'on-ac', 'on-battery', 'speed-limit-change', 'thermal-state-change',
  'display-added', 'display-removed', 'display-metrics-changed', 'gpu-info-update'
];
const EXPECTED_SOURCE_DISPOSITIONS = [
  'duplicateMediaTime', 'noCurrentData', 'backpressure', 'sessionInactive',
  'workerNotReady', 'bitmapCreationFailed', 'enqueueFailed', 'drawCompleted',
  'driverInactive', 'driverFailed', 'workerFrameSubmitted'
];
const EXPECTED_COMPARISON_FINGERPRINT_FIELDS = [
  'schemaVersion', 'policyHashes', 'initialEnvironment', 'workload', 'reset',
  'processAdapter', 'seed', 'backend', 'backendExecutionIdentity'
];
const EXPECTED_COMPARISON_FINGERPRINT_EXCLUDED_FIELDS = [
  'sourceSha', 'experimentRole', 'experimentId', 'captureProvenance',
  'comparisonKind', 'buildVariant', 'bundleHash', 'pairIndex', 'attemptIndex',
  'executionId', 'timestamps', 'rawMeasurements'
];
const EXPECTED_QUALIFICATION_FINGERPRINT_FIELDS = [
  'schemaVersion', 'sourceSha', 'controlBundle', 'workload', 'initialEnvironment',
  'requestedBackend', 'selectedBackend', 'observedBackend', 'qualificationState',
  'unavailabilityBranch', 'adapter', 'backendExecutionIdentity', 'resetVersion',
  'policyHashes', 'processAdapter', 'seedManifestHash'
];
const EXPECTED_QUALIFICATION_FINGERPRINT_EXCLUDED_FIELDS = [
  'experimentId', 'ledgerSequence', 'operationMarker', 'launchId', 'executionId',
  'timestamps', 'pids', 'paths'
];
const EXPECTED_RAW_KIND_SORT_KEYS = Object.freeze({
  'source-opportunity': ['runId', 'captureOrdinal'],
  'backend-operation': ['runId', 'captureOrdinal'],
  'worker-message': ['runId', 'captureOrdinal'],
  'sentinel-observation': ['runId', 'captureOrdinal'],
  'process-observation': ['captureKind', 'scopeKind', 'scopeId', 'observationOrdinal'],
  'environment-observation': ['captureKind', 'scopeKind', 'scopeId', 'source', 'sourceSequence'],
  'controller-operation': ['captureKind', 'scopeKind', 'scopeId', 'controlSequence'],
  'frame-request': ['runId', 'measurementEpochId', 'sourceSequence', 'requestOrdinal', 'operationId', 'sourceLocationId'],
  'lifecycle-request': ['runId', 'executionId', 'lifecyclePhase', 'phaseSequence', 'operationId', 'sourceLocationId', 'requestOrdinal'],
  'timing-span': ['runId', 'measurementWindowId', 'sourceSequence', 'metricId', 'spanOrdinal'],
  'cpu-sample': ['runId', 'ordinal']
});
const EXPECTED_ALLOCATION_COVERAGE = [
  { operationId: 'video-frame-image-bitmap-request', sourceLocationId: 'video-session:create-image-bitmap', carrier: 'frame-request', cardinality: 'per-frame', byteSemantics: 'rgba-transfer-footprint' },
  { operationId: 'uniform-float32-array', sourceLocationId: 'webgpu-driver:uniform-float32-array', carrier: 'frame-request', cardinality: 'per-frame', byteSemantics: 'requested-byte-length' },
  { operationId: 'gpu-buffer-request', sourceLocationId: 'webgpu-driver:create-buffer', carrier: 'lifecycle-request', lifecyclePhase: 'startup', cardinality: 4, byteSemantics: 'descriptor-size' },
  { operationId: 'gpu-texture-request', sourceLocationId: 'webgpu-driver:create-texture', carrier: 'lifecycle-request', lifecyclePhase: 'startup', cardinality: 3, byteSemantics: 'logical-texel-footprint' },
  { operationId: 'bind-group-create', sourceLocationId: 'webgpu-driver:create-bind-group', carrier: 'frame-request', cardinality: 'per-frame', byteSemantics: 'count-only-unavailable' },
  { operationId: 'render-pass-plan-materialization', sourceLocationId: 'webgpu-driver:materialize-render-plan', carrier: 'frame-request', cardinality: 'per-frame', byteSemantics: 'count-only-unavailable' }
];
const EXPECTED_ABORT_TUPLES = (() => {
  const tuples = [
    { phase: 'close', backend: 'none', reason: 'metric-adapter-close-failure' },
    { phase: 'open', backend: 'none', reason: 'metric-adapter-resource-owned' },
    { phase: 'reset-a', backend: 'none', reason: 'reset-failure' },
    { phase: 'reset-b', backend: 'none', reason: 'reset-failure' }
  ];
  const sharedReasons = [
    'bitmapCreationFailed', 'cadence-insufficient', 'crash', 'drain-timeout',
    'driverFailed', 'driverInactive', 'enqueueFailed', 'environment-drift',
    'host-noise', 'membership-failure', 'metrics-broker-interference',
    'pid-identity-change', 'sample-floor', 'sessionInactive',
    'source-token-span-join-corruption', 'submission-seal-timeout',
    'unclean-shutdown'
  ];
  for (const phase of ['side-a', 'side-b']) {
    for (const backend of ['canvas2d', 'webgpu']) {
      for (const reason of sharedReasons) tuples.push({ phase, backend, reason });
      if (backend === 'webgpu') {
        tuples.push({ phase, backend, reason: 'worker-error' });
        tuples.push({ phase, backend, reason: 'workerNotReady' });
      }
    }
  }
  return tuples.sort((left, right) => compareCodeUnitStrings(
    `${left.phase}\u0000${left.backend}\u0000${left.reason}`,
    `${right.phase}\u0000${right.backend}\u0000${right.reason}`
  ));
})();

function fail(message) {
  throw new TypeError(`Performance evidence failed: ${message}`);
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
    if (!expected.has(key)) fail(`${label} has a forbidden field ${key}`);
  }
  for (const key of keys) {
    if (!(key in value)) fail(`${label} is missing ${key}`);
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
}

function assertString(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a nonempty string`);
}

function assertSafeInteger(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(`${label} must be a safe integer >= ${minimum}`);
}

function assertBoolean(value, label) {
  if (typeof value !== 'boolean') fail(`${label} must be a boolean`);
}

function assertFiniteNumber(value, label, minimum = undefined) {
  if (!Number.isFinite(value) || (minimum !== undefined && value < minimum)) fail(`${label} must be a finite number${minimum === undefined ? '' : ` >= ${minimum}`}`);
}

function assertSha(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(`${label} must be a lowercase SHA-256 digest`);
}

function assertExactTopLevelKeys(value) {
  const expected = [
    'schemaVersion', 'programOriginSha', 'analysisSha256', 'outputRoot', 'sourcePolicy', 'reportPolicy',
    'performanceOperationRegistry', 'processAdapterRegistry', 'performanceEnvironmentPolicy', 'performanceFailurePolicy',
    'performanceDispositionPolicy', 'performanceMetricPolicy', 'allocationEvidencePolicy', 'comparisonFingerprintPolicy',
    'capacityFixturePolicy', 'qualificationFingerprintPolicy', 'performanceEvidenceChunkPolicy', 'performanceLimits',
    'performanceBuildEvidencePolicy', 'performanceCaptureAttributionRegistry', 'performanceCaptureKindRegistry',
    'performanceComparisonRegistry', 'performanceRunMetricRegistry', 'performanceRunAllocationStateRegistry',
    'performanceGateRegistry', 'performanceControllerAuditPolicy', 'performanceQualificationCapturePolicy',
    'transcodeDecisionPolicy'
  ];
  assertObject(value, 'baseline policy');
  const actual = Object.keys(value).sort();
  if (actual.join('\u0000') !== [...expected].sort().join('\u0000')) fail('baseline policy has missing or unknown sections');
}

function clone(value) {
  return JSON.parse(stableStringify(value));
}

function assertExactStringArray(value, expected, label) {
  assertArray(value, label);
  value.forEach((entry, index) => assertString(entry, `${label}[${index}]`));
  if (value.join('\u0000') !== expected.join('\u0000')) fail(`${label} is incomplete or reordered`);
}

function assertSortedUniqueStringArray(value, label, { nonEmpty = true } = {}) {
  assertArray(value, label);
  if (nonEmpty && value.length === 0) fail(`${label} must not be empty`);
  value.forEach((entry, index) => assertString(entry, `${label}[${index}]`));
  if (new Set(value).size !== value.length || stableStringify(value) !== stableStringify(sortCodeUnitStrings(value))) {
    fail(`${label} must be a sorted, unique string array`);
  }
}

function assertPathArray(value, label) {
  assertArray(value, label);
  if (value.length === 0) fail(`${label} must not be empty`);
  const seen = new Set();
  value.forEach((entry, index) => {
    assertString(entry, `${label}[${index}]`);
    if (entry.startsWith('/') || entry.split('/').includes('..') || seen.has(entry)) fail(`${label} contains an invalid or duplicate path`);
    seen.add(entry);
  });
}

export function validateBaselinePolicy(policy) {
  assertExactTopLevelKeys(policy);
  if (policy.schemaVersion !== 2) fail('baseline policy schemaVersion must be 2');
  if (policy.programOriginSha !== '9a7839ce47c61982f6eab836c496b8469f01a9ca') fail('baseline policy programOriginSha is immutable');
  if (policy.analysisSha256 !== '0c6a4ccbe48b9b12e4c58bd153ae6f5c04bed82fb489c5a2402d21934b4c8fba') fail('baseline policy analysisSha256 is immutable');
  if (policy.outputRoot !== 'artifacts/codebase-baseline') fail('baseline policy outputRoot is invalid');

  assertExactKeys(policy.sourcePolicy, ['version', 'countedExtensions', 'generatedArtifactPaths', 'buildOutputArtifactPaths', 'generatedResidue', 'vendoredDirectoryPrefixes', 'phase0OwnedPathPrefixes'], 'sourcePolicy');
  if (policy.sourcePolicy.version !== 1) fail('sourcePolicy.version must be 1');
  assertExactKeys(policy.sourcePolicy.countedExtensions, ['source', 'test', 'script', 'document'], 'sourcePolicy.countedExtensions');
  for (const category of ['source', 'test', 'script', 'document']) {
    assertArray(policy.sourcePolicy.countedExtensions[category], `sourcePolicy.countedExtensions.${category}`);
    if (policy.sourcePolicy.countedExtensions[category].length === 0 || new Set(policy.sourcePolicy.countedExtensions[category]).size !== policy.sourcePolicy.countedExtensions[category].length || policy.sourcePolicy.countedExtensions[category].some((extension) => typeof extension !== 'string' || !/^\.[a-z0-9]+$/i.test(extension))) {
      fail(`sourcePolicy.countedExtensions.${category} contains an invalid extension`);
    }
  }
  assertPathArray(policy.sourcePolicy.generatedArtifactPaths, 'sourcePolicy.generatedArtifactPaths');
  assertPathArray(policy.sourcePolicy.buildOutputArtifactPaths, 'sourcePolicy.buildOutputArtifactPaths');
  assertExactKeys(policy.sourcePolicy.generatedResidue, ['index.html'], 'sourcePolicy.generatedResidue');
  if (policy.sourcePolicy.generatedResidue['index.html'] !== 'vite-electron-placeholder-only') fail('sourcePolicy.generatedResidue is invalid');
  assertPathArray(policy.sourcePolicy.vendoredDirectoryPrefixes, 'sourcePolicy.vendoredDirectoryPrefixes');
  assertPathArray(policy.sourcePolicy.phase0OwnedPathPrefixes, 'sourcePolicy.phase0OwnedPathPrefixes');

  assertExactKeys(policy.reportPolicy, ['version', 'schemaVersion', 'kinds', 'experimentRoles', 'comparisonKinds', 'buildVariants', 'backends'], 'reportPolicy');
  if (policy.reportPolicy.version !== 1 || policy.reportPolicy.schemaVersion !== 1) fail('reportPolicy version is invalid');
  const requiredReportKinds = ['source', 'events', 'lifecycle', 'behavior', 'package', 'performance-experiment', 'performance-run', 'performance-aggregate', 'performance-comparison', 'hardware-qualification'];
  assertExactStringArray(policy.reportPolicy.kinds, requiredReportKinds, 'reportPolicy.kinds');
  assertExactStringArray(policy.reportPolicy.experimentRoles, ['ci-integrity', 'reference-comparison'], 'reportPolicy.experimentRoles');
  assertExactStringArray(policy.reportPolicy.comparisonKinds, ['harness-overhead', 'instrumentation-overhead'], 'reportPolicy.comparisonKinds');
  assertExactStringArray(policy.reportPolicy.buildVariants, ['production', 'harness-control', 'instrumented'], 'reportPolicy.buildVariants');
  assertExactStringArray(policy.reportPolicy.backends, ['canvas2d', 'webgpu'], 'reportPolicy.backends');

  assertExactKeys(policy.performanceOperationRegistry, ['version', 'operations'], 'performanceOperationRegistry');
  if (policy.performanceOperationRegistry.version !== 2) fail('performanceOperationRegistry.version must be 2');
  assertArray(policy.performanceOperationRegistry.operations, 'performanceOperationRegistry.operations');
  const operationIds = policy.performanceOperationRegistry.operations.map((entry) => entry.id);
  if (operationIds.join('\u0000') !== REQUIRED_OPERATION_IDS.join('\u0000')) fail('performanceOperationRegistry operations are incomplete or reordered');
  if (new Set(operationIds).size !== operationIds.length) fail('performanceOperationRegistry has duplicate operations');
  for (const operation of policy.performanceOperationRegistry.operations) {
    assertExactKeys(operation, ['id', 'variant', 'shapes'], 'performance operation');
    assertString(operation.id, 'performance operation id');
    assertString(operation.variant, 'performance operation variant');
    if (operation.id !== operation.variant) fail('performance operation id and variant must match');
    assertArray(operation.shapes, 'performance operation shapes');
    if (operation.shapes.length === 0) fail('performance operation shapes must not be empty');
    for (const [shapeIndex, shape] of operation.shapes.entries()) {
      assertExactKeys(shape, ['discriminator', 'requiredFields', 'forbiddenFields', 'terminalField', 'predecessors', 'successors'], `performance operation ${operation.id} shapes[${shapeIndex}]`);
      assertObject(shape.discriminator, `performance operation ${operation.id} shapes[${shapeIndex}].discriminator`);
      if (Object.keys(shape.discriminator).length === 0) fail('performance operation discriminator must not be empty');
      for (const [key, value] of Object.entries(shape.discriminator)) {
        assertString(key, 'performance operation discriminator key');
        if (typeof value !== 'string' && typeof value !== 'boolean') {
          fail(`performance operation discriminator.${key} must be a string or boolean literal`);
        }
        if (typeof value === 'string') assertString(value, `performance operation discriminator.${key}`);
      }
      assertSortedUniqueStringArray(shape.requiredFields, `performance operation ${operation.id} shapes[${shapeIndex}].requiredFields`);
      assertSortedUniqueStringArray(shape.forbiddenFields, `performance operation ${operation.id} shapes[${shapeIndex}].forbiddenFields`, { nonEmpty: false });
      if (shape.requiredFields.some((field) => shape.forbiddenFields.includes(field))) fail('performance operation required and forbidden fields overlap');
      assertString(shape.terminalField, `performance operation ${operation.id} shapes[${shapeIndex}].terminalField`);
      assertArray(shape.predecessors, `performance operation ${operation.id} shapes[${shapeIndex}].predecessors`);
      assertArray(shape.successors, `performance operation ${operation.id} shapes[${shapeIndex}].successors`);
      for (const relation of ['predecessors', 'successors']) {
        shape[relation].forEach((entry, relationIndex) => {
          assertString(entry, `performance operation ${operation.id} shapes[${shapeIndex}].${relation}[${relationIndex}]`);
          if (!operationIds.includes(entry)) fail(`performance operation ${operation.id} references unknown ${relation} operation ${entry}`);
        });
        if (new Set(shape[relation]).size !== shape[relation].length) {
          fail(`performance operation ${operation.id} shapes[${shapeIndex}].${relation} must be unique`);
        }
      }
      if (shape.forbiddenFields.includes(shape.terminalField)) {
        fail(`performance operation ${operation.id} registry terminal field must not be forbidden`);
      }
    }
    for (let leftIndex = 0; leftIndex < operation.shapes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < operation.shapes.length; rightIndex += 1) {
        const left = operation.shapes[leftIndex].discriminator;
        const right = operation.shapes[rightIndex].discriminator;
        const hasConflict = Object.keys(left).some((field) => field in right && left[field] !== right[field]);
        if (!hasConflict) fail(`performance operation ${operation.id} has overlapping discriminator shapes`);
      }
    }
  }

  assertExactKeys(policy.processAdapterRegistry, [
    'version', 'adapters', 'rawAdapterKinds', 'rawProcessClasses', 'processClasses',
    'ownershipClasses', 'healthStates', 'closureStates', 'processObservationSchemas',
    'cpuSampleRawAuthorityPolicy'
  ], 'processAdapterRegistry');
  if (policy.processAdapterRegistry.version !== 2) fail('processAdapterRegistry.version must be 2');
  assertArray(policy.processAdapterRegistry.adapters, 'processAdapterRegistry.adapters');
  if (policy.processAdapterRegistry.adapters.length !== 3) fail('processAdapterRegistry must contain three supported adapters');
  if (new Set(policy.processAdapterRegistry.adapters.map((adapter) => adapter.id)).size !== policy.processAdapterRegistry.adapters.length) fail('process adapters must be unique');
  const expectedAdapters = new Map([['linux-procfs-v1', ['linux', 'procfs']], ['macos-ps-v1', ['darwin', 'ps']], ['windows-powershell-v1', ['win32', 'powershell']]]);
  for (const adapter of policy.processAdapterRegistry.adapters) {
    assertExactKeys(adapter, ['id', 'platform', 'metricSource', 'counterQuantumSeconds'], 'process adapter');
    assertString(adapter.id, 'process adapter id');
    assertString(adapter.platform, 'process adapter platform');
    assertString(adapter.metricSource, 'process adapter metricSource');
    assertFiniteNumber(adapter.counterQuantumSeconds, 'process adapter counterQuantumSeconds', 0);
    const expected = expectedAdapters.get(adapter.id);
    if (!expected || adapter.platform !== expected[0] || adapter.metricSource !== expected[1] || adapter.counterQuantumSeconds <= 0 || adapter.counterQuantumSeconds > 0.01) fail('process adapter is incompatible with the closed adapter registry');
  }
  assertExactStringArray(policy.processAdapterRegistry.processClasses, EXPECTED_PROCESS_CLASSES, 'processAdapterRegistry.processClasses');
  assertArray(policy.processAdapterRegistry.rawAdapterKinds, 'processAdapterRegistry.rawAdapterKinds');
  const rawAdapterKeys = new Set();
  for (const [index, adapter] of policy.processAdapterRegistry.rawAdapterKinds.entries()) {
    const label = `processAdapterRegistry.rawAdapterKinds[${index}]`;
    assertExactKeys(adapter, [
      'adapterId', 'rawAdapterKind', 'decoderRule', 'identityFields',
      'identityOptionalFields', 'sampleFields', 'sampleOptionalFields', 'nestedFields'
    ], label);
    assertString(adapter.adapterId, `${label}.adapterId`);
    assertString(adapter.rawAdapterKind, `${label}.rawAdapterKind`);
    if (adapter.decoderRule !== null) assertString(adapter.decoderRule, `${label}.decoderRule`);
    for (const field of ['identityFields', 'identityOptionalFields', 'sampleFields', 'sampleOptionalFields']) {
      assertArray(adapter[field], `${label}.${field}`);
      adapter[field].forEach((entry, fieldIndex) => assertString(entry, `${label}.${field}[${fieldIndex}]`));
      if (new Set(adapter[field]).size !== adapter[field].length) fail(`${label}.${field} must not contain duplicates`);
    }
    assertObject(adapter.nestedFields, `${label}.nestedFields`);
    for (const [field, nested] of Object.entries(adapter.nestedFields)) {
      assertString(field, `${label}.nestedFields key`);
      assertArray(nested, `${label}.nestedFields.${field}`);
      nested.forEach((entry, nestedIndex) => assertString(entry, `${label}.nestedFields.${field}[${nestedIndex}]`));
    }
    const key = `${adapter.adapterId}\u0000${adapter.rawAdapterKind}`;
    if (rawAdapterKeys.has(key)) fail('raw process adapter registrations must be unique');
    rawAdapterKeys.add(key);
  }
  assertArray(policy.processAdapterRegistry.processObservationSchemas, 'processAdapterRegistry.processObservationSchemas');
  for (const [index, schema] of policy.processAdapterRegistry.processObservationSchemas.entries()) {
    const label = `processAdapterRegistry.processObservationSchemas[${index}]`;
    assertExactKeys(schema, [
      'adapterIds', 'observationKinds', 'captureKinds', 'carrierSchema',
      'processClass', 'ownership', 'alive', 'healthState', 'closureState',
      'processIdentityRule'
    ], label);
    for (const field of ['adapterIds', 'observationKinds', 'captureKinds']) {
      assertArray(schema[field], `${label}.${field}`);
      if (schema[field].length === 0 || new Set(schema[field]).size !== schema[field].length) fail(`${label}.${field} must be nonempty and unique`);
      schema[field].forEach((entry, fieldIndex) => assertString(entry, `${label}.${field}[${fieldIndex}]`));
    }
    for (const field of ['carrierSchema', 'processClass', 'ownership', 'processIdentityRule']) assertString(schema[field], `${label}.${field}`);
    assertBoolean(schema.alive, `${label}.alive`);
    if (schema.healthState !== null) assertString(schema.healthState, `${label}.healthState`);
    if (schema.closureState !== null) assertString(schema.closureState, `${label}.closureState`);
  }
  const cpuAuthority = policy.processAdapterRegistry.cpuSampleRawAuthorityPolicy;
  assertExactKeys(cpuAuthority, ['version', 'wrapperFields', 'samplePhaseDerivation', 'schemas'], 'processAdapterRegistry.cpuSampleRawAuthorityPolicy');
  if (cpuAuthority.version !== 1) fail('processAdapterRegistry.cpuSampleRawAuthorityPolicy.version must be 1');
  assertExactStringArray(cpuAuthority.wrapperFields, ['adapterSample', 'readStart', 'readEnd'], 'processAdapterRegistry.cpuSampleRawAuthorityPolicy.wrapperFields');
  assertExactKeys(cpuAuthority.samplePhaseDerivation, ['firstOrdinal', 'interiorOrdinals', 'terminalOrdinal'], 'processAdapterRegistry.cpuSampleRawAuthorityPolicy.samplePhaseDerivation');
  if (stableStringify(cpuAuthority.samplePhaseDerivation) !== stableStringify({
    firstOrdinal: 'prime',
    interiorOrdinals: 'in-window',
    terminalOrdinal: 'terminal-closure'
  })) fail('processAdapterRegistry.cpuSampleRawAuthorityPolicy.samplePhaseDerivation is invalid');
  assertArray(cpuAuthority.schemas, 'processAdapterRegistry.cpuSampleRawAuthorityPolicy.schemas');
  if (cpuAuthority.schemas.length !== policy.processAdapterRegistry.adapters.length) {
    fail('processAdapterRegistry.cpuSampleRawAuthorityPolicy must cover every metric adapter');
  }
  const cpuAuthorityKeys = new Set();
  for (const [index, schema] of cpuAuthority.schemas.entries()) {
    const label = `processAdapterRegistry.cpuSampleRawAuthorityPolicy.schemas[${index}]`;
    assertExactKeys(schema, ['adapterId', 'rawAdapterKind', 'sampleFields', 'sampleOptionalFields', 'nestedFields'], label);
    assertString(schema.adapterId, `${label}.adapterId`);
    assertString(schema.rawAdapterKind, `${label}.rawAdapterKind`);
    for (const field of ['sampleFields', 'sampleOptionalFields']) {
      assertArray(schema[field], `${label}.${field}`);
      schema[field].forEach((entry, fieldIndex) => assertString(entry, `${label}.${field}[${fieldIndex}]`));
      if (new Set(schema[field]).size !== schema[field].length) fail(`${label}.${field} must not contain duplicates`);
    }
    assertObject(schema.nestedFields, `${label}.nestedFields`);
    for (const [field, nested] of Object.entries(schema.nestedFields)) {
      assertArray(nested, `${label}.nestedFields.${field}`);
      nested.forEach((entry, nestedIndex) => assertString(entry, `${label}.nestedFields.${field}[${nestedIndex}]`));
    }
    const adapter = policy.processAdapterRegistry.rawAdapterKinds.find((candidate) => (
      candidate.adapterId === schema.adapterId && candidate.rawAdapterKind === schema.rawAdapterKind
    ));
    if (!adapter || stableStringify({
      sampleFields: schema.sampleFields,
      sampleOptionalFields: schema.sampleOptionalFields,
      nestedFields: schema.nestedFields
    }) !== stableStringify({
      sampleFields: adapter.sampleFields,
      sampleOptionalFields: adapter.sampleOptionalFields,
      nestedFields: adapter.nestedFields
    })) fail(`${label} must exactly mirror its platform raw adapter schema`);
    const key = `${schema.adapterId}\u0000${schema.rawAdapterKind}`;
    if (cpuAuthorityKeys.has(key)) fail('CPU raw authority schemas must be unique');
    cpuAuthorityKeys.add(key);
  }
  assertExactStringArray(policy.processAdapterRegistry.rawProcessClasses, EXPECTED_RAW_PROCESS_CLASSES, 'processAdapterRegistry.rawProcessClasses');
  assertExactStringArray(policy.processAdapterRegistry.ownershipClasses, ['application-owned'], 'processAdapterRegistry.ownershipClasses');
  assertExactStringArray(policy.processAdapterRegistry.healthStates, ['live'], 'processAdapterRegistry.healthStates');
  assertExactStringArray(policy.processAdapterRegistry.closureStates, ['closed', 'detached'], 'processAdapterRegistry.closureStates');

  assertExactKeys(policy.performanceEnvironmentPolicy, ['version', 'pollCadenceMs', 'staticIdentityFields', 'dynamicStateFields', 'electronEventNames', 'observationKinds', 'rendererHeapUnavailableReasons', 'sources', 'rawAdapterShapes', 'clockDomainMappings'], 'performanceEnvironmentPolicy');
  if (policy.performanceEnvironmentPolicy.version !== 2) fail('performanceEnvironmentPolicy.version must be 2');
  assertExactKeys(policy.performanceEnvironmentPolicy.pollCadenceMs, ['minimum', 'maximum'], 'performanceEnvironmentPolicy.pollCadenceMs');
  assertSafeInteger(policy.performanceEnvironmentPolicy.pollCadenceMs.minimum, 'performanceEnvironmentPolicy.pollCadenceMs.minimum', 1);
  assertSafeInteger(policy.performanceEnvironmentPolicy.pollCadenceMs.maximum, 'performanceEnvironmentPolicy.pollCadenceMs.maximum', policy.performanceEnvironmentPolicy.pollCadenceMs.minimum);
  if (policy.performanceEnvironmentPolicy.pollCadenceMs.minimum !== 900 || policy.performanceEnvironmentPolicy.pollCadenceMs.maximum !== 1100) fail('performanceEnvironmentPolicy cadence is invalid');
  assertExactStringArray(policy.performanceEnvironmentPolicy.staticIdentityFields, EXPECTED_ENVIRONMENT_STATIC_FIELDS, 'performanceEnvironmentPolicy.staticIdentityFields');
  assertExactStringArray(policy.performanceEnvironmentPolicy.dynamicStateFields, EXPECTED_ENVIRONMENT_DYNAMIC_FIELDS, 'performanceEnvironmentPolicy.dynamicStateFields');
  assertExactStringArray(policy.performanceEnvironmentPolicy.electronEventNames, EXPECTED_ELECTRON_ENVIRONMENT_EVENTS, 'performanceEnvironmentPolicy.electronEventNames');
  assertArray(policy.performanceEnvironmentPolicy.sources, 'performanceEnvironmentPolicy.sources');
  assertArray(policy.performanceEnvironmentPolicy.observationKinds, 'performanceEnvironmentPolicy.observationKinds');
  assertArray(policy.performanceEnvironmentPolicy.rendererHeapUnavailableReasons, 'performanceEnvironmentPolicy.rendererHeapUnavailableReasons');
  assertArray(policy.performanceEnvironmentPolicy.rawAdapterShapes, 'performanceEnvironmentPolicy.rawAdapterShapes');
  assertArray(policy.performanceEnvironmentPolicy.clockDomainMappings, 'performanceEnvironmentPolicy.clockDomainMappings');
  const environmentShapeTuples = policy.performanceEnvironmentPolicy.rawAdapterShapes.flatMap((shape, shapeIndex) => {
    assertString(shape.source, `performanceEnvironmentPolicy.rawAdapterShapes[${shapeIndex}].source`);
    assertString(shape.rawAdapterKind, `performanceEnvironmentPolicy.rawAdapterShapes[${shapeIndex}].rawAdapterKind`);
    assertArray(shape.observationKinds, `performanceEnvironmentPolicy.rawAdapterShapes[${shapeIndex}].observationKinds`);
    return shape.observationKinds.map((observationKind, observationIndex) => {
      assertString(observationKind, `performanceEnvironmentPolicy.rawAdapterShapes[${shapeIndex}].observationKinds[${observationIndex}]`);
      return `${shape.source}\u0000${observationKind}\u0000${shape.rawAdapterKind}`;
    });
  }).sort(compareCodeUnitStrings);
  const environmentClockTuples = policy.performanceEnvironmentPolicy.clockDomainMappings.flatMap((mapping, mappingIndex) => {
    const label = `performanceEnvironmentPolicy.clockDomainMappings[${mappingIndex}]`;
    assertExactKeys(mapping, ['source', 'observationKinds', 'rawAdapterKind', 'clockDomain'], label);
    assertString(mapping.source, `${label}.source`);
    assertString(mapping.rawAdapterKind, `${label}.rawAdapterKind`);
    assertString(mapping.clockDomain, `${label}.clockDomain`);
    assertArray(mapping.observationKinds, `${label}.observationKinds`);
    if (mapping.observationKinds.length === 0 || new Set(mapping.observationKinds).size !== mapping.observationKinds.length) {
      fail(`${label}.observationKinds must be nonempty and unique`);
    }
    const expectedClockDomain = {
      'external-monitor': 'runner',
      'electron-main': 'electron-main',
      'renderer-heap': 'renderer-performance-now-v1'
    }[mapping.source];
    if (mapping.clockDomain !== expectedClockDomain) fail(`${label}.clockDomain is incompatible with its source`);
    return mapping.observationKinds.map((observationKind, observationIndex) => {
      assertString(observationKind, `${label}.observationKinds[${observationIndex}]`);
      return `${mapping.source}\u0000${observationKind}\u0000${mapping.rawAdapterKind}`;
    });
  }).sort(compareCodeUnitStrings);
  if (new Set(environmentShapeTuples).size !== environmentShapeTuples.length
    || new Set(environmentClockTuples).size !== environmentClockTuples.length
    || stableStringify(environmentShapeTuples) !== stableStringify(environmentClockTuples)) {
    fail('performanceEnvironmentPolicy clock-domain mappings must be bijective with raw adapter observation tuples');
  }

  const unavailable = policy.performanceFailurePolicy?.qualificationUnavailableReasons;
  const expectedUnavailable = [
    'webgpu-api-unavailable', 'webgpu-adapter-unavailable', 'transfer-api-unavailable',
    'transfer-method-unavailable', 'transfer-allowlisted-not-supported', 'worker-fallback-adapter'
  ];
  assertExactKeys(policy.performanceFailurePolicy, ['version', 'qualificationUnavailableReasons', 'retryableReasons', 'retryableAuthorityRegistry', 'measuredDrops', 'metricSessionAbortTuples'], 'performanceFailurePolicy');
  if (policy.performanceFailurePolicy.version !== 2 || !Array.isArray(unavailable) || unavailable.join('\u0000') !== expectedUnavailable.join('\u0000')) {
    fail('performanceFailurePolicy must contain exactly six qualification-unavailable branches');
  }
  assertExactStringArray(policy.performanceFailurePolicy.retryableReasons, ['sample-floor', 'cadence-insufficient', 'host-noise', 'cpu-boundary-overlap'], 'performanceFailurePolicy.retryableReasons');
  assertArray(policy.performanceFailurePolicy.retryableAuthorityRegistry, 'performanceFailurePolicy.retryableAuthorityRegistry');
  const retryAuthorityReasons = policy.performanceFailurePolicy.retryableAuthorityRegistry.map((entry, index) => {
    assertExactKeys(entry, ['reason', 'rawKind', 'derivation'], `performanceFailurePolicy.retryableAuthorityRegistry[${index}]`);
    assertString(entry.reason, `performanceFailurePolicy.retryableAuthorityRegistry[${index}].reason`);
    assertString(entry.rawKind, `performanceFailurePolicy.retryableAuthorityRegistry[${index}].rawKind`);
    assertString(entry.derivation, `performanceFailurePolicy.retryableAuthorityRegistry[${index}].derivation`);
    return entry.reason;
  });
  if (stableStringify(retryAuthorityReasons) !== stableStringify(policy.performanceFailurePolicy.retryableReasons)) {
    fail('performanceFailurePolicy retry authority registry must cover every retry reason in policy order');
  }
  assertExactStringArray(policy.performanceFailurePolicy.measuredDrops, ['duplicateMediaTime', 'noCurrentData', 'backpressure'], 'performanceFailurePolicy.measuredDrops');
  assertArray(policy.performanceFailurePolicy.metricSessionAbortTuples, 'performanceFailurePolicy.metricSessionAbortTuples');
  const abortTupleKeys = policy.performanceFailurePolicy.metricSessionAbortTuples.map((tuple, index) => {
    assertExactKeys(tuple, ['phase', 'backend', 'reason'], `performanceFailurePolicy.metricSessionAbortTuples[${index}]`);
    if (!['close', 'open', 'reset-a', 'reset-b', 'side-a', 'side-b'].includes(tuple.phase)) {
      fail('performanceFailurePolicy metric-session abort phase is invalid');
    }
    if (!['none', 'canvas2d', 'webgpu'].includes(tuple.backend)) {
      fail('performanceFailurePolicy metric-session abort backend is invalid');
    }
    assertString(tuple.reason, 'performanceFailurePolicy metric-session abort reason');
    if (tuple.phase === 'close' || tuple.phase === 'open' || tuple.phase.startsWith('reset-')) {
      if (tuple.backend !== 'none') fail('close, open, and reset abort tuples must use the none backend');
    } else if (tuple.backend === 'none') {
      fail('measurement-side abort tuples must name a backend');
    }
    return `${tuple.phase}\u0000${tuple.backend}\u0000${tuple.reason}`;
  });
  const expectedAbortTupleKeys = EXPECTED_ABORT_TUPLES.map((tuple) => `${tuple.phase}\u0000${tuple.backend}\u0000${tuple.reason}`);
  if (abortTupleKeys.length === 0 || new Set(abortTupleKeys).size !== abortTupleKeys.length || abortTupleKeys.join('\u0001') !== expectedAbortTupleKeys.join('\u0001')) {
    fail('performanceFailurePolicy metric-session abort tuples must be nonempty, sorted, and unique');
  }

  assertExactKeys(policy.performanceDispositionPolicy, ['version', 'sourceDispositions', 'advisoryDispositionIsAuthority'], 'performanceDispositionPolicy');
  if (policy.performanceDispositionPolicy.version !== 2 || policy.performanceDispositionPolicy.advisoryDispositionIsAuthority !== false) fail('performanceDispositionPolicy is invalid');
  assertExactStringArray(policy.performanceDispositionPolicy.sourceDispositions, EXPECTED_SOURCE_DISPOSITIONS, 'performanceDispositionPolicy.sourceDispositions');

  assertExactKeys(policy.performanceMetricPolicy, [
    'version', 'workloadId', 'cpuWindowLagSamples', 'minimumRawSamples', 'minimumCpuWindows',
    'maximumCounterQuantumSeconds', 'maximumReadDurationMs', 'sampleCadenceMs',
    'sentinelCpuAllowance', 'instrumentationCpuAllowance', 'scoreCountByComparisonKind',
    'allowances', 'instrumentationMiddleRanksZeroBased',
    'sentinelBundleAllowance'
  ], 'performanceMetricPolicy');
  if (policy.performanceMetricPolicy.version !== 2 || policy.performanceMetricPolicy.cpuWindowLagSamples !== 40) fail('performanceMetricPolicy is invalid');
  if (policy.performanceMetricPolicy.workloadId !== 'phase0-animated-160x144-v1') fail('performanceMetricPolicy workload is invalid');
  assertSafeInteger(policy.performanceMetricPolicy.minimumRawSamples, 'performanceMetricPolicy.minimumRawSamples', 55);
  assertSafeInteger(policy.performanceMetricPolicy.minimumCpuWindows, 'performanceMetricPolicy.minimumCpuWindows', 15);
  assertFiniteNumber(policy.performanceMetricPolicy.maximumCounterQuantumSeconds, 'performanceMetricPolicy.maximumCounterQuantumSeconds', 0);
  assertSafeInteger(policy.performanceMetricPolicy.maximumReadDurationMs, 'performanceMetricPolicy.maximumReadDurationMs', 1);
  assertExactKeys(policy.performanceMetricPolicy.sampleCadenceMs, ['minimum', 'maximum'], 'performanceMetricPolicy.sampleCadenceMs');
  assertSafeInteger(policy.performanceMetricPolicy.sampleCadenceMs.minimum, 'performanceMetricPolicy.sampleCadenceMs.minimum', 1);
  assertSafeInteger(policy.performanceMetricPolicy.sampleCadenceMs.maximum, 'performanceMetricPolicy.sampleCadenceMs.maximum', policy.performanceMetricPolicy.sampleCadenceMs.minimum);
  assertFiniteNumber(policy.performanceMetricPolicy.sentinelCpuAllowance, 'performanceMetricPolicy.sentinelCpuAllowance', 0);
  assertFiniteNumber(policy.performanceMetricPolicy.instrumentationCpuAllowance, 'performanceMetricPolicy.instrumentationCpuAllowance', 0);
  if (policy.performanceMetricPolicy.minimumRawSamples !== 55 || policy.performanceMetricPolicy.minimumCpuWindows !== 15 || policy.performanceMetricPolicy.maximumCounterQuantumSeconds !== 0.01 || policy.performanceMetricPolicy.maximumReadDurationMs !== 50 || policy.performanceMetricPolicy.sampleCadenceMs.minimum !== 450 || policy.performanceMetricPolicy.sampleCadenceMs.maximum !== 550 || policy.performanceMetricPolicy.sentinelCpuAllowance !== 0.02 || policy.performanceMetricPolicy.instrumentationCpuAllowance !== 0.05) fail('performanceMetricPolicy limits are invalid');
  assertExactKeys(policy.performanceMetricPolicy.scoreCountByComparisonKind, ['harness-overhead', 'instrumentation-overhead'], 'performanceMetricPolicy.scoreCountByComparisonKind');
  if (policy.performanceMetricPolicy.scoreCountByComparisonKind['harness-overhead'] !== 5
    || policy.performanceMetricPolicy.scoreCountByComparisonKind['instrumentation-overhead'] !== 6) {
    fail('performanceMetricPolicy score counts do not match the comparison registry');
  }

  assertExactKeys(policy.allocationEvidencePolicy, ['version', 'canvas2d', 'webgpu'], 'allocationEvidencePolicy');
  assertExactKeys(policy.allocationEvidencePolicy.canvas2d, ['state', 'operations'], 'allocationEvidencePolicy.canvas2d');
  assertExactKeys(policy.allocationEvidencePolicy.webgpu, ['operations', 'coverage', 'states'], 'allocationEvidencePolicy.webgpu');
  if (policy.allocationEvidencePolicy.version !== 2 || policy.allocationEvidencePolicy.canvas2d.state !== 'not-applicable-no-covered-allocation-request') {
    fail('allocationEvidencePolicy canvas contract is invalid');
  }
  assertExactStringArray(policy.allocationEvidencePolicy.canvas2d.operations, [], 'allocationEvidencePolicy.canvas2d.operations');
  if (policy.allocationEvidencePolicy.webgpu.operations.join('\u0000') !== ALLOCATION_OPERATIONS.join('\u0000')) fail('allocationEvidencePolicy webgpu operations are invalid');
  assertExactStringArray(policy.allocationEvidencePolicy.webgpu.states, ['measured-request-proxy', 'unavailable-incomplete-request-coverage'], 'allocationEvidencePolicy.webgpu.states');
  assertArray(policy.allocationEvidencePolicy.webgpu.coverage, 'allocationEvidencePolicy.webgpu.coverage');
  if (policy.allocationEvidencePolicy.webgpu.coverage.length !== ALLOCATION_OPERATIONS.length) fail('allocationEvidencePolicy coverage must be non-vacuous and complete');
  const coverageOperations = policy.allocationEvidencePolicy.webgpu.coverage.map((entry) => entry.operationId);
  if (coverageOperations.join('\u0000') !== ALLOCATION_OPERATIONS.join('\u0000')) fail('allocationEvidencePolicy coverage operations are invalid');
  for (const [index, entry] of policy.allocationEvidencePolicy.webgpu.coverage.entries()) {
    const expected = EXPECTED_ALLOCATION_COVERAGE[index];
    assertExactKeys(entry, expected.carrier === 'frame-request'
      ? ['operationId', 'sourceLocationId', 'carrier', 'cardinality', 'byteSemantics']
      : ['operationId', 'sourceLocationId', 'carrier', 'lifecyclePhase', 'cardinality', 'byteSemantics'], 'allocation coverage entry');
    assertString(entry.operationId, 'allocation coverage operationId');
    assertString(entry.sourceLocationId, 'allocation coverage sourceLocationId');
    if (!['frame-request', 'lifecycle-request'].includes(entry.carrier)) fail('allocation coverage carrier is invalid');
    if (!['rgba-transfer-footprint', 'requested-byte-length', 'descriptor-size', 'logical-texel-footprint', 'count-only-unavailable'].includes(entry.byteSemantics)) {
      fail('allocation coverage byte semantics is invalid');
    }
    if (stableStringify(entry) !== stableStringify(expected)) fail('allocation coverage entry is incompatible with the closed live-operation map');
    if (entry.carrier === 'frame-request' && entry.cardinality !== 'per-frame') fail('frame allocation coverage must be per-frame');
    if (entry.carrier === 'lifecycle-request') {
      if (!['startup', 'warmup', 'resize'].includes(entry.lifecyclePhase)) fail('lifecycle allocation coverage phase is invalid');
      assertSafeInteger(entry.cardinality, 'lifecycle allocation coverage cardinality', 1);
    }
  }

  assertExactKeys(policy.capacityFixturePolicy, ['version', 'encoding', 'callbackCohortEncoding', 'provenanceKind', 'publicationEligible', 'runtimeMeasurement'], 'capacityFixturePolicy');
  if (policy.capacityFixturePolicy.version !== 2 || policy.capacityFixturePolicy.encoding !== 'synthetic-allocation-coverage-v1' || policy.capacityFixturePolicy.callbackCohortEncoding !== 'synthetic-callback-cohort-v1' || policy.capacityFixturePolicy.provenanceKind !== 'synthetic-capacity-fixture' || policy.capacityFixturePolicy.publicationEligible !== false || policy.capacityFixturePolicy.runtimeMeasurement !== false) {
    fail('capacityFixturePolicy is invalid');
  }

  assertExactKeys(policy.comparisonFingerprintPolicy, ['version', 'includedFields', 'excludedFields', 'canvasBackendExecutionIdentity'], 'comparisonFingerprintPolicy');
  if (policy.comparisonFingerprintPolicy.version !== 2 || policy.comparisonFingerprintPolicy.canvasBackendExecutionIdentity !== 'not-applicable') fail('comparisonFingerprintPolicy is invalid');
  assertExactStringArray(policy.comparisonFingerprintPolicy.includedFields, EXPECTED_COMPARISON_FINGERPRINT_FIELDS, 'comparisonFingerprintPolicy.includedFields');
  assertExactStringArray(policy.comparisonFingerprintPolicy.excludedFields, EXPECTED_COMPARISON_FINGERPRINT_EXCLUDED_FIELDS, 'comparisonFingerprintPolicy.excludedFields');
  assertExactKeys(policy.qualificationFingerprintPolicy, ['version', 'includedFields', 'excludedFields'], 'qualificationFingerprintPolicy');
  if (policy.qualificationFingerprintPolicy.version !== 2) fail('qualificationFingerprintPolicy.version must be 2');
  assertExactStringArray(policy.qualificationFingerprintPolicy.includedFields, EXPECTED_QUALIFICATION_FINGERPRINT_FIELDS, 'qualificationFingerprintPolicy.includedFields');
  assertExactStringArray(policy.qualificationFingerprintPolicy.excludedFields, EXPECTED_QUALIFICATION_FINGERPRINT_EXCLUDED_FIELDS, 'qualificationFingerprintPolicy.excludedFields');

  assertExactKeys(policy.performanceEvidenceChunkPolicy, [
    'version', 'chunkRows', 'maximumRowsPerRunAndKind', 'maximumRowsPerScopeAndKind',
    'maximumRowsAcrossNonRunScopesAndKind', 'maximumExperimentEnvironmentRows',
    'maximumDictionaryValuesPerChunk', 'maximumDictionaryUtf8BytesPerChunk',
    'runBindingFields', 'rawKinds'
  ], 'performanceEvidenceChunkPolicy');
  if (policy.performanceEvidenceChunkPolicy.version !== 2 || policy.performanceEvidenceChunkPolicy.chunkRows !== 256 || policy.performanceEvidenceChunkPolicy.maximumRowsPerRunAndKind !== 16384) {
    fail('performanceEvidenceChunkPolicy is invalid');
  }
  assertArray(policy.performanceEvidenceChunkPolicy.runBindingFields, 'performanceEvidenceChunkPolicy.runBindingFields');
  if (!policy.performanceEvidenceChunkPolicy.runBindingFields.includes('runId')
    || !policy.performanceEvidenceChunkPolicy.runBindingFields.includes('policyHash')) {
    fail('performanceEvidenceChunkPolicy.runBindingFields omits run identity');
  }
  assertExactKeys(policy.performanceEvidenceChunkPolicy.rawKinds, Object.keys(EXPECTED_RAW_KIND_SORT_KEYS), 'performanceEvidenceChunkPolicy.rawKinds');
  for (const [rawKind, expectedSortKeys] of Object.entries(EXPECTED_RAW_KIND_SORT_KEYS)) {
    const definition = policy.performanceEvidenceChunkPolicy.rawKinds[rawKind];
    const scoped = ['process-observation', 'environment-observation', 'controller-operation'].includes(rawKind);
    const buildSpecific = ['source-opportunity', 'backend-operation', 'worker-message', 'timing-span'].includes(rawKind);
    assertExactKeys(definition, [
      'sortKeys', 'columns', 'requiredColumns', 'referenceColumns', 'literalValues', 'rowShapes',
      ...(scoped ? ['bindingShapes'] : []),
      ...(buildSpecific ? ['buildFieldRules'] : [])
    ], `raw kind ${rawKind}`);
    assertExactStringArray(definition.sortKeys, expectedSortKeys, `raw kind ${rawKind}.sortKeys`);
    assertSortedUniqueStringArray(definition.columns, `raw kind ${rawKind}.columns`);
    assertSortedUniqueStringArray(definition.requiredColumns, `raw kind ${rawKind}.requiredColumns`);
    assertSortedUniqueStringArray(definition.referenceColumns, `raw kind ${rawKind}.referenceColumns`);
    for (const field of [...definition.requiredColumns, ...definition.referenceColumns]) {
      if (!definition.columns.includes(field)) fail(`raw kind ${rawKind}.${field} is not a declared column`);
    }
    if (!definition.referenceColumns.every((field) => definition.requiredColumns.includes(field))) {
      fail(`raw kind ${rawKind} reference columns must be required`);
    }
    const scopeReference = ['process-observation', 'environment-observation', 'controller-operation'].includes(rawKind) ? 'scopeId' : 'runId';
    if (!definition.referenceColumns.includes(scopeReference)) fail(`raw kind ${rawKind} must bind every row to ${scopeReference}`);
    if (!definition.sortKeys.every((field) => definition.requiredColumns.includes(field))) {
      fail(`raw kind ${rawKind} sort keys must be required columns`);
    }
    assertObject(definition.literalValues, `raw kind ${rawKind}.literalValues`);
    for (const [field, literal] of Object.entries(definition.literalValues)) {
      if (!definition.columns.includes(field) || !definition.requiredColumns.includes(field)) {
        fail(`raw kind ${rawKind} literal ${field} must be a declared required column`);
      }
      assertString(literal, `raw kind ${rawKind}.literalValues.${field}`);
    }
    const expectedCarrier = ['frame-request', 'lifecycle-request'].includes(rawKind) ? rawKind : null;
    if (expectedCarrier === null) {
      if (Object.keys(definition.literalValues).length !== 0) fail(`raw kind ${rawKind} cannot declare literal values`);
    } else if (stableStringify(definition.literalValues) !== stableStringify({ carrier: expectedCarrier })) {
      fail(`raw kind ${rawKind} must bind carrier to its raw kind`);
    }
    assertArray(definition.rowShapes, `raw kind ${rawKind}.rowShapes`);
    if (definition.rowShapes.length === 0) fail(`raw kind ${rawKind}.rowShapes must not be empty`);
    const selectorKeys = [
      'eventKind', 'comparisonKind', 'observationKind', 'operationKind',
      'messageKind', 'clockDomain', 'outcome'
    ];
    for (const [shapeIndex, shape] of definition.rowShapes.entries()) {
      assertObject(shape, `raw kind ${rawKind}.rowShapes[${shapeIndex}]`);
      const allowedShapeKeys = new Set([...selectorKeys, 'fields', 'buildVariants', 'comparisonKinds', 'backends']);
      for (const key of Object.keys(shape)) if (!allowedShapeKeys.has(key)) fail(`raw kind ${rawKind}.rowShapes[${shapeIndex}] has forbidden field ${key}`);
      assertArray(shape.fields, `raw kind ${rawKind}.rowShapes[${shapeIndex}].fields`);
      if (shape.fields.length === 0 || new Set(shape.fields).size !== shape.fields.length) fail(`raw kind ${rawKind} row shape fields must be nonempty and unique`);
      shape.fields.forEach((field, fieldIndex) => assertString(field, `raw kind ${rawKind}.rowShapes[${shapeIndex}].fields[${fieldIndex}]`));
      for (const field of shape.fields) if (!definition.columns.includes(field)) fail(`raw kind ${rawKind} row shape field ${field} is not declared`);
      for (const selector of selectorKeys) {
        if (Object.prototype.hasOwnProperty.call(shape, selector)) {
          assertString(shape[selector], `raw kind ${rawKind}.rowShapes[${shapeIndex}].${selector}`);
          if (!definition.columns.includes(selector)) fail(`raw kind ${rawKind} row shape selector ${selector} is not declared`);
        }
      }
      for (const selector of ['buildVariants', 'comparisonKinds', 'backends']) {
        if (Object.prototype.hasOwnProperty.call(shape, selector)) {
          assertArray(shape[selector], `raw kind ${rawKind}.rowShapes[${shapeIndex}].${selector}`);
          if (shape[selector].length === 0) fail(`raw kind ${rawKind} row shape ${selector} must not be empty`);
          shape[selector].forEach((value, valueIndex) => assertString(value, `raw kind ${rawKind}.rowShapes[${shapeIndex}].${selector}[${valueIndex}]`));
        }
      }
    }
    if (scoped) {
      assertArray(definition.bindingShapes, `raw kind ${rawKind}.bindingShapes`);
      if (definition.bindingShapes.length === 0) fail(`raw kind ${rawKind}.bindingShapes must not be empty`);
      for (const [bindingIndex, binding] of definition.bindingShapes.entries()) {
        assertExactKeys(binding, ['scopeKind', 'fields'], `raw kind ${rawKind}.bindingShapes[${bindingIndex}]`);
        assertString(binding.scopeKind, `raw kind ${rawKind}.bindingShapes[${bindingIndex}].scopeKind`);
        assertArray(binding.fields, `raw kind ${rawKind}.bindingShapes[${bindingIndex}].fields`);
        if (!binding.fields.includes('scopeKind') || !binding.fields.includes('scopeId')) fail(`raw kind ${rawKind} binding shape omits its scope identity`);
        for (const field of binding.fields) if (!definition.columns.includes(field)) fail(`raw kind ${rawKind} binding field ${field} is not declared`);
      }
    }
    if (buildSpecific) {
      assertObject(definition.buildFieldRules, `raw kind ${rawKind}.buildFieldRules`);
      for (const [buildVariant, rules] of Object.entries(definition.buildFieldRules)) {
        if (!['production', 'harness-control', 'instrumented'].includes(buildVariant)) fail(`raw kind ${rawKind} has an invalid build field rule`);
        assertObject(rules, `raw kind ${rawKind}.buildFieldRules.${buildVariant}`);
        for (const [field, rule] of Object.entries(rules)) {
          if (!definition.columns.includes(field)) fail(`raw kind ${rawKind} build field rule ${field} is not declared`);
          if (typeof rule !== 'boolean' && !['null', 'null-when-present', 'nonempty', 'positive-token'].includes(rule)) {
            fail(`raw kind ${rawKind} build field rule ${field} is unknown`);
          }
        }
      }
    }
  }

  assertExactKeys(policy.performanceBuildEvidencePolicy, ['version', 'buildManifestSchemaVersion', 'variantOrder', 'variantFlags', 'codeRootOrder', 'entrypointPatterns', 'javascriptExtensions'], 'performanceBuildEvidencePolicy');
  if (policy.performanceBuildEvidencePolicy.version !== 1 || policy.performanceBuildEvidencePolicy.buildManifestSchemaVersion !== 2) fail('performanceBuildEvidencePolicy is invalid');
  assertExactStringArray(policy.performanceBuildEvidencePolicy.variantOrder, ['production', 'harness-control', 'instrumented'], 'performanceBuildEvidencePolicy.variantOrder');
  assertExactStringArray(policy.performanceBuildEvidencePolicy.codeRootOrder, ['main', 'preload', 'renderer', 'worker'], 'performanceBuildEvidencePolicy.codeRootOrder');

  assertExactKeys(policy.performanceCaptureAttributionRegistry, ['version', 'families', 'runProjectionFamilies', 'qualificationProjectionFamilies'], 'performanceCaptureAttributionRegistry');
  if (policy.performanceCaptureAttributionRegistry.version !== 1) fail('performanceCaptureAttributionRegistry.version must be 1');
  assertArray(policy.performanceCaptureAttributionRegistry.families, 'performanceCaptureAttributionRegistry.families');
  assertExactKeys(policy.performanceCaptureAttributionRegistry.runProjectionFamilies, ['harness-overhead', 'instrumentation-overhead'], 'performanceCaptureAttributionRegistry.runProjectionFamilies');
  assertArray(policy.performanceCaptureAttributionRegistry.qualificationProjectionFamilies, 'performanceCaptureAttributionRegistry.qualificationProjectionFamilies');

  assertExactKeys(policy.performanceCaptureKindRegistry, ['version', 'kinds'], 'performanceCaptureKindRegistry');
  if (policy.performanceCaptureKindRegistry.version !== 1) fail('performanceCaptureKindRegistry.version must be 1');
  assertArray(policy.performanceCaptureKindRegistry.kinds, 'performanceCaptureKindRegistry.kinds');
  const captureKinds = policy.performanceCaptureKindRegistry.kinds.map((entry, index) => {
    assertExactKeys(entry, ['member', 'captureKind', 'captureSchemaVersion', 'indexSchemaVersion', 'scopeKind'], `performanceCaptureKindRegistry.kinds[${index}]`);
    return entry.captureKind;
  });
  assertExactStringArray(captureKinds, ['experiment-environment', 'transport', 'qualification', 'external-metric', 'metric-session', 'sentinel', 'workload'], 'performanceCaptureKindRegistry capture kinds');

  assertExactKeys(policy.performanceComparisonRegistry, ['version', 'comparisons', 'pairPlanSchemaVersion', 'sideOrder', 'executionOrdinals'], 'performanceComparisonRegistry');
  if (policy.performanceComparisonRegistry.version !== 1 || policy.performanceComparisonRegistry.pairPlanSchemaVersion !== 3) fail('performanceComparisonRegistry is invalid');
  assertArray(policy.performanceComparisonRegistry.comparisons, 'performanceComparisonRegistry.comparisons');
  assertExactStringArray(policy.performanceComparisonRegistry.sideOrder, ['A', 'B'], 'performanceComparisonRegistry.sideOrder');

  assertExactKeys(policy.performanceRunMetricRegistry, ['version', 'metrics'], 'performanceRunMetricRegistry');
  if (policy.performanceRunMetricRegistry.version !== 1) fail('performanceRunMetricRegistry.version must be 1');
  assertArray(policy.performanceRunMetricRegistry.metrics, 'performanceRunMetricRegistry.metrics');
  for (const [index, metric] of policy.performanceRunMetricRegistry.metrics.entries()) {
    assertExactKeys(metric, ['comparisonKind', 'metricId', 'unit', 'valueShape', 'rawKind'], `performanceRunMetricRegistry.metrics[${index}]`);
    if (!Object.hasOwn(policy.performanceEvidenceChunkPolicy.rawKinds, metric.rawKind)) fail('performance run metric references an unknown raw kind');
  }

  assertExactKeys(policy.performanceRunAllocationStateRegistry, ['version', 'states'], 'performanceRunAllocationStateRegistry');
  if (policy.performanceRunAllocationStateRegistry.version !== 1) fail('performanceRunAllocationStateRegistry.version must be 1');
  assertArray(policy.performanceRunAllocationStateRegistry.states, 'performanceRunAllocationStateRegistry.states');

  assertExactKeys(policy.performanceGateRegistry, ['version', 'authorityKinds', 'gates'], 'performanceGateRegistry');
  if (policy.performanceGateRegistry.version !== 1) fail('performanceGateRegistry.version must be 1');
  assertExactStringArray(policy.performanceGateRegistry.authorityKinds, ['run-raw', 'capture-projection', 'qualification-capture', 'policy-section', 'ledger-entry'], 'performanceGateRegistry.authorityKinds');
  assertArray(policy.performanceGateRegistry.gates, 'performanceGateRegistry.gates');
  const gateIds = new Set();
  for (const [index, gate] of policy.performanceGateRegistry.gates.entries()) {
    assertExactKeys(gate, ['gateId', 'authorityKinds', 'requiredAuthorities'], `performanceGateRegistry.gates[${index}]`);
    assertString(gate.gateId, `performanceGateRegistry.gates[${index}].gateId`);
    if (gateIds.has(gate.gateId)) fail('performanceGateRegistry has duplicate gate IDs');
    gateIds.add(gate.gateId);
    assertArray(gate.authorityKinds, `performanceGateRegistry.gates[${index}].authorityKinds`);
    assertArray(gate.requiredAuthorities, `performanceGateRegistry.gates[${index}].requiredAuthorities`);
    if (gate.requiredAuthorities.length === 0) fail('performance gate must require at least one authority');
    for (const [authorityIndex, authority] of gate.requiredAuthorities.entries()) {
      assertObject(authority, `performanceGateRegistry.gates[${index}].requiredAuthorities[${authorityIndex}]`);
      const allowed = authority.authorityKind === 'run-raw'
        ? ['authorityKind', 'rawKind']
        : authority.authorityKind === 'capture-projection'
          ? ['authorityKind', 'captureKind']
          : authority.authorityKind === 'policy-section'
            ? ['authorityKind', 'sectionId']
            : ['authorityKind'];
      assertExactKeys(authority, allowed, `performanceGateRegistry.gates[${index}].requiredAuthorities[${authorityIndex}]`);
      if (!gate.authorityKinds.includes(authority.authorityKind)) fail('performance gate required authority is outside its allowed authority kinds');
    }
  }

  assertExactKeys(policy.performanceControllerAuditPolicy, [
    'version', 'clockDomains', 'channels', 'operationKinds', 'lifecyclePhases',
    'operationShapes', 'controlProbePhases', 'controlProbeOutcomes',
    'operationOutcomes', 'requestKinds', 'responseKinds', 'sampleKinds',
    'writeKinds', 'backendReadyFields', 'backendSelectionReasons', 'requestPayloadFields',
    'responsePayloadFields', 'brokerSampleFields', 'lifecycleEventRequiredFields',
    'lifecycleEventOptionalFields', 'crossClockArithmeticAllowed'
  ], 'performanceControllerAuditPolicy');
  if (policy.performanceControllerAuditPolicy.version !== 1 || policy.performanceControllerAuditPolicy.crossClockArithmeticAllowed !== false) fail('performanceControllerAuditPolicy is invalid');
  assertExactStringArray(policy.performanceControllerAuditPolicy.operationOutcomes, ['recorded'], 'performanceControllerAuditPolicy.operationOutcomes');
  assertExactStringArray(policy.performanceControllerAuditPolicy.backendSelectionReasons, [
    'requested-canvas2d', 'performance-mode-canvas2d', 'webgpu-api-unavailable',
    'webgpu-adapter-unavailable', 'transfer-api-unavailable',
    'transfer-method-unavailable', 'transfer-allowlisted-not-supported',
    'webgpu-selected', 'fatal-detector-reason'
  ], 'performanceControllerAuditPolicy.backendSelectionReasons');

  assertExactKeys(policy.performanceQualificationCapturePolicy, [
    'version', 'captureBodyFields', 'capabilityStatuses', 'transferStatuses',
    'availableCapabilityResultFields', 'statusOnlyResultFields', 'errorResultFields',
    'qualificationStates', 'unavailabilityBranches', 'selectionReasons',
    'adapterIdentityFields', 'limitFields', 'backendExecutionIdentityFields',
    'strictSelectionFields', 'errorFields', 'selectionResultFields',
    'readinessEvidenceFields', 'readinessStageFields', 'canvasTerminalFrameFields',
    'webgpuTerminalFrameFields', 'qualifiedFallbackStateFields',
    'unavailableFallbackStateFields', 'cleanupFields', 'qualificationLedgerFields',
    'executionIdentityFields', 'markerIdentityFields', 'transportIdentityFields',
    'capabilityEvidenceFields', 'ownershipFields'
  ], 'performanceQualificationCapturePolicy');
  const qualificationPolicy = policy.performanceQualificationCapturePolicy;
  if (qualificationPolicy.version !== 1) fail('performanceQualificationCapturePolicy.version must be 1');
  for (const field of [
    'captureBodyFields', 'availableCapabilityResultFields', 'statusOnlyResultFields',
    'errorResultFields', 'qualificationStates', 'unavailabilityBranches',
    'selectionReasons', 'adapterIdentityFields', 'limitFields',
    'backendExecutionIdentityFields', 'strictSelectionFields', 'errorFields',
    'selectionResultFields', 'readinessEvidenceFields',
    'readinessStageFields', 'canvasTerminalFrameFields',
    'webgpuTerminalFrameFields', 'qualifiedFallbackStateFields',
    'unavailableFallbackStateFields', 'cleanupFields', 'qualificationLedgerFields',
    'executionIdentityFields', 'markerIdentityFields', 'transportIdentityFields',
    'capabilityEvidenceFields', 'ownershipFields'
  ]) {
    assertArray(qualificationPolicy[field], `performanceQualificationCapturePolicy.${field}`);
    qualificationPolicy[field].forEach((entry, index) => assertString(entry, `performanceQualificationCapturePolicy.${field}[${index}]`));
    if (new Set(qualificationPolicy[field]).size !== qualificationPolicy[field].length) {
      fail(`performanceQualificationCapturePolicy.${field} must not contain duplicates`);
    }
  }
  for (const field of ['capabilityStatuses', 'transferStatuses']) {
    assertExactKeys(qualificationPolicy[field], ['available', 'unavailable', 'fatal'], `performanceQualificationCapturePolicy.${field}`);
    for (const category of ['available', 'unavailable', 'fatal']) {
      assertArray(qualificationPolicy[field][category], `performanceQualificationCapturePolicy.${field}.${category}`);
      qualificationPolicy[field][category].forEach((entry, index) => assertString(entry, `performanceQualificationCapturePolicy.${field}.${category}[${index}]`));
    }
  }
  assertExactStringArray(qualificationPolicy.qualificationStates, ['qualified-webgpu', 'hardware-capability-unavailable'], 'performanceQualificationCapturePolicy.qualificationStates');
  assertExactStringArray(qualificationPolicy.unavailabilityBranches, [
    'none', 'webgpu-api-unavailable', 'webgpu-adapter-unavailable',
    'transfer-api-unavailable', 'transfer-method-unavailable',
    'transfer-allowlisted-not-supported', 'worker-fallback-adapter'
  ], 'performanceQualificationCapturePolicy.unavailabilityBranches');

  assertExactKeys(policy.performanceLimits, [
    'version', 'buildSeconds', 'seedMaterializationSeconds', 'cooldownAndIdleSeconds',
    'readinessSeconds', 'sourceFlowSeconds', 'warmup', 'window', 'oneLaunchSeconds',
    'ciExperimentSeconds', 'referenceExperimentSeconds', 'maximumEnvironmentPolls',
    'maximumSameStateEvents', 'maximumProcessObservations', 'maximumIdentities',
    'maximumIdentifierBytes', 'maximumPathBytes', 'externalSealAndClosureSeconds',
    'terminalFrameworkClosureSeconds', 'applicationShutdownSeconds',
    'maximumRowsPerScopeAndKind', 'maximumRowsAcrossNonRunScopesAndKind',
    'maximumExperimentEnvironmentObservations', 'maximumExperimentEnvironmentPollsByRole',
    'maximumExperimentSameStateEvents'
  ], 'performanceLimits');
  if (policy.performanceLimits.version !== 2 || policy.performanceLimits.oneLaunchSeconds !== 300 || policy.performanceLimits.ciExperimentSeconds !== 10800 || policy.performanceLimits.referenceExperimentSeconds !== 28800) {
    fail('performanceLimits are invalid');
  }
  for (const field of ['buildSeconds', 'seedMaterializationSeconds', 'cooldownAndIdleSeconds', 'readinessSeconds', 'sourceFlowSeconds', 'oneLaunchSeconds', 'ciExperimentSeconds', 'referenceExperimentSeconds', 'maximumEnvironmentPolls', 'maximumSameStateEvents', 'maximumProcessObservations', 'maximumIdentities', 'maximumIdentifierBytes', 'maximumPathBytes']) assertSafeInteger(policy.performanceLimits[field], `performanceLimits.${field}`, 1);
  assertExactKeys(policy.performanceLimits.warmup, ['minimumSeconds', 'minimumCallbacks', 'maximumSeconds', 'maximumCallbacks'], 'performanceLimits.warmup');
  assertExactKeys(policy.performanceLimits.window, ['minimumSeconds', 'minimumCallbacks', 'maximumSeconds', 'maximumCallbacks'], 'performanceLimits.window');
  for (const [label, value] of Object.entries({ ...policy.performanceLimits.warmup, ...policy.performanceLimits.window })) assertSafeInteger(value, `performanceLimits.${label}`, 1);
  if (policy.performanceLimits.warmup.minimumSeconds > policy.performanceLimits.warmup.maximumSeconds || policy.performanceLimits.warmup.minimumCallbacks > policy.performanceLimits.warmup.maximumCallbacks || policy.performanceLimits.window.minimumSeconds > policy.performanceLimits.window.maximumSeconds || policy.performanceLimits.window.minimumCallbacks > policy.performanceLimits.window.maximumCallbacks) {
    fail('performanceLimits minimum values cannot exceed their corresponding caps');
  }
  if (policy.performanceLimits.buildSeconds !== 600 || policy.performanceLimits.seedMaterializationSeconds !== 30 || policy.performanceLimits.cooldownAndIdleSeconds !== 135 || policy.performanceLimits.readinessSeconds !== 30 || policy.performanceLimits.sourceFlowSeconds !== 15 || policy.performanceLimits.warmup.minimumSeconds !== 10 || policy.performanceLimits.warmup.minimumCallbacks !== 600 || policy.performanceLimits.warmup.maximumSeconds !== 30 || policy.performanceLimits.warmup.maximumCallbacks !== 900 || policy.performanceLimits.window.minimumSeconds !== 30 || policy.performanceLimits.window.minimumCallbacks !== 1800 || policy.performanceLimits.window.maximumSeconds !== 45 || policy.performanceLimits.window.maximumCallbacks !== 2048 || policy.performanceLimits.maximumEnvironmentPolls !== 300 || policy.performanceLimits.maximumSameStateEvents !== 4096 || policy.performanceLimits.maximumProcessObservations !== 1024 || policy.performanceLimits.maximumIdentities !== 128 || policy.performanceLimits.maximumIdentifierBytes !== 1024 || policy.performanceLimits.maximumPathBytes !== 4096) fail('performanceLimits are incompatible with the closed performance limits policy');

  assertExactKeys(policy.transcodeDecisionPolicy, ['version', 'semanticIntegritySha256', 'contracts', 'rows'], 'transcodeDecisionPolicy');
  if (policy.transcodeDecisionPolicy.version !== 1) fail('transcodeDecisionPolicy.version must be 1');
  assertSha(policy.transcodeDecisionPolicy.semanticIntegritySha256, 'transcodeDecisionPolicy.semanticIntegritySha256');
  assertArray(policy.transcodeDecisionPolicy.contracts, 'transcodeDecisionPolicy.contracts');
  if (policy.transcodeDecisionPolicy.contracts.length === 0) fail('transcodeDecisionPolicy contracts must not be empty');
  const transcodeContractsById = new Map();
  for (const [index, contract] of policy.transcodeDecisionPolicy.contracts.entries()) {
    assertExactKeys(contract, ['id', 'path', 'sourceSymbol', 'closureTestIds'], `transcodeDecisionPolicy.contracts[${index}]`);
    assertString(contract.id, `transcodeDecisionPolicy.contracts[${index}].id`);
    assertString(contract.path, `transcodeDecisionPolicy.contracts[${index}].path`);
    assertString(contract.sourceSymbol, `transcodeDecisionPolicy.contracts[${index}].sourceSymbol`);
    assertSortedUniqueStringArray(contract.closureTestIds, `transcodeDecisionPolicy.contracts[${index}].closureTestIds`);
    if (transcodeContractsById.has(contract.id)) fail('transcodeDecisionPolicy contract IDs must be unique');
    transcodeContractsById.set(contract.id, contract);
  }
  assertArray(policy.transcodeDecisionPolicy.rows, 'transcodeDecisionPolicy.rows');
  if (policy.transcodeDecisionPolicy.rows.length !== 3) fail('transcodeDecisionPolicy must define exactly three decision rows');
  const rowOptions = new Set();
  const rowStrategies = new Set();
  let blockedRows = 0;
  let previousRowKey = null;
  for (const [index, row] of policy.transcodeDecisionPolicy.rows.entries()) {
    assertExactKeys(row, ['option', 'strategy', 'blocked', 'impactedContractIds', 'impactedTestIds'], `transcodeDecisionPolicy.rows[${index}]`);
    assertString(row.option, `transcodeDecisionPolicy.rows[${index}].option`);
    assertString(row.strategy, `transcodeDecisionPolicy.rows[${index}].strategy`);
    assertBoolean(row.blocked, `transcodeDecisionPolicy.rows[${index}].blocked`);
    if (rowOptions.has(row.option) || rowStrategies.has(row.strategy)) fail('transcodeDecisionPolicy row options and strategies must be unique');
    rowOptions.add(row.option);
    rowStrategies.add(row.strategy);
    blockedRows += Number(row.blocked);
    const rowKey = `${row.option}\u0000${row.strategy}`;
    if (previousRowKey !== null && compareCodeUnitStrings(previousRowKey, rowKey) >= 0) {
      fail('transcodeDecisionPolicy rows must be sorted by option and strategy');
    }
    previousRowKey = rowKey;
    assertSortedUniqueStringArray(row.impactedContractIds, `transcodeDecisionPolicy.rows[${index}].impactedContractIds`);
    assertSortedUniqueStringArray(row.impactedTestIds, `transcodeDecisionPolicy.rows[${index}].impactedTestIds`);
    const resolvedClosureTestIds = sortCodeUnitStrings(new Set(row.impactedContractIds.flatMap((contractId) => {
      const contract = transcodeContractsById.get(contractId);
      if (!contract) fail(`transcodeDecisionPolicy row references an unknown contract: ${contractId}`);
      return contract.closureTestIds;
    })));
    if (stableStringify(row.impactedTestIds) !== stableStringify(resolvedClosureTestIds)) {
      fail('transcodeDecisionPolicy row test IDs must resolve from its impacted contract closure test IDs');
    }
  }
  if (blockedRows !== 1) fail('transcodeDecisionPolicy must define exactly one blocked decision row');
  const semanticIntegritySha256 = canonicalSha256({
    version: policy.transcodeDecisionPolicy.version,
    contracts: policy.transcodeDecisionPolicy.contracts,
    rows: policy.transcodeDecisionPolicy.rows
  });
  if (policy.transcodeDecisionPolicy.semanticIntegritySha256 !== semanticIntegritySha256) {
    fail('transcodeDecisionPolicy semantic integrity checksum is stale');
  }
  if (semanticIntegritySha256 !== TRANSCODE_DECISION_POLICY_V1_INTEGRITY_SHA256) {
    fail('transcodeDecisionPolicy does not match the frozen v1 integrity pin');
  }
  return clone(policy);
}

export function compilePerformancePolicy(policy) {
  const normalized = validateBaselinePolicy(policy);
  const sectionHashes = Object.fromEntries(Object.keys(normalized)
    .filter((key) => key !== 'schemaVersion')
    .sort()
    .map((key) => [key, canonicalSha256(normalized[key])]));
  const operations = new Map(normalized.performanceOperationRegistry.operations.map((operation) => [operation.id, clone(operation)]));
  const adapters = new Map(normalized.processAdapterRegistry.adapters.map((adapter) => [adapter.id, clone(adapter)]));
  const registryMap = (rows, key) => new Map(rows.map((row) => [row[key], clone(row)]));
  return Object.freeze({
    policy: normalized,
    policyHash: canonicalSha256(normalized),
    sectionHashes,
    operations,
    adapters,
    buildEvidencePolicy: clone(normalized.performanceBuildEvidencePolicy),
    captureAttributionRegistry: clone(normalized.performanceCaptureAttributionRegistry),
    captureKindRegistry: registryMap(normalized.performanceCaptureKindRegistry.kinds, 'captureKind'),
    comparisonRegistry: registryMap(normalized.performanceComparisonRegistry.comparisons, 'comparisonKind'),
    runMetricRegistry: clone(normalized.performanceRunMetricRegistry.metrics),
    runAllocationStateRegistry: clone(normalized.performanceRunAllocationStateRegistry.states),
    gateRegistry: registryMap(normalized.performanceGateRegistry.gates, 'gateId'),
    controllerAuditPolicy: clone(normalized.performanceControllerAuditPolicy),
    qualificationCapturePolicy: clone(normalized.performanceQualificationCapturePolicy),
    rawKindOrder: Object.freeze(Object.keys(normalized.performanceEvidenceChunkPolicy.rawKinds))
  });
}

export function loadBaselinePolicy(policyPath = POLICY_PATH) {
  let policy;
  try {
    policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to load baseline policy ${policyPath}: ${error.message}`, { cause: error });
  }
  return compilePerformancePolicy(policy);
}

export function canonicalOptionalValue(value, { present = value !== undefined } = {}) {
  assertBoolean(present, 'optional value present');
  if (!present) {
    if (value !== undefined) fail('absent optional values must not carry a value');
    return { state: 0 };
  }
  if (value === undefined) fail('present optional values must be JSON values or null');
  if (value === null) return { state: 1 };
  return { state: 2, value: clone(value) };
}

function decodeCanonicalOptionalValue(value, label) {
  assertObject(value, label);
  assertSafeInteger(value.state, `${label}.state`, 0);
  if (value.state === 0) {
    assertExactKeys(value, ['state'], label);
    return { present: false };
  }
  if (value.state === 1) {
    assertExactKeys(value, ['state'], label);
    return { present: true, value: null };
  }
  if (value.state === 2) {
    assertExactKeys(value, ['state', 'value'], label);
    return { present: true, value: clone(value.value) };
  }
  fail(`${label}.state must be 0 (absent), 1 (null), or 2 (value)`);
}

function selectFingerprintFields(input, policy, label) {
  assertObject(input, label);
  const selected = {};
  for (const field of policy.includedFields) {
    if (!(field in input)) fail(`${label} is missing included field ${field}`);
    if (input[field] === undefined || input[field] === null) fail(`${label}.${field} must be explicit and non-null`);
    selected[field] = clone(input[field]);
  }
  return selected;
}

export function createComparisonFingerprintInput(input, compiledPolicy = loadBaselinePolicy()) {
  const selected = selectFingerprintFields(input, compiledPolicy.policy.comparisonFingerprintPolicy, 'comparison fingerprint input');
  if (!['canvas2d', 'webgpu'].includes(selected.backend)) fail('comparison fingerprint backend is invalid');
  if (selected.backend === 'canvas2d' && selected.backendExecutionIdentity !== 'not-applicable') fail('canvas comparison identity must be not-applicable');
  return selected;
}

export function computeComparisonFingerprint(input, compiledPolicy = loadBaselinePolicy()) {
  return canonicalSha256(createComparisonFingerprintInput(input, compiledPolicy));
}

export function createQualificationFingerprintInput(input, compiledPolicy = loadBaselinePolicy()) {
  const selected = selectFingerprintFields(input, compiledPolicy.policy.qualificationFingerprintPolicy, 'qualification fingerprint input');
  if (!['qualified-webgpu', 'hardware-capability-unavailable'].includes(selected.qualificationState)) fail('qualificationState is invalid');
  const branches = ['none', ...compiledPolicy.policy.performanceFailurePolicy.qualificationUnavailableReasons];
  if (!branches.includes(selected.unavailabilityBranch)) fail('qualification unavailability branch is invalid');
  if (selected.qualificationState === 'qualified-webgpu' && selected.unavailabilityBranch !== 'none') fail('qualified WebGPU cannot have an unavailable branch');
  if (selected.qualificationState === 'hardware-capability-unavailable' && selected.unavailabilityBranch === 'none') fail('unavailable qualification must state a branch');
  return selected;
}

export function computeQualificationFingerprint(input, compiledPolicy = loadBaselinePolicy()) {
  return canonicalSha256(createQualificationFingerprintInput(input, compiledPolicy));
}

export function nearestRank(values, percentile) {
  assertArray(values, 'values');
  if (values.length === 0) fail('values must not be empty');
  assertFiniteNumber(percentile, 'percentile', 0);
  if (percentile > 1) fail('percentile must be <= 1');
  const sorted = [...values];
  sorted.forEach((value, index) => assertFiniteNumber(value, `values[${index}]`));
  sorted.sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)];
}

export function deriveCpuWindow(previous, current) {
  for (const [label, sample] of [['previous', previous], ['current', current]]) {
    assertObject(sample, label);
    for (const field of ['readStart', 'readEnd', 'cumulativeCpuSeconds', 'counterQuantumSeconds']) assertFiniteNumber(sample[field], `${label}.${field}`, 0);
    if (sample.readEnd < sample.readStart) fail(`${label} read bracket is inverted`);
    if (sample.readEnd - sample.readStart > 0.05) fail(`${label} read bracket exceeds 50 ms`);
    if (sample.counterQuantumSeconds <= 0 || sample.counterQuantumSeconds > 0.01) fail(`${label} counter quantum is invalid`);
  }
  const elapsedLower = current.readStart - previous.readEnd;
  const elapsedUpper = current.readEnd - previous.readStart;
  const observedCpuDelta = current.cumulativeCpuSeconds - previous.cumulativeCpuSeconds;
  if (!(elapsedLower > 0 && elapsedLower <= elapsedUpper) || observedCpuDelta < 0) fail('CPU window has invalid elapsed time or counter regression');
  const counterError = 2 * Math.max(previous.counterQuantumSeconds, current.counterQuantumSeconds);
  const cpuLowerPp = (100 * Math.max(0, observedCpuDelta - counterError)) / elapsedUpper;
  const cpuUpperPp = (100 * (observedCpuDelta + counterError)) / elapsedLower;
  return { elapsedLower, elapsedUpper, observedCpuDelta, counterError, cpuLowerPp, cpuUpperPp };
}

export function deriveCpuScore(baseline, compared, rate) {
  assertObject(baseline, 'baseline CPU range');
  assertObject(compared, 'compared CPU range');
  assertFiniteNumber(rate, 'rate', 0);
  if (rate === 0) fail('rate must be positive');
  for (const key of ['p95Lower', 'p95Upper']) {
    assertFiniteNumber(baseline[key], `baseline.${key}`, 0);
    assertFiniteNumber(compared[key], `compared.${key}`, 0);
  }
  if (baseline.p95Lower > baseline.p95Upper || compared.p95Lower > compared.p95Upper) fail('CPU bounds are inverted');
  const scoreLower = Math.max(0, compared.p95Lower - baseline.p95Upper) / Math.max(rate * baseline.p95Upper, 1);
  const scoreUpper = Math.max(0, compared.p95Upper - baseline.p95Lower) / Math.max(rate * baseline.p95Lower, 1);
  if (scoreLower > scoreUpper) fail('CPU score bounds are inverted');
  const verdict = scoreUpper <= 1 ? 'pass' : scoreLower > 1 ? 'definite-regression' : 'cpu-boundary-overlap';
  return { scoreLower, scoreUpper, verdict };
}

const RAW_SCORE_DEFINITIONS = Object.freeze([
  { id: 'source-throughput', direction: 'lower-is-regression' },
  { id: 'backend-success-throughput', direction: 'lower-is-regression' },
  { id: 'backend-latency-p95', direction: 'higher-is-regression' },
  { id: 'drop-rate', direction: 'higher-is-regression' },
  { id: 'external-cpu-p95', direction: 'cpu-range' },
  { id: 'external-working-set-p95', direction: 'higher-is-regression' }
]);
const SENTINEL_SCORE_DEFINITIONS = Object.freeze([
  { id: 'callback-throughput', direction: 'lower-is-regression' },
  { id: 'backend-operation-throughput', direction: 'lower-is-regression' },
  { id: 'success-ratio', direction: 'lower-is-regression' },
  { id: 'external-cpu-p95', direction: 'cpu-range' },
  { id: 'external-working-set-p95', direction: 'higher-is-regression' }
]);

function assertContiguousPositiveIntegers(values, label) {
  assertArray(values, label);
  if (values.length === 0) fail(`${label} must not be empty`);
  values.forEach((value, index) => {
    assertSafeInteger(value, `${label}[${index}]`, 1);
    if (value !== index + 1) fail(`${label} must be contiguous from one`);
  });
}

function assertNonNullEnvironmentValue(value, label) {
  if (value === undefined || value === null || typeof value === 'function' || typeof value === 'symbol') fail(`${label} must be an explicit normalized value`);
}

function validateEnvironmentEvidence(value, label, buildVariant, cpuSamples, compiledPolicy) {
  assertExactKeys(value, ['staticIdentity', 'dynamicState', 'traces'], label);
  assertExactKeys(value.staticIdentity, EXPECTED_ENVIRONMENT_STATIC_FIELDS, `${label}.staticIdentity`);
  assertExactKeys(value.dynamicState, EXPECTED_ENVIRONMENT_DYNAMIC_FIELDS, `${label}.dynamicState`);
  for (const [field, fieldValue] of Object.entries(value.staticIdentity)) assertNonNullEnvironmentValue(fieldValue, `${label}.staticIdentity.${field}`);
  for (const [field, fieldValue] of Object.entries(value.dynamicState)) assertNonNullEnvironmentValue(fieldValue, `${label}.dynamicState.${field}`);
  assertArray(value.traces, `${label}.traces`);
  const expectedSources = buildVariant === 'production' ? ['external'] : ['controller', 'external'];
  const tracesBySource = new Map(expectedSources.map((source) => [source, []]));
  for (const [index, trace] of value.traces.entries()) {
    assertExactKeys(trace, ['source', 'sourceSequence', 'observedAt', 'dynamicState'], `${label}.traces[${index}]`);
    assertString(trace.source, `${label}.traces[${index}].source`);
    if (!tracesBySource.has(trace.source)) fail(`${label}.traces[${index}] has a variant-incompatible environment source`);
    assertSafeInteger(trace.sourceSequence, `${label}.traces[${index}].sourceSequence`, 1);
    assertFiniteNumber(trace.observedAt, `${label}.traces[${index}].observedAt`, 0);
    assertExactKeys(trace.dynamicState, EXPECTED_ENVIRONMENT_DYNAMIC_FIELDS, `${label}.traces[${index}].dynamicState`);
    if (stableStringify(trace.dynamicState) !== stableStringify(value.dynamicState)) fail(`${label}.traces[${index}] records a dynamic environment transition`);
    tracesBySource.get(trace.source).push(trace);
  }
  const firstMidpoint = (cpuSamples[0].readStart + cpuSamples[0].readEnd) / 2;
  const lastMidpoint = (cpuSamples.at(-1).readStart + cpuSamples.at(-1).readEnd) / 2;
  const minimumTraceCount = Math.ceil((lastMidpoint - firstMidpoint) / compiledPolicy.policy.performanceEnvironmentPolicy.pollCadenceMs.maximum * 1000) + 1;
  for (const source of expectedSources) {
    const traces = tracesBySource.get(source);
    if (traces.length < minimumTraceCount) fail(`${label}.${source} does not cover the CPU measurement interval at the required cadence`);
    traces.forEach((trace, index) => {
      if (trace.sourceSequence !== index + 1) fail(`${label}.${source} trace sequences must be contiguous`);
      if (index > 0) {
        const cadenceMs = (trace.observedAt - traces[index - 1].observedAt) * 1000;
        if (cadenceMs < compiledPolicy.policy.performanceEnvironmentPolicy.pollCadenceMs.minimum || cadenceMs > compiledPolicy.policy.performanceEnvironmentPolicy.pollCadenceMs.maximum) {
          fail(`${label}.${source} trace cadence is outside the policy interval`);
        }
      }
    });
    if (traces[0].observedAt > firstMidpoint || traces.at(-1).observedAt < lastMidpoint) fail(`${label}.${source} trace interval does not bracket the CPU measurement interval`);
  }
}

function validateCpuSamples(value, label, processIdentity, workloadWindow, compiledPolicy) {
  assertArray(value, label);
  assertObject(workloadWindow, `${label} workload window`);
  assertFiniteNumber(workloadWindow.start, `${label} workload window start`, 0);
  assertFiniteNumber(workloadWindow.terminalClosureEnd, `${label} terminal closure end`, workloadWindow.start);
  if (workloadWindow.terminalClosureEnd - workloadWindow.start < 30) {
    fail(`${label} workload window must be at least 30 seconds`);
  }
  const metricPolicy = compiledPolicy.policy.performanceMetricPolicy;
  if (value.length < metricPolicy.minimumRawSamples + 1) fail(`${label} does not meet the raw CPU sample floor plus a terminal closure sample`);
  const samples = value.map((sample, index) => {
    assertExactKeys(sample, ['ordinal', 'readStart', 'readEnd', 'cumulativeCpuSeconds', 'counterQuantumSeconds', 'processIdentity', 'workingSetMiB'], `${label}[${index}]`);
    assertSafeInteger(sample.ordinal, `${label}[${index}].ordinal`, 1);
    if (sample.ordinal !== index + 1) fail(`${label} ordinals must be contiguous`);
    assertFiniteNumber(sample.readStart, `${label}[${index}].readStart`, 0);
    assertFiniteNumber(sample.readEnd, `${label}[${index}].readEnd`, sample.readStart);
    assertFiniteNumber(sample.cumulativeCpuSeconds, `${label}[${index}].cumulativeCpuSeconds`, 0);
    assertFiniteNumber(sample.counterQuantumSeconds, `${label}[${index}].counterQuantumSeconds`, 0);
    assertString(sample.processIdentity, `${label}[${index}].processIdentity`);
    assertFiniteNumber(sample.workingSetMiB, `${label}[${index}].workingSetMiB`, 0);
    if (sample.processIdentity !== processIdentity) fail(`${label}[${index}] changes process identity`);
    if (sample.readEnd - sample.readStart > metricPolicy.maximumReadDurationMs / 1000) fail(`${label}[${index}] read bracket exceeds the policy bound`);
    if (sample.counterQuantumSeconds <= 0 || sample.counterQuantumSeconds > metricPolicy.maximumCounterQuantumSeconds) fail(`${label}[${index}] counter quantum is invalid`);
    if (index > 0) {
      const previous = value[index - 1];
      if (sample.cumulativeCpuSeconds < previous.cumulativeCpuSeconds) fail(`${label} has a CPU counter regression`);
      const cadenceMs = (((sample.readStart + sample.readEnd) - (previous.readStart + previous.readEnd)) / 2) * 1000;
      if (cadenceMs < metricPolicy.sampleCadenceMs.minimum || cadenceMs > metricPolicy.sampleCadenceMs.maximum) fail(`${label} cadence is outside the policy interval`);
    }
    return clone(sample);
  });
  const firstSample = samples[0];
  const terminalSample = samples.at(-1);
  const inWindowSamples = samples.slice(0, -1);
  if (firstSample.readStart !== workloadWindow.start) {
    fail(`${label} must begin with the immediate workload-start CPU sample`);
  }
  if (inWindowSamples.length < metricPolicy.minimumRawSamples) {
    fail(`${label} does not meet the fully in-window raw CPU sample floor`);
  }
  if (inWindowSamples.some((sample) => sample.readEnd > workloadWindow.terminalClosureEnd)
    || terminalSample.readStart < workloadWindow.terminalClosureEnd
    || terminalSample.readEnd <= workloadWindow.terminalClosureEnd) {
    fail(`${label} must retain exactly the first terminal CPU sample after workload closure`);
  }
  if (terminalSample.readEnd - firstSample.readStart < 30) {
    fail(`${label} raw CPU cadence does not span the required 30-second workload window`);
  }
  const windows = [];
  for (let index = metricPolicy.cpuWindowLagSamples; index < inWindowSamples.length; index += 1) {
    const previous = inWindowSamples[index - metricPolicy.cpuWindowLagSamples];
    const current = inWindowSamples[index];
    const window = deriveCpuWindow(previous, current);
    const midpointSpan = ((current.readStart + current.readEnd) - (previous.readStart + previous.readEnd)) / 2;
    if (midpointSpan < 18 || midpointSpan > 22) fail(`${label} lag-40 midpoint span is outside the liveness interval`);
    windows.push({ previousOrdinal: previous.ordinal, currentOrdinal: current.ordinal, ...window });
  }
  if (windows.length < metricPolicy.minimumCpuWindows) fail(`${label} does not contain enough exact lag-40 CPU windows`);
  return {
    samples,
    windows,
    p95Lower: nearestRank(windows.map((window) => window.cpuLowerPp), 0.95),
    p95Upper: nearestRank(windows.map((window) => window.cpuUpperPp), 0.95),
    workingSetP95MiB: nearestRank(inWindowSamples.map((sample) => sample.workingSetMiB), 0.95)
  };
}

function validateProcessEvidence(value, label, cpuSamples, compiledPolicy) {
  assertExactKeys(value, ['adapterId', 'identity', 'observations'], label);
  assertString(value.adapterId, `${label}.adapterId`);
  const adapter = compiledPolicy.adapters.get(value.adapterId);
  if (!adapter) fail(`${label}.adapterId is not registered`);
  assertString(value.identity, `${label}.identity`);
  assertArray(value.observations, `${label}.observations`);
  if (value.observations.length !== cpuSamples.length) fail(`${label}.observations must align exactly with CPU samples`);
  value.observations.forEach((observation, index) => {
    assertExactKeys(observation, ['sequence', 'observedAt', 'identity', 'alive'], `${label}.observations[${index}]`);
    assertSafeInteger(observation.sequence, `${label}.observations[${index}].sequence`, 1);
    if (observation.sequence !== index + 1) fail(`${label}.observations sequences must be contiguous`);
    assertFiniteNumber(observation.observedAt, `${label}.observations[${index}].observedAt`, 0);
    assertString(observation.identity, `${label}.observations[${index}].identity`);
    assertBoolean(observation.alive, `${label}.observations[${index}].alive`);
    if (observation.identity !== value.identity || observation.alive !== true) fail(`${label}.observations must prove a stable live process identity`);
    const expectedObservedAt = (cpuSamples[index].readStart + cpuSamples[index].readEnd) / 2;
    if (observation.observedAt !== expectedObservedAt) fail(`${label}.observations must share each raw CPU sample midpoint`);
  });
  return { adapter, identity: value.identity };
}

function validateCallbackAndTimingEvidence(value, label, launch, compiledPolicy, allowSyntheticCapacityCohort) {
  assertExactKeys(value, ['callbackCohort', 'timingSpans'], label);
  const cohort = value.callbackCohort;
  assertObject(cohort, `${label}.callbackCohort`);
  const hasSourceSequences = Object.prototype.hasOwnProperty.call(cohort, 'sourceSequences');
  let callbackCount;
  if (hasSourceSequences) {
    assertExactKeys(cohort, ['sourceSequences', 'windowStart', 'windowEnd', 'dropCount', 'sealed', 'drained'], `${label}.callbackCohort`);
    assertContiguousPositiveIntegers(cohort.sourceSequences, `${label}.callbackCohort.sourceSequences`);
    callbackCount = cohort.sourceSequences.length;
    if (launch.buildVariant === 'instrumented' && stableStringify(cohort.sourceSequences) !== stableStringify(launch.frameSourceSequences)) {
      fail(`${label}.callbackCohort does not match the instrumented frame cohort`);
    }
  } else {
    assertExactKeys(cohort, ['sourceSequenceEncoding', 'firstSourceSequence', 'callbackCount', 'windowStart', 'windowEnd', 'dropCount', 'sealed', 'drained'], `${label}.callbackCohort`);
    if (!allowSyntheticCapacityCohort) fail(`${label}.callbackCohort synthetic capacity encoding is forbidden for runtime-capture evidence`);
    if (cohort.sourceSequenceEncoding !== compiledPolicy.policy.capacityFixturePolicy.callbackCohortEncoding) {
      fail(`${label}.callbackCohort uses an unknown synthetic capacity encoding`);
    }
    assertSafeInteger(cohort.firstSourceSequence, `${label}.callbackCohort.firstSourceSequence`, 1);
    assertSafeInteger(cohort.callbackCount, `${label}.callbackCohort.callbackCount`, 1);
    if (cohort.firstSourceSequence !== 1) fail(`${label}.callbackCohort synthetic capacity encoding must start at source sequence one`);
    callbackCount = cohort.callbackCount;
    if (launch.buildVariant === 'instrumented') {
      if (launch.frameSourceSequences.length !== callbackCount || launch.frameSourceSequences[0] !== 1 || launch.frameSourceSequences.at(-1) !== callbackCount) {
        fail(`${label}.callbackCohort synthetic capacity encoding does not match the instrumented frame cohort`);
      }
    }
  }
  assertFiniteNumber(cohort.windowStart, `${label}.callbackCohort.windowStart`, 0);
  assertFiniteNumber(cohort.windowEnd, `${label}.callbackCohort.windowEnd`, cohort.windowStart);
  assertSafeInteger(cohort.dropCount, `${label}.callbackCohort.dropCount`, 0);
  assertBoolean(cohort.sealed, `${label}.callbackCohort.sealed`);
  assertBoolean(cohort.drained, `${label}.callbackCohort.drained`);
  if (cohort.sealed !== true || cohort.drained !== true || cohort.dropCount > callbackCount) fail(`${label}.callbackCohort has invalid seal, drain, or drop evidence`);
  const windowSeconds = cohort.windowEnd - cohort.windowStart;
  const windowLimits = compiledPolicy.policy.performanceLimits.window;
  if (
    windowSeconds < windowLimits.minimumSeconds
    || windowSeconds > windowLimits.maximumSeconds
    || (!allowSyntheticCapacityCohort && callbackCount < windowLimits.minimumCallbacks)
    || callbackCount > windowLimits.maximumCallbacks
  ) fail(`${label}.callbackCohort violates the closed workload window`);
  assertArray(value.timingSpans, `${label}.timingSpans`);
  if (value.timingSpans.length === 0) fail(`${label}.timingSpans must not be empty`);
  let expectedSequence = 1;
  const perCallbackDurations = [];
  for (const [index, span] of value.timingSpans.entries()) {
    assertExactKeys(span, ['firstSourceSequence', 'lastSourceSequence', 'startedAt', 'endedAt'], `${label}.timingSpans[${index}]`);
    assertSafeInteger(span.firstSourceSequence, `${label}.timingSpans[${index}].firstSourceSequence`, 1);
    assertSafeInteger(span.lastSourceSequence, `${label}.timingSpans[${index}].lastSourceSequence`, span.firstSourceSequence);
    assertFiniteNumber(span.startedAt, `${label}.timingSpans[${index}].startedAt`, cohort.windowStart);
    assertFiniteNumber(span.endedAt, `${label}.timingSpans[${index}].endedAt`, span.startedAt);
    if (span.endedAt === span.startedAt) fail(`${label}.timingSpans[${index}] must have positive duration`);
    if (span.firstSourceSequence !== expectedSequence || span.lastSourceSequence > callbackCount) fail(`${label}.timingSpans must partition the complete callback cohort`);
    const count = span.lastSourceSequence - span.firstSourceSequence + 1;
    perCallbackDurations.push(((span.endedAt - span.startedAt) * 1000) / count);
    expectedSequence = span.lastSourceSequence + 1;
  }
  if (expectedSequence !== callbackCount + 1) fail(`${label}.timingSpans omit callback timing evidence`);
  return {
    callbackCount,
    workloadWindow: {
      start: cohort.windowStart,
      terminalClosureEnd: cohort.windowEnd
    },
    sourceThroughput: callbackCount / windowSeconds,
    backendThroughput: callbackCount / Math.max(value.timingSpans.reduce((total, span) => total + (span.endedAt - span.startedAt), 0), Number.EPSILON),
    timingP95Ms: nearestRank(perCallbackDurations, 0.95),
    dropRate: cohort.dropCount / callbackCount
  };
}

function deriveRatioScore(numerator, allowance, label) {
  assertFiniteNumber(numerator, `${label} numerator`);
  assertFiniteNumber(allowance, `${label} allowance`, 0);
  if (allowance === 0) fail(`${label} allowance must be positive`);
  return Math.max(0, numerator) / allowance;
}

function validateSentinelEvidence(value, label, callbackTiming) {
  assertExactKeys(value, ['callbackCount', 'backendOperationCount', 'backendSuccessCount', 'errorCount', 'healthFailureCount'], label);
  for (const field of ['callbackCount', 'backendOperationCount', 'backendSuccessCount', 'errorCount', 'healthFailureCount']) {
    assertSafeInteger(value[field], `${label}.${field}`, 0);
  }
  if (value.callbackCount !== callbackTiming.callbackCount) fail(`${label}.callbackCount does not match the external callback cohort`);
  if (value.backendOperationCount > value.callbackCount) fail(`${label}.backendOperationCount exceeds the callback cohort`);
  if (value.backendSuccessCount > value.backendOperationCount) fail(`${label}.backendSuccessCount exceeds backend operations`);
  return {
    callbackCount: value.callbackCount,
    backendOperationCount: value.backendOperationCount,
    backendSuccessCount: value.backendSuccessCount,
    errorCount: value.errorCount,
    healthFailureCount: value.healthFailureCount
  };
}

function validateRawPerformanceEvidence(rawEvidence, ledgerDetails, compiledPolicy, evidenceProvenance, { enforceAcceptedScores = true } = {}) {
  assertExactKeys(rawEvidence, ['runs'], 'performance raw evidence');
  assertArray(rawEvidence.runs, 'performance raw evidence.runs');
  if (ledgerDetails.hasAbortedSession || ledgerDetails.completedSessions.length === 0) fail('aborted or incomplete ledger sessions cannot enter raw performance evaluation');
  const launches = ledgerDetails.completedSessions.flatMap((session) => session.launches);
  if (rawEvidence.runs.length !== launches.length) fail('performance raw evidence must contain exactly one run record per completed ledger launch');
  const launchesByRunId = new Map(launches.map((launch) => [launch.runId, launch]));
  const runs = new Map();
  for (const [index, rawRun] of rawEvidence.runs.entries()) {
    assertObject(rawRun, `performance raw evidence.runs[${index}]`);
    const launch = launchesByRunId.get(rawRun.runId);
    const sentinel = launch?.comparisonKind === 'harness-overhead';
    assertExactKeys(rawRun, ['runId', 'callbackTiming', 'cpuSamples', 'environment', 'process', ...(sentinel ? ['sentinel'] : [])], `performance raw evidence.runs[${index}]`);
    assertString(rawRun.runId, `performance raw evidence.runs[${index}].runId`);
    if (!launch || runs.has(rawRun.runId)) fail('performance raw evidence has a missing, duplicate, or undeclared run ID');
    assertArray(rawRun.cpuSamples, `performance raw evidence.runs[${index}].cpuSamples`);
    assertObject(rawRun.process, `performance raw evidence.runs[${index}].process`);
    assertString(rawRun.process.identity, `performance raw evidence.runs[${index}].process.identity`);
    const callbackTiming = validateCallbackAndTimingEvidence(
      rawRun.callbackTiming,
      `performance raw evidence.runs[${index}].callbackTiming`,
      launch,
      compiledPolicy,
      evidenceProvenance.kind === compiledPolicy.policy.capacityFixturePolicy.provenanceKind
    );
    const cpu = validateCpuSamples(
      rawRun.cpuSamples,
      `performance raw evidence.runs[${index}].cpuSamples`,
      rawRun.process.identity,
      callbackTiming.workloadWindow,
      compiledPolicy
    );
    const process = validateProcessEvidence(rawRun.process, `performance raw evidence.runs[${index}].process`, cpu.samples, compiledPolicy);
    if (cpu.samples.some((sample) => sample.counterQuantumSeconds !== process.adapter.counterQuantumSeconds)) fail('performance raw CPU samples do not bind the selected process adapter quantum');
    validateEnvironmentEvidence(rawRun.environment, `performance raw evidence.runs[${index}].environment`, launch.buildVariant, cpu.samples, compiledPolicy);
    const sentinelEvidence = sentinel
      ? validateSentinelEvidence(rawRun.sentinel, `performance raw evidence.runs[${index}].sentinel`, callbackTiming)
      : null;
    const runWindowSeconds = callbackTiming.workloadWindow.terminalClosureEnd - callbackTiming.workloadWindow.start;
    const metrics = sentinel
      ? [
          { metricId: 'callback-throughput', unit: 'callbacks-per-second', valueShape: 'scalar', availability: 'available', value: callbackTiming.sourceThroughput },
          { metricId: 'backend-operation-throughput', unit: 'operations-per-second', valueShape: 'scalar', availability: 'available', value: sentinelEvidence.backendOperationCount / runWindowSeconds },
          { metricId: 'success-ratio', unit: 'ratio', valueShape: 'scalar', availability: 'available', value: sentinelEvidence.backendSuccessCount / sentinelEvidence.callbackCount },
          { metricId: 'external-cpu-p95', unit: 'percentage-points', valueShape: 'bounded', availability: 'available', lower: cpu.p95Lower, upper: cpu.p95Upper },
          { metricId: 'external-working-set-p95', unit: 'MiB', valueShape: 'scalar', availability: 'available', value: cpu.workingSetP95MiB }
        ]
      : [
          { metricId: 'source-throughput', unit: 'callbacks-per-second', valueShape: 'scalar', availability: 'available', value: callbackTiming.sourceThroughput },
          { metricId: 'backend-success-throughput', unit: 'operations-per-second', valueShape: 'scalar', availability: 'available', value: callbackTiming.backendThroughput },
          { metricId: 'backend-latency-p95', unit: 'milliseconds', valueShape: 'scalar', availability: 'available', value: callbackTiming.timingP95Ms },
          { metricId: 'drop-rate', unit: 'ratio', valueShape: 'scalar', availability: 'available', value: callbackTiming.dropRate },
          { metricId: 'external-cpu-p95', unit: 'percentage-points', valueShape: 'bounded', availability: 'available', lower: cpu.p95Lower, upper: cpu.p95Upper },
          { metricId: 'external-working-set-p95', unit: 'MiB', valueShape: 'scalar', availability: 'available', value: cpu.workingSetP95MiB }
        ];
    runs.set(rawRun.runId, {
      runId: rawRun.runId,
      cpu,
      callbackTiming,
      sentinel: sentinelEvidence,
      launch: clone(launch),
      metrics
    });
  }
  const scores = [];
  const aggregates = [];
  const gates = [];
  for (const session of ledgerDetails.completedSessions) {
    const [baselineVariant, comparedVariant] = COMPARISON_BUILD_VARIANTS[session.comparisonKind];
    const baselineLaunch = session.launches.find((launch) => launch.buildVariant === baselineVariant);
    const comparedLaunch = session.launches.find((launch) => launch.buildVariant === comparedVariant);
    const baseline = runs.get(baselineLaunch?.runId);
    const compared = runs.get(comparedLaunch?.runId);
    if (!baseline || !compared) fail('performance raw evidence does not join a completed comparison pair');
    const metricPolicy = compiledPolicy.policy.performanceMetricPolicy;
    const cpuAllowance = session.comparisonKind === 'instrumentation-overhead'
      ? metricPolicy.instrumentationCpuAllowance
      : metricPolicy.sentinelCpuAllowance;
    const scalarScore = (metricId, score) => ({
      metricId,
      scoreLower: score,
      scoreUpper: score,
      verdict: score <= 1 ? 'pass' : 'definite-regression'
    });
    let derivedScores;
    if (session.comparisonKind === 'harness-overhead') {
      const baselineWindowSeconds = baseline.callbackTiming.workloadWindow.terminalClosureEnd - baseline.callbackTiming.workloadWindow.start;
      const comparedWindowSeconds = compared.callbackTiming.workloadWindow.terminalClosureEnd - compared.callbackTiming.workloadWindow.start;
      const baselineBackendThroughput = baseline.sentinel.backendOperationCount / baselineWindowSeconds;
      const comparedBackendThroughput = compared.sentinel.backendOperationCount / comparedWindowSeconds;
      const baselineSuccessRatio = baseline.sentinel.backendSuccessCount / baseline.sentinel.callbackCount;
      const comparedSuccessRatio = compared.sentinel.backendSuccessCount / compared.sentinel.callbackCount;
      const healthFailures = baseline.sentinel.errorCount + baseline.sentinel.healthFailureCount + compared.sentinel.errorCount + compared.sentinel.healthFailureCount;
      if (!(baseline.callbackTiming.sourceThroughput > 0) || !(baselineBackendThroughput > 0)) {
        fail('sentinel baseline callback and backend-operation throughput must be finite and positive');
      }
      derivedScores = [
        scalarScore('callback-throughput', deriveRatioScore(
          baseline.callbackTiming.sourceThroughput - compared.callbackTiming.sourceThroughput,
          metricPolicy.sentinelCpuAllowance * baseline.callbackTiming.sourceThroughput,
          'sentinel callback throughput'
        )),
        scalarScore('backend-operation-throughput', deriveRatioScore(
          baselineBackendThroughput - comparedBackendThroughput,
          metricPolicy.sentinelCpuAllowance * baselineBackendThroughput,
          'sentinel backend operation throughput'
        )),
        scalarScore('success-ratio', deriveRatioScore(
          baselineSuccessRatio - comparedSuccessRatio,
          0.01,
          'sentinel success ratio'
        )),
        { metricId: 'external-cpu-p95', ...deriveCpuScore(
          { p95Lower: baseline.cpu.p95Lower, p95Upper: baseline.cpu.p95Upper },
          { p95Lower: compared.cpu.p95Lower, p95Upper: compared.cpu.p95Upper },
          cpuAllowance
        ) },
        scalarScore('external-working-set-p95', deriveRatioScore(
          compared.cpu.workingSetP95MiB - baseline.cpu.workingSetP95MiB,
          Math.max(metricPolicy.sentinelCpuAllowance * baseline.cpu.workingSetP95MiB, 4),
          'sentinel working set'
        ))
      ];
      const healthGate = {
        metricSessionId: session.metricSessionId,
        gateId: 'sentinel-process-health',
        acceptedAttempt: !session.supersededByRetry,
        passed: healthFailures === 0,
        failureCount: healthFailures
      };
      if (enforceAcceptedScores && !healthGate.passed) fail('sentinel process/error health gate failed');
      gates.push(healthGate);
    } else {
      const dropAllowance = baseline.callbackTiming.dropRate <= 0.01
        ? 0.01
        : metricPolicy.instrumentationCpuAllowance * baseline.callbackTiming.dropRate;
      if (!(baseline.callbackTiming.sourceThroughput > 0)
        || !(baseline.callbackTiming.backendThroughput > 0)
        || !(baseline.callbackTiming.timingP95Ms > 0)) {
        fail('instrumentation baseline throughput and latency must be finite and positive');
      }
      derivedScores = [
        scalarScore('source-throughput', deriveRatioScore(
          baseline.callbackTiming.sourceThroughput - compared.callbackTiming.sourceThroughput,
          metricPolicy.instrumentationCpuAllowance * baseline.callbackTiming.sourceThroughput,
          'instrumentation source throughput'
        )),
        scalarScore('backend-success-throughput', deriveRatioScore(
          baseline.callbackTiming.backendThroughput - compared.callbackTiming.backendThroughput,
          metricPolicy.instrumentationCpuAllowance * baseline.callbackTiming.backendThroughput,
          'instrumentation backend throughput'
        )),
        scalarScore('backend-latency-p95', deriveRatioScore(
          compared.callbackTiming.timingP95Ms - baseline.callbackTiming.timingP95Ms,
          metricPolicy.instrumentationCpuAllowance * baseline.callbackTiming.timingP95Ms,
          'instrumentation timing p95'
        )),
        scalarScore('drop-rate', deriveRatioScore(
          compared.callbackTiming.dropRate - baseline.callbackTiming.dropRate,
          dropAllowance,
          'instrumentation drop rate'
        )),
        { metricId: 'external-cpu-p95', ...deriveCpuScore(
          { p95Lower: baseline.cpu.p95Lower, p95Upper: baseline.cpu.p95Upper },
          { p95Lower: compared.cpu.p95Lower, p95Upper: compared.cpu.p95Upper },
          cpuAllowance
        ) },
        scalarScore('external-working-set-p95', deriveRatioScore(
          compared.cpu.workingSetP95MiB - baseline.cpu.workingSetP95MiB,
          Math.max(metricPolicy.instrumentationCpuAllowance * baseline.cpu.workingSetP95MiB, 8),
          'instrumentation working set'
        ))
      ];
    }
    const expectedDefinitions = session.comparisonKind === 'harness-overhead' ? SENTINEL_SCORE_DEFINITIONS : RAW_SCORE_DEFINITIONS;
    if (stableStringify(derivedScores.map((score) => score.metricId)) !== stableStringify(expectedDefinitions.map((definition) => definition.id))) {
      fail('derived raw performance scores do not match the closed comparison-kind registry');
    }
    let observedCpuBoundaryOverlap = false;
    for (const score of derivedScores) {
      if (score.metricId === 'external-cpu-p95' && score.verdict === 'cpu-boundary-overlap') {
        if (enforceAcceptedScores && session.retryReason !== 'cpu-boundary-overlap') {
          fail('a complete CPU-boundary-overlap pair requires one declared whole-pair retry after its completed close');
        }
        observedCpuBoundaryOverlap = true;
      } else if (enforceAcceptedScores && score.scoreUpper > 1) {
        fail(`raw performance metric ${score.metricId} exceeds the allowed score bound`);
      }
      scores.push({
        metricSessionId: session.metricSessionId,
        comparisonKind: session.comparisonKind,
        baselineRunId: baseline.runId,
        comparedRunId: compared.runId,
        acceptedAttempt: !session.supersededByRetry,
        ...score
      });
    }
    if (session.comparisonKind === 'instrumentation-overhead') {
      const sortedLower = derivedScores.map((score) => score.scoreLower).sort((left, right) => left - right);
      const sortedUpper = derivedScores.map((score) => score.scoreUpper).sort((left, right) => left - right);
      const aggregate = {
        metricSessionId: session.metricSessionId,
        comparisonKind: session.comparisonKind,
        baselineRunId: baseline.runId,
        comparedRunId: compared.runId,
        acceptedAttempt: !session.supersededByRetry,
        scoreLower: (sortedLower[2] + sortedLower[3]) / 2,
        scoreUpper: (sortedUpper[2] + sortedUpper[3]) / 2
      };
      if (enforceAcceptedScores && aggregate.scoreUpper > 1) fail('raw performance middle-mean aggregate exceeds the allowed score bound');
      aggregates.push(aggregate);
    }
    if (enforceAcceptedScores && session.retryReason === 'cpu-boundary-overlap' && !observedCpuBoundaryOverlap) {
      fail('a declared cpu-boundary-overlap retry must be proven by the preceding complete pair CPU bounds');
    }
  }
  return {
    runCount: runs.size,
    runs: [...runs.values()].map((run) => clone(run)),
    scores,
    aggregates,
    gates
  };
}

const FATAL_FAILURE_TUPLES = Object.freeze({
  'qualification:webgpu': new Set(['adapter-error', 'device-error', 'unexpected-transfer-error', 'crash', 'membership-failure', 'unclean-shutdown']),
  'measurement:canvas2d': new Set(['sessionInactive', 'bitmapCreationFailed', 'enqueueFailed', 'driverInactive', 'driverFailed', 'source-token-span-join-corruption', 'pid-identity-change', 'metrics-broker-interference', 'environment-drift', 'submission-seal-timeout', 'drain-timeout', 'crash', 'membership-failure', 'unclean-shutdown']),
  'measurement:webgpu': new Set(['sessionInactive', 'workerNotReady', 'bitmapCreationFailed', 'enqueueFailed', 'driverInactive', 'driverFailed', 'worker-error', 'source-token-span-join-corruption', 'pid-identity-change', 'metrics-broker-interference', 'environment-drift', 'submission-seal-timeout', 'drain-timeout', 'crash', 'membership-failure', 'unclean-shutdown']),
  'startup:none': new Set(['crash', 'membership-failure']),
  'shutdown:none': new Set(['unclean-shutdown', 'crash'])
});

export function classifyFailure(tuple, compiledPolicy = loadBaselinePolicy()) {
  assertExactKeys(tuple, ['phase', 'backend', 'reason'], 'failure tuple');
  const { phase, backend, reason } = tuple;
  assertString(phase, 'failure phase');
  assertString(backend, 'failure backend');
  assertString(reason, 'failure reason');
  const policy = compiledPolicy.policy.performanceFailurePolicy;
  if (policy.qualificationUnavailableReasons.includes(reason)) {
    if (phase !== 'qualification' || backend !== 'webgpu') fail('qualification-unavailable tuple is only valid for qualification WebGPU');
    return 'qualification-unavailable';
  }
  if (policy.retryableReasons.includes(reason)) {
    if (phase !== 'measurement' || !['canvas2d', 'webgpu'].includes(backend)) fail('retryable tuple is only valid for a backend measurement');
    return 'retryable-pair-invalid';
  }
  if (policy.measuredDrops.includes(reason)) {
    if (phase !== 'measurement' || !['canvas2d', 'webgpu'].includes(backend)) fail('measured-drop tuple is only valid for a backend measurement');
    return 'measured-drop';
  }
  if (!FATAL_FAILURE_TUPLES[`${phase}:${backend}`]?.has(reason)) {
    fail('failure tuple phase/backend/reason combination is unsupported');
  }
  return 'experiment-fatal';
}

export function assessPerformancePairAttempt(input, compiledPolicy = loadBaselinePolicy()) {
  assertExactKeys(input, ['ledger', 'rawEvidence'], 'pair attempt assessment');
  assertArray(input.ledger, 'pair attempt assessment.ledger');
  if (input.ledger.length === 0) fail('pair attempt assessment requires a nonempty ledger');
  const cleanupProofs = input.ledger.flatMap((entry) => [entry?.cleanup, entry?.closure]).filter((value) => value !== undefined);
  const explicitCleanupFailure = cleanupProofs.some((proof) => {
    if (!isPlainObject(proof)) return false;
    if (['closed', 'stdoutDrained', 'stderrDrained', 'inputClosed', 'zeroSurvivors'].some((field) => field in proof && proof[field] !== true)) return true;
    return isPlainObject(proof.exit) && typeof proof.exit.durationMs === 'number' && proof.exit.durationMs > 5000;
  });
  if (explicitCleanupFailure) {
    return { disposition: 'fatal', reason: 'unclean-shutdown', retryAllowed: false, nextAttemptIndex: null };
  }

  const ledgerDetails = validatePerformanceLedgerDetails(input.ledger, compiledPolicy);
  if (ledgerDetails.retryTopology.mode !== 'explicit-attempts' || ledgerDetails.retryTopology.pairs.length !== 1) {
    fail('pair attempt assessment requires exactly one explicitly modeled pair history');
  }
  const pair = ledgerDetails.retryTopology.pairs[0];
  const latestAttempt = pair.attempts.at(-1);
  const latestSession = ledgerDetails.terminalSessions.find((session) => session.metricSessionId === latestAttempt.metricSessionId);
  if (!latestSession?.attempt) fail('pair attempt assessment is missing its terminal attempt metadata');
  const attemptIndex = latestSession.attempt.attemptIndex;

  const retryOrExhausted = (reason) => attemptIndex === MAX_WHOLE_PAIR_RETRIES + 1
    ? { disposition: 'fatal', reason: `retry-limit-exhausted:${reason}`, retryAllowed: false, nextAttemptIndex: null }
    : { disposition: 'retryable', reason, retryAllowed: true, nextAttemptIndex: attemptIndex + 1 };

  if (latestSession.outcome === 'aborted') {
    if (input.rawEvidence !== null) fail('aborted pair attempt must not carry completed raw evidence');
    return {
      disposition: 'fatal',
      reason: latestSession.abortReason?.reason ?? 'aborted-without-classified-reason',
      retryAllowed: false,
      nextAttemptIndex: null
    };
  }

  if (input.rawEvidence === null) fail('completed pair attempt requires raw evidence');
  const rawEvidence = validateRawPerformanceEvidence(
    input.rawEvidence,
    ledgerDetails,
    compiledPolicy,
    { kind: 'runtime-capture' },
    { enforceAcceptedScores: false }
  );
  const scores = rawEvidence.scores.filter((score) => score.metricSessionId === latestSession.metricSessionId);
  const expectedScoreCount = latestSession.comparisonKind === 'harness-overhead'
    ? SENTINEL_SCORE_DEFINITIONS.length
    : RAW_SCORE_DEFINITIONS.length;
  if (scores.length !== expectedScoreCount) fail('completed pair attempt does not derive the exact policy score set');
  const failedGate = rawEvidence.gates.find((gate) => gate.metricSessionId === latestSession.metricSessionId && gate.passed !== true);
  if (failedGate) {
    return { disposition: 'fatal', reason: failedGate.gateId, retryAllowed: false, nextAttemptIndex: null };
  }
  const definiteRegression = scores.find((score) => score.scoreLower > 1 || (score.scoreUpper > 1 && score.metricId !== 'external-cpu-p95'));
  if (definiteRegression) {
    return {
      disposition: 'rejected-regression',
      reason: `definite-regression:${definiteRegression.metricId}`,
      retryAllowed: false,
      nextAttemptIndex: null
    };
  }
  const cpuBoundaryOverlap = scores.some((score) => score.metricId === 'external-cpu-p95' && score.scoreLower <= 1 && score.scoreUpper > 1);
  return cpuBoundaryOverlap
    ? retryOrExhausted('cpu-boundary-overlap')
    : { disposition: 'accepted', reason: null, retryAllowed: false, nextAttemptIndex: null };
}

const PAIR_CAPTURE_VALIDATORS = Object.freeze({
  'external-metric': validatePerformanceExternalMetricCapture,
  'metric-session': validatePerformanceMetricSessionCapture,
  sentinel: validatePerformanceSentinelCapture,
  workload: validatePerformanceWorkloadCapture
});

function capturedAttemptDisposition({ session, baseline, compared, rows }, compiledPolicy) {
  const retryOrExhausted = (reason) => session.attempt.attemptIndex === MAX_WHOLE_PAIR_RETRIES + 1
    ? { disposition: 'fatal', reason: `retry-limit-exhausted:${reason}`, retryAllowed: false, nextAttemptIndex: null }
    : { disposition: 'retryable', reason, retryAllowed: true, nextAttemptIndex: session.attempt.attemptIndex + 1 };
  const fatal = (reason) => ({ disposition: 'fatal', reason, retryAllowed: false, nextAttemptIndex: null });
  for (const run of [baseline, compared]) {
    if (!run.processGate.passed) return fatal(run.processGate.reason);
    if (run.environmentGate.reason === 'missing-environment-observation') return fatal('missing-environment-observation');
    if (session.comparisonKind === 'instrumentation-overhead') {
      if (!run.checks.rawJoinClosure) return fatal('source-token-span-join-corruption');
    } else {
      if (!run.checks.sentinelBalance || !run.checks.acknowledgementConservation) return fatal('sentinel-frame-ack-error-imbalance');
      if (!run.checks.preWindowPending) return fatal('sentinel-pre-window-pending');
      if (!run.checks.postWindowPending || !run.checks.closure) return fatal('sentinel-post-window-pending-or-closure');
      if (!run.checks.errorCount) return fatal('sentinel-error-count');
    }
    if (session.backend === 'webgpu') {
      if (run.checks.acknowledgementConservation === false) return fatal('webgpu-ack-conservation');
      if (rowsForRun(rows.get('worker-message'), run.runId).length
        < compiledPolicy.policy.performanceLimits.window.minimumCallbacks) return fatal('webgpu-ack-sample-floor');
    }
  }
  let scores = [];
  if (baseline.cpu.p95Lower !== null && compared.cpu.p95Lower !== null) {
    scores = deriveCapturedPairScores(session, baseline, compared, compiledPolicy);
  }
  const qualityReasons = qualityReasonsForCapturedPair(baseline, compared, scores);
  if (qualityReasons.length > 1) return fatal(`ambiguous-retryable-quality:${qualityReasons.join(',')}`);
  if (qualityReasons.length === 1) return retryOrExhausted(qualityReasons[0]);
  const definiteRegression = scores.find((score) => score.verdict === 'definite-regression');
  if (definiteRegression) {
    return { disposition: 'rejected-regression', reason: `definite-regression:${definiteRegression.metricId}`, retryAllowed: false, nextAttemptIndex: null };
  }
  if (session.comparisonKind === 'instrumentation-overhead') {
    const ranks = compiledPolicy.policy.performanceMetricPolicy.instrumentationMiddleRanksZeroBased;
    const ordered = scores.map((score) => score.scoreUpper).sort((left, right) => left - right);
    const aggregate = ranks.reduce((sum, rank) => sum + ordered[rank], 0) / ranks.length;
    if (aggregate > 1) {
      return { disposition: 'rejected-regression', reason: 'definite-regression:instrumentation-middle-rank-aggregate', retryAllowed: false, nextAttemptIndex: null };
    }
  }
  return { disposition: 'accepted', reason: null, retryAllowed: false, nextAttemptIndex: null };
}

/** Classify one complete pair attempt from its sealed runtime captures. */
export function assessCapturedPerformancePairAttempt(input, compiledPolicy = loadBaselinePolicy()) {
  assertExactKeys(input, ['ledger', 'target', 'captureGroups', 'environmentRows'], 'captured pair attempt assessment');
  assertArray(input.ledger, 'captured pair attempt assessment.ledger');
  if (input.ledger.length === 0) fail('captured pair attempt assessment requires a nonempty ledger');
  assertExactKeys(input.target, ['backend', 'comparisonKind', 'pairIndex', 'attemptIndex'], 'captured pair attempt assessment.target');
  if (!compiledPolicy.policy.reportPolicy.backends.includes(input.target.backend)) fail('captured pair attempt assessment.target.backend is invalid');
  if (!Object.hasOwn(COMPARISON_BUILD_VARIANTS, input.target.comparisonKind)) fail('captured pair attempt assessment.target.comparisonKind is invalid');
  assertSafeInteger(input.target.pairIndex, 'captured pair attempt assessment.target.pairIndex', 1);
  assertSafeInteger(input.target.attemptIndex, 'captured pair attempt assessment.target.attemptIndex', 1);
  assertArray(input.captureGroups, 'captured pair attempt assessment.captureGroups');
  assertArray(input.environmentRows, 'captured pair attempt assessment.environmentRows');

  const ledgerDetails = validatePerformanceLedgerDetails(input.ledger, compiledPolicy);
  if (ledgerDetails.retryTopology.mode !== 'explicit-attempts') fail('captured pair attempt assessment requires explicitly modeled pair attempts');
  const pair = ledgerDetails.retryTopology.pairs.find((entry) => entry.backend === input.target.backend
    && entry.comparisonKind === input.target.comparisonKind && entry.pairIndex === input.target.pairIndex);
  const latestAttempt = pair?.attempts.at(-1);
  const targetMetricSessionId = latestAttempt?.metricSessionId;
  const session = ledgerDetails.terminalSessions.find((entry) => entry.metricSessionId === targetMetricSessionId);
  if (!pair || latestAttempt?.attemptIndex !== input.target.attemptIndex || !session?.attempt
    || session.outcome !== 'completed' || ledgerDetails.terminalSessions.at(-1)?.metricSessionId !== targetMetricSessionId) {
    fail('captured pair attempt assessment requires the latest completed attempt of one logical pair');
  }

  const normalizedCaptures = input.captureGroups.map((capture, index) => {
    assertObject(capture, `captured pair attempt assessment.captureGroups[${index}]`);
    const validator = PAIR_CAPTURE_VALIDATORS[capture.captureKind];
    if (!validator) fail(`captured pair attempt assessment has unsupported capture kind ${capture.captureKind}`);
    return validator(capture);
  });
  const metricSessionCaptures = normalizedCaptures.filter((capture) => capture.captureKind === 'metric-session');
  if (metricSessionCaptures.length !== 1 || metricSessionCaptures[0].join.metricSessionId !== targetMetricSessionId) {
    fail('captured pair attempt assessment requires the target metric-session capture');
  }
  const primaryCaptureKind = session.comparisonKind === 'harness-overhead' ? 'sentinel' : 'workload';
  const expectedCounts = { [primaryCaptureKind]: 2, 'external-metric': 2, 'metric-session': 1 };
  if (normalizedCaptures.length !== 5 || Object.entries(expectedCounts).some(([captureKind, count]) => (
    normalizedCaptures.filter((capture) => capture.captureKind === captureKind).length !== count
  ))) fail(`captured pair attempt assessment requires two ${primaryCaptureKind}, two external-metric, and one metric-session capture`);

  const launches = session.launches;
  const launchesByRunId = new Map(launches.map((launch) => [launch.runId, launch]));
  for (const capture of normalizedCaptures) {
    if (capture.policyHash !== compiledPolicy.policyHash) fail('captured pair attempt capture does not bind the compiled policy');
    if (capture.captureKind === 'metric-session') {
      const open = input.ledger.find((entry) => entry.operationId === 'metric-adapter-session-open'
        && entry.metricSessionId === session.metricSessionId);
      if (!open || stableStringify(capture.join) !== stableStringify({
        metricSessionId: session.metricSessionId,
        comparisonKind: session.comparisonKind,
        backend: session.backend,
        pairIndex: session.attempt.pairIndex,
        attemptIndex: session.attempt.attemptIndex,
        metricSessionOpenSequence: open.sequence
      })) fail('captured pair attempt metric-session capture does not bind the terminal session');
      continue;
    }
    const launch = launchesByRunId.get(capture.join.runId);
    if (!launch || Object.entries(capture.join).some(([field, value]) => launch[field] !== value)) {
      fail('captured pair attempt run capture does not bind a terminal launch');
    }
  }
  for (const launch of launches) {
    const owned = normalizedCaptures.filter((capture) => capture.join?.runId === launch.runId);
    if (owned.length !== 2 || !owned.some((capture) => capture.captureKind === primaryCaptureKind)
      || !owned.some((capture) => capture.captureKind === 'external-metric')) {
      fail('captured pair attempt must bind one measurement and one external-metric capture to each launch');
    }
  }

  const environmentRows = decodePerformanceEvidence(
    encodePerformanceEvidence('environment-observation', input.environmentRows, compiledPolicy), compiledPolicy
  );
  const experimentId = launches[0].experimentId;
  const sourceSha = launches[0].sourceSha;
  if (environmentRows.some((row) => row.captureKind !== 'experiment-environment'
    || row.scopeKind !== 'experiment' || row.scopeId !== experimentId || row.experimentId !== experimentId
    || row.sourceSha !== sourceSha || row.policyHash !== compiledPolicy.policyHash || row.source !== 'external-monitor'
    || row.clockDomain !== 'runner' || row.observationKind === 'cleanup')) {
    fail('captured pair attempt environment rows do not bind the live experiment monitor');
  }
  const rows = new Map(compiledPolicy.rawKindOrder.map((rawKind) => [rawKind, []]));
  rows.set('environment-observation', environmentRows);
  for (const capture of normalizedCaptures) for (const group of capture.rawKinds) rows.get(group.rawKind).push(...group.rows);
  for (const rawKind of compiledPolicy.rawKindOrder) {
    rows.set(rawKind, decodePerformanceEvidence(encodePerformanceEvidence(rawKind, rows.get(rawKind), compiledPolicy), compiledPolicy));
  }
  const runEvidence = new Map(launches.map((launch) => [
    launch.runId, { runId: launch.runId, ...capturedRunMetricRows(launch, rows, compiledPolicy) }
  ]));
  const [baselineVariant, comparedVariant] = COMPARISON_BUILD_VARIANTS[session.comparisonKind];
  const baseline = runEvidence.get(launches.find((launch) => launch.buildVariant === baselineVariant)?.runId);
  const compared = runEvidence.get(launches.find((launch) => launch.buildVariant === comparedVariant)?.runId);
  if (!baseline || !compared) fail('captured pair attempt does not contain both policy build variants');
  return deepFreeze(capturedAttemptDisposition({ session, baseline, compared, rows }, compiledPolicy));
}

function validateClosure(value, label) {
  assertExactKeys(value, ['closed', 'stdoutDrained', 'stderrDrained', 'inputClosed', 'exit', 'zeroSurvivors'], label);
  assertExactKeys(value.exit, ['code', 'durationMs'], `${label}.exit`);
  if (value.closed !== true || value.stdoutDrained !== true || value.stderrDrained !== true || value.inputClosed !== true || value.zeroSurvivors !== true) {
    fail(`${label} must prove drained output, closed input, and zero survivors`);
  }
  assertSafeInteger(value.exit.code, `${label}.exit.code`, 0);
  assertFiniteNumber(value.exit.durationMs, `${label}.exit.durationMs`, 0);
  if (value.exit.durationMs > 5000) fail(`${label}.exit.durationMs exceeds the five-second closure bound`);
  return {
    closed: true,
    stdoutDrained: true,
    stderrDrained: true,
    inputClosed: true,
    exit: { code: value.exit.code, durationMs: value.exit.durationMs },
    zeroSurvivors: true
  };
}

function validateOwnership(value, label) {
  assertExactKeys(value, ['class'], label);
  if (!['application-owned', 'framework-owned'].includes(value.class)) fail(`${label}.class is invalid`);
  return { class: value.class };
}

const COMPARISON_BUILD_VARIANTS = Object.freeze({
  'harness-overhead': Object.freeze(['production', 'harness-control']),
  'instrumentation-overhead': Object.freeze(['harness-control', 'instrumented'])
});
const MAX_WHOLE_PAIR_RETRIES = 2;
const ABORT_LAST_BOUNDARY = Object.freeze({
  close: 'side-b',
  open: 'open',
  'reset-a': 'open',
  'side-a': 'reset-a',
  'reset-b': 'side-a',
  'side-b': 'reset-b'
});

function abortTupleKey(tuple) {
  return `${tuple.phase}\u0000${tuple.backend}\u0000${tuple.reason}`;
}

function validatePairAttempt(value, label, compiledPolicy) {
  assertExactKeys(value, ['pairIndex', 'attemptIndex', 'retryReason'], label);
  assertSafeInteger(value.pairIndex, `${label}.pairIndex`, 1);
  assertSafeInteger(value.attemptIndex, `${label}.attemptIndex`, 1);
  assertString(value.retryReason, `${label}.retryReason`, { nullable: true });
  if (value.attemptIndex === 1) {
    if (value.retryReason !== null) fail(`${label}.retryReason must be null for the original pair attempt`);
  } else {
    if (value.retryReason === null || !compiledPolicy.policy.performanceFailurePolicy.retryableReasons.includes(value.retryReason)) {
      fail(`${label}.retryReason must be a policy-declared retryable reason`);
    }
  }
  return clone(value);
}

function validateWholePairRetryTopology(sessions, compiledPolicy) {
  const usesAttempts = sessions.some((session) => session.attempt !== null);
  if (!usesAttempts) {
    if (sessions.length > 1) {
      fail('legacy ledger representation permits exactly one terminal pair; retries require explicit attempt metadata');
    }
    return {
      mode: 'legacy-single-attempt',
      pairs: sessions.map((session) => ({
        comparisonKind: session.comparisonKind,
        backend: session.backend,
        pairIndex: 1,
        attempts: [{ metricSessionId: session.metricSessionId, attemptIndex: 1, outcome: session.outcome }]
      })),
      supersededMetricSessionIds: new Set(),
      retryReasonByMetricSessionId: new Map(),
      hasUnresolvedAbort: sessions.some((session) => session.outcome === 'aborted')
    };
  }
  if (sessions.some((session) => session.attempt === null)) {
    fail('ledger attempt metadata must be present for every metric session once retries are modeled');
  }
  const groups = [];
  const groupByIdentity = new Map();
  for (const session of sessions) {
    if (!COMPARISON_BUILD_VARIANTS[session.comparisonKind] || !['canvas2d', 'webgpu'].includes(session.backend)) {
      fail('whole-pair attempt metadata requires a comparison kind and backend');
    }
    const pairIndex = session.attempt.pairIndex;
    const groupIdentity = stableStringify({ comparisonKind: session.comparisonKind, backend: session.backend, pairIndex });
    let group = groupByIdentity.get(groupIdentity);
    if (!group) {
      group = { comparisonKind: session.comparisonKind, backend: session.backend, pairIndex, attempts: [] };
      groupByIdentity.set(groupIdentity, group);
      groups.push(group);
    }
    if (groups.at(-1) !== group) fail('whole-pair attempts for one pair must be contiguous in the ledger');
    group.attempts.push(session);
  }
  const supersededMetricSessionIds = new Set();
  const retryReasonByMetricSessionId = new Map();
  let hasUnresolvedAbort = false;
  const nextPairIndexByFamily = new Map();
  groups.forEach((group) => {
    const familyIdentity = stableStringify({ comparisonKind: group.comparisonKind, backend: group.backend });
    const expectedPairIndex = nextPairIndexByFamily.get(familyIdentity) ?? 1;
    if (group.pairIndex !== expectedPairIndex) fail('pair indices must be contiguous from one within each comparison kind and backend');
    nextPairIndexByFamily.set(familyIdentity, expectedPairIndex + 1);
    if (group.attempts.length > MAX_WHOLE_PAIR_RETRIES + 1) {
      fail(`pair ${group.pairIndex} exceeds the ${MAX_WHOLE_PAIR_RETRIES}-retry limit`);
    }
    group.attempts.forEach((session, attemptOffset) => {
      const expectedAttemptIndex = attemptOffset + 1;
      if (session.attempt.attemptIndex !== expectedAttemptIndex) {
        fail(`pair ${group.pairIndex} attempt indices must be contiguous from one`);
      }
      if (attemptOffset === 0) return;
      const previous = group.attempts[attemptOffset - 1];
      const retryReason = session.attempt.retryReason;
      if (previous.outcome !== 'completed') {
        fail('partial or aborted metric sessions never authorize a retry');
      }
      if (!compiledPolicy.policy.performanceFailurePolicy.retryableReasons.includes(retryReason)) {
        fail('a retry must carry a policy-declared completed measurement-quality reason');
      }
      supersededMetricSessionIds.add(previous.metricSessionId);
      retryReasonByMetricSessionId.set(previous.metricSessionId, retryReason);
    });
    if (group.attempts.at(-1).outcome === 'aborted') hasUnresolvedAbort = true;
  });
  return {
    mode: 'explicit-attempts',
    pairs: groups.map((group) => ({
      comparisonKind: group.comparisonKind,
      backend: group.backend,
      pairIndex: group.pairIndex,
      attempts: group.attempts.map((session) => ({
        metricSessionId: session.metricSessionId,
        attemptIndex: session.attempt.attemptIndex,
        retryReason: session.attempt.retryReason,
        outcome: session.outcome
      }))
    })),
    supersededMetricSessionIds,
    retryReasonByMetricSessionId,
    hasUnresolvedAbort
  };
}

function validateAbort(entry, label, compiledPolicy, expectedPhase, expectedBackend) {
  assertExactKeys(entry.abortReason, ['phase', 'backend', 'reason'], `${label}.abortReason`);
  assertString(entry.abortReason.phase, `${label}.abortReason.phase`);
  assertString(entry.abortReason.backend, `${label}.abortReason.backend`);
  assertString(entry.abortReason.reason, `${label}.abortReason.reason`);
  if (entry.abortReason.phase !== expectedPhase) fail(`${label}.abortReason has the wrong failure phase`);
  if (entry.abortReason.backend !== expectedBackend) fail(`${label}.abortReason has the wrong backend`);
  const allowed = new Set(compiledPolicy.policy.performanceFailurePolicy.metricSessionAbortTuples.map(abortTupleKey));
  if (!allowed.has(abortTupleKey(entry.abortReason))) fail(`${label}.abortReason is not a policy-valid metric-session tuple`);
  if (entry.lastBoundary !== ABORT_LAST_BOUNDARY[expectedPhase]) {
    fail(`${label}.lastBoundary is invalid for the aborted phase`);
  }
  return clone(entry.abortReason);
}

function validateLedgerBase(entry, index, previousSequence, previousEnd, compiledPolicy) {
  assertObject(entry, `ledger[${index}]`);
  assertSafeInteger(entry.sequence, `ledger[${index}].sequence`, 1);
  if (entry.sequence !== previousSequence + 1) fail('ledger sequences must be contiguous');
  assertString(entry.operationId, `ledger[${index}].operationId`);
  if (!compiledPolicy.operations.has(entry.operationId)) fail(`ledger operation ${entry.operationId} is unknown`);
  assertFiniteNumber(entry.start, `ledger[${index}].start`, 0);
  assertFiniteNumber(entry.end, `ledger[${index}].end`, entry.start);
  if (entry.start < previousEnd) fail('ledger intervals must not overlap');
}

function resolveLedgerRegistryShape(entry, label, compiledPolicy) {
  const operation = compiledPolicy.operations.get(entry.operationId);
  if (!operation) fail(`${label}.operationId is not registered`);
  const shapes = operation.shapes.filter((shape) => Object.entries(shape.discriminator).every(([key, value]) => entry[key] === value));
  if (shapes.length !== 1) {
    fail(`${label} must resolve exactly one discriminator-aware operation-registry shape`);
  }
  const shape = shapes[0];
  for (const field of shape.forbiddenFields) {
    if (field in entry) fail(`${label} contains registry-forbidden field ${field}`);
  }
  const optionalFields = entry.operationId === 'metric-adapter-session-open'
    ? ['retryReason']
    : entry.operationId === 'electron-harness-spawn' && entry.purpose === 'measurement-side'
      ? ['measurementEpochId', 'frameSourceSequences']
      : [];
  const allowedFields = new Set([
    'sequence', 'operationId', 'start', 'end',
    ...Object.keys(shape.discriminator),
    ...shape.requiredFields,
    shape.terminalField,
    ...optionalFields
  ]);
  for (const field of Object.keys(entry)) {
    if (!allowedFields.has(field)) fail(`${label} contains registry-undeclared field ${field}`);
  }
  for (const field of shape.requiredFields) {
    if (!(field in entry) || entry[field] === undefined || entry[field] === null) {
      fail(`${label} is missing registry-required field ${field}`);
    }
  }
  if (!(shape.terminalField in entry) || entry[shape.terminalField] === undefined || entry[shape.terminalField] === null) {
    fail(`${label} is missing registry terminal field ${shape.terminalField}`);
  }
  if (!['closure', 'end'].includes(shape.terminalField)) {
    assertFiniteNumber(entry[shape.terminalField], `${label}.${shape.terminalField}`, entry.start);
    if (entry[shape.terminalField] !== entry.end) {
      fail(`${label}.${shape.terminalField} must equal the ledger interval end`);
    }
  }
  return shape;
}

function validateCanonicalRegistryGrammar(entries, compiledPolicy) {
  const shapes = entries.map((entry, index) => resolveLedgerRegistryShape(entry, `ledger[${index}]`, compiledPolicy));
  for (let index = 0; index < entries.length; index += 1) {
    const previous = entries[index - 1];
    const next = entries[index + 1];
    const shape = shapes[index];
    if (previous === undefined) {
      if (shape.predecessors.length !== 0) fail('canonical performance ledger must begin with a registry root operation');
    } else if (!shape.predecessors.includes(previous.operationId)) {
      fail(`ledger[${index}] violates the operation-registry predecessor grammar`);
    }
    if (next !== undefined && !shape.successors.includes(next.operationId)) {
      fail(`ledger[${index}] violates the operation-registry successor grammar`);
    }
  }
  const firstMetricIndex = entries.findIndex((entry) => entry.operationId === 'metric-adapter-session-open');
  if (firstMetricIndex < 0) fail('canonical performance ledger contains no metric-session transaction');
  const prefix = entries.slice(0, firstMetricIndex);
  const expectedOperations = [
    'generic-transport-spawn',
    'build-spawn',
    'build-spawn',
    'build-spawn',
    'electron-harness-spawn',
    ...(prefix.length === 6 ? ['electron-harness-spawn'] : [])
  ];
  if (stableStringify(prefix.map((entry) => entry.operationId)) !== stableStringify(expectedOperations)) {
    fail('canonical pre-loop ledger prefix must be exact generic transport, production/control/instrumented builds, Electron transport, and optional qualification order');
  }
  const buildIds = prefix.filter((entry) => entry.operationId === 'build-spawn').map((entry) => entry.buildId);
  if (stableStringify(buildIds) !== stableStringify(['production', 'harness-control', 'instrumented'])) {
    fail('canonical pre-loop build order must be production, harness-control, instrumented');
  }
  if (prefix[4]?.purpose !== 'transport-probe') fail('canonical Electron pre-loop operation must be the transport probe');
  if (prefix.length === 6 && prefix[5]?.purpose !== 'qualification-probe') {
    fail('canonical optional pre-loop operation must be the qualification probe');
  }
}

const CANONICAL_RUN_JOIN_FIELDS = [
  'sourceSha', 'policyHash', 'experimentId', 'pairPlanChecksum', 'ledgerSequence',
  'experimentRole', 'metricSessionId', 'comparisonKind', 'backend', 'pairIndex',
  'attemptIndex', 'comparisonSide', 'buildVariant', 'ordinal', 'runId',
  'externalExecutionId', 'observationBoundaryId'
];

function validateCanonicalLaunchJoin(entry, label, compiledPolicy) {
  const variantFields = entry.buildVariant === 'production'
    ? ['browserPid', 'browserCreationTime']
    : ['launchId', 'executionId'];
  const join = Object.fromEntries([...CANONICAL_RUN_JOIN_FIELDS, ...variantFields].map((field) => [field, entry[field]]));
  const validated = validatePerformanceRunJoin(join, { label: `${label} canonical run join` });
  if (validated.policyHash !== compiledPolicy.policyHash) fail(`${label}.policyHash does not bind the compiled policy`);
  if (validated.ledgerSequence !== entry.sequence) fail(`${label}.ledgerSequence must equal sequence`);
  return validated;
}

function validateLaunch(entry, label, session, expectedSide, compiledPolicy, { canonical = false } = {}) {
  const common = ['sequence', 'operationId', 'start', 'end', 'metricSessionId', 'comparisonSide', 'comparisonKind', 'buildVariant', 'runId', 'experimentId', 'backend', 'policyHash', 'ownership', 'cleanup', 'outcome'];
  let canonicalJoin = null;
  if (canonical) {
    canonicalJoin = validateCanonicalLaunchJoin(entry, label, compiledPolicy);
    if (entry.purpose !== 'measurement-side' || !['completed', 'failed'].includes(entry.outcome)) {
      fail(`${label} canonical launch discriminator is invalid`);
    }
  }
  if (entry.operationId === 'electron-harness-spawn') {
    const instrumented = entry.buildVariant === 'instrumented';
    const failure = entry.outcome === 'failed';
    if (!canonical) assertExactKeys(entry, [...common, 'launchId', 'executionId', ...(instrumented ? ['measurementEpochId', 'frameSourceSequences'] : []), ...(failure ? ['abortReason', 'lastBoundary'] : [])], label);
    if (!['harness-control', 'instrumented'].includes(entry.buildVariant)) fail(`${label}.buildVariant must be a harness variant`);
    assertString(entry.launchId, `${label}.launchId`);
    assertString(entry.executionId, `${label}.executionId`);
    if (instrumented) {
      assertString(entry.measurementEpochId, `${label}.measurementEpochId`);
      assertArray(entry.frameSourceSequences, `${label}.frameSourceSequences`);
      if (entry.frameSourceSequences.length === 0) fail(`${label}.frameSourceSequences must not be empty`);
      entry.frameSourceSequences.forEach((sequence, index) => {
        assertSafeInteger(sequence, `${label}.frameSourceSequences[${index}]`, 1);
        if (sequence !== index + 1) fail(`${label}.frameSourceSequences must be contiguous from one`);
      });
    }
  } else {
    const failure = entry.outcome === 'failed';
    if (!canonical) assertExactKeys(entry, [...common, 'externalExecutionId', ...(failure ? ['abortReason', 'lastBoundary'] : [])], label);
    if (entry.buildVariant !== 'production') fail(`${label}.buildVariant must be production`);
    assertString(entry.externalExecutionId, `${label}.externalExecutionId`);
  }
  assertString(entry.metricSessionId, `${label}.metricSessionId`);
  if (entry.metricSessionId !== session.id) fail(`${label} has the wrong metric session`);
  if (entry.comparisonSide !== expectedSide) fail(`${label} must be side ${expectedSide}`);
  if (!['harness-overhead', 'instrumentation-overhead'].includes(entry.comparisonKind)) fail(`${label}.comparisonKind is invalid`);
  assertString(entry.runId, `${label}.runId`);
  assertString(entry.experimentId, `${label}.experimentId`);
  if (!compiledPolicy.policy.reportPolicy.backends.includes(entry.backend)) fail(`${label}.backend is invalid`);
  if (entry.policyHash !== compiledPolicy.policyHash) fail(`${label}.policyHash does not bind the compiled policy`);
  if (!['completed', 'failed'].includes(entry.outcome)) fail(`${label}.outcome is invalid`);
  validateOwnership(entry.ownership, `${label}.ownership`);
  validateClosure(entry.cleanup, `${label}.cleanup`);
  const allowedVariants = COMPARISON_BUILD_VARIANTS[entry.comparisonKind];
  if (!allowedVariants.includes(entry.buildVariant)) fail(`${label}.buildVariant is incompatible with ${entry.comparisonKind}`);
  if (entry.comparisonKind === 'harness-overhead' && entry.operationId !== (entry.buildVariant === 'production' ? 'production-sentinel-spawn' : 'electron-harness-spawn')) {
    fail(`${label} has an invalid operation/build variant for harness overhead`);
  }
  if (entry.comparisonKind === 'instrumentation-overhead' && entry.operationId !== 'electron-harness-spawn') {
    fail(`${label} instrumentation overhead must use a harness launch`);
  }
  if (session.comparisonKind && session.comparisonKind !== entry.comparisonKind) fail(`${label} changes comparison kind within one metric session`);
  if (session.backend && session.backend !== entry.backend) fail(`${label} changes backend within one metric session`);
  if (session.experimentId && session.experimentId !== entry.experimentId) fail(`${label} changes experiment ID within one metric session`);
  if (canonical) {
    for (const field of ['sourceSha', 'policyHash', 'experimentId', 'pairPlanChecksum', 'experimentRole', 'comparisonKind', 'backend', 'pairIndex', 'attemptIndex', 'metricSessionId']) {
      if (session[field] !== null && session[field] !== undefined && session[field] !== canonicalJoin[field]) {
        fail(`${label} changes canonical ${field} within one metric session`);
      }
    }
  }
  if (session.buildVariants.has(entry.buildVariant)) fail(`${label} duplicates a comparison build variant`);
  if (entry.outcome === 'failed') {
    const expectedPhase = expectedSide === 'A' ? 'side-a' : 'side-b';
    validateAbort(entry, label, compiledPolicy, expectedPhase, entry.backend);
  }
  return entry;
}

function validateTransportCarrierTriplet(entry, label, compiledPolicy) {
  const policy = compiledPolicy.qualificationCapturePolicy;
  assertExactKeys(entry.executionIdentity, policy.executionIdentityFields, `${label}.executionIdentity`);
  assertString(entry.executionIdentity.externalExecutionId, `${label}.executionIdentity.externalExecutionId`);
  assertString(entry.executionIdentity.executionId, `${label}.executionIdentity.executionId`);
  assertExactKeys(entry.markerIdentity, policy.markerIdentityFields, `${label}.markerIdentity`);
  for (const field of policy.markerIdentityFields) assertString(entry.markerIdentity[field], `${label}.markerIdentity.${field}`);
  if (new Set(policy.markerIdentityFields.map((field) => entry.markerIdentity[field])).size !== 1) {
    fail(`${label}.markerIdentity fields must bind one launch marker`);
  }
  assertExactKeys(entry.transportIdentity, policy.transportIdentityFields, `${label}.transportIdentity`);
  for (const field of policy.transportIdentityFields) assertString(entry.transportIdentity[field], `${label}.transportIdentity.${field}`);
  return {
    externalExecutionId: entry.executionIdentity.externalExecutionId,
    executionId: entry.executionIdentity.executionId,
    launchId: entry.markerIdentity.launchId,
    observationBoundaryId: entry.transportIdentity.observationBoundaryId
  };
}

function validateElectronTransportProbe(entry, label, compiledPolicy, { canonical = false } = {}) {
  if (canonical) {
    if (entry.purpose !== 'transport-probe' || entry.outcome !== 'completed') {
      fail(`${label} Electron transport discriminator is invalid`);
    }
    return { ...clone(entry), ...validateTransportCarrierTriplet(entry, label, compiledPolicy) };
  }
  assertExactKeys(entry, [
    'sequence', 'operationId', 'start', 'end', 'transportId', 'operationMarker',
    'launchId', 'executionId', 'experimentId', 'policyHash', 'buildVariant',
    'ownership', 'cleanup', 'outcome'
  ], label);
  assertString(entry.transportId, `${label}.transportId`);
  assertString(entry.operationMarker, `${label}.operationMarker`);
  assertString(entry.launchId, `${label}.launchId`);
  if (entry.launchId !== entry.operationMarker) fail(`${label}.launchId must equal its operation marker`);
  assertString(entry.executionId, `${label}.executionId`);
  assertString(entry.experimentId, `${label}.experimentId`);
  if (entry.policyHash !== compiledPolicy.policyHash) fail(`${label}.policyHash does not bind the compiled policy`);
  if (entry.buildVariant !== 'harness-control') fail(`${label}.buildVariant must be harness-control`);
  validateOwnership(entry.ownership, `${label}.ownership`);
  validateClosure(entry.cleanup, `${label}.cleanup`);
  if (entry.outcome !== 'completed') fail(`${label}.outcome must prove a completed transport probe`);
  return clone(entry);
}

function validateQualificationLedgerEntry(entry, label, compiledPolicy) {
  const policy = compiledPolicy.qualificationCapturePolicy;
  assertExactKeys(entry, policy.qualificationLedgerFields, label);
  if (entry.operationId !== 'electron-harness-spawn' || entry.purpose !== 'qualification-probe'
    || entry.outcome !== 'completed' || entry.buildVariant !== 'harness-control') fail(`${label} qualification constants are invalid`);
  assertString(entry.experimentId, `${label}.experimentId`);
  if (entry.policyHash !== compiledPolicy.policyHash) fail(`${label}.policyHash does not bind the compiled policy`);
  assertString(entry.observationBoundaryId, `${label}.observationBoundaryId`);
  for (const field of ['operationMarker', 'launchId', 'executionId', 'externalExecutionId']) assertString(entry[field], `${label}.${field}`);
  assertExactKeys(entry.executionIdentity, policy.executionIdentityFields, `${label}.executionIdentity`);
  if (entry.executionIdentity.externalExecutionId !== entry.externalExecutionId
    || entry.executionIdentity.executionId !== entry.executionId) fail(`${label}.executionIdentity is inconsistent`);
  assertExactKeys(entry.markerIdentity, policy.markerIdentityFields, `${label}.markerIdentity`);
  if (entry.operationMarker !== entry.launchId || entry.markerIdentity.operationMarker !== entry.operationMarker
    || entry.markerIdentity.launchId !== entry.launchId || entry.markerIdentity.preloadEchoLaunchId !== entry.launchId
    || entry.markerIdentity.rendererEchoLaunchId !== entry.launchId) fail(`${label}.markerIdentity is inconsistent`);
  assertExactKeys(entry.transportIdentity, policy.transportIdentityFields, `${label}.transportIdentity`);
  assertString(entry.transportIdentity.transportId, `${label}.transportIdentity.transportId`);
  if (entry.transportIdentity.observationBoundaryId !== entry.observationBoundaryId) fail(`${label}.transportIdentity is inconsistent`);
  assertExactKeys(entry.capabilityEvidence, policy.capabilityEvidenceFields, `${label}.capabilityEvidence`);
  assertSha(entry.capabilityEvidence.captureBodyChecksum, `${label}.capabilityEvidence.captureBodyChecksum`);
  validateQualificationReadiness(entry.readinessEvidence, policy, `${label}.readinessEvidence`);
  validateQualificationCleanup(entry.cleanup, policy, `${label}.cleanup`);
  assertExactKeys(entry.ownership, policy.ownershipFields, `${label}.ownership`);
  if (entry.ownership.class !== 'application-owned') fail(`${label}.ownership is invalid`);
  if (entry.end !== entry.applicationDescendantClosureEnd) fail(`${label} runner-owned terminal timestamp is inconsistent`);
  return clone(entry);
}

/**
 * Validate the ledger as a closed transaction grammar. A session is either
 * `open -> reset A -> side A -> reset B -> side B -> completed close`, or it
 * terminates in one of the explicitly recorded abort forms.
 */
function validatePerformanceLedgerDetails(entries, compiledPolicy) {
  assertArray(entries, 'ledger entries');
  if (entries.length === 0) fail('ledger entries must not be empty');
  const canonical = entries[0].operationId !== 'metric-adapter-session-open';
  if (canonical) validateCanonicalRegistryGrammar(entries, compiledPolicy);
  let previousSequence = 0;
  let previousEnd = 0;
  let activeSession = null;
  const metricSessionIds = new Set();
  const resetIds = new Set();
  const runIds = new Set();
  const launchIds = new Set();
  const externalExecutionIds = new Set();
  const observationBoundaryIds = new Set();
  const launchOrdinals = [];
  const completedSessions = [];
  const terminalSessions = [];
  const qualificationEntries = [];
  const backendBindings = new Map();
  let binding = null;
  let hasMetricSession = false;
  let terminalAbort = false;
  let electronTransportSeen = false;
  for (const [index, entry] of entries.entries()) {
    validateLedgerBase(entry, index, previousSequence, previousEnd, compiledPolicy);
    previousSequence = entry.sequence;
    previousEnd = entry.end;
    if (terminalAbort) fail('ledger cannot contain an entry after an aborted metric session');
    const label = `ledger[${index}]`;
    if (entry.operationId === 'build-spawn' || entry.operationId === 'generic-transport-spawn') {
      if (activeSession) fail(`${entry.operationId} cannot occur inside a metric session`);
      if (hasMetricSession) fail(`${entry.operationId} is only valid in the pre-loop ledger prefix`);
      if (canonical) {
        if (entry.operationId === 'build-spawn') {
          assertString(entry.buildId, `${label}.buildId`);
          validateClosure(entry.closure, `${label}.closure`);
        } else {
          validateTransportCarrierTriplet(entry, label, compiledPolicy);
        }
      } else {
        const identifier = entry.operationId === 'build-spawn' ? 'buildId' : 'transportId';
        assertExactKeys(entry, ['sequence', 'operationId', 'start', 'end', identifier, 'closure'], label);
        assertString(entry[identifier], `${label}.${identifier}`);
        validateClosure(entry.closure, `${label}.closure`);
      }
      continue;
    }
    if (entry.operationId === 'metric-adapter-session-open') {
      if (activeSession) fail('metric session cannot be opened while another session is active');
      hasMetricSession = true;
      assertString(entry.metricSessionId, `${label}.metricSessionId`);
      if (metricSessionIds.has(entry.metricSessionId)) fail('metric session IDs must be unique');
      metricSessionIds.add(entry.metricSessionId);
      const hasAttempt = Object.prototype.hasOwnProperty.call(entry, 'attempt');
      const attempt = canonical
        ? validatePairAttempt({
          pairIndex: entry.pairIndex,
          attemptIndex: entry.attemptIndex,
          retryReason: Object.prototype.hasOwnProperty.call(entry, 'retryReason') ? entry.retryReason : null
        }, `${label} canonical attempt`, compiledPolicy)
        : hasAttempt ? validatePairAttempt(entry.attempt, `${label}.attempt`, compiledPolicy) : null;
      if (entry.outcome === 'ready') {
        if (!canonical) assertExactKeys(entry, ['sequence', 'operationId', 'start', 'end', 'metricSessionId', 'outcome', ...(hasAttempt ? ['attempt'] : [])], label);
        activeSession = {
          id: entry.metricSessionId,
          attempt,
          phase: 'reset-a',
          lastBoundary: 'open',
          comparisonKind: canonical ? entry.comparisonKind : null,
          backend: canonical ? entry.backend : null,
          pairIndex: canonical ? entry.pairIndex : null,
          attemptIndex: canonical ? entry.attemptIndex : null,
          sourceSha: null,
          policyHash: null,
          pairPlanChecksum: null,
          experimentRole: null,
          experimentId: null,
          buildVariants: new Set(),
          launches: []
        };
        continue;
      }
      if (!['failed-no-resource', 'failed-resource-owned'].includes(entry.outcome)) fail('metric session open outcome is invalid');
      if (!canonical) assertExactKeys(entry, ['sequence', 'operationId', 'start', 'end', 'metricSessionId', 'outcome', 'abortReason', 'lastBoundary', ...(entry.outcome === 'failed-no-resource' ? ['zeroSpawned'] : []), ...(hasAttempt ? ['attempt'] : [])], label);
      const abortReason = entry.outcome === 'failed-resource-owned'
        ? validateAbort(entry, label, compiledPolicy, 'open', 'none')
        : null;
      if (entry.outcome === 'failed-no-resource') {
        if (!canonical && entry.zeroSpawned !== true) fail('failed-no-resource open must prove zero spawned resource');
        terminalAbort = true;
        continue;
      }
      activeSession = {
        id: entry.metricSessionId,
        attempt,
        phase: 'resource-owned-abort-close',
        lastBoundary: entry.lastBoundary,
        abortReason,
        abortPhase: 'open',
        abortBackend: 'none',
        comparisonKind: canonical ? entry.comparisonKind : null,
        backend: canonical ? entry.backend : null,
        pairIndex: canonical ? entry.pairIndex : null,
        attemptIndex: canonical ? entry.attemptIndex : null,
        sourceSha: null,
        policyHash: null,
        pairPlanChecksum: null,
        experimentRole: null,
        experimentId: null,
        buildVariants: new Set(),
        launches: []
      };
      continue;
    }
    if (entry.operationId === 'internal-reset') {
      if (!activeSession || !['reset-a', 'reset-b'].includes(activeSession.phase)) fail('internal reset is out of metric-session order');
      const resetId = canonical ? entry.resetIdentity : entry.resetId;
      if (canonical) {
        assertString(resetId, `${label}.resetIdentity`);
      } else {
        assertExactKeys(entry, ['sequence', 'operationId', 'start', 'end', 'metricSessionId', 'resetId', 'boundary'], label);
        assertString(entry.metricSessionId, `${label}.metricSessionId`);
        assertString(resetId, `${label}.resetId`);
        if (entry.metricSessionId !== activeSession.id) fail('internal reset has the wrong metric session');
        const expectedBoundary = activeSession.phase === 'reset-a' ? 'reset-before-a' : 'reset-before-b';
        if (entry.boundary !== expectedBoundary) fail('internal reset boundary is invalid');
      }
      if (resetIds.has(resetId)) fail('internal reset IDs must be unique');
      resetIds.add(resetId);
      activeSession.phase = activeSession.phase === 'reset-a' ? 'side-a' : 'side-b';
      activeSession.lastBoundary = activeSession.phase === 'side-a' ? 'reset-a' : 'reset-b';
      continue;
    }
    if (entry.operationId === 'electron-harness-spawn' && !activeSession && !hasMetricSession) {
      if (entry.purpose === 'qualification-probe') {
        if (!electronTransportSeen || qualificationEntries.length > 0) fail('qualification probe must occur once after the Electron transport probe');
        const qualification = validateQualificationLedgerEntry(entry, label, compiledPolicy);
        if (launchIds.has(qualification.launchId)) fail('ledger harness launch IDs must be unique');
        launchIds.add(qualification.launchId);
        qualificationEntries.push(qualification);
      } else {
        if (electronTransportSeen) fail('Electron transport probe must occur once in the pre-loop prefix');
        const transport = validateElectronTransportProbe(entry, label, compiledPolicy, { canonical });
        if (launchIds.has(transport.launchId)) fail('ledger harness launch IDs must be unique');
        launchIds.add(transport.launchId);
        electronTransportSeen = true;
      }
      continue;
    }
    if (entry.operationId === 'electron-harness-spawn' || entry.operationId === 'production-sentinel-spawn') {
      if (!activeSession || !['side-a', 'side-b'].includes(activeSession.phase)) fail('performance launch is out of metric-session order');
      const expectedSide = activeSession.phase === 'side-a' ? 'A' : 'B';
      const launch = validateLaunch(entry, label, activeSession, expectedSide, compiledPolicy, { canonical });
      if (runIds.has(launch.runId)) fail('ledger run IDs must be unique');
      runIds.add(launch.runId);
      if (launch.operationId === 'electron-harness-spawn') {
        if (launchIds.has(launch.launchId)) fail('ledger harness launch IDs must be unique');
        launchIds.add(launch.launchId);
      }
      if (canonical || launch.operationId === 'production-sentinel-spawn') {
        if (externalExecutionIds.has(launch.externalExecutionId)) fail('ledger external execution IDs must be unique');
        externalExecutionIds.add(launch.externalExecutionId);
      }
      if (canonical) {
        if (observationBoundaryIds.has(launch.observationBoundaryId)) fail('ledger observation boundary IDs must be unique');
        observationBoundaryIds.add(launch.observationBoundaryId);
        launchOrdinals.push(launch.ordinal);
      }
      if (!binding) {
        binding = canonical
          ? Object.fromEntries(['sourceSha', 'policyHash', 'experimentId', 'experimentRole'].map((field) => [field, launch[field]]))
          : { experimentId: launch.experimentId, backend: launch.backend, policyHash: launch.policyHash };
      } else if (Object.entries(binding).some(([field, value]) => launch[field] !== value)) {
        fail(canonical
          ? 'ledger performance launches must bind one canonical experiment, source, role, and policy identity'
          : 'ledger performance launches must bind one experiment, backend, and policy identity');
      }
      if (canonical) {
        const existingBackendBinding = backendBindings.get(launch.backend);
        const currentBackendBinding = { pairPlanChecksum: launch.pairPlanChecksum };
        if (existingBackendBinding && stableStringify(existingBackendBinding) !== stableStringify(currentBackendBinding)) {
          fail(`ledger ${launch.backend} launches must bind one pair plan`);
        }
        backendBindings.set(launch.backend, currentBackendBinding);
      }
      activeSession.comparisonKind = launch.comparisonKind;
      activeSession.backend = launch.backend;
      activeSession.experimentId = launch.experimentId;
      if (canonical) {
        for (const field of ['sourceSha', 'policyHash', 'pairPlanChecksum', 'experimentRole']) activeSession[field] = launch[field];
      }
      activeSession.buildVariants.add(launch.buildVariant);
      activeSession.launches.push(clone(launch));
      if (launch.outcome === 'failed') {
        activeSession.phase = expectedSide === 'A' ? 'side-a-abort-close' : 'side-b-abort-close';
        activeSession.lastBoundary = expectedSide === 'A' ? 'reset-a' : 'reset-b';
        activeSession.abortReason = clone(launch.abortReason);
        activeSession.abortPhase = expectedSide === 'A' ? 'side-a' : 'side-b';
        activeSession.abortBackend = launch.backend;
      } else {
        activeSession.phase = activeSession.phase === 'side-a' ? 'reset-b' : 'completed-close';
        activeSession.lastBoundary = expectedSide === 'A' ? 'side-a' : 'side-b';
      }
      continue;
    }
    if (entry.operationId === 'metric-adapter-session-close') {
      if (!activeSession) fail('metric session close has no matching open');
      assertString(entry.metricSessionId, `${label}.metricSessionId`);
      if (entry.metricSessionId !== activeSession.id) fail('metric session close has the wrong metric session');
      if (activeSession.phase === 'completed-close' && entry.outcome === 'completed') {
        if (!canonical) assertExactKeys(entry, ['sequence', 'operationId', 'start', 'end', 'metricSessionId', 'outcome', 'closure'], label);
        if (entry.outcome !== 'completed') fail('completed metric session must close as completed');
        const expectedVariants = COMPARISON_BUILD_VARIANTS[activeSession.comparisonKind];
        if (!expectedVariants || activeSession.buildVariants.size !== expectedVariants.length || expectedVariants.some((variant) => !activeSession.buildVariants.has(variant))) {
          fail('completed metric session does not contain the exact comparison build variants');
        }
        validateClosure(entry.closure, `${label}.closure`);
        const completedSession = {
          metricSessionId: activeSession.id,
          attempt: activeSession.attempt,
          comparisonKind: activeSession.comparisonKind,
          backend: activeSession.backend,
          experimentId: activeSession.experimentId,
          launches: clone(activeSession.launches),
          outcome: 'completed',
          abortReason: null
        };
        completedSessions.push(completedSession);
        terminalSessions.push(completedSession);
        activeSession = null;
        continue;
      }
      if (!canonical) assertExactKeys(entry, ['sequence', 'operationId', 'start', 'end', 'metricSessionId', 'outcome', 'abortReason', 'lastBoundary', 'closure'], label);
      if (entry.outcome !== 'aborted') fail('incomplete metric session must close as aborted');
      const abortPhase = activeSession.abortPhase ?? (activeSession.phase === 'completed-close' ? 'close' : activeSession.phase);
      const abortBackend = activeSession.abortBackend ?? (abortPhase.startsWith('side-') ? (activeSession.backend ?? entry.abortReason?.backend) : 'none');
      if (abortPhase.startsWith('side-') && !['canvas2d', 'webgpu'].includes(abortBackend)) {
        fail('aborted measurement side must name a valid backend');
      }
      const abortReason = validateAbort(entry, label, compiledPolicy, abortPhase, abortBackend);
      if (entry.lastBoundary !== activeSession.lastBoundary) fail('aborted metric-session close has the wrong last boundary');
      if (activeSession.abortReason && stableStringify(abortReason) !== stableStringify(activeSession.abortReason)) fail('resource-owned failure must close with its original abort reason');
      validateClosure(entry.closure, `${label}.closure`);
      terminalSessions.push({
        metricSessionId: activeSession.id,
        attempt: activeSession.attempt,
        comparisonKind: activeSession.comparisonKind,
        backend: activeSession.backend ?? abortReason.backend,
        experimentId: activeSession.experimentId,
        launches: clone(activeSession.launches),
        outcome: 'aborted',
        abortReason
      });
      activeSession = null;
      continue;
    }
    fail(`ledger operation ${entry.operationId} has no state-machine transition`);
  }
  if (activeSession) fail('ledger has an unclosed metric session');
  if (canonical) {
    launchOrdinals.forEach((ordinal, index) => {
      if (ordinal !== index + 1) fail('canonical ledger launch ordinals must be contiguous from one in ledger order');
    });
    if (binding && ((binding.experimentRole === 'reference-comparison') !== (qualificationEntries.length === 1))) {
      fail('canonical qualification probe presence must match the experiment role');
    }
  }
  const retryTopology = validateWholePairRetryTopology(terminalSessions, compiledPolicy);
  for (const session of completedSessions) {
    const retryReason = retryTopology.retryReasonByMetricSessionId.get(session.metricSessionId) ?? null;
    session.retryReason = retryReason;
    session.supersededByRetry = retryTopology.supersededMetricSessionIds.has(session.metricSessionId);
  }
  const acceptedInstrumentedRuns = completedSessions
    .filter((session) => !session.supersededByRetry)
    .flatMap((session) => session.launches.filter((launch) => launch.comparisonKind === 'instrumentation-overhead' && launch.buildVariant === 'instrumented'));
  return {
    ledger: clone(entries),
    binding: binding && clone(binding),
    backendBindings: Object.fromEntries([...backendBindings.entries()].map(([backend, value]) => [backend, clone(value)])),
    acceptedInstrumentedRuns: clone(acceptedInstrumentedRuns),
    completedSessions: clone(completedSessions),
    terminalSessions: clone(terminalSessions),
    qualificationEntries: clone(qualificationEntries),
    canonical,
    retryTopology: {
      mode: retryTopology.mode,
      pairs: retryTopology.pairs
    },
    hasAbortedSession: terminalAbort || retryTopology.hasUnresolvedAbort
  };
}

export function validatePerformanceLedger(entries, compiledPolicy = loadBaselinePolicy()) {
  return validatePerformanceLedgerDetails(entries, compiledPolicy).ledger;
}

function ledgerBindsExperimentBackend(details, experimentId, backend, policyHash) {
  return Boolean(details.binding
    && details.binding.experimentId === experimentId
    && details.binding.policyHash === policyHash
    && (details.canonical ? details.backendBindings[backend] : details.binding.backend === backend));
}

export function deriveAcceptedInstrumentedLedgerRuns(entries, { experimentId, backend } = {}, compiledPolicy = loadBaselinePolicy()) {
  assertString(experimentId, 'accepted instrumented run experimentId');
  if (!compiledPolicy.policy.reportPolicy.backends.includes(backend)) fail('accepted instrumented run backend is invalid');
  const details = validatePerformanceLedgerDetails(entries, compiledPolicy);
  if (!ledgerBindsExperimentBackend(details, experimentId, backend, compiledPolicy.policyHash)) {
    fail('ledger does not bind the requested experiment, backend, and policy identity');
  }
  const acceptedRuns = details.acceptedInstrumentedRuns.filter((entry) => entry.backend === backend);
  if (acceptedRuns.length === 0) fail('ledger has no accepted instrumented runs');
  return acceptedRuns;
}

export function rgbaTransferFootprint(width, height) {
  assertSafeInteger(width, 'width', 0);
  assertSafeInteger(height, 'height', 0);
  const bytes = width * height * 4;
  if (!Number.isSafeInteger(bytes)) fail('RGBA transfer footprint exceeds safe integer precision');
  return bytes;
}

function allocationKey(row) {
  return `${row.runId}\u0000${row.operationId}\u0000${row.sourceLocationId}`;
}

function compareAllocationTuple(left, right) {
  return compareCodeUnitStrings(allocationKey(left), allocationKey(right));
}

export function deriveAllocationExpectedCoverage({ acceptedRunIds, frameCountByRun }, compiledPolicy = loadBaselinePolicy()) {
  assertArray(acceptedRunIds, 'acceptedRunIds');
  if (acceptedRunIds.length === 0) fail('acceptedRunIds must not be empty');
  assertObject(frameCountByRun, 'frameCountByRun');
  const uniqueRunIds = [...new Set(acceptedRunIds)];
  if (uniqueRunIds.length !== acceptedRunIds.length) fail('acceptedRunIds must be unique');
  const coverage = compiledPolicy.policy.allocationEvidencePolicy.webgpu.coverage;
  const expected = [];
  for (const runId of uniqueRunIds.sort()) {
    assertString(runId, 'accepted run ID');
    const frameCount = frameCountByRun[runId];
    assertSafeInteger(frameCount, `frameCountByRun.${runId}`, 1);
    for (const requirement of coverage) {
      expected.push({
        runId,
        operationId: requirement.operationId,
        sourceLocationId: requirement.sourceLocationId,
        carrier: requirement.carrier,
        lifecyclePhase: requirement.lifecyclePhase ?? null,
        byteSemantics: requirement.byteSemantics,
        expectedCardinality: requirement.cardinality === 'per-frame' ? frameCount : requirement.cardinality
      });
    }
  }
  return expected.sort(compareAllocationTuple);
}

function validateEvidenceProvenance(value, label, compiledPolicy) {
  assertObject(value, label);
  if (value.kind === 'runtime-capture') {
    assertExactKeys(value, ['kind', 'captureProvenance'], label);
    return { kind: value.kind, captureProvenance: validateCaptureProvenance(value.captureProvenance) };
  }
  const capacityPolicy = compiledPolicy.policy.capacityFixturePolicy;
  if (value.kind === capacityPolicy.provenanceKind) {
    assertExactKeys(value, ['kind', 'scenario', 'publicationEligible', 'runtimeMeasurement'], label);
    assertString(value.scenario, `${label}.scenario`);
    if (value.publicationEligible !== capacityPolicy.publicationEligible || value.runtimeMeasurement !== capacityPolicy.runtimeMeasurement) {
      fail(`${label} synthetic capacity fixtures must be non-publication and non-runtime`);
    }
    return {
      kind: value.kind,
      scenario: value.scenario,
      publicationEligible: capacityPolicy.publicationEligible,
      runtimeMeasurement: capacityPolicy.runtimeMeasurement
    };
  }
  fail(`${label}.kind must be runtime-capture or ${capacityPolicy.provenanceKind}`);
}

function validateAllocationLedgerBinding({ experimentId, backend, policyHash, ledger }, compiledPolicy) {
  assertString(experimentId, 'allocation evidence.experimentId');
  if (backend !== 'webgpu') fail('allocation ledger binding is only valid for WebGPU');
  assertSha(policyHash, 'allocation evidence.policyHash');
  if (policyHash !== compiledPolicy.policyHash) fail('allocation evidence.policyHash does not bind the compiled policy');
  assertArray(ledger, 'allocation evidence.ledger');
  const acceptedRuns = deriveAcceptedInstrumentedLedgerRuns(ledger, { experimentId, backend }, compiledPolicy);
  const joins = new Map();
  for (const run of acceptedRuns) {
    if (run.policyHash !== policyHash || run.experimentId !== experimentId || run.backend !== backend || run.comparisonKind !== 'instrumentation-overhead' || run.buildVariant !== 'instrumented') {
      fail('accepted instrumented ledger run has an invalid allocation binding');
    }
    if (joins.has(run.runId)) fail('accepted instrumented ledger runs contain a duplicate run ID');
    joins.set(run.runId, {
      runId: run.runId,
      executionId: run.executionId,
      measurementEpochId: run.measurementEpochId,
      frameSourceSequences: clone(run.frameSourceSequences),
      buildVariant: run.buildVariant,
      experimentId: run.experimentId,
      backend: run.backend,
      policyHash: run.policyHash
    });
  }
  return joins;
}

function validateAllocationByteSemantics(row, expected, label) {
  if (row.byteKind !== expected.byteSemantics) fail(`${label}.byteKind does not match the operation byte semantics`);
  if (expected.byteSemantics === 'rgba-transfer-footprint') {
    assertSafeInteger(row.sourceWidth, `${label}.sourceWidth`, 1);
    assertSafeInteger(row.sourceHeight, `${label}.sourceHeight`, 1);
    assertSafeInteger(row.byteValue, `${label}.byteValue`, 0);
    if (row.byteValue !== rgbaTransferFootprint(row.sourceWidth, row.sourceHeight)) fail(`${label}.byteValue must equal the RGBA transfer footprint`);
    return;
  }
  if (expected.byteSemantics === 'requested-byte-length') {
    assertSafeInteger(row.requestedByteLength, `${label}.requestedByteLength`, 0);
    assertSafeInteger(row.byteValue, `${label}.byteValue`, 0);
    if (row.byteValue !== row.requestedByteLength) fail(`${label}.byteValue must equal requestedByteLength`);
    return;
  }
  if (expected.byteSemantics === 'descriptor-size') {
    assertSafeInteger(row.descriptorSize, `${label}.descriptorSize`, 0);
    assertSafeInteger(row.byteValue, `${label}.byteValue`, 0);
    if (row.byteValue !== row.descriptorSize) fail(`${label}.byteValue must equal descriptorSize`);
    return;
  }
  if (expected.byteSemantics === 'logical-texel-footprint') {
    assertExactKeys(row.textureDescriptor, ['width', 'height', 'depth', 'format', 'usage', 'logicalTexelFootprint'], `${label}.textureDescriptor`);
    assertSafeInteger(row.textureDescriptor.width, `${label}.textureDescriptor.width`, 1);
    assertSafeInteger(row.textureDescriptor.height, `${label}.textureDescriptor.height`, 1);
    assertSafeInteger(row.textureDescriptor.depth, `${label}.textureDescriptor.depth`, 1);
    assertString(row.textureDescriptor.format, `${label}.textureDescriptor.format`);
    assertString(row.textureDescriptor.usage, `${label}.textureDescriptor.usage`);
    assertSafeInteger(row.textureDescriptor.logicalTexelFootprint, `${label}.textureDescriptor.logicalTexelFootprint`, 0);
    assertSafeInteger(row.byteValue, `${label}.byteValue`, 0);
    if (row.byteValue !== row.textureDescriptor.logicalTexelFootprint) fail(`${label}.byteValue must equal the declared logical texel footprint`);
    return;
  }
  if (expected.byteSemantics === 'count-only-unavailable') {
    if (row.byteValue !== null) fail(`${label}.byteValue must be null for count-only operations`);
    return;
  }
  fail(`${label} has an unknown byte semantics`);
}

function validateAllocationRow(row, index, expected, joins) {
  const label = `allocation row ${index}`;
  const common = ['experimentId', 'backend', 'policyHash', 'runId', 'operationId', 'sourceLocationId', 'carrier', 'requestOrdinal', 'outcome', 'byteKind', 'byteValue'];
  const semantics = expected.byteSemantics === 'rgba-transfer-footprint'
    ? ['sourceWidth', 'sourceHeight']
    : expected.byteSemantics === 'requested-byte-length'
      ? ['requestedByteLength']
      : expected.byteSemantics === 'descriptor-size'
        ? ['descriptorSize']
        : expected.byteSemantics === 'logical-texel-footprint'
          ? ['textureDescriptor']
          : [];
  if (row.carrier === 'frame-request') {
    assertExactKeys(row, [...common, 'measurementWindowId', 'measurementEpochId', 'sourceSequence', 'diagnosticFrameId', 'frameToken', ...semantics], label);
  } else if (row.carrier === 'lifecycle-request') {
    assertExactKeys(row, [...common, 'executionId', 'lifecyclePhase', 'phaseSequence', ...semantics], label);
  } else {
    fail(`${label}.carrier is invalid`);
  }
  for (const field of ['experimentId', 'backend', 'policyHash', 'runId', 'operationId', 'sourceLocationId', 'carrier']) assertString(row[field], `${label}.${field}`);
  if (row.operationId !== expected.operationId || row.sourceLocationId !== expected.sourceLocationId || row.carrier !== expected.carrier) {
    fail(`${label} has an incompatible operation, source location, or carrier`);
  }
  if (row.outcome !== 'success') fail(`${label}.outcome must be success`);
  assertSafeInteger(row.requestOrdinal, `${label}.requestOrdinal`, 1);
  const join = joins.get(row.runId);
  if (!join) fail(`${label}.runId does not join an accepted instrumented run`);
  if (row.experimentId !== join.experimentId || row.backend !== join.backend || row.policyHash !== join.policyHash) {
    fail(`${label} does not bind the accepted run experiment, backend, and policy identity`);
  }
  if (row.carrier === 'frame-request') {
    assertString(row.measurementWindowId, `${label}.measurementWindowId`);
    assertString(row.measurementEpochId, `${label}.measurementEpochId`);
    if (row.measurementEpochId !== join.measurementEpochId) fail(`${label}.measurementEpochId does not join the run epoch`);
    assertSafeInteger(row.sourceSequence, `${label}.sourceSequence`, 1);
    if (!join.frameSourceSequences.includes(row.sourceSequence)) fail(`${label}.sourceSequence does not join the run frame cohort`);
    assertString(row.diagnosticFrameId, `${label}.diagnosticFrameId`);
    assertSafeInteger(row.frameToken, `${label}.frameToken`, 1);
    validateAllocationByteSemantics(row, expected, label);
    return {
      requestDomain: stableStringify([row.runId, row.measurementEpochId, row.sourceSequence]),
      requestOrdinal: row.requestOrdinal,
      phaseDomain: null,
      phaseSequence: null
    };
  } else {
    assertString(row.executionId, `${label}.executionId`);
    if (row.executionId !== join.executionId) fail(`${label}.executionId does not join the run execution`);
    if (row.lifecyclePhase !== expected.lifecyclePhase) fail(`${label}.lifecyclePhase is incompatible with the operation`);
    assertSafeInteger(row.phaseSequence, `${label}.phaseSequence`, 1);
    validateAllocationByteSemantics(row, expected, label);
    return {
      requestDomain: stableStringify([row.runId, row.executionId, row.lifecyclePhase, row.operationId, row.sourceLocationId]),
      requestOrdinal: row.requestOrdinal,
      phaseDomain: stableStringify([row.runId, row.executionId, row.lifecyclePhase]),
      phaseSequence: row.phaseSequence
    };
  }
}

function decodeAllocationEvidenceRows(encodedRows, compiledPolicy) {
  assertArray(encodedRows, 'allocation evidence.encodedRows');
  if (encodedRows.length === 0) fail('allocation evidence.encodedRows must not be empty');
  const allocationRawKinds = sortCodeUnitStrings(Object.entries(compiledPolicy.policy.performanceEvidenceChunkPolicy.rawKinds)
    .filter(([, definition]) => definition.literalValues.carrier !== undefined)
    .map(([rawKind]) => rawKind));
  const seenRawKinds = new Set();
  let previousRawKindIndex = -1;
  const rows = [];
  for (const [index, entry] of encodedRows.entries()) {
    assertExactKeys(entry, ['rawKind', 'encoded'], `allocation evidence.encodedRows[${index}]`);
    const rawKindIndex = allocationRawKinds.indexOf(entry.rawKind);
    if (rawKindIndex === -1) fail(`allocation evidence.encodedRows[${index}].rawKind is invalid`);
    if (seenRawKinds.has(entry.rawKind)) fail(`allocation evidence.encodedRows must contain exactly one canonical manifest for ${entry.rawKind}`);
    if (rawKindIndex <= previousRawKindIndex) fail('allocation evidence.encodedRows must be ordered by canonical raw kind');
    seenRawKinds.add(entry.rawKind);
    previousRawKindIndex = rawKindIndex;
    const decoded = decodePerformanceEvidence(entry.encoded, compiledPolicy);
    if (entry.encoded.rawKind !== entry.rawKind) fail(`allocation evidence.encodedRows[${index}] raw kind does not bind its canonical encoding`);
    for (const [rowIndex, row] of decoded.entries()) {
      if (row.carrier !== entry.rawKind) fail(`allocation evidence.encodedRows[${index}].rows[${rowIndex}] has a carrier incompatible with its encoded raw kind`);
      rows.push(row);
    }
  }
  return allocationRowsFromRaw(rows);
}

function validateSyntheticCapacityCoverage(value, expected, frameCountByRun, compiledPolicy) {
  assertObject(value, 'allocation evidence.syntheticCoverage');
  assertExactKeys(value, ['encoding', 'frameCohorts', 'observedCoverage'], 'allocation evidence.syntheticCoverage');
  if (value.encoding !== compiledPolicy.policy.capacityFixturePolicy.encoding) {
    fail('synthetic allocation coverage uses an unknown capacity-only encoding');
  }
  assertArray(value.frameCohorts, 'allocation evidence.syntheticCoverage.frameCohorts');
  const expectedFrameCohorts = Object.entries(frameCountByRun)
    .sort(([left], [right]) => compareCodeUnitStrings(left, right))
    .map(([runId, callbackCount]) => ({ runId, callbackCount }));
  for (const [index, cohort] of value.frameCohorts.entries()) {
    assertExactKeys(cohort, ['runId', 'callbackCount'], `allocation evidence.syntheticCoverage.frameCohorts[${index}]`);
    assertString(cohort.runId, `allocation evidence.syntheticCoverage.frameCohorts[${index}].runId`);
    assertSafeInteger(cohort.callbackCount, `allocation evidence.syntheticCoverage.frameCohorts[${index}].callbackCount`, 1);
  }
  if (stableStringify(value.frameCohorts) !== stableStringify(expectedFrameCohorts)) {
    fail('synthetic allocation coverage frame cohorts must be the exact sorted ledger-derived callback cardinalities');
  }
  assertArray(value.observedCoverage, 'allocation evidence.syntheticCoverage.observedCoverage');
  if (value.observedCoverage.length !== expected.length) {
    fail('synthetic allocation coverage must declare every policy-derived tuple exactly once');
  }
  const normalized = [];
  for (const [index, coverage] of value.observedCoverage.entries()) {
    assertExactKeys(coverage, ['runId', 'operationId', 'sourceLocationId', 'observedCardinality'], `allocation evidence.syntheticCoverage.observedCoverage[${index}]`);
    assertString(coverage.runId, `allocation evidence.syntheticCoverage.observedCoverage[${index}].runId`);
    assertString(coverage.operationId, `allocation evidence.syntheticCoverage.observedCoverage[${index}].operationId`);
    assertString(coverage.sourceLocationId, `allocation evidence.syntheticCoverage.observedCoverage[${index}].sourceLocationId`);
    assertSafeInteger(coverage.observedCardinality, `allocation evidence.syntheticCoverage.observedCoverage[${index}].observedCardinality`, 0);
    const expectedEntry = expected[index];
    if (!expectedEntry || allocationKey(coverage) !== allocationKey(expectedEntry)) {
      fail('synthetic allocation coverage is not a sorted exact projection of the policy-derived tuples');
    }
    if (coverage.observedCardinality > expectedEntry.expectedCardinality) {
      fail('synthetic allocation coverage exceeds policy cardinality');
    }
    normalized.push({
      runId: coverage.runId,
      operationId: coverage.operationId,
      sourceLocationId: coverage.sourceLocationId,
      observedCardinality: coverage.observedCardinality
    });
  }
  return {
    encoding: value.encoding,
    frameCohorts: expectedFrameCohorts,
    observedCoverage: normalized
  };
}

export function deriveAllocationEvidence(input, compiledPolicy = loadBaselinePolicy()) {
  assertObject(input, 'allocation evidence input');
  const allowedKeys = ['experimentId', 'backend', 'policyHash', 'ledger', 'rows', 'encodedRows', 'syntheticCoverage', 'evidenceProvenance'];
  for (const key of Object.keys(input)) {
    if (!allowedKeys.includes(key)) fail(key === 'expectedCoverage' ? 'allocation expectedCoverage is policy-derived and cannot be supplied by a producer' : `allocation evidence has an unknown field ${key}`);
  }
  const { experimentId, backend, policyHash, ledger, evidenceProvenance } = input;
  assertString(backend, 'allocation backend');
  const provenance = validateEvidenceProvenance(evidenceProvenance, 'allocation evidence.evidenceProvenance', compiledPolicy);
  const formCount = Number(input.rows !== undefined) + Number(input.encodedRows !== undefined) + Number(input.syntheticCoverage !== undefined);
  if (formCount !== 1) fail('allocation evidence must provide exactly one of raw rows, canonical encoded rows, or synthetic capacity coverage');
  const syntheticCoverage = input.syntheticCoverage !== undefined;
  const syntheticFixture = provenance.kind === compiledPolicy.policy.capacityFixturePolicy.provenanceKind;
  if (syntheticCoverage && !syntheticFixture) {
    fail('synthetic allocation coverage is forbidden for runtime-capture evidence');
  }
  const rows = syntheticCoverage ? [] : input.rows === undefined ? decodeAllocationEvidenceRows(input.encodedRows, compiledPolicy) : input.rows;
  assertArray(rows, 'allocation rows');
  if (backend === 'canvas2d') {
    if (syntheticCoverage) fail('Canvas allocation evidence cannot use synthetic coverage');
    if (rows.length > 0) fail('Canvas allocation rows are forbidden for the locked no-capture workload');
    return { state: compiledPolicy.policy.allocationEvidencePolicy.canvas2d.state, observedCoverage: [], missingCoverage: [] };
  }
  if (backend !== 'webgpu') fail('allocation backend is invalid');
  const joins = validateAllocationLedgerBinding({ experimentId, backend, policyHash, ledger }, compiledPolicy);
  const acceptedRunIds = [...joins.keys()].sort();
  const frameCountByRun = Object.fromEntries(acceptedRunIds.map((runId) => [runId, joins.get(runId).frameSourceSequences.length]));
  const expected = deriveAllocationExpectedCoverage({ acceptedRunIds, frameCountByRun }, compiledPolicy);
  const expectedByKey = new Map(expected.map((entry) => [allocationKey(entry), entry]));
  const observed = new Map();
  const requestSequences = new Map();
  const phaseSequences = new Map();
  const frameRowsByRun = new Map();
  let observedRowCount = 0;
  let syntheticCapacityCoverage = null;
  if (syntheticCoverage) {
    syntheticCapacityCoverage = validateSyntheticCapacityCoverage(input.syntheticCoverage, expected, frameCountByRun, compiledPolicy);
    for (const [index, coverage] of syntheticCapacityCoverage.observedCoverage.entries()) {
      const expectedEntry = expected[index];
      const key = allocationKey(expectedEntry);
      observed.set(key, coverage.observedCardinality);
      observedRowCount += coverage.observedCardinality;
      if (expectedEntry.carrier === 'frame-request') frameRowsByRun.set(expectedEntry.runId, (frameRowsByRun.get(expectedEntry.runId) ?? 0) + coverage.observedCardinality);
    }
  } else {
    for (const [index, row] of rows.entries()) {
      assertObject(row, `allocation row ${index}`);
      for (const field of ['runId', 'operationId', 'sourceLocationId', 'carrier']) assertString(row[field], `allocation row ${index}.${field}`);
      const expectedEntry = expectedByKey.get(allocationKey(row));
      if (!expectedEntry) fail(`allocation row ${index} has unknown operation or source location`);
      const sequence = validateAllocationRow(row, index, expectedEntry, joins);
      if (row.carrier === 'frame-request') frameRowsByRun.set(row.runId, (frameRowsByRun.get(row.runId) ?? 0) + 1);
      const key = allocationKey(row);
      observed.set(key, (observed.get(key) ?? 0) + 1);
      const seenRequests = requestSequences.get(sequence.requestDomain) ?? new Set();
      if (seenRequests.has(sequence.requestOrdinal)) fail(`allocation row ${index} duplicates a request ordinal in its domain`);
      seenRequests.add(sequence.requestOrdinal);
      requestSequences.set(sequence.requestDomain, seenRequests);
      if (sequence.phaseDomain !== null) {
        const seenPhases = phaseSequences.get(sequence.phaseDomain) ?? new Set();
        if (seenPhases.has(sequence.phaseSequence)) fail(`allocation row ${index} duplicates a lifecycle phase sequence`);
        seenPhases.add(sequence.phaseSequence);
        phaseSequences.set(sequence.phaseDomain, seenPhases);
      }
      observedRowCount += 1;
    }
  }
  const missingCoverage = expected.map((entry) => ({
    runId: entry.runId,
    operationId: entry.operationId,
    sourceLocationId: entry.sourceLocationId,
    expectedCardinality: entry.expectedCardinality,
    observedCardinality: observed.get(allocationKey(entry)) ?? 0
  })).filter((entry) => entry.observedCardinality !== entry.expectedCardinality).sort(compareAllocationTuple);
  if (observedRowCount === 0) fail('WebGPU allocation evidence requires a nonempty observed subset');
  if (!syntheticCoverage) {
    for (const seenSequences of [...requestSequences.values(), ...phaseSequences.values()]) {
      const highestSequence = seenSequences.size === 0 ? 0 : Math.max(...seenSequences);
      if (highestSequence !== seenSequences.size) fail('allocation evidence has a gap within an observed ordinal domain');
    }
    for (const [key, count] of observed) {
      const entry = expectedByKey.get(key);
      if (count > entry.expectedCardinality) fail('allocation evidence exceeds policy cardinality');
    }
  }
  for (const runId of acceptedRunIds) {
    if ((frameRowsByRun.get(runId) ?? 0) === 0) fail(`WebGPU allocation evidence has no observed frame subset for ${runId}`);
  }
  const observedCoverage = [...observed.entries()].filter(([, observedCardinality]) => observedCardinality > 0).map(([key, observedCardinality]) => {
    const [runId, operationId, sourceLocationId] = key.split('\u0000');
    return { runId, operationId, sourceLocationId, observedCardinality };
  }).sort(compareAllocationTuple);
  const capacityOnly = syntheticFixture ? {
    evidenceClass: 'synthetic-capacity-only',
    allocationValuesObserved: false,
    ...(syntheticCapacityCoverage === null ? {} : {
      syntheticCapacityCoverage: {
        ...syntheticCapacityCoverage,
        semanticExpansionChecksum: canonicalSha256(expected)
      }
    })
  } : {
    evidenceClass: 'runtime-capture',
    allocationValuesObserved: true
  };
  if (missingCoverage.length === 0) {
    if (provenance.kind !== 'runtime-capture' && !syntheticFixture) fail('allocation evidence provenance is invalid');
    return { state: 'measured-request-proxy', observedCoverage, missingCoverage: [], ...capacityOnly };
  }
  return {
    state: 'unavailable-incomplete-request-coverage',
    observedCoverage,
    missingCoverage,
    blocker: 'phase-5-webgpu-allocation-request-proxy',
    ...capacityOnly
  };
}

function rowKey(row, sortKeys) {
  return sortKeys.map((key) => stableStringify(canonicalOptionalValue(row[key], {
    present: Object.prototype.hasOwnProperty.call(row, key)
  }))).join('\u0000');
}

function rowShapeMatches(row, shape) {
  for (const selector of [
    'eventKind', 'comparisonKind', 'observationKind', 'operationKind',
    'messageKind', 'clockDomain', 'outcome'
  ]) {
    if (Object.prototype.hasOwnProperty.call(shape, selector) && row[selector] !== shape[selector]) return false;
  }
  const pluralSelectors = {
    buildVariants: 'buildVariant',
    comparisonKinds: 'comparisonKind',
    backends: 'backend'
  };
  for (const [selector, field] of Object.entries(pluralSelectors)) {
    if (Object.prototype.hasOwnProperty.call(shape, selector) && !shape[selector].includes(row[field])) return false;
  }
  return true;
}

function validateBuildFieldRule(row, field, rule, label) {
  const present = Object.prototype.hasOwnProperty.call(row, field);
  if (rule === 'null' && (!present || row[field] !== null)) fail(`${label}.${field} must be present and null`);
  if (rule === 'null-when-present' && present && row[field] !== null) fail(`${label}.${field} must be null when present`);
  if (rule === 'nonempty' && (!present || typeof row[field] !== 'string' || row[field].length === 0)) fail(`${label}.${field} must be a nonempty string`);
  if (rule === 'positive-token' && (!present || !Number.isSafeInteger(row[field]) || row[field] < 1)) fail(`${label}.${field} must be a positive safe-integer token`);
  if (typeof rule === 'boolean' && (!present || row[field] !== rule)) fail(`${label}.${field} must equal its build-field literal`);
  if (!['null', 'null-when-present', 'nonempty', 'positive-token'].includes(rule) && typeof rule !== 'boolean') fail(`${label}.${field} has an unknown build-field rule`);
}

function assertObjectSchema(value, requiredFields, optionalFields, nestedFields, label) {
  assertObject(value, label);
  const required = new Set(requiredFields ?? []);
  const allowed = new Set([...required, ...(optionalFields ?? [])]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${label} has a forbidden field ${key}`);
  for (const key of required) if (!(key in value)) fail(`${label} is missing ${key}`);
  for (const [key, fields] of Object.entries(nestedFields ?? {})) {
    if (Object.prototype.hasOwnProperty.call(value, key)) assertExactKeys(value[key], fields, `${label}.${key}`);
  }
}

function parseUnsignedDecimal(value, label) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) fail(`${label} must be an unsigned decimal string`);
  return BigInt(value);
}

function parseMacosCpuTime(value, label) {
  if (typeof value !== 'string') fail(`${label} must be a macOS ps CPU time`);
  const daySplit = value.split('-');
  if (daySplit.length > 2) fail(`${label} must be a macOS ps CPU time`);
  const days = daySplit.length === 2 ? Number(daySplit[0]) : 0;
  const clock = daySplit.at(-1);
  if (!/^\d+(?::\d+){1,2}(?:\.\d+)?$/.test(clock) || !Number.isSafeInteger(days) || days < 0) {
    fail(`${label} must be a macOS ps CPU time`);
  }
  const parts = clock.split(':');
  if (parts.length !== 2 && parts.length !== 3) fail(`${label} must be MM:SS or HH:MM:SS`);
  const hours = parts.length === 3 ? Number(parts[0]) : 0;
  const minutes = Number(parts.at(-2));
  const seconds = Number(parts.at(-1));
  if (!Number.isSafeInteger(hours) || hours < 0 || !Number.isSafeInteger(minutes) || minutes < 0 || minutes >= 60
    || !Number.isFinite(seconds) || seconds < 0 || seconds >= 60) fail(`${label} has an invalid clock component`);
  return (((days * 24) + hours) * 60 + minutes) * 60 + seconds;
}

function rawAdapterDefinition(row, compiledPolicy, label) {
  const definitions = compiledPolicy.policy.processAdapterRegistry.rawAdapterKinds.filter((candidate) => (
    candidate.adapterId === row.adapterId && candidate.rawAdapterKind === row.rawAdapterKind
  ));
  if (definitions.length !== 1) fail(`${label} adapterId/rawAdapterKind must resolve exactly one policy adapter`);
  return definitions[0];
}

function decodeRawAdapterSample(definition, raw, label) {
  assertObjectSchema(raw, definition.sampleFields, definition.sampleOptionalFields, definition.nestedFields, label);
  if (definition.decoderRule === 'linux-procfs-v1') {
    for (const field of ['pid', 'userTicks', 'systemTicks', 'startTicks', 'residentPages', 'pageSize', 'clockTicks']) {
      const minimum = ['pid', 'pageSize', 'clockTicks'].includes(field) ? 1 : 0;
      assertSafeInteger(raw[field], `${label}.${field}`, minimum);
    }
    if (!Number.isSafeInteger(raw.userTicks + raw.systemTicks)
      || !Number.isSafeInteger(raw.residentPages * raw.pageSize)) fail(`${label} exceeds safe integer precision`);
    return {
      pid: raw.pid,
      creationIdentity: String(raw.startTicks),
      cumulativeCpuSeconds: (raw.userTicks + raw.systemTicks) / raw.clockTicks,
      workingSetMiB: (raw.residentPages * raw.pageSize) / (1024 * 1024),
      counterQuantumSeconds: 1 / raw.clockTicks
    };
  }
  if (definition.decoderRule === 'macos-ps-v1') {
    assertSafeInteger(raw.pid, `${label}.pid`, 1);
    assertString(raw.creationIdentity, `${label}.creationIdentity`);
    assertSafeInteger(raw.residentSetKiB, `${label}.residentSetKiB`, 0);
    return {
      pid: raw.pid,
      creationIdentity: raw.creationIdentity,
      cumulativeCpuSeconds: parseMacosCpuTime(raw.cpuTime, `${label}.cpuTime`),
      workingSetMiB: raw.residentSetKiB / 1024,
      counterQuantumSeconds: 0.01
    };
  }
  if (definition.decoderRule === 'windows-powershell-v1') {
    const totalProcessorTimeTicks = parseUnsignedDecimal(raw.totalProcessorTimeTicks, `${label}.totalProcessorTimeTicks`);
    const workingSetBytes = parseUnsignedDecimal(raw.workingSetBytes, `${label}.workingSetBytes`);
    const sampler = raw.sampler;
    assertSafeInteger(sampler.pid, `${label}.sampler.pid`, 1);
    assertString(sampler.creationIdentity, `${label}.sampler.creationIdentity`);
    const readStartTicks = parseUnsignedDecimal(sampler.readStartTicks, `${label}.sampler.readStartTicks`);
    const readEndTicks = parseUnsignedDecimal(sampler.readEndTicks, `${label}.sampler.readEndTicks`);
    const stopwatchFrequency = parseUnsignedDecimal(sampler.stopwatchFrequency, `${label}.sampler.stopwatchFrequency`);
    if (readEndTicks < readStartTicks || stopwatchFrequency === 0n) fail(`${label}.sampler has an invalid read bracket`);
    const bracketSeconds = Number(readEndTicks - readStartTicks) / Number(stopwatchFrequency);
    if (!Number.isFinite(bracketSeconds) || bracketSeconds < 0 || bracketSeconds > 0.05
      || sampler.bracketSeconds !== bracketSeconds) fail(`${label}.sampler bracket projection is invalid`);
    if (workingSetBytes > BigInt(Number.MAX_SAFE_INTEGER)) fail(`${label}.workingSetBytes exceeds safe integer precision`);
    const cumulativeCpuSeconds = Number(totalProcessorTimeTicks) / 10_000_000;
    if (!Number.isFinite(cumulativeCpuSeconds)) fail(`${label}.totalProcessorTimeTicks exceeds finite numeric precision`);
    return {
      pid: sampler.pid,
      creationIdentity: sampler.creationIdentity,
      cumulativeCpuSeconds,
      workingSetMiB: Number(workingSetBytes) / (1024 * 1024),
      counterQuantumSeconds: 0.0000001
    };
  }
  return null;
}

function validateMetricSessionCarrier(value, row, label) {
  assertExactKeys(value, ['adapterId', 'result', 'transitions'], label);
  if (value.adapterId !== row.adapterId || !Array.isArray(value.transitions) || value.transitions.length === 0) {
    fail(`${label} does not bind the metric adapter session`);
  }
  let priorAt = -Infinity;
  const operation = row.observationKind === 'closure' ? 'detach' : 'attach';
  const matches = [];
  value.transitions.forEach((transition, index) => {
    assertObjectSchema(transition, ['sequence', 'operation', 'at'], ['target'], {}, `${label}.transitions[${index}]`);
    if (transition.sequence !== index + 1 || !Number.isFinite(transition.at) || transition.at < priorAt) {
      fail(`${label}.transitions must be contiguous and monotonic`);
    }
    priorAt = transition.at;
    if (transition.target !== undefined) {
      assertExactKeys(transition.target, ['pid', 'creationIdentity', 'processIdentity', 'counterQuantumSeconds'], `${label}.transitions[${index}].target`);
      if (transition.operation === operation && transition.target.pid === row.pid
        && transition.target.creationIdentity === row.creationIdentity) matches.push(transition.target);
    }
  });
  if (matches.length !== 1) fail(`${label} must contain one matching ${operation} transition`);
  return matches[0].processIdentity;
}

function validateElectronMetricIdentity(value, compiledPolicy, label) {
  const definition = compiledPolicy.policy.processAdapterRegistry.rawAdapterKinds.find((candidate) => candidate.decoderRule === 'electron-app-metrics-v1');
  if (!definition) fail('electron process adapter is not registered');
  assertObjectSchema(value, definition.identityFields, definition.identityOptionalFields, definition.nestedFields, label);
  assertSafeInteger(value.pid, `${label}.pid`, 1);
  assertFiniteNumber(value.creationTime, `${label}.creationTime`, 0);
  if (!compiledPolicy.policy.processAdapterRegistry.rawProcessClasses.includes(value.type)) fail(`${label}.type is not registered`);
}

function validateProcessCarrier(row, compiledPolicy, label) {
  const registry = compiledPolicy.policy.processAdapterRegistry;
  const definition = rawAdapterDefinition(row, compiledPolicy, label);
  const schemas = registry.processObservationSchemas.filter((candidate) => (
    candidate.adapterIds.includes(row.adapterId)
      && candidate.observationKinds.includes(row.observationKind)
      && candidate.captureKinds.includes(row.captureKind)
  ));
  if (schemas.length !== 1) fail(`${label} must resolve exactly one process observation schema`);
  const schema = schemas[0];
  if (row.processClass !== schema.processClass || row.ownership !== schema.ownership || row.alive !== schema.alive) {
    fail(`${label} normalized process class, ownership, or liveness differs from policy`);
  }
  if (row.observationKind === 'health' && row.healthState !== schema.healthState) fail(`${label}.healthState differs from policy`);
  if (row.observationKind === 'closure' && row.closureState !== schema.closureState) fail(`${label}.closureState differs from policy`);
  const carrierField = { membership: 'rawMembership', health: 'rawHealth', closure: 'rawClosure' }[row.observationKind];
  let decoded = null;
  let processIdentity = null;
  if (definition.decoderRule === 'electron-app-metrics-v1' && row.observationKind === 'closure') {
    assertExactKeys(row.rawIdentity, ['pid', 'creationTime'], `${label}.rawIdentity`);
  } else {
    assertObjectSchema(row.rawIdentity, definition.identityFields, definition.identityOptionalFields, definition.nestedFields, `${label}.rawIdentity`);
    if (definition.decoderRule && definition.decoderRule !== 'electron-app-metrics-v1') decoded = decodeRawAdapterSample(definition, row.rawIdentity, `${label}.rawIdentity`);
  }
  if (schema.carrierSchema === 'adapter-sample') {
    const carrier = decodeRawAdapterSample(definition, row[carrierField], `${label}.${carrierField}`);
    if (!carrier || stableStringify(row[carrierField]) !== stableStringify(row.rawIdentity)) {
      fail(`${label}.${carrierField} must retain the exact raw adapter carrier`);
    }
  } else if (schema.carrierSchema === 'metric-session-audit') {
    processIdentity = validateMetricSessionCarrier(row[carrierField], row, `${label}.${carrierField}`);
  } else if (schema.carrierSchema === 'electron-broker-sample') {
    const carrier = row[carrierField];
    assertExactKeys(carrier, ['launchId', 'callSequence', 'phase', 'purpose', 'capturedAt', 'rawAppMetrics', 'servedFromCache'], `${label}.${carrierField}`);
    assertArray(carrier.rawAppMetrics, `${label}.${carrierField}.rawAppMetrics`);
    carrier.rawAppMetrics.forEach((metric, index) => validateElectronMetricIdentity(metric, compiledPolicy, `${label}.${carrierField}.rawAppMetrics[${index}]`));
    const matches = carrier.rawAppMetrics.filter((metric) => metric.pid === row.pid && String(metric.creationTime) === row.creationIdentity);
    if (matches.length !== 1 || stableStringify(matches[0]) !== stableStringify(row.rawIdentity)) fail(`${label}.${carrierField} does not contain rawIdentity`);
    processIdentity = `browser:${carrier.launchId}:${row.pid}`;
  } else if (schema.carrierSchema === 'electron-root-exit') {
    const carrier = row[carrierField];
    assertExactKeys(carrier, ['launchId', 'protocol', 'rootExitObservedAt', 'terminalClosureEnd', 'root', 'frameworkSurvivors'], `${label}.${carrierField}`);
    assertExactKeys(carrier.root, ['pid', 'creationTime'], `${label}.${carrierField}.root`);
    assertArray(carrier.frameworkSurvivors, `${label}.${carrierField}.frameworkSurvivors`);
    if (carrier.root.pid !== row.pid || String(carrier.root.creationTime) !== row.creationIdentity) fail(`${label}.${carrierField} does not bind the browser root`);
    processIdentity = `browser:${carrier.launchId}:${row.pid}`;
  } else if (schema.carrierSchema === 'registered-fields') {
    assertObjectSchema(row[carrierField], definition.sampleFields, definition.sampleOptionalFields, definition.nestedFields, `${label}.${carrierField}`);
    if (row.observationKind === 'health') {
      const rawHealth = row[carrierField];
      if (typeof rawHealth.alive !== 'boolean' || typeof rawHealth.status !== 'string') {
        fail(`${label}.${carrierField} has invalid registered health fields`);
      }
      const live = rawHealth.alive === true
        && !['dead', 'exited', 'closed', 'terminated'].includes(rawHealth.status)
        && rawHealth.exitObservation === null;
      const expectedHealthState = live ? 'live' : rawHealth.status;
      if (row.alive !== live || row.healthState !== expectedHealthState) {
        fail(`${label} normalized health differs from its raw registered carrier`);
      }
    } else if (row.observationKind === 'closure') {
      const rawClosure = row[carrierField];
      if (rawClosure.terminalStatus !== 'closed' || rawClosure.exitCode !== 0
        || rawClosure.signal !== null || rawClosure.zeroSurvivors !== true
        || row.alive !== false || row.closureState !== 'closed') {
        fail(`${label} normalized closure differs from its raw zero-survivor terminal carrier`);
      }
    }
  } else {
    fail(`${label} uses an unknown process carrier schema`);
  }
  const pid = decoded?.pid ?? row.rawIdentity.pid;
  const creationIdentity = decoded?.creationIdentity ?? String(row.rawIdentity.creationTime ?? row.rawIdentity.creationIdentity);
  if (row.pid !== pid || row.creationIdentity !== creationIdentity) fail(`${label} normalized identity differs from rawIdentity`);
  if (schema.processIdentityRule === 'renderer-external-execution') processIdentity = `renderer:${row.externalExecutionId}:${row.pid}`;
  else if (schema.processIdentityRule === 'external-carrier') processIdentity = `external:${row.pid}:${row.creationIdentity}`;
  else if (!['metric-session-transition', 'browser-execution'].includes(schema.processIdentityRule)) fail(`${label} uses an unknown process identity rule`);
  if (processIdentity !== null && row.processIdentity !== processIdentity) fail(`${label}.processIdentity differs from its raw-derived identity`);
}

function validateEnvironmentCarrier(row, compiledPolicy, label) {
  const policy = compiledPolicy.policy.performanceEnvironmentPolicy;
  const shapes = policy.rawAdapterShapes.filter((candidate) => candidate.source === row.source
    && candidate.rawAdapterKind === row.rawAdapterKind && candidate.observationKinds.includes(row.observationKind));
  if (shapes.length !== 1) fail(`${label} must resolve exactly one environment carrier shape`);
  const shape = shapes[0];
  const clockMappings = policy.clockDomainMappings.filter((candidate) => candidate.source === row.source
    && candidate.rawAdapterKind === row.rawAdapterKind && candidate.observationKinds.includes(row.observationKind));
  if (clockMappings.length !== 1 || row.clockDomain !== clockMappings[0].clockDomain) {
    fail(`${label}.clockDomain differs from its policy-owned environment carrier mapping`);
  }
  assertObjectSchema(row.rawObservation, shape.requiredFields, shape.optionalFields, {}, `${label}.rawObservation`);
  for (const [field, literal] of Object.entries(shape.literalValues ?? {})) {
    if (stableStringify(row.rawObservation[field]) !== stableStringify(literal)) fail(`${label}.rawObservation.${field} differs from policy`);
  }
  if (shape.projectionRule === 'host-snapshot') {
    if (stableStringify(row.dynamicState) !== stableStringify(row.rawObservation.dynamicState)
      || (row.staticIdentity !== undefined && stableStringify(row.staticIdentity) !== stableStringify(row.rawObservation.staticIdentity))) {
      fail(`${label} normalized host snapshot differs from its raw carrier`);
    }
  } else if (shape.projectionRule === 'host-transition') {
    if (row.eventName !== row.rawObservation.eventName
      || stableStringify(row.dynamicState) !== stableStringify(row.rawObservation.currentDynamicState)) {
      fail(`${label} normalized host transition differs from its raw carrier`);
    }
  } else if (shape.projectionRule === 'host-cleanup') {
    if (row.cleanupState !== row.rawObservation.cleanupState
      || row.rawObservation.lastSourceSequence !== row.sourceSequence - 1
      || row.rawObservation.remainingPollTimerCount !== 0
      || row.rawObservation.remainingListenerCount !== 0) {
      fail(`${label} normalized host cleanup differs from its raw carrier`);
    }
  } else if (shape.projectionRule === 'electron-current-state') {
    if (row.observedAt !== row.rawObservation.capturedAt || row.sourceSequence !== row.rawObservation.callSequence) fail(`${label} Electron observation ordering differs from its carrier`);
    if (row.dynamicState !== undefined && stableStringify(row.dynamicState) !== stableStringify(row.rawObservation.currentState)) fail(`${label}.dynamicState differs from currentState`);
    if (row.staticIdentity !== undefined && stableStringify(row.staticIdentity) !== stableStringify(row.rawObservation.currentState)) fail(`${label}.staticIdentity differs from currentState`);
  } else if (shape.projectionRule === 'renderer-used-bytes') {
    if (row.usedBytes !== row.rawObservation.usedBytes || row.observedAt !== row.rawObservation.observedAt) fail(`${label} renderer heap projection differs from its carrier`);
  } else if (shape.projectionRule === 'renderer-unavailable') {
    if (row.rawObservation.availability !== 'unavailable' || row.reason !== row.rawObservation.unavailableReason
      || !policy.rendererHeapUnavailableReasons.includes(row.reason)) fail(`${label} renderer unavailability projection differs from its carrier`);
  } else {
    fail(`${label} uses an unknown environment projection rule`);
  }
  if (row.observationKind === 'event' && !policy.electronEventNames.includes(row.eventName)) fail(`${label}.eventName is not registered`);
}

function validateControllerCarrier(row, compiledPolicy, label) {
  const policy = compiledPolicy.policy.performanceControllerAuditPolicy;
  if (!policy.operationKinds.includes(row.operationKind) || !policy.clockDomains.includes(row.clockDomain)) fail(`${label} has an unregistered controller discriminator`);
  const shape = policy.operationShapes.filter((candidate) => candidate.operationKind === row.operationKind);
  if (shape.length !== 1 || stableStringify(shape[0].fields) !== stableStringify(Object.keys(row).filter((key) => shape[0].fields.includes(key)))) {
    if (shape.length !== 1) fail(`${label} has no unique controller operation shape`);
  }
  if (row.operationKind === 'request') {
    if (!policy.channels.includes(row.channel) || !policy.requestKinds.includes(row.requestKind)) fail(`${label} request discriminator is not registered`);
    assertExactKeys(row.rawRequest, policy.requestPayloadFields[row.requestKind], `${label}.rawRequest`);
  } else if (row.operationKind === 'response') {
    if (!policy.channels.includes(row.channel) || !policy.responseKinds.includes(row.responseKind)) fail(`${label} response discriminator is not registered`);
    assertExactKeys(row.rawResponse, policy.responsePayloadFields[row.responseKind], `${label}.rawResponse`);
  } else if (row.operationKind === 'broker-sample') {
    if (!policy.sampleKinds.includes(row.sampleKind)) fail(`${label}.sampleKind is not registered`);
    assertExactKeys(row.rawSample, policy.brokerSampleFields, `${label}.rawSample`);
    if (row.brokerSequence !== row.rawSample.callSequence || row.sampleKind !== row.rawSample.purpose || row.observedAt !== row.rawSample.capturedAt) fail(`${label} broker projection differs from its carrier`);
  } else if (row.operationKind === 'control-write') {
    if (!policy.writeKinds.includes(row.writeKind) || row.rawWrite.kind !== row.writeKind || row.rawWrite.observedAt !== row.writtenAt) fail(`${label} control-write projection differs from its carrier`);
    if (row.writeKind === 'backend-ready') {
      assertExactKeys(row.rawWrite, policy.backendReadyFields, `${label}.rawWrite`);
      if (!['canvas2d', 'webgpu'].includes(row.rawWrite.requestedBackend)
        || !['canvas2d', 'webgpu'].includes(row.rawWrite.selectedBackend)) fail(`${label} backend-ready backend is invalid`);
      if (!policy.backendSelectionReasons.includes(row.rawWrite.selectionReason)) fail(`${label} backend-ready selectionReason is invalid`);
      const identity = row.rawWrite.backendExecutionIdentity;
      if (row.rawWrite.selectedBackend === 'canvas2d') {
        if (identity !== null) fail(`${label} Canvas backend-ready identity must be null`);
      } else if (row.rawWrite.selectedBackend === 'webgpu') {
        assertExactKeys(identity, ['backend', 'driver', 'workerProtocol', 'adapterIdentity', 'limits', 'isFallbackAdapter', 'powerPreference'], `${label}.rawWrite.backendExecutionIdentity`);
        assertExactKeys(identity.adapterIdentity, ['vendor', 'architecture', 'device', 'description'], `${label}.rawWrite.backendExecutionIdentity.adapterIdentity`);
        assertExactKeys(identity.limits, ['maxTextureDimension2D', 'maxBindGroups'], `${label}.rawWrite.backendExecutionIdentity.limits`);
        if (identity.backend !== 'webgpu' || identity.driver !== 'webgpu-driver-v1' || identity.workerProtocol !== 'webgpu-worker-ready-v1') fail(`${label} WebGPU backend identity is invalid`);
        for (const field of ['vendor', 'architecture', 'device', 'description']) {
          if (identity.adapterIdentity[field] !== null) assertString(identity.adapterIdentity[field], `${label}.rawWrite.backendExecutionIdentity.adapterIdentity.${field}`);
        }
        assertBoolean(identity.isFallbackAdapter, `${label}.rawWrite.backendExecutionIdentity.isFallbackAdapter`);
        if (!['low-power', 'high-performance'].includes(identity.powerPreference)) fail(`${label} WebGPU powerPreference is invalid`);
        assertSafeInteger(identity.limits.maxTextureDimension2D, `${label}.rawWrite.backendExecutionIdentity.limits.maxTextureDimension2D`, 1);
        assertSafeInteger(identity.limits.maxBindGroups, `${label}.rawWrite.backendExecutionIdentity.limits.maxBindGroups`, 1);
      } else {
        fail(`${label} backend-ready selectedBackend is invalid`);
      }
    }
  } else if (row.operationKind === 'controller-lifecycle') {
    if (!policy.lifecyclePhases.includes(row.lifecyclePhase)) fail(`${label}.lifecyclePhase is not registered`);
    assertObjectSchema(row.rawLifecycleEvent, policy.lifecycleEventRequiredFields, policy.lifecycleEventOptionalFields, {}, `${label}.rawLifecycleEvent`);
    if (row.rawLifecycleEvent.event !== row.lifecyclePhase || row.rawLifecycleEvent.at !== row.observedAt) fail(`${label} lifecycle projection differs from its carrier`);
  }
  if (row.outcome !== undefined && !policy.operationOutcomes.includes(row.outcome)) fail(`${label}.outcome is not registered`);
}

function validateRawEvidenceCarrier(row, rawKind, compiledPolicy, label) {
  if (rawKind === 'cpu-sample') {
    const definition = rawAdapterDefinition(row, compiledPolicy, label);
    const authority = compiledPolicy.policy.processAdapterRegistry.cpuSampleRawAuthorityPolicy;
    const schema = authority.schemas.find((candidate) => candidate.adapterId === row.adapterId
      && candidate.rawAdapterKind === row.rawAdapterKind);
    if (!schema || stableStringify({
      sampleFields: schema.sampleFields,
      sampleOptionalFields: schema.sampleOptionalFields,
      nestedFields: schema.nestedFields
    }) !== stableStringify({
      sampleFields: definition.sampleFields,
      sampleOptionalFields: definition.sampleOptionalFields,
      nestedFields: definition.nestedFields
    })) fail(`${label} CPU raw authority schema does not match its platform adapter`);
    assertExactKeys(row.rawAdapterSample, authority.wrapperFields, `${label}.rawAdapterSample`);
    const { adapterSample, readStart, readEnd } = row.rawAdapterSample;
    assertFiniteNumber(readStart, `${label}.rawAdapterSample.readStart`, 0);
    assertFiniteNumber(readEnd, `${label}.rawAdapterSample.readEnd`, readStart);
    if (readEnd - readStart > compiledPolicy.policy.performanceMetricPolicy.maximumReadDurationMs / 1000) {
      fail(`${label}.rawAdapterSample read bracket exceeds the policy bound`);
    }
    if (row.readStart !== readStart || row.readEnd !== readEnd) {
      fail(`${label} normalized CPU read bracket differs from its raw authority wrapper`);
    }
    assertObjectSchema(adapterSample, schema.sampleFields, schema.sampleOptionalFields, schema.nestedFields, `${label}.rawAdapterSample.adapterSample`);
    const decoded = decodeRawAdapterSample(definition, adapterSample, `${label}.rawAdapterSample.adapterSample`);
    if (!decoded || row.pid !== decoded.pid || row.creationIdentity !== decoded.creationIdentity
      || row.cumulativeCpuSeconds !== decoded.cumulativeCpuSeconds || row.workingSetMiB !== decoded.workingSetMiB
      || row.counterQuantumSeconds !== decoded.counterQuantumSeconds) fail(`${label} normalized CPU fields differ from its raw adapter carrier`);
  } else if (rawKind === 'process-observation') validateProcessCarrier(row, compiledPolicy, label);
  else if (rawKind === 'environment-observation') validateEnvironmentCarrier(row, compiledPolicy, label);
  else if (rawKind === 'controller-operation') validateControllerCarrier(row, compiledPolicy, label);
}

function groupRows(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const groupKey = stableStringify(key(row));
    const group = groups.get(groupKey) ?? [];
    group.push(row);
    groups.set(groupKey, group);
  }
  return groups.values();
}

function assertContiguousSequence(rows, field, label, start = 1) {
  const values = rows.map((row) => row[field]).sort((left, right) => left - right);
  values.forEach((value, index) => {
    if (value !== start + index) fail(`${label}.${field} must be contiguous from ${start}`);
  });
}

function validateControllerTranscript(rows) {
  for (const scopeRows of groupRows(rows, (row) => [row.captureKind, row.scopeKind, row.scopeId])) {
    assertContiguousSequence(scopeRows, 'controlSequence', 'controller transcript');
    const requests = new Map();
    const responses = new Set();
    const brokerRows = [];
    const lifecycleRows = [];
    for (const row of [...scopeRows].sort((left, right) => left.controlSequence - right.controlSequence)) {
      if (row.operationKind === 'request') {
        if (requests.has(row.controllerRequestId)) fail('controller transcript duplicates a request ID');
        requests.set(row.controllerRequestId, row);
      } else if (row.operationKind === 'response') {
        const request = requests.get(row.controllerRequestId);
        if (!request || responses.has(row.controllerRequestId)) fail('controller response must follow exactly one request');
        if (request.channel !== row.channel || request.requestKind !== row.responseKind || row.receivedAt < request.sentAt) {
          fail('controller response does not preserve request channel, kind, and ordering');
        }
        responses.add(row.controllerRequestId);
      } else if (row.operationKind === 'broker-sample') brokerRows.push(row);
      else if (row.operationKind === 'controller-lifecycle') lifecycleRows.push(row);
    }
    if (requests.size !== responses.size) fail('controller transcript contains an unanswered request');
    if (brokerRows.length > 0) assertContiguousSequence(brokerRows, 'brokerSequence', 'controller broker transcript');
    if (lifecycleRows.length > 0) {
      const lifecycleSequences = lifecycleRows.map((row) => row.rawLifecycleEvent.sequence).sort((left, right) => left - right);
      lifecycleSequences.forEach((value, index) => {
        if (value !== index + 1) fail('controller lifecycle event sequence must be contiguous from one');
      });
    }
    const runRows = scopeRows.filter((row) => row.scopeKind === 'run');
    if (runRows.length > 0) {
      const variants = new Set(runRows.map((row) => row.buildVariant));
      if (variants.size !== 1) fail('controller run transcript changes build variant');
      const buildVariant = [...variants][0];
      const backendReady = runRows.filter((row) => row.operationKind === 'control-write' && row.writeKind === 'backend-ready');
      if (['harness-control', 'instrumented'].includes(buildVariant) && backendReady.length !== 1) {
        fail('harness controller transcript must retain exactly one backend-ready write');
      }
      if (buildVariant === 'production' && backendReady.length !== 0) fail('production controller transcript cannot contain backend-ready writes');
    }
  }
}

function validateRawTranscript(rows, rawKind, compiledPolicy) {
  if (rawKind === 'cpu-sample') {
    for (const runRows of groupRows(rows, (row) => row.runId)) {
      const sorted = [...runRows].sort((left, right) => left.ordinal - right.ordinal);
      assertContiguousSequence(sorted, 'ordinal', 'CPU sample transcript');
      const derivation = compiledPolicy.policy.processAdapterRegistry.cpuSampleRawAuthorityPolicy.samplePhaseDerivation;
      if (sorted.length < 2) fail('CPU sample transcript must contain a prime and terminal closure sample');
      let priorReadEnd = -Infinity;
      for (const [index, row] of sorted.entries()) {
        const expectedPhase = index === 0
          ? derivation.firstOrdinal
          : index === sorted.length - 1 ? derivation.terminalOrdinal : derivation.interiorOrdinals;
        if (row.samplePhase !== expectedPhase) {
          fail('CPU sample phase differs from its ordinal and immutable measurement boundaries');
        }
        if (row.readStart < priorReadEnd) fail('CPU sample read brackets overlap or regress');
        priorReadEnd = row.readEnd;
      }
    }
  }
  if (rawKind === 'controller-operation') validateControllerTranscript(rows);
  if (rawKind === 'process-observation') {
    for (const scopeRows of groupRows(rows, (row) => [row.captureKind, row.scopeKind, row.scopeId])) {
      assertContiguousSequence(scopeRows, 'observationOrdinal', 'process observation transcript');
    }
  }
  if (rawKind === 'environment-observation') {
    for (const sourceRows of groupRows(rows, (row) => [row.captureKind, row.scopeKind, row.scopeId, row.source])) {
      const start = Math.min(...sourceRows.map((row) => row.sourceSequence));
      assertContiguousSequence(sourceRows, 'sourceSequence', 'environment observation transcript', start);
    }
    for (const scopeRows of groupRows(rows, (row) => [row.captureKind, row.scopeKind, row.scopeId])) {
      const receipts = scopeRows.map((row) => row.runnerReceiptSequence).sort((left, right) => left - right);
      if (new Set(receipts).size !== receipts.length) fail('environment runner receipt sequences must be unique within a scope');
      const start = receipts[0] ?? 1;
      receipts.forEach((value, index) => {
        if (value !== start + index) fail(`environment runner receipt sequences must be contiguous from ${start} within a scope`);
      });
    }
  }
}

const rawAllowedColumnsCache = new WeakMap();
const rawAllowedFieldsCache = new WeakMap();

function validatePerformanceEvidenceRow(row, rawKind, definition, index, compiledPolicy) {
  const label = `${rawKind} rows[${index}]`;
  assertObject(row, label);
  let allowedColumns = rawAllowedColumnsCache.get(definition);
  if (!allowedColumns) {
    allowedColumns = new Set(definition.columns);
    rawAllowedColumnsCache.set(definition, allowedColumns);
  }
  for (const column of Object.keys(row)) {
    if (!allowedColumns.has(column)) fail(`${label} has an unrecognized column ${column}`);
  }
  for (const column of definition.requiredColumns) {
    if (!Object.prototype.hasOwnProperty.call(row, column)) fail(`${label} is missing required column ${column}`);
  }
  for (const column of definition.referenceColumns) {
    if (column === 'policyHash') assertSha(row[column], `${label}.${column}`);
    else if (column === 'scopeId' && Number.isSafeInteger(row[column]) && row[column] >= 1) continue;
    else if (definition.buildFieldRules?.[row.buildVariant]?.[column] === 'null' && row[column] === null) continue;
    else assertString(row[column], `${label}.${column}`);
  }
  for (const [column, literal] of Object.entries(definition.literalValues)) {
    if (row[column] !== literal) fail(`${label}.${column} must equal the raw-kind literal`);
  }
  const matchingShapes = definition.rowShapes.filter((shape) => rowShapeMatches(row, shape));
  if (matchingShapes.length !== 1) fail(`${label} must match exactly one raw row shape`);
  const shape = matchingShapes[0];
  let bindingFields;
  if (definition.bindingShapes) {
    const bindings = definition.bindingShapes.filter((binding) => binding.scopeKind === row.scopeKind);
    if (bindings.length !== 1) fail(`${label} must match exactly one scope binding shape`);
    bindingFields = bindings[0].fields;
  } else {
    bindingFields = definition.columns.filter((column) => definition.requiredColumns.includes(column) && !shape.fields.includes(column));
  }
  for (const field of bindingFields) {
    if (!Object.prototype.hasOwnProperty.call(row, field)) fail(`${label} is missing binding field ${field}`);
  }
  let shapeFields = rawAllowedFieldsCache.get(shape);
  if (!shapeFields) {
    shapeFields = new Map();
    rawAllowedFieldsCache.set(shape, shapeFields);
  }
  const bindingKey = bindingFields.join('\u0000');
  let allowedFields = shapeFields.get(bindingKey);
  if (!allowedFields) {
    allowedFields = new Set([...definition.requiredColumns, ...bindingFields, ...shape.fields]);
    shapeFields.set(bindingKey, allowedFields);
  }
  for (const field of Object.keys(row)) {
    if (!allowedFields.has(field)) fail(`${label}.${field} is forbidden by its matched row shape`);
  }
  const buildRules = definition.buildFieldRules?.[row.buildVariant];
  if (buildRules) {
    for (const [field, rule] of Object.entries(buildRules)) validateBuildFieldRule(row, field, rule, label);
  }
  validateRawEvidenceCarrier(row, rawKind, compiledPolicy, label);
  return row;
}

function encodePerformanceEvidenceWithRows(rawKind, rows, compiledPolicy) {
  assertString(rawKind, 'rawKind');
  assertArray(rows, 'rows');
  const definition = compiledPolicy.policy.performanceEvidenceChunkPolicy.rawKinds[rawKind];
  if (!definition) fail(`unknown raw evidence kind ${rawKind}`);
  const chunkPolicy = compiledPolicy.policy.performanceEvidenceChunkPolicy;
  const sortKeys = definition.sortKeys;
  const rowsByScope = new Map();
  let nonRunRows = 0;
  const normalizedRows = rows.map((row, index) => {
    const normalized = validatePerformanceEvidenceRow(row, rawKind, definition, index, compiledPolicy);
    const scopeKind = normalized.scopeKind ?? 'run';
    const scopeId = normalized.scopeId ?? normalized.runId;
    const scopeKey = `${scopeKind}\u0000${scopeId}`;
    const rowCount = (rowsByScope.get(scopeKey) ?? 0) + 1;
    const maximumRows = scopeKind === 'run'
      ? chunkPolicy.maximumRowsPerRunAndKind
      : chunkPolicy.maximumRowsPerScopeAndKind;
    if (rowCount > maximumRows) fail(`${rawKind} scope ${scopeKey} exceeds ${maximumRows} rows`);
    rowsByScope.set(scopeKey, rowCount);
    if (scopeKind !== 'run') nonRunRows += 1;
    if (nonRunRows > chunkPolicy.maximumRowsAcrossNonRunScopesAndKind) {
      fail(`${rawKind} exceeds the non-run scope row cap`);
    }
    if (normalized.captureKind === 'experiment-environment'
      && rowCount > chunkPolicy.maximumExperimentEnvironmentRows) {
      fail(`${rawKind} experiment-environment scope exceeds its row cap`);
    }
    return normalized;
  });
  validateRawTranscript(normalizedRows, rawKind, compiledPolicy);
  const keyedRows = normalizedRows.map((row) => ({ row, key: rowKey(row, sortKeys) }))
    .sort((left, right) => compareCodeUnitStrings(left.key, right.key));
  for (let index = 1; index < keyedRows.length; index += 1) {
    if (keyedRows[index - 1].key === keyedRows[index].key) fail(`${rawKind} has duplicate sort keys`);
  }
  const columns = [...definition.columns];
  const chunkRows = chunkPolicy.chunkRows;
  const chunks = [];
  const chunkDictionaries = [];
  for (let start = 0; start < keyedRows.length; start += chunkRows) {
    const rowsInChunk = keyedRows.slice(start, start + chunkRows).map(({ row, key }) => ({
      key,
      values: columns.map((column) => stableStringify(canonicalOptionalValue(row[column], {
        present: Object.prototype.hasOwnProperty.call(row, column)
      })))
    }));
    const dictionaryValueSet = new Set();
    for (const { values } of rowsInChunk) for (const value of values) dictionaryValueSet.add(value);
    const dictionaryValues = sortCodeUnitStrings(dictionaryValueSet);
    const dictionaryUtf8Bytes = dictionaryValues.reduce((total, value) => total + Buffer.byteLength(value, 'utf8'), 0);
    if (dictionaryValues.length > chunkPolicy.maximumDictionaryValuesPerChunk
      || dictionaryUtf8Bytes > chunkPolicy.maximumDictionaryUtf8BytesPerChunk) {
      fail(`${rawKind} optional-value dictionary exceeds the policy cap in chunk ${chunks.length}`);
    }
    const dictionary = dictionaryValues.map((value) => JSON.parse(value));
    const dictionaryIndex = new Map(dictionaryValues.map((value, index) => [value, index]));
    chunkDictionaries.push(dictionary);
    chunks.push({
      rowCount: rowsInChunk.length,
      firstKey: rowsInChunk[0].key,
      lastKey: rowsInChunk.at(-1).key,
      columns: Object.fromEntries(columns.map((column, columnIndex) => [column, rowsInChunk.map((row) => {
        const index = dictionaryIndex.get(row.values[columnIndex]);
        if (index === undefined) fail(`canonical ${rawKind} dictionary is missing a serialized optional value`);
        return index;
      })]))
    });
  }
  if (chunks.length === 0) chunkDictionaries.push([]);
  const result = { version: 1, rawKind, sortKeys: [...sortKeys], columns, chunkDictionaries, chunks };
  return {
    encoded: { ...result, checksum: canonicalSha256(result) },
    rows: keyedRows.map(({ row }) => row)
  };
}

export function encodePerformanceEvidence(rawKind, rows, compiledPolicy = loadBaselinePolicy()) {
  return encodePerformanceEvidenceWithRows(rawKind, rows, compiledPolicy).encoded;
}

export function decodePerformanceEvidence(encoded, compiledPolicy = loadBaselinePolicy()) {
  assertObject(encoded, 'encoded performance evidence');
  const { checksum, ...body } = encoded;
  assertSha(checksum, 'encoded performance evidence checksum');
  assertExactKeys(body, ['version', 'rawKind', 'sortKeys', 'columns', 'chunkDictionaries', 'chunks'], 'encoded performance evidence');
  if (body.version !== 1) fail('encoded performance evidence version is invalid');
  if (canonicalSha256(body) !== checksum) fail('encoded performance evidence checksum mismatch');
  const definition = compiledPolicy.policy.performanceEvidenceChunkPolicy.rawKinds[body.rawKind];
  if (!definition || stableStringify(body.sortKeys) !== stableStringify(definition.sortKeys)) fail('encoded raw kind is invalid');
  assertArray(body.columns, 'encoded columns');
  assertArray(body.chunkDictionaries, 'encoded chunk dictionaries');
  assertArray(body.chunks, 'encoded chunks');
  if (stableStringify(body.columns) !== stableStringify(definition.columns)) {
    fail('encoded columns must match the raw-kind policy definition');
  }
  body.columns.forEach((column, index) => assertString(column, `encoded columns[${index}]`));
  const expectedDictionaryCount = body.chunks.length === 0 ? 1 : body.chunks.length;
  if (body.chunkDictionaries.length !== expectedDictionaryCount) {
    fail('encoded evidence must contain exactly one dictionary per chunk or one canonical empty dictionary');
  }
  body.chunkDictionaries.forEach((dictionary, dictionaryIndex) => {
    assertArray(dictionary, `encoded chunk dictionary ${dictionaryIndex}`);
    const dictionaryKeys = dictionary.map((entry) => stableStringify(entry));
    if (new Set(dictionaryKeys).size !== dictionaryKeys.length
      || stableStringify(dictionaryKeys) !== stableStringify(sortCodeUnitStrings(dictionaryKeys))) {
      fail(`encoded chunk dictionary ${dictionaryIndex} must be unique and lexically sorted`);
    }
    dictionary.forEach((entry, entryIndex) => decodeCanonicalOptionalValue(
      entry, `encoded chunk dictionary ${dictionaryIndex}[${entryIndex}]`
    ));
  });
  if (body.chunks.length === 0 && body.chunkDictionaries[0].length !== 0) {
    fail('zero-row encoded evidence must use the canonical empty dictionary');
  }
  const rows = [];
  for (const [chunkIndex, chunk] of body.chunks.entries()) {
    assertExactKeys(chunk, ['rowCount', 'firstKey', 'lastKey', 'columns'], `encoded chunk ${chunkIndex}`);
    assertSafeInteger(chunk.rowCount, `encoded chunk ${chunkIndex}.rowCount`, 1);
    assertString(chunk.firstKey, `encoded chunk ${chunkIndex}.firstKey`);
    assertString(chunk.lastKey, `encoded chunk ${chunkIndex}.lastKey`);
    assertObject(chunk.columns, `encoded chunk ${chunkIndex}.columns`);
    if (stableStringify(sortCodeUnitStrings(Object.keys(chunk.columns))) !== stableStringify(body.columns)) fail(`encoded chunk ${chunkIndex} columns are incompatible with the body columns`);
    for (const column of body.columns) {
      const indexes = chunk.columns[column];
      if (!Array.isArray(indexes) || indexes.length !== chunk.rowCount) fail(`encoded chunk ${chunkIndex}.${column} is malformed`);
    }
    const dictionary = body.chunkDictionaries[chunkIndex];
    for (let rowIndex = 0; rowIndex < chunk.rowCount; rowIndex += 1) {
      const row = {};
      for (const column of body.columns) {
        const dictionaryIndex = chunk.columns[column][rowIndex];
        assertSafeInteger(dictionaryIndex, `encoded chunk ${chunkIndex}.${column}[${rowIndex}]`, 0);
        const dictionaryEntry = dictionary[dictionaryIndex];
        if (dictionaryEntry === undefined) fail(`encoded chunk ${chunkIndex} references an invalid dictionary row`);
        const optional = decodeCanonicalOptionalValue(dictionaryEntry, `encoded chunk dictionary ${chunkIndex}[${dictionaryIndex}]`);
        if (optional.present) row[column] = optional.value;
      }
      rows.push(row);
    }
  }
  const reencoded = encodePerformanceEvidence(body.rawKind, rows, compiledPolicy);
  if (stableStringify(reencoded) !== stableStringify(encoded)) fail('encoded performance evidence is noncanonical');
  return rows;
}

function validateProjectionBoundary(value, label) {
  assertObject(value, label);
  if (value.scopeKind === 'run') {
    assertExactKeys(value, ['scopeKind', 'join'], label);
    assertObject(value.join, `${label}.join`);
    return clone(value);
  }
  if (value.scopeKind === 'qualification') {
    assertExactKeys(value, ['scopeKind', 'experimentId', 'sourceSha', 'policyHash', 'ledgerSequence', 'observationBoundaryId'], label);
    assertString(value.experimentId, `${label}.experimentId`);
    assertString(value.sourceSha, `${label}.sourceSha`);
    assertSha(value.policyHash, `${label}.policyHash`);
    assertSafeInteger(value.ledgerSequence, `${label}.ledgerSequence`, 1);
    assertString(value.observationBoundaryId, `${label}.observationBoundaryId`);
    return clone(value);
  }
  fail(`${label}.scopeKind must be run or qualification`);
}

export function createRawRowProjectionBody({ experimentId, boundary, rawKind, rows }, compiledPolicy = loadBaselinePolicy()) {
  assertString(experimentId, 'raw row projection experimentId');
  const normalizedBoundary = validateProjectionBoundary(boundary, 'raw row projection boundary');
  assertString(rawKind, 'raw row projection rawKind');
  if (!compiledPolicy.rawKindOrder.includes(rawKind)) fail('raw row projection rawKind is not registered');
  const { rows: normalizedRows } = encodePerformanceEvidenceWithRows(rawKind, rows, compiledPolicy);
  return deepFreeze({ schemaVersion: 1, experimentId, boundary: normalizedBoundary, rawKind, rows: normalizedRows });
}

export function createEvaluatorRawInput(rawEvidenceBody, compiledPolicy = loadBaselinePolicy()) {
  assertExactKeys(rawEvidenceBody, ['schemaVersion', 'experimentId', 'rawKinds'], 'evaluator raw evidence body');
  if (rawEvidenceBody.schemaVersion !== 1) fail('evaluator raw evidence schemaVersion must be 1');
  assertString(rawEvidenceBody.experimentId, 'evaluator raw evidence experimentId');
  assertArray(rawEvidenceBody.rawKinds, 'evaluator raw evidence rawKinds');
  if (rawEvidenceBody.rawKinds.length !== compiledPolicy.rawKindOrder.length) {
    fail('evaluator raw evidence must contain every registered raw kind');
  }
  const rawKinds = rawEvidenceBody.rawKinds.map((entry, index) => {
    assertExactKeys(entry, ['rawKind', 'rowCount', 'encodedChecksum', 'rows'], `evaluator raw evidence rawKinds[${index}]`);
    const expectedRawKind = compiledPolicy.rawKindOrder[index];
    if (entry.rawKind !== expectedRawKind) fail('evaluator raw evidence rawKinds are not registry ordered');
    assertArray(entry.rows, `evaluator raw evidence ${entry.rawKind}.rows`);
    if (entry.rowCount !== entry.rows.length) fail(`evaluator raw evidence ${entry.rawKind}.rowCount does not match rows`);
    const { encoded, rows } = encodePerformanceEvidenceWithRows(entry.rawKind, entry.rows, compiledPolicy);
    if (entry.encodedChecksum !== encoded.checksum) fail(`evaluator raw evidence ${entry.rawKind}.encodedChecksum is invalid`);
    if (stableStringify(rows) !== stableStringify(entry.rows)) fail(`evaluator raw evidence ${entry.rawKind}.rows are not canonical`);
    return { rawKind: entry.rawKind, rowCount: entry.rowCount, encodedChecksum: entry.encodedChecksum, rows };
  });
  return deepFreeze({ schemaVersion: 1, experimentId: rawEvidenceBody.experimentId, rawKinds });
}

export function createPerformanceRawArchive({ experimentId, rowsByRawKind }, compiledPolicy = loadBaselinePolicy()) {
  assertString(experimentId, 'performance raw archive experimentId');
  assertObject(rowsByRawKind, 'performance raw archive rowsByRawKind');
  for (const rawKind of Object.keys(rowsByRawKind)) {
    if (!compiledPolicy.rawKindOrder.includes(rawKind)) fail(`performance raw archive contains unknown raw kind ${rawKind}`);
  }
  const rawKindManifests = [];
  const rawChunks = [];
  const dictionaries = [];
  const dictionaryByHash = new Map();
  const rawEvidenceKinds = [];
  for (const rawKind of compiledPolicy.rawKindOrder) {
    const { encoded, rows } = encodePerformanceEvidenceWithRows(rawKind, rowsByRawKind[rawKind] ?? [], compiledPolicy);
    const chunkDictionaryRecords = encoded.chunkDictionaries.map((values) => {
      const candidate = createStoredRecord('dictionary', { schemaVersion: 1, values });
      const dictionary = dictionaryByHash.get(candidate.hash) ?? candidate;
      if (!dictionaryByHash.has(candidate.hash)) {
        dictionaryByHash.set(candidate.hash, candidate);
        dictionaries.push(candidate);
      }
      return dictionary;
    });
    const chunkRecords = encoded.chunks.map((chunk, chunkIndex) => createStoredRecord('raw-chunk', {
      schemaVersion: 1,
      experimentId,
      rawKind,
      chunkIndex,
      rowCount: chunk.rowCount,
      firstKey: chunk.firstKey,
      lastKey: chunk.lastKey,
      columns: chunk.columns
    }));
    rawChunks.push(...chunkRecords);
    const manifest = createStoredRecord('raw-kind-manifest', {
      schemaVersion: 1,
      experimentId,
      rawKind,
      sortKeys: encoded.sortKeys,
      columns: encoded.columns,
      rowCount: rows.length,
      encodedChecksum: encoded.checksum,
      chunkOrder: chunkRecords.map((record) => record.hash),
      chunkMetadata: chunkRecords.map((record) => ({
        chunkIndex: record.body.chunkIndex,
        chunkHash: record.hash,
        dictionaryHash: chunkDictionaryRecords[record.body.chunkIndex].hash,
        firstKey: record.body.firstKey,
        lastKey: record.body.lastKey,
        rowCount: record.body.rowCount
      })),
      chunkReferences: sortedReferences(chunkRecords),
      dictionaryReferences: sortedReferences([...new Map(chunkDictionaryRecords.map((record) => [record.hash, record])).values()])
    });
    rawKindManifests.push(manifest);
    rawEvidenceKinds.push({ rawKind, rowCount: rows.length, encodedChecksum: encoded.checksum, rows });
  }
  // Every kind above has already completed the same canonical encode/decode
  // round trip enforced by createEvaluatorRawInput. Preserve that normalized
  // archive directly instead of repeating the full row validation pass.
  const rawEvidenceBody = { schemaVersion: 1, experimentId, rawKinds: rawEvidenceKinds };
  return deepFreeze({
    rawEvidenceBody,
    rawEvidenceChecksum: canonicalSha256(rawEvidenceBody),
    rawKindManifests,
    rawChunks,
    dictionaries
  });
}

export function reconstructPerformanceRawEvidence(objects, compiledPolicy = loadBaselinePolicy()) {
  assertExactKeys(objects, ['rawKindManifests', 'rawChunks', 'dictionaries'], 'performance raw archive objects');
  for (const key of ['rawKindManifests', 'rawChunks', 'dictionaries']) assertArray(objects[key], `performance raw archive objects.${key}`);
  const allReferencedRecords = [...objects.rawChunks, ...objects.dictionaries];
  const recordKeys = allReferencedRecords.map((record) => `${record.kind}:${record.hash}`);
  if (new Set(recordKeys).size !== recordKeys.length) fail('performance raw archive contains duplicate chunk or dictionary records');
  const records = new Map(allReferencedRecords.map((record, index) => {
    validateStoredRecord(record, `performance raw archive referenced record[${index}]`);
    if (!['raw-chunk', 'dictionary'].includes(record.kind)) {
      fail('performance raw archive contains a record of the wrong kind');
    }
    return [`${record.kind}:${record.hash}`, record];
  }));
  if (objects.rawKindManifests.length !== compiledPolicy.rawKindOrder.length) {
    fail('performance raw archive omits a registered raw kind');
  }
  const referencedRecordKeys = new Set();
  const rawKinds = objects.rawKindManifests.map((manifest, index) => {
    validateStoredRecord(manifest, `performance raw kind manifest[${index}]`);
    if (manifest.kind !== 'raw-kind-manifest') fail('performance raw archive contains a manifest of the wrong kind');
    const body = manifest.body;
    assertExactKeys(body, [
      'schemaVersion', 'experimentId', 'rawKind', 'sortKeys', 'columns', 'rowCount',
      'encodedChecksum', 'chunkOrder', 'chunkMetadata', 'chunkReferences',
      'dictionaryReferences'
    ], `performance raw kind manifest ${index} body`);
    if (body.schemaVersion !== 1) fail('performance raw manifest schemaVersion is invalid');
    assertString(body.experimentId, `performance raw kind manifest ${index}.experimentId`);
    if (index > 0 && body.experimentId !== objects.rawKindManifests[0].body.experimentId) {
      fail('performance raw manifests do not share one experimentId');
    }
    if (body.rawKind !== compiledPolicy.rawKindOrder[index]) fail('performance raw manifests are not registry ordered');
    assertSafeInteger(body.rowCount, `performance raw manifest ${body.rawKind}.rowCount`, 0);
    assertSha(body.encodedChecksum, `performance raw manifest ${body.rawKind}.encodedChecksum`);
    assertArray(body.chunkOrder, `performance raw manifest ${body.rawKind}.chunkOrder`);
    assertArray(body.chunkMetadata, `performance raw manifest ${body.rawKind}.chunkMetadata`);
    assertArray(body.chunkReferences, `performance raw manifest ${body.rawKind}.chunkReferences`);
    assertArray(body.dictionaryReferences, `performance raw manifest ${body.rawKind}.dictionaryReferences`);
    if (body.chunkOrder.length !== body.chunkReferences.length || body.chunkOrder.length !== body.chunkMetadata.length) {
      fail(`performance raw manifest ${body.rawKind} chunk projections disagree`);
    }
    const dictionaryRecords = new Map(body.dictionaryReferences.map((reference, dictionaryIndex) => {
      assertExactKeys(reference, ['kind', 'hash'], `performance raw manifest ${body.rawKind} dictionaryReferences[${dictionaryIndex}]`);
      assertSha(reference.hash, `performance raw manifest ${body.rawKind} dictionaryReferences[${dictionaryIndex}].hash`);
      if (reference.kind !== 'dictionary') fail('performance raw manifest references a non-dictionary record');
      const dictionary = records.get(`${reference.kind}:${reference.hash}`);
      if (!dictionary) fail('performance raw manifest has an unresolved dictionary');
      referencedRecordKeys.add(`${reference.kind}:${reference.hash}`);
      validateStoredRecord(dictionary, `performance raw dictionary ${body.rawKind}[${dictionaryIndex}]`);
      assertExactKeys(dictionary.body, ['schemaVersion', 'values'], `performance raw dictionary ${body.rawKind}[${dictionaryIndex}] body`);
      if (dictionary.body.schemaVersion !== 1) fail('performance raw dictionary schemaVersion is invalid');
      assertArray(dictionary.body.values, `performance raw dictionary ${body.rawKind}[${dictionaryIndex}].values`);
      return [reference.hash, dictionary];
    }));
    if (dictionaryRecords.size !== body.dictionaryReferences.length
      || stableStringify(body.dictionaryReferences) !== stableStringify([...body.dictionaryReferences].sort(compareReferences))) {
      fail('performance raw manifest dictionary references must be unique and canonically ordered');
    }
    if (body.chunkReferences.length === 0) {
      const dictionary = dictionaryRecords.values().next().value;
      if (dictionaryRecords.size !== 1 || dictionary.body.values.length !== 0) {
        fail('zero-row performance raw manifest must reference only the canonical empty dictionary');
      }
    } else if (dictionaryRecords.size === 0) {
      fail('nonempty performance raw manifest must reference its chunk dictionaries');
    }
    const usedDictionaryHashes = new Set();
    const chunkDictionaries = [];
    const chunkReferencesByHash = new Map(body.chunkReferences.map((reference, referenceIndex) => {
      assertExactKeys(reference, ['kind', 'hash'], `performance raw manifest ${body.rawKind} chunkReferences[${referenceIndex}]`);
      assertSha(reference.hash, `performance raw manifest ${body.rawKind} chunkReferences[${referenceIndex}].hash`);
      if (reference.kind !== 'raw-chunk') fail(`performance raw manifest ${body.rawKind} references a non-chunk record`);
      return [reference.hash, reference];
    }));
    if (chunkReferencesByHash.size !== body.chunkReferences.length
      || stableStringify(body.chunkReferences) !== stableStringify([...body.chunkReferences].sort(compareReferences))) {
      fail(`performance raw manifest ${body.rawKind} chunk references must be unique and canonically ordered`);
    }
    const chunks = body.chunkOrder.map((chunkHash, chunkIndex) => {
      const reference = chunkReferencesByHash.get(chunkHash);
      if (!reference) fail(`performance raw manifest ${body.rawKind} chunk order references an unlisted chunk`);
      assertExactKeys(reference, ['kind', 'hash'], `performance raw manifest ${body.rawKind} chunkReferences[${chunkIndex}]`);
      assertSha(reference.hash, `performance raw manifest ${body.rawKind} chunkReferences[${chunkIndex}].hash`);
      assertSha(body.chunkOrder[chunkIndex], `performance raw manifest ${body.rawKind} chunkOrder[${chunkIndex}]`);
      if (reference.kind !== 'raw-chunk') fail(`performance raw manifest ${body.rawKind} references a non-chunk record`);
      const record = records.get(`${reference.kind}:${reference.hash}`);
      if (!record) fail(`performance raw manifest ${body.rawKind} has an unresolved chunk`);
      referencedRecordKeys.add(`${reference.kind}:${reference.hash}`);
      validateStoredRecord(record, `performance raw chunk ${body.rawKind}[${chunkIndex}]`);
      assertExactKeys(record.body, [
        'schemaVersion', 'experimentId', 'rawKind', 'chunkIndex', 'rowCount',
        'firstKey', 'lastKey', 'columns'
      ], `performance raw chunk ${body.rawKind}[${chunkIndex}] body`);
      if (record.body.schemaVersion !== 1 || record.body.experimentId !== body.experimentId
        || record.body.rawKind !== body.rawKind || record.body.chunkIndex !== chunkIndex) {
        fail(`performance raw chunk ${body.rawKind}[${chunkIndex}] identity is invalid`);
      }
      const metadata = body.chunkMetadata[chunkIndex];
      assertExactKeys(metadata, ['chunkIndex', 'chunkHash', 'dictionaryHash', 'firstKey', 'lastKey', 'rowCount'], `performance raw manifest ${body.rawKind} chunkMetadata[${chunkIndex}]`);
      const dictionary = dictionaryRecords.get(metadata.dictionaryHash);
      if (!dictionary) fail(`performance raw manifest ${body.rawKind} chunk metadata references an unlisted dictionary`);
      usedDictionaryHashes.add(metadata.dictionaryHash);
      chunkDictionaries.push(dictionary.body.values);
      if (metadata.chunkHash !== record.hash
        || metadata.chunkIndex !== chunkIndex || body.chunkOrder[chunkIndex] !== record.hash
        || metadata.firstKey !== record.body.firstKey || metadata.lastKey !== record.body.lastKey
        || metadata.rowCount !== record.body.rowCount) {
        fail(`performance raw manifest ${body.rawKind} chunk metadata is invalid`);
      }
      return {
        rowCount: record.body.rowCount,
        firstKey: record.body.firstKey,
        lastKey: record.body.lastKey,
        columns: record.body.columns
      };
    });
    if (chunks.length > 0 && usedDictionaryHashes.size !== dictionaryRecords.size) {
      fail(`performance raw manifest ${body.rawKind} contains an unreferenced dictionary`);
    }
    const encodedBody = {
      version: 1,
      rawKind: body.rawKind,
      sortKeys: body.sortKeys,
      columns: body.columns,
      chunkDictionaries: chunks.length === 0 ? [[]] : chunkDictionaries,
      chunks
    };
    const encoded = { ...encodedBody, checksum: canonicalSha256(encodedBody) };
    if (encoded.checksum !== body.encodedChecksum) fail(`performance raw manifest ${body.rawKind} encoded checksum is invalid`);
    const rows = decodePerformanceEvidence(encoded, compiledPolicy);
    if (rows.length !== body.rowCount) fail(`performance raw manifest ${body.rawKind} rowCount is invalid`);
    return { rawKind: body.rawKind, rowCount: rows.length, encodedChecksum: encoded.checksum, rows };
  });
  if (referencedRecordKeys.size !== records.size) fail('performance raw archive contains unreferenced chunks or dictionaries');
  return createEvaluatorRawInput({ schemaVersion: 1, experimentId: objects.rawKindManifests[0]?.body.experimentId, rawKinds }, compiledPolicy);
}

function resolvedCaptureMembers(captureSet) {
  const captures = [
    captureSet.experimentEvidence.captures.environment,
    ...captureSet.experimentEvidence.captures.transport
  ];
  if (captureSet.qualificationEvidence) captures.push(captureSet.qualificationEvidence.capture);
  for (const backend of ['canvas2d', 'webgpu']) {
    const family = captureSet.backendFamilies[backend];
    if (!family) continue;
    for (const captureKind of ['externalMetric', 'metricSession', 'sentinel', 'workload']) {
      captures.push(...family.captures[captureKind]);
    }
  }
  return captures;
}

function validateCapturedRowBinding(row, rawKind, capture, context, index) {
  const captureKind = capture.scopeKind === 'experiment' ? 'experiment-environment' : capture.captureKind;
  const label = `${captureKind} ${rawKind} row[${index}]`;
  if (row.captureKind !== captureKind) fail(`${label} is not owned by its enclosing capture`);
  for (const [key, expected] of Object.entries({
    experimentId: context.experimentId,
    sourceSha: context.sourceSha,
    policyHash: context.policyHash
  })) {
    if (row[key] !== expected) fail(`${label}.${key} does not bind the capture manifest`);
  }
  if (capture.join) {
    for (const key of [
      'sourceSha', 'policyHash', 'experimentId', 'pairPlanChecksum', 'ledgerSequence',
      'experimentRole', 'runId', 'metricSessionId', 'comparisonKind', 'backend',
      'pairIndex', 'attemptIndex', 'comparisonSide', 'buildVariant',
      'externalExecutionId', 'observationBoundaryId'
    ]) {
      if (Object.prototype.hasOwnProperty.call(capture.join, key)
        && (!Object.prototype.hasOwnProperty.call(row, key) || row[key] !== capture.join[key])) {
        fail(`${label}.${key} does not bind its capture join`);
      }
    }
    if (Object.prototype.hasOwnProperty.call(capture.join, 'ordinal') && row.launchOrdinal !== capture.join.ordinal) {
      fail(`${label}.launchOrdinal does not bind its capture join`);
    }
    if (row.scopeKind === 'run' && row.scopeId !== capture.join.runId) fail(`${label} run scope does not bind its capture join`);
    if (row.scopeKind === 'metric-session' && row.scopeId !== capture.join.metricSessionId) fail(`${label} metric-session scope does not bind its capture join`);
  } else if (capture.scopeKind === 'experiment') {
    if (row.scopeKind !== 'experiment' || row.scopeId !== context.experimentId) fail(`${label} does not bind the experiment scope`);
  } else {
    if (Object.prototype.hasOwnProperty.call(row, 'observationBoundaryId')
      && row.observationBoundaryId !== capture.observationBoundaryId) {
      fail(`${label}.observationBoundaryId does not bind its enclosing capture`);
    }
  }
}

/**
 * Resolve the only raw-row authority accepted by the evaluator. Every row must
 * be directly owned by one manifest-resolved capture; projections are derived
 * here and cannot be supplied by a caller.
 */
export function collectPerformanceCaptureRows(captureSet, compiledPolicy = loadBaselinePolicy()) {
  assertExactKeys(captureSet, [
    'manifest', 'buildManifest', 'productionBundleEvidence', 'buildCommandLedger',
    'performanceLedger', 'experimentEvidence', 'backendFamilies',
    ...(captureSet.qualificationEvidence === undefined ? [] : ['qualificationEvidence'])
  ], 'resolved performance capture set');
  assertObject(captureSet.manifest, 'resolved performance capture set.manifest');
  const context = captureSet.manifest.evaluationContext;
  assertExactKeys(context, ['experimentId', 'experimentRole', 'sourceSha', 'policyHash'], 'resolved performance capture set evaluationContext');
  if (context.policyHash !== compiledPolicy.policyHash) fail('resolved performance capture set does not bind the compiled policy');
  const rowsByRawKind = Object.fromEntries(compiledPolicy.rawKindOrder.map((rawKind) => [rawKind, []]));
  const projections = [];
  const directOwnership = new Set();
  for (const capture of resolvedCaptureMembers(captureSet)) {
    assertObject(capture, 'resolved performance capture');
    const captureKind = capture.scopeKind === 'experiment' ? 'experiment-environment' : capture.captureKind;
    assertString(captureKind, 'resolved performance capture.captureKind');
    assertSha(capture.checksum, `resolved ${captureKind} capture.checksum`);
    const scopeKind = capture.join
      ? (captureKind === 'metric-session' ? 'metric-session' : 'run')
      : (capture.scopeKind ?? 'ledger-operation');
    const families = compiledPolicy.captureAttributionRegistry.families.filter((entry) => (
      entry.captureKind === captureKind && entry.scopeKind === scopeKind
    ));
    if (families.length !== 1) fail(`capture kind ${captureKind}/${scopeKind} must resolve one attribution family`);
    const family = families[0];
    const purpose = capture.join
      ? (captureKind === 'metric-session' ? 'metric-session' : 'measurement-side')
      : captureKind === 'experiment-environment'
        ? 'experiment-monitor'
        : captureKind === 'qualification'
          ? 'qualification-probe'
          : capture.operationId === 'generic-transport-spawn'
            ? 'generic-transport-probe'
            : capture.operationId === 'electron-harness-spawn'
              ? 'electron-transport-probe'
              : null;
    const buildVariant = capture.join?.buildVariant
      ?? (purpose === 'electron-transport-probe' || purpose === 'qualification-probe' ? 'harness-control' : null);
    const variants = family.variants.filter((entry) => entry.purpose === purpose && entry.buildVariant === buildVariant);
    if (variants.length !== 1) fail(`${captureKind} capture does not resolve exactly one attribution variant`);
    const variant = variants[0];
    assertArray(capture.rawKinds, `${captureKind} capture.rawKinds`);
    if (stableStringify(capture.rawKinds.map((group) => group.rawKind)) !== stableStringify(variant.rawKinds)) {
      fail(`${captureKind} capture raw kinds do not match its attribution variant`);
    }
    const seenCaptureKinds = new Set();
    for (const [groupIndex, group] of capture.rawKinds.entries()) {
      assertExactKeys(group, ['rawKind', 'rows'], `${captureKind} capture.rawKinds[${groupIndex}]`);
      if (!variant.rawKinds.includes(group.rawKind)) fail(`${captureKind} capture contains forbidden raw kind ${group.rawKind}`);
      if (seenCaptureKinds.has(group.rawKind)) fail(`${captureKind} capture duplicates raw kind ${group.rawKind}`);
      seenCaptureKinds.add(group.rawKind);
      const { encoded, rows } = encodePerformanceEvidenceWithRows(group.rawKind, group.rows, compiledPolicy);
      rows.forEach((row, rowIndex) => {
        validateCapturedRowBinding(row, group.rawKind, capture, context, rowIndex);
        const ownershipKey = `${group.rawKind}\u0000${canonicalSha256(rowKey(
          row,
          compiledPolicy.policy.performanceEvidenceChunkPolicy.rawKinds[group.rawKind].sortKeys
        ))}`;
        if (directOwnership.has(ownershipKey)) fail('one raw row is directly owned by more than one capture');
        directOwnership.add(ownershipKey);
        rowsByRawKind[group.rawKind].push(row);
      });
      projections.push({
        captureKind,
        captureChecksum: capture.checksum,
        scopeKind,
        scopeId: capture.join ? (capture.join.runId ?? capture.join.metricSessionId) : (capture.scopeId ?? capture.observationBoundaryId),
        rawKind: group.rawKind,
        rowCount: rows.length,
        encodedChecksum: encoded.checksum,
        projectionChecksum: canonicalSha256({
          captureKind,
          captureChecksum: capture.checksum,
          rawKind: group.rawKind,
          encodedChecksum: encoded.checksum
        })
      });
    }
  }
  const rawArchive = createPerformanceRawArchive({ experimentId: context.experimentId, rowsByRawKind }, compiledPolicy);
  const captureProjections = deepFreeze(projections.sort((left, right) => compareCodeUnitStrings(
    `${left.captureKind}:${left.captureChecksum}:${left.rawKind}`,
    `${right.captureKind}:${right.captureChecksum}:${right.rawKind}`
  )));
  return Object.freeze({ rawArchive, captureProjections });
}

function materializeGateAuthority(selector, runId, launch, captureSet, collected, compiledPolicy, rawRowIndex = null) {
  if (selector.authorityKind === 'run-raw') {
    const manifest = collected.rawArchive.rawKindManifests.find((record) => record.body.rawKind === selector.rawKind);
    const rawEntry = collected.rawArchive.rawEvidenceBody.rawKinds.find((entry) => entry.rawKind === selector.rawKind);
    if (!manifest || !rawEntry) fail(`gate authority ${selector.rawKind} has no archived raw kind`);
    return {
      authorityKind: 'run-raw',
      rawKind: selector.rawKind,
      runId,
      rowProjectionChecksum: canonicalSha256({
        rawKind: selector.rawKind,
        runId,
        rows: rawRowIndex ? indexedRowsForRun(rawRowIndex, selector.rawKind, runId) : rowsForRun(rawEntry.rows, runId)
      })
    };
  }
  if (selector.authorityKind === 'capture-projection') {
    const projection = collected.captureProjections.find((entry) => entry.captureKind === selector.captureKind
      && (entry.scopeKind !== 'run' || entry.scopeId === runId));
    if (!projection) fail(`gate authority has no ${selector.captureKind} capture projection`);
    return {
      authorityKind: 'capture-projection',
      captureKind: projection.captureKind,
      checksum: projection.projectionChecksum
    };
  }
  if (selector.authorityKind === 'qualification-capture') {
    const capture = captureSet.qualificationEvidence?.capture;
    if (!capture) fail('qualification gate has no qualification capture');
    return { authorityKind: 'qualification-capture', captureChecksum: capture.checksum };
  }
  if (selector.authorityKind === 'policy-section') {
    const sectionHash = compiledPolicy.sectionHashes[selector.sectionId];
    if (!sectionHash) fail(`gate authority references unknown policy section ${selector.sectionId}`);
    return { authorityKind: 'policy-section', sectionId: selector.sectionId, sectionHash };
  }
  if (selector.authorityKind === 'ledger-entry') {
    if (!launch) fail('gate authority requires a ledger entry');
    return { authorityKind: 'ledger-entry', sequence: launch.sequence, entryChecksum: canonicalSha256({ sequence: launch.sequence, entry: launch }) };
  }
  fail(`gate authority kind ${selector.authorityKind} is unsupported`);
}

function createCapturedGate(gateId, passed, reason, runId, launch, captureSet, collected, compiledPolicy, rawRowIndex = null) {
  const gate = compiledPolicy.gateRegistry.get(gateId);
  if (!gate) fail(`evaluator requested unregistered performance gate ${gateId}`);
  const authorities = gate.requiredAuthorities.map((selector) => materializeGateAuthority(
    selector, runId, launch, captureSet, collected, compiledPolicy, rawRowIndex
  )).sort((left, right) => compareCodeUnitStrings(stableStringify(left), stableStringify(right)));
  return {
    gateId,
    passed,
    reason: passed ? null : reason,
    authorities
  };
}

function capturedRunGates(run, captureSet, collected, compiledPolicy, rawRowIndex = null) {
  const gates = [];
  const add = (gateId, passed, reason) => gates.push(createCapturedGate(
    gateId, passed, reason, run.runId, run.ledgerEntry, captureSet, collected, compiledPolicy, rawRowIndex
  ));
  if (run.join.comparisonKind === 'instrumentation-overhead') {
    add('raw-join-closure', run.checks.rawJoinClosure, 'source-token-span-join-corruption');
  } else {
    add('sentinel-frame-ack-error-balance', run.checks.sentinelBalance && run.checks.acknowledgementConservation, 'sentinel-frame-ack-error-imbalance');
    add('sentinel-pre-window-pending', run.checks.preWindowPending, 'sentinel-pre-window-pending');
    add('sentinel-post-window-pending-closure', run.checks.postWindowPending && run.checks.closure, 'sentinel-post-window-pending-or-closure');
    add('sentinel-error-count', run.checks.errorCount, 'sentinel-error-count');
  }
  add('process-health', run.processGate.passed, run.processGate.reason);
  add('environment-stability', run.environmentGate.passed, run.environmentGate.reason);
  add('clean-shutdown', run.processGate.passed, 'unclean-shutdown');
  if (run.join.backend === 'webgpu') {
    add('webgpu-ack-conservation', run.checks.acknowledgementConservation !== false, 'webgpu-ack-conservation');
    const workerRows = rawRowIndex
      ? indexedRowsForRun(rawRowIndex, 'worker-message', run.runId)
      : rowsForRun(rawRowsByKind(collected.rawArchive.rawEvidenceBody).get('worker-message'), run.runId);
    add('webgpu-ack-sample-floor', workerRows.length >= compiledPolicy.policy.performanceLimits.window.minimumCallbacks, 'webgpu-ack-sample-floor');
  }
  return gates;
}

function rawRowsByKind(rawEvidenceBody) {
  return new Map(rawEvidenceBody.rawKinds.map((entry) => [entry.rawKind, entry.rows]));
}

function rowsForRun(rows, runId) {
  return rows.filter((row) => row.runId === runId || (row.scopeKind === 'run' && row.scopeId === runId));
}

function createRawRowIndex(rawEvidenceBody) {
  const rowsByKind = rawRowsByKind(rawEvidenceBody);
  const rowsByKindAndRun = new Map();
  const rowsByKindAndCapture = new Map();
  const rowsByKindAndCaptureScope = new Map();
  for (const [rawKind, rows] of rowsByKind) {
    const byRun = new Map();
    const byCapture = new Map();
    const byCaptureScope = new Map();
    for (const row of rows) {
      const runId = row.runId ?? (row.scopeKind === 'run' ? row.scopeId : null);
      if (runId !== null && runId !== undefined) {
        const selected = byRun.get(runId) ?? [];
        selected.push(row);
        byRun.set(runId, selected);
      }
      const captureRows = byCapture.get(row.captureKind) ?? [];
      captureRows.push(row);
      byCapture.set(row.captureKind, captureRows);
      const scopeKey = `${row.captureKind}\u0000${row.scopeKind}\u0000${row.scopeId}`;
      const scopedRows = byCaptureScope.get(scopeKey) ?? [];
      scopedRows.push(row);
      byCaptureScope.set(scopeKey, scopedRows);
    }
    rowsByKindAndRun.set(rawKind, byRun);
    rowsByKindAndCapture.set(rawKind, byCapture);
    rowsByKindAndCaptureScope.set(rawKind, byCaptureScope);
  }
  return { rowsByKind, rowsByKindAndRun, rowsByKindAndCapture, rowsByKindAndCaptureScope };
}

function indexedRowsForRun(index, rawKind, runId) {
  return index.rowsByKindAndRun.get(rawKind)?.get(runId) ?? [];
}

function indexedRowsForCapture(index, rawKind, captureKind) {
  return index.rowsByKindAndCapture.get(rawKind)?.get(captureKind) ?? [];
}

function indexedRowsForCaptureScope(index, rawKind, captureKind, scopeKind, scopeId) {
  return index.rowsByKindAndCaptureScope.get(rawKind)?.get(`${captureKind}\u0000${scopeKind}\u0000${scopeId}`) ?? [];
}

function successfulOutcome(value) {
  return [
    'success', 'completed', 'accepted', 'acknowledged', 'drawn', 'posted',
    'canvas-draw-completed', 'webgpu-queue-submit-completed'
  ].includes(value);
}

function durationMilliseconds(span) {
  const duration = span.endedAt - span.startedAt;
  if (!(duration > 0)) fail(`timing span ${span.timingSpanId} must have positive duration`);
  return span.unit === 'milliseconds' ? duration : duration * 1000;
}

function instrumentationTimingJoinKey(row, label) {
  for (const field of ['runId', 'measurementWindowId', 'timingSpanId']) {
    assertString(row[field], `${label}.${field}`);
  }
  if (row.measurementEpochId !== null) assertString(row.measurementEpochId, `${label}.measurementEpochId`);
  if (row.frameToken !== null && (!Number.isSafeInteger(row.frameToken) || row.frameToken < 1)) {
    fail(`${label}.frameToken must be null or a positive safe integer`);
  }
  assertSafeInteger(row.sourceSequence, `${label}.sourceSequence`, 1);
  return stableStringify([
    row.runId,
    row.measurementWindowId,
    row.measurementEpochId,
    row.sourceSequence,
    row.frameToken,
    row.timingSpanId
  ]);
}

function deriveCapturedCpuEvidence(rows, compiledPolicy) {
  const policy = compiledPolicy.policy.performanceMetricPolicy;
  const sorted = [...rows].sort((left, right) => left.ordinal - right.ordinal);
  const qualityReasons = new Set();
  if (sorted.length < policy.minimumRawSamples + 1) qualityReasons.add('sample-floor');
  const identities = new Set(sorted.map((row) => row.processIdentity));
  if (identities.size > 1) fail('captured CPU evidence changes process identity');
  for (const [index, row] of sorted.entries()) {
    if (row.ordinal !== index + 1) fail('captured CPU sample ordinals must be contiguous from one');
    const rawReadStart = row.rawAdapterSample.readStart;
    const rawReadEnd = row.rawAdapterSample.readEnd;
    if (index > 0) {
      const previous = sorted[index - 1];
      const cadenceMs = (((rawReadStart + rawReadEnd)
        - (previous.rawAdapterSample.readStart + previous.rawAdapterSample.readEnd)) / 2) * 1000;
      if (cadenceMs < policy.sampleCadenceMs.minimum || cadenceMs > policy.sampleCadenceMs.maximum) {
        qualityReasons.add('cadence-insufficient');
      }
      if (row.cumulativeCpuSeconds < previous.cumulativeCpuSeconds) fail('captured CPU counter regressed');
    }
  }
  if (qualityReasons.has('sample-floor') || qualityReasons.has('cadence-insufficient')) {
    return { sampleCount: sorted.length, qualityReasons: [...qualityReasons], p95Lower: null, p95Upper: null, workingSetP95MiB: null, windows: [] };
  }
  const samples = sorted.map((row) => ({
    ordinal: row.ordinal,
    readStart: row.rawAdapterSample.readStart,
    readEnd: row.rawAdapterSample.readEnd,
    cumulativeCpuSeconds: row.cumulativeCpuSeconds,
    counterQuantumSeconds: row.counterQuantumSeconds,
    processIdentity: row.processIdentity,
    workingSetMiB: row.workingSetMiB
  }));
  const phases = compiledPolicy.policy.processAdapterRegistry.cpuSampleRawAuthorityPolicy.samplePhaseDerivation;
  const prime = sorted.filter((row, index) => index === 0 && row.samplePhase === phases.firstOrdinal);
  const terminal = sorted.filter((row, index) => index === sorted.length - 1 && row.samplePhase === phases.terminalOrdinal);
  if (prime.length !== 1 || terminal.length !== 1
    || sorted.slice(1, -1).some((row) => row.samplePhase !== phases.interiorOrdinals)) {
    fail('captured CPU phase boundaries do not derive from the immutable sample ordinals');
  }
  const workloadWindow = {
    start: prime[0].rawAdapterSample.readStart,
    terminalClosureEnd: terminal[0].rawAdapterSample.readStart
  };
  const derived = validateCpuSamples(samples, 'captured CPU evidence', samples[0].processIdentity, workloadWindow, compiledPolicy);
  return {
    sampleCount: samples.length,
    qualityReasons: [],
    p95Lower: derived.p95Lower,
    p95Upper: derived.p95Upper,
    workingSetP95MiB: derived.workingSetP95MiB,
    windows: derived.windows
  };
}

function capturedProcessGate(rows, compiledPolicy) {
  if (rows.length === 0) return { passed: false, reason: 'missing-process-observation' };
  const registry = compiledPolicy.policy.processAdapterRegistry;
  const pidIdentities = new Map();
  const states = new Map();
  for (const row of [...rows].sort((left, right) => left.observedAt - right.observedAt || left.observationOrdinal - right.observationOrdinal)) {
    if (!registry.processClasses.includes(row.processClass)
      || !registry.ownershipClasses.includes(row.ownership)) {
      return { passed: false, reason: 'membership-failure' };
    }
    if (registry.ownershipClasses.includes(row.ownership)) {
      const identity = pidIdentities.get(row.pid);
      if (identity !== undefined && identity !== row.processIdentity) return { passed: false, reason: 'pid-identity-change' };
      pidIdentities.set(row.pid, row.processIdentity);
      const state = states.get(row.processIdentity) ?? { membership: false, closure: false };
      if (state.closure) return { passed: false, reason: 'unclean-shutdown' };
      if (row.observationKind !== 'closure' && row.alive !== true) return { passed: false, reason: 'membership-failure' };
      if (row.observationKind === 'membership') state.membership = true;
      if (row.observationKind === 'health' && !registry.healthStates.includes(row.healthState)) {
        return { passed: false, reason: 'process-health-failure' };
      }
      if (row.observationKind === 'closure') {
        if (!state.membership || row.alive !== false || !registry.closureStates.includes(row.closureState)) {
          return { passed: false, reason: 'unclean-shutdown' };
        }
        state.closure = true;
      }
      states.set(row.processIdentity, state);
    }
  }
  if (states.size === 0 || [...states.values()].some((state) => !state.membership || !state.closure)) {
    return { passed: false, reason: 'missing-process-closure' };
  }
  return { passed: true, reason: null };
}

function capturedEnvironmentGate(rows) {
  if (rows.length === 0) return { passed: false, reason: 'missing-environment-observation', hostNoise: true };
  const states = rows.filter((row) => row.dynamicState !== undefined).map((row) => stableStringify(row.dynamicState));
  const stable = states.length > 0 && new Set(states).size <= 1
    && rows.every((row) => row.observationKind !== 'event');
  return {
    passed: stable,
    reason: stable ? null : 'environment-drift',
    hostNoise: !stable
  };
}

function capturedExperimentEnvironmentRowsForLaunch(rows, launch) {
  const monitorRows = rows.filter((row) => row.captureKind === 'experiment-environment'
    && row.scopeKind === 'experiment' && row.scopeId === launch.experimentId
    && row.source === 'external-monitor' && row.clockDomain === 'runner'
    && row.observationKind !== 'cleanup')
    .sort((left, right) => left.observedAt - right.observedAt || left.sourceSequence - right.sourceSequence);
  const preceding = monitorRows.filter((row) => ['initial-snapshot', 'poll-snapshot'].includes(row.observationKind)
    && row.observedAt <= launch.start).at(-1);
  const during = monitorRows.filter((row) => row.observedAt > launch.start && row.observedAt <= launch.end);
  if (!preceding || during.length === 0) return [];
  return [preceding, ...during];
}

function validateCapturedExperimentEnvironmentClosure(rows, experimentId) {
  const experimentRows = rows.filter((row) => row.captureKind === 'experiment-environment'
    && row.scopeKind === 'experiment' && row.scopeId === experimentId
    && row.source === 'external-monitor' && row.clockDomain === 'runner');
  const cleanup = experimentRows.filter((row) => row.observationKind === 'cleanup');
  if (cleanup.length !== 1 || cleanup[0].cleanupState !== 'disposed') {
    fail('captured experiment environment must close with one disposed external monitor');
  }
}

function deriveSentinelCapturedMetrics({ sentinelRows, backendRows, workerRows }) {
  const callbacks = sentinelRows.filter((row) => row.observationKind === 'callback');
  const boundaries = sentinelRows.filter((row) => row.observationKind === 'boundary');
  const pending = sentinelRows.filter((row) => row.observationKind === 'pending');
  const closures = sentinelRows.filter((row) => row.observationKind === 'closure');
  const errors = sentinelRows.filter((row) => row.observationKind === 'error');
  if (callbacks.length === 0) fail('sentinel evidence has no callback cohort');
  const observedTimes = [...callbacks, ...boundaries].map((row) => row.observedAt);
  const elapsed = Math.max(...observedTimes) - Math.min(...observedTimes);
  if (!(elapsed > 0)) fail('sentinel observation window must have positive duration');
  const backend = sentinelRows[0]?.backend;
  const workerSuccesses = workerRows.filter((row) => row.messageKind === 'acknowledgement'
    && row.outcome === 'webgpu-queue-submit-completed');
  const successes = backend === 'canvas2d'
    ? backendRows.filter((row) => row.operationId === 'canvas-draw-completed')
    : workerSuccesses;
  const before = pending.filter((row) => row.observedAt <= Math.min(...callbacks.map((entry) => entry.observedAt)));
  const after = pending.filter((row) => row.observedAt >= Math.max(...callbacks.map((entry) => entry.observedAt)));
  return {
    metrics: {
      callbackCount: callbacks.length,
      backendOperationCount: backendRows.length,
      backendSuccessCount: successes.length,
      workerSuccessCount: workerSuccesses.length,
      callbackThroughput: (callbacks.length * 1000) / elapsed,
      backendOperationThroughput: (backendRows.length * 1000) / elapsed,
      successRatio: callbacks.length === 0 ? 0 : successes.length / callbacks.length
    },
    checks: {
      sentinelBalance: callbacks.length === backendRows.length,
      preWindowPending: before.length > 0 && before.at(-1).pendingCount === 0,
      postWindowPending: after.length > 0 && after[0].pendingCount === 0,
      closure: closures.length === 1,
      errorCount: errors.length === 0,
      acknowledgementConservation: backend === 'canvas2d'
        ? workerRows.length === 0
        : backendRows.length === workerSuccesses.length
    }
  };
}

function deriveInstrumentationCapturedMetrics({ sourceRows, backendRows, workerRows, timingRows }) {
  const opportunities = sourceRows.filter((row) => row.eventKind === 'source-opportunity');
  const advisories = sourceRows.filter((row) => row.eventKind === 'advisory-disposition');
  const advisoryBySource = new Map();
  for (const advisory of advisories) {
    if (advisoryBySource.has(advisory.sourceSequence)) fail('instrumentation evidence duplicates an advisory disposition');
    advisoryBySource.set(advisory.sourceSequence, advisory);
  }
  if (opportunities.some((row) => !advisoryBySource.has(row.sourceSequence))
    || advisories.some((row) => !opportunities.some((opportunity) => opportunity.sourceSequence === row.sourceSequence))) {
    fail('instrumentation opportunities and advisory dispositions must join one-to-one by source sequence');
  }
  const successfulOperations = backendRows.filter((row) => successfulOutcome(row.outcome));
  const successfulSpans = timingRows.filter((row) => successfulOutcome(row.outcome));
  const spansByJoin = new Map();
  for (const [index, span] of successfulSpans.entries()) {
    const key = instrumentationTimingJoinKey(span, `successful timing span ${index}`);
    if (spansByJoin.has(key)) fail('timing-span evidence duplicates the full successful-operation join tuple');
    spansByJoin.set(key, span);
  }
  const consumedSpanJoins = new Set();
  const joined = successfulOperations.map((operation, index) => {
    const key = instrumentationTimingJoinKey(operation, `successful backend operation ${index}`);
    const span = spansByJoin.get(key);
    if (!span || consumedSpanJoins.has(key)) {
      fail('successful backend operations must join exactly one successful timing span by run, window, epoch, source sequence, token, and span ID');
    }
    consumedSpanJoins.add(key);
    return { operation, span, latencyMilliseconds: durationMilliseconds(span) };
  });
  if (consumedSpanJoins.size !== successfulSpans.length) {
    fail('successful timing spans must join one successful backend operation');
  }
  const webgpuOperations = joined.filter(({ operation }) => operation.backend === 'webgpu');
  const acknowledgements = workerRows.filter((row) => row.messageKind === 'acknowledgement'
    && row.outcome === 'webgpu-queue-submit-completed');
  const acknowledgementKeys = new Set(acknowledgements.map((row) => stableStringify([
    row.runId, row.measurementWindowId, row.measurementEpochId, row.sourceSequence,
    row.diagnosticFrameId, row.frameToken
  ])));
  const operationKeys = new Set(webgpuOperations.map(({ operation }) => stableStringify([
    operation.runId, operation.measurementWindowId, operation.measurementEpochId,
    operation.sourceSequence, operation.diagnosticFrameId, operation.frameToken
  ])));
  if (acknowledgementKeys.size !== acknowledgements.length || operationKeys.size !== webgpuOperations.length
    || stableStringify([...acknowledgementKeys].sort(compareCodeUnitStrings))
      !== stableStringify([...operationKeys].sort(compareCodeUnitStrings))) {
    fail('successful WebGPU operations and terminal acknowledgements must join exactly by run, window, epoch, source, diagnostic frame, and token');
  }
  if (opportunities.length === 0 || joined.length === 0) fail('instrumentation evidence requires source and successful backend rows');
  const units = new Set(successfulSpans.map((row) => row.unit));
  if (units.size !== 1) fail('successful timing spans must share one duration unit');
  const windowStart = Math.min(...successfulSpans.map((row) => row.startedAt));
  const windowEnd = Math.max(...successfulSpans.map((row) => row.endedAt));
  const elapsedSeconds = successfulSpans[0].unit === 'milliseconds' ? (windowEnd - windowStart) / 1000 : windowEnd - windowStart;
  if (!(elapsedSeconds > 0)) fail('instrumentation timing window must have positive duration');
  const dropCount = opportunities.filter((row) => row.duplicateMediaTime === true
    || row.hasCurrentData === false
    || advisoryBySource.get(row.sourceSequence).advisoryOutcome === 'backpressure').length;
  return {
    metrics: {
      sourceCount: opportunities.length,
      successfulBackendCount: joined.length,
      sourceThroughput: opportunities.length / elapsedSeconds,
      backendSuccessThroughput: joined.length / elapsedSeconds,
      backendLatencyP95: nearestRank(joined.map((entry) => entry.latencyMilliseconds), 0.95),
      dropRate: dropCount / opportunities.length
    },
    checks: {
      rawJoinClosure: true,
      acknowledgementConservation: opportunities[0].backend === 'webgpu'
        ? acknowledgementKeys.size === operationKeys.size
        : workerRows.length === 0
    }
  };
}

function capturedRunMetricRows(launch, rows, compiledPolicy, rawRowIndex = null) {
  const runRows = (rawKind) => rawRowIndex
    ? indexedRowsForRun(rawRowIndex, rawKind, launch.runId)
    : rowsForRun(rows.get(rawKind), launch.runId);
  const cpu = deriveCapturedCpuEvidence(runRows('cpu-sample'), compiledPolicy);
  const runProcessRows = runRows('process-observation');
  const identities = new Set(runProcessRows.map((row) => row.processIdentity));
  const sessionCandidates = rawRowIndex
    ? indexedRowsForCaptureScope(rawRowIndex, 'process-observation', 'metric-session', 'metric-session', launch.metricSessionId)
    : rows.get('process-observation').filter((row) => row.captureKind === 'metric-session'
      && row.scopeKind === 'metric-session' && row.scopeId === launch.metricSessionId);
  const sessionProcessRows = sessionCandidates.filter((row) => identities.has(row.processIdentity));
  const processGate = capturedProcessGate([...runProcessRows, ...sessionProcessRows], compiledPolicy);
  const environmentGate = capturedEnvironmentGate(capturedExperimentEnvironmentRowsForLaunch(
    rows.get('environment-observation'),
    launch
  ));
  const common = { cpu, processGate, environmentGate };
  if (launch.comparisonKind === 'harness-overhead') {
    return {
      ...common,
      ...deriveSentinelCapturedMetrics({
        sentinelRows: runRows('sentinel-observation'),
        backendRows: runRows('backend-operation'),
        workerRows: runRows('worker-message')
      })
    };
  }
  return {
    ...common,
    ...deriveInstrumentationCapturedMetrics({
      sourceRows: runRows('source-opportunity'),
      backendRows: runRows('backend-operation'),
      workerRows: runRows('worker-message'),
      timingRows: runRows('timing-span')
    })
  };
}

function capturedMetricVector(run) {
  const cpuMetrics = [
    run.cpu.p95Lower === null
      ? { metricId: 'external-cpu-p95', unit: 'cpu-seconds-per-second', valueShape: 'bounded', availability: 'unavailable', reason: run.cpu.qualityReasons[0] }
      : { metricId: 'external-cpu-p95', unit: 'cpu-seconds-per-second', valueShape: 'bounded', availability: 'available', lower: run.cpu.p95Lower, upper: run.cpu.p95Upper },
    run.cpu.workingSetP95MiB === null
      ? { metricId: 'external-working-set-p95', unit: 'MiB', valueShape: 'scalar', availability: 'unavailable', reason: run.cpu.qualityReasons[0] }
      : { metricId: 'external-working-set-p95', unit: 'MiB', valueShape: 'scalar', availability: 'available', value: run.cpu.workingSetP95MiB }
  ];
  if (Object.prototype.hasOwnProperty.call(run.metrics, 'callbackThroughput')) {
    return [
      { metricId: 'callback-throughput', unit: 'callbacks-per-second', valueShape: 'scalar', availability: 'available', value: run.metrics.callbackThroughput },
      { metricId: 'backend-operation-throughput', unit: 'operations-per-second', valueShape: 'scalar', availability: 'available', value: run.metrics.backendOperationThroughput },
      { metricId: 'success-ratio', unit: 'ratio', valueShape: 'scalar', availability: 'available', value: run.metrics.successRatio },
      ...cpuMetrics
    ];
  }
  return [
    { metricId: 'source-throughput', unit: 'opportunities-per-second', valueShape: 'scalar', availability: 'available', value: run.metrics.sourceThroughput },
    { metricId: 'backend-success-throughput', unit: 'operations-per-second', valueShape: 'scalar', availability: 'available', value: run.metrics.backendSuccessThroughput },
    { metricId: 'backend-latency-p95', unit: 'milliseconds', valueShape: 'scalar', availability: 'available', value: run.metrics.backendLatencyP95 },
    { metricId: 'drop-rate', unit: 'ratio', valueShape: 'scalar', availability: 'available', value: run.metrics.dropRate },
    ...cpuMetrics
  ];
}

function canonicalRunJoin(launch) {
  const fields = [
    'sourceSha', 'policyHash', 'experimentId', 'pairPlanChecksum', 'ledgerSequence',
    'experimentRole', 'metricSessionId', 'comparisonKind', 'backend', 'pairIndex',
    'attemptIndex', 'comparisonSide', 'buildVariant', 'ordinal', 'runId',
    'externalExecutionId', 'observationBoundaryId',
    ...(launch.buildVariant === 'production'
      ? ['browserPid', 'browserCreationTime']
      : ['launchId', 'executionId'])
  ];
  return clone(validatePerformanceRunJoin(
    Object.fromEntries(fields.map((field) => [field, launch[field]])),
    { label: 'evaluator canonical run join' }
  ));
}

function deriveCapturedPairScores(session, baseline, compared, compiledPolicy) {
  const allowances = compiledPolicy.policy.performanceMetricPolicy.allowances;
  const scalar = (metricId, numerator, allowance) => {
    const score = deriveRatioScore(numerator, allowance, metricId);
    return { metricId, scoreLower: score, scoreUpper: score, verdict: score <= 1 ? 'pass' : 'definite-regression' };
  };
  let scores;
  if (session.comparisonKind === 'harness-overhead') {
    scores = [
      scalar('callback-throughput', baseline.metrics.callbackThroughput - compared.metrics.callbackThroughput, allowances.sentinelThroughputFraction * baseline.metrics.callbackThroughput),
      scalar('backend-operation-throughput', baseline.metrics.backendOperationThroughput - compared.metrics.backendOperationThroughput, allowances.sentinelThroughputFraction * baseline.metrics.backendOperationThroughput),
      scalar('success-ratio', baseline.metrics.successRatio - compared.metrics.successRatio, allowances.sentinelSuccessRatio),
      { metricId: 'external-cpu-p95', ...deriveCpuScore(baseline.cpu, compared.cpu, compiledPolicy.policy.performanceMetricPolicy.sentinelCpuAllowance) },
      scalar('external-working-set-p95', compared.cpu.workingSetP95MiB - baseline.cpu.workingSetP95MiB, Math.max(allowances.sentinelWorkingSetFraction * baseline.cpu.workingSetP95MiB, allowances.sentinelWorkingSetMinimumMiB))
    ];
  } else {
    scores = [
      scalar('source-throughput', baseline.metrics.sourceThroughput - compared.metrics.sourceThroughput, allowances.instrumentationThroughputFraction * baseline.metrics.sourceThroughput),
      scalar('backend-success-throughput', baseline.metrics.backendSuccessThroughput - compared.metrics.backendSuccessThroughput, allowances.instrumentationThroughputFraction * baseline.metrics.backendSuccessThroughput),
      scalar('backend-latency-p95', compared.metrics.backendLatencyP95 - baseline.metrics.backendLatencyP95, allowances.instrumentationLatencyFraction * baseline.metrics.backendLatencyP95),
      scalar('drop-rate', compared.metrics.dropRate - baseline.metrics.dropRate, baseline.metrics.dropRate <= allowances.instrumentationDropMinimum
        ? allowances.instrumentationDropMinimum
        : allowances.instrumentationThroughputFraction * baseline.metrics.dropRate),
      { metricId: 'external-cpu-p95', ...deriveCpuScore(baseline.cpu, compared.cpu, compiledPolicy.policy.performanceMetricPolicy.instrumentationCpuAllowance) },
      scalar('external-working-set-p95', compared.cpu.workingSetP95MiB - baseline.cpu.workingSetP95MiB, Math.max(allowances.instrumentationWorkingSetFraction * baseline.cpu.workingSetP95MiB, allowances.instrumentationWorkingSetMinimumMiB))
    ];
  }
  const expected = compiledPolicy.runMetricRegistry.filter((entry) => entry.comparisonKind === session.comparisonKind).map((entry) => entry.metricId);
  if (stableStringify(scores.map((score) => score.metricId)) !== stableStringify(expected)) {
    fail('captured pair scores do not match the policy metric registry');
  }
  return scores;
}

function qualityReasonsForCapturedPair(baseline, compared, scores) {
  const reasons = new Set([...baseline.cpu.qualityReasons, ...compared.cpu.qualityReasons]);
  if (baseline.environmentGate.hostNoise || compared.environmentGate.hostNoise) reasons.add('host-noise');
  if (scores.some((score) => score.metricId === 'external-cpu-p95' && score.verdict === 'cpu-boundary-overlap')) {
    reasons.add('cpu-boundary-overlap');
  }
  return [...reasons].sort(compareCodeUnitStrings);
}

function capturedRetryProofs(reasons, baseline, compared, scores, collected, compiledPolicy) {
  return reasons.map((reason) => {
    const authority = compiledPolicy.policy.performanceFailurePolicy.retryableAuthorityRegistry.find((entry) => entry.reason === reason);
    if (!authority) fail(`retry reason ${reason} has no policy-owned raw authority`);
    const manifest = collected.rawArchive.rawKindManifests.find((record) => record.body.rawKind === authority.rawKind);
    if (!manifest) fail(`retry reason ${reason} has no archived raw-kind manifest`);
    const runIds = [baseline.runId, compared.runId];
    const projectionChecksums = collected.captureProjections.filter((projection) => (
      projection.rawKind === authority.rawKind
      && projection.scopeKind === 'run'
      && runIds.includes(projection.scopeId)
    )).map((projection) => ({
      runId: projection.scopeId,
      captureChecksum: projection.captureChecksum,
      projectionChecksum: projection.projectionChecksum,
      encodedChecksum: projection.encodedChecksum
    })).sort((left, right) => compareCodeUnitStrings(left.runId, right.runId));
    if (new Set(projectionChecksums.map((entry) => entry.runId)).size !== runIds.length) {
      fail(`retry reason ${reason} does not resolve raw projections for both compared runs`);
    }
    const derivedEvidence = reason === 'sample-floor'
      ? {
          minimumSampleCount: compiledPolicy.policy.performanceMetricPolicy.minimumRawSamples + 1,
          baselineSamples: baseline.cpu.sampleCount,
          comparedSamples: compared.cpu.sampleCount
        }
      : reason === 'cadence-insufficient'
        ? { baselineReasons: baseline.cpu.qualityReasons, comparedReasons: compared.cpu.qualityReasons }
        : reason === 'host-noise'
          ? { baseline: baseline.environmentGate, compared: compared.environmentGate }
          : { score: scores.find((score) => score.metricId === 'external-cpu-p95') };
    const proven = reason === 'sample-floor'
      ? Math.min(derivedEvidence.baselineSamples, derivedEvidence.comparedSamples) < derivedEvidence.minimumSampleCount
      : reason === 'cadence-insufficient'
        ? [...derivedEvidence.baselineReasons, ...derivedEvidence.comparedReasons].includes(reason)
        : reason === 'host-noise'
          ? derivedEvidence.baseline.hostNoise || derivedEvidence.compared.hostNoise
          : derivedEvidence.score?.verdict === reason;
    if (!proven) fail(`retry reason ${reason} is not proven by its derived raw evidence`);
    return {
      reason,
      rawKind: authority.rawKind,
      derivation: authority.derivation,
      manifestHash: manifest.hash,
      encodedChecksum: manifest.body.encodedChecksum,
      runIds,
      projectionChecksums,
      derivedEvidence
    };
  });
}

function allocationRowsFromRaw(rawRows) {
  return rawRows.map((row) => {
    const projected = {};
    const semanticFields = row.byteKind === 'rgba-transfer-footprint'
      ? ['sourceWidth', 'sourceHeight']
      : row.byteKind === 'requested-byte-length'
        ? ['requestedByteLength']
        : row.byteKind === 'descriptor-size'
          ? ['descriptorSize']
          : row.byteKind === 'logical-texel-footprint'
            ? ['textureDescriptor']
            : [];
    for (const key of [
      'experimentId', 'backend', 'policyHash', 'runId', 'operationId',
      'sourceLocationId', 'carrier', 'requestOrdinal', 'outcome', 'byteKind',
      'measurementWindowId', 'measurementEpochId', 'sourceSequence', 'diagnosticFrameId', 'frameToken',
      'executionId', 'lifecyclePhase',
      'phaseSequence', 'byteValue', ...semanticFields
    ]) {
      if (Object.prototype.hasOwnProperty.call(row, key)) projected[key] = row[key];
    }
    return projected;
  });
}

function derivePairLoopBoundaryAuthority(captureSet, ledgerDetails, environmentRows) {
  const firstMetricIndex = ledgerDetails.ledger.findIndex((entry) => entry.operationId === 'metric-adapter-session-open');
  if (firstMetricIndex < 0) fail('pairLoopStart requires a metric-session transaction');
  const preLoopEntries = ledgerDetails.ledger.slice(0, firstMetricIndex);
  if (preLoopEntries.length === 0) fail('pairLoopStart requires the canonical pre-loop ledger prefix');
  const pairLoopStart = Math.max(...preLoopEntries.map((entry) => entry.end));
  assertFiniteNumber(pairLoopStart, 'derived pairLoopStart', 0);
  if (preLoopEntries.some((entry) => entry.end > pairLoopStart || (entry.start < pairLoopStart && entry.end > pairLoopStart))) {
    fail('canonical pre-loop ledger entry straddles pairLoopStart');
  }
  const firstMetricOpen = ledgerDetails.ledger[firstMetricIndex];
  if (firstMetricOpen.start < pairLoopStart) fail('first metric-session open starts before pairLoopStart');
  const experimentId = captureSet.manifest.evaluationContext.experimentId;
  const boundaryRows = environmentRows.filter((row) => row.captureKind === 'experiment-environment'
    && row.scopeKind === 'experiment' && row.scopeId === experimentId
    && row.source === 'external-monitor' && row.clockDomain === 'runner'
    && row.observationKind === 'poll-snapshot' && row.rawAdapterKind === 'external-host-snapshot-v1'
    && row.observedAt === pairLoopStart);
  if (boundaryRows.length !== 1) {
    fail('pairLoopStart must bind exactly one external-monitor poll snapshot on the runner clock');
  }
  const boundary = boundaryRows[0];
  return {
    pairLoopStart,
    initialEnvironment: {
      staticIdentity: clone(boundary.rawObservation.staticIdentity),
      dynamicState: clone(boundary.rawObservation.dynamicState)
    },
    boundary: {
      source: boundary.source,
      sourceSequence: boundary.sourceSequence,
      runnerReceiptSequence: boundary.runnerReceiptSequence,
      observedAt: boundary.observedAt,
      rawAdapterKind: boundary.rawAdapterKind
    }
  };
}

/** Evaluate only manifest-resolved raw rows and prove every declared retry. */
export function evaluateCapturedPerformanceEvidence(captureSet, collected, compiledPolicy = loadBaselinePolicy()) {
  assertExactKeys(collected, ['rawArchive', 'captureProjections'], 'collected performance capture rows');
  const context = captureSet.manifest.evaluationContext;
  const ledgerDetails = validatePerformanceLedgerDetails(captureSet.performanceLedger, compiledPolicy);
  if (!ledgerDetails.canonical) fail('captured performance publication requires the canonical operation-registry ledger grammar');
  if (ledgerDetails.hasAbortedSession || ledgerDetails.completedSessions.length === 0) {
    fail('captured performance evaluation requires only completed metric sessions');
  }
  const rows = rawRowsByKind(collected.rawArchive.rawEvidenceBody);
  const rawRowIndex = createRawRowIndex(collected.rawArchive.rawEvidenceBody);
  validateCapturedExperimentEnvironmentClosure(
    rows.get('environment-observation') ?? [],
    captureSet.manifest.evaluationContext.experimentId
  );
  const pairLoopBoundary = derivePairLoopBoundaryAuthority(captureSet, ledgerDetails, rows.get('environment-observation') ?? []);
  const captureBackends = Object.keys(captureSet.backendFamilies).sort(compareCodeUnitStrings);
  const ledgerBackends = Object.keys(ledgerDetails.backendBindings).sort(compareCodeUnitStrings);
  if (stableStringify(captureBackends) !== stableStringify(ledgerBackends)) {
    fail('captured performance backend families differ from the canonical ledger');
  }
  for (const backend of captureBackends) {
    if (ledgerDetails.backendBindings[backend].pairPlanChecksum !== captureSet.backendFamilies[backend].pairPlan.checksum) {
      fail(`captured ${backend} pair plan differs from the canonical ledger`);
    }
  }
  const launches = ledgerDetails.completedSessions.flatMap((session) => session.launches);
  const runEvidence = new Map();
  for (const launch of launches) {
    if (launch.experimentId !== context.experimentId || launch.policyHash !== context.policyHash) {
      fail('performance ledger launch does not bind the capture manifest');
    }
    const derived = capturedRunMetricRows(launch, rows, compiledPolicy, rawRowIndex);
    const run = {
      runId: launch.runId,
      join: canonicalRunJoin(launch),
      ledgerEntry: clone(launch),
      ...derived,
      derivedMetrics: capturedMetricVector(derived)
    };
    run.gates = capturedRunGates(run, captureSet, collected, compiledPolicy, rawRowIndex);
    runEvidence.set(launch.runId, run);
  }
  if (runEvidence.size !== launches.length) fail('captured performance ledger contains duplicate run IDs');
  const pairEvaluations = [];
  for (const session of ledgerDetails.completedSessions) {
    const [baselineVariant, comparedVariant] = COMPARISON_BUILD_VARIANTS[session.comparisonKind];
    const baseline = runEvidence.get(session.launches.find((launch) => launch.buildVariant === baselineVariant)?.runId);
    const compared = runEvidence.get(session.launches.find((launch) => launch.buildVariant === comparedVariant)?.runId);
    if (!baseline || !compared) fail('captured comparison does not contain both policy build variants');
    let scores = [];
    const cpuComplete = baseline.cpu.p95Lower !== null && compared.cpu.p95Lower !== null;
    if (cpuComplete) scores = deriveCapturedPairScores(session, baseline, compared, compiledPolicy);
    const qualityReasons = qualityReasonsForCapturedPair(baseline, compared, scores);
    const retryProofs = capturedRetryProofs(qualityReasons, baseline, compared, scores, collected, compiledPolicy);
    if (session.supersededByRetry) {
      if (qualityReasons.length !== 1 || qualityReasons[0] !== session.retryReason) {
        fail(`declared retry ${session.retryReason} is not exactly proven by preceding completed raw evidence`);
      }
    } else {
      if (qualityReasons.length > 0) fail(`accepted attempt has retryable quality failure ${qualityReasons.join(',')}`);
      if ([...baseline.gates, ...compared.gates].some((gate) => !gate.passed)) fail('accepted attempt failed a stored performance gate');
      if (scores.some((score) => score.verdict !== 'pass')) fail('accepted attempt contains a definite performance regression');
      if (session.comparisonKind === 'instrumentation-overhead') {
        const ranks = compiledPolicy.policy.performanceMetricPolicy.instrumentationMiddleRanksZeroBased;
        const ordered = scores.map((score) => score.scoreUpper).sort((left, right) => left - right);
        const aggregate = ranks.reduce((sum, rank) => sum + ordered[rank], 0) / ranks.length;
        if (aggregate > 1) fail('accepted instrumentation attempt fails the policy middle-rank aggregate');
      }
    }
    pairEvaluations.push({
      metricSessionId: session.metricSessionId,
      comparisonKind: session.comparisonKind,
      backend: session.backend,
      pairIndex: session.attempt?.pairIndex ?? 1,
      attemptIndex: session.attempt?.attemptIndex ?? 1,
      accepted: !session.supersededByRetry,
      retryReason: session.retryReason,
      qualityReasons,
      retryProofs,
      baselineRunId: baseline.runId,
      comparedRunId: compared.runId,
      scores
    });
  }
  const backendEvaluations = [];
  for (const backend of Object.keys(captureSet.backendFamilies)) {
    const backendRows = allocationRowsFromRaw([
      ...rowsForRun(rows.get('frame-request'), ''),
      ...rowsForRun(rows.get('lifecycle-request'), '')
    ]);
    const allAllocationRows = [
      ...rows.get('frame-request').filter((row) => row.backend === backend),
      ...rows.get('lifecycle-request').filter((row) => row.backend === backend)
    ];
    const allocationEvidence = backend === 'canvas2d'
      ? { state: compiledPolicy.policy.allocationEvidencePolicy.canvas2d.state, observedCoverage: [], missingCoverage: [] }
      : deriveAllocationEvidence({
          experimentId: context.experimentId,
          backend,
          policyHash: context.policyHash,
          ledger: captureSet.performanceLedger,
          rows: allocationRowsFromRaw(allAllocationRows),
          evidenceProvenance: captureSet.manifest.evidenceProvenance.kind === 'runtime-capture'
            ? captureSet.manifest.evidenceProvenance
            : {
                kind: compiledPolicy.policy.capacityFixturePolicy.provenanceKind,
                scenario: captureSet.manifest.evidenceProvenance.scenarioId,
                publicationEligible: false,
                runtimeMeasurement: false
              }
        }, compiledPolicy);
    void backendRows;
    const familyPairs = pairEvaluations.filter((pair) => pair.backend === backend);
    backendEvaluations.push({
      backend,
      comparisonFingerprint: canonicalSha256({
        sourceSha: context.sourceSha,
        policyHash: context.policyHash,
        backend,
        pairPlanChecksum: captureSet.backendFamilies[backend].pairPlan.checksum
      }),
      allocationEvidence,
      pairEvaluations: familyPairs
    });
  }
  return deepFreeze({
    ledger: ledgerDetails.ledger,
    pairLoopStart: pairLoopBoundary.pairLoopStart,
    initialEnvironment: pairLoopBoundary.initialEnvironment,
    initialEnvironmentBoundary: pairLoopBoundary.boundary,
    retryTopology: ledgerDetails.retryTopology,
    runs: [...runEvidence.values()],
    pairs: pairEvaluations,
    backendEvaluations,
    rawEvidenceChecksum: collected.rawArchive.rawEvidenceChecksum
  });
}

function validateQualificationBinding(qualificationInput, experimentRole, backend, failureTuple, compiledPolicy) {
  if (experimentRole === 'ci-integrity') {
    if (qualificationInput !== undefined) fail('ci-integrity experiments must not carry selected-host qualification');
    return { fingerprint: null, failureDisposition: failureTuple === undefined ? null : classifyFailure(failureTuple, compiledPolicy) };
  }
  if (qualificationInput === undefined) fail('reference-comparison experiments require qualification evidence');
  const qualificationFingerprint = computeQualificationFingerprint(qualificationInput, compiledPolicy);
  if (qualificationInput.requestedBackend !== 'webgpu') fail('reference qualification must request WebGPU');
  if (backend === 'webgpu') {
    if (qualificationInput.qualificationState !== 'qualified-webgpu' || qualificationInput.selectedBackend !== 'webgpu' || qualificationInput.observedBackend !== 'webgpu') {
      fail('reference WebGPU experiment must bind to a qualified requested/selected/observed WebGPU tuple');
    }
    if (failureTuple !== undefined) fail('qualified reference WebGPU cannot carry a failure tuple');
    return { fingerprint: qualificationFingerprint, failureDisposition: null };
  }
  if (qualificationInput.qualificationState === 'hardware-capability-unavailable') {
    if (qualificationInput.selectedBackend !== 'canvas2d' || qualificationInput.observedBackend !== 'canvas2d') {
      fail('hardware-unavailable reference Canvas must bind selected and observed Canvas fallback');
    }
    if (failureTuple === undefined || classifyFailure(failureTuple, compiledPolicy) !== 'qualification-unavailable' || failureTuple.reason !== qualificationInput.unavailabilityBranch) {
      fail('hardware-unavailable reference Canvas requires the matching qualification failure tuple');
    }
    return { fingerprint: qualificationFingerprint, failureDisposition: 'qualification-unavailable' };
  }
  if (qualificationInput.selectedBackend !== 'webgpu' || qualificationInput.observedBackend !== 'webgpu') {
    fail('qualified reference Canvas must retain the qualified WebGPU selection tuple');
  }
  if (failureTuple !== undefined) fail('qualified reference Canvas cannot carry a failure tuple');
  return { fingerprint: qualificationFingerprint, failureDisposition: null };
}

function evaluateSingleBackendPerformanceExperiment(input, compiledPolicy) {
  assertObject(input, 'performance experiment');
  const allowedKeys = ['experimentId', 'experimentRole', 'backend', 'ledger', 'comparisonInputs', 'qualificationInput', 'failureTuple', 'allocationEvidence', 'rawEvidence', 'evidenceProvenance', 'acceptanceContext'];
  for (const key of Object.keys(input)) if (!allowedKeys.includes(key)) fail(`performance experiment has an unknown field ${key}`);
  assertString(input.experimentId, 'performance experiment experimentId');
  assertString(input.experimentRole, 'performance experiment role');
  if (!compiledPolicy.policy.reportPolicy.experimentRoles.includes(input.experimentRole)) fail('performance experiment role is invalid');
  assertString(input.backend, 'performance experiment backend');
  if (!compiledPolicy.policy.reportPolicy.backends.includes(input.backend)) fail('performance experiment backend is invalid');
  if (input.acceptanceContext !== undefined && typeof input.acceptanceContext !== 'boolean') fail('performance experiment acceptanceContext must be boolean');
  const evidenceProvenance = validateEvidenceProvenance(input.evidenceProvenance, 'performance experiment.evidenceProvenance', compiledPolicy);
  if (input.acceptanceContext === true && evidenceProvenance.kind !== 'runtime-capture') {
    fail('synthetic capacity evidence cannot enter an acceptance evaluation');
  }
  if (!Array.isArray(input.ledger) || input.ledger.length === 0) fail('performance experiment requires a nonempty ledger');
  const ledgerDetails = validatePerformanceLedgerDetails(input.ledger, compiledPolicy);
  const ledger = ledgerDetails.ledger;
  if (!ledgerBindsExperimentBackend(ledgerDetails, input.experimentId, input.backend, compiledPolicy.policyHash)) {
    fail('performance experiment ledger does not bind its experiment, backend, and policy identity');
  }
  if (input.rawEvidence === undefined) fail('performance experiment requires raw CPU, timing, environment, process, callback-cohort, and metric-score evidence');
  const rawEvidence = validateRawPerformanceEvidence(input.rawEvidence, ledgerDetails, compiledPolicy, evidenceProvenance);
  if (!Array.isArray(input.comparisonInputs) || input.comparisonInputs.length === 0) fail('performance experiment requires comparison inputs');
  const comparisonFingerprints = input.comparisonInputs.map((entry, index) => {
    assertObject(entry, `comparison input ${index}`);
    if (entry.backend !== input.backend) fail('comparison input backend must match the evaluated backend');
    return computeComparisonFingerprint(entry, compiledPolicy);
  });
  const qualification = validateQualificationBinding(input.qualificationInput, input.experimentRole, input.backend, input.failureTuple, compiledPolicy);
  if (input.allocationEvidence === undefined) fail('performance experiment requires allocation evidence for its backend');
  assertObject(input.allocationEvidence, 'performance experiment allocation evidence');
  if (stableStringify(input.allocationEvidence.evidenceProvenance) !== stableStringify(evidenceProvenance)) {
    fail('allocation evidence provenance must match the experiment provenance');
  }
  if (input.allocationEvidence.experimentId !== undefined && input.allocationEvidence.experimentId !== input.experimentId) {
    fail('allocation evidence experiment ID must match the performance experiment');
  }
  if (input.allocationEvidence.backend !== undefined && input.allocationEvidence.backend !== input.backend) {
    fail('allocation evidence backend must match the performance experiment');
  }
  if (input.allocationEvidence.policyHash !== undefined && input.allocationEvidence.policyHash !== compiledPolicy.policyHash) {
    fail('allocation evidence policy hash must match the compiled policy');
  }
  const allocationEvidence = deriveAllocationEvidence({
    ...input.allocationEvidence,
    experimentId: input.experimentId,
    backend: input.backend,
    policyHash: compiledPolicy.policyHash,
    ledger: input.ledger
  }, compiledPolicy);
  if (input.backend === 'canvas2d' && allocationEvidence.state !== 'not-applicable-no-covered-allocation-request') {
    fail('Canvas experiment must carry the explicit not-applicable allocation state');
  }
  if (input.backend === 'webgpu' && input.experimentRole !== 'reference-comparison') fail('WebGPU allocation evidence is only valid for selected-reference experiments');
  if (input.backend === 'webgpu' && allocationEvidence.state === 'measured-request-proxy' && evidenceProvenance.kind !== 'runtime-capture' && input.acceptanceContext === true) {
    fail('synthetic allocation values cannot be accepted as a production measured-request-proxy');
  }
  const publicationEligible = false;
  return {
    ledger,
    retryTopology: ledgerDetails.retryTopology,
    comparisonFingerprints,
    qualificationFingerprint: qualification.fingerprint,
    failureDisposition: qualification.failureDisposition,
    allocationEvidence,
    rawEvidence,
    rawEvidenceChecksum: canonicalSha256(input.rawEvidence),
    evidenceProvenance,
    publicationEligible,
    checksum: canonicalSha256({ ledger, retryTopology: ledgerDetails.retryTopology, comparisonFingerprints, qualificationFingerprint: qualification.fingerprint, failureDisposition: qualification.failureDisposition, allocationEvidence, rawEvidence, rawEvidenceChecksum: canonicalSha256(input.rawEvidence), evidenceProvenance, publicationEligible })
  };
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function validateEvaluationContext(value, compiledPolicy) {
  assertExactKeys(value, ['experimentId', 'experimentRole', 'sourceSha', 'policyHash'], 'performance evaluation context');
  assertString(value.experimentId, 'performance evaluation context.experimentId');
  if (!compiledPolicy.policy.reportPolicy.experimentRoles.includes(value.experimentRole)) {
    fail('performance evaluation context.experimentRole is invalid');
  }
  assertString(value.sourceSha, 'performance evaluation context.sourceSha');
  if (value.policyHash !== compiledPolicy.policyHash) fail('performance evaluation context.policyHash does not bind the compiled policy');
  return clone(value);
}

function validateSemanticAuthority(value) {
  assertExactKeys(value, ['generatedAt', 'repository', 'environment', 'inputs', 'reset', 'seed'], 'performance semantic authority');
  assertString(value.generatedAt, 'performance semantic authority.generatedAt');
  if (Number.isNaN(Date.parse(value.generatedAt))) fail('performance semantic authority.generatedAt must be an ISO-compatible timestamp');
  assertExactKeys(value.repository, ['commitSha', 'dirty', 'branch'], 'performance semantic authority.repository');
  assertString(value.repository.commitSha, 'performance semantic authority.repository.commitSha');
  assertBoolean(value.repository.dirty, 'performance semantic authority.repository.dirty');
  assertString(value.repository.branch, 'performance semantic authority.repository.branch', { nullable: true });
  assertExactKeys(value.environment, ['os', 'arch', 'nodeVersion', 'targetId'], 'performance semantic authority.environment');
  assertString(value.environment.os, 'performance semantic authority.environment.os');
  assertString(value.environment.arch, 'performance semantic authority.environment.arch');
  assertString(value.environment.nodeVersion, 'performance semantic authority.environment.nodeVersion');
  assertString(value.environment.targetId, 'performance semantic authority.environment.targetId', { nullable: true });
  assertObject(value.inputs, 'performance semantic authority.inputs');
  if (Object.keys(value.inputs).length === 0) fail('performance semantic authority.inputs must not be empty');
  assertObject(value.reset, 'performance semantic authority.reset');
  assertObject(value.seed, 'performance semantic authority.seed');
  return clone(value);
}

function validateFinalizationProvenance(value, finalizationPurpose, compiledPolicy) {
  if (finalizationPurpose === 'publication') {
    const provenance = validateEvidenceProvenance(value, 'performance finalization evidenceProvenance', compiledPolicy);
    if (provenance.kind !== 'runtime-capture') fail('publication finalization requires runtime-capture provenance');
    return provenance;
  }
  if (finalizationPurpose !== 'capacity-fixture') fail('performance finalizationPurpose must be publication or capacity-fixture');
  assertExactKeys(value, ['kind', 'fixtureId', 'scenarioId', 'seedHash', 'runtimeProjection'], 'performance capacity provenance');
  if (value.kind !== 'capacity-fixture') fail('capacity finalization requires capacity-fixture provenance');
  for (const field of ['fixtureId', 'scenarioId', 'seedHash']) assertString(value[field], `performance capacity provenance.${field}`);
  return {
    kind: 'capacity-fixture',
    fixtureId: value.fixtureId,
    scenarioId: value.scenarioId,
    seedHash: value.seedHash,
    runtimeProjection: validateCaptureProvenance(value.runtimeProjection)
  };
}

function validateBuildCommandLedgerBinding(buildCommandLedger, ledger, sourceSha) {
  assertExactKeys(buildCommandLedger, ['schemaVersion', 'sourceSha', 'entries'], 'performance build command ledger');
  if (buildCommandLedger.schemaVersion !== 1 || buildCommandLedger.sourceSha !== sourceSha) {
    fail('performance build command ledger identity is invalid');
  }
  assertArray(buildCommandLedger.entries, 'performance build command ledger.entries');
  const projected = ledger.filter((entry) => entry.operationId === 'build-spawn').map((entry, index) => ({
    sequence: index + 1,
    operationId: entry.operationId,
    start: entry.start,
    end: entry.end,
    buildId: entry.buildId,
    closure: clone(entry.closure)
  }));
  if (stableStringify(buildCommandLedger.entries) !== stableStringify(projected)) {
    fail('performance build command ledger is not byte-equal to the rebased global build subsequence');
  }
  return clone(buildCommandLedger);
}

/**
 * Seal the complete evaluator input. Raw normalization is intentionally a
 * separate step so no orchestrator can splice comparison or provenance state
 * into the normalized raw component after construction.
 */
function sealPerformanceEvaluatorInput(input, compiledPolicy, canonicalRawInput) {
  assertExactKeys(input, [
    'evaluationContext', 'semanticAuthority', 'finalizationPurpose', 'evidenceProvenance',
    'buildManifest', 'productionBundleEvidence', 'ledger', 'pairPlans',
    'qualificationBody', 'rawInput'
  ], 'performance evaluator input');
  const evaluationContext = validateEvaluationContext(input.evaluationContext, compiledPolicy);
  const semanticAuthority = validateSemanticAuthority(input.semanticAuthority);
  if (semanticAuthority.repository.commitSha !== evaluationContext.sourceSha) {
    fail('performance semantic authority repository does not match evaluation sourceSha');
  }
  const evidenceProvenance = validateFinalizationProvenance(input.evidenceProvenance, input.finalizationPurpose, compiledPolicy);
  const captureProjection = evidenceProvenance.kind === 'runtime-capture'
    ? evidenceProvenance.captureProvenance
    : evidenceProvenance.runtimeProjection;
  if (captureProjection.sourceSha !== evaluationContext.sourceSha) {
    fail('performance provenance does not match evaluation sourceSha');
  }
  const buildManifest = validateBuildManifestEvidence(
    input.buildManifest,
    evaluationContext.sourceSha,
    compiledPolicy
  );
  const productionBundleEvidence = validateProductionBundleEvidence(
    input.productionBundleEvidence,
    buildManifest,
    evaluationContext.sourceSha,
    compiledPolicy
  );
  deriveBundleGate(buildManifest, productionBundleEvidence, compiledPolicy);
  assertArray(input.ledger, 'performance evaluator input.ledger');
  assertArray(input.pairPlans, 'performance evaluator input.pairPlans');
  if (input.pairPlans.length === 0) fail('performance evaluator input.pairPlans must not be empty');
  const pairPlans = input.pairPlans.map((pairPlan, index) => {
    const normalized = validatePerformancePairPlan(pairPlan);
    if (normalized.experimentId !== evaluationContext.experimentId) {
      fail(`performance evaluator pairPlans[${index}] does not bind evaluationContext.experimentId`);
    }
    return normalized;
  });
  const expectedBackends = compiledPolicy.policy.reportPolicy.backends.filter((backend) => (
    pairPlans.some((pairPlan) => pairPlan.backend === backend)
  ));
  if (stableStringify(pairPlans.map((pairPlan) => pairPlan.backend)) !== stableStringify(expectedBackends)
    || new Set(expectedBackends).size !== pairPlans.length) {
    fail('performance evaluator pairPlans must be unique and backend ordered');
  }
  const qualificationBody = input.qualificationBody === null
    ? null
    : validateQualificationCaptureBody(input.qualificationBody, compiledPolicy);
  const rawInput = canonicalRawInput ? input.rawInput : createEvaluatorRawInput(input.rawInput, compiledPolicy);
  if (rawInput.experimentId !== evaluationContext.experimentId) {
    fail('performance evaluator rawInput does not bind evaluationContext.experimentId');
  }
  for (const rawKind of rawInput.rawKinds) {
    for (const row of rawKind.rows) {
      if (row.experimentId !== evaluationContext.experimentId
        || row.sourceSha !== evaluationContext.sourceSha
        || row.policyHash !== evaluationContext.policyHash) {
        fail(`performance evaluator ${rawKind.rawKind} row does not bind the sealed evaluation context`);
      }
    }
  }
  return deepFreeze({
    evaluationContext,
    semanticAuthority,
    finalizationPurpose: input.finalizationPurpose,
    evidenceProvenance,
    buildManifest,
    productionBundleEvidence,
    ledger: clone(input.ledger),
    pairPlans,
    qualificationBody,
    rawInput
  });
}

export function createPerformanceEvaluatorInput(input, compiledPolicy = loadBaselinePolicy()) {
  return sealPerformanceEvaluatorInput(input, compiledPolicy, false);
}

export function projectComparisonFingerprints(backendEvaluations) {
  assertArray(backendEvaluations, 'backend evaluations');
  return backendEvaluations.map((entry, index) => {
    assertExactKeys(entry, ['backend', 'comparisonFingerprint', 'allocationEvidence'], `backend evaluations[${index}]`);
    assertString(entry.backend, `backend evaluations[${index}].backend`);
    assertSha(entry.comparisonFingerprint, `backend evaluations[${index}].comparisonFingerprint`);
    return { backend: entry.backend, comparisonFingerprint: entry.comparisonFingerprint };
  });
}

export function projectAllocationStates(backendEvaluations) {
  assertArray(backendEvaluations, 'backend evaluations');
  return backendEvaluations.map((entry, index) => {
    assertObject(entry.allocationEvidence, `backend evaluations[${index}].allocationEvidence`);
    assertString(entry.allocationEvidence.state, `backend evaluations[${index}].allocationEvidence.state`);
    return { backend: entry.backend, state: entry.allocationEvidence.state };
  });
}

export function projectQualificationState(qualificationChild) {
  if (qualificationChild === null) return null;
  assertObject(qualificationChild, 'qualification child');
  const metrics = qualificationChild.body?.metrics;
  assertObject(metrics, 'qualification child metrics');
  return clone({
    qualificationFingerprint: metrics.qualificationFingerprint,
    backend: metrics.backend,
    state: metrics.state,
    unavailabilityBranch: metrics.derivedEvidence.unavailabilityBranch,
    validity: metrics.validity
  });
}

export function createPerformanceEvaluationBody(input) {
  assertExactKeys(input, [
    'experimentId', 'experimentRole', 'finalizationPurpose', 'ledger', 'retryTopology',
    'backendEvaluations', 'qualificationFingerprint', 'failureDisposition',
    'rawEvidenceChecksum', 'evidenceProvenance', 'topology', 'publicationEligible'
  ], 'performance evaluation body input');
  assertString(input.experimentId, 'performance evaluation body experimentId');
  assertString(input.experimentRole, 'performance evaluation body experimentRole');
  assertArray(input.ledger, 'performance evaluation body ledger');
  assertArray(input.backendEvaluations, 'performance evaluation body backendEvaluations');
  projectComparisonFingerprints(input.backendEvaluations);
  projectAllocationStates(input.backendEvaluations);
  assertSha(input.rawEvidenceChecksum, 'performance evaluation body rawEvidenceChecksum');
  assertObject(input.topology, 'performance evaluation body topology');
  assertBoolean(input.publicationEligible, 'performance evaluation body publicationEligible');
  const expectedPublicationEligibility = input.finalizationPurpose === 'publication'
    && input.evidenceProvenance?.kind === 'runtime-capture';
  if (input.publicationEligible !== expectedPublicationEligibility) {
    fail('performance evaluation publication eligibility does not match finalization provenance');
  }
  return clone({ schemaVersion: 1, ...input });
}

function createStoredRecord(kind, body) {
  assertString(kind, 'stored performance record kind');
  const normalizedBody = clone(body);
  return deepFreeze({
    kind,
    body: normalizedBody,
    hash: canonicalSha256({ kind, body: normalizedBody }),
    canonicalBodyBytes: Buffer.byteLength(stableStringify(normalizedBody), 'utf8')
  });
}

function recordReference(record) {
  return { kind: record.kind, hash: record.hash };
}

function compareReferences(left, right) {
  return compareCodeUnitStrings(`${left.kind}:${left.hash}`, `${right.kind}:${right.hash}`);
}

function sortedReferences(records) {
  return records.map(recordReference).sort(compareReferences);
}

function statistics(values) {
  if (values.length === 0) fail('performance aggregate statistics require values');
  values.forEach((value, index) => assertFiniteNumber(value, `performance aggregate value[${index}]`));
  return {
    count: values.length,
    minimum: Math.min(...values),
    maximum: Math.max(...values),
    arithmeticMean: values.reduce((total, value) => total + value, 0) / values.length,
    nearestRankP50: nearestRank(values, 0.5),
    nearestRankP95: nearestRank(values, 0.95)
  };
}

function runtimeCaptureProvenance(evidenceProvenance) {
  return evidenceProvenance.kind === 'runtime-capture'
    ? evidenceProvenance.captureProvenance
    : evidenceProvenance.runtimeProjection;
}

function classifyBuildCodeRoot(entryPath, buildPolicy) {
  if (entryPath.startsWith('main/')) return 'main';
  if (entryPath.startsWith('preload/')) return 'preload';
  if (new RegExp(buildPolicy.entrypointPatterns.worker).test(entryPath)) return 'worker';
  if (entryPath.startsWith('renderer/')) return 'renderer';
  return null;
}

function validateBuildManifestEvidence(buildManifest, sourceSha, compiledPolicy) {
  const policy = compiledPolicy.policy.performanceBuildEvidencePolicy;
  assertExactKeys(buildManifest, ['schemaVersion', 'sourceSha', 'variants'], 'performance build manifest');
  if (buildManifest.schemaVersion !== policy.buildManifestSchemaVersion || buildManifest.sourceSha !== sourceSha) {
    fail('performance build manifest schema or source identity is invalid');
  }
  assertArray(buildManifest.variants, 'performance build manifest.variants');
  if (buildManifest.variants.length !== policy.variantFlags.length) fail('performance build manifest must contain every variant');
  const variants = buildManifest.variants.map((variant, index) => {
    assertExactKeys(variant, ['id', 'harness', 'instrumentation', 'bundle'], `performance build manifest.variants[${index}]`);
    if (stableStringify({ id: variant.id, harness: variant.harness, instrumentation: variant.instrumentation })
      !== stableStringify(policy.variantFlags[index])) fail('performance build manifest variant order or flags are invalid');
    assertExactKeys(variant.bundle, ['sha256', 'entries'], `performance build manifest.variants[${index}].bundle`);
    assertArray(variant.bundle.entries, `performance build manifest.variants[${index}].bundle.entries`);
    if (variant.bundle.entries.length === 0) fail('performance build manifest bundle entries must not be empty');
    const entries = variant.bundle.entries.map((entry, entryIndex) => {
      assertExactKeys(entry, ['path', 'bytes', 'sha256'], `performance build manifest.variants[${index}].bundle.entries[${entryIndex}]`);
      assertString(entry.path, `performance build manifest.variants[${index}].bundle.entries[${entryIndex}].path`);
      assertSafeInteger(entry.bytes, `performance build manifest.variants[${index}].bundle.entries[${entryIndex}].bytes`, 0);
      assertSha(entry.sha256, `performance build manifest.variants[${index}].bundle.entries[${entryIndex}].sha256`);
      if (entry.path.startsWith('/') || entry.path.includes('\\') || entry.path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
        fail('performance build manifest entry path is not normalized relative syntax');
      }
      return clone(entry);
    });
    if (entries.some((entry, entryIndex) => entryIndex > 0
      && compareCodeUnitStrings(entries[entryIndex - 1].path, entry.path) >= 0)) {
      fail('performance build manifest entries must be unique and Unicode-code-unit sorted');
    }
    if (variant.bundle.sha256 !== canonicalSha256(entries)) fail('performance build manifest bundle checksum is invalid');
    return { id: variant.id, harness: variant.harness, instrumentation: variant.instrumentation, bundle: { sha256: variant.bundle.sha256, entries } };
  });
  return { schemaVersion: buildManifest.schemaVersion, sourceSha: buildManifest.sourceSha, variants };
}

function validateProductionBundleEvidence(productionBundleEvidence, buildManifest, sourceSha, compiledPolicy) {
  const policy = compiledPolicy.policy.performanceBuildEvidencePolicy;
  assertExactKeys(productionBundleEvidence, ['schemaVersion', 'sourceSha', 'build', 'codeByteTotal', 'codeRoots', 'checksum'], 'production bundle evidence');
  if (productionBundleEvidence.schemaVersion !== 1 || productionBundleEvidence.sourceSha !== sourceSha) {
    fail('production bundle evidence schema or source identity is invalid');
  }
  assertExactKeys(productionBundleEvidence.build, ['id', 'harness', 'instrumentation', 'bundleSha256'], 'production bundle evidence.build');
  const production = buildManifest.variants[0];
  if (stableStringify(productionBundleEvidence.build) !== stableStringify({
    id: 'production',
    harness: false,
    instrumentation: false,
    bundleSha256: production.bundle.sha256
  })) fail('production bundle evidence build identity is invalid');
  assertArray(productionBundleEvidence.codeRoots, 'production bundle evidence.codeRoots');
  if (productionBundleEvidence.codeRoots.length !== policy.codeRootOrder.length) fail('production bundle evidence must contain every code root');
  const bundleEntries = new Map(production.bundle.entries.map((entry) => [entry.path, entry]));
  const seen = new Set();
  let codeByteTotal = 0;
  const codeRoots = productionBundleEvidence.codeRoots.map((root, index) => {
    assertExactKeys(root, ['id', 'entrypoint', 'byteTotal', 'entries', 'sha256'], `production bundle evidence.codeRoots[${index}]`);
    if (root.id !== policy.codeRootOrder[index]) fail('production bundle evidence code roots are reordered');
    assertExactKeys(root.entrypoint, ['path', 'bytes', 'sha256'], `production bundle evidence.codeRoots[${index}].entrypoint`);
    assertArray(root.entries, `production bundle evidence.codeRoots[${index}].entries`);
    if (root.entries.length === 0) fail('production bundle evidence code root is empty');
    const entries = root.entries.map((entry, entryIndex) => {
      assertExactKeys(entry, ['path', 'bytes', 'sha256'], `production bundle evidence.codeRoots[${index}].entries[${entryIndex}]`);
      const expected = bundleEntries.get(entry.path);
      if (!expected || stableStringify(expected) !== stableStringify(entry) || seen.has(entry.path)
        || classifyBuildCodeRoot(entry.path, policy) !== root.id) {
        fail('production bundle evidence code entry is missing, duplicated, or assigned to the wrong root');
      }
      seen.add(entry.path);
      return clone(entry);
    });
    if (entries.some((entry, entryIndex) => entryIndex > 0
      && compareCodeUnitStrings(entries[entryIndex - 1].path, entry.path) >= 0)) {
      fail('production bundle evidence code-root entries are not sorted');
    }
    const entrypoints = entries.filter((entry) => new RegExp(policy.entrypointPatterns[root.id]).test(entry.path));
    const byteTotal = entries.reduce((sum, entry) => sum + entry.bytes, 0);
    if (entrypoints.length !== 1 || stableStringify(entrypoints[0]) !== stableStringify(root.entrypoint)
      || root.byteTotal !== byteTotal || root.sha256 !== canonicalSha256(entries)) {
      fail('production bundle evidence code-root entrypoint, total, or checksum is invalid');
    }
    codeByteTotal += byteTotal;
    return { id: root.id, entrypoint: clone(root.entrypoint), byteTotal, entries, sha256: root.sha256 };
  });
  const javascriptEntries = production.bundle.entries.filter((entry) => policy.javascriptExtensions.some((extension) => entry.path.endsWith(extension)));
  if (seen.size !== javascriptEntries.length || productionBundleEvidence.codeByteTotal !== codeByteTotal) {
    fail('production bundle evidence does not cover every JavaScript entry exactly once');
  }
  const body = { schemaVersion: 1, sourceSha, build: clone(productionBundleEvidence.build), codeByteTotal, codeRoots };
  if (productionBundleEvidence.checksum !== canonicalSha256(body)) fail('production bundle evidence checksum is invalid');
  return { ...body, checksum: productionBundleEvidence.checksum };
}

function createPerformanceEnvelope(kind, dimensions, metrics, context) {
  return createBaselineEnvelope({
    kind,
    dimensions,
    generatedAt: context.semanticAuthority.generatedAt,
    repository: context.semanticAuthority.repository,
    environment: context.semanticAuthority.environment,
    captureProvenance: runtimeCaptureProvenance(context.evidenceProvenance),
    inputs: context.semanticAuthority.inputs,
    metrics,
    warnings: []
  });
}

function bundleBytes(buildManifest, variantId, compiledPolicy) {
  const variant = buildManifest.variants?.find((entry) => entry.id === variantId);
  if (!variant || !Array.isArray(variant.bundle?.entries) || variant.bundle.entries.length === 0) {
    fail(`build manifest is missing ${variantId} bundle entries`);
  }
  const buildPolicy = compiledPolicy.policy.performanceBuildEvidencePolicy;
  const codeEntries = variant.bundle.entries.filter((entry) => buildPolicy.javascriptExtensions.some((extension) => entry.path.endsWith(extension)));
  if (codeEntries.length === 0) fail(`build manifest ${variantId} contains no JavaScript code entries`);
  const entriesByRoot = new Map(buildPolicy.codeRootOrder.map((root) => [root, []]));
  const total = codeEntries.reduce((sum, entry, index) => {
    assertSafeInteger(entry.bytes, `build manifest ${variantId} entry[${index}].bytes`, 0);
    const root = classifyBuildCodeRoot(entry.path, buildPolicy);
    if (root === null) fail(`build manifest ${variantId} JavaScript entry ${entry.path} does not resolve one closed code root`);
    entriesByRoot.get(root).push(entry);
    return sum + entry.bytes;
  }, 0);
  for (const root of buildPolicy.codeRootOrder) {
    const entries = entriesByRoot.get(root);
    const entrypoints = entries.filter((entry) => new RegExp(buildPolicy.entrypointPatterns[root]).test(entry.path));
    if (entries.length === 0 || entrypoints.length !== 1) fail(`build manifest ${variantId} ${root} code root is not closed`);
  }
  return total;
}

function deriveBundleGate(buildManifest, productionBundleEvidence, compiledPolicy = loadBaselinePolicy()) {
  assertObject(productionBundleEvidence, 'production bundle evidence');
  const productionCodeBytes = bundleBytes(buildManifest, 'production', compiledPolicy);
  if (productionBundleEvidence.codeByteTotal !== productionCodeBytes) {
    fail('production bundle evidence codeByteTotal differs from the closed JavaScript code roots');
  }
  const harnessControlCodeBytes = bundleBytes(buildManifest, 'harness-control', compiledPolicy);
  const deltaBytes = harnessControlCodeBytes - productionCodeBytes;
  const allowance = compiledPolicy.policy.performanceMetricPolicy.sentinelBundleAllowance;
  const allowanceBytes = Math.max(allowance.fraction * productionCodeBytes, allowance.minimumBytes);
  return {
    productionCodeBytes,
    harnessControlCodeBytes,
    deltaBytes,
    allowanceBytes,
    passed: deltaBytes <= allowanceBytes
  };
}

function createPolicyLeaves(compiledPolicy) {
  return Object.keys(compiledPolicy.sectionHashes).sort(compareCodeUnitStrings).map((sectionId) => {
    const value = compiledPolicy.policy[sectionId];
    if (value === undefined || canonicalSha256(value) !== compiledPolicy.sectionHashes[sectionId]) {
      fail(`compiled policy section ${sectionId} does not match its section hash`);
    }
    return createStoredRecord('policy-leaf', {
      schemaVersion: 1,
      sectionId,
      sectionHash: compiledPolicy.sectionHashes[sectionId],
      value
    });
  });
}

function uniqueProducerList(captureProvenance) {
  return [clone(captureProvenance.producer)];
}

function finalizeLegacySingleBackendCaptureSet(captureSet, compiledPolicy) {
  void captureSet;
  void compiledPolicy;
  fail('legacy performance capture sets with caller-authored evaluationInput are forbidden');
}

function validateQualificationAdapterIdentity(value, policy, label) {
  assertExactKeys(value, policy.adapterIdentityFields, label);
  for (const field of policy.adapterIdentityFields) {
    if (value[field] !== null) assertString(value[field], `${label}.${field}`);
  }
  return clone(value);
}

function validateQualificationLimits(value, policy, label) {
  assertExactKeys(value, policy.limitFields, label);
  for (const field of policy.limitFields) assertSafeInteger(value[field], `${label}.${field}`, 1);
  return clone(value);
}

function validateQualificationBackendIdentity(value, policy, label) {
  assertExactKeys(value, policy.backendExecutionIdentityFields, label);
  if (value.backend !== 'webgpu' || value.driver !== 'webgpu-driver-v1'
    || value.workerProtocol !== 'webgpu-worker-ready-v1'
    || !['low-power', 'high-performance'].includes(value.powerPreference)) fail(`${label} is not a WebGPU worker READY identity`);
  assertBoolean(value.isFallbackAdapter, `${label}.isFallbackAdapter`);
  return {
    backend: value.backend,
    driver: value.driver,
    workerProtocol: value.workerProtocol,
    adapterIdentity: validateQualificationAdapterIdentity(value.adapterIdentity, policy, `${label}.adapterIdentity`),
    limits: validateQualificationLimits(value.limits, policy, `${label}.limits`),
    isFallbackAdapter: value.isFallbackAdapter,
    powerPreference: value.powerPreference
  };
}

function validateQualificationResult(value, statuses, policy, label, { capability = false } = {}) {
  assertObject(value, label);
  assertString(value.status, `${label}.status`);
  if (statuses.available.includes(value.status)) {
    assertExactKeys(value, capability ? policy.availableCapabilityResultFields : policy.statusOnlyResultFields, label);
    if (!capability) return { status: value.status };
    assertBoolean(value.isFallbackAdapter, `${label}.isFallbackAdapter`);
    assertExactKeys(value.strictSelection, policy.strictSelectionFields, `${label}.strictSelection`);
    if (value.strictSelection.requestedBackend !== 'webgpu' || value.strictSelection.powerPreference !== 'low-power'
      || value.strictSelection.forceFallbackAdapter !== false) fail(`${label}.strictSelection is invalid`);
    return {
      status: value.status,
      adapterIdentity: validateQualificationAdapterIdentity(value.adapterIdentity, policy, `${label}.adapterIdentity`),
      limits: validateQualificationLimits(value.limits, policy, `${label}.limits`),
      isFallbackAdapter: value.isFallbackAdapter,
      strictSelection: clone(value.strictSelection)
    };
  }
  if (statuses.unavailable.includes(value.status)) {
    assertExactKeys(value, policy.statusOnlyResultFields, label);
    return { status: value.status };
  }
  if (statuses.fatal.includes(value.status)) {
    assertExactKeys(value, policy.errorResultFields, label);
    assertExactKeys(value.error, policy.errorFields, `${label}.error`);
    assertString(value.error.name, `${label}.error.name`);
    assertString(value.error.message, `${label}.error.message`);
    fail(`${label} fatal results are not publishable`);
  }
  fail(`${label}.status is not registered`);
}

function validateQualificationReadiness(value, policy, label) {
  assertExactKeys(value, policy.readinessEvidenceFields, label);
  assertArray(value.stages, `${label}.stages`);
  if (value.stages.length === 0) fail(`${label}.stages must not be empty`);
  return {
    stages: value.stages.map((stage, index) => {
      const stageLabel = `${label}.stages[${index}]`;
      assertExactKeys(stage, policy.readinessStageFields, stageLabel);
      if (!['webgpu', 'canvas2d'].includes(stage.backend)) fail(`${stageLabel}.backend is invalid`);
      assertFiniteNumber(stage.backendReadyObservedAt, `${stageLabel}.backendReadyObservedAt`, 0);
      assertSafeInteger(stage.sourceSequence, `${stageLabel}.sourceSequence`, 1);
      assertFiniteNumber(stage.sourceObservedAt, `${stageLabel}.sourceObservedAt`, stage.backendReadyObservedAt);
      if (stage.backend === 'canvas2d') {
        assertExactKeys(stage.terminalFrame, policy.canvasTerminalFrameFields, `${stageLabel}.terminalFrame`);
        if (stage.terminalFrame.kind !== 'canvas-draw-completed' || stage.terminalFrame.outcome !== 'canvas-draw-completed') fail(`${stageLabel} lacks a Canvas terminal frame`);
        assertFiniteNumber(stage.terminalFrame.observedAt, `${stageLabel}.terminalFrame.observedAt`, stage.sourceObservedAt);
      } else {
        assertExactKeys(stage.terminalFrame, policy.webgpuTerminalFrameFields, `${stageLabel}.terminalFrame`);
        if (stage.terminalFrame.kind !== 'worker-frame-acknowledged'
          || stage.terminalFrame.outcome !== 'webgpu-queue-submit-completed') fail(`${stageLabel} lacks a WebGPU acknowledgement`);
        assertSafeInteger(stage.terminalFrame.frameToken, `${stageLabel}.terminalFrame.frameToken`, 1);
        assertFiniteNumber(stage.terminalFrame.submittedAt, `${stageLabel}.terminalFrame.submittedAt`, stage.sourceObservedAt);
        assertFiniteNumber(stage.terminalFrame.acknowledgedAt, `${stageLabel}.terminalFrame.acknowledgedAt`, stage.terminalFrame.submittedAt);
      }
      return clone(stage);
    })
  };
}

function validateQualificationCleanup(value, policy, label) {
  assertExactKeys(value, policy.cleanupFields, label);
  assertArray(value.controllerFatalReasons, `${label}.controllerFatalReasons`);
  if (value.controllerFatalReasons.length !== 0 || value.listenersRemoved !== true || value.restorationOutcome !== 'restored') {
    fail(`${label} does not prove successful controller cleanup`);
  }
  for (const field of ['applicationDescendantClosureEnd', 'brokerDisposeEnd', 'rootExitObservedAt', 'terminalClosureEnd']) {
    assertFiniteNumber(value[field], `${label}.${field}`, 0);
  }
  if (value.applicationDescendantClosureEnd > value.brokerDisposeEnd
    || value.brokerDisposeEnd > value.rootExitObservedAt
    || value.rootExitObservedAt > value.terminalClosureEnd) fail(`${label} timestamps are not monotonic`);
  return clone(value);
}

function validateQualificationCaptureBody(body, compiledPolicy) {
  const policy = compiledPolicy.qualificationCapturePolicy;
  assertExactKeys(body, policy.captureBodyFields, 'qualification capture body');
  if (body.schemaVersion !== 1 || body.buildVariant !== 'harness-control' || body.requestedBackend !== 'webgpu') {
    fail('qualification capture body constants are invalid');
  }
  const capabilityResult = validateQualificationResult(body.capabilityResult, policy.capabilityStatuses, policy, 'qualification capture body.capabilityResult', { capability: true });
  const transferResult = validateQualificationResult(body.transferResult, policy.transferStatuses, policy, 'qualification capture body.transferResult');
  const readinessEvidence = validateQualificationReadiness(body.readinessEvidence, policy, 'qualification capture body.readinessEvidence');
  const cleanup = validateQualificationCleanup(body.cleanup, policy, 'qualification capture body.cleanup');
  assertExactKeys(body.selectionResult, policy.selectionResultFields, 'qualification capture body.selectionResult');
  const selection = body.selectionResult;
  if (!policy.qualificationStates.includes(selection.qualificationState)
    || !policy.unavailabilityBranches.includes(selection.unavailabilityBranch)
    || !policy.selectionReasons.includes(selection.selectionReason)
    || selection.requestedBackend !== 'webgpu'
    || !['webgpu', 'canvas2d'].includes(selection.selectedBackend)
    || !['webgpu', 'canvas2d'].includes(selection.observedBackend)) fail('qualification selection result is invalid');
  const unavailableBranch = ({
    'api-unavailable': 'webgpu-api-unavailable',
    'adapter-unavailable': 'webgpu-adapter-unavailable'
  })[capabilityResult.status] ?? ({
    'api-unavailable': 'transfer-api-unavailable',
    'method-unavailable': 'transfer-method-unavailable',
    'allowlisted-not-supported': 'transfer-allowlisted-not-supported'
  })[transferResult.status] ?? null;
  let adapterIdentity = null;
  let fallbackState = null;
  let backendExecutionIdentity = null;
  if (unavailableBranch !== null) {
    if (selection.qualificationState !== 'hardware-capability-unavailable'
      || selection.unavailabilityBranch !== unavailableBranch || selection.selectionReason !== unavailableBranch
      || selection.selectedBackend !== 'canvas2d' || selection.observedBackend !== 'canvas2d'
      || body.adapterIdentity !== null || body.fallbackState !== null || body.backendExecutionIdentity !== null
      || stableStringify(readinessEvidence.stages.map((stage) => stage.backend)) !== stableStringify(['canvas2d'])) {
      fail('qualification pre-worker unavailability branch is inconsistent');
    }
  } else {
    if (capabilityResult.status !== 'available' || transferResult.status !== 'available') fail('qualification has no publishable selection branch');
    adapterIdentity = validateQualificationAdapterIdentity(body.adapterIdentity, policy, 'qualification capture body.adapterIdentity');
    if (stableStringify(adapterIdentity) !== stableStringify(capabilityResult.adapterIdentity)) fail('qualification adapter identity differs from the capability oracle');
    if (capabilityResult.isFallbackAdapter) {
      assertExactKeys(body.fallbackState, policy.unavailableFallbackStateFields, 'qualification capture body.fallbackState');
      if (body.fallbackState.isFallbackAdapter !== true || body.fallbackState.branch !== 'worker-fallback-adapter'
        || body.fallbackState.fallbackBackend !== 'canvas2d' || body.backendExecutionIdentity !== null
        || selection.qualificationState !== 'hardware-capability-unavailable'
        || selection.unavailabilityBranch !== 'worker-fallback-adapter'
        || selection.selectionReason !== 'worker-fallback-adapter'
        || selection.selectedBackend !== 'canvas2d' || selection.observedBackend !== 'webgpu'
        || stableStringify(readinessEvidence.stages.map((stage) => stage.backend)) !== stableStringify(['webgpu', 'canvas2d'])) {
        fail('qualification worker fallback branch is inconsistent');
      }
      fallbackState = {
        isFallbackAdapter: true,
        branch: body.fallbackState.branch,
        observedBackendExecutionIdentity: validateQualificationBackendIdentity(body.fallbackState.observedBackendExecutionIdentity, policy, 'qualification capture body.fallbackState.observedBackendExecutionIdentity'),
        fallbackBackend: body.fallbackState.fallbackBackend
      };
      if (fallbackState.observedBackendExecutionIdentity.isFallbackAdapter !== true) fail('qualification fallback worker identity is not a fallback adapter');
    } else {
      assertExactKeys(body.fallbackState, policy.qualifiedFallbackStateFields, 'qualification capture body.fallbackState');
      if (body.fallbackState.isFallbackAdapter !== false || body.fallbackState.branch !== null
        || selection.qualificationState !== 'qualified-webgpu' || selection.unavailabilityBranch !== 'none'
        || selection.selectionReason !== 'webgpu-selected' || selection.selectedBackend !== 'webgpu'
        || selection.observedBackend !== 'webgpu'
        || stableStringify(readinessEvidence.stages.map((stage) => stage.backend)) !== stableStringify(['webgpu'])) {
        fail('qualified WebGPU branch is inconsistent');
      }
      fallbackState = { isFallbackAdapter: false, branch: null };
      backendExecutionIdentity = validateQualificationBackendIdentity(body.backendExecutionIdentity, policy, 'qualification capture body.backendExecutionIdentity');
      if (backendExecutionIdentity.isFallbackAdapter !== false || backendExecutionIdentity.powerPreference !== 'low-power') fail('qualified WebGPU identity violates strict selection');
    }
    const observedIdentity = backendExecutionIdentity ?? fallbackState.observedBackendExecutionIdentity;
    if (stableStringify(observedIdentity.adapterIdentity) !== stableStringify(capabilityResult.adapterIdentity)
      || stableStringify(observedIdentity.limits) !== stableStringify(capabilityResult.limits)) {
      fail('qualification worker identity differs from the capability oracle');
    }
  }
  return {
    ...clone(body),
    capabilityResult,
    transferResult,
    readinessEvidence,
    selectionResult: clone(selection),
    adapterIdentity,
    fallbackState,
    backendExecutionIdentity,
    cleanup
  };
}

function qualificationFingerprintInput(body, captureSet, compiledPolicy, initialEnvironment) {
  const authority = validateSemanticAuthority(captureSet.manifest.semanticAuthority);
  const controlBundle = captureSet.buildManifest.variants?.find((entry) => entry.id === 'harness-control') ?? null;
  if (!controlBundle) fail('qualification fingerprint requires the harness-control build manifest variant');
  const selection = body.selectionResult;
  return {
    schemaVersion: body.schemaVersion,
    sourceSha: body.sourceSha,
    controlBundle,
    workload: authority.inputs.workload ?? authority.inputs,
    initialEnvironment: initialEnvironment ?? authority.environment,
    requestedBackend: selection.requestedBackend,
    selectedBackend: selection.selectedBackend,
    observedBackend: selection.observedBackend,
    qualificationState: selection.qualificationState,
    unavailabilityBranch: selection.unavailabilityBranch,
    adapter: body.adapterIdentity ?? { capabilityResult: body.capabilityResult, transferResult: body.transferResult },
    backendExecutionIdentity: body.backendExecutionIdentity ?? 'not-applicable',
    resetVersion: authority.reset.version ?? canonicalSha256(authority.reset),
    policyHashes: compiledPolicy.sectionHashes,
    processAdapter: authority.inputs.processAdapter ?? { policyHash: compiledPolicy.sectionHashes.processAdapterRegistry },
    seedManifestHash: authority.seed.manifestHash ?? authority.seed.hash ?? canonicalSha256(authority.seed)
  };
}

function validateQualificationRawReplay(capture, body, compiledPolicy) {
  assertArray(capture.rawKinds, 'qualification capture.rawKinds');
  const rows = new Map(capture.rawKinds.map((group) => {
    assertExactKeys(group, ['rawKind', 'rows'], 'qualification capture raw group');
    const encoded = encodePerformanceEvidence(group.rawKind, group.rows, compiledPolicy);
    return [group.rawKind, decodePerformanceEvidence(encoded, compiledPolicy)];
  }));
  const processRows = rows.get('process-observation') ?? [];
  const processGate = capturedProcessGate(processRows, compiledPolicy);
  if (!processGate.passed) fail(`qualification process replay failed: ${processGate.reason}`);
  const environmentRows = rows.get('environment-observation') ?? [];
  if (!environmentRows.some((row) => row.observationKind === 'cleanup' && row.cleanupState === 'disposed')) {
    fail('qualification environment replay lacks disposed cleanup authority');
  }
  const controllerRows = rows.get('controller-operation') ?? [];
  const readinessWrites = controllerRows.filter((row) => row.operationKind === 'control-write' && row.writeKind === 'backend-ready');
  if (readinessWrites.length !== body.readinessEvidence.stages.length) {
    fail('qualification readiness stages do not match backend-ready controller writes');
  }
  for (const stage of body.readinessEvidence.stages) {
    const matches = readinessWrites.filter((row) => row.rawWrite.selectedBackend === stage.backend
      && row.rawWrite.observedAt === stage.backendReadyObservedAt);
    if (matches.length !== 1) fail(`qualification ${stage.backend} readiness lacks one exact backend-ready write`);
    const identity = matches[0].rawWrite.backendExecutionIdentity;
    if (stage.backend === 'canvas2d') {
      if (identity !== null) fail('qualification Canvas readiness carries an execution identity');
    } else {
      const expected = body.backendExecutionIdentity ?? body.fallbackState?.observedBackendExecutionIdentity;
      if (stableStringify(identity) !== stableStringify(expected)) fail('qualification WebGPU readiness identity differs from worker READY authority');
    }
  }
}

export function deriveQualificationCapture(capture, captureSet, compiledPolicy = loadBaselinePolicy(), initialEnvironment = undefined) {
  assertObject(capture, 'qualification capture');
  const body = validateQualificationCaptureBody(capture.captureBody, compiledPolicy);
  for (const field of ['experimentId', 'ledgerSequence', 'observationBoundaryId', 'sourceSha', 'policyHash']) {
    if (body[field] !== capture[field]) fail(`qualification capture body ${field} differs from its wrapper`);
  }
  assertSha(capture.captureBodyChecksum, 'qualification capture.captureBodyChecksum');
  if (capture.captureBodyChecksum !== canonicalSha256(body)) fail('qualification capture body checksum is invalid');
  validateQualificationRawReplay(capture, body, compiledPolicy);
  const ledgerEntry = captureSet.performanceLedger.find((entry) => entry.sequence === capture.ledgerSequence);
  if (!ledgerEntry) fail('qualification capture has no ledger transaction');
  validateQualificationLedgerEntry(ledgerEntry, 'qualification capture ledger transaction', compiledPolicy);
  if (ledgerEntry.operationId !== 'electron-harness-spawn' || ledgerEntry.purpose !== 'qualification-probe'
    || ledgerEntry.observationBoundaryId !== capture.observationBoundaryId
    || ledgerEntry.capabilityEvidence?.captureBodyChecksum !== capture.captureBodyChecksum
    || stableStringify(ledgerEntry.readinessEvidence) !== stableStringify(body.readinessEvidence)
    || stableStringify(ledgerEntry.cleanup) !== stableStringify(body.cleanup)) {
    fail('qualification capture is not byte-bound to its qualification ledger transaction');
  }
  const fingerprintInput = qualificationFingerprintInput(body, captureSet, compiledPolicy, initialEnvironment);
  return deepFreeze({
    state: body.selectionResult.qualificationState,
    selectedBackend: body.selectionResult.selectedBackend,
    observedBackend: body.selectionResult.observedBackend,
    unavailabilityBranch: body.selectionResult.unavailabilityBranch,
    adapterIdentity: body.adapterIdentity,
    backendExecutionIdentity: body.backendExecutionIdentity,
    readinessEvidence: body.readinessEvidence,
    cleanup: body.cleanup,
    captureBody: body,
    captureChecksum: capture.captureBodyChecksum,
    captureBodyChecksum: capture.captureBodyChecksum,
    qualificationFingerprintInput: fingerprintInput,
    qualificationFingerprint: computeQualificationFingerprint(fingerprintInput, compiledPolicy)
  });
}

function validateRunBackendExecutionIdentities(evaluation, collected, qualification) {
  const controllerRows = rawRowsByKind(collected.rawArchive.rawEvidenceBody).get('controller-operation');
  for (const run of evaluation.runs) {
    const readiness = rowsForRun(controllerRows, run.runId)
      .filter((row) => row.operationKind === 'control-write' && row.writeKind === 'backend-ready');
    if (run.join.buildVariant === 'production') {
      if (readiness.length !== 0) fail(`production run ${run.runId} contains backend-ready evidence`);
      continue;
    }
    if (readiness.length !== 1) fail(`harness run ${run.runId} must contain exactly one backend-ready write`);
    const write = readiness[0].rawWrite;
    if (write.selectedBackend !== run.join.backend) fail(`run ${run.runId} backend-ready selection differs from its ledger backend`);
    if (run.join.backend === 'canvas2d') {
      if (write.backendExecutionIdentity !== null) fail(`Canvas run ${run.runId} carries a backend execution identity`);
    } else {
      if (!qualification || qualification.state !== 'qualified-webgpu'
        || stableStringify(write.backendExecutionIdentity) !== stableStringify(qualification.backendExecutionIdentity)) {
        fail(`WebGPU run ${run.runId} execution identity differs from selected-host qualification`);
      }
    }
  }
}

function deriveResolvedBackendEvaluations(evaluation, captureSet, qualification, compiledPolicy) {
  const authority = validateSemanticAuthority(captureSet.manifest.semanticAuthority);
  return evaluation.backendEvaluations.map((entry) => {
    const backendExecutionIdentity = entry.backend === 'canvas2d'
      ? 'not-applicable'
      : qualification?.state === 'qualified-webgpu'
        ? qualification.backendExecutionIdentity
        : null;
    if (backendExecutionIdentity === null) fail('WebGPU comparison fingerprint requires qualified execution identity');
    return {
      backend: entry.backend,
      comparisonFingerprint: computeComparisonFingerprint({
        schemaVersion: 1,
        policyHashes: compiledPolicy.sectionHashes,
        initialEnvironment: evaluation.initialEnvironment,
        workload: authority.inputs.workload ?? authority.inputs,
        reset: authority.reset,
        processAdapter: authority.inputs.processAdapter ?? { policyHash: compiledPolicy.sectionHashes.processAdapterRegistry },
        seed: authority.seed,
        backend: entry.backend,
        backendExecutionIdentity
      }, compiledPolicy),
      allocationEvidence: entry.allocationEvidence
    };
  });
}

function resolvedCaptureProvenance(captureSet, compiledPolicy) {
  const manifest = captureSet.manifest;
  const semanticAuthority = validateSemanticAuthority(manifest.semanticAuthority);
  const provenance = validateFinalizationProvenance(manifest.evidenceProvenance, manifest.finalizationPurpose, compiledPolicy);
  const runtime = runtimeCaptureProvenance(provenance);
  if (semanticAuthority.repository.commitSha !== manifest.evaluationContext.sourceSha
    || runtime.sourceSha !== manifest.evaluationContext.sourceSha) {
    fail('manifest semantic authority and provenance must bind the evaluation source SHA');
  }
  if (manifest.finalizationPurpose === 'publication' && semanticAuthority.repository.dirty) {
    fail('publication requires a clean repository captured at the evaluated source SHA');
  }
  if (manifest.mode === 'ci-core' && runtime.provider !== 'github-actions') fail('ci-core publication requires GitHub Actions provenance');
  if (manifest.mode === 'selected-reference' && runtime.provider !== 'local') fail('selected-reference publication requires local selected-host provenance');
  return { semanticAuthority, provenance, runtime };
}

function actualTopology(captureSet, evaluation, records) {
  const acceptedPairs = evaluation.pairs.filter((pair) => pair.accepted);
  const acceptedRunIds = new Set(acceptedPairs.flatMap((pair) => [pair.baselineRunId, pair.comparedRunId]));
  const allIndexes = Object.values(captureSet.backendFamilies).flatMap((family) => Object.values(family.indexes));
  const manifestRunIds = new Set(allIndexes.flatMap((index) => index.entries ?? []).map((entry) => entry.runId).filter(Boolean));
  const ledger = evaluation.ledger;
  return {
    state: 'complete',
    transportProbeCount: captureSet.experimentEvidence.captures.transport.length,
    buildCount: captureSet.buildCommandLedger.entries.filter((entry) => entry.operationId === 'build-spawn').length,
    hardwareProbeCount: captureSet.qualificationEvidence ? 1 : 0,
    metricSessionCount: Object.values(captureSet.backendFamilies).reduce((total, family) => total + family.captures.metricSession.length, 0),
    resetCount: ledger.filter((entry) => entry.operationId === 'internal-reset').length,
    sentinelPairCount: acceptedPairs.filter((pair) => pair.comparisonKind === 'harness-overhead').length,
    instrumentationPairCount: acceptedPairs.filter((pair) => pair.comparisonKind === 'instrumentation-overhead').length,
    measurementLaunchCount: evaluation.runs.length,
    manifestRunCount: manifestRunIds.size,
    acceptedRunCount: acceptedRunIds.size,
    aggregateCount: records.aggregates.length,
    comparisonCount: records.comparisons.length,
    qualificationCount: records.qualifications.length
  };
}

function assertCompleteResolvedTopology(captureSet, evaluation, topology, compiledPolicy) {
  if (topology.transportProbeCount !== 2 || topology.buildCount !== 3) fail('performance topology requires two typed transport probes and three build commands');
  if (topology.metricSessionCount !== evaluation.pairs.length || topology.manifestRunCount !== evaluation.runs.length) {
    fail('capture indexes, metric sessions, evaluator pairs, and run arrays do not form a closed topology');
  }
  for (const backend of Object.keys(captureSet.backendFamilies)) {
    for (const comparison of compiledPolicy.comparisonRegistry.values()) {
      const count = evaluation.pairs.filter((pair) => pair.accepted && pair.backend === backend && pair.comparisonKind === comparison.comparisonKind).length;
      if (count !== comparison.pairCount) fail(`${backend} ${comparison.comparisonKind} topology does not contain the policy pair count`);
    }
  }
}

function runProjectionBoundary(join) {
  return { scopeKind: 'run', join: clone(validatePerformanceRunJoin(join, { label: 'run projection boundary join' })) };
}

function cachedRunProjectionBoundary(run, context) {
  const existing = context.projectionBoundaryByRun.get(run.runId);
  if (existing) return existing;
  const boundary = runProjectionBoundary(run.join);
  context.projectionBoundaryByRun.set(run.runId, boundary);
  return boundary;
}

function cachedRawRowProjectionBody(context, cacheKey, boundary, rawKind, rows, compiledPolicy) {
  const existing = context.rawProjectionBodies.get(cacheKey);
  if (existing) return existing;
  const body = createRawRowProjectionBody({
    experimentId: context.experimentId,
    boundary,
    rawKind,
    rows
  }, compiledPolicy);
  context.rawProjectionBodies.set(cacheKey, body);
  return body;
}

function qualificationProjectionBoundary(capture) {
  return {
    scopeKind: 'qualification',
    experimentId: capture.experimentId,
    sourceSha: capture.sourceSha,
    policyHash: capture.policyHash,
    ledgerSequence: capture.ledgerSequence,
    observationBoundaryId: capture.observationBoundaryId
  };
}

function runRowsForRawKind(run, rawKind, context, compiledPolicy) {
  const index = context.rawRowIndex;
  const rows = index.rowsByKind.get(rawKind);
  const selected = [...indexedRowsForRun(index, rawKind, run.runId)];
  if (rawKind === 'environment-observation') {
    selected.push(...capturedExperimentEnvironmentRowsForLaunch(rows, run.ledgerEntry));
  }
  if (rawKind === 'process-observation') {
    selected.push(...indexedRowsForCaptureScope(
      index, rawKind, 'metric-session', 'metric-session', run.join.metricSessionId
    ));
    selected.push(...indexedRowsForCapture(index, rawKind, 'transport'));
  }
  return cachedRawRowProjectionBody(
    context,
    `run:${run.runId}:${rawKind}`,
    cachedRunProjectionBoundary(run, context),
    rawKind,
    selected,
    compiledPolicy
  );
}

function semanticCaptureProjection(run, captureKind, context, compiledPolicy) {
  const index = context.rawRowIndex;
  const rawKinds = [];
  for (const rawKind of compiledPolicy.rawKindOrder) {
    const allRows = index.rowsByKind.get(rawKind);
    let selected;
    if (captureKind === 'experiment-environment') {
      selected = rawKind === 'environment-observation'
        ? capturedExperimentEnvironmentRowsForLaunch(allRows, run.join)
        : [];
    } else if (captureKind === 'metric-session') {
      selected = indexedRowsForCaptureScope(
        index, rawKind, captureKind, 'metric-session', run.join.metricSessionId
      );
    } else if (captureKind === 'transport') {
      selected = indexedRowsForCapture(index, rawKind, captureKind);
    } else {
      selected = indexedRowsForRun(index, rawKind, run.runId)
        .filter((row) => row.captureKind === captureKind);
    }
    if (selected.length === 0) continue;
    const runRows = indexedRowsForRun(index, rawKind, run.runId);
    const sharesRunProjection = rawKind !== 'environment-observation'
      && rawKind !== 'process-observation'
      && selected.length === runRows.length
      && selected.every((row, rowIndex) => row === runRows[rowIndex]);
    const body = cachedRawRowProjectionBody(
      context,
      sharesRunProjection
        ? `run:${run.runId}:${rawKind}`
        : `capture:${captureKind}:${run.runId}:${rawKind}`,
      cachedRunProjectionBoundary(run, context),
      rawKind,
      selected,
      compiledPolicy
    );
    rawKinds.push({ rawKind, rowCount: body.rows.length, rowProjectionChecksum: canonicalSha256(body) });
  }
  const body = {
    schemaVersion: 1,
    experimentId: context.experimentId,
    boundary: cachedRunProjectionBoundary(run, context),
    captureKind,
    rawKinds
  };
  return { captureKind, checksum: canonicalSha256(body) };
}

function semanticRunRawEvidence(run, context, compiledPolicy) {
  const captureKinds = run.join.comparisonKind === 'harness-overhead'
    ? ['experiment-environment', 'external-metric', 'metric-session', 'sentinel', 'transport']
    : ['experiment-environment', 'external-metric', 'metric-session', 'transport', 'workload'];
  const captureProjections = captureKinds.map((captureKind) => semanticCaptureProjection(run, captureKind, context, compiledPolicy))
    .sort((left, right) => compareCodeUnitStrings(`${left.captureKind}:${left.checksum}`, `${right.captureKind}:${right.checksum}`));
  const manifests = new Map(context.collected.rawArchive.rawKindManifests.map((record) => [record.body.rawKind, record.body]));
  const rawKinds = compiledPolicy.rawKindOrder.map((rawKind) => {
    const body = runRowsForRawKind(run, rawKind, context, compiledPolicy);
    return {
      rawKind,
      rowCount: body.rows.length,
      rowProjectionChecksum: canonicalSha256(body),
      experimentRawKindEncodedChecksum: manifests.get(rawKind).encodedChecksum
    };
  });
  return { captureProjections, rawKinds };
}

function runAllocationState(run, allocation) {
  if (run.join.backend === 'canvas2d') return { state: 'not-applicable-no-covered-allocation-request' };
  if (run.join.buildVariant !== 'instrumented') return { state: 'not-applicable-build-variant' };
  const observedCoverage = allocation.observedCoverage.filter((entry) => entry.runId === run.runId);
  const missingCoverage = allocation.missingCoverage.filter((entry) => entry.runId === run.runId);
  return allocation.state === 'measured-request-proxy'
    ? { state: allocation.state, observedCoverage }
    : { state: allocation.state, observedCoverage, missingCoverage, blocker: allocation.blocker };
}

function publishedRunGates(gates, rawEvidence) {
  const rawKinds = new Map(rawEvidence.rawKinds.map((entry) => [entry.rawKind, entry]));
  const captures = new Map(rawEvidence.captureProjections.map((entry) => [entry.captureKind, entry]));
  return gates.map((gate) => ({
    gateId: gate.gateId,
    passed: gate.passed,
    reason: gate.reason,
    authorities: gate.authorities.map((authority) => {
      if (authority.authorityKind === 'run-raw') {
        const projection = rawKinds.get(authority.rawKind);
        if (!projection) fail(`published gate ${gate.gateId} has no ${authority.rawKind} run projection`);
        return { ...authority, rowProjectionChecksum: projection.rowProjectionChecksum };
      }
      if (authority.authorityKind === 'capture-projection') {
        const projection = captures.get(authority.captureKind);
        if (!projection) fail(`published gate ${gate.gateId} has no ${authority.captureKind} capture projection`);
        return { authorityKind: 'capture-projection', captureKind: authority.captureKind, checksum: projection.checksum };
      }
      return clone(authority);
    }).sort((left, right) => compareCodeUnitStrings(stableStringify(left), stableStringify(right)))
  }));
}

function combinePublishedGates(runRecords, compiledPolicy, additionalGates = []) {
  const grouped = new Map();
  for (const gate of [...runRecords.flatMap((record) => record.body.metrics.derivedEvidence.gates), ...additionalGates]) {
    const group = grouped.get(gate.gateId) ?? [];
    group.push(gate);
    grouped.set(gate.gateId, group);
  }
  const gateOrder = new Map([...compiledPolicy.gateRegistry.keys()].map((gateId, index) => [gateId, index]));
  return [...grouped.entries()].map(([gateId, gates]) => {
    if (!gateOrder.has(gateId)) fail(`published performance child uses unknown gate ${gateId}`);
    const authorities = new Map();
    for (const gate of gates) {
      for (const authority of gate.authorities) authorities.set(stableStringify(authority), authority);
    }
    const passed = gates.every((gate) => gate.passed);
    const reasons = [...new Set(gates.filter((gate) => !gate.passed).map((gate) => gate.reason))]
      .sort(compareCodeUnitStrings);
    return {
      gateId,
      passed,
      reason: passed ? null : reasons.join(','),
      authorities: [...authorities.values()].sort((left, right) => compareCodeUnitStrings(stableStringify(left), stableStringify(right)))
    };
  }).sort((left, right) => gateOrder.get(left.gateId) - gateOrder.get(right.gateId));
}

function resolvedRunRecords(evaluation, context, compiledPolicy) {
  const pairBySession = new Map(evaluation.pairs.map((pair) => [pair.metricSessionId, pair]));
  return evaluation.runs.map((run) => {
    const pair = pairBySession.get(run.join.metricSessionId);
    const rawEvidence = semanticRunRawEvidence(run, context, compiledPolicy);
    const body = createPerformanceEnvelope('performance-run', {
      experimentRole: context.experimentRole,
      comparisonFingerprint: context.fingerprints.get(run.join.backend),
      comparisonKind: run.join.comparisonKind,
      backend: run.join.backend,
      pairIndex: pair.pairIndex,
      buildVariant: run.join.buildVariant,
      attemptIndex: pair.attemptIndex
    }, {
      join: run.join,
      status: pair.accepted ? 'accepted' : 'excluded',
      metricSession: {
        id: pair.metricSessionId,
        outcome: 'completed',
        attemptIndex: pair.attemptIndex,
        retryReason: pair.retryReason,
        supersededByRetry: !pair.accepted,
        lastBoundary: 'completed-close'
      },
      validity: pair.accepted
        ? { disposition: 'accepted', reason: null }
        : { disposition: 'retryable-quality-excluded', reason: pair.retryReason },
      rawEvidence,
      derivedEvidence: { metrics: run.derivedMetrics, gates: publishedRunGates(run.gates, rawEvidence) },
      allocationState: runAllocationState(run, context.allocations.get(run.join.backend))
    }, context);
    return createStoredRecord('run', body);
  });
}

function resolvedAggregateRecords(runRecords, context, compiledPolicy) {
  const records = [];
  for (const backend of context.backends) for (const comparisonKind of ['harness-overhead', 'instrumentation-overhead']) {
    for (const buildVariant of COMPARISON_BUILD_VARIANTS[comparisonKind]) {
      const runs = runRecords.filter((record) => record.body.metrics.join.backend === backend
        && record.body.metrics.join.comparisonKind === comparisonKind
        && record.body.metrics.join.buildVariant === buildVariant
        && record.body.metrics.status === 'accepted');
      if (runs.length === 0) fail(`aggregate ${backend}/${comparisonKind}/${buildVariant} has no accepted runs`);
      const registry = compiledPolicy.runMetricRegistry.filter((entry) => entry.comparisonKind === comparisonKind);
      const metricStatistics = registry.map((definition) => {
        const metrics = runs.map((record) => ({
          record,
          metric: record.body.metrics.derivedEvidence.metrics.find((entry) => entry.metricId === definition.metricId)
        }));
        if (metrics.some(({ metric }) => !metric || metric.availability !== 'available')) {
          fail(`aggregate ${backend}/${comparisonKind}/${buildVariant} metric ${definition.metricId} is unavailable`);
        }
        if (definition.valueShape === 'bounded') {
          const values = metrics.map(({ record, metric }) => ({
            pairIndex: record.body.metrics.join.pairIndex,
            attemptIndex: record.body.metrics.join.attemptIndex,
            runId: record.body.metrics.join.runId,
            lower: metric.lower,
            upper: metric.upper
          }));
          return {
            metricId: definition.metricId,
            unit: definition.unit,
            valueShape: 'bounded',
            values,
            statistics: {
              lower: statistics(values.map((entry) => entry.lower)),
              upper: statistics(values.map((entry) => entry.upper))
            }
          };
        }
        const values = metrics.map(({ record, metric }) => ({
          pairIndex: record.body.metrics.join.pairIndex,
          attemptIndex: record.body.metrics.join.attemptIndex,
          runId: record.body.metrics.join.runId,
          value: metric.value
        }));
        return {
          metricId: definition.metricId,
          unit: definition.unit,
          valueShape: 'scalar',
          values,
          statistics: statistics(values.map((entry) => entry.value))
        };
      });
      records.push(createStoredRecord('aggregate', createPerformanceEnvelope('performance-aggregate', {
        experimentRole: context.experimentRole,
        comparisonFingerprint: context.fingerprints.get(backend),
        comparisonKind,
        backend,
        buildVariant
      }, {
        experimentId: context.experimentId,
        experimentRole: context.experimentRole,
        comparisonFingerprint: context.fingerprints.get(backend),
        comparisonKind,
        backend,
        buildVariant,
        acceptedRunIds: runs.map((record) => record.body.metrics.join.runId),
        metricStatistics,
        gates: combinePublishedGates(runs, compiledPolicy)
      }, context)));
    }
  }
  return records;
}

function resolvedComparisonRecords(captureSet, evaluation, runRecords, context, compiledPolicy) {
  const records = [];
  const bundle = deriveBundleGate(captureSet.buildManifest, captureSet.productionBundleEvidence, compiledPolicy);
  if (!bundle.passed) fail('production-versus-control bundle gate failed');
  for (const backend of context.backends) for (const comparisonKind of ['harness-overhead', 'instrumentation-overhead']) {
    const pairs = evaluation.pairs.filter((pair) => pair.accepted && pair.backend === backend && pair.comparisonKind === comparisonKind);
    const acceptedRuns = runRecords.filter((record) => record.body.metrics.join.backend === backend
      && record.body.metrics.join.comparisonKind === comparisonKind
      && record.body.metrics.status === 'accepted');
    const bundleGate = comparisonKind === 'harness-overhead'
      ? clone(bundle)
      : null;
    const ranks = compiledPolicy.policy.performanceMetricPolicy.instrumentationMiddleRanksZeroBased;
    const middleRankAggregates = comparisonKind === 'instrumentation-overhead'
      ? pairs.map((pair) => {
        const lower = pair.scores.map((score) => score.scoreLower).sort((left, right) => left - right);
        const upper = pair.scores.map((score) => score.scoreUpper).sort((left, right) => left - right);
        const scoreLower = ranks.reduce((sum, rank) => sum + lower[rank], 0) / ranks.length;
        const scoreUpper = ranks.reduce((sum, rank) => sum + upper[rank], 0) / ranks.length;
        return { pairIndex: pair.pairIndex, attemptIndex: pair.attemptIndex, metricSessionId: pair.metricSessionId, scoreLower, scoreUpper, passed: scoreUpper <= 1 };
      })
      : [];
    records.push(createStoredRecord('comparison', createPerformanceEnvelope('performance-comparison', {
      experimentRole: context.experimentRole,
      comparisonFingerprint: context.fingerprints.get(backend),
      comparisonKind,
      backend
    }, {
      experimentId: context.experimentId,
      experimentRole: context.experimentRole,
      comparisonFingerprint: context.fingerprints.get(backend),
      comparisonKind,
      backend,
      acceptedAttempts: pairs.map((pair) => ({
        pairIndex: pair.pairIndex,
        attemptIndex: pair.attemptIndex,
        metricSessionId: pair.metricSessionId,
        baselineRunId: pair.baselineRunId,
        comparedRunId: pair.comparedRunId
      })),
      scores: pairs.flatMap((pair) => pair.scores.map((score) => ({
        pairIndex: pair.pairIndex,
        attemptIndex: pair.attemptIndex,
        metricId: score.metricId,
        scoreLower: score.scoreLower,
        scoreUpper: score.scoreUpper,
        verdict: score.verdict
      }))),
      middleRankAggregates,
      gates: combinePublishedGates(acceptedRuns, compiledPolicy, comparisonKind === 'harness-overhead'
        ? [{
            gateId: 'production-control-bundle-overhead',
            passed: bundle.passed,
            reason: bundle.passed ? null : 'production-control-bundle-overhead',
            authorities: [{
              authorityKind: 'policy-section',
              sectionId: 'performanceBuildEvidencePolicy',
              sectionHash: compiledPolicy.sectionHashes.performanceBuildEvidencePolicy
            }]
          }]
        : []),
      bundleGate,
      disposition: 'accepted'
    }, context)));
  }
  return records;
}

function semanticQualificationProjections(capture, context, compiledPolicy) {
  const boundary = qualificationProjectionBoundary(capture);
  const index = context.rawRowIndex;
  return ['experiment-environment', 'qualification', 'transport'].map((captureKind) => {
    const rawKinds = [];
    for (const rawKind of compiledPolicy.rawKindOrder) {
      const selected = indexedRowsForCapture(index, rawKind, captureKind);
      if (selected.length === 0) continue;
      const body = createRawRowProjectionBody({
        experimentId: context.experimentId,
        boundary,
        rawKind,
        rows: selected
      }, compiledPolicy);
      rawKinds.push({ rawKind, rowCount: body.rows.length, rowProjectionChecksum: canonicalSha256(body) });
    }
    const body = { schemaVersion: 1, experimentId: context.experimentId, boundary, captureKind, rawKinds };
    return { captureKind, checksum: canonicalSha256(body) };
  }).sort((left, right) => compareCodeUnitStrings(`${left.captureKind}:${left.checksum}`, `${right.captureKind}:${right.checksum}`));
}

function resolvedQualificationRecords(captureSet, qualification, context, compiledPolicy) {
  if (!qualification) return [];
  const ledgerEntry = captureSet.performanceLedger.find((entry) => entry.sequence === captureSet.qualificationEvidence.capture.ledgerSequence);
  if (!ledgerEntry) fail('qualification capture does not bind an archived ledger entry');
  const gate = createCapturedGate('qualification-state', true, null, null, ledgerEntry, captureSet, context.collected, compiledPolicy);
  const projections = semanticQualificationProjections(captureSet.qualificationEvidence.capture, context, compiledPolicy);
  const projectionByKind = new Map(projections.map((entry) => [entry.captureKind, entry]));
  const publishedGate = {
    ...gate,
    authorities: gate.authorities.map((authority) => authority.authorityKind === 'capture-projection'
      ? { authorityKind: 'capture-projection', captureKind: authority.captureKind, checksum: projectionByKind.get(authority.captureKind).checksum }
      : authority.authorityKind === 'qualification-capture'
        ? { authorityKind: 'qualification-capture', captureChecksum: qualification.captureChecksum }
        : authority).sort((left, right) => compareCodeUnitStrings(stableStringify(left), stableStringify(right)))
  };
  const validity = qualification.state === 'qualified-webgpu'
    ? { disposition: 'qualified', reason: null }
    : { disposition: 'hardware-capability-unavailable', reason: qualification.unavailabilityBranch };
  return [createStoredRecord('qualification', createPerformanceEnvelope('hardware-qualification', {
    qualificationFingerprint: qualification.qualificationFingerprint
  }, {
    experimentId: context.experimentId,
    experimentRole: context.experimentRole,
    qualificationFingerprint: qualification.qualificationFingerprint,
    backend: 'webgpu',
    state: qualification.state,
    validity,
    rawEvidence: { captureBody: qualification.captureBody, captureChecksum: qualification.captureChecksum, projections },
    derivedEvidence: {
      qualificationFingerprintInput: qualification.qualificationFingerprintInput,
      qualificationFingerprint: qualification.qualificationFingerprint,
      state: qualification.state,
      unavailabilityBranch: qualification.unavailabilityBranch,
      backendExecutionIdentity: qualification.backendExecutionIdentity,
      gates: [publishedGate]
    }
  }, context))];
}

function finalizeResolvedPerformanceCaptureSet(captureSet, compiledPolicy) {
  if (isPlainObject(captureSet) && Object.prototype.hasOwnProperty.call(captureSet, 'evaluationInput')) {
    return finalizeLegacySingleBackendCaptureSet(captureSet, compiledPolicy);
  }
  const collected = collectPerformanceCaptureRows(captureSet, compiledPolicy);
  const manifest = captureSet.manifest;
  const { semanticAuthority, provenance, runtime } = resolvedCaptureProvenance(captureSet, compiledPolicy);
  const backendNames = Object.keys(captureSet.backendFamilies);
  validateBuildCommandLedgerBinding(
    captureSet.buildCommandLedger,
    captureSet.performanceLedger,
    manifest.evaluationContext.sourceSha
  );
  let qualification = null;
  if (manifest.mode === 'ci-core') {
    if (manifest.evaluationContext.experimentRole !== 'ci-integrity' || captureSet.qualificationEvidence || stableStringify(backendNames) !== stableStringify(['canvas2d'])) {
      fail('ci-core finalization requires Canvas only and no qualification child');
    }
  } else {
    if (manifest.evaluationContext.experimentRole !== 'reference-comparison' || !captureSet.qualificationEvidence) {
      fail('selected-reference finalization requires one qualification capture');
    }
  }
  const evaluatorInput = sealPerformanceEvaluatorInput({
    evaluationContext: manifest.evaluationContext,
    semanticAuthority,
    finalizationPurpose: manifest.finalizationPurpose,
    evidenceProvenance: provenance,
    buildManifest: captureSet.buildManifest,
    productionBundleEvidence: captureSet.productionBundleEvidence,
    ledger: captureSet.performanceLedger,
    pairPlans: backendNames.map((backend) => captureSet.backendFamilies[backend].pairPlan),
    qualificationBody: captureSet.qualificationEvidence?.capture.captureBody ?? null,
    rawInput: collected.rawArchive.rawEvidenceBody
  }, compiledPolicy, true);
  const evaluation = evaluateSealedPerformanceExperiment(evaluatorInput, compiledPolicy, collected.rawArchive);
  if (manifest.mode === 'selected-reference') {
    qualification = deriveQualificationCapture(
      captureSet.qualificationEvidence.capture,
      captureSet,
      compiledPolicy,
      evaluation.initialEnvironment
    );
    const expectedBackends = qualification.state === 'qualified-webgpu' ? ['canvas2d', 'webgpu'] : ['canvas2d'];
    if (stableStringify(backendNames) !== stableStringify(expectedBackends)) {
      fail('selected-reference backend families do not match the derived qualification state');
    }
  }
  validateRunBackendExecutionIdentities(evaluation, collected, qualification);
  const backendEvaluations = deriveResolvedBackendEvaluations(evaluation, captureSet, qualification, compiledPolicy);
  const fingerprints = new Map(backendEvaluations.map((entry) => [entry.backend, entry.comparisonFingerprint]));
  const allocations = new Map(backendEvaluations.map((entry) => [entry.backend, entry.allocationEvidence]));
  const context = {
    experimentId: manifest.evaluationContext.experimentId,
    experimentRole: manifest.evaluationContext.experimentRole,
    semanticAuthority,
    evidenceProvenance: provenance,
    fingerprints,
    allocations,
    backends: backendNames,
    rawEvidenceChecksum: evaluation.rawEvidenceChecksum,
    pairLoopStart: evaluation.pairLoopStart,
    initialEnvironment: evaluation.initialEnvironment,
    captureProjections: collected.captureProjections,
    collected,
    rawRowIndex: createRawRowIndex(collected.rawArchive.rawEvidenceBody),
    rawProjectionBodies: new Map(),
    projectionBoundaryByRun: new Map()
  };
  const runs = resolvedRunRecords(evaluation, context, compiledPolicy);
  const aggregates = resolvedAggregateRecords(runs, context, compiledPolicy);
  const comparisons = resolvedComparisonRecords(captureSet, evaluation, runs, context, compiledPolicy);
  const qualifications = resolvedQualificationRecords(captureSet, qualification, context, compiledPolicy);
  const topology = actualTopology(captureSet, evaluation, { aggregates, comparisons, qualifications });
  assertCompleteResolvedTopology(captureSet, evaluation, topology, compiledPolicy);
  const publicationEligible = manifest.finalizationPurpose === 'publication' && provenance.kind === 'runtime-capture';
  const evaluationBody = createPerformanceEvaluationBody({
    experimentId: context.experimentId,
    experimentRole: context.experimentRole,
    finalizationPurpose: manifest.finalizationPurpose,
    ledger: evaluation.ledger,
    retryTopology: evaluation.retryTopology,
    backendEvaluations,
    qualificationFingerprint: qualification?.qualificationFingerprint ?? null,
    failureDisposition: qualification?.state === 'hardware-capability-unavailable' ? 'qualification-unavailable' : null,
    rawEvidenceChecksum: evaluation.rawEvidenceChecksum,
    evidenceProvenance: provenance,
    topology,
    publicationEligible
  });
  const finalizedEvaluation = deepFreeze({ ...evaluationBody, checksum: canonicalSha256(evaluationBody) });
  const policyLeaves = createPolicyLeaves(compiledPolicy);
  const environmentLeaves = [createStoredRecord('environment-leaf', {
    schemaVersion: 1,
    environmentHash: canonicalSha256(evaluation.initialEnvironment),
    value: evaluation.initialEnvironment
  })];
  const childManifest = createStoredRecord('experiment-child-manifest', {
    schemaVersion: 1,
    experimentId: context.experimentId,
    runReferences: sortedReferences(runs),
    aggregateReferences: sortedReferences(aggregates),
    comparisonReferences: sortedReferences(comparisons),
    qualificationReferences: sortedReferences(qualifications),
    rawKindManifestReferences: sortedReferences(collected.rawArchive.rawKindManifests)
  });
  const report = createPerformanceEnvelope('performance-experiment', { experimentId: context.experimentId }, {
    experimentId: context.experimentId,
    experimentRole: context.experimentRole,
    status: 'complete',
    publicationEligible,
    finalizationPurpose: manifest.finalizationPurpose,
    evidenceProvenance: provenance,
    sourceSha: manifest.evaluationContext.sourceSha,
    ledger: evaluation.ledger,
    pairPlans: backendNames.map((backend) => captureSet.backendFamilies[backend].pairPlan),
    retryTopology: evaluation.retryTopology,
    policyIdentity: { schemaVersion: compiledPolicy.policy.schemaVersion, policyHash: compiledPolicy.policyHash, sectionHashes: compiledPolicy.sectionHashes },
    reset: semanticAuthority.reset,
    seed: semanticAuthority.seed,
    pairLoopStart: evaluation.pairLoopStart,
    initialEnvironment: evaluation.initialEnvironment,
    buildManifest: captureSet.buildManifest,
    productionBundleEvidence: captureSet.productionBundleEvidence,
    comparisonFingerprints: projectComparisonFingerprints(backendEvaluations),
    qualificationState: projectQualificationState(qualifications[0] ?? null),
    allocationStates: projectAllocationStates(backendEvaluations),
    counts: topology,
    finalization: { warnings: [] },
    childManifestHash: childManifest.hash,
    evaluationChecksum: finalizedEvaluation.checksum,
    rawEvidenceChecksum: evaluation.rawEvidenceChecksum
  }, context);
  const parent = createStoredRecord(manifest.mode === 'ci-core' ? 'ci-experiment-parent' : 'reference-experiment-parent', {
    schemaVersion: 1,
    report,
    captureIdentity: coreCaptureIdentity(runtime),
    producers: uniqueProducerList(runtime),
    childManifest: recordReference(childManifest),
    policyReferences: sortedReferences(policyLeaves),
    environmentReferences: sortedReferences(environmentLeaves)
  });
  const recordsBeforeParent = [
    ...runs, ...aggregates, ...comparisons, ...qualifications,
    ...collected.rawArchive.rawKindManifests, ...collected.rawArchive.rawChunks,
    ...collected.rawArchive.dictionaries, ...policyLeaves, ...environmentLeaves,
    childManifest
  ].sort((left, right) => compareReferences(recordReference(left), recordReference(right)));
  if (new Set(recordsBeforeParent.map((record) => `${record.kind}:${record.hash}`)).size !== recordsBeforeParent.length) {
    fail('resolved recordsBeforeParent contains duplicate kind-bound records');
  }
  return deepFreeze({
    evaluation: finalizedEvaluation,
    topology,
    publicationEligible,
    objects: {
      runs, aggregates, comparisons, qualifications,
      rawKindManifests: collected.rawArchive.rawKindManifests,
      rawChunks: collected.rawArchive.rawChunks,
      dictionaries: collected.rawArchive.dictionaries,
      policyLeaves, environmentLeaves, childManifest, parent
    },
    recordsBeforeParent,
    rootReference: recordReference(parent),
    experimentChecksum: parent.hash
  });
}

export function finalizePerformanceExperiment(input, compiledPolicy = loadBaselinePolicy()) {
  assertExactKeys(input, ['captureSet'], 'performance finalizer input');
  return finalizeResolvedPerformanceCaptureSet(input.captureSet, compiledPolicy);
}

export function finalizeCiCanvasPerformanceExperiment(input, compiledPolicy = loadBaselinePolicy()) {
  assertExactKeys(input, ['captureSet'], 'CI Canvas finalizer input');
  if (input.captureSet?.manifest?.mode !== 'ci-core') fail('CI Canvas finalizer requires a ci-core resolved capture set');
  if (stableStringify(Object.keys(input.captureSet.backendFamilies)) !== stableStringify(['canvas2d'])) {
    fail('CI Canvas finalizer requires exactly the Canvas backend family');
  }
  return finalizePerformanceExperiment(input, compiledPolicy);
}

export function finalizeReferencePerformanceExperiment(input, compiledPolicy = loadBaselinePolicy()) {
  assertExactKeys(input, ['captureSet'], 'selected-reference finalizer input');
  if (input.captureSet?.manifest?.mode !== 'selected-reference') fail('selected-reference finalizer requires a selected-reference resolved capture set');
  return finalizePerformanceExperiment(input, compiledPolicy);
}

export function reconstructPerformanceEvaluationBody(parent, children, compiledPolicy = loadBaselinePolicy()) {
  validateStoredRecord(parent, 'performance parent');
  if (!['ci-experiment-parent', 'reference-experiment-parent'].includes(parent.kind)) {
    fail('performance parent kind is invalid');
  }
  assertExactKeys(parent.body, [
    'schemaVersion', 'report', 'captureIdentity', 'producers', 'childManifest',
    'policyReferences', 'environmentReferences'
  ], 'performance parent body');
  if (parent.body.schemaVersion !== 1) fail('performance parent body schemaVersion must be 1');
  assertExactKeys(children, [
    'runs', 'aggregates', 'comparisons', 'qualifications', 'rawKindManifests',
    'rawChunks', 'dictionaries', 'policyLeaves', 'environmentLeaves', 'childManifest'
  ], 'performance evaluation reconstruction children');
  for (const key of [
    'runs', 'aggregates', 'comparisons', 'qualifications', 'rawKindManifests',
    'rawChunks', 'dictionaries', 'policyLeaves', 'environmentLeaves'
  ]) assertArray(children[key], `performance evaluation reconstruction children.${key}`);
  validateStoredRecord(children.childManifest, 'performance evaluation reconstruction childManifest');
  for (const [key, kind] of [
    ['runs', 'run'], ['aggregates', 'aggregate'], ['comparisons', 'comparison'],
    ['qualifications', 'qualification'], ['rawKindManifests', 'raw-kind-manifest'],
    ['rawChunks', 'raw-chunk'], ['dictionaries', 'dictionary'],
    ['policyLeaves', 'policy-leaf'], ['environmentLeaves', 'environment-leaf']
  ]) {
    children[key].forEach((record, index) => {
      validateStoredRecord(record, `performance reconstruction ${key}[${index}]`);
      if (record.kind !== kind) fail(`performance reconstruction ${key}[${index}] has kind ${record.kind}, expected ${kind}`);
    });
  }
  if (children.childManifest.kind !== 'experiment-child-manifest') fail('performance childManifest kind is invalid');
  const report = parent.body.report;
  assertExactKeys(report, [
    'schemaVersion', 'kind', 'evidenceId', 'generatedAt', 'repository', 'environment',
    'captureProvenance', 'inputs', 'metrics', 'warnings'
  ], 'performance parent report');
  if (report.kind !== 'performance-experiment' || report.schemaVersion !== 1
    || stableStringify(report.warnings) !== stableStringify([])) {
    fail('performance parent report envelope is invalid');
  }
  const metrics = report.metrics;
  assertObject(metrics, 'performance parent report metrics');
  assertExactKeys(metrics, [
    'experimentId', 'experimentRole', 'status', 'publicationEligible', 'finalizationPurpose',
    'evidenceProvenance', 'sourceSha', 'ledger', 'pairPlans', 'retryTopology',
    'policyIdentity', 'reset', 'seed', 'pairLoopStart', 'initialEnvironment',
    'buildManifest', 'productionBundleEvidence', 'comparisonFingerprints',
    'qualificationState', 'allocationStates', 'counts', 'finalization',
    'childManifestHash', 'evaluationChecksum', 'rawEvidenceChecksum'
  ], 'performance parent report metrics');
  if (metrics.status !== 'complete') fail('performance parent status must be complete');
  if (stableStringify(metrics.finalization) !== stableStringify({ warnings: [] })) {
    fail('performance parent finalization must contain no unresolved warnings');
  }
  const expectedPolicyIdentity = {
    schemaVersion: compiledPolicy.policy.schemaVersion,
    policyHash: compiledPolicy.policyHash,
    sectionHashes: compiledPolicy.sectionHashes
  };
  if (stableStringify(metrics.policyIdentity) !== stableStringify(expectedPolicyIdentity)) {
    fail('performance parent policy identity does not bind the compiled policy');
  }
  const rawEvidenceBody = reconstructPerformanceRawEvidence({
    rawKindManifests: children.rawKindManifests,
    rawChunks: children.rawChunks,
    dictionaries: children.dictionaries
  }, compiledPolicy);
  const rawEvidenceChecksum = canonicalSha256(rawEvidenceBody);
  if (rawEvidenceChecksum !== metrics.rawEvidenceChecksum) fail('reconstructed raw evidence checksum differs from the parent');
  const semanticAuthority = validateSemanticAuthority({
    generatedAt: report.generatedAt,
    repository: report.repository,
    environment: report.environment,
    inputs: report.inputs,
    reset: metrics.reset,
    seed: metrics.seed
  });
  const evaluatorInput = createPerformanceEvaluatorInput({
    evaluationContext: {
      experimentId: metrics.experimentId,
      experimentRole: metrics.experimentRole,
      sourceSha: metrics.sourceSha,
      policyHash: metrics.policyIdentity.policyHash
    },
    semanticAuthority,
    finalizationPurpose: metrics.finalizationPurpose,
    evidenceProvenance: metrics.evidenceProvenance,
    buildManifest: metrics.buildManifest,
    productionBundleEvidence: metrics.productionBundleEvidence,
    ledger: metrics.ledger,
    pairPlans: metrics.pairPlans,
    qualificationBody: children.qualifications[0]?.body.metrics.rawEvidence.captureBody ?? null,
    rawInput: createEvaluatorRawInput(rawEvidenceBody, compiledPolicy)
  }, compiledPolicy);
  const rerun = evaluatePerformanceExperiment(evaluatorInput, compiledPolicy);
  if (metrics.pairLoopStart !== rerun.pairLoopStart
    || stableStringify(metrics.initialEnvironment) !== stableStringify(rerun.initialEnvironment)
    || stableStringify(metrics.retryTopology) !== stableStringify(rerun.retryTopology)) {
    fail('performance parent loop boundary, environment, or retry topology does not reconstruct from archived authority');
  }
  const backendFamilies = Object.fromEntries(metrics.pairPlans.map((pairPlan) => [pairPlan.backend, { pairPlan }]));
  const captureSet = {
    manifest: {
      evaluationContext: evaluatorInput.evaluationContext,
      semanticAuthority,
      finalizationPurpose: metrics.finalizationPurpose,
      evidenceProvenance: metrics.evidenceProvenance
    },
    buildManifest: metrics.buildManifest,
    productionBundleEvidence: metrics.productionBundleEvidence,
    performanceLedger: metrics.ledger,
    backendFamilies
  };
  const collected = {
    rawArchive: {
      rawEvidenceBody,
      rawEvidenceChecksum,
      rawKindManifests: children.rawKindManifests,
      rawChunks: children.rawChunks,
      dictionaries: children.dictionaries
    },
    captureProjections: evaluatorCaptureProjections(rawEvidenceBody, compiledPolicy)
  };
  let qualification = null;
  if (children.qualifications.length > 0) {
    if (children.qualifications.length !== 1) fail('performance reconstruction requires at most one qualification child');
    const rawEvidence = children.qualifications[0].body.metrics.rawEvidence;
    assertExactKeys(rawEvidence, ['captureBody', 'captureChecksum', 'projections'], 'qualification child rawEvidence');
    const captureBody = rawEvidence.captureBody;
    const qualificationCapture = {
      experimentId: captureBody.experimentId,
      sourceSha: captureBody.sourceSha,
      policyHash: captureBody.policyHash,
      ledgerSequence: captureBody.ledgerSequence,
      observationBoundaryId: captureBody.observationBoundaryId,
      captureBody,
      captureBodyChecksum: rawEvidence.captureChecksum,
      checksum: rawEvidence.captureChecksum,
      rawKinds: rawEvidenceBody.rawKinds.map((entry) => ({
        rawKind: entry.rawKind,
        rows: entry.rows.filter((row) => row.captureKind === 'qualification')
      })).filter((entry) => entry.rows.length > 0)
    };
    captureSet.qualificationEvidence = { capture: qualificationCapture };
    qualification = deriveQualificationCapture(qualificationCapture, captureSet, compiledPolicy, rerun.initialEnvironment);
  }
  validateRunBackendExecutionIdentities(rerun, collected, qualification);
  const backendEvaluations = deriveResolvedBackendEvaluations(rerun, captureSet, qualification, compiledPolicy);
  if (stableStringify(projectComparisonFingerprints(backendEvaluations)) !== stableStringify(metrics.comparisonFingerprints)
    || stableStringify(projectAllocationStates(backendEvaluations)) !== stableStringify(metrics.allocationStates)) {
    fail('performance parent backend projections do not reconstruct from raw children');
  }
  const reconstructionContext = {
    experimentId: metrics.experimentId,
    experimentRole: metrics.experimentRole,
    semanticAuthority,
    evidenceProvenance: metrics.evidenceProvenance,
    fingerprints: new Map(backendEvaluations.map((entry) => [entry.backend, entry.comparisonFingerprint])),
    allocations: new Map(backendEvaluations.map((entry) => [entry.backend, entry.allocationEvidence])),
    backends: Object.keys(backendFamilies),
    rawEvidenceChecksum,
    pairLoopStart: rerun.pairLoopStart,
    initialEnvironment: rerun.initialEnvironment,
    captureProjections: collected.captureProjections,
    collected,
    rawRowIndex: createRawRowIndex(collected.rawArchive.rawEvidenceBody),
    rawProjectionBodies: new Map(),
    projectionBoundaryByRun: new Map()
  };
  const expectedRuns = resolvedRunRecords(rerun, reconstructionContext, compiledPolicy);
  const expectedAggregates = resolvedAggregateRecords(expectedRuns, reconstructionContext, compiledPolicy);
  const expectedComparisons = resolvedComparisonRecords(captureSet, rerun, expectedRuns, reconstructionContext, compiledPolicy);
  const expectedQualifications = resolvedQualificationRecords(captureSet, qualification, reconstructionContext, compiledPolicy);
  if (stableStringify(metrics.qualificationState) !== stableStringify(projectQualificationState(expectedQualifications[0] ?? null))) {
    fail('performance parent qualificationState does not reconstruct from its qualification child');
  }
  for (const [label, actual, expected] of [
    ['runs', children.runs, expectedRuns],
    ['aggregates', children.aggregates, expectedAggregates],
    ['comparisons', children.comparisons, expectedComparisons],
    ['qualifications', children.qualifications, expectedQualifications]
  ]) {
    if (stableStringify(actual) !== stableStringify(expected)) fail(`performance ${label} do not reconstruct byte-for-byte from raw authority`);
  }
  const expectedPolicyLeaves = createPolicyLeaves(compiledPolicy);
  if (stableStringify(children.policyLeaves) !== stableStringify(expectedPolicyLeaves)) {
    fail('performance policy leaves do not reconstruct from the compiled policy');
  }
  const expectedEnvironmentLeaves = [createStoredRecord('environment-leaf', {
    schemaVersion: 1,
    environmentHash: canonicalSha256(rerun.initialEnvironment),
    value: rerun.initialEnvironment
  })];
  if (stableStringify(children.environmentLeaves) !== stableStringify(expectedEnvironmentLeaves)) {
    fail('performance environment leaves do not reconstruct from semantic and capture authority');
  }
  const expectedChildManifest = createStoredRecord('experiment-child-manifest', {
    schemaVersion: 1,
    experimentId: metrics.experimentId,
    runReferences: sortedReferences(expectedRuns),
    aggregateReferences: sortedReferences(expectedAggregates),
    comparisonReferences: sortedReferences(expectedComparisons),
    qualificationReferences: sortedReferences(expectedQualifications),
    rawKindManifestReferences: sortedReferences(children.rawKindManifests)
  });
  if (stableStringify(children.childManifest) !== stableStringify(expectedChildManifest)) {
    fail('performance child manifest does not reconstruct from actual children');
  }
  if (metrics.childManifestHash !== expectedChildManifest.hash) {
    fail('performance parent childManifestHash does not match the reconstructed child manifest');
  }
  const ledgerDetails = validatePerformanceLedgerDetails(metrics.ledger, compiledPolicy);
  const reconstructedTopology = {
    state: 'complete',
    transportProbeCount: metrics.ledger.filter((entry) => entry.operationId === 'generic-transport-spawn'
      || (entry.operationId === 'electron-harness-spawn' && entry.purpose === 'transport-probe')).length,
    buildCount: metrics.ledger.filter((entry) => entry.operationId === 'build-spawn').length,
    hardwareProbeCount: metrics.ledger.filter((entry) => entry.operationId === 'electron-harness-spawn'
      && entry.purpose === 'qualification-probe').length,
    metricSessionCount: ledgerDetails.completedSessions.length,
    resetCount: rerun.ledger.filter((entry) => entry.operationId === 'internal-reset').length,
    sentinelPairCount: children.comparisons.filter((record) => record.body.metrics.comparisonKind === 'harness-overhead')
      .reduce((total, record) => total + record.body.metrics.acceptedAttempts.length, 0),
    instrumentationPairCount: children.comparisons.filter((record) => record.body.metrics.comparisonKind === 'instrumentation-overhead')
      .reduce((total, record) => total + record.body.metrics.acceptedAttempts.length, 0),
    measurementLaunchCount: metrics.ledger.filter((entry) => ['electron-harness-spawn', 'production-sentinel-spawn'].includes(entry.operationId)
      && entry.purpose === 'measurement-side').length,
    manifestRunCount: children.runs.length,
    acceptedRunCount: children.runs.filter((record) => record.body.metrics.status === 'accepted').length,
    aggregateCount: children.aggregates.length,
    comparisonCount: children.comparisons.length,
    qualificationCount: children.qualifications.length
  };
  if (stableStringify(reconstructedTopology) !== stableStringify(metrics.counts)) {
    fail('performance topology does not reconstruct from actual child arrays and probe types');
  }
  if (children.runs.length !== rerun.runs.length
    || children.comparisons.length !== backendEvaluations.length * 2
    || children.qualifications.length !== Number(qualification !== null)) {
    fail('performance child array cardinalities differ from the evaluator rerun');
  }
  if (stableStringify(parent.body.childManifest) !== stableStringify(recordReference(children.childManifest))
    || stableStringify(parent.body.policyReferences) !== stableStringify(sortedReferences(children.policyLeaves))
    || stableStringify(parent.body.environmentReferences) !== stableStringify(sortedReferences(children.environmentLeaves))) {
    fail('performance parent references do not match reconstructed leaves and child manifest');
  }
  const evaluationBody = createPerformanceEvaluationBody({
    experimentId: metrics.experimentId,
    experimentRole: metrics.experimentRole,
    finalizationPurpose: metrics.finalizationPurpose,
    ledger: rerun.ledger,
    retryTopology: rerun.retryTopology,
    backendEvaluations,
    qualificationFingerprint: qualification?.qualificationFingerprint ?? null,
    failureDisposition: qualification?.state === 'hardware-capability-unavailable' ? 'qualification-unavailable' : null,
    rawEvidenceChecksum,
    evidenceProvenance: metrics.evidenceProvenance,
    topology: reconstructedTopology,
    publicationEligible: metrics.publicationEligible
  });
  if (canonicalSha256(evaluationBody) !== metrics.evaluationChecksum) {
    fail('performance evaluation checksum does not match its reconstructed body');
  }
  return evaluationBody;
}

function validateStoredRecord(record, label) {
  assertExactKeys(record, ['kind', 'body', 'hash', 'canonicalBodyBytes'], label);
  assertString(record.kind, `${label}.kind`);
  assertSha(record.hash, `${label}.hash`);
  assertSafeInteger(record.canonicalBodyBytes, `${label}.canonicalBodyBytes`, 0);
  if (record.hash !== canonicalSha256({ kind: record.kind, body: record.body })) fail(`${label} hash mismatch`);
  if (record.canonicalBodyBytes !== Buffer.byteLength(stableStringify(record.body), 'utf8')) fail(`${label} canonical byte count mismatch`);
}

export function requirePublishablePerformanceEvidence(finalized, compiledPolicy = loadBaselinePolicy()) {
  if (!isPlainObject(finalized) || !isPlainObject(finalized.objects) || !isPlainObject(finalized.objects.parent)) {
    if (finalized?.evidenceProvenance?.kind && finalized.evidenceProvenance.kind !== 'runtime-capture') {
      fail('synthetic or non-runtime performance evidence cannot be published');
    }
    fail('performance evidence requires a complete semantic topology before publication');
  }
  assertExactKeys(finalized, [
    'evaluation', 'topology', 'publicationEligible', 'objects', 'recordsBeforeParent',
    'rootReference', 'experimentChecksum'
  ], 'finalized performance evidence');
  if (finalized.evaluation.finalizationPurpose !== 'publication'
    || finalized.evaluation.evidenceProvenance?.kind !== 'runtime-capture') {
    fail('capacity, synthetic, or non-runtime performance evidence cannot be published');
  }
  if (finalized.publicationEligible !== true || finalized.evaluation.publicationEligible !== true || finalized.topology.state !== 'complete') {
    fail('performance evidence requires a complete semantic topology before publication');
  }
  const parent = finalized.objects?.parent;
  assertExactKeys(finalized.objects, [
    'runs', 'aggregates', 'comparisons', 'qualifications', 'rawKindManifests',
    'rawChunks', 'dictionaries', 'policyLeaves', 'environmentLeaves',
    'childManifest', 'parent'
  ], 'finalized performance objects');
  if (!parent || !['ci-experiment-parent', 'reference-experiment-parent'].includes(parent.kind)) {
    fail('performance evidence requires a role-specific experiment parent');
  }
  for (const key of [
    'runs', 'aggregates', 'comparisons', 'qualifications', 'rawKindManifests',
    'rawChunks', 'dictionaries', 'policyLeaves', 'environmentLeaves'
  ]) assertArray(finalized.objects[key], `finalized performance objects.${key}`);
  const expectedBeforeParent = [
    ...finalized.objects.runs,
    ...finalized.objects.aggregates,
    ...finalized.objects.comparisons,
    ...finalized.objects.qualifications,
    ...finalized.objects.rawKindManifests,
    ...finalized.objects.rawChunks,
    ...finalized.objects.dictionaries,
    ...finalized.objects.policyLeaves,
    ...finalized.objects.environmentLeaves,
    finalized.objects.childManifest
  ].sort((left, right) => compareReferences(recordReference(left), recordReference(right)));
  if (stableStringify(expectedBeforeParent.map(recordReference)) !== stableStringify(finalized.recordsBeforeParent.map(recordReference))) {
    fail('recordsBeforeParent is not the complete transitive closure of finalized objects');
  }
  const allRecords = [...finalized.recordsBeforeParent, parent];
  allRecords.forEach((record, index) => validateStoredRecord(record, `finalized performance record[${index}]`));
  const expectedOrder = [...finalized.recordsBeforeParent].sort((left, right) => compareReferences(recordReference(left), recordReference(right)));
  if (stableStringify(expectedOrder.map(recordReference)) !== stableStringify(finalized.recordsBeforeParent.map(recordReference))) {
    fail('recordsBeforeParent is not in canonical reference order');
  }
  if (new Set(finalized.recordsBeforeParent.map((record) => `${record.kind}:${record.hash}`)).size !== finalized.recordsBeforeParent.length) {
    fail('recordsBeforeParent contains duplicate records');
  }
  if (finalized.experimentChecksum !== parent.hash
    || stableStringify(finalized.rootReference) !== stableStringify(recordReference(parent))) {
    fail('performance experiment root reference does not match its parent');
  }
  if (parent.body.report.metrics.childManifestHash !== finalized.objects.childManifest.hash
    || parent.body.childManifest.hash !== finalized.objects.childManifest.hash) {
    fail('performance child manifest hash does not match its parent');
  }
  const childBody = finalized.objects.childManifest.body;
  if (stableStringify(childBody.runReferences) !== stableStringify(sortedReferences(finalized.objects.runs))
    || stableStringify(childBody.aggregateReferences) !== stableStringify(sortedReferences(finalized.objects.aggregates))
    || stableStringify(childBody.comparisonReferences) !== stableStringify(sortedReferences(finalized.objects.comparisons))
    || stableStringify(childBody.qualificationReferences) !== stableStringify(sortedReferences(finalized.objects.qualifications))
    || stableStringify(childBody.rawKindManifestReferences) !== stableStringify(sortedReferences(finalized.objects.rawKindManifests))) {
    fail('performance child manifest references do not match finalized child records');
  }
  if (stableStringify(parent.body.policyReferences) !== stableStringify(sortedReferences(finalized.objects.policyLeaves))
    || stableStringify(parent.body.environmentReferences) !== stableStringify(sortedReferences(finalized.objects.environmentLeaves))) {
    fail('performance parent leaf references do not match finalized leaves');
  }
  if (stableStringify(parent.body.report.metrics.counts) !== stableStringify(finalized.topology)
    || parent.body.report.metrics.finalizationPurpose !== finalized.evaluation.finalizationPurpose
    || stableStringify(parent.body.report.metrics.evidenceProvenance) !== stableStringify(finalized.evaluation.evidenceProvenance)) {
    fail('performance parent report does not match the sealed evaluation authority');
  }
  const reconstructed = reconstructPerformanceEvaluationBody(parent, {
    runs: finalized.objects.runs,
    aggregates: finalized.objects.aggregates,
    comparisons: finalized.objects.comparisons,
    qualifications: finalized.objects.qualifications,
    rawKindManifests: finalized.objects.rawKindManifests,
    rawChunks: finalized.objects.rawChunks,
    dictionaries: finalized.objects.dictionaries,
    policyLeaves: finalized.objects.policyLeaves,
    environmentLeaves: finalized.objects.environmentLeaves,
    childManifest: finalized.objects.childManifest
  }, compiledPolicy);
  if (canonicalSha256(reconstructed) !== finalized.evaluation.checksum
    || finalized.evaluation.checksum !== parent.body.report.metrics.evaluationChecksum) {
    fail('performance evaluation checksum does not reconstruct from the archived graph');
  }
  return finalized;
}

function evaluatorCaptureProjections(rawInput, compiledPolicy) {
  const groups = new Map();
  for (const rawEntry of rawInput.rawKinds) {
    for (const row of rawEntry.rows) {
      const scopeKind = row.scopeKind;
      const scopeId = row.scopeId;
      const groupKey = stableStringify([row.captureKind, scopeKind, scopeId, rawEntry.rawKind]);
      const group = groups.get(groupKey) ?? {
        captureKind: row.captureKind,
        scopeKind,
        scopeId,
        rawKind: rawEntry.rawKind,
        rows: []
      };
      group.rows.push(row);
      groups.set(groupKey, group);
    }
  }
  return [...groups.values()].map((group) => {
    const encoded = encodePerformanceEvidence(group.rawKind, group.rows, compiledPolicy);
    const captureChecksum = canonicalSha256({
      captureKind: group.captureKind,
      scopeKind: group.scopeKind,
      scopeId: group.scopeId
    });
    return {
      captureKind: group.captureKind,
      captureChecksum,
      scopeKind: group.scopeKind,
      scopeId: group.scopeId,
      rawKind: group.rawKind,
      rowCount: group.rows.length,
      encodedChecksum: encoded.checksum,
      projectionChecksum: canonicalSha256({
        captureKind: group.captureKind,
        captureChecksum,
        rawKind: group.rawKind,
        encodedChecksum: encoded.checksum
      })
    };
  }).sort((left, right) => compareCodeUnitStrings(
    `${left.captureKind}:${left.captureChecksum}:${left.rawKind}`,
    `${right.captureKind}:${right.captureChecksum}:${right.rawKind}`
  ));
}

function validateEvaluatorPairPlanExecution(ledgerDetails, pairPlans) {
  const plans = new Map(pairPlans.map((pairPlan) => [pairPlan.backend, pairPlan]));
  for (const session of ledgerDetails.completedSessions) {
    const pairPlan = plans.get(session.backend);
    const pair = pairPlan?.pairs.find((candidate) => candidate.comparisonKind === session.comparisonKind
      && candidate.pairIndex === session.attempt.pairIndex);
    const attempt = pair?.attempts[session.attempt.attemptIndex - 1];
    if (!attempt || attempt.metricSessionId !== session.metricSessionId) {
      fail('performance evaluator ledger session does not bind its preallocated pair-plan attempt');
    }
    const expectedLaunches = attempt.launches.map((launch) => ({
      comparisonSide: launch.comparisonSide,
      buildVariant: launch.buildVariant
    }));
    const actualLaunches = session.launches.map((launch) => ({
      comparisonSide: launch.comparisonSide,
      buildVariant: launch.buildVariant
    }));
    if (stableStringify(actualLaunches) !== stableStringify(expectedLaunches)) {
      fail('performance evaluator ledger launch order differs from its pair plan');
    }
  }
}

function evaluateSealedPerformanceExperiment(sealed, compiledPolicy, canonicalRawArchive = null) {
  const ledgerDetails = validatePerformanceLedgerDetails(sealed.ledger, compiledPolicy);
  if (!ledgerDetails.canonical) fail('full performance evaluator requires the canonical global ledger');
  validateEvaluatorPairPlanExecution(ledgerDetails, sealed.pairPlans);
  const backends = sealed.pairPlans.map((pairPlan) => pairPlan.backend);
  if (sealed.evaluationContext.experimentRole === 'ci-integrity') {
    if (sealed.qualificationBody !== null || stableStringify(backends) !== stableStringify(['canvas2d'])) {
      fail('CI full evaluator requires Canvas only and no qualification body');
    }
  } else {
    if (sealed.qualificationBody === null) fail('reference full evaluator requires a qualification body');
    const expectedBackends = sealed.qualificationBody.selectionResult.qualificationState === 'qualified-webgpu'
      ? ['canvas2d', 'webgpu']
      : ['canvas2d'];
    if (stableStringify(backends) !== stableStringify(expectedBackends)) {
      fail('reference full evaluator backends differ from the qualification result');
    }
  }
  const rowsByRawKind = Object.fromEntries(sealed.rawInput.rawKinds.map((entry) => [entry.rawKind, entry.rows]));
  const rawArchive = canonicalRawArchive ?? createPerformanceRawArchive({
    experimentId: sealed.evaluationContext.experimentId,
    rowsByRawKind
  }, compiledPolicy);
  if (canonicalRawArchive !== null
    && canonicalSha256(canonicalRawArchive.rawEvidenceBody) !== canonicalRawArchive.rawEvidenceChecksum) {
    fail('trusted performance raw archive checksum is invalid');
  }
  if (canonicalSha256(sealed.rawInput) !== rawArchive.rawEvidenceChecksum) {
    fail('full performance evaluator raw input is not the canonical experiment archive preimage');
  }
  const captureSet = {
    manifest: {
      evaluationContext: sealed.evaluationContext,
      semanticAuthority: sealed.semanticAuthority,
      finalizationPurpose: sealed.finalizationPurpose,
      evidenceProvenance: sealed.evidenceProvenance
    },
    performanceLedger: sealed.ledger,
    backendFamilies: Object.fromEntries(sealed.pairPlans.map((pairPlan) => [pairPlan.backend, { pairPlan }]))
  };
  return evaluateCapturedPerformanceEvidence(captureSet, {
    rawArchive,
    captureProjections: evaluatorCaptureProjections(sealed.rawInput, compiledPolicy)
  }, compiledPolicy);
}

export function evaluatePerformanceExperiment(input, compiledPolicy = loadBaselinePolicy()) {
  if (isPlainObject(input) && Object.prototype.hasOwnProperty.call(input, 'evaluationContext')) {
    const sealed = createPerformanceEvaluatorInput(input, compiledPolicy);
    return evaluateSealedPerformanceExperiment(sealed, compiledPolicy);
  }
  return evaluateSingleBackendPerformanceExperiment(input, compiledPolicy);
}
