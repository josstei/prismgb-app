import { stableStringify } from './baseline-report.js';

export const PERFORMANCE_CONTROLLER_PHASES = Object.freeze([
  'startup',
  'qualification-probe',
  'warmup',
  'measurement',
  'submission-seal',
  'drain',
  'shutdown',
  'application-descendant-closure',
  'pre-exit'
]);

const EXPECTED_BROKER_SAMPLES = Object.freeze([
  Object.freeze({ phase: 'startup', purpose: 'startup-identity' }),
  Object.freeze({ phase: 'qualification-probe', purpose: 'qualification' }),
  Object.freeze({ phase: 'warmup', purpose: 'warmup' }),
  Object.freeze({ phase: 'warmup', purpose: 'prime' }),
  Object.freeze({ phase: 'measurement', purpose: 'measurement' }),
  Object.freeze({ phase: 'submission-seal', purpose: 'submission-seal' }),
  Object.freeze({ phase: 'drain', purpose: 'drain' }),
  Object.freeze({ phase: 'shutdown', purpose: 'shutdown' }),
  Object.freeze({ phase: 'shutdown', purpose: 'post-release-settle' }),
  Object.freeze({ phase: 'application-descendant-closure', purpose: 'application-descendant-closure' }),
  Object.freeze({ phase: 'pre-exit', purpose: 'pre-exit' })
]);

const REQUEST_LOG_EVENTS = new Set([
  'install-environment-listeners',
  'begin-operation',
  'begin-phase',
  'open-numeric-epoch',
  'sample',
  'sample-environment',
  'close-numeric-epoch',
  'record-release-dispatched',
  'sample-post-release-settle',
  'finalize'
]);

function fail(message) {
  throw new TypeError(`Performance controller audit failed: ${message}`);
}

function isObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exact(value, keys, label) {
  if (!isObject(value)) fail(`${label} must be an object`);
  const expected = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) fail(`${label} has an unknown field ${key}`);
  }
  for (const key of keys) {
    if (!(key in value)) fail(`${label} is missing ${key}`);
  }
}

function text(value, label) {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a nonempty string`);
}

function uuid(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    fail(`${label} must be a UUID`);
  }
}

function finite(value, label, minimum = 0) {
  if (!Number.isFinite(value) || value < minimum) fail(`${label} must be finite and >= ${minimum}`);
}

function integer(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(`${label} must be a safe integer >= ${minimum}`);
}

function cloneJson(value, label) {
  try {
    return JSON.parse(stableStringify(value));
  } catch (error) {
    fail(`${label} must contain only finite plain JSON values: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function freeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) freeze(nested, seen);
  return Object.freeze(value);
}

function validateRequestLogEntry(entry, index, previousSequence) {
  const label = `controllerAudit.requestLog[${index}]`;
  if (!isObject(entry)) fail(`${label} must be an object`);
  integer(entry.sequence, `${label}.sequence`, 1);
  if (entry.sequence <= previousSequence) fail('controller audit request log sequences must be strictly increasing');
  text(entry.event, `${label}.event`);
  if (!REQUEST_LOG_EVENTS.has(entry.event)) fail(`${label}.event is unsupported`);
  finite(entry.at, `${label}.at`);

  const detailsByEvent = {
    'install-environment-listeners': ['count'],
    'begin-operation': ['launchId'],
    'begin-phase': ['phase'],
    'open-numeric-epoch': ['measurementEpochId'],
    sample: ['purpose', 'phase', 'callSequence'],
    'sample-environment': ['phase', 'callSequence'],
    'close-numeric-epoch': ['closedAt', 'callSequence'],
    'record-release-dispatched': ['releaseDispatchedReceiptAt', 'notBeforeFixtureAt'],
    'sample-post-release-settle': ['purpose', 'sampledFixtureAt', 'brokerCallSequence'],
    finalize: ['disposedAt']
  };
  exact(entry, ['sequence', 'event', 'at', ...detailsByEvent[entry.event]], label);
  return entry;
}

