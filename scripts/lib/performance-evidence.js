import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalSha256, stableStringify, validateCaptureProvenance } from './baseline-report.js';

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
const EXPECTED_PROCESS_CLASSES = [
  'Browser', 'Tab', 'Utility', 'Zygote', 'Sandbox helper', 'GPU',
  'Pepper Plugin', 'Pepper Plugin Broker', 'Unknown'
];
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
  'frame-request': ['runId', 'measurementEpochId', 'sourceSequence', 'operationId', 'sourceLocationId', 'requestOrdinal'],
  'lifecycle-request': ['runId', 'executionId', 'lifecyclePhase', 'phaseSequence', 'operationId', 'sourceLocationId', 'requestOrdinal'],
  'timing-span': ['runId', 'measurementEpochId', 'sourceSequence', 'metricId'],
  'cpu-sample': ['runId', 'ordinal']
});
const EXPECTED_ALLOCATION_COVERAGE = [
  { operationId: 'video-frame-image-bitmap-request', sourceLocationId: 'video-session:create-image-bitmap', carrier: 'frame-request', cardinality: 'per-frame', byteSemantics: 'rgba-transfer-footprint' },
  { operationId: 'uniform-float32-array', sourceLocationId: 'webgpu-driver:uniform-float32-array', carrier: 'frame-request', cardinality: 'per-frame', byteSemantics: 'requested-byte-length' },
  { operationId: 'gpu-buffer-request', sourceLocationId: 'webgpu-driver:create-buffer', carrier: 'lifecycle-request', lifecyclePhase: 'startup', cardinality: 1, byteSemantics: 'descriptor-size' },
  { operationId: 'gpu-texture-request', sourceLocationId: 'webgpu-driver:create-texture', carrier: 'lifecycle-request', lifecyclePhase: 'startup', cardinality: 3, byteSemantics: 'logical-texel-footprint' },
  { operationId: 'bind-group-create', sourceLocationId: 'webgpu-driver:create-bind-group', carrier: 'frame-request', cardinality: 'per-frame', byteSemantics: 'count-only-unavailable' },
  { operationId: 'render-pass-plan-materialization', sourceLocationId: 'webgpu-driver:materialize-render-plan', carrier: 'frame-request', cardinality: 'per-frame', byteSemantics: 'count-only-unavailable' }
];
const EXPECTED_ABORT_TUPLES = (() => {
  const tuples = [
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
    'capacityFixturePolicy', 'qualificationFingerprintPolicy', 'performanceEvidenceChunkPolicy', 'performanceLimits', 'transcodeDecisionPolicy'
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
  if (policy.schemaVersion !== 1) fail('baseline policy schemaVersion must be 1');
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
  if (policy.performanceOperationRegistry.version !== 1) fail('performanceOperationRegistry.version must be 1');
  assertArray(policy.performanceOperationRegistry.operations, 'performanceOperationRegistry.operations');
  const operationIds = policy.performanceOperationRegistry.operations.map((entry) => entry.id);
  if (operationIds.join('\u0000') !== REQUIRED_OPERATION_IDS.join('\u0000')) fail('performanceOperationRegistry operations are incomplete or reordered');
  if (new Set(operationIds).size !== operationIds.length) fail('performanceOperationRegistry has duplicate operations');
  for (const operation of policy.performanceOperationRegistry.operations) {
    assertExactKeys(operation, ['id', 'variant'], 'performance operation');
    assertString(operation.id, 'performance operation id');
    assertString(operation.variant, 'performance operation variant');
    if (operation.id !== operation.variant) fail('performance operation id and variant must match');
  }

  assertExactKeys(policy.processAdapterRegistry, ['version', 'adapters', 'processClasses'], 'processAdapterRegistry');
  if (policy.processAdapterRegistry.version !== 1) fail('processAdapterRegistry.version must be 1');
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

  assertExactKeys(policy.performanceEnvironmentPolicy, ['version', 'pollCadenceMs', 'staticIdentityFields', 'dynamicStateFields', 'electronEventNames'], 'performanceEnvironmentPolicy');
  if (policy.performanceEnvironmentPolicy.version !== 1) fail('performanceEnvironmentPolicy.version must be 1');
  assertExactKeys(policy.performanceEnvironmentPolicy.pollCadenceMs, ['minimum', 'maximum'], 'performanceEnvironmentPolicy.pollCadenceMs');
  assertSafeInteger(policy.performanceEnvironmentPolicy.pollCadenceMs.minimum, 'performanceEnvironmentPolicy.pollCadenceMs.minimum', 1);
  assertSafeInteger(policy.performanceEnvironmentPolicy.pollCadenceMs.maximum, 'performanceEnvironmentPolicy.pollCadenceMs.maximum', policy.performanceEnvironmentPolicy.pollCadenceMs.minimum);
  if (policy.performanceEnvironmentPolicy.pollCadenceMs.minimum !== 900 || policy.performanceEnvironmentPolicy.pollCadenceMs.maximum !== 1100) fail('performanceEnvironmentPolicy cadence is invalid');
  assertExactStringArray(policy.performanceEnvironmentPolicy.staticIdentityFields, EXPECTED_ENVIRONMENT_STATIC_FIELDS, 'performanceEnvironmentPolicy.staticIdentityFields');
  assertExactStringArray(policy.performanceEnvironmentPolicy.dynamicStateFields, EXPECTED_ENVIRONMENT_DYNAMIC_FIELDS, 'performanceEnvironmentPolicy.dynamicStateFields');
  assertExactStringArray(policy.performanceEnvironmentPolicy.electronEventNames, EXPECTED_ELECTRON_ENVIRONMENT_EVENTS, 'performanceEnvironmentPolicy.electronEventNames');

  const unavailable = policy.performanceFailurePolicy?.qualificationUnavailableReasons;
  const expectedUnavailable = [
    'webgpu-api-unavailable', 'webgpu-adapter-unavailable', 'transfer-api-unavailable',
    'transfer-method-unavailable', 'transfer-allowlisted-not-supported', 'worker-fallback-adapter'
  ];
  assertExactKeys(policy.performanceFailurePolicy, ['version', 'qualificationUnavailableReasons', 'retryableReasons', 'measuredDrops', 'metricSessionAbortTuples'], 'performanceFailurePolicy');
  if (policy.performanceFailurePolicy.version !== 1 || !Array.isArray(unavailable) || unavailable.join('\u0000') !== expectedUnavailable.join('\u0000')) {
    fail('performanceFailurePolicy must contain exactly six qualification-unavailable branches');
  }
  assertExactStringArray(policy.performanceFailurePolicy.retryableReasons, ['sample-floor', 'cadence-insufficient', 'host-noise', 'cpu-boundary-overlap'], 'performanceFailurePolicy.retryableReasons');
  assertExactStringArray(policy.performanceFailurePolicy.measuredDrops, ['duplicateMediaTime', 'noCurrentData', 'backpressure'], 'performanceFailurePolicy.measuredDrops');
  assertArray(policy.performanceFailurePolicy.metricSessionAbortTuples, 'performanceFailurePolicy.metricSessionAbortTuples');
  const abortTupleKeys = policy.performanceFailurePolicy.metricSessionAbortTuples.map((tuple, index) => {
    assertExactKeys(tuple, ['phase', 'backend', 'reason'], `performanceFailurePolicy.metricSessionAbortTuples[${index}]`);
    if (!['open', 'reset-a', 'reset-b', 'side-a', 'side-b'].includes(tuple.phase)) {
      fail('performanceFailurePolicy metric-session abort phase is invalid');
    }
    if (!['none', 'canvas2d', 'webgpu'].includes(tuple.backend)) {
      fail('performanceFailurePolicy metric-session abort backend is invalid');
    }
    assertString(tuple.reason, 'performanceFailurePolicy metric-session abort reason');
    if (tuple.phase === 'open' || tuple.phase.startsWith('reset-')) {
      if (tuple.backend !== 'none') fail('open and reset abort tuples must use the none backend');
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
  if (policy.performanceDispositionPolicy.version !== 1 || policy.performanceDispositionPolicy.advisoryDispositionIsAuthority !== false) fail('performanceDispositionPolicy is invalid');
  assertExactStringArray(policy.performanceDispositionPolicy.sourceDispositions, EXPECTED_SOURCE_DISPOSITIONS, 'performanceDispositionPolicy.sourceDispositions');

  assertExactKeys(policy.performanceMetricPolicy, ['version', 'workloadId', 'cpuWindowLagSamples', 'minimumRawSamples', 'minimumCpuWindows', 'maximumCounterQuantumSeconds', 'maximumReadDurationMs', 'sampleCadenceMs', 'sentinelCpuAllowance', 'instrumentationCpuAllowance', 'scoreCountByBackend'], 'performanceMetricPolicy');
  if (policy.performanceMetricPolicy.version !== 1 || policy.performanceMetricPolicy.cpuWindowLagSamples !== 40) fail('performanceMetricPolicy is invalid');
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
  assertExactKeys(policy.performanceMetricPolicy.scoreCountByBackend, ['canvas2d', 'webgpu'], 'performanceMetricPolicy.scoreCountByBackend');
  if (policy.performanceMetricPolicy.minimumRawSamples !== 55 || policy.performanceMetricPolicy.minimumCpuWindows !== 15 || policy.performanceMetricPolicy.maximumCounterQuantumSeconds !== 0.01 || policy.performanceMetricPolicy.maximumReadDurationMs !== 50 || policy.performanceMetricPolicy.sampleCadenceMs.minimum !== 450 || policy.performanceMetricPolicy.sampleCadenceMs.maximum !== 550 || policy.performanceMetricPolicy.sentinelCpuAllowance !== 0.02 || policy.performanceMetricPolicy.instrumentationCpuAllowance !== 0.05) fail('performanceMetricPolicy limits are invalid');
  if (policy.performanceMetricPolicy.scoreCountByBackend.canvas2d !== 6 || policy.performanceMetricPolicy.scoreCountByBackend.webgpu !== 6) {
    fail('performanceMetricPolicy must have exactly six scores per backend');
  }

  assertExactKeys(policy.allocationEvidencePolicy, ['version', 'canvas2d', 'webgpu'], 'allocationEvidencePolicy');
  assertExactKeys(policy.allocationEvidencePolicy.canvas2d, ['state', 'operations'], 'allocationEvidencePolicy.canvas2d');
  assertExactKeys(policy.allocationEvidencePolicy.webgpu, ['operations', 'coverage', 'states'], 'allocationEvidencePolicy.webgpu');
  if (policy.allocationEvidencePolicy.version !== 1 || policy.allocationEvidencePolicy.canvas2d.state !== 'not-applicable-no-covered-allocation-request') {
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
  if (policy.capacityFixturePolicy.version !== 1 || policy.capacityFixturePolicy.encoding !== 'synthetic-allocation-coverage-v1' || policy.capacityFixturePolicy.callbackCohortEncoding !== 'synthetic-callback-cohort-v1' || policy.capacityFixturePolicy.provenanceKind !== 'synthetic-capacity-fixture' || policy.capacityFixturePolicy.publicationEligible !== false || policy.capacityFixturePolicy.runtimeMeasurement !== false) {
    fail('capacityFixturePolicy is invalid');
  }

  assertExactKeys(policy.comparisonFingerprintPolicy, ['version', 'includedFields', 'excludedFields', 'canvasBackendExecutionIdentity'], 'comparisonFingerprintPolicy');
  if (policy.comparisonFingerprintPolicy.version !== 1 || policy.comparisonFingerprintPolicy.canvasBackendExecutionIdentity !== 'not-applicable') fail('comparisonFingerprintPolicy is invalid');
  assertExactStringArray(policy.comparisonFingerprintPolicy.includedFields, EXPECTED_COMPARISON_FINGERPRINT_FIELDS, 'comparisonFingerprintPolicy.includedFields');
  assertExactStringArray(policy.comparisonFingerprintPolicy.excludedFields, EXPECTED_COMPARISON_FINGERPRINT_EXCLUDED_FIELDS, 'comparisonFingerprintPolicy.excludedFields');
  assertExactKeys(policy.qualificationFingerprintPolicy, ['version', 'includedFields', 'excludedFields'], 'qualificationFingerprintPolicy');
  if (policy.qualificationFingerprintPolicy.version !== 1) fail('qualificationFingerprintPolicy.version must be 1');
  assertExactStringArray(policy.qualificationFingerprintPolicy.includedFields, EXPECTED_QUALIFICATION_FINGERPRINT_FIELDS, 'qualificationFingerprintPolicy.includedFields');
  assertExactStringArray(policy.qualificationFingerprintPolicy.excludedFields, EXPECTED_QUALIFICATION_FINGERPRINT_EXCLUDED_FIELDS, 'qualificationFingerprintPolicy.excludedFields');

  assertExactKeys(policy.performanceEvidenceChunkPolicy, ['version', 'chunkRows', 'maximumRowsPerRunAndKind', 'rawKinds'], 'performanceEvidenceChunkPolicy');
  if (policy.performanceEvidenceChunkPolicy.version !== 1 || policy.performanceEvidenceChunkPolicy.chunkRows !== 256 || policy.performanceEvidenceChunkPolicy.maximumRowsPerRunAndKind !== 16384) {
    fail('performanceEvidenceChunkPolicy is invalid');
  }
  assertExactKeys(policy.performanceEvidenceChunkPolicy.rawKinds, Object.keys(EXPECTED_RAW_KIND_SORT_KEYS), 'performanceEvidenceChunkPolicy.rawKinds');
  for (const [rawKind, expectedSortKeys] of Object.entries(EXPECTED_RAW_KIND_SORT_KEYS)) {
    const definition = policy.performanceEvidenceChunkPolicy.rawKinds[rawKind];
    assertExactKeys(definition, ['sortKeys', 'columns', 'requiredColumns', 'referenceColumns', 'literalValues'], `raw kind ${rawKind}`);
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
    if (!definition.referenceColumns.includes('runId')) fail(`raw kind ${rawKind} must bind every row to a runId`);
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
  }

  assertExactKeys(policy.performanceLimits, ['version', 'buildSeconds', 'seedMaterializationSeconds', 'cooldownAndIdleSeconds', 'readinessSeconds', 'sourceFlowSeconds', 'warmup', 'window', 'oneLaunchSeconds', 'ciExperimentSeconds', 'referenceExperimentSeconds', 'maximumEnvironmentPolls', 'maximumSameStateEvents', 'maximumProcessObservations', 'maximumIdentities', 'maximumIdentifierBytes', 'maximumPathBytes'], 'performanceLimits');
  if (policy.performanceLimits.version !== 1 || policy.performanceLimits.oneLaunchSeconds !== 300 || policy.performanceLimits.ciExperimentSeconds !== 10800 || policy.performanceLimits.referenceExperimentSeconds !== 28800) {
    fail('performanceLimits are invalid');
  }
  for (const field of ['buildSeconds', 'seedMaterializationSeconds', 'cooldownAndIdleSeconds', 'readinessSeconds', 'sourceFlowSeconds', 'oneLaunchSeconds', 'ciExperimentSeconds', 'referenceExperimentSeconds', 'maximumEnvironmentPolls', 'maximumSameStateEvents', 'maximumProcessObservations', 'maximumIdentities', 'maximumIdentifierBytes', 'maximumPathBytes']) assertSafeInteger(policy.performanceLimits[field], `performanceLimits.${field}`, 1);
  assertExactKeys(policy.performanceLimits.warmup, ['minimumSeconds', 'minimumCallbacks', 'maximumSeconds', 'maximumCallbacks'], 'performanceLimits.warmup');
  assertExactKeys(policy.performanceLimits.window, ['maximumSeconds', 'maximumCallbacks'], 'performanceLimits.window');
  for (const [label, value] of Object.entries({ ...policy.performanceLimits.warmup, ...policy.performanceLimits.window })) assertSafeInteger(value, `performanceLimits.${label}`, 1);
  if (policy.performanceLimits.buildSeconds !== 600 || policy.performanceLimits.seedMaterializationSeconds !== 30 || policy.performanceLimits.cooldownAndIdleSeconds !== 135 || policy.performanceLimits.readinessSeconds !== 30 || policy.performanceLimits.sourceFlowSeconds !== 15 || policy.performanceLimits.warmup.minimumSeconds !== 10 || policy.performanceLimits.warmup.minimumCallbacks !== 600 || policy.performanceLimits.warmup.maximumSeconds !== 30 || policy.performanceLimits.warmup.maximumCallbacks !== 900 || policy.performanceLimits.window.maximumSeconds !== 45 || policy.performanceLimits.window.maximumCallbacks !== 2048 || policy.performanceLimits.maximumEnvironmentPolls !== 300 || policy.performanceLimits.maximumSameStateEvents !== 4096 || policy.performanceLimits.maximumProcessObservations !== 1024 || policy.performanceLimits.maximumIdentities !== 128 || policy.performanceLimits.maximumIdentifierBytes !== 1024 || policy.performanceLimits.maximumPathBytes !== 4096) fail('performanceLimits are incompatible with the closed performance limits policy');

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
  return Object.freeze({
    policy: normalized,
    policyHash: canonicalSha256(normalized),
    sectionHashes,
    operations,
    adapters
  });
}

export function loadBaselinePolicy(policyPath = POLICY_PATH) {
  let policy;
  try {
    policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to load baseline policy ${policyPath}: ${error.message}`);
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
  { id: 'backend-throughput', direction: 'lower-is-regression' },
  { id: 'timing-p95', direction: 'higher-is-regression' },
  { id: 'drop-rate', direction: 'higher-is-regression' },
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
  if (windowSeconds < 30 || windowSeconds > compiledPolicy.policy.performanceLimits.window.maximumSeconds || callbackCount > compiledPolicy.policy.performanceLimits.window.maximumCallbacks) fail(`${label}.callbackCohort violates the closed workload window`);
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

function deriveScalarRegressionScore(baseline, compared, allowance, direction) {
  assertFiniteNumber(baseline, 'baseline scalar metric', 0);
  assertFiniteNumber(compared, 'compared scalar metric', 0);
  const regression = direction === 'lower-is-regression' ? baseline - compared : compared - baseline;
  return Math.max(0, regression) / Math.max(allowance * Math.max(Math.abs(baseline), Number.EPSILON), 1);
}

function validateRawPerformanceEvidence(rawEvidence, ledgerDetails, compiledPolicy, evidenceProvenance) {
  assertExactKeys(rawEvidence, ['runs'], 'performance raw evidence');
  assertArray(rawEvidence.runs, 'performance raw evidence.runs');
  if (ledgerDetails.hasAbortedSession || ledgerDetails.completedSessions.length === 0) fail('aborted or incomplete ledger sessions cannot enter raw performance evaluation');
  const launches = ledgerDetails.completedSessions.flatMap((session) => session.launches);
  if (rawEvidence.runs.length !== launches.length) fail('performance raw evidence must contain exactly one run record per completed ledger launch');
  const launchesByRunId = new Map(launches.map((launch) => [launch.runId, launch]));
  const runs = new Map();
  for (const [index, rawRun] of rawEvidence.runs.entries()) {
    assertExactKeys(rawRun, ['runId', 'callbackTiming', 'cpuSamples', 'environment', 'process'], `performance raw evidence.runs[${index}]`);
    assertString(rawRun.runId, `performance raw evidence.runs[${index}].runId`);
    const launch = launchesByRunId.get(rawRun.runId);
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
    runs.set(rawRun.runId, { runId: rawRun.runId, cpu, callbackTiming, launch: clone(launch) });
  }
  const scores = [];
  for (const session of ledgerDetails.completedSessions) {
    const baselineLaunch = session.launches.find((launch) => launch.comparisonSide === 'A');
    const comparedLaunch = session.launches.find((launch) => launch.comparisonSide === 'B');
    const baseline = runs.get(baselineLaunch?.runId);
    const compared = runs.get(comparedLaunch?.runId);
    if (!baseline || !compared) fail('performance raw evidence does not join a completed comparison pair');
    const allowance = session.comparisonKind === 'instrumentation-overhead'
      ? compiledPolicy.policy.performanceMetricPolicy.instrumentationCpuAllowance
      : compiledPolicy.policy.performanceMetricPolicy.sentinelCpuAllowance;
    const scalarValues = {
      'source-throughput': [baseline.callbackTiming.sourceThroughput, compared.callbackTiming.sourceThroughput],
      'backend-throughput': [baseline.callbackTiming.backendThroughput, compared.callbackTiming.backendThroughput],
      'timing-p95': [baseline.callbackTiming.timingP95Ms, compared.callbackTiming.timingP95Ms],
      'drop-rate': [baseline.callbackTiming.dropRate, compared.callbackTiming.dropRate],
      'external-working-set-p95': [baseline.cpu.workingSetP95MiB, compared.cpu.workingSetP95MiB]
    };
    let observedCpuBoundaryOverlap = false;
    for (const definition of RAW_SCORE_DEFINITIONS) {
      const cpuMetric = definition.direction === 'cpu-range';
      const score = cpuMetric
        ? deriveCpuScore({ p95Lower: baseline.cpu.p95Lower, p95Upper: baseline.cpu.p95Upper }, { p95Lower: compared.cpu.p95Lower, p95Upper: compared.cpu.p95Upper }, allowance)
        : { scoreLower: deriveScalarRegressionScore(...scalarValues[definition.id], allowance, definition.direction), scoreUpper: deriveScalarRegressionScore(...scalarValues[definition.id], allowance, definition.direction), verdict: 'pass' };
      if (cpuMetric && score.verdict === 'cpu-boundary-overlap') {
        if (session.retryReason !== 'cpu-boundary-overlap') {
          fail('a complete CPU-boundary-overlap pair requires one declared whole-pair retry after its completed close');
        }
        observedCpuBoundaryOverlap = true;
      } else if (score.scoreUpper > 1) {
        fail(`raw performance metric ${definition.id} exceeds the allowed score bound`);
      }
      scores.push({
        metricId: definition.id,
        metricSessionId: session.metricSessionId,
        baselineRunId: baseline.runId,
        comparedRunId: compared.runId,
        acceptedAttempt: !session.supersededByRetry,
        ...score
      });
    }
    if (session.retryReason === 'cpu-boundary-overlap' && !observedCpuBoundaryOverlap) {
      fail('a declared cpu-boundary-overlap retry must be proven by the preceding complete pair CPU bounds');
    }
  }
  return { runCount: runs.size, scores };
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

function classifyRetryableAbortReason(session, compiledPolicy) {
  if (!session.abortReason || !['side-a', 'side-b'].includes(session.abortReason.phase)) return null;
  const disposition = classifyFailure({
    phase: 'measurement',
    backend: session.abortReason.backend,
    reason: session.abortReason.reason
  }, compiledPolicy);
  return disposition === 'retryable-pair-invalid' ? session.abortReason.reason : null;
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
      if (previous.outcome === 'aborted') {
        const abortedReason = classifyRetryableAbortReason(previous, compiledPolicy);
        if (abortedReason === null || abortedReason !== retryReason) {
          fail('a retried aborted pair must carry the matching policy-declared retry reason after cleanup');
        }
      } else if (previous.outcome === 'completed') {
        if (retryReason !== 'cpu-boundary-overlap') {
          fail('only a completed cpu-boundary-overlap pair may be retried after a completed close');
        }
      } else {
        fail('a retry must follow one terminal whole-pair attempt');
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

function validateLaunch(entry, label, session, expectedSide, compiledPolicy) {
  const common = ['sequence', 'operationId', 'start', 'end', 'metricSessionId', 'comparisonSide', 'comparisonKind', 'buildVariant', 'runId', 'experimentId', 'backend', 'policyHash', 'ownership', 'cleanup', 'outcome'];
  if (entry.operationId === 'electron-harness-spawn') {
    const instrumented = entry.buildVariant === 'instrumented';
    const failure = entry.outcome === 'failed';
    assertExactKeys(entry, [...common, 'launchId', 'executionId', ...(instrumented ? ['measurementEpochId', 'frameSourceSequences'] : []), ...(failure ? ['abortReason', 'lastBoundary'] : [])], label);
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
    assertExactKeys(entry, [...common, 'externalExecutionId', ...(failure ? ['abortReason', 'lastBoundary'] : [])], label);
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
  if (session.buildVariants.has(entry.buildVariant)) fail(`${label} duplicates a comparison build variant`);
  if (entry.outcome === 'failed') {
    const expectedPhase = expectedSide === 'A' ? 'side-a' : 'side-b';
    validateAbort(entry, label, compiledPolicy, expectedPhase, entry.backend);
  }
  return entry;
}

/**
 * Validate the ledger as a closed transaction grammar. A session is either
 * `open -> reset A -> side A -> reset B -> side B -> completed close`, or it
 * terminates in one of the explicitly recorded abort forms.
 */
function validatePerformanceLedgerDetails(entries, compiledPolicy) {
  assertArray(entries, 'ledger entries');
  if (entries.length === 0) fail('ledger entries must not be empty');
  let previousSequence = 0;
  let previousEnd = 0;
  let activeSession = null;
  const metricSessionIds = new Set();
  const resetIds = new Set();
  const runIds = new Set();
  const launchIds = new Set();
  const externalExecutionIds = new Set();
  const completedSessions = [];
  const terminalSessions = [];
  let binding = null;
  let hasMetricSession = false;
  let terminalAbort = false;
  for (const [index, entry] of entries.entries()) {
    validateLedgerBase(entry, index, previousSequence, previousEnd, compiledPolicy);
    previousSequence = entry.sequence;
    previousEnd = entry.end;
    if (terminalAbort) fail('ledger cannot contain an entry after an aborted metric session');
    const label = `ledger[${index}]`;
    if (entry.operationId === 'build-spawn' || entry.operationId === 'generic-transport-spawn') {
      if (activeSession) fail(`${entry.operationId} cannot occur inside a metric session`);
      if (hasMetricSession) fail(`${entry.operationId} is only valid in the pre-loop ledger prefix`);
      const identifier = entry.operationId === 'build-spawn' ? 'buildId' : 'transportId';
      assertExactKeys(entry, ['sequence', 'operationId', 'start', 'end', identifier, 'closure'], label);
      assertString(entry[identifier], `${label}.${identifier}`);
      validateClosure(entry.closure, `${label}.closure`);
      continue;
    }
    if (entry.operationId === 'metric-adapter-session-open') {
      if (activeSession) fail('metric session cannot be opened while another session is active');
      hasMetricSession = true;
      assertString(entry.metricSessionId, `${label}.metricSessionId`);
      if (metricSessionIds.has(entry.metricSessionId)) fail('metric session IDs must be unique');
      metricSessionIds.add(entry.metricSessionId);
      const hasAttempt = Object.prototype.hasOwnProperty.call(entry, 'attempt');
      const attempt = hasAttempt ? validatePairAttempt(entry.attempt, `${label}.attempt`, compiledPolicy) : null;
      if (entry.outcome === 'ready') {
        assertExactKeys(entry, ['sequence', 'operationId', 'start', 'end', 'metricSessionId', 'outcome', ...(hasAttempt ? ['attempt'] : [])], label);
        activeSession = {
          id: entry.metricSessionId,
          attempt,
          phase: 'reset-a',
          lastBoundary: 'open',
          comparisonKind: null,
          backend: null,
          experimentId: null,
          buildVariants: new Set(),
          launches: []
        };
        continue;
      }
      if (!['failed-no-resource', 'failed-resource-owned'].includes(entry.outcome)) fail('metric session open outcome is invalid');
      assertExactKeys(entry, ['sequence', 'operationId', 'start', 'end', 'metricSessionId', 'outcome', 'abortReason', 'lastBoundary', ...(entry.outcome === 'failed-no-resource' ? ['zeroSpawned'] : []), ...(hasAttempt ? ['attempt'] : [])], label);
      const abortReason = validateAbort(entry, label, compiledPolicy, 'open', 'none');
      if (entry.outcome === 'failed-no-resource') {
        if (entry.zeroSpawned !== true) fail('failed-no-resource open must prove zero spawned resource');
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
        comparisonKind: null,
        backend: null,
        experimentId: null,
        buildVariants: new Set(),
        launches: []
      };
      continue;
    }
    if (entry.operationId === 'internal-reset') {
      if (!activeSession || !['reset-a', 'reset-b'].includes(activeSession.phase)) fail('internal reset is out of metric-session order');
      assertExactKeys(entry, ['sequence', 'operationId', 'start', 'end', 'metricSessionId', 'resetId', 'boundary'], label);
      assertString(entry.metricSessionId, `${label}.metricSessionId`);
      assertString(entry.resetId, `${label}.resetId`);
      if (entry.metricSessionId !== activeSession.id) fail('internal reset has the wrong metric session');
      if (resetIds.has(entry.resetId)) fail('internal reset IDs must be unique');
      resetIds.add(entry.resetId);
      const expectedBoundary = activeSession.phase === 'reset-a' ? 'reset-before-a' : 'reset-before-b';
      if (entry.boundary !== expectedBoundary) fail('internal reset boundary is invalid');
      activeSession.phase = activeSession.phase === 'reset-a' ? 'side-a' : 'side-b';
      activeSession.lastBoundary = activeSession.phase === 'side-a' ? 'reset-a' : 'reset-b';
      continue;
    }
    if (entry.operationId === 'electron-harness-spawn' || entry.operationId === 'production-sentinel-spawn') {
      if (!activeSession || !['side-a', 'side-b'].includes(activeSession.phase)) fail('performance launch is out of metric-session order');
      const expectedSide = activeSession.phase === 'side-a' ? 'A' : 'B';
      const launch = validateLaunch(entry, label, activeSession, expectedSide, compiledPolicy);
      if (runIds.has(launch.runId)) fail('ledger run IDs must be unique');
      runIds.add(launch.runId);
      if (launch.operationId === 'electron-harness-spawn') {
        if (launchIds.has(launch.launchId)) fail('ledger harness launch IDs must be unique');
        launchIds.add(launch.launchId);
      } else {
        if (externalExecutionIds.has(launch.externalExecutionId)) fail('ledger production external execution IDs must be unique');
        externalExecutionIds.add(launch.externalExecutionId);
      }
      if (!binding) {
        binding = { experimentId: launch.experimentId, backend: launch.backend, policyHash: launch.policyHash };
      } else if (binding.experimentId !== launch.experimentId || binding.backend !== launch.backend || binding.policyHash !== launch.policyHash) {
        fail('ledger performance launches must bind one experiment, backend, and policy identity');
      }
      activeSession.comparisonKind = launch.comparisonKind;
      activeSession.backend = launch.backend;
      activeSession.experimentId = launch.experimentId;
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
      if (activeSession.phase === 'completed-close') {
        assertExactKeys(entry, ['sequence', 'operationId', 'start', 'end', 'metricSessionId', 'outcome', 'closure'], label);
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
      assertExactKeys(entry, ['sequence', 'operationId', 'start', 'end', 'metricSessionId', 'outcome', 'abortReason', 'lastBoundary', 'closure'], label);
      if (entry.outcome !== 'aborted') fail('incomplete metric session must close as aborted');
      const abortPhase = activeSession.abortPhase ?? activeSession.phase;
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
    acceptedInstrumentedRuns: clone(acceptedInstrumentedRuns),
    completedSessions: clone(completedSessions),
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

export function deriveAcceptedInstrumentedLedgerRuns(entries, { experimentId, backend } = {}, compiledPolicy = loadBaselinePolicy()) {
  assertString(experimentId, 'accepted instrumented run experimentId');
  if (!compiledPolicy.policy.reportPolicy.backends.includes(backend)) fail('accepted instrumented run backend is invalid');
  const details = validatePerformanceLedgerDetails(entries, compiledPolicy);
  if (!details.binding || details.binding.experimentId !== experimentId || details.binding.backend !== backend || details.binding.policyHash !== compiledPolicy.policyHash) {
    fail('ledger does not bind the requested experiment, backend, and policy identity');
  }
  if (details.acceptedInstrumentedRuns.length === 0) fail('ledger has no accepted instrumented runs');
  return details.acceptedInstrumentedRuns;
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
    assertExactKeys(row, [...common, 'measurementEpochId', 'sourceSequence', ...semantics], label);
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
  let sequence;
  if (row.carrier === 'frame-request') {
    assertString(row.measurementEpochId, `${label}.measurementEpochId`);
    if (row.measurementEpochId !== join.measurementEpochId) fail(`${label}.measurementEpochId does not join the run epoch`);
    assertSafeInteger(row.sourceSequence, `${label}.sourceSequence`, 1);
    if (!join.frameSourceSequences.includes(row.sourceSequence)) fail(`${label}.sourceSequence does not join the run frame cohort`);
    sequence = row.sourceSequence;
  } else {
    assertString(row.executionId, `${label}.executionId`);
    if (row.executionId !== join.executionId) fail(`${label}.executionId does not join the run execution`);
    if (row.lifecyclePhase !== expected.lifecyclePhase) fail(`${label}.lifecyclePhase is incompatible with the operation`);
    assertSafeInteger(row.phaseSequence, `${label}.phaseSequence`, 1);
    sequence = row.phaseSequence;
  }
  if (row.requestOrdinal !== sequence) fail(`${label}.requestOrdinal must equal its carrier-local sequence`);
  validateAllocationByteSemantics(row, expected, label);
  return sequence;
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
  return rows;
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
  const sequences = new Map();
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
      const seenSequences = sequences.get(key) ?? new Set();
      if (seenSequences.has(sequence)) fail(`allocation row ${index} duplicates a request sequence`);
      seenSequences.add(sequence);
      sequences.set(key, seenSequences);
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
    for (const entry of expected) {
      const seenSequences = sequences.get(allocationKey(entry)) ?? new Set();
      const highestSequence = seenSequences.size === 0 ? 0 : Math.max(...seenSequences);
      if (highestSequence !== seenSequences.size) fail('allocation evidence has a gap within observed request sequences');
      if (seenSequences.size > entry.expectedCardinality) fail('allocation evidence exceeds policy cardinality');
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

function validatePerformanceEvidenceRow(row, rawKind, definition, index) {
  const label = `${rawKind} rows[${index}]`;
  assertObject(row, label);
  const allowedColumns = new Set(definition.columns);
  for (const column of Object.keys(row)) {
    if (!allowedColumns.has(column)) fail(`${label} has an unrecognized column ${column}`);
  }
  for (const column of definition.requiredColumns) {
    if (!Object.prototype.hasOwnProperty.call(row, column)) fail(`${label} is missing required column ${column}`);
  }
  for (const column of definition.columns) {
    if (Object.prototype.hasOwnProperty.call(row, column)) {
      canonicalOptionalValue(row[column], { present: true });
    }
  }
  for (const column of definition.referenceColumns) {
    if (column === 'policyHash') assertSha(row[column], `${label}.${column}`);
    else assertString(row[column], `${label}.${column}`);
  }
  for (const [column, literal] of Object.entries(definition.literalValues)) {
    if (row[column] !== literal) fail(`${label}.${column} must equal the raw-kind literal`);
  }
  return clone(row);
}

export function encodePerformanceEvidence(rawKind, rows, compiledPolicy = loadBaselinePolicy()) {
  assertString(rawKind, 'rawKind');
  assertArray(rows, 'rows');
  const definition = compiledPolicy.policy.performanceEvidenceChunkPolicy.rawKinds[rawKind];
  if (!definition) fail(`unknown raw evidence kind ${rawKind}`);
  const maximumRows = compiledPolicy.policy.performanceEvidenceChunkPolicy.maximumRowsPerRunAndKind;
  const sortKeys = definition.sortKeys;
  const rowsByRunId = new Map();
  const keyedRows = rows.map((row, index) => {
    const normalized = validatePerformanceEvidenceRow(row, rawKind, definition, index);
    const rowCount = (rowsByRunId.get(normalized.runId) ?? 0) + 1;
    if (rowCount > maximumRows) fail(`${rawKind} run ${normalized.runId} exceeds ${maximumRows} rows`);
    rowsByRunId.set(normalized.runId, rowCount);
    return { row: normalized, key: rowKey(normalized, sortKeys) };
  }).sort((left, right) => compareCodeUnitStrings(left.key, right.key));
  const keys = keyedRows.map((entry) => entry.key);
  if (new Set(keys).size !== keys.length) fail(`${rawKind} has duplicate sort keys`);
  const columns = [...definition.columns];
  const serializedRows = keyedRows.map(({ row, key }) => ({
    key,
    values: columns.map((column) => stableStringify(canonicalOptionalValue(row[column], {
      present: Object.prototype.hasOwnProperty.call(row, column)
    })))
  }));
  const dictionaryValueSet = new Set();
  for (const { values } of serializedRows) for (const value of values) dictionaryValueSet.add(value);
  const dictionaryValues = sortCodeUnitStrings(dictionaryValueSet);
  const dictionary = dictionaryValues.map((value) => JSON.parse(value));
  const dictionaryIndex = new Map(dictionaryValues.map((value, index) => [value, index]));
  const chunkRows = compiledPolicy.policy.performanceEvidenceChunkPolicy.chunkRows;
  const chunks = [];
  for (let start = 0; start < serializedRows.length; start += chunkRows) {
    const rowsInChunk = serializedRows.slice(start, start + chunkRows);
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
  const result = { version: 1, rawKind, sortKeys: [...sortKeys], columns, dictionary, chunks };
  return { ...result, checksum: canonicalSha256(result) };
}

export function decodePerformanceEvidence(encoded, compiledPolicy = loadBaselinePolicy()) {
  assertObject(encoded, 'encoded performance evidence');
  const { checksum, ...body } = encoded;
  assertSha(checksum, 'encoded performance evidence checksum');
  assertExactKeys(body, ['version', 'rawKind', 'sortKeys', 'columns', 'dictionary', 'chunks'], 'encoded performance evidence');
  if (body.version !== 1) fail('encoded performance evidence version is invalid');
  if (canonicalSha256(body) !== checksum) fail('encoded performance evidence checksum mismatch');
  const definition = compiledPolicy.policy.performanceEvidenceChunkPolicy.rawKinds[body.rawKind];
  if (!definition || stableStringify(body.sortKeys) !== stableStringify(definition.sortKeys)) fail('encoded raw kind is invalid');
  assertArray(body.columns, 'encoded columns');
  assertArray(body.dictionary, 'encoded dictionary');
  assertArray(body.chunks, 'encoded chunks');
  if (stableStringify(body.columns) !== stableStringify(definition.columns)) {
    fail('encoded columns must match the raw-kind policy definition');
  }
  body.columns.forEach((column, index) => assertString(column, `encoded columns[${index}]`));
  const dictionaryKeys = body.dictionary.map((entry, index) => stableStringify(entry));
  if (new Set(dictionaryKeys).size !== dictionaryKeys.length || stableStringify(dictionaryKeys) !== stableStringify(sortCodeUnitStrings(dictionaryKeys))) {
    fail('encoded optional-value dictionary must be unique and lexically sorted');
  }
  body.dictionary.forEach((entry, index) => decodeCanonicalOptionalValue(entry, `encoded dictionary[${index}]`));
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
    for (let rowIndex = 0; rowIndex < chunk.rowCount; rowIndex += 1) {
      const row = {};
      for (const column of body.columns) {
        const dictionaryIndex = chunk.columns[column][rowIndex];
        assertSafeInteger(dictionaryIndex, `encoded chunk ${chunkIndex}.${column}[${rowIndex}]`, 0);
        const dictionaryEntry = body.dictionary[dictionaryIndex];
        if (dictionaryEntry === undefined) fail(`encoded chunk ${chunkIndex} references an invalid dictionary row`);
        const optional = decodeCanonicalOptionalValue(dictionaryEntry, `encoded dictionary[${dictionaryIndex}]`);
        if (optional.present) row[column] = optional.value;
      }
      rows.push(row);
    }
  }
  const reencoded = encodePerformanceEvidence(body.rawKind, rows, compiledPolicy);
  if (stableStringify(reencoded) !== stableStringify(encoded)) fail('encoded performance evidence is noncanonical');
  return rows;
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

export function requirePublishablePerformanceEvidence(evaluation) {
  assertObject(evaluation, 'performance evaluation');
  if (evaluation.publicationEligible !== true || evaluation.evidenceProvenance?.kind !== 'runtime-capture') {
    fail('synthetic or non-runtime performance evidence cannot be accepted as production measurement');
  }
  return evaluation;
}

export function evaluatePerformanceExperiment(input, compiledPolicy = loadBaselinePolicy()) {
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
  if (!ledgerDetails.binding || ledgerDetails.binding.experimentId !== input.experimentId || ledgerDetails.binding.backend !== input.backend || ledgerDetails.binding.policyHash !== compiledPolicy.policyHash) {
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
  const publicationEligible = evidenceProvenance.kind === 'runtime-capture';
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
