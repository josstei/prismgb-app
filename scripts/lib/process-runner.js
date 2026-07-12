/**
 * Shared child-process lifecycle helpers for gate scripts: headless electron
 * environment, close-awaiting, and platform-aware process-tree termination.
 */
import { exec, execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MEBIBYTE_BYTES = 1024 * 1024;

function failProcessIdentity(message) {
  throw new TypeError(`Process identity tracker failed: ${message}`);
}

function failExternalMetric(message) {
  throw new TypeError(`External process metric failed: ${message}`);
}

function assertNonemptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    failExternalMetric(`${label} must be a nonempty string`);
  }
}

function assertPositiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    failExternalMetric(`${label} must be a positive safe integer`);
  }
}

function assertNonnegativeSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    failExternalMetric(`${label} must be a nonnegative safe integer`);
  }
}

function assertFiniteNonnegativeNumber(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    failExternalMetric(`${label} must be a nonnegative finite number`);
  }
}

function parseDecimalInteger(value, label) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    failExternalMetric(`${label} must be an unsigned decimal integer`);
  }
  const parsed = Number(value);
  assertNonnegativeSafeInteger(parsed, label);
  return parsed;
}

function parseBigDecimalInteger(value, label) {
  if (typeof value === 'number') {
    assertNonnegativeSafeInteger(value, label);
    return BigInt(value);
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    failExternalMetric(`${label} must be an unsigned decimal integer`);
  }
  return BigInt(value);
}

function freezeSnapshot({ cumulativeCpuSeconds, workingSetMiB, counterQuantumSeconds, raw }) {
  assertFiniteNonnegativeNumber(cumulativeCpuSeconds, 'cumulative CPU seconds');
  assertFiniteNonnegativeNumber(workingSetMiB, 'working set MiB');
  if (!Number.isFinite(counterQuantumSeconds) || counterQuantumSeconds <= 0 || counterQuantumSeconds > 0.01) {
    failExternalMetric('counter quantum seconds must be finite, positive, and at most 0.01');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    failExternalMetric('raw metric values must be an object');
  }
  return Object.freeze({
    cumulativeCpuSeconds,
    workingSetMiB,
    counterQuantumSeconds,
    raw: Object.freeze({ ...raw })
  });
}

function parseLinuxStatFields(stat) {
  if (typeof stat !== 'string') failExternalMetric('Linux /proc stat contents must be a string');
  const match = /^\s*(\d+)\s+\((.*)\)\s+(.*)$/s.exec(stat.trim());
  if (!match) failExternalMetric('Linux /proc stat contents are malformed');
  const pid = parseDecimalInteger(match[1], 'Linux /proc stat PID');
  const fields = match[3].trim().split(/\s+/);
  if (fields.length < 13) failExternalMetric('Linux /proc stat is missing CPU fields');
  if (!/^[A-Za-z]$/.test(fields[0])) failExternalMetric('Linux /proc stat process state is malformed');
  return {
    pid,
    userTicks: parseDecimalInteger(fields[11], 'Linux /proc stat user ticks'),
    systemTicks: parseDecimalInteger(fields[12], 'Linux /proc stat system ticks')
  };
}

function parseLinuxStatmFields(statm) {
  if (typeof statm !== 'string') failExternalMetric('Linux /proc statm contents must be a string');
  const fields = statm.trim().split(/\s+/);
  if (fields.length !== 7) failExternalMetric('Linux /proc statm must contain exactly seven fields');
  const values = fields.map((field, index) => parseDecimalInteger(field, `Linux /proc statm field ${index}`));
  return { residentPages: values[1] };
}