function validateRequestLog(value, { launchId, instrumentation }) {
  if (!Array.isArray(value) || value.length === 0) fail('controllerAudit.requestLog must be a nonempty array');
  const entries = [];
  let previousSequence = 0;
  for (const [index, entry] of value.entries()) {
    const normalized = validateRequestLogEntry(entry, index, previousSequence);
    previousSequence = normalized.sequence;
    entries.push(normalized);
  }

  const byEvent = Object.fromEntries([...REQUEST_LOG_EVENTS].map((event) => [event, []]));
  for (const entry of entries) byEvent[entry.event].push(entry);
  if (byEvent['install-environment-listeners'].length !== 1) {
    fail('controller audit must install environment listeners exactly once');
  }
  integer(byEvent['install-environment-listeners'][0].count, 'controllerAudit request listener count');
  if (byEvent['begin-operation'].length !== 1 || byEvent['begin-operation'][0].launchId !== launchId) {
    fail('controller audit must begin exactly one operation for its launch ID');
  }
  if (byEvent['begin-phase'].length !== PERFORMANCE_CONTROLLER_PHASES.length) {
    fail('controller audit must retain every measurement phase exactly once');
  }
  const phases = byEvent['begin-phase'].map((entry) => entry.phase);
  if (JSON.stringify(phases) !== JSON.stringify(PERFORMANCE_CONTROLLER_PHASES)) {
    fail('controller audit phases are not in the required order');
  }
  const expectedEpochCount = instrumentation ? 1 : 0;
  if (byEvent['open-numeric-epoch'].length !== expectedEpochCount
    || byEvent['close-numeric-epoch'].length !== expectedEpochCount) {
    fail('controller audit numeric epoch count does not match the build instrumentation mode');
  }
  if (instrumentation && byEvent['open-numeric-epoch'][0].measurementEpochId !== launchId) {
    fail('controller audit numeric epoch does not match the harness launch ID');
  }
  if (byEvent.sample.length !== EXPECTED_BROKER_SAMPLES.length) {
    fail('controller audit does not retain the required broker sample count');
  }
  byEvent.sample.forEach((entry, index) => {
    const expected = EXPECTED_BROKER_SAMPLES[index];
    if (entry.phase !== expected.phase || entry.purpose !== expected.purpose) {
      fail('controller audit request samples do not follow the required phase and purpose order');
    }
    integer(entry.callSequence, `controllerAudit request sample ${index} callSequence`, 1);
  });
  if (byEvent['sample-environment'].length !== 2
    || byEvent['sample-environment'][0].phase !== 'startup'
    || byEvent['sample-environment'][1].phase !== 'pre-exit') {
    fail('controller audit must retain startup and pre-exit environment samples');
  }
  byEvent['sample-environment'].forEach((entry, index) => {
    integer(entry.callSequence, `controllerAudit request environment sample ${index} callSequence`, 1);
  });
  if (byEvent.finalize.length !== 1 || entries.at(-1)?.event !== 'finalize') {
    fail('controller audit must finalize once after every other recorded request');
  }
  finite(byEvent.finalize[0].disposedAt, 'controllerAudit request finalize disposedAt');
  return entries.map((entry) => ({ ...entry }));
}

function validateBrokerSamples(value, launchId) {
  if (!Array.isArray(value) || value.length !== EXPECTED_BROKER_SAMPLES.length) {
    fail('controllerAudit.brokerSamples must retain the required sample count');
  }
  return value.map((sample, index) => {
    const label = `controllerAudit.brokerSamples[${index}]`;
    exact(sample, ['launchId', 'callSequence', 'phase', 'purpose', 'capturedAt', 'rawAppMetrics', 'servedFromCache'], label);
    if (sample.launchId !== launchId) fail(`${label}.launchId does not match the harness launch`);
    integer(sample.callSequence, `${label}.callSequence`, 1);
    finite(sample.capturedAt, `${label}.capturedAt`);
    const expected = EXPECTED_BROKER_SAMPLES[index];
    if (sample.phase !== expected.phase || sample.purpose !== expected.purpose || sample.servedFromCache !== false) {
      fail(`${label} does not match the required leased broker sample`);
    }
    return {
      ...sample,
      rawAppMetrics: cloneJson(sample.rawAppMetrics, `${label}.rawAppMetrics`)
    };
  });
}

function validateEnvironmentSamples(value, launchId) {
  if (!Array.isArray(value) || value.length !== 2) {
    fail('controllerAudit.environmentSamples must retain startup and pre-exit snapshots');
  }
  return value.map((sample, index) => {
    const label = `controllerAudit.environmentSamples[${index}]`;
    exact(sample, ['launchId', 'callSequence', 'phase', 'capturedAt', 'currentState', 'eventBoundary'], label);
    if (sample.launchId !== launchId) fail(`${label}.launchId does not match the harness launch`);
    integer(sample.callSequence, `${label}.callSequence`, 1);
    finite(sample.capturedAt, `${label}.capturedAt`);
    const expectedPhase = index === 0 ? 'startup' : 'pre-exit';
    if (sample.phase !== expectedPhase) fail(`${label}.phase is invalid`);
    if (!isObject(sample.eventBoundary)) fail(`${label}.eventBoundary must be an object`);
    for (const [eventType, sourceSequence] of Object.entries(sample.eventBoundary)) {
      text(eventType, `${label}.eventBoundary event type`);
      integer(sourceSequence, `${label}.eventBoundary.${eventType}`, 1);
    }
    return {
      ...sample,
      currentState: cloneJson(sample.currentState, `${label}.currentState`),
      eventBoundary: { ...sample.eventBoundary }
    };
  });
}

