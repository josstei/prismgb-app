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

export const PERFORMANCE_ROOT_EXIT_AUDIT_SCHEMA_VERSION = 1;

const REQUIRED_BROKER_SAMPLE_PREFIX = Object.freeze([
  Object.freeze({ phase: 'startup', purpose: 'startup-identity' }),
  Object.freeze({ phase: 'qualification-probe', purpose: 'qualification' }),
  Object.freeze({ phase: 'warmup', purpose: 'warmup' }),
  Object.freeze({ phase: 'warmup', purpose: 'prime' }),
  Object.freeze({ phase: 'measurement', purpose: 'measurement' }),
  Object.freeze({ phase: 'submission-seal', purpose: 'submission-seal' }),
  Object.freeze({ phase: 'drain', purpose: 'drain' }),
  Object.freeze({ phase: 'shutdown', purpose: 'shutdown' }),
  Object.freeze({ phase: 'shutdown', purpose: 'post-release-settle' }),
  Object.freeze({ phase: 'application-descendant-closure', purpose: 'application-descendant-closure' })
]);

const ROOT_EXIT_CLOSURE_WAIT_SAMPLE = Object.freeze({
  phase: 'application-descendant-closure',
  purpose: 'application-descendant-closure-wait'
});

const REQUIRED_FINAL_BROKER_SAMPLE = Object.freeze({ phase: 'pre-exit', purpose: 'pre-exit' });

function validateRequiredBrokerSampleOrder(samples, label) {
  if (samples.length < REQUIRED_BROKER_SAMPLE_PREFIX.length + 2) {
    fail(`${label} must retain the fixed samples, at least one root-exit closure wait, and the pre-exit sample`);
  }
  REQUIRED_BROKER_SAMPLE_PREFIX.forEach((expected, index) => {
    const sample = samples[index];
    if (sample.phase !== expected.phase || sample.purpose !== expected.purpose) {
      fail(`${label} does not retain the required fixed phase and purpose order`);
    }
  });
  const closureWaitSamples = samples.slice(REQUIRED_BROKER_SAMPLE_PREFIX.length, -1);
  if (closureWaitSamples.some((sample) => (
    sample.phase !== ROOT_EXIT_CLOSURE_WAIT_SAMPLE.phase
    || sample.purpose !== ROOT_EXIT_CLOSURE_WAIT_SAMPLE.purpose
  ))) {
    fail(`${label} must retain only root-exit closure waits between descendant closure and pre-exit`);
  }
  const finalSample = samples.at(-1);
  if (finalSample.phase !== REQUIRED_FINAL_BROKER_SAMPLE.phase
    || finalSample.purpose !== REQUIRED_FINAL_BROKER_SAMPLE.purpose) {
    fail(`${label} must retain the pre-exit broker sample last`);
  }
  return closureWaitSamples;
}