function parseMacosCpuTime(value) {
  assertNonemptyString(value, 'macOS ps CPU time');
  const dayParts = value.split('-');
  if (dayParts.length > 2 || dayParts.some((part) => part.length === 0)) {
    failExternalMetric('macOS ps CPU time has an invalid day separator');
  }
  const days = dayParts.length === 2 ? parseDecimalInteger(dayParts[0], 'macOS ps CPU days') : 0;
  const clockParts = dayParts.at(-1).split(':');
  if (clockParts.length !== 2 && clockParts.length !== 3) {
    failExternalMetric('macOS ps CPU time must be MM:SS or HH:MM:SS');
  }
  const hours = clockParts.length === 3 ? parseDecimalInteger(clockParts[0], 'macOS ps CPU hours') : 0;
  const minutes = parseDecimalInteger(clockParts.at(-2), 'macOS ps CPU minutes');
  if (minutes >= 60) failExternalMetric('macOS ps CPU minutes must be less than 60');
  const seconds = Number(clockParts.at(-1));
  if (!Number.isFinite(seconds) || seconds < 0 || seconds >= 60 || !/^\d+(?:\.\d+)?$/.test(clockParts.at(-1))) {
    failExternalMetric('macOS ps CPU seconds are malformed');
  }
  const totalSeconds = (((days * 24) + hours) * 60 + minutes) * 60 + seconds;
  assertFiniteNonnegativeNumber(totalSeconds, 'macOS ps cumulative CPU seconds');
  return totalSeconds;
}

/**
 * Decodes the Linux metric authority without inferring an acquisition instant.
 *
 * @param {{ stat: string, statm: string, clockTicks: number, pageSize: number }} input
 */
export function parseLinuxProcfsMetricSnapshot({ stat, statm, clockTicks, pageSize } = {}) {
  assertPositiveSafeInteger(clockTicks, 'Linux clock ticks per second');
  assertPositiveSafeInteger(pageSize, 'Linux page size');
  const parsedStat = parseLinuxStatFields(stat);
  const { residentPages } = parseLinuxStatmFields(statm);
  const totalTicks = parsedStat.userTicks + parsedStat.systemTicks;
  if (!Number.isSafeInteger(totalTicks)) failExternalMetric('Linux cumulative CPU ticks exceed safe integer precision');
  const residentBytes = residentPages * pageSize;
  if (!Number.isSafeInteger(residentBytes)) failExternalMetric('Linux resident byte count exceeds safe integer precision');
  return freezeSnapshot({
    cumulativeCpuSeconds: totalTicks / clockTicks,
    workingSetMiB: residentBytes / MEBIBYTE_BYTES,
    counterQuantumSeconds: 1 / clockTicks,
    raw: {
      pid: parsedStat.pid,
      userTicks: parsedStat.userTicks,
      systemTicks: parsedStat.systemTicks,
      residentPages,
      pageSize,
      clockTicks
    }
  });
}

/**
 * Decodes one `ps -o time= -o rss=` response. Its RSS input is KiB.
 *
 * @param {string} output
 */
export function parseMacosPsMetricSnapshot(output) {
  if (typeof output !== 'string') failExternalMetric('macOS ps output must be a string');
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length !== 1) failExternalMetric('macOS ps output must contain exactly one process row');
  const fields = lines[0].split(/\s+/);
  if (fields.length !== 2) failExternalMetric('macOS ps output must contain CPU time and RSS only');
  const cumulativeCpuSeconds = parseMacosCpuTime(fields[0]);
  const residentSetKiB = parseDecimalInteger(fields[1], 'macOS ps RSS KiB');
  return freezeSnapshot({
    cumulativeCpuSeconds,
    workingSetMiB: residentSetKiB / 1024,
    counterQuantumSeconds: 0.01,
    raw: { cpuTime: fields[0], residentSetKiB }
  });
}

/**
 * Decodes the closed Windows persistent-sampler payload. Integer strings avoid
 * precision loss before cumulative CPU and working-set conversion.
 *
 * @param {{ totalProcessorTimeTicks: string | number, workingSetBytes: string | number }} payload
 */