function validateEnvironmentEvents(value) {
  if (!Array.isArray(value)) fail('controllerAudit.environmentEvents must be an array');
  let previousSequence = 0;
  return value.map((event, index) => {
    const label = `controllerAudit.environmentEvents[${index}]`;
    exact(event, ['sourceSequence', 'clockDomain', 'observedAt', 'eventType', 'rawPayload', 'normalizedState'], label);
    integer(event.sourceSequence, `${label}.sourceSequence`, 1);
    if (event.sourceSequence !== previousSequence + 1) {
      fail('controller audit environment event sequences must be contiguous');
    }
    previousSequence = event.sourceSequence;
    if (event.clockDomain !== 'electron-main') fail(`${label}.clockDomain is invalid`);
    finite(event.observedAt, `${label}.observedAt`);
    text(event.eventType, `${label}.eventType`);
    return {
      ...event,
      rawPayload: cloneJson(event.rawPayload, `${label}.rawPayload`),
      normalizedState: cloneJson(event.normalizedState, `${label}.normalizedState`)
    };
  });
}

function validatePostReleaseSettle(value, { requestLog, brokerSamples }) {
  exact(value, [
    'purpose',
    'releaseDispatchedReceiptAt',
    'notBeforeFixtureAt',
    'sampledFixtureAt',
    'brokerCallSequence'
  ], 'controllerAudit.postReleaseSettle');
  if (value.purpose !== 'post-release-settle') {
    fail('controllerAudit.postReleaseSettle purpose is invalid');
  }
  finite(value.releaseDispatchedReceiptAt, 'controllerAudit.postReleaseSettle release-dispatched receipt');
  finite(value.notBeforeFixtureAt, 'controllerAudit.postReleaseSettle not-before deadline');
  finite(value.sampledFixtureAt, 'controllerAudit.postReleaseSettle sample time');
  integer(value.brokerCallSequence, 'controllerAudit.postReleaseSettle broker call sequence', 1);
  if (value.notBeforeFixtureAt !== value.releaseDispatchedReceiptAt + 1_000) {
    fail('controllerAudit.postReleaseSettle does not retain its one-second fixture deadline');
  }
  if (value.sampledFixtureAt < value.notBeforeFixtureAt) {
    fail('controllerAudit.postReleaseSettle sample precedes its fixture deadline');
  }

  const releaseRequests = requestLog.filter((entry) => entry.event === 'record-release-dispatched');
  const settleRequests = requestLog.filter((entry) => entry.event === 'sample-post-release-settle');
  if (releaseRequests.length !== 1 || settleRequests.length !== 1) {
    fail('controller audit must retain one release-dispatched receipt and one post-release settle request');
  }
  const [releaseRequest] = releaseRequests;
  const [settleRequest] = settleRequests;
  if (
    releaseRequest.releaseDispatchedReceiptAt !== value.releaseDispatchedReceiptAt
    || releaseRequest.notBeforeFixtureAt !== value.notBeforeFixtureAt
  ) {
    fail('controller audit release-dispatched request does not bind the settle deadline');
  }
  if (
    settleRequest.purpose !== value.purpose
    || settleRequest.sampledFixtureAt !== value.sampledFixtureAt
    || settleRequest.brokerCallSequence !== value.brokerCallSequence
  ) {
    fail('controller audit post-release settle request does not bind its audit evidence');
  }

  const brokerSample = brokerSamples.find((sample) => sample.callSequence === value.brokerCallSequence);
  if (!brokerSample || brokerSample.phase !== 'shutdown' || brokerSample.purpose !== value.purpose) {
    fail('controller audit post-release settle does not bind the shutdown broker sample');
  }
  const shutdownSampleIndex = requestLog.findIndex((entry) => (
    entry.event === 'sample' && entry.phase === 'shutdown' && entry.purpose === 'shutdown'
  ));
  const releaseRequestIndex = requestLog.indexOf(releaseRequest);
  const settleSampleIndex = requestLog.findIndex((entry) => (
    entry.event === 'sample'
    && entry.phase === 'shutdown'
    && entry.purpose === 'post-release-settle'
    && entry.callSequence === value.brokerCallSequence
  ));
  const settleRequestIndex = requestLog.indexOf(settleRequest);
  if (
    shutdownSampleIndex === -1
    || !(shutdownSampleIndex < releaseRequestIndex
      && releaseRequestIndex < settleSampleIndex
      && settleSampleIndex < settleRequestIndex)
  ) {
    fail('controller audit post-release settle request order is invalid');
  }

  return {
    purpose: value.purpose,
    releaseDispatchedReceiptAt: value.releaseDispatchedReceiptAt,
    notBeforeFixtureAt: value.notBeforeFixtureAt,
    sampledFixtureAt: value.sampledFixtureAt,
    brokerCallSequence: value.brokerCallSequence
  };
}

