import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { canonicalSha256, stableStringify } from './baseline-report.js';

const BASELINE_POLICY = createRequire(import.meta.url)('../manifests/baseline-policy.json');

export const PERFORMANCE_PAIR_PLAN_SCHEMA_VERSION = 3;
export const PERFORMANCE_PAIR_ATTEMPT_CARDINALITY = 3;

export const PERFORMANCE_PAIR_CARDINALITIES = Object.freeze({
  'harness-overhead': 3,
  'instrumentation-overhead': 6
});

export const PERFORMANCE_PAIR_BUILD_VARIANTS = Object.freeze({
  'harness-overhead': Object.freeze(['production', 'harness-control']),
  'instrumentation-overhead': Object.freeze(['harness-control', 'instrumented'])
});
export const PERFORMANCE_RAW_KIND_ORDER = Object.freeze([
  'source-opportunity',
  'backend-operation',
  'worker-message',
  'sentinel-observation',
  'process-observation',
  'environment-observation',
  'controller-operation',
  'timing-span',
  'cpu-sample',
  'frame-request',
  'lifecycle-request'
]);

const BACKENDS = new Set(['canvas2d', 'webgpu']);
const COMPARISON_SIDES = new Set(['A', 'B']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function fail(message) {
  throw new TypeError(`Performance pair plan failed: ${message}`);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, keys, label) {
  if (!isPlainObject(value)) fail(`${label} must be an object`);
  const expected = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) fail(`${label} has an unknown field ${key}`);
  }
  for (const key of keys) {
    if (!(key in value)) fail(`${label} is missing ${key}`);
  }
}

function assertUuid(value, label) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    fail(`${label} must be a UUID`);
  }
}

function assertNonemptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${label} must be a nonempty string`);
  }
}

function assertPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail(`${label} must be a positive safe integer`);
  }
}

function assertSha256(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail(`${label} must be a lowercase SHA-256`);
  }
}

function assertGitSha(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value)) {
    fail(`${label} must be a lowercase Git SHA`);
  }
}

function assertSafeInteger(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail(`${label} must be a safe integer >= ${minimum}`);
  }
}

function cloneJson(value, label) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    fail(`${label} must be finite JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function matchesRawRowShape(row, shape) {
  for (const discriminator of ['eventKind', 'observationKind', 'operationKind', 'messageKind', 'clockDomain', 'outcome']) {
    if (discriminator in shape && row[discriminator] !== shape[discriminator]) return false;
  }
  if (shape.comparisonKind && row.comparisonKind !== shape.comparisonKind) return false;
  if (shape.comparisonKinds && !shape.comparisonKinds.includes(row.comparisonKind)) return false;
  if (shape.buildVariants && !shape.buildVariants.includes(row.buildVariant)) return false;
  if (shape.backends && !shape.backends.includes(row.backend)) return false;
  return true;
}

function validateExactNestedFields(value, fields, label) {
  if (!isPlainObject(value)) fail(`${label} must be an object`);
  const expected = new Set(fields);
  for (const key of Object.keys(value)) if (!expected.has(key)) fail(`${label} has an unknown field ${key}`);
  for (const key of fields) if (!(key in value)) fail(`${label} is missing ${key}`);
}