export function parseWindowsPowerShellMetricSnapshot(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    failExternalMetric('Windows sampler payload must be an object');
  }
  const keys = Object.keys(payload).sort();
  if (keys.join('\u0000') !== ['totalProcessorTimeTicks', 'workingSetBytes'].join('\u0000')) {
    failExternalMetric('Windows sampler payload must contain only totalProcessorTimeTicks and workingSetBytes');
  }
  const totalProcessorTimeTicks = parseBigDecimalInteger(payload.totalProcessorTimeTicks, 'Windows total processor time ticks');
  const workingSetBytes = parseBigDecimalInteger(payload.workingSetBytes, 'Windows working set bytes');
  if (workingSetBytes > BigInt(Number.MAX_SAFE_INTEGER)) {
    failExternalMetric('Windows working set bytes exceed safe integer precision');
  }
  const cumulativeCpuSeconds = Number(totalProcessorTimeTicks) / 10_000_000;
  if (!Number.isFinite(cumulativeCpuSeconds)) failExternalMetric('Windows cumulative CPU seconds are not finite');
  return freezeSnapshot({
    cumulativeCpuSeconds,
    workingSetMiB: Number(workingSetBytes) / MEBIBYTE_BYTES,
    counterQuantumSeconds: 0.0000001,
    raw: {
      totalProcessorTimeTicks: totalProcessorTimeTicks.toString(),
      workingSetBytes: workingSetBytes.toString()
    }
  });
}

/**
 * Creates the bracketed sample primitive shared by all external metric
 * adapters. The caller owns platform acquisition and records the raw source
 * alongside the projection used by the evaluator.
 *
 * @param {{
 *   readSnapshot: (context: Readonly<{ sequence: number, processIdentity: string }>) => Promise<Readonly<{ cumulativeCpuSeconds: number, workingSetMiB: number, counterQuantumSeconds: number, raw: object }>> | Readonly<{ cumulativeCpuSeconds: number, workingSetMiB: number, counterQuantumSeconds: number, raw: object }>,
 *   processIdentity: string,
 *   counterQuantumSeconds: number,
 *   clock?: () => number,
 *   maximumReadSeconds?: number
 * }} options
 */
export function createExternalMetricSampleReader({
  readSnapshot,
  processIdentity,
  counterQuantumSeconds,
  clock = () => performance.now() / 1000,
  maximumReadSeconds = 0.05
} = {}) {
  if (typeof readSnapshot !== 'function') failExternalMetric('readSnapshot must be a function');
  assertNonemptyString(processIdentity, 'process identity');
  if (!Number.isFinite(counterQuantumSeconds) || counterQuantumSeconds <= 0 || counterQuantumSeconds > 0.01) {
    failExternalMetric('counterQuantumSeconds must be finite, positive, and at most 0.01');
  }
  if (typeof clock !== 'function') failExternalMetric('clock must be a function');
  if (!Number.isFinite(maximumReadSeconds) || maximumReadSeconds <= 0 || maximumReadSeconds > 0.05) {
    failExternalMetric('maximumReadSeconds must be finite, positive, and at most 0.05');
  }

  let closed = false;
  let sequence = 0;
  let lastReadEnd = -Infinity;
  let lastCumulativeCpuSeconds = -Infinity;

  const readClock = (label) => {
    const value = clock();
    assertFiniteNonnegativeNumber(value, label);
    return value;
  };

  return Object.freeze({
    async sample() {
      if (closed) failExternalMetric('cannot sample a closed metric reader');
      const nextSequence = sequence + 1;
      const readStart = readClock('metric read start');
      if (readStart < lastReadEnd) failExternalMetric('metric read start regressed behind the prior read end');
      const snapshot = await readSnapshot(Object.freeze({ sequence: nextSequence, processIdentity }));
      const readEnd = readClock('metric read end');
      if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
        failExternalMetric('readSnapshot must return a metric snapshot object');
      }
      const normalizedSnapshot = freezeSnapshot(snapshot);
      if (normalizedSnapshot.counterQuantumSeconds !== counterQuantumSeconds) {
        failExternalMetric('metric snapshot counter quantum does not match its reader');
      }
      if (readEnd < readStart || readEnd - readStart > maximumReadSeconds) {
        failExternalMetric('metric read bracket is invalid or exceeds its maximum duration');
      }
      if (normalizedSnapshot.cumulativeCpuSeconds < lastCumulativeCpuSeconds) {
        failExternalMetric('metric cumulative CPU regressed');
      }

      sequence = nextSequence;
      lastReadEnd = readEnd;
      lastCumulativeCpuSeconds = normalizedSnapshot.cumulativeCpuSeconds;
      return Object.freeze({
        sample: Object.freeze({
          ordinal: sequence,
          readStart,
          readEnd,
          cumulativeCpuSeconds: normalizedSnapshot.cumulativeCpuSeconds,
          counterQuantumSeconds,
          processIdentity,
          workingSetMiB: normalizedSnapshot.workingSetMiB
        }),
        raw: normalizedSnapshot.raw
      });
    },

    close() {
      if (closed) failExternalMetric('metric reader is already closed');
      closed = true;
      return Object.freeze({ samplesRead: sequence, closedAt: readClock('metric reader close time') });
    }
  });
}