function validateListenerEvidence(value) {
  if (!Array.isArray(value) || value.length === 0) {
    fail('controllerAudit.listenerEvidence must retain installed listener removal evidence');
  }
  const eventTypes = new Set();
  return value.map((entry, index) => {
    const label = `controllerAudit.listenerEvidence[${index}]`;
    exact(entry, ['eventType', 'removed'], label);
    text(entry.eventType, `${label}.eventType`);
    if (entry.removed !== true) fail(`${label}.removed must be true`);
    if (eventTypes.has(entry.eventType)) fail('controller audit listener evidence must not duplicate an event type');
    eventTypes.add(entry.eventType);
    return { ...entry };
  });
}

/**
 * Normalizes the only accepted completed harness controller audit. The capture
 * remains raw evidence, but rejects missing lease phases, cached public metric
 * interference, numeric-epoch drift, and incomplete listener restoration.
 *
 * @param {unknown} value
 * @param {{ launchId: string, instrumentation: boolean, label?: string }} options
 */
export function validatePerformanceControllerAudit(value, {
  launchId,
  instrumentation,
  label = 'controllerAudit'
} = {}) {
  uuid(launchId, `${label} launchId`);
  if (typeof instrumentation !== 'boolean') fail(`${label} instrumentation mode must be boolean`);
  exact(value, [
    'launchId',
    'requestLog',
    'brokerSamples',
    'environmentSamples',
    'environmentEvents',
    'postReleaseSettle',
    'fatalReasons',
    'finalPhase',
    'listenerEvidence',
    'restorationOutcome',
    'disposedAt'
  ], label);
  if (value.launchId !== launchId) fail(`${label}.launchId does not match the harness launch`);
  if (!Array.isArray(value.fatalReasons) || value.fatalReasons.length !== 0) {
    fail(`${label}.fatalReasons must be empty`);
  }
  if (value.finalPhase !== 'pre-exit') fail(`${label}.finalPhase must be pre-exit`);
  if (value.restorationOutcome !== 'restored') fail(`${label}.restorationOutcome must be restored`);
  finite(value.disposedAt, `${label}.disposedAt`);

  const requestLog = validateRequestLog(value.requestLog, { launchId, instrumentation });
  const brokerSamples = validateBrokerSamples(value.brokerSamples, launchId);
  const environmentSamples = validateEnvironmentSamples(value.environmentSamples, launchId);
  const postReleaseSettle = validatePostReleaseSettle(value.postReleaseSettle, { requestLog, brokerSamples });
  const listenerEvidence = validateListenerEvidence(value.listenerEvidence);
  const requestSamples = requestLog.filter((entry) => entry.event === 'sample');
  const requestEnvironmentSamples = requestLog.filter((entry) => entry.event === 'sample-environment');
  requestSamples.forEach((entry, index) => {
    if (entry.callSequence !== brokerSamples[index].callSequence) {
      fail('controller audit request samples do not bind their broker snapshots');
    }
  });
  requestEnvironmentSamples.forEach((entry, index) => {
    if (entry.callSequence !== environmentSamples[index].callSequence) {
      fail('controller audit request environment samples do not bind their snapshots');
    }
  });
  const listenerInstall = requestLog.find((entry) => entry.event === 'install-environment-listeners');
  if (listenerInstall.count !== listenerEvidence.length) {
    fail('controller audit listener installation count does not match removal evidence');
  }

  const audit = {
    launchId,
    requestLog,
    brokerSamples,
    environmentSamples,
    environmentEvents: validateEnvironmentEvents(value.environmentEvents),
    postReleaseSettle,
    fatalReasons: [],
    finalPhase: 'pre-exit',
    listenerEvidence,
    restorationOutcome: 'restored',
    disposedAt: value.disposedAt
  };
  return freeze(cloneJson(audit, label));
}