function validateObjectSchema(value, requiredFields, optionalFields, nestedFields, label) {
  if (!isPlainObject(value)) fail(`${label} must be an object`);
  const required = new Set(requiredFields ?? []);
  const allowed = new Set([...required, ...(optionalFields ?? [])]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${label} has an unknown field ${key}`);
  for (const key of required) if (!(key in value)) fail(`${label} is missing ${key}`);
  for (const [key, fields] of Object.entries(nestedFields ?? {})) {
    if (key in value) validateExactNestedFields(value[key], fields, `${label}.${key}`);
  }
}

function adapterDefinition(row, label) {
  const adapter = BASELINE_POLICY.processAdapterRegistry.rawAdapterKinds.find((candidate) => (
    candidate.adapterId === row.adapterId && candidate.rawAdapterKind === row.rawAdapterKind
  ));
  if (!adapter) fail(`${label} adapterId/rawAdapterKind is not registered`);
  return adapter;
}

function parseMacosCpuTime(value, label) {
  if (typeof value !== 'string' || !/^(?:\d+-)?\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)) {
    fail(`${label} is not a macOS ps CPU time`);
  }
  const [dayPart, clockPart] = value.includes('-') ? value.split('-') : ['0', value];
  const parts = clockPart.split(':').map(Number);
  const seconds = parts.pop();
  const minutes = parts.pop();
  const hours = parts.pop() ?? 0;
  if (![Number(dayPart), hours, minutes, seconds].every(Number.isFinite) || minutes >= 60 || seconds >= 60) {
    fail(`${label} is not a normalized macOS ps CPU time`);
  }
  return (((Number(dayPart) * 24) + hours) * 60 + minutes) * 60 + seconds;
}

function parseUnsignedDecimal(value, label) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    fail(`${label} must be an unsigned decimal string`);
  }
  return BigInt(value);
}

function decodeAdapterRaw(adapter, raw, label) {
  validateObjectSchema(raw, adapter.sampleFields, adapter.sampleOptionalFields, adapter.nestedFields, label);
  if (adapter.decoderRule === 'linux-procfs-v1') {
    for (const key of ['pid', 'userTicks', 'systemTicks', 'startTicks', 'residentPages', 'pageSize', 'clockTicks']) {
      assertSafeInteger(raw[key], `${label}.${key}`, key === 'pid' || key === 'pageSize' || key === 'clockTicks' ? 1 : 0);
    }
    return {
      pid: raw.pid,
      creationIdentity: String(raw.startTicks),
      cumulativeCpuSeconds: (raw.userTicks + raw.systemTicks) / raw.clockTicks,
      workingSetMiB: (raw.residentPages * raw.pageSize) / (1024 * 1024),
      counterQuantumSeconds: 1 / raw.clockTicks
    };
  }
  if (adapter.decoderRule === 'macos-ps-v1') {
    assertSafeInteger(raw.pid, `${label}.pid`, 1);
    assertNonemptyString(raw.creationIdentity, `${label}.creationIdentity`);
    assertSafeInteger(raw.residentSetKiB, `${label}.residentSetKiB`, 0);
    return {
      pid: raw.pid,
      creationIdentity: raw.creationIdentity,
      cumulativeCpuSeconds: parseMacosCpuTime(raw.cpuTime, `${label}.cpuTime`),
      workingSetMiB: raw.residentSetKiB / 1024,
      counterQuantumSeconds: 0.01
    };
  }
  if (adapter.decoderRule === 'windows-powershell-v1') {
    const totalProcessorTimeTicks = parseUnsignedDecimal(raw.totalProcessorTimeTicks, `${label}.totalProcessorTimeTicks`);
    const workingSetBytes = parseUnsignedDecimal(raw.workingSetBytes, `${label}.workingSetBytes`);
    const sampler = raw.sampler;
    assertSafeInteger(sampler.pid, `${label}.sampler.pid`, 1);
    assertNonemptyString(sampler.creationIdentity, `${label}.sampler.creationIdentity`);
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

function validateElectronProcessMetric(value, label) {
  const adapter = BASELINE_POLICY.processAdapterRegistry.rawAdapterKinds.find((candidate) => candidate.decoderRule === 'electron-app-metrics-v1');
  validateObjectSchema(value, adapter.identityFields, adapter.identityOptionalFields, adapter.nestedFields, label);
  assertSafeInteger(value.pid, `${label}.pid`, 1);
  if (!Number.isFinite(value.creationTime) || value.creationTime < 0) fail(`${label}.creationTime is invalid`);
  if (!BASELINE_POLICY.processAdapterRegistry.rawProcessClasses.includes(value.type)) fail(`${label}.type is not registered`);
}

function validateMetricSessionAudit(value, row, label) {
  validateObjectSchema(value, ['adapterId', 'result', 'transitions'], [], {}, label);
  if (value.adapterId !== row.adapterId || !Array.isArray(value.transitions) || value.transitions.length === 0) {
    fail(`${label} does not bind the metric adapter session`);
  }
  let priorAt = -Infinity;
  const matchingTargets = [];
  value.transitions.forEach((transition, index) => {
    validateObjectSchema(transition, ['sequence', 'operation', 'at'], ['target'], {}, `${label}.transitions[${index}]`);
    if (transition.sequence !== index + 1 || !Number.isFinite(transition.at) || transition.at < priorAt) {
      fail(`${label}.transitions are not contiguous and monotonic`);
    }
    priorAt = transition.at;
    if ('target' in transition) {
      validateExactNestedFields(transition.target, ['pid', 'creationIdentity', 'processIdentity', 'counterQuantumSeconds'], `${label}.transitions[${index}].target`);
      if (transition.target.pid === row.pid && transition.target.creationIdentity === row.creationIdentity) matchingTargets.push(transition);
    }
  });
  const targetTransition = matchingTargets.find((entry) => entry.operation === (row.observationKind === 'closure' ? 'detach' : 'attach'));
  if (!targetTransition) fail(`${label} has no matching ${row.observationKind} transition`);
  return targetTransition.target.processIdentity;
}

function validateElectronBrokerSample(value, row, label) {
  validateExactNestedFields(value, ['launchId', 'callSequence', 'phase', 'purpose', 'capturedAt', 'rawAppMetrics', 'servedFromCache'], label);
  if (!Array.isArray(value.rawAppMetrics)) fail(`${label}.rawAppMetrics must be an array`);
  value.rawAppMetrics.forEach((metric, index) => validateElectronProcessMetric(metric, `${label}.rawAppMetrics[${index}]`));
  const matching = value.rawAppMetrics.filter((metric) => metric.pid === row.pid && String(metric.creationTime) === row.creationIdentity);
  if (matching.length !== 1 || stableStringify(matching[0]) !== stableStringify(row.rawIdentity)) {
    fail(`${label} does not contain the exact normalized process identity`);
  }
  return value.launchId;
}

function validateElectronRootExit(value, row, label) {
  validateExactNestedFields(value, ['launchId', 'protocol', 'rootExitObservedAt', 'terminalClosureEnd', 'root', 'frameworkSurvivors'], label);
  validateExactNestedFields(value.root, ['pid', 'creationTime'], `${label}.root`);
  if (!Array.isArray(value.frameworkSurvivors) || value.root.pid !== row.pid || String(value.root.creationTime) !== row.creationIdentity) {
    fail(`${label} does not bind the closed browser root`);
  }
  return value.launchId;
}

function validateRawAdapterCarrier(row, rawKind, label) {
  if (!['process-observation', 'cpu-sample'].includes(rawKind)) return;
  const adapter = adapterDefinition(row, label);
  if (rawKind === 'cpu-sample') {
    const authority = BASELINE_POLICY.processAdapterRegistry.cpuSampleRawAuthorityPolicy;
    const schema = authority.schemas.find((candidate) => candidate.adapterId === row.adapterId
      && candidate.rawAdapterKind === row.rawAdapterKind);
    if (!schema || stableStringify({
      sampleFields: schema.sampleFields,
      sampleOptionalFields: schema.sampleOptionalFields,
      nestedFields: schema.nestedFields
    }) !== stableStringify({
      sampleFields: adapter.sampleFields,
      sampleOptionalFields: adapter.sampleOptionalFields,
      nestedFields: adapter.nestedFields
    })) fail(`${label} CPU raw authority schema does not match its platform adapter`);
    validateExactNestedFields(row.rawAdapterSample, authority.wrapperFields, `${label}.rawAdapterSample`);
    const { adapterSample, readStart, readEnd } = row.rawAdapterSample;
    const maximumReadDurationSeconds = BASELINE_POLICY.performanceMetricPolicy.maximumReadDurationMs / 1000;
    if (!Number.isFinite(readStart) || !Number.isFinite(readEnd) || readEnd < readStart
      || readEnd - readStart > maximumReadDurationSeconds) {
      fail(`${label}.rawAdapterSample has an invalid read bracket`);
    }
    if (row.readStart !== readStart || row.readEnd !== readEnd) {
      fail(`${label} normalized CPU read bracket does not match its raw authority wrapper`);
    }
    validateObjectSchema(adapterSample, schema.sampleFields, schema.sampleOptionalFields, schema.nestedFields, `${label}.rawAdapterSample.adapterSample`);
    const decoded = decodeAdapterRaw(adapter, adapterSample, `${label}.rawAdapterSample.adapterSample`);
    if (!decoded || row.pid !== decoded.pid || row.creationIdentity !== decoded.creationIdentity
      || row.cumulativeCpuSeconds !== decoded.cumulativeCpuSeconds || row.workingSetMiB !== decoded.workingSetMiB
      || row.counterQuantumSeconds !== decoded.counterQuantumSeconds) {
      fail(`${label} normalized CPU sample does not match its raw adapter carrier`);
    }
    return;
  }
  if (adapter.decoderRule === 'electron-app-metrics-v1' && row.observationKind === 'closure') {
    validateExactNestedFields(row.rawIdentity, ['pid', 'creationTime'], `${label}.rawIdentity`);
  } else {
    validateObjectSchema(row.rawIdentity, adapter.identityFields, adapter.identityOptionalFields, adapter.nestedFields, `${label}.rawIdentity`);
  }
  const carrierField = {
    membership: 'rawMembership',
    health: 'rawHealth',
    closure: 'rawClosure'
  }[row.observationKind];
  const schema = BASELINE_POLICY.processAdapterRegistry.processObservationSchemas.find((candidate) => (
    candidate.adapterIds.includes(row.adapterId) && candidate.observationKinds.includes(row.observationKind)
      && candidate.captureKinds.includes(row.captureKind)
  ));
  if (!schema) fail(`${label} has no process observation schema for its capture attribution`);
  let decoded = null;
  let processIdentity = null;
  if (adapter.decoderRule && adapter.decoderRule !== 'electron-app-metrics-v1') decoded = decodeAdapterRaw(adapter, row.rawIdentity, `${label}.rawIdentity`);
  if (schema.carrierSchema === 'adapter-sample') {
    decodeAdapterRaw(adapter, row[carrierField], `${label}.${carrierField}`);
    if (stableStringify(row[carrierField]) !== stableStringify(row.rawIdentity)) fail(`${label}.${carrierField} must retain the exact raw adapter carrier`);
  } else if (schema.carrierSchema === 'metric-session-audit') {
    processIdentity = validateMetricSessionAudit(row[carrierField], row, `${label}.${carrierField}`);
  } else if (schema.carrierSchema === 'electron-broker-sample') {
    processIdentity = `browser:${validateElectronBrokerSample(row[carrierField], row, `${label}.${carrierField}`)}:${row.pid}`;
  } else if (schema.carrierSchema === 'electron-root-exit') {
    processIdentity = `browser:${validateElectronRootExit(row[carrierField], row, `${label}.${carrierField}`)}:${row.pid}`;
  } else {
    validateExactNestedFields(row[carrierField], adapter.sampleFields, `${label}.${carrierField}`);
  }
  const pid = decoded?.pid ?? row.rawIdentity.pid;
  const creationIdentity = decoded?.creationIdentity ?? String(row.rawIdentity.creationTime ?? row.rawIdentity.creationIdentity);
  if (row.pid !== pid || row.creationIdentity !== creationIdentity) fail(`${label} normalized process identity does not match rawIdentity`);
  if (schema.processIdentityRule === 'renderer-external-execution') processIdentity = `renderer:${row.externalExecutionId}:${row.pid}`;
  if (schema.processIdentityRule === 'external-carrier') processIdentity = `external:${row.pid}:${row.creationIdentity}`;
  if (processIdentity !== null && row.processIdentity !== processIdentity) fail(`${label}.processIdentity does not match its policy derivation`);
}

function validateNormalizedProcessFields(row, rawKind, label) {
  if (rawKind !== 'process-observation') return;
  const registry = BASELINE_POLICY.processAdapterRegistry;
  const schema = registry.processObservationSchemas.find((candidate) => candidate.adapterIds.includes(row.adapterId)
    && candidate.observationKinds.includes(row.observationKind) && candidate.captureKinds.includes(row.captureKind));
  if (!schema) fail(`${label} has no registered process normalization rule`);
  if (!registry.processClasses.includes(row.processClass)) fail(`${label}.processClass is not registered`);
  if (!registry.ownershipClasses.includes(row.ownership)) fail(`${label}.ownership is not registered`);
  if (row.processClass !== schema.processClass || row.ownership !== schema.ownership) fail(`${label} normalized class or ownership does not match policy`);
  let expectedAlive = schema.alive ?? (row.observationKind === 'closure' ? false : true);
  let expectedHealthState = schema.healthState;
  if (row.observationKind === 'health' && schema.carrierSchema === 'registered-fields') {
    const rawHealth = row.rawHealth;
    if (!isPlainObject(rawHealth) || typeof rawHealth.alive !== 'boolean'
      || typeof rawHealth.status !== 'string' || rawHealth.status.length === 0) {
      fail(`${label}.rawHealth does not contain a live health projection`);
    }
    const live = rawHealth.alive === true
      && !['dead', 'exited', 'closed', 'terminated'].includes(rawHealth.status)
      && rawHealth.exitObservation === null;
    expectedAlive = live;
    expectedHealthState = live ? 'live' : rawHealth.status;
  }
  if (row.alive !== expectedAlive) fail(`${label}.alive does not match policy`);
  if (row.observationKind === 'health' && !registry.healthStates.includes(row.healthState)) {
    fail(`${label}.healthState is not registered`);
  }
  if (row.observationKind === 'health' && row.healthState !== expectedHealthState) fail(`${label}.healthState does not match its raw health projection`);
  if (row.observationKind === 'closure' && !registry.closureStates.includes(row.closureState)) {
    fail(`${label}.closureState is not registered`);
  }
  if (row.observationKind === 'closure' && row.closureState !== schema.closureState) fail(`${label}.closureState does not match policy`);
}

function validateControllerOperationOutcome(row, rawKind, label) {
  if (rawKind !== 'controller-operation' || !Object.hasOwn(row, 'outcome')) return;
  if (!BASELINE_POLICY.performanceControllerAuditPolicy.operationOutcomes.includes(row.outcome)) {
    fail(`${label}.outcome is not registered`);
  }
}

function validateEnvironmentCarrier(row, rawKind, label) {
  if (rawKind !== 'environment-observation') return;
  const policy = BASELINE_POLICY.performanceEnvironmentPolicy;
  const shape = policy.rawAdapterShapes.find((candidate) => candidate.source === row.source
    && candidate.rawAdapterKind === row.rawAdapterKind && candidate.observationKinds.includes(row.observationKind));
  if (!shape) fail(`${label} has no registered environment carrier shape`);
  const clockDomainMapping = policy.clockDomainMappings.find((candidate) => candidate.source === row.source
    && candidate.rawAdapterKind === row.rawAdapterKind && candidate.observationKinds.includes(row.observationKind));
  if (!clockDomainMapping || row.clockDomain !== clockDomainMapping.clockDomain) {
    fail(`${label}.clockDomain does not match its policy source/adapter/observation mapping`);
  }
  validateObjectSchema(row.rawObservation, shape.requiredFields, shape.optionalFields, {}, `${label}.rawObservation`);
  for (const [field, expected] of Object.entries(shape.literalValues ?? {})) {
    if (row.rawObservation[field] !== expected) fail(`${label}.rawObservation.${field} does not match its policy literal`);
  }
  if (shape.projectionRule === 'electron-current-state') {
    if (row.observedAt !== row.rawObservation.capturedAt || row.sourceSequence !== row.rawObservation.callSequence) {
      fail(`${label} Electron environment ordering does not match its raw sample`);
    }
    if ('dynamicState' in row && stableStringify(row.dynamicState) !== stableStringify(row.rawObservation.currentState)) {
      fail(`${label}.dynamicState does not match rawObservation.currentState`);
    }
    if ('staticIdentity' in row && stableStringify(row.staticIdentity) !== stableStringify(row.rawObservation.currentState)) {
      fail(`${label}.staticIdentity does not match rawObservation.currentState`);
    }
  } else if (shape.projectionRule === 'host-snapshot') {
    validateExactNestedFields(row.rawObservation.staticIdentity, policy.staticIdentityFields, `${label}.rawObservation.staticIdentity`);
    validateExactNestedFields(row.rawObservation.dynamicState, policy.dynamicStateFields, `${label}.rawObservation.dynamicState`);
    if ('dynamicState' in row && stableStringify(row.dynamicState) !== stableStringify(row.rawObservation.dynamicState)) {
      fail(`${label}.dynamicState does not match its host snapshot carrier`);
    }
    if ('staticIdentity' in row && stableStringify(row.staticIdentity) !== stableStringify(row.rawObservation.staticIdentity)) {
      fail(`${label}.staticIdentity does not match its host snapshot carrier`);
    }
  } else if (shape.projectionRule === 'host-transition') {
    validateExactNestedFields(row.rawObservation.previousDynamicState, policy.dynamicStateFields, `${label}.rawObservation.previousDynamicState`);
    validateExactNestedFields(row.rawObservation.currentDynamicState, policy.dynamicStateFields, `${label}.rawObservation.currentDynamicState`);
    if (stableStringify(row.rawObservation.previousDynamicState) === stableStringify(row.rawObservation.currentDynamicState)
      || row.eventName !== row.rawObservation.eventName
      || stableStringify(row.dynamicState) !== stableStringify(row.rawObservation.currentDynamicState)) {
      fail(`${label} host transition projection does not match its two raw states`);
    }
  } else if (shape.projectionRule === 'host-cleanup') {
    assertSafeInteger(row.rawObservation.lastSourceSequence, `${label}.rawObservation.lastSourceSequence`, 1);
    if (row.cleanupState !== row.rawObservation.cleanupState
      || row.sourceSequence !== row.rawObservation.lastSourceSequence + 1) {
      fail(`${label} host cleanup projection does not match its raw cleanup carrier`);
    }
  } else if (shape.projectionRule === 'renderer-used-bytes') {
    if (row.usedBytes !== row.rawObservation.usedBytes || row.observedAt !== row.rawObservation.observedAt) {
      fail(`${label} renderer heap projection does not match its raw observation`);
    }
  } else if (shape.projectionRule === 'renderer-unavailable') {
    if (row.rawObservation.availability !== 'unavailable' || row.reason !== row.rawObservation.unavailableReason
      || !policy.rendererHeapUnavailableReasons.includes(row.reason)) {
      fail(`${label} renderer heap unavailable projection does not match its raw observation`);
    }
  }
  if (row.observationKind === 'event' && row.source === 'electron-main' && !policy.electronEventNames.includes(row.eventName)) {
    fail(`${label}.eventName is not registered`);
  }
}

function validateControllerCarrier(row, rawKind, label) {
  if (rawKind !== 'controller-operation') return;
  const policy = BASELINE_POLICY.performanceControllerAuditPolicy;
  if (!policy.operationKinds.includes(row.operationKind) || !policy.clockDomains.includes(row.clockDomain)) {
    fail(`${label} has an unregistered operation kind or clock domain`);
  }
  if (row.operationKind === 'request') {
    if (!policy.channels.includes(row.channel) || !policy.requestKinds.includes(row.requestKind)) fail(`${label} request discriminator is not registered`);
    validateExactNestedFields(row.rawRequest, policy.requestPayloadFields[row.requestKind], `${label}.rawRequest`);
  } else if (row.operationKind === 'response') {
    if (!policy.channels.includes(row.channel) || !policy.responseKinds.includes(row.responseKind)) fail(`${label} response discriminator is not registered`);
    validateExactNestedFields(row.rawResponse, policy.responsePayloadFields[row.responseKind], `${label}.rawResponse`);
  } else if (row.operationKind === 'broker-sample') {
    if (!policy.sampleKinds.includes(row.sampleKind)) fail(`${label}.sampleKind is not registered`);
    validateExactNestedFields(row.rawSample, policy.brokerSampleFields, `${label}.rawSample`);
    if (row.brokerSequence !== row.rawSample.callSequence || row.sampleKind !== row.rawSample.purpose || row.observedAt !== row.rawSample.capturedAt) {
      fail(`${label} broker projection does not match its raw sample`);
    }
  } else if (row.operationKind === 'control-write') {
    if (!policy.writeKinds.includes(row.writeKind) || !isPlainObject(row.rawWrite)
      || row.rawWrite.kind !== row.writeKind || row.rawWrite.observedAt !== row.writtenAt) {
      fail(`${label} control-write projection does not match its raw write`);
    }
    if (row.writeKind === 'backend-ready') {
      validateExactNestedFields(row.rawWrite, policy.backendReadyFields, `${label}.rawWrite`);
      if (!['canvas2d', 'webgpu'].includes(row.rawWrite.requestedBackend)
        || !['canvas2d', 'webgpu'].includes(row.rawWrite.selectedBackend)
        || !policy.backendSelectionReasons.includes(row.rawWrite.selectionReason)) fail(`${label} backend-ready discriminator is invalid`);
      const identity = row.rawWrite.backendExecutionIdentity;
      if (row.rawWrite.selectedBackend === 'canvas2d') {
        if (identity !== null) fail(`${label} Canvas backend-ready identity must be null`);
      } else {
        validateExactNestedFields(identity, ['backend', 'driver', 'workerProtocol', 'adapterIdentity', 'limits', 'isFallbackAdapter', 'powerPreference'], `${label}.rawWrite.backendExecutionIdentity`);
        validateExactNestedFields(identity.adapterIdentity, ['vendor', 'architecture', 'device', 'description'], `${label}.rawWrite.backendExecutionIdentity.adapterIdentity`);
        validateExactNestedFields(identity.limits, ['maxTextureDimension2D', 'maxBindGroups'], `${label}.rawWrite.backendExecutionIdentity.limits`);
        if (identity.backend !== 'webgpu' || identity.driver !== 'webgpu-driver-v1'
          || identity.workerProtocol !== 'webgpu-worker-ready-v1'
          || !['low-power', 'high-performance'].includes(identity.powerPreference)) fail(`${label} backend-ready execution identity is invalid`);
        assertSafeInteger(identity.limits.maxTextureDimension2D, `${label}.rawWrite.backendExecutionIdentity.limits.maxTextureDimension2D`, 1);
        assertSafeInteger(identity.limits.maxBindGroups, `${label}.rawWrite.backendExecutionIdentity.limits.maxBindGroups`, 1);
      }
    }
  } else {
    if (!policy.lifecyclePhases.includes(row.lifecyclePhase)) fail(`${label}.lifecyclePhase is not registered`);
    validateObjectSchema(row.rawLifecycleEvent, policy.lifecycleEventRequiredFields, policy.lifecycleEventOptionalFields, {}, `${label}.rawLifecycleEvent`);
    if (row.rawLifecycleEvent.event !== row.lifecyclePhase || row.rawLifecycleEvent.at !== row.observedAt) {
      fail(`${label} lifecycle projection does not match its raw event`);
    }
  }
}

function validateRawRowShape(row, rawKind, label) {
  const chunkPolicy = BASELINE_POLICY.performanceEvidenceChunkPolicy;
  const definition = chunkPolicy.rawKinds[rawKind];
  const shapes = definition?.rowShapes;
  if (!Array.isArray(shapes) || shapes.length === 0) fail(`${label} raw kind has no policy row shapes`);
  const matchingShapes = shapes.filter((shape) => matchesRawRowShape(row, shape));
  if (matchingShapes.length !== 1) fail(`${label} matches ${matchingShapes.length} policy row shapes`);
  const expectedKeys = new Set([...chunkPolicy.runBindingFields, ...matchingShapes[0].fields]);
  for (const key of Object.keys(row)) if (!expectedKeys.has(key)) fail(`${label} has an unknown field ${key}`);
  for (const key of expectedKeys) if (!(key in row)) fail(`${label} is missing ${key}`);
  for (const [field, expected] of Object.entries(definition.literalValues ?? {})) {
    if (row[field] !== expected) fail(`${label}.${field} does not match its policy literal`);
  }
  validateRawAdapterCarrier(row, rawKind, label);
  validateNormalizedProcessFields(row, rawKind, label);
  validateControllerOperationOutcome(row, rawKind, label);
  validateEnvironmentCarrier(row, rawKind, label);
  validateControllerCarrier(row, rawKind, label);
  const fieldRules = definition.buildFieldRules?.[row.buildVariant] ?? {};
  for (const [field, rule] of Object.entries(fieldRules)) {
    if (rule === 'null' && row[field] !== null) fail(`${label}.${field} must be null`);
    if (rule === 'nonempty' && (typeof row[field] !== 'string' || row[field].length === 0)) fail(`${label}.${field} must be nonempty`);
    if (rule === 'positive-token' && (!Number.isSafeInteger(row[field]) || row[field] < 1)) fail(`${label}.${field} must be a positive safe-integer token`);
    if (rule === 'null-when-present' && field in row && row[field] !== null) fail(`${label}.${field} must be null when present`);
    if (typeof rule !== 'string' && row[field] !== rule) fail(`${label}.${field} does not match its build rule`);
  }
}

function rowsForKind(groups, rawKind) {
  return groups.find((group) => group.rawKind === rawKind)?.rows ?? [];
}

function requireContiguous(rows, field, label, start = 1) {
  const ordered = [...rows].sort((left, right) => left[field] - right[field]);
  ordered.forEach((row, index) => {
    if (row[field] !== start + index) fail(`${label}.${field} must be contiguous from ${start}`);
  });
}

function requireContiguousBy(rows, field, keyFor, label) {
  const domains = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    const domain = domains.get(key) ?? [];
    domain.push(row);
    domains.set(key, domain);
  }
  for (const [key, domain] of domains) requireContiguous(domain, field, `${label}[${key}]`);
}

function validateProcessReplay(rows, label) {
  if (rows.length === 0) return;
  requireContiguous(rows, 'observationOrdinal', label);
  const identities = new Map();
  for (const row of rows) {
    const key = `${row.pid}\0${row.creationIdentity}\0${row.processIdentity}`;
    const state = identities.get(key);
    if (row.observationKind === 'membership') {
      if (state) fail(`${label} process identity has duplicate membership`);
      identities.set(key, { closed: false });
    } else {
      if (!state) fail(`${label} process identity is observed before membership`);
      if (state.closed) fail(`${label} process identity is observed after closure`);
      if (row.observationKind === 'closure') state.closed = true;
    }
  }
}

function validateEnvironmentReplay(rows, label) {
  if (rows.length === 0) return;
  requireContiguous(rows, 'runnerReceiptSequence', `${label}.receipt`);
  requireContiguousBy(rows, 'sourceSequence', (row) => row.source, `${label}.source`);
  const initialBySource = new Set();
  for (const row of [...rows].sort((left, right) => left.runnerReceiptSequence - right.runnerReceiptSequence)) {
    if (row.observationKind === 'initial-snapshot') {
      if (initialBySource.has(row.source)) fail(`${label} source has duplicate initial snapshots`);
      initialBySource.add(row.source);
    } else if (!['renderer-heap', 'renderer-heap-unavailable'].includes(row.observationKind)
      && !initialBySource.has(row.source)) {
      fail(`${label} source is observed before its initial snapshot`);
    }
  }
  for (const source of new Set(rows.map((row) => row.source))) {
    const sourceRows = rows.filter((row) => row.source === source)
      .sort((left, right) => left.sourceSequence - right.sourceSequence);
    const cleanupRows = sourceRows.filter((row) => row.observationKind === 'cleanup');
    if (cleanupRows.length > 1 || (cleanupRows.length === 1 && sourceRows.at(-1) !== cleanupRows[0])) {
      fail(`${label} source cleanup must be the unique terminal source high-water`);
    }
    if (cleanupRows.length === 1
      && cleanupRows[0].rawObservation.lastSourceSequence !== sourceRows.at(-2)?.sourceSequence) {
      fail(`${label} source cleanup does not seal the preceding source high-water`);
    }
  }
}

function validateControllerReplay(rows, label, { captureKind, scopeKind, join }) {
  const harnessMeasurement = scopeKind === 'run'
    && ['sentinel', 'workload'].includes(captureKind)
    && ['harness-control', 'instrumented'].includes(join.buildVariant);
  if (rows.length === 0) {
    if (harnessMeasurement) fail(`${label} harness run requires exactly one backend-ready control write`);
    return;
  }
  requireContiguous(rows, 'controlSequence', label);
  const requests = new Map();
  const responses = new Set();
  let finalized = false;
  for (const row of rows) {
    if (finalized) fail(`${label} contains activity after controller finalization`);
    if (row.operationKind === 'request') {
      if (requests.has(row.controllerRequestId)) fail(`${label} duplicates controller request ${row.controllerRequestId}`);
      requests.set(row.controllerRequestId, row);
    } else if (row.operationKind === 'response') {
      const request = requests.get(row.controllerRequestId);
      if (!request || responses.has(row.controllerRequestId) || request.channel !== row.channel) {
        fail(`${label} response has no unique matching request`);
      }
      responses.add(row.controllerRequestId);
    } else if (row.operationKind === 'controller-lifecycle' && row.lifecyclePhase === 'finalize') {
      finalized = true;
    }
  }
  for (const requestId of requests.keys()) if (!responses.has(requestId)) fail(`${label} request ${requestId} has no terminal response`);
  if (harnessMeasurement) {
    const readiness = rows.filter((row) => row.operationKind === 'control-write' && row.writeKind === 'backend-ready');
    if (readiness.length !== 1) fail(`${label} harness run requires exactly one backend-ready control write`);
    if (readiness[0].rawWrite.launchId !== join.launchId) fail(`${label} backend-ready control write does not bind the run launch`);
  }
}

function validateSourceReplay(groups, join, label) {
  const sourceRows = rowsForKind(groups, 'source-opportunity');
  if (join.comparisonKind !== 'instrumentation-overhead') {
    if (sourceRows.length > 0) fail(`${label} source rows are forbidden outside instrumentation overhead`);
    return;
  }
  if (sourceRows.length === 0) fail(`${label} instrumentation workload requires source rows`);
  const bySequence = new Map();
  for (const row of sourceRows) {
    const domain = bySequence.get(row.sourceSequence) ?? [];
    domain.push(row);
    bySequence.set(row.sourceSequence, domain);
  }
  requireContiguous([...bySequence.keys()].map((sourceSequence) => ({ sourceSequence })), 'sourceSequence', `${label}.source`);
  for (const [sourceSequence, rows] of bySequence) {
    const source = rows.filter((row) => row.eventKind === 'source-opportunity');
    const branch = rows.filter((row) => row.eventKind === 'session-branch');
    const advisory = rows.filter((row) => row.eventKind === 'advisory-disposition');
    if (source.length !== 1 || advisory.length !== 1 || branch.length > 1) {
      fail(`${label} source ${sourceSequence} must contain one source, optional branch, and one advisory`);
    }
    const ordered = [...rows].sort((left, right) => left.captureOrdinal - right.captureOrdinal);
    if (ordered[0].eventKind !== 'source-opportunity' || ordered.at(-1).eventKind !== 'advisory-disposition'
      || (ordered.length === 3 && ordered[1].eventKind !== 'session-branch')) {
      fail(`${label} source ${sourceSequence} row order is invalid`);
    }
    for (const row of rows) {
      for (const key of ['launchId', 'measurementWindowId', 'measurementEpochId', 'diagnosticFrameId']) {
        if (row[key] !== source[0][key]) fail(`${label} source ${sourceSequence} changes ${key}`);
      }
    }
  }
}

function validateCaptureOrdinalReplay(groups, label) {
  const rows = groups.flatMap((group) => group.rows.filter((row) => Object.hasOwn(row, 'captureOrdinal')));
  if (rows.length > 0) requireContiguous(rows, 'captureOrdinal', `${label}.globalCapture`);
}

function isPositiveFrameToken(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function validateWorkloadCaptureStateMachine(groups, label) {
  const sourceRows = rowsForKind(groups, 'source-opportunity');
  const backendRows = rowsForKind(groups, 'backend-operation');
  const workerRows = rowsForKind(groups, 'worker-message');
  const sourceSequences = new Set(sourceRows.map((row) => row.sourceSequence));
  for (const row of [...backendRows, ...workerRows]) {
    if (!sourceSequences.has(row.sourceSequence)) fail(`${label} workload operation has no source opportunity`);
  }
  const grouped = (rows, predicate = () => true) => {
    const values = new Map();
    for (const row of rows) {
      if (!predicate(row)) continue;
      const bucket = values.get(row.sourceSequence) ?? [];
      bucket.push(row);
      values.set(row.sourceSequence, bucket);
    }
    return values;
  };
  const sourcesBySequence = grouped(sourceRows, (row) => row.eventKind === 'source-opportunity');
  const branchesBySequence = grouped(sourceRows, (row) => row.eventKind === 'session-branch');
  const advisoriesBySequence = grouped(sourceRows, (row) => row.eventKind === 'advisory-disposition');
  const backendsBySequence = grouped(backendRows);
  const workersBySequence = grouped(workerRows);
  for (const sourceSequence of sourceSequences) {
    const source = sourcesBySequence.get(sourceSequence) ?? [];
    const branches = branchesBySequence.get(sourceSequence) ?? [];
    const advisories = advisoriesBySequence.get(sourceSequence) ?? [];
    const backends = backendsBySequence.get(sourceSequence) ?? [];
    const workers = workersBySequence.get(sourceSequence) ?? [];
    if (source.length !== 1 || advisories.length !== 1 || branches.length > 1 || backends.length > 1 || workers.length > 1) {
      fail(`${label} source ${sourceSequence} does not have a unique capture state`);
    }
    const sourceOrdinal = source[0].captureOrdinal;
    const advisoryOrdinal = advisories[0].captureOrdinal;
    for (const synchronous of [...branches, ...backends]) {
      if (synchronous.captureOrdinal <= sourceOrdinal || synchronous.captureOrdinal >= advisoryOrdinal) {
        fail(`${label} source ${sourceSequence} synchronous capture must occur after source and before advisory`);
      }
    }
    for (const worker of workers) {
      if (worker.captureOrdinal <= advisoryOrdinal) {
        fail(`${label} source ${sourceSequence} worker terminal must occur after advisory`);
      }
    }
    for (const row of [...branches, ...advisories, ...backends, ...workers]) {
      for (const key of ['launchId', 'measurementWindowId', 'measurementEpochId', 'diagnosticFrameId']) {
        if (row[key] !== source[0][key]) fail(`${label} source ${sourceSequence} changes ${key}`);
      }
    }
    const branch = branches[0];
    const backend = backends[0];
    const worker = workers[0];
    const advisory = advisories[0];
    const webGpuDelegated = branch?.framePostOutcome === 'posted';
    const canvasDelegated = branch !== undefined && branch.canvasDrawOutcome !== 'not-applicable';
    if (webGpuDelegated && canvasDelegated) fail(`${label} source ${sourceSequence} delegates to multiple backends`);
    if (webGpuDelegated) {
      if (!backend || backend.operationId !== 'webgpu-frame-submit' || !worker
        || !isPositiveFrameToken(backend.frameToken) || backend.frameToken !== worker.frameToken
        || backend.frameToken !== advisory.advisoryFrameToken) {
        fail(`${label} source ${sourceSequence} WebGPU delegation token or terminal conservation is invalid`);
      }
    } else if (canvasDelegated) {
      if (!backend || backend.operationId !== 'canvas-draw-call' || worker
        || backend.frameToken !== null || advisory.advisoryFrameToken !== null) {
        fail(`${label} source ${sourceSequence} Canvas delegation state is invalid`);
      }
    } else if (backend || worker || advisory.advisoryFrameToken !== null) {
      fail(`${label} source ${sourceSequence} records backend activity without a delegated session branch`);
    }
  }
}

function validateSentinelReplay(groups, join, label) {
  if (join.comparisonKind !== 'harness-overhead') return;
  const observations = rowsForKind(groups, 'sentinel-observation');
  const callbacks = observations.filter((row) => row.observationKind === 'callback');
  const backend = rowsForKind(groups, 'backend-operation');
  const messages = rowsForKind(groups, 'worker-message');
  requireContiguous(callbacks, 'callbackOrdinal', `${label}.callback`);
  requireContiguous(messages, 'messageOrdinal', `${label}.message`);
  if (backend.length !== callbacks.length || backend.some((row, index) => row.callbackOrdinal !== callbacks[index]?.callbackOrdinal)) {
    fail(`${label} sentinel callback/backend operation mapping is not bijective`);
  }
  const boundaries = observations.filter((row) => row.observationKind === 'boundary').map((row) => row.boundary);
  if (stableStringify(boundaries) !== stableStringify(['window-start', 'window-close'])) fail(`${label} sentinel boundaries are invalid`);
  const pending = observations.filter((row) => row.observationKind === 'pending');
  if (pending.length !== 1 || pending[0].pendingCount !== 0) fail(`${label} sentinel terminal pending count must be zero`);
  if (observations.filter((row) => row.observationKind === 'closure').length !== 1) fail(`${label} sentinel requires one terminal closure`);
  if (observations.some((row) => row.observationKind === 'error')) fail(`${label} sentinel error rows are not publishable`);
  if (join.backend === 'webgpu' && messages.length !== backend.length) fail(`${label} WebGPU sentinel acknowledgements are not conserved`);
}

function validateCpuReplay(groups, label) {
  const rows = rowsForKind(groups, 'cpu-sample');
  if (rows.length === 0) return;
  requireContiguous(rows, 'ordinal', label);
  const phasePolicy = BASELINE_POLICY.processAdapterRegistry.cpuSampleRawAuthorityPolicy.samplePhaseDerivation;
  const identity = rows[0];
  let priorReadEnd = -Infinity;
  for (const [index, row] of rows.entries()) {
    const expectedPhase = index === 0
      ? phasePolicy.firstOrdinal
      : index === rows.length - 1 ? phasePolicy.terminalOrdinal : phasePolicy.interiorOrdinals;
    if (row.samplePhase !== expectedPhase) {
      fail(`${label} CPU phase does not match its ordinal and immutable measurement boundaries`);
    }
    if (row.adapterId !== identity.adapterId || row.pid !== identity.pid
      || row.creationIdentity !== identity.creationIdentity || row.processIdentity !== identity.processIdentity) {
      fail(`${label} CPU stream changes process or adapter identity`);
    }
    if (!Number.isFinite(row.readStart) || !Number.isFinite(row.readEnd) || row.readEnd < row.readStart
      || row.readStart < priorReadEnd) fail(`${label} CPU read brackets are invalid or overlapping`);
    priorReadEnd = row.readEnd;
  }
  const memberships = rowsForKind(groups, 'process-observation').filter((row) => row.observationKind === 'membership'
    && row.adapterId === identity.adapterId && row.pid === identity.pid
    && row.creationIdentity === identity.creationIdentity && row.processIdentity === identity.processIdentity);
  if (memberships.length !== 1) fail(`${label} CPU stream does not bind one exact process membership`);
}

function validateTimingReplay(groups, label) {
  const timings = rowsForKind(groups, 'timing-span');
  requireContiguousBy(timings, 'spanOrdinal', (row) => `${row.sourceSequence}\0${row.metricId}`, `${label}.timing`);
  const timingIds = new Set();
  const timingsById = new Map();
  for (const row of timings) {
    if (timingIds.has(row.timingSpanId) || !Number.isFinite(row.startedAt) || !Number.isFinite(row.endedAt) || row.endedAt < row.startedAt) {
      fail(`${label} timing span identity or interval is invalid`);
    }
    timingIds.add(row.timingSpanId);
    timingsById.set(row.timingSpanId, row);
  }
  for (const row of rowsForKind(groups, 'backend-operation').filter((entry) => entry.comparisonKind === 'instrumentation-overhead')) {
    if (row.timingSpanId === null) continue;
    const timing = timingsById.get(row.timingSpanId);
    if (!timing || timing.measurementWindowId !== row.measurementWindowId
      || timing.measurementEpochId !== row.measurementEpochId
      || timing.sourceSequence !== row.sourceSequence
      || timing.frameToken !== row.frameToken) {
      fail(`${label} backend operation does not bind one exact timing span`);
    }
  }
}

function validateAllocationByteSemantics(row, coverage, label) {
  if (coverage.byteSemantics === 'rgba-transfer-footprint') {
    if (row.byteValue !== row.sourceWidth * row.sourceHeight * 4) fail(`${label} RGBA byte footprint is invalid`);
  } else if (coverage.byteSemantics === 'requested-byte-length') {
    if (row.byteValue !== row.requestedByteLength) fail(`${label} requested byte footprint is invalid`);
  } else if (coverage.byteSemantics === 'descriptor-size') {
    if (row.byteValue !== row.descriptorSize) fail(`${label} descriptor byte footprint is invalid`);
  } else if (coverage.byteSemantics === 'logical-texel-footprint') {
    if (!isPlainObject(row.textureDescriptor) || row.byteValue !== row.textureDescriptor.logicalTexelFootprint) {
      fail(`${label} logical texel footprint is invalid`);
    }
  } else if (row.byteValue !== null) {
    fail(`${label} count-only allocation evidence must use a null byteValue`);
  }
}

function validateAllocationReplay(groups, join, label) {
  const frameRows = rowsForKind(groups, 'frame-request');
  const lifecycleRows = rowsForKind(groups, 'lifecycle-request');
  const coverage = BASELINE_POLICY.allocationEvidencePolicy.webgpu.coverage;
  const sourceRows = rowsForKind(groups, 'source-opportunity').filter((row) => row.eventKind === 'source-opportunity');
  const advisoryRows = rowsForKind(groups, 'source-opportunity').filter((row) => row.eventKind === 'advisory-disposition');
  const sourceBySequence = new Map(sourceRows.map((row) => [row.sourceSequence, row]));
  const advisoryBySequence = new Map(advisoryRows.map((row) => [row.sourceSequence, row]));
  requireContiguousBy(frameRows, 'requestOrdinal', (row) => `${row.measurementWindowId}\0${row.measurementEpochId}\0${row.sourceSequence}`, `${label}.frameRequest`);
  for (const [index, row] of frameRows.entries()) {
    const rule = coverage.find((candidate) => candidate.operationId === row.operationId
      && candidate.sourceLocationId === row.sourceLocationId && candidate.carrier === 'frame-request');
    if (!rule) fail(`${label}.frameRequest[${index}] is not registered allocation evidence`);
    const source = sourceBySequence.get(row.sourceSequence);
    const advisory = advisoryBySequence.get(row.sourceSequence);
    const bitmapRequest = row.operationId === 'video-frame-image-bitmap-request';
    const failedBeforeToken = bitmapRequest && ['failed', 'rejected'].includes(row.outcome);
    if ((failedBeforeToken && row.frameToken !== null)
      || (!failedBeforeToken && !isPositiveFrameToken(row.frameToken))) {
      fail(`${label}.frameRequest[${index}] has an invalid frame-token state`);
    }
    if (!source || source.measurementWindowId !== row.measurementWindowId || source.measurementEpochId !== row.measurementEpochId
      || source.diagnosticFrameId !== row.diagnosticFrameId || !advisory || advisory.advisoryFrameToken !== row.frameToken) {
      fail(`${label}.frameRequest[${index}] does not bind its source opportunity and advisory token`);
    }
    validateAllocationByteSemantics(row, rule, `${label}.frameRequest[${index}]`);
  }
  requireContiguousBy(lifecycleRows, 'phaseSequence', (row) => `${row.runId}\0${row.executionId}\0${row.lifecyclePhase}`, `${label}.lifecyclePhase`);
  requireContiguousBy(lifecycleRows, 'requestOrdinal', (row) => `${row.runId}\0${row.executionId}\0${row.lifecyclePhase}\0${row.operationId}\0${row.sourceLocationId}`, `${label}.lifecycleRequest`);
  for (const [index, row] of lifecycleRows.entries()) {
    const rule = coverage.find((candidate) => candidate.operationId === row.operationId
      && candidate.sourceLocationId === row.sourceLocationId && candidate.carrier === 'lifecycle-request');
    if (!rule || (rule.lifecyclePhase && rule.lifecyclePhase !== row.lifecyclePhase)) {
      fail(`${label}.lifecycleRequest[${index}] is not registered allocation evidence`);
    }
    validateAllocationByteSemantics(row, rule, `${label}.lifecycleRequest[${index}]`);
  }
  if ((frameRows.length > 0 || lifecycleRows.length > 0)
    && (join.backend !== 'webgpu' || join.buildVariant !== 'instrumented')) fail(`${label} allocation rows are outside the instrumented WebGPU domain`);
}

export function validatePerformanceCaptureRawGrammar(groups, {
  captureKind,
  scopeKind,
  join = {},
  label = 'performance capture raw grammar'
} = {}) {
  validateCaptureOrdinalReplay(groups, label);
  validateProcessReplay(rowsForKind(groups, 'process-observation'), `${label}.process`);
  validateEnvironmentReplay(rowsForKind(groups, 'environment-observation'), `${label}.environment`);
  validateControllerReplay(rowsForKind(groups, 'controller-operation'), `${label}.controller`, {
    captureKind,
    scopeKind,
    join
  });
  if (scopeKind === 'run') {
    if (captureKind === 'workload') {
      validateSourceReplay(groups, join, label);
      validateWorkloadCaptureStateMachine(groups, label);
      validateTimingReplay(groups, label);
      validateAllocationReplay(groups, join, label);
    }
    if (captureKind === 'sentinel') validateSentinelReplay(groups, join, label);
    if (captureKind === 'external-metric') validateCpuReplay(groups, `${label}.cpu`);
  }
  return groups;
}

export function validatePerformanceScopedRawRow(row, rawKind, scopeKind, { label = 'performance scoped raw row' } = {}) {
  if (!isPlainObject(row)) fail(`${label} must be an object`);
  const definition = BASELINE_POLICY.performanceEvidenceChunkPolicy.rawKinds[rawKind];
  if (!definition) fail(`${label} raw kind is invalid`);
  const bindingShapes = definition.bindingShapes;
  if (!Array.isArray(bindingShapes)) fail(`${label} raw kind is not permitted outside a run`);
  const binding = bindingShapes.find((candidate) => candidate.scopeKind === scopeKind);
  if (!binding) fail(`${label} scope kind is not permitted for ${rawKind}`);
  const matchingShapes = definition.rowShapes.filter((shape) => matchesRawRowShape(row, shape));
  if (matchingShapes.length !== 1) fail(`${label} matches ${matchingShapes.length} policy row shapes`);
  const expectedKeys = new Set([...binding.fields, ...matchingShapes[0].fields]);
  for (const key of Object.keys(row)) if (!expectedKeys.has(key)) fail(`${label} has an unknown field ${key}`);
  for (const key of expectedKeys) if (!(key in row)) fail(`${label} is missing ${key}`);
  for (const [field, expected] of Object.entries(definition.literalValues ?? {})) {
    if (row[field] !== expected) fail(`${label}.${field} does not match its policy literal`);
  }
  validateRawAdapterCarrier(row, rawKind, label);
  validateNormalizedProcessFields(row, rawKind, label);
  validateControllerOperationOutcome(row, rawKind, label);
  validateEnvironmentCarrier(row, rawKind, label);
  validateControllerCarrier(row, rawKind, label);
  return Object.freeze(cloneJson(row, label));
}

function expectedLaunchVariants(comparisonKind, pairIndex) {
  const canonicalVariants = PERFORMANCE_PAIR_BUILD_VARIANTS[comparisonKind];
  if (!canonicalVariants) fail(`pair comparison kind ${comparisonKind} is invalid`);
  return pairIndex % 2 === 1 ? canonicalVariants : [...canonicalVariants].reverse();
}

function freezePairPlan(value) {
  return Object.freeze({
    ...value,
    pairs: Object.freeze(value.pairs.map((pair) => Object.freeze({
      ...pair,
      attempts: Object.freeze(pair.attempts.map((attempt) => Object.freeze({
        ...attempt,
        launches: Object.freeze(attempt.launches.map((launch) => Object.freeze({ ...launch })))
      })))
    })))
  });
}

function performancePairPlanBody({ experimentId, backend, pairs }) {
  return {
    schemaVersion: PERFORMANCE_PAIR_PLAN_SCHEMA_VERSION,
    experimentId,
    backend,
    pairs
  };
}

/**
 * Creates the closed, balanced launch order for one backend family. The
 * immutable plan separates order from pair identity: every side remains
 * ledger-addressable even when the cold-launch order alternates.
 *
 * @param {{
 *   experimentId: string,
 *   backend: 'canvas2d' | 'webgpu',
 *   createSessionId?: () => string
 * }} options
 */
export function createPerformancePairPlan({
  experimentId,
  backend,
  createSessionId = () => crypto.randomUUID()
} = {}) {
  assertUuid(experimentId, 'performance pair plan experimentId');
  if (!BACKENDS.has(backend)) fail('performance pair plan backend is invalid');
  if (typeof createSessionId !== 'function') {
    fail('performance pair plan session ID factory must be a function');
  }

  const sessionTokens = new Set();
  const pairs = [];
  for (const comparisonKind of Object.keys(PERFORMANCE_PAIR_CARDINALITIES)) {
    const pairCount = PERFORMANCE_PAIR_CARDINALITIES[comparisonKind];
    for (let pairIndex = 1; pairIndex <= pairCount; pairIndex += 1) {
      const attempts = [];
      for (let attemptIndex = 1; attemptIndex <= PERFORMANCE_PAIR_ATTEMPT_CARDINALITY; attemptIndex += 1) {
        const sessionToken = createSessionId();
        assertNonemptyString(sessionToken, 'performance pair plan metric session ID');
        if (sessionTokens.has(sessionToken)) {
          fail('performance pair plan session IDs must be unique');
        }
        sessionTokens.add(sessionToken);
        const launches = expectedLaunchVariants(comparisonKind, pairIndex).map((buildVariant, index) => ({
          comparisonSide: index === 0 ? 'A' : 'B',
          executionOrdinal: index + 1,
          buildVariant
        }));
        attempts.push({
          attemptIndex,
          metricSessionId: `${experimentId}:${comparisonKind}:${backend}:pair-${pairIndex}:attempt-${attemptIndex}:${sessionToken}`,
          launches
        });
      }
      pairs.push({
        comparisonKind,
        backend,
        pairIndex,
        attempts
      });
    }
  }
  const body = performancePairPlanBody({ experimentId, backend, pairs });
  return freezePairPlan({
    ...body,
    checksum: canonicalSha256(body)
  });
}

/**
 * Validates the runner-authored initial pair schedule before an E2E executor
 * uses it. Every possible attempt is preallocated; execution may consume only
 * a policy-valid contiguous prefix.
 */
export function validatePerformancePairPlan(value) {
  assertExactKeys(value, ['schemaVersion', 'experimentId', 'backend', 'pairs', 'checksum'], 'performance pair plan');
  if (value.schemaVersion !== PERFORMANCE_PAIR_PLAN_SCHEMA_VERSION) fail('performance pair plan schema version is invalid');
  assertUuid(value.experimentId, 'performance pair plan experimentId');
  if (!BACKENDS.has(value.backend)) fail('performance pair plan backend is invalid');
  assertSha256(value.checksum, 'performance pair plan checksum');
  if (!Array.isArray(value.pairs)) fail('performance pair plan pairs must be an array');

  const expectedPairCount = Object.values(PERFORMANCE_PAIR_CARDINALITIES).reduce((total, count) => total + count, 0);
  if (value.pairs.length !== expectedPairCount) {
    fail(`performance pair plan requires exactly ${expectedPairCount} pairs`);
  }
  const metricSessionIds = new Set();
  const pairs = [];
  let offset = 0;
  for (const comparisonKind of Object.keys(PERFORMANCE_PAIR_CARDINALITIES)) {
    for (let pairIndex = 1; pairIndex <= PERFORMANCE_PAIR_CARDINALITIES[comparisonKind]; pairIndex += 1) {
      const pair = value.pairs[offset++];
      assertExactKeys(pair, ['comparisonKind', 'backend', 'pairIndex', 'attempts'], `performance pair plan pair ${offset}`);
      if (pair.comparisonKind !== comparisonKind) {
        fail('performance pair plan comparison kinds must remain grouped and ordered');
      }
      if (pair.backend !== value.backend) fail('performance pair plan pair backend does not match the plan');
      if (pair.pairIndex !== pairIndex) fail('performance pair plan pair indices must be contiguous from one');
      const expectedVariants = expectedLaunchVariants(comparisonKind, pairIndex);
      if (!Array.isArray(pair.attempts) || pair.attempts.length !== PERFORMANCE_PAIR_ATTEMPT_CARDINALITY) {
        fail(`performance pair plan pair must preallocate exactly ${PERFORMANCE_PAIR_ATTEMPT_CARDINALITY} attempts`);
      }
      const attempts = pair.attempts.map((attempt, attemptOffset) => {
        assertExactKeys(attempt, ['attemptIndex', 'metricSessionId', 'launches'], `performance pair plan pair ${offset} attempt ${attemptOffset + 1}`);
        const attemptIndex = attemptOffset + 1;
        if (attempt.attemptIndex !== attemptIndex) fail('performance pair plan attempt indices must be contiguous from one');
        assertNonemptyString(attempt.metricSessionId, 'performance pair plan metric session ID');
        if (metricSessionIds.has(attempt.metricSessionId)) fail('performance pair plan metric session IDs must be globally unique');
        metricSessionIds.add(attempt.metricSessionId);
        if (!Array.isArray(attempt.launches) || attempt.launches.length !== 2) {
          fail('performance pair plan attempt must contain exactly two launches');
        }
        const launches = attempt.launches.map((launch, launchIndex) => {
          assertExactKeys(launch, ['comparisonSide', 'executionOrdinal', 'buildVariant'], `performance pair plan pair ${offset} attempt ${attemptIndex} launch ${launchIndex + 1}`);
          const comparisonSide = launchIndex === 0 ? 'A' : 'B';
          if (launch.comparisonSide !== comparisonSide || !COMPARISON_SIDES.has(launch.comparisonSide)) {
            fail('performance pair plan launch side is invalid');
          }
          if (launch.executionOrdinal !== launchIndex + 1) {
            fail('performance pair plan launch execution ordinals must be one then two');
          }
          if (launch.buildVariant !== expectedVariants[launchIndex]) {
            fail('performance pair plan launch order is not balanced');
          }
          return {
            comparisonSide: launch.comparisonSide,
            executionOrdinal: launch.executionOrdinal,
            buildVariant: launch.buildVariant
          };
        });
        return { attemptIndex, metricSessionId: attempt.metricSessionId, launches };
      });
      pairs.push({
        comparisonKind,
        backend: pair.backend,
        pairIndex,
        attempts
      });
    }
  }
  const body = performancePairPlanBody({
    experimentId: value.experimentId,
    backend: value.backend,
    pairs
  });
  if (value.checksum !== canonicalSha256(body)) {
    fail('performance pair plan checksum does not match its canonical body');
  }
  return freezePairPlan({ ...body, checksum: value.checksum });
}

/**
 * Validates pair metadata retained by a launch-owned raw capture. The exact
 * planned side remains checked by the runner when it joins this binding back
 * to the immutable pair plan.
 */
export function validatePerformancePairBinding(value, {
  label = 'performance pair binding',
  buildVariant = null
} = {}) {
  assertExactKeys(value, [
    'experimentId', 'pairPlanChecksum', 'metricSessionId', 'comparisonKind', 'backend',
    'pairIndex', 'attemptIndex', 'comparisonSide'
  ], label);
  assertUuid(value.experimentId, `${label}.experimentId`);
  assertSha256(value.pairPlanChecksum, `${label}.pairPlanChecksum`);
  assertNonemptyString(value.metricSessionId, `${label}.metricSessionId`);
  if (!Object.hasOwn(PERFORMANCE_PAIR_CARDINALITIES, value.comparisonKind)) {
    fail(`${label}.comparisonKind is invalid`);
  }
  if (!BACKENDS.has(value.backend)) fail(`${label}.backend is invalid`);
  assertPositiveInteger(value.pairIndex, `${label}.pairIndex`);
  assertPositiveInteger(value.attemptIndex, `${label}.attemptIndex`);
  if (value.pairIndex > PERFORMANCE_PAIR_CARDINALITIES[value.comparisonKind]) {
    fail(`${label}.pairIndex exceeds its comparison-kind cardinality`);
  }
  if (value.attemptIndex > PERFORMANCE_PAIR_ATTEMPT_CARDINALITY) {
    fail(`${label}.attemptIndex exceeds the preallocated attempt cardinality`);
  }
  if (!COMPARISON_SIDES.has(value.comparisonSide)) fail(`${label}.comparisonSide is invalid`);
  if (buildVariant !== null && !PERFORMANCE_PAIR_BUILD_VARIANTS[value.comparisonKind].includes(buildVariant)) {
    fail(`${label} does not permit build variant ${buildVariant}`);
  }
  return Object.freeze({
    experimentId: value.experimentId,
    pairPlanChecksum: value.pairPlanChecksum,
    metricSessionId: value.metricSessionId,
    comparisonKind: value.comparisonKind,
    backend: value.backend,
    pairIndex: value.pairIndex,
    attemptIndex: value.attemptIndex,
    comparisonSide: value.comparisonSide
  });
}

export function validatePerformanceRunJoin(value, { label = 'performance run join' } = {}) {
  const commonKeys = [
    'sourceSha', 'policyHash', 'experimentId', 'pairPlanChecksum', 'ledgerSequence',
    'experimentRole', 'metricSessionId', 'comparisonKind', 'backend', 'pairIndex',
    'attemptIndex', 'comparisonSide', 'buildVariant', 'ordinal', 'runId',
    'externalExecutionId', 'observationBoundaryId'
  ];
  if (!isPlainObject(value)) fail(`${label} must be an object`);
  const buildVariant = value.buildVariant;
  const variantKeys = buildVariant === 'production'
    ? ['browserPid', 'browserCreationTime']
    : ['launchId', 'executionId'];
  assertExactKeys(value, [...commonKeys, ...variantKeys], label);
  assertGitSha(value.sourceSha, `${label}.sourceSha`);
  assertSha256(value.policyHash, `${label}.policyHash`);
  assertUuid(value.experimentId, `${label}.experimentId`);
  assertSha256(value.pairPlanChecksum, `${label}.pairPlanChecksum`);
  assertSafeInteger(value.ledgerSequence, `${label}.ledgerSequence`, 1);
  if (!['ci-integrity', 'reference-comparison'].includes(value.experimentRole)) {
    fail(`${label}.experimentRole is invalid`);
  }
  validatePerformancePairBinding({
    experimentId: value.experimentId,
    pairPlanChecksum: value.pairPlanChecksum,
    metricSessionId: value.metricSessionId,
    comparisonKind: value.comparisonKind,
    backend: value.backend,
    pairIndex: value.pairIndex,
    attemptIndex: value.attemptIndex,
    comparisonSide: value.comparisonSide
  }, { label, buildVariant });
  assertSafeInteger(value.ordinal, `${label}.ordinal`, 1);
  assertNonemptyString(value.runId, `${label}.runId`);
  assertUuid(value.externalExecutionId, `${label}.externalExecutionId`);
  assertNonemptyString(value.observationBoundaryId, `${label}.observationBoundaryId`);
  if (buildVariant === 'production') {
    assertSafeInteger(value.browserPid, `${label}.browserPid`, 1);
    assertNonemptyString(value.browserCreationTime, `${label}.browserCreationTime`);
  } else {
    assertUuid(value.launchId, `${label}.launchId`);
    assertUuid(value.executionId, `${label}.executionId`);
  }
  return Object.freeze(cloneJson(value, label));
}

export function performanceRawKindsForCapture({ captureKind, scopeKind, buildVariant = null, purpose } = {}) {
  const family = BASELINE_POLICY.performanceCaptureAttributionRegistry.families.find((candidate) => (
    candidate.captureKind === captureKind && candidate.scopeKind === scopeKind
  ));
  if (!family) fail(`capture attribution is not registered for ${captureKind}/${scopeKind}`);
  const variants = family.variants.filter((candidate) => candidate.buildVariant === buildVariant
    && (purpose === undefined || candidate.purpose === purpose));
  if (variants.length !== 1) fail(`capture attribution is ambiguous for ${captureKind}/${scopeKind}/${buildVariant}/${purpose ?? '*'}`);
  return Object.freeze([...variants[0].rawKinds]);
}

export function validatePerformanceRunRawKinds(value, {
  captureKind,
  join,
  label = 'performance run capture rawKinds'
} = {}) {
  if (!Array.isArray(value) || value.length === 0) fail(`${label} must be a nonempty array`);
  const allowed = new Set(performanceRawKindsForCapture({
    captureKind,
    scopeKind: 'run',
    buildVariant: join.buildVariant,
    purpose: 'measurement-side'
  }));
  const seen = new Set();
  let previousOrder = -1;
  const normalized = value.map((group, groupIndex) => {
    assertExactKeys(group, ['rawKind', 'rows'], `${label}[${groupIndex}]`);
    const rawOrder = PERFORMANCE_RAW_KIND_ORDER.indexOf(group.rawKind);
    if (rawOrder === -1 || !allowed.has(group.rawKind)) fail(`${label}[${groupIndex}].rawKind is not permitted for ${captureKind}`);
    if (seen.has(group.rawKind) || rawOrder <= previousOrder) fail(`${label} must be unique and registry ordered`);
    seen.add(group.rawKind);
    previousOrder = rawOrder;
    if (!Array.isArray(group.rows)) fail(`${label}[${groupIndex}].rows must be an array`);
    const rows = group.rows.map((row, rowIndex) => {
      if (!isPlainObject(row)) fail(`${label}[${groupIndex}].rows[${rowIndex}] must be an object`);
      const bindings = {
        sourceSha: join.sourceSha,
        policyHash: join.policyHash,
        experimentId: join.experimentId,
        pairPlanChecksum: join.pairPlanChecksum,
        ledgerSequence: join.ledgerSequence,
        experimentRole: join.experimentRole,
        scopeKind: 'run',
        scopeId: join.runId,
        captureKind,
        runId: join.runId,
        metricSessionId: join.metricSessionId,
        comparisonKind: join.comparisonKind,
        backend: join.backend,
        pairIndex: join.pairIndex,
        attemptIndex: join.attemptIndex,
        comparisonSide: join.comparisonSide,
        buildVariant: join.buildVariant,
        launchOrdinal: join.ordinal,
        externalExecutionId: join.externalExecutionId,
        observationBoundaryId: join.observationBoundaryId
      };
      for (const [key, expected] of Object.entries(bindings)) {
        if (row[key] !== expected) fail(`${label}[${groupIndex}].rows[${rowIndex}].${key} does not match the run join`);
      }
      validateRawRowShape(row, group.rawKind, `${label}[${groupIndex}].rows[${rowIndex}]`);
      return cloneJson(row, `${label}[${groupIndex}].rows[${rowIndex}]`);
    });
    return { rawKind: group.rawKind, rows };
  });
  const frozen = freezePairPlanRawKinds(normalized);
  validatePerformanceCaptureRawGrammar(frozen, { captureKind, scopeKind: 'run', join, label });
  return frozen;
}

function freezePairPlanRawKinds(value) {
  return Object.freeze(value.map((group) => Object.freeze({
    rawKind: group.rawKind,
    rows: Object.freeze(group.rows.map((row) => Object.freeze(row)))
  })));
}

export function resolvePerformancePairPlanLaunch(planInput, bindingInput) {
  const plan = validatePerformancePairPlan(planInput);
  const binding = validatePerformancePairBinding(bindingInput);
  if (binding.experimentId !== plan.experimentId || binding.backend !== plan.backend) {
    fail('performance pair binding does not match the plan experiment or backend');
  }
  if (binding.pairPlanChecksum !== plan.checksum) {
    fail('performance pair binding does not match the immutable plan checksum');
  }
  const pair = plan.pairs.find((candidate) => (
    candidate.comparisonKind === binding.comparisonKind
    && candidate.pairIndex === binding.pairIndex
  ));
  const attempt = pair?.attempts.find((candidate) => candidate.attemptIndex === binding.attemptIndex);
  if (!attempt || attempt.metricSessionId !== binding.metricSessionId) {
    fail('performance pair binding does not match one planned metric session');
  }
  const launch = attempt.launches.find((candidate) => candidate.comparisonSide === binding.comparisonSide);
  if (!launch) fail('performance pair binding does not match one planned launch side');
  return Object.freeze({
    pair: Object.freeze({
      pairPlanChecksum: plan.checksum,
      comparisonKind: pair.comparisonKind,
      backend: pair.backend,
      pairIndex: pair.pairIndex,
      attemptIndex: attempt.attemptIndex,
      metricSessionId: attempt.metricSessionId
    }),
    launch: Object.freeze({ ...launch })
  });
}