/**
 * @param {{
 *   procfsRoot?: string,
 *   pageSize: number,
 *   clockTicks: number,
 *   readFile?: (file: string, encoding: 'utf8') => Promise<string> | string
 * }} options
 */
export function createLinuxProcfsSnapshotReader({
  procfsRoot = '/proc',
  pageSize,
  clockTicks,
  readFile = fs.readFile
} = {}) {
  assertNonemptyString(procfsRoot, 'procfs root');
  assertPositiveSafeInteger(pageSize, 'Linux page size');
  assertPositiveSafeInteger(clockTicks, 'Linux clock ticks per second');
  if (typeof readFile !== 'function') failExternalMetric('readFile must be a function');
  const resolvedRoot = path.resolve(procfsRoot);

  return async (pid) => {
    assertPositiveSafeInteger(pid, 'Linux process PID');
    const processDirectory = path.resolve(resolvedRoot, String(pid));
    const relativeProcessDirectory = path.relative(resolvedRoot, processDirectory);
    if (relativeProcessDirectory.startsWith('..') || path.isAbsolute(relativeProcessDirectory)) {
      failExternalMetric('Linux process path escapes the procfs root');
    }
    const stat = await readFile(path.join(processDirectory, 'stat'), 'utf8');
    const statm = await readFile(path.join(processDirectory, 'statm'), 'utf8');
    const snapshot = parseLinuxProcfsMetricSnapshot({ stat, statm, clockTicks, pageSize });
    if (snapshot.raw.pid !== pid) failExternalMetric('Linux /proc stat PID does not match the requested process');
    return snapshot;
  };
}

async function runMacosPs(command, args) {
  const { stdout } = await execFileAsync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024
  });
  return stdout;
}

/**
 * @param {{ runCommand?: (command: string, args: string[]) => Promise<string> | string }} options
 */
export function createMacosPsSnapshotReader({ runCommand = runMacosPs } = {}) {
  if (typeof runCommand !== 'function') failExternalMetric('runCommand must be a function');
  return async (pid) => {
    assertPositiveSafeInteger(pid, 'macOS process PID');
    const output = await runCommand('/bin/ps', ['-o', 'time=', '-o', 'rss=', '-p', String(pid)]);
    return parseMacosPsMetricSnapshot(output);
  };
}

function normalizeMetricSessionTarget(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    failExternalMetric('metric session target must be an object');
  }
  const keys = Object.keys(value).sort();
  if (keys.join('\u0000') !== ['counterQuantumSeconds', 'creationIdentity', 'pid', 'processIdentity'].join('\u0000')) {
    failExternalMetric('metric session target must contain only pid, creationIdentity, processIdentity, and counterQuantumSeconds');
  }
  assertPositiveSafeInteger(value.pid, 'metric session target PID');
  assertNonemptyString(value.creationIdentity, 'metric session target creation identity');
  assertNonemptyString(value.processIdentity, 'metric session target process identity');
  if (!Number.isFinite(value.counterQuantumSeconds) || value.counterQuantumSeconds <= 0 || value.counterQuantumSeconds > 0.01) {
    failExternalMetric('metric session target counter quantum must be finite, positive, and at most 0.01');
  }
  return Object.freeze({
    pid: value.pid,
    creationIdentity: value.creationIdentity,
    processIdentity: value.processIdentity,
    counterQuantumSeconds: value.counterQuantumSeconds
  });
}

function metricSessionTargetKey(target) {
  return JSON.stringify([target.pid, target.creationIdentity, target.processIdentity]);
}

function cloneMetricSessionTransitions(transitions) {
  return Object.freeze(transitions.map((transition) => Object.freeze({
    ...transition,
    ...(transition.target ? { target: Object.freeze({ ...transition.target }) } : {})
  })));
}