const FRAMEWORK_PROCESS_CLASSES = new Set([
  'Utility', 'Zygote', 'Sandbox helper', 'GPU', 'Pepper Plugin', 'Pepper Plugin Broker'
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
  'begin-root-exit-gate',
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
    'begin-root-exit-gate': ['applicationCleanupCompletedAt'],
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
  const closureWaitRequests = validateRequiredBrokerSampleOrder(
    byEvent.sample,
    'controller audit request samples'
  );
  byEvent.sample.forEach((entry, index) => {
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
  if (byEvent['begin-root-exit-gate'].length !== 1) {
    fail('controller audit must enter the root-exit gate exactly once');
  }
  finite(byEvent['begin-root-exit-gate'][0].applicationCleanupCompletedAt, 'controllerAudit root-exit cleanup boundary');
  const descendantClosureIndex = entries.findIndex((entry) => (
    entry.event === 'sample'
    && entry.phase === 'application-descendant-closure'
    && entry.purpose === 'application-descendant-closure'
  ));
  const rootExitGateIndex = entries.indexOf(byEvent['begin-root-exit-gate'][0]);
  const preExitPhaseIndex = entries.findIndex((entry) => (
    entry.event === 'begin-phase' && entry.phase === 'pre-exit'
  ));
  const firstClosureWaitIndex = entries.indexOf(closureWaitRequests[0]);
  const lastClosureWaitIndex = entries.indexOf(closureWaitRequests.at(-1));
  if (!(descendantClosureIndex < rootExitGateIndex
    && rootExitGateIndex < firstClosureWaitIndex
    && lastClosureWaitIndex < preExitPhaseIndex)) {
    fail('controller audit root-exit gate does not retain closure waits between descendant closure and pre-exit');
  }
  if (byEvent.finalize.length !== 1 || entries.at(-1)?.event !== 'finalize') {
    fail('controller audit must finalize once after every other recorded request');
  }
  finite(byEvent.finalize[0].disposedAt, 'controllerAudit request finalize disposedAt');
  return entries.map((entry) => ({ ...entry }));
}

function validateBrokerSamples(value, launchId) {
  if (!Array.isArray(value)) fail('controllerAudit.brokerSamples must be an array');
  const samples = value.map((sample, index) => {
    const label = `controllerAudit.brokerSamples[${index}]`;
    exact(sample, ['launchId', 'callSequence', 'phase', 'purpose', 'capturedAt', 'rawAppMetrics', 'servedFromCache'], label);
    if (sample.launchId !== launchId) fail(`${label}.launchId does not match the harness launch`);
    integer(sample.callSequence, `${label}.callSequence`, 1);
    finite(sample.capturedAt, `${label}.capturedAt`);
    if (sample.servedFromCache !== false) fail(`${label} must retain a leased broker sample`);
    return {
      ...sample,
      rawAppMetrics: cloneJson(sample.rawAppMetrics, `${label}.rawAppMetrics`)
    };
  });
  validateRequiredBrokerSampleOrder(samples, 'controllerAudit.brokerSamples');
  return samples;
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

function validateSourceFinalSequences(value, { listenerEvidence, environmentEvents }) {
  const expectedBySource = new Map();
  for (const listener of listenerEvidence) {
    const separator = listener.eventType.indexOf(':');
    if (separator <= 0) fail('controller audit listener evidence event type has no source prefix');
    const source = listener.eventType.slice(0, separator);
    if (!expectedBySource.has(source)) expectedBySource.set(source, 0);
  }
  for (const event of environmentEvents) {
    const separator = event.eventType.indexOf(':');
    if (separator <= 0) fail('controller audit environment event has no source prefix');
    const source = event.eventType.slice(0, separator);
    if (!expectedBySource.has(source)) {
      fail('controller audit environment event source has no listener evidence');
    }
    expectedBySource.set(source, event.sourceSequence);
  }
  const sources = [...expectedBySource.keys()].sort();
  exact(value, sources, 'controllerAudit.sourceFinalSequences');
  for (const source of sources) {
    integer(value[source], `controllerAudit.sourceFinalSequences.${source}`);
    if (value[source] !== expectedBySource.get(source)) {
      fail('controller audit source final sequence does not match its final observed event');
    }
  }
  return Object.fromEntries(sources.map((source) => [source, value[source]]));
}

function validateLastBrokerCall(value, { brokerSamples, disposedAt }) {
  const label = 'controllerAudit.lastBrokerCall';
  exact(value, ['launchId', 'callSequence', 'phase', 'purpose', 'capturedAt', 'rawAppMetrics', 'servedFromCache'], label);
  const normalized = cloneJson(value, label);
  const expected = brokerSamples.at(-1);
  if (!expected || stableStringify(normalized) !== stableStringify(expected)) {
    fail('controller audit last broker call does not match the final leased broker sample');
  }
  if (normalized.capturedAt > disposedAt) {
    fail('controller audit broker disposal precedes its last broker call');
  }
  return expected;
}

function deriveRootExitProcesses(rawAppMetrics, label) {
  if (!Array.isArray(rawAppMetrics)) fail(`${label} must retain an app metrics array`);
  const seenProcessIds = new Set();
  const browserRoots = [];
  const frameworkSurvivors = [];
  rawAppMetrics.forEach((metric, index) => {
    const metricLabel = `${label}[${index}]`;
    if (!isObject(metric)) fail(`${metricLabel} must be an object`);
    integer(metric.pid, `${metricLabel}.pid`, 1);
    finite(metric.creationTime, `${metricLabel}.creationTime`);
    text(metric.type, `${metricLabel}.type`);
    if (seenProcessIds.has(metric.pid)) fail('controller audit root-exit metrics contain a duplicate PID');
    seenProcessIds.add(metric.pid);
    if (metric.type === 'Browser') {
      browserRoots.push({ pid: metric.pid, creationTime: metric.creationTime });
      return;
    }
    if (metric.type === 'Tab') fail('controller audit root-exit metrics retain an application-owned Tab descendant');
    if (metric.type === 'Unknown') fail('controller audit root-exit metrics retain an unknown process class');
    if (!FRAMEWORK_PROCESS_CLASSES.has(metric.type)) {
      fail(`controller audit root-exit metrics retain an unsupported process class: ${metric.type}`);
    }
    const name = metric.name === undefined ? null : metric.name;
    const serviceName = metric.serviceName === undefined ? null : metric.serviceName;
    if (!(name === null || typeof name === 'string')) fail(`${metricLabel}.name is invalid`);
    if (!(serviceName === null || typeof serviceName === 'string')) fail(`${metricLabel}.serviceName is invalid`);
    if (metric.type === 'Utility' && (!name || !serviceName)) {
      fail('controller audit Utility survivor requires name and serviceName identity');
    }
    frameworkSurvivors.push({
      pid: metric.pid,
      creationTime: metric.creationTime,
      type: metric.type,
      name,
      serviceName
    });
  });
  if (browserRoots.length !== 1) fail('controller audit root-exit metrics must retain exactly one Browser root');
  frameworkSurvivors.sort((left, right) => (
    left.pid - right.pid
    || left.creationTime - right.creationTime
    || left.type.localeCompare(right.type)
  ));
  return { root: browserRoots[0], frameworkSurvivors };
}

function validateRootExitGate(value, { requestLog, brokerSamples, lastBrokerCall, disposedAt }) {
  exact(value, [
    'applicationCleanupCompletedAt', 'applicationDescendantClosureEnd', 'root', 'frameworkSurvivors', 'brokerDisposeEnd'
  ], 'controllerAudit.rootExitGate');
  finite(value.applicationCleanupCompletedAt, 'controllerAudit.rootExitGate.applicationCleanupCompletedAt');
  finite(value.applicationDescendantClosureEnd, 'controllerAudit.rootExitGate.applicationDescendantClosureEnd');
  exact(value.root, ['pid', 'creationTime'], 'controllerAudit.rootExitGate.root');
  integer(value.root.pid, 'controllerAudit.rootExitGate.root.pid', 1);
  finite(value.root.creationTime, 'controllerAudit.rootExitGate.root.creationTime');
  if (!Array.isArray(value.frameworkSurvivors)) {
    fail('controllerAudit.rootExitGate.frameworkSurvivors must be an array');
  }
  const frameworkSurvivors = value.frameworkSurvivors.map((survivor, index) => {
    const label = `controllerAudit.rootExitGate.frameworkSurvivors[${index}]`;
    exact(survivor, ['pid', 'creationTime', 'type', 'name', 'serviceName'], label);
    integer(survivor.pid, `${label}.pid`, 1);
    finite(survivor.creationTime, `${label}.creationTime`);
    text(survivor.type, `${label}.type`);
    if (!FRAMEWORK_PROCESS_CLASSES.has(survivor.type)) fail(`${label}.type is invalid`);
    if (!(survivor.name === null || typeof survivor.name === 'string')) fail(`${label}.name is invalid`);
    if (!(survivor.serviceName === null || typeof survivor.serviceName === 'string')) fail(`${label}.serviceName is invalid`);
    if (survivor.type === 'Utility' && (!survivor.name || !survivor.serviceName)) {
      fail(`${label} Utility survivor has no identity`);
    }
    if (index > 0) {
      const prior = value.frameworkSurvivors[index - 1];
      const ordered = survivor.pid > prior.pid
        || (survivor.pid === prior.pid && (
          survivor.creationTime > prior.creationTime
          || (survivor.creationTime === prior.creationTime && survivor.type > prior.type)
        ));
      if (!ordered) fail('controllerAudit.rootExitGate.frameworkSurvivors must be ordered and unique');
    }
    return {
      pid: survivor.pid,
      creationTime: survivor.creationTime,
      type: survivor.type,
      name: survivor.name,
      serviceName: survivor.serviceName
    };
  });
  finite(value.brokerDisposeEnd, 'controllerAudit.rootExitGate.brokerDisposeEnd');
  if (value.brokerDisposeEnd !== disposedAt) {
    fail('controllerAudit.rootExitGate broker disposal boundary must equal controller disposal');
  }
  const closureWaitSamples = brokerSamples.filter((sample) => (
    sample.phase === ROOT_EXIT_CLOSURE_WAIT_SAMPLE.phase
    && sample.purpose === ROOT_EXIT_CLOSURE_WAIT_SAMPLE.purpose
  ));
  const lastClosureWaitSample = closureWaitSamples.at(-1);
  if (!lastClosureWaitSample) fail('controllerAudit.rootExitGate requires a root-exit closure wait sample');
  if (value.applicationCleanupCompletedAt > lastClosureWaitSample.capturedAt
    || lastClosureWaitSample.capturedAt > value.applicationDescendantClosureEnd
    || value.applicationCleanupCompletedAt > value.applicationDescendantClosureEnd
    || value.applicationDescendantClosureEnd > lastBrokerCall.capturedAt
    || lastBrokerCall.capturedAt > value.brokerDisposeEnd) {
    fail('controllerAudit.rootExitGate violates cleanup, closure-wait, broker, and disposal ordering');
  }
  const rootExitGateRequest = requestLog.find((entry) => entry.event === 'begin-root-exit-gate');
  if (!rootExitGateRequest || rootExitGateRequest.applicationCleanupCompletedAt !== value.applicationCleanupCompletedAt) {
    fail('controllerAudit.rootExitGate does not bind its cleanup boundary request');
  }
  const derived = deriveRootExitProcesses(lastBrokerCall.rawAppMetrics, 'controllerAudit.lastBrokerCall.rawAppMetrics');
  if (stableStringify(value.root) !== stableStringify(derived.root)
    || stableStringify(frameworkSurvivors) !== stableStringify(derived.frameworkSurvivors)) {
    fail('controllerAudit.rootExitGate does not match the final broker process membership');
  }
  return {
    applicationCleanupCompletedAt: value.applicationCleanupCompletedAt,
    applicationDescendantClosureEnd: value.applicationDescendantClosureEnd,
    root: { ...value.root },
    frameworkSurvivors,
    brokerDisposeEnd: value.brokerDisposeEnd
  };
}

function validateFinalTokenState(value, { instrumentation }) {
  exact(value, [
    'operation',
    'phase',
    'activeNumericEpoch',
    'issuedPhaseTokenCount',
    'issuedEpochTokenCount'
  ], 'controllerAudit.finalTokenState');
  if (value.operation !== 'finalized' || value.phase !== 'pre-exit' || value.activeNumericEpoch !== null) {
    fail('controllerAudit.finalTokenState does not retain the finalized operation state');
  }
  integer(value.issuedPhaseTokenCount, 'controllerAudit.finalTokenState issued phase token count');
  integer(value.issuedEpochTokenCount, 'controllerAudit.finalTokenState issued epoch token count');
  if (value.issuedPhaseTokenCount !== PERFORMANCE_CONTROLLER_PHASES.length) {
    fail('controllerAudit.finalTokenState phase token count is invalid');
  }
  if (value.issuedEpochTokenCount !== (instrumentation ? 1 : 0)) {
    fail('controllerAudit.finalTokenState epoch token count does not match instrumentation mode');
  }
  return {
    operation: 'finalized',
    phase: 'pre-exit',
    activeNumericEpoch: null,
    issuedPhaseTokenCount: value.issuedPhaseTokenCount,
    issuedEpochTokenCount: value.issuedEpochTokenCount
  };
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
    'sourceFinalSequences',
    'lastBrokerCall',
    'postReleaseSettle',
    'rootExitGate',
    'fatalReasons',
    'finalPhase',
    'finalTokenState',
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
  const listenerEvidence = validateListenerEvidence(value.listenerEvidence);
  const environmentEvents = validateEnvironmentEvents(value.environmentEvents);
  const sourceFinalSequences = validateSourceFinalSequences(value.sourceFinalSequences, {
    listenerEvidence,
    environmentEvents
  });
  const lastBrokerCall = validateLastBrokerCall(value.lastBrokerCall, { brokerSamples, disposedAt: value.disposedAt });
  const postReleaseSettle = validatePostReleaseSettle(value.postReleaseSettle, { requestLog, brokerSamples });
  const rootExitGate = validateRootExitGate(value.rootExitGate, {
    requestLog,
    brokerSamples,
    lastBrokerCall,
    disposedAt: value.disposedAt
  });
  const finalTokenState = validateFinalTokenState(value.finalTokenState, { instrumentation });
  const requestSamples = requestLog.filter((entry) => entry.event === 'sample');
  const requestEnvironmentSamples = requestLog.filter((entry) => entry.event === 'sample-environment');
  if (requestSamples.length !== brokerSamples.length) {
    fail('controller audit request and broker sample counts do not match');
  }
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
    environmentEvents,
    sourceFinalSequences,
    lastBrokerCall,
    postReleaseSettle,
    rootExitGate,
    fatalReasons: [],
    finalPhase: 'pre-exit',
    finalTokenState,
    listenerEvidence,
    restorationOutcome: 'restored',
    disposedAt: value.disposedAt
  };
  return freeze(cloneJson(audit, label));
}

/**
 * Validates the one-shot handoff written by the main-process root-exit gate.
 * The fixture reads it only after the Electron application has closed, so it
 * cannot be substituted for a live controller command.
 *
 * @param {unknown} value
 * @param {{ instrumentation: boolean, label?: string }} options
 */
export function validatePerformanceRootExitAuditFile(value, {
  instrumentation,
  label = 'rootExitAudit'
} = {}) {
  if (typeof instrumentation !== 'boolean') fail(`${label} instrumentation mode must be boolean`);
  exact(value, ['schemaVersion', 'launchId', 'controllerAudit'], label);
  if (value.schemaVersion !== PERFORMANCE_ROOT_EXIT_AUDIT_SCHEMA_VERSION) {
    fail(`${label}.schemaVersion is invalid`);
  }
  uuid(value.launchId, `${label}.launchId`);
  const controllerAudit = validatePerformanceControllerAudit(value.controllerAudit, {
    launchId: value.launchId,
    instrumentation,
    label: `${label}.controllerAudit`
  });
  return freeze({
    schemaVersion: PERFORMANCE_ROOT_EXIT_AUDIT_SCHEMA_VERSION,
    launchId: value.launchId,
    controllerAudit
  });
}

/**
 * Binds a fixture-clock root/terminal closure observation to the main-process
 * audit. The clocks remain separate; the explicit close protocol is the join
 * between broker disposal and the external terminal observation.
 *
 * @param {unknown} value
 * @param {{ controllerAudit: ReturnType<typeof validatePerformanceControllerAudit>, label?: string }} options
 */
export function validatePerformanceRootExitObservation(value, {
  controllerAudit,
  label = 'rootExit'
} = {}) {
  if (!controllerAudit || typeof controllerAudit !== 'object') {
    fail(`${label} requires a normalized controller audit`);
  }
  const gate = controllerAudit.rootExitGate;
  if (!gate || typeof gate !== 'object') fail(`${label} requires root-exit gate evidence`);
  exact(value, [
    'launchId', 'protocol', 'rootExitObservedAt', 'terminalClosureEnd', 'root', 'frameworkSurvivors'
  ], label);
  if (value.launchId !== controllerAudit.launchId) fail(`${label}.launchId does not match its controller audit`);
  if (value.protocol !== 'electron-application-close') {
    fail(`${label}.protocol is invalid`);
  }
  finite(value.rootExitObservedAt, `${label}.rootExitObservedAt`);
  finite(value.terminalClosureEnd, `${label}.terminalClosureEnd`, value.rootExitObservedAt);
  exact(value.root, ['pid', 'creationTime'], `${label}.root`);
  integer(value.root.pid, `${label}.root.pid`, 1);
  finite(value.root.creationTime, `${label}.root.creationTime`);
  if (!Array.isArray(value.frameworkSurvivors)) fail(`${label}.frameworkSurvivors must be an array`);
  const normalized = {
    launchId: value.launchId,
    protocol: value.protocol,
    rootExitObservedAt: value.rootExitObservedAt,
    terminalClosureEnd: value.terminalClosureEnd,
    root: { ...value.root },
    frameworkSurvivors: cloneJson(value.frameworkSurvivors, `${label}.frameworkSurvivors`)
  };
  if (stableStringify(normalized.root) !== stableStringify(gate.root)
    || stableStringify(normalized.frameworkSurvivors) !== stableStringify(gate.frameworkSurvivors)) {
    fail(`${label} does not match the root-exit broker membership`);
  }
  return freeze(normalized);
}