/**
 * Owns one pair-scoped external metric session. Platform adapters provide a
 * reader only after a target is attached; this state machine ensures a side
 * cannot overlap another target, restart an already-used target, or claim a
 * completed close while an adapter remains attached.
 *
 * @param {{
 *   adapterId: string,
 *   createReader: (context: Readonly<{ adapterId: string, resource: unknown, target: Readonly<{ pid: number, creationIdentity: string, processIdentity: string, counterQuantumSeconds: number }> }>) => Promise<Readonly<{ sample: () => Promise<unknown> | unknown, close: () => Promise<unknown> | unknown }>> | Readonly<{ sample: () => Promise<unknown> | unknown, close: () => Promise<unknown> | unknown }>,
 *   openResource?: (context: Readonly<{ adapterId: string }>) => Promise<unknown> | unknown,
 *   closeResource?: (resource: unknown, context: Readonly<{ adapterId: string }>) => Promise<unknown> | unknown,
 *   clock?: () => number
 * }} options
 */
export function createExternalMetricAdapterSession({
  adapterId,
  createReader,
  openResource = () => undefined,
  closeResource = () => undefined,
  clock = () => performance.now() / 1000
} = {}) {
  assertNonemptyString(adapterId, 'metric adapter ID');
  if (typeof createReader !== 'function') failExternalMetric('createReader must be a function');
  if (typeof openResource !== 'function') failExternalMetric('openResource must be a function');
  if (typeof closeResource !== 'function') failExternalMetric('closeResource must be a function');
  if (typeof clock !== 'function') failExternalMetric('metric session clock must be a function');

  let state = 'new';
  let resource;
  let active = null;
  let sampling = false;
  let transitionSequence = 0;
  let lastTransitionAt = -Infinity;
  const transitions = [];
  const seenTargetKeys = new Set();
  const targetKeyByPid = new Map();
  const targetKeyByProcessIdentity = new Map();

  const recordTransition = (operation, target = null) => {
    const at = clock();
    assertFiniteNonnegativeNumber(at, `metric session ${operation} time`);
    if (at < lastTransitionAt) failExternalMetric('metric session clock regressed between transitions');
    lastTransitionAt = at;
    const transition = Object.freeze({
      sequence: ++transitionSequence,
      operation,
      at,
      ...(target === null ? {} : { target })
    });
    transitions.push(transition);
    return transition;
  };

  const requireOpen = (operation) => {
    if (state !== 'open') failExternalMetric(`cannot ${operation} when the metric session is ${state}`);
  };

  const requireActive = (operation) => {
    requireOpen(operation);
    if (active === null) failExternalMetric(`cannot ${operation} without an attached metric target`);
  };

  const readFromActiveTarget = async (operation) => {
    requireActive(operation);
    if (sampling) failExternalMetric('metric session does not permit overlapping samples');
    sampling = true;
    try {
      const value = await active.reader.sample();
      recordTransition(operation, active.target);
      return value;
    } catch (error) {
      recordTransition(`${operation}-failed`, active.target);
      throw error;
    } finally {
      sampling = false;
    }
  };

  return Object.freeze({
    async open() {
      if (state !== 'new') failExternalMetric(`cannot open the metric session when it is ${state}`);
      resource = await openResource(Object.freeze({ adapterId }));
      state = 'open';
      recordTransition('open');
      return Object.freeze({ adapterId });
    },

    async attach(targetInput) {
      requireOpen('attach a metric target');
      if (active !== null) failExternalMetric('metric session already has an attached target');
      const target = normalizeMetricSessionTarget(targetInput);
      const targetKey = metricSessionTargetKey(target);
      const previousPidTargetKey = targetKeyByPid.get(target.pid);
      if (previousPidTargetKey !== undefined && previousPidTargetKey !== targetKey) {
        failExternalMetric('metric session detected PID replacement');
      }
      const previousProcessIdentityTargetKey = targetKeyByProcessIdentity.get(target.processIdentity);
      if (previousProcessIdentityTargetKey !== undefined && previousProcessIdentityTargetKey !== targetKey) {
        failExternalMetric('metric session detected process identity replacement');
      }
      if (seenTargetKeys.has(targetKey)) failExternalMetric('metric session cannot reuse a detached target');
      const reader = await createReader(Object.freeze({ adapterId, resource, target }));
      if (!reader || typeof reader !== 'object' || typeof reader.sample !== 'function' || typeof reader.close !== 'function') {
        failExternalMetric('createReader must return sample and close functions');
      }
      targetKeyByPid.set(target.pid, targetKey);
      targetKeyByProcessIdentity.set(target.processIdentity, targetKey);
      seenTargetKeys.add(targetKey);
      active = Object.freeze({ target, reader });
      recordTransition('attach', target);
      return target;
    },

    async prime() {
      return readFromActiveTarget('prime');
    },

    async sample() {
      return readFromActiveTarget('sample');
    },

    async detach() {
      requireActive('detach the metric target');
      if (sampling) failExternalMetric('cannot detach a metric target during a sample');
      const closing = active;
      try {
        const result = await closing.reader.close();
        active = null;
        recordTransition('detach', closing.target);
        return result;
      } catch (error) {
        recordTransition('detach-failed', closing.target);
        throw error;
      }
    },

    async close() {
      requireOpen('close the metric session');
      if (active !== null) failExternalMetric('cannot close a metric session with an attached target');
      const result = await closeResource(resource, Object.freeze({ adapterId }));
      state = 'closed';
      recordTransition('close');
      return Object.freeze({
        adapterId,
        result,
        transitions: cloneMetricSessionTransitions(transitions)
      });
    },

    getAudit() {
      return Object.freeze({
        adapterId,
        state,
        transitions: cloneMetricSessionTransitions(transitions)
      });
    }
  });
}

function compareProcessIdentities(left, right) {
  if (left.pid !== right.pid) return left.pid - right.pid;
  if (left.creationTime !== right.creationTime) return left.creationTime - right.creationTime;
  if (left.ownershipIdentity === right.ownershipIdentity) return 0;
  return left.ownershipIdentity < right.ownershipIdentity ? -1 : 1;
}

function normalizeProcessIdentity(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    failProcessIdentity(`${label} must be an object`);
  }
  const keys = Object.keys(value).sort();
  if (keys.join('\u0000') !== ['creationTime', 'ownershipIdentity', 'pid'].join('\u0000')) {
    failProcessIdentity(`${label} must contain only pid, creationTime, and ownershipIdentity`);
  }
  if (!Number.isSafeInteger(value.pid) || value.pid <= 0) {
    failProcessIdentity(`${label}.pid must be a positive safe integer`);
  }
  if (!Number.isFinite(value.creationTime) || value.creationTime < 0) {
    failProcessIdentity(`${label}.creationTime must be a nonnegative finite number`);
  }
  if (typeof value.ownershipIdentity !== 'string' || value.ownershipIdentity.length === 0) {
    failProcessIdentity(`${label}.ownershipIdentity must be a nonempty string`);
  }
  return Object.freeze({
    pid: value.pid,
    creationTime: value.creationTime,
    ownershipIdentity: value.ownershipIdentity
  });
}

function identityKey(identity) {
  return JSON.stringify([identity.pid, identity.creationTime, identity.ownershipIdentity]);
}

function processCreationKey(identity) {
  return JSON.stringify([identity.pid, identity.creationTime]);
}

function freezeIdentityList(identities) {
  return Object.freeze(identities
    .slice()
    .sort(compareProcessIdentities)
    .map((identity) => Object.freeze({ ...identity })));
}

/**
 * Tracks only adapter-resolved, launch-owned process identities. A PID is never
 * treated as stable on its own: a changed creation time records an exit plus a
 * new entry, while changed ownership for an unchanged process is rejected.
 *
 * @param {{
 *   enumerateLaunchOwnedIdentities: (context: Readonly<{ sequence: number }>) =>
 *     Promise<Array<{ pid: number, creationTime: number, ownershipIdentity: string }>> |
 *     Array<{ pid: number, creationTime: number, ownershipIdentity: string }>,
 *   clock?: () => number
 * }} options
 */
export function createProcessIdentityTracker({
  enumerateLaunchOwnedIdentities,
  clock = () => performance.now()
} = {}) {
  if (typeof enumerateLaunchOwnedIdentities !== 'function') {
    failProcessIdentity('enumerateLaunchOwnedIdentities must be a function');
  }
  if (typeof clock !== 'function') failProcessIdentity('clock must be a function');

  let sequence = 0;
  let lastObservedAt = -Infinity;
  let liveByIdentity = new Map();

  return Object.freeze({
    async observe() {
      const nextSequence = sequence + 1;
      const rawIdentities = await enumerateLaunchOwnedIdentities(Object.freeze({ sequence: nextSequence }));
      if (!Array.isArray(rawIdentities)) failProcessIdentity('adapter must return an array of launch-owned identities');

      const currentByIdentity = new Map();
      const currentByPid = new Map();
      const currentByProcessCreation = new Map();
      rawIdentities.forEach((value, index) => {
        const identity = normalizeProcessIdentity(value, `adapter identity ${index}`);
        const key = identityKey(identity);
        if (currentByIdentity.has(key)) failProcessIdentity('adapter returned a duplicate process identity');
        if (currentByPid.has(identity.pid)) failProcessIdentity('adapter returned multiple live identities for one PID');
        const creationKey = processCreationKey(identity);
        const existing = currentByProcessCreation.get(creationKey);
        if (existing && existing.ownershipIdentity !== identity.ownershipIdentity) {
          failProcessIdentity('adapter changed ownership identity for one live process');
        }
        currentByIdentity.set(key, identity);
        currentByPid.set(identity.pid, identity);
        currentByProcessCreation.set(creationKey, identity);
      });

      const observedAt = clock();
      if (!Number.isFinite(observedAt) || observedAt < 0) failProcessIdentity('clock must return a nonnegative finite number');
      if (observedAt < lastObservedAt) failProcessIdentity('clock regressed between process observations');

      const priorByProcessCreation = new Map([...liveByIdentity.values()].map((identity) => [processCreationKey(identity), identity]));
      for (const identity of currentByIdentity.values()) {
        const prior = priorByProcessCreation.get(processCreationKey(identity));
        if (prior && prior.ownershipIdentity !== identity.ownershipIdentity) {
          failProcessIdentity('ownership identity changed for an existing PID and creation time');
        }
      }

      const entered = [];
      const exited = [];
      for (const [key, identity] of currentByIdentity) {
        if (!liveByIdentity.has(key)) entered.push(identity);
      }
      for (const [key, identity] of liveByIdentity) {
        if (!currentByIdentity.has(key)) exited.push(identity);
      }

      sequence = nextSequence;
      lastObservedAt = observedAt;
      liveByIdentity = currentByIdentity;
      return Object.freeze({
        sequence,
        observedAt,
        live: freezeIdentityList([...liveByIdentity.values()]),
        entered: freezeIdentityList(entered),
        exited: freezeIdentityList(exited)
      });
    },

    getLiveIdentities() {
      return freezeIdentityList([...liveByIdentity.values()]);
    }
  });
}

export function headlessElectronEnv(baseEnv = process.env) {
  return {
    ...baseEnv,
    ELECTRON_DISABLE_GPU: '1',
    ELECTRON_NO_ATTACH_CONSOLE: '1'
  };
}

export async function waitForProcessClose(child, timeoutMs) {
  if (!child) {
    return { closed: false, code: null, signal: null };
  }

  return new Promise((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ closed: false, code: null, signal: 'timeout' });
      }
    }, timeoutMs);

    child.once('close', (code, signal) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ closed: true, code, signal });
      }
    });
  });
}

export async function terminateProcessTree(child, {
  gracefulMs = 5000,
  killProcessGroup = false,
  platform = process.platform,
  execCommand = exec,
  signalGroup = (pid, signal) => process.kill(-pid, signal)
} = {}) {
  if (!child || typeof child.pid !== 'number') {
    return;
  }

  try {
    if (platform === 'win32') {
      execCommand(`taskkill /pid ${child.pid} /t /f`);
    } else if (killProcessGroup) {
      signalGroup(child.pid, 'SIGTERM');
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      return;
    }
  }

  const closeResult = await waitForProcessClose(child, gracefulMs);
  if (!closeResult.closed) {
    try {
      child.kill('SIGKILL');
    } catch {
      return;
    }
    await waitForProcessClose(child, Math.min(1000, gracefulMs));
  }
}
