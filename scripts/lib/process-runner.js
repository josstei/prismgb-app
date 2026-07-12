/**
 * Shared child-process lifecycle helpers for gate scripts: headless electron
 * environment, close-awaiting, and platform-aware process-tree termination.
 */
import { exec, execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MEBIBYTE_BYTES = 1024 * 1024;
export const WINDOWS_POWERSHELL_METRIC_SAMPLER_PROTOCOL_VERSION = 1;

export const WINDOWS_POWERSHELL_METRIC_SAMPLER_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$protocolVersion = 1
$sequence = 0
$attached = $null

function Send-SamplerEnvelope([object]$Value) {
  [Console]::Out.WriteLine(($Value | ConvertTo-Json -Compress -Depth 4))
}

function Require-AttachedProcess() {
  if ($null -eq $attached) {
    throw 'no process is attached to the sampler'
  }
  $process = Get-Process -Id ([int]$attached.pid) -ErrorAction Stop
  $creationIdentity = $process.StartTime.ToUniversalTime().Ticks.ToString()
  if ($creationIdentity -ne [string]$attached.creationIdentity) {
    throw 'the attached process creation identity changed'
  }
  return $process
}

Send-SamplerEnvelope ([ordered]@{ type = 'ready'; protocolVersion = $protocolVersion })

while (($line = [Console]::In.ReadLine()) -ne $null) {
  $request = $null
  try {
    $request = $line | ConvertFrom-Json -ErrorAction Stop
    $requestId = [int]$request.requestId
    $operation = [string]$request.operation

    if ($operation -eq 'attach') {
      if ($null -ne $attached) {
        throw 'a process is already attached to the sampler'
      }
      $process = Get-Process -Id ([int]$request.pid) -ErrorAction Stop
      $creationIdentity = $process.StartTime.ToUniversalTime().Ticks.ToString()
      if ($creationIdentity -ne [string]$request.creationIdentity) {
        throw 'the requested process creation identity does not match'
      }
      $attached = [ordered]@{ pid = [int]$request.pid; creationIdentity = $creationIdentity }
      $sequence += 1
      Send-SamplerEnvelope ([ordered]@{
        requestId = $requestId; ok = $true; operation = 'attach'; samplerSequence = $sequence;
        pid = $attached.pid; creationIdentity = $attached.creationIdentity
      })
      continue
    }

    if ($operation -eq 'prime' -or $operation -eq 'sample') {
      $readStartTicks = [System.Diagnostics.Stopwatch]::GetTimestamp()
      $process = Require-AttachedProcess
      $process.Refresh()
      $totalProcessorTimeTicks = $process.TotalProcessorTime.Ticks
      $workingSetBytes = $process.WorkingSet64
      $readEndTicks = [System.Diagnostics.Stopwatch]::GetTimestamp()
      $sequence += 1
      Send-SamplerEnvelope ([ordered]@{
        requestId = $requestId; ok = $true; operation = $operation; samplerSequence = $sequence;
        pid = $attached.pid; creationIdentity = $attached.creationIdentity;
        totalProcessorTimeTicks = $totalProcessorTimeTicks.ToString(); workingSetBytes = $workingSetBytes.ToString();
        readStartTicks = $readStartTicks.ToString(); readEndTicks = $readEndTicks.ToString();
        stopwatchFrequency = [System.Diagnostics.Stopwatch]::Frequency.ToString()
      })
      continue
    }

    if ($operation -eq 'detach') {
      Require-AttachedProcess | Out-Null
      $sequence += 1
      Send-SamplerEnvelope ([ordered]@{
        requestId = $requestId; ok = $true; operation = 'detach'; samplerSequence = $sequence;
        pid = $attached.pid; creationIdentity = $attached.creationIdentity
      })
      $attached = $null
      continue
    }

    throw "unsupported sampler operation: $operation"
  } catch {
    $requestId = if ($null -ne $request -and $null -ne $request.requestId) { [int]$request.requestId } else { $null }
    Send-SamplerEnvelope ([ordered]@{ requestId = $requestId; ok = $false; error = [string]$_.Exception.Message })
  }
}
`;

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
  if (fields.length < 20) failExternalMetric('Linux /proc stat is missing process creation fields');
  if (!/^[A-Za-z]$/.test(fields[0])) failExternalMetric('Linux /proc stat process state is malformed');
  return {
    pid,
    userTicks: parseDecimalInteger(fields[11], 'Linux /proc stat user ticks'),
    systemTicks: parseDecimalInteger(fields[12], 'Linux /proc stat system ticks'),
    startTicks: parseDecimalInteger(fields[19], 'Linux /proc stat start ticks')
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
      startTicks: parsedStat.startTicks,
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
 *   readSnapshot: (context: Readonly<{ sequence: number, processIdentity: string, operation: 'prime' | 'sample' }>) => Promise<Readonly<{ cumulativeCpuSeconds: number, workingSetMiB: number, counterQuantumSeconds: number, raw: object }>> | Readonly<{ cumulativeCpuSeconds: number, workingSetMiB: number, counterQuantumSeconds: number, raw: object }>,
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

  const takeSample = async (operation) => {
    if (closed) failExternalMetric('cannot sample a closed metric reader');
    const nextSequence = operation === 'prime' ? 0 : sequence + 1;
    const readStart = readClock('metric read start');
    if (readStart < lastReadEnd) failExternalMetric('metric read start regressed behind the prior read end');
    const snapshot = await readSnapshot(Object.freeze({ sequence: nextSequence, processIdentity, operation }));
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

    if (operation === 'sample') sequence = nextSequence;
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
  };

  return Object.freeze({
    async prime() {
      return takeSample('prime');
    },

    async sample() {
      return takeSample('sample');
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
    const processDirectory = resolveLinuxProcfsProcessDirectory(resolvedRoot, pid);
    const stat = await readFile(path.join(processDirectory, 'stat'), 'utf8');
    const statm = await readFile(path.join(processDirectory, 'statm'), 'utf8');
    const snapshot = parseLinuxProcfsMetricSnapshot({ stat, statm, clockTicks, pageSize });
    if (snapshot.raw.pid !== pid) failExternalMetric('Linux /proc stat PID does not match the requested process');
    return snapshot;
  };
}

function resolveLinuxProcfsProcessDirectory(resolvedRoot, pid) {
  const processDirectory = path.resolve(resolvedRoot, String(pid));
  const relativeProcessDirectory = path.relative(resolvedRoot, processDirectory);
  if (relativeProcessDirectory.startsWith('..') || path.isAbsolute(relativeProcessDirectory)) {
    failExternalMetric('Linux process path escapes the procfs root');
  }
  return processDirectory;
}

/**
 * Resolves a Linux process's PID-reuse-resistant creation identity from its
 * procfs stat record. The returned identity is intended to be attached to a
 * target before metric sampling begins.
 *
 * @param {{ procfsRoot?: string, readFile?: (file: string, encoding: 'utf8') => Promise<string> | string }} options
 */
export function createLinuxProcfsProcessIdentityReader({
  procfsRoot = '/proc',
  readFile = fs.readFile
} = {}) {
  assertNonemptyString(procfsRoot, 'procfs root');
  if (typeof readFile !== 'function') failExternalMetric('readFile must be a function');
  const resolvedRoot = path.resolve(procfsRoot);

  return async (pid) => {
    assertPositiveSafeInteger(pid, 'Linux process PID');
    const processDirectory = resolveLinuxProcfsProcessDirectory(resolvedRoot, pid);
    const parsed = parseLinuxStatFields(await readFile(path.join(processDirectory, 'stat'), 'utf8'));
    if (parsed.pid !== pid) failExternalMetric('Linux /proc stat PID does not match the requested process');
    return Object.freeze({ pid, creationIdentity: String(parsed.startTicks) });
  };
}

/**
 * Resolves the procfs quantities that define Linux CPU and working-set units.
 * The external runner retains these values with the selected adapter instead
 * of guessing them from a host architecture.
 *
 * @param {{ runCommand?: (command: string, args: string[]) => Promise<string> | string }} options
 */
export async function readLinuxProcfsMetricConfiguration({ runCommand = runGetconf } = {}) {
  if (typeof runCommand !== 'function') failExternalMetric('runCommand must be a function');
  const [pageSizeOutput, clockTicksOutput] = await Promise.all([
    runCommand('getconf', ['PAGESIZE']),
    runCommand('getconf', ['CLK_TCK'])
  ]);
  const pageSize = parseExternalDecimalOutput(pageSizeOutput, 'Linux page size');
  const clockTicks = parseExternalDecimalOutput(clockTicksOutput, 'Linux clock ticks per second');
  assertPositiveSafeInteger(pageSize, 'Linux page size');
  assertPositiveSafeInteger(clockTicks, 'Linux clock ticks per second');
  const counterQuantumSeconds = 1 / clockTicks;
  if (!Number.isFinite(counterQuantumSeconds) || counterQuantumSeconds <= 0 || counterQuantumSeconds > 0.01) {
    failExternalMetric('Linux clock ticks must yield a counter quantum at most 0.01 seconds');
  }
  return Object.freeze({ pageSize, clockTicks, counterQuantumSeconds });
}

async function runMacosPs(command, args) {
  const { stdout } = await execFileAsync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024
  });
  return stdout;
}

async function runWindowsPowerShell(command, args) {
  const { stdout } = await execFileAsync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024
  });
  return stdout;
}

async function runGetconf(command, args) {
  const { stdout } = await execFileAsync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024
  });
  return stdout;
}

function parseExternalDecimalOutput(output, label) {
  if (typeof output !== 'string') failExternalMetric(`${label} output must be a string`);
  const normalized = output.trim();
  if (normalized.includes('\n') || normalized.includes('\r')) failExternalMetric(`${label} output must contain one decimal value`);
  return parseDecimalInteger(normalized, label);
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

function parseMacosPsIdentityFields(output, expectedFieldCount, label) {
  if (typeof output !== 'string') failExternalMetric(`${label} output must be a string`);
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length !== 1) failExternalMetric(`${label} output must contain exactly one process row`);
  const fields = lines[0].split(/\s+/);
  if (fields.length !== expectedFieldCount) failExternalMetric(`${label} output has an invalid field count`);
  const pid = parseDecimalInteger(fields[0], `${label} PID`);
  const creationIdentity = fields.slice(1, 6).join(' ');
  assertNonemptyString(creationIdentity, `${label} creation identity`);
  return { fields, pid, creationIdentity };
}

/**
 * Decodes `ps -o pid= -o lstart=` into an immutable PID and creation
 * identity. `lstart` is preserved as the platform authority's normalized
 * five-token value so the same reader can reject PID reuse during sampling.
 *
 * @param {string} output
 */
export function parseMacosPsProcessIdentity(output) {
  const { pid, creationIdentity } = parseMacosPsIdentityFields(output, 6, 'macOS ps process identity');
  return Object.freeze({ pid, creationIdentity });
}

/**
 * Decodes one `ps -o pid= -o lstart= -o time= -o rss=` row. Unlike the
 * metric-only decoder, this raw record carries the PID-reuse identity used to
 * verify every prime and sample against the attached target.
 *
 * @param {string} output
 */
export function parseMacosPsMetricIdentitySnapshot(output) {
  const { fields, pid, creationIdentity } = parseMacosPsIdentityFields(output, 8, 'macOS ps metric identity');
  const metric = parseMacosPsMetricSnapshot(`${fields[6]} ${fields[7]}`);
  return freezeSnapshot({
    ...metric,
    raw: { pid, creationIdentity, ...metric.raw }
  });
}

/**
 * @param {{ runCommand?: (command: string, args: string[]) => Promise<string> | string }} options
 */
export function createMacosPsProcessIdentityReader({ runCommand = runMacosPs } = {}) {
  if (typeof runCommand !== 'function') failExternalMetric('runCommand must be a function');
  return async (pid) => {
    assertPositiveSafeInteger(pid, 'macOS process PID');
    const output = await runCommand('/bin/ps', ['-o', 'pid=', '-o', 'lstart=', '-p', String(pid)]);
    const identity = parseMacosPsProcessIdentity(output);
    if (identity.pid !== pid) failExternalMetric('macOS ps PID does not match the requested process');
    return identity;
  };
}

/**
 * @param {{ runCommand?: (command: string, args: string[]) => Promise<string> | string }} options
 */
export function createMacosPsMetricIdentitySnapshotReader({ runCommand = runMacosPs } = {}) {
  if (typeof runCommand !== 'function') failExternalMetric('runCommand must be a function');
  return async (pid) => {
    assertPositiveSafeInteger(pid, 'macOS process PID');
    const output = await runCommand('/bin/ps', ['-o', 'pid=', '-o', 'lstart=', '-o', 'time=', '-o', 'rss=', '-p', String(pid)]);
    const snapshot = parseMacosPsMetricIdentitySnapshot(output);
    if (snapshot.raw.pid !== pid) failExternalMetric('macOS ps PID does not match the requested process');
    return snapshot;
  };
}

function parseWindowsPowerShellCreationIdentity(output) {
  if (typeof output !== 'string') failExternalMetric('Windows PowerShell creation identity output must be a string');
  const identity = output.trim();
  if (!/^\d+$/.test(identity)) failExternalMetric('Windows PowerShell creation identity must be an unsigned decimal integer');
  return identity;
}

/**
 * Resolves the immutable Windows process-start tick value used by the
 * persistent PowerShell metric sampler to reject PID reuse.
 *
 * @param {{ runCommand?: (command: string, args: string[]) => Promise<string> | string }} options
 */
export function createWindowsPowerShellProcessIdentityReader({ runCommand = runWindowsPowerShell } = {}) {
  if (typeof runCommand !== 'function') failExternalMetric('runCommand must be a function');
  return async (pid) => {
    assertPositiveSafeInteger(pid, 'Windows process PID');
    const script = `$ErrorActionPreference = 'Stop'; $process = Get-Process -Id ${pid} -ErrorAction Stop; [Console]::Out.Write($process.StartTime.ToUniversalTime().Ticks.ToString())`;
    const output = await runCommand('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
    return Object.freeze({ pid, creationIdentity: parseWindowsPowerShellCreationIdentity(output) });
  };
}

function assertExactObjectKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    failExternalMetric(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.join('\u0000') !== expected.join('\u0000')) {
    failExternalMetric(`${label} has an invalid field set`);
  }
}

function parseSamplerBigInteger(value, label) {
  const parsed = parseBigDecimalInteger(value, label);
  return Object.freeze({ value: parsed, text: parsed.toString() });
}

function normalizeWindowsSamplerTarget(value) {
  const target = normalizeMetricSessionTarget(value);
  if (target.counterQuantumSeconds !== 0.0000001) {
    failExternalMetric('Windows sampler targets must use the 100-nanosecond counter quantum');
  }
  return target;
}

function validateWindowsSamplerResponse(response, operation, requestId, target, lastSamplerSequence) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    failExternalMetric('Windows sampler response must be an object');
  }
  const sampleOperation = operation === 'prime' || operation === 'sample';
  assertExactObjectKeys(response, sampleOperation
    ? ['requestId', 'ok', 'operation', 'samplerSequence', 'pid', 'creationIdentity', 'totalProcessorTimeTicks', 'workingSetBytes', 'readStartTicks', 'readEndTicks', 'stopwatchFrequency']
    : ['requestId', 'ok', 'operation', 'samplerSequence', 'pid', 'creationIdentity'], 'Windows sampler response');
  if (response.requestId !== requestId || response.ok !== true || response.operation !== operation) {
    failExternalMetric('Windows sampler response does not bind its request');
  }
  assertPositiveSafeInteger(response.samplerSequence, 'Windows sampler response sequence');
  if (response.samplerSequence !== lastSamplerSequence + 1) {
    failExternalMetric('Windows sampler response sequence is not contiguous');
  }
  if (response.pid !== target.pid || response.creationIdentity !== target.creationIdentity) {
    failExternalMetric('Windows sampler response target identity does not match the attached process');
  }
  if (!sampleOperation) return Object.freeze({ samplerSequence: response.samplerSequence });

  const readStartTicks = parseSamplerBigInteger(response.readStartTicks, 'Windows sampler read start ticks');
  const readEndTicks = parseSamplerBigInteger(response.readEndTicks, 'Windows sampler read end ticks');
  const stopwatchFrequency = parseSamplerBigInteger(response.stopwatchFrequency, 'Windows sampler stopwatch frequency');
  if (readEndTicks.value < readStartTicks.value || stopwatchFrequency.value <= 0n) {
    failExternalMetric('Windows sampler response has an invalid read bracket');
  }
  const bracketSeconds = Number(readEndTicks.value - readStartTicks.value) / Number(stopwatchFrequency.value);
  if (!Number.isFinite(bracketSeconds) || bracketSeconds < 0 || bracketSeconds > 0.05) {
    failExternalMetric('Windows sampler response read bracket exceeds 50 milliseconds');
  }
  const snapshot = parseWindowsPowerShellMetricSnapshot({
    totalProcessorTimeTicks: response.totalProcessorTimeTicks,
    workingSetBytes: response.workingSetBytes
  });
  return Object.freeze({
    samplerSequence: response.samplerSequence,
    snapshot,
    sampler: Object.freeze({
      pid: target.pid,
      creationIdentity: target.creationIdentity,
      readStartTicks: readStartTicks.text,
      readEndTicks: readEndTicks.text,
      stopwatchFrequency: stopwatchFrequency.text,
      bracketSeconds
    })
  });
}

function waitForValue(promise, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * Opens the one persistent Windows PowerShell sampler allowed for a
 * pair-scoped metric session. The JSON-lines transport is deliberately closed
 * to attach, prime, sample, and detach requests; a one-time ready envelope
 * establishes the subprocess before either comparison side attaches.
 *
 * @param {{
 *   spawnProcess?: (command: string, args: string[], options: { stdio: [string, string, string], windowsHide: boolean }) => any,
 *   command?: string,
 *   readyTimeoutMs?: number,
 *   responseTimeoutMs?: number,
 *   maximumResponseBytes?: number
 * }} options
 */
export async function openWindowsPowerShellMetricSampler({
  spawnProcess = spawn,
  command = 'powershell.exe',
  readyTimeoutMs = 5_000,
  responseTimeoutMs = 5_000,
  maximumResponseBytes = 64 * 1024
} = {}) {
  if (typeof spawnProcess !== 'function') failExternalMetric('spawnProcess must be a function');
  assertNonemptyString(command, 'Windows PowerShell command');
  for (const [label, value] of Object.entries({ readyTimeoutMs, responseTimeoutMs, maximumResponseBytes })) {
    assertPositiveSafeInteger(value, `Windows sampler ${label}`);
  }
  if (readyTimeoutMs > 5_000 || responseTimeoutMs > 5_000 || maximumResponseBytes > 64 * 1024) {
    failExternalMetric('Windows sampler timeout or response limit exceeds the closed policy cap');
  }

  const child = spawnProcess(command, ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_POWERSHELL_METRIC_SAMPLER_SCRIPT], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });
  if (!child || typeof child !== 'object' || !child.stdin || !child.stdout || !child.stderr || typeof child.once !== 'function') {
    failExternalMetric('Windows sampler spawn did not return a stdio child process');
  }
  if (typeof child.stdin.write !== 'function' || typeof child.stdin.end !== 'function' || typeof child.stdout.on !== 'function' || typeof child.stderr.on !== 'function') {
    failExternalMetric('Windows sampler child does not expose writable stdin and readable stdout/stderr');
  }
  assertPositiveSafeInteger(child.pid, 'Windows sampler PID');

  let ready = false;
  let closed = false;
  let closing = false;
  let terminalError = null;
  let stdoutBuffer = '';
  let stderr = '';
  let pending = null;
  let requestId = 0;
  let samplerSequence = 0;
  let activeTarget = null;
  let resolveReady;
  let rejectReady;
  let resolveClose;
  const readyPromise = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const closePromise = new Promise((resolve) => {
    resolveClose = resolve;
  });

  const failTransport = (error) => {
    if (terminalError !== null) return;
    terminalError = error instanceof Error ? error : new Error(String(error));
    if (!ready) rejectReady(terminalError);
    if (pending !== null) {
      clearTimeout(pending.timer);
      const rejected = pending;
      pending = null;
      rejected.reject(terminalError);
    }
  };

  const processResponse = (response) => {
    if (!response || typeof response !== 'object' || Array.isArray(response)) {
      failTransport(new Error('Windows sampler emitted a non-object response'));
      return;
    }
    if (response.type === 'ready') {
      try {
        assertExactObjectKeys(response, ['type', 'protocolVersion'], 'Windows sampler ready response');
        if (ready || response.protocolVersion !== WINDOWS_POWERSHELL_METRIC_SAMPLER_PROTOCOL_VERSION) {
          failExternalMetric('Windows sampler ready response is invalid');
        }
        ready = true;
        resolveReady();
      } catch (error) {
        failTransport(error);
      }
      return;
    }
    if (pending === null) {
      failTransport(new Error('Windows sampler emitted an unsolicited response'));
      return;
    }
    const current = pending;
    pending = null;
    clearTimeout(current.timer);
    if (response.requestId !== current.requestId) {
      const error = new Error('Windows sampler response request ID does not match the pending request');
      failTransport(error);
      current.reject(error);
      return;
    }
    if (response.ok === false) {
      try {
        assertExactObjectKeys(response, ['requestId', 'ok', 'error'], 'Windows sampler error response');
        assertNonemptyString(response.error, 'Windows sampler error response message');
        const error = new Error(`Windows sampler rejected ${current.operation}: ${response.error}`);
        failTransport(error);
        current.reject(error);
      } catch (error) {
        failTransport(error);
        current.reject(error);
      }
      return;
    }
    current.resolve(response);
  };

  child.stdout.on('data', (chunk) => {
    if (terminalError !== null) return;
    stdoutBuffer += String(chunk);
    if (Buffer.byteLength(stdoutBuffer, 'utf8') > maximumResponseBytes) {
      failTransport(new Error('Windows sampler stdout buffer exceeded the configured limit'));
      return;
    }
    let newlineIndex;
    while ((newlineIndex = stdoutBuffer.indexOf('\n')) !== -1) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (line.length === 0) continue;
      try {
        processResponse(JSON.parse(line));
      } catch (error) {
        failTransport(new Error(`Windows sampler emitted invalid JSON: ${error instanceof Error ? error.message : String(error)}`));
      }
    }
  });
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
    if (Buffer.byteLength(stderr, 'utf8') > maximumResponseBytes) {
      failTransport(new Error('Windows sampler stderr buffer exceeded the configured limit'));
    }
  });
  child.once('error', (error) => failTransport(error));
  child.once('close', (code, signal) => {
    closed = true;
    const closeResult = Object.freeze({ code, signal });
    resolveClose(closeResult);
    if (!closing) failTransport(new Error(`Windows sampler exited unexpectedly with code ${code} and signal ${signal}`));
  });

  try {
    await waitForValue(readyPromise, readyTimeoutMs, 'Windows sampler ready handshake');
  } catch (error) {
    try {
      child.kill?.('SIGKILL');
    } catch {
      // The spawn/transport failure is already the authoritative error.
    }
    throw error;
  }

  const request = async (operation, payload = {}) => {
    if (terminalError !== null) throw terminalError;
    if (closed) failExternalMetric('Windows sampler is closed');
    if (!ready) failExternalMetric('Windows sampler is not ready');
    if (pending !== null) failExternalMetric('Windows sampler does not permit overlapping requests');
    const nextRequestId = ++requestId;
    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pending?.requestId === nextRequestId) {
          pending = null;
          reject(new Error(`Windows sampler ${operation} response timed out after ${responseTimeoutMs}ms`));
        }
      }, responseTimeoutMs);
      pending = { requestId: nextRequestId, operation, resolve, reject, timer };
    });
    try {
      child.stdin.write(`${JSON.stringify({ requestId: nextRequestId, operation, ...payload })}\n`);
    } catch (error) {
      if (pending?.requestId === nextRequestId) {
        clearTimeout(pending.timer);
        pending = null;
      }
      throw error;
    }
    return response;
  };

  const requireActiveTarget = (operation) => {
    if (activeTarget === null) failExternalMetric(`cannot ${operation} without an attached Windows sampler target`);
    return activeTarget;
  };

  const readSample = async (operation) => {
    const target = requireActiveTarget(operation);
    const response = await request(operation);
    let parsed;
    try {
      parsed = validateWindowsSamplerResponse(response, operation, requestId, target, samplerSequence);
    } catch (error) {
      failTransport(error);
      throw error;
    }
    samplerSequence = parsed.samplerSequence;
    return Object.freeze({ snapshot: parsed.snapshot, sampler: parsed.sampler });
  };

  const finish = async (aborted) => {
    if (closing || closed) failExternalMetric('Windows sampler is already closing or closed');
    if (!aborted && activeTarget !== null) failExternalMetric('cannot close Windows sampler with an attached target');
    closing = true;
    try {
      child.stdin.end();
    } catch (error) {
      failTransport(error);
      throw error;
    }
    const result = await waitForValue(closePromise, responseTimeoutMs, 'Windows sampler close');
    if (result.code !== 0 || result.signal !== null || stderr.trim() !== '') {
      failExternalMetric('Windows sampler did not close cleanly');
    }
    return Object.freeze({ pid: child.pid, aborted, exit: result, stderr: '' });
  };

  return Object.freeze({
    pid: child.pid,

    async attach(targetInput) {
      if (activeTarget !== null) failExternalMetric('Windows sampler already has an attached target');
      const target = normalizeWindowsSamplerTarget(targetInput);
      const response = await request('attach', { pid: target.pid, creationIdentity: target.creationIdentity });
      let parsed;
      try {
        parsed = validateWindowsSamplerResponse(response, 'attach', requestId, target, samplerSequence);
      } catch (error) {
        failTransport(error);
        throw error;
      }
      samplerSequence = parsed.samplerSequence;
      activeTarget = target;
      return target;
    },

    async prime() {
      return readSample('prime');
    },

    async sample() {
      return readSample('sample');
    },

    async detach() {
      const target = requireActiveTarget('detach');
      const response = await request('detach');
      let parsed;
      try {
        parsed = validateWindowsSamplerResponse(response, 'detach', requestId, target, samplerSequence);
      } catch (error) {
        failTransport(error);
        throw error;
      }
      samplerSequence = parsed.samplerSequence;
      activeTarget = null;
      return Object.freeze({ target });
    },

    async close() {
      return finish(false);
    },

    async abort() {
      return finish(true);
    }
  });
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

function cloneMetricCaptureRawValue(value, label) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) failExternalMetric(`${label} must not contain a non-finite number`);
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry, index) => cloneMetricCaptureRawValue(entry, `${label}[${index}]`)));
  }
  if (!value || typeof value !== 'object') failExternalMetric(`${label} must contain only JSON values`);
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    cloneMetricCaptureRawValue(entry, `${label}.${key}`)
  ])));
}

function cloneMetricCaptureRead(value, target, expectedOrdinal, label) {
  assertExactObjectKeys(value, ['sample', 'raw'], label);
  assertExactObjectKeys(value.sample, [
    'ordinal', 'readStart', 'readEnd', 'cumulativeCpuSeconds',
    'counterQuantumSeconds', 'processIdentity', 'workingSetMiB'
  ], `${label}.sample`);
  if (value.sample.ordinal !== expectedOrdinal) failExternalMetric(`${label}.sample ordinal is not contiguous`);
  assertFiniteNonnegativeNumber(value.sample.readStart, `${label}.sample read start`);
  assertFiniteNonnegativeNumber(value.sample.readEnd, `${label}.sample read end`);
  if (value.sample.readEnd < value.sample.readStart || value.sample.readEnd - value.sample.readStart > 0.05) {
    failExternalMetric(`${label}.sample read bracket is invalid or exceeds 50 milliseconds`);
  }
  assertFiniteNonnegativeNumber(value.sample.cumulativeCpuSeconds, `${label}.sample cumulative CPU seconds`);
  if (value.sample.counterQuantumSeconds !== target.counterQuantumSeconds) {
    failExternalMetric(`${label}.sample counter quantum does not match the attached target`);
  }
  if (value.sample.processIdentity !== target.processIdentity) {
    failExternalMetric(`${label}.sample process identity does not match the attached target`);
  }
  assertFiniteNonnegativeNumber(value.sample.workingSetMiB, `${label}.sample working set MiB`);
  if (!value.raw || typeof value.raw !== 'object' || Array.isArray(value.raw)) {
    failExternalMetric(`${label}.raw must be an object`);
  }
  return Object.freeze({
    sample: Object.freeze({ ...value.sample }),
    raw: cloneMetricCaptureRawValue(value.raw, `${label}.raw`)
  });
}

function cloneMetricCaptureReadResult(value) {
  return Object.freeze({
    sample: Object.freeze({ ...value.sample }),
    raw: cloneMetricCaptureRawValue(value.raw, 'metric capture raw')
  });
}

/**
 * Collects one attached side of a pair-scoped external metric session. The
 * adapter session owns resource lifetime; this collector owns the immutable
 * prime/sample transcript that later becomes raw evidence for one launch.
 *
 * @param {{
 *   session: Readonly<{ attach: (target: unknown) => Promise<unknown> | unknown, prime: () => Promise<unknown> | unknown, sample: () => Promise<unknown> | unknown, detach: () => Promise<unknown> | unknown, abort: () => Promise<unknown> | unknown }>,
 *   target: Readonly<{ pid: number, creationIdentity: string, processIdentity: string, counterQuantumSeconds: number }>
 * }} options
 */
export function createExternalMetricRunCapture({ session, target: targetInput } = {}) {
  if (!session || typeof session !== 'object') failExternalMetric('metric run capture session must be an object');
  for (const operation of ['attach', 'prime', 'sample', 'detach', 'abort']) {
    if (typeof session[operation] !== 'function') failExternalMetric(`metric run capture session must implement ${operation}`);
  }
  const target = normalizeMetricSessionTarget(targetInput);
  let state = 'new';
  let sampling = false;
  let prime = null;
  let lastCumulativeCpuSeconds = -Infinity;
  const samples = [];

  const assertState = (operation, expected) => {
    if (state !== expected) failExternalMetric(`cannot ${operation} when metric run capture is ${state}`);
  };

  const appendRead = (value, expectedOrdinal, label) => {
    const read = cloneMetricCaptureRead(value, target, expectedOrdinal, label);
    if (read.sample.cumulativeCpuSeconds < lastCumulativeCpuSeconds) {
      failExternalMetric(`${label}.sample cumulative CPU regressed`);
    }
    lastCumulativeCpuSeconds = read.sample.cumulativeCpuSeconds;
    return read;
  };

  return Object.freeze({
    async attachAndPrime() {
      assertState('attach and prime a metric target', 'new');
      try {
        const attached = normalizeMetricSessionTarget(await session.attach(target));
        if (metricSessionTargetKey(attached) !== metricSessionTargetKey(target)) {
          failExternalMetric('metric run capture attached target does not match the requested target');
        }
        prime = appendRead(await session.prime(), 0, 'metric run capture prime');
        state = 'active';
        return cloneMetricCaptureReadResult(prime);
      } catch (error) {
        state = 'failed';
        throw error;
      }
    },

    async sample() {
      assertState('sample a metric target', 'active');
      if (sampling) failExternalMetric('metric run capture does not permit overlapping samples');
      sampling = true;
      try {
        const read = appendRead(await session.sample(), samples.length + 1, 'metric run capture sample');
        samples.push(read);
        return cloneMetricCaptureReadResult(read);
      } catch (error) {
        state = 'failed';
        throw error;
      } finally {
        sampling = false;
      }
    },

    async detach() {
      assertState('detach a metric target', 'active');
      if (sampling) failExternalMetric('cannot detach a metric target during a sample');
      try {
        const detached = await session.detach();
        state = 'closed';
        return Object.freeze({
          target: Object.freeze({ ...target }),
          prime: cloneMetricCaptureReadResult(prime),
          samples: Object.freeze(samples.map(cloneMetricCaptureReadResult)),
          detached
        });
      } catch (error) {
        state = 'failed';
        throw error;
      }
    },

    async abort() {
      if (state === 'closed' || state === 'aborted') failExternalMetric(`cannot abort metric run capture when it is ${state}`);
      const result = await session.abort();
      state = 'aborted';
      return result;
    },

    getAudit() {
      return Object.freeze({
        state,
        target: Object.freeze({ ...target }),
        prime: prime === null ? null : cloneMetricCaptureReadResult(prime),
        samples: Object.freeze(samples.map(cloneMetricCaptureReadResult))
      });
    }
  });
}

function metricSampleMidpoint(read, label) {
  if (!read || typeof read !== 'object' || !read.sample || typeof read.sample !== 'object') {
    failExternalMetric(`${label} must contain a metric sample`);
  }
  const { readStart, readEnd } = read.sample;
  assertFiniteNonnegativeNumber(readStart, `${label} read start`);
  assertFiniteNonnegativeNumber(readEnd, `${label} read end`);
  if (readEnd < readStart) failExternalMetric(`${label} read bracket is inverted`);
  return (readStart + readEnd) / 2;
}

/**
 * Binds one external metric-run capture to the policy's continuous cadence
 * grammar. The caller remains responsible for the platform timer and callback
 * gate, while this controller makes missed cadence, premature terminal reads,
 * and post-terminal reads impossible to serialize as one run transcript.
 *
 * @param {{
 *   capture: Readonly<{ attachAndPrime: () => Promise<unknown> | unknown, sample: () => Promise<unknown> | unknown, detach: () => Promise<unknown> | unknown, abort: () => Promise<unknown> | unknown, getAudit: () => unknown }>,
 *   cadenceMs?: number,
 *   minimumCadenceMs?: number,
 *   maximumCadenceMs?: number
 * }} options
 */
export function createExternalMetricCadenceCapture({
  capture,
  cadenceMs = 500,
  minimumCadenceMs = 450,
  maximumCadenceMs = 550
} = {}) {
  if (!capture || typeof capture !== 'object') failExternalMetric('metric cadence capture requires a metric run capture');
  for (const operation of ['attachAndPrime', 'sample', 'detach', 'abort', 'getAudit']) {
    if (typeof capture[operation] !== 'function') failExternalMetric(`metric cadence capture requires ${operation}`);
  }
  if (!Number.isFinite(cadenceMs) || cadenceMs <= 0) failExternalMetric('metric cadence must be finite and positive');
  if (!Number.isFinite(minimumCadenceMs) || !Number.isFinite(maximumCadenceMs)
    || minimumCadenceMs <= 0 || maximumCadenceMs < minimumCadenceMs) {
    failExternalMetric('metric cadence bounds are invalid');
  }
  if (cadenceMs < minimumCadenceMs || cadenceMs > maximumCadenceMs) {
    failExternalMetric('metric cadence must be within its allowed bounds');
  }

  let state = 'new';
  let prime = null;
  let firstWindowSample = null;
  let previousSample = null;
  let terminalClosureEnd = null;
  let terminalSample = null;
  let nextSampleTargetAt = null;
  const inWindowSamples = [];

  const assertState = (operation, expected) => {
    if (state !== expected) failExternalMetric(`cannot ${operation} when metric cadence capture is ${state}`);
  };

  const appendCadencedSample = async (label) => {
    const read = cloneMetricCaptureReadResult(await capture.sample());
    const midpoint = metricSampleMidpoint(read, label);
    if (previousSample !== null) {
      const cadenceMsObserved = (midpoint - metricSampleMidpoint(previousSample, 'previous metric sample')) * 1000;
      if (cadenceMsObserved < minimumCadenceMs || cadenceMsObserved > maximumCadenceMs) {
        failExternalMetric(`${label} cadence is outside the ${minimumCadenceMs}-${maximumCadenceMs}ms policy interval`);
      }
    }
    previousSample = read;
    nextSampleTargetAt = midpoint + (cadenceMs / 1000);
    return read;
  };

  return Object.freeze({
    async attachAndPrime() {
      assertState('attach and prime a metric target', 'new');
      try {
        prime = cloneMetricCaptureReadResult(await capture.attachAndPrime());
        state = 'primed';
        return cloneMetricCaptureReadResult(prime);
      } catch (error) {
        state = 'failed';
        throw error;
      }
    },

    async beginWindow() {
      assertState('begin the metric workload window', 'primed');
      try {
        const read = await appendCadencedSample('initial metric workload sample');
        firstWindowSample = read;
        inWindowSamples.push(read);
        state = 'measuring';
        return Object.freeze({
          windowStart: read.sample.readStart,
          sample: cloneMetricCaptureReadResult(read)
        });
      } catch (error) {
        state = 'failed';
        throw error;
      }
    },

    async sampleInWindow() {
      assertState('sample an active metric workload window', 'measuring');
      try {
        const read = await appendCadencedSample('in-window metric sample');
        inWindowSamples.push(read);
        return cloneMetricCaptureReadResult(read);
      } catch (error) {
        state = 'failed';
        throw error;
      }
    },

    markTerminalClosure(value) {
      assertState('mark metric terminal closure', 'measuring');
      assertFiniteNonnegativeNumber(value, 'metric terminal closure end');
      if (value < firstWindowSample.sample.readStart) {
        failExternalMetric('metric terminal closure precedes the workload window');
      }
      terminalClosureEnd = value;
      state = 'terminal-pending';
      return Object.freeze({ terminalClosureEnd });
    },

    async sampleTerminalClosure() {
      assertState('sample metric terminal closure', 'terminal-pending');
      try {
        const read = await appendCadencedSample('terminal metric sample');
        if (read.sample.readStart < terminalClosureEnd || read.sample.readEnd <= terminalClosureEnd) {
          failExternalMetric('terminal metric sample must be the first sample after workload closure');
        }
        terminalSample = read;
        state = 'terminal-sampled';
        return cloneMetricCaptureReadResult(read);
      } catch (error) {
        state = 'failed';
        throw error;
      }
    },

    getNextSampleTargetAt() {
      if (nextSampleTargetAt === null) {
        failExternalMetric('metric cadence capture has not started a workload window');
      }
      return nextSampleTargetAt;
    },

    async detach() {
      assertState('detach a metric cadence capture', 'terminal-sampled');
      try {
        const transcript = await capture.detach();
        state = 'closed';
        return Object.freeze({
          window: Object.freeze({
            start: firstWindowSample.sample.readStart,
            terminalClosureEnd
          }),
          prime: cloneMetricCaptureReadResult(prime),
          inWindowSamples: Object.freeze(inWindowSamples.map(cloneMetricCaptureReadResult)),
          terminalSample: cloneMetricCaptureReadResult(terminalSample),
          nextSampleTargetAt,
          transcript
        });
      } catch (error) {
        state = 'failed';
        throw error;
      }
    },

    async abort() {
      if (state === 'closed' || state === 'aborted') failExternalMetric(`cannot abort metric cadence capture when it is ${state}`);
      const result = await capture.abort();
      state = 'aborted';
      return result;
    },

    getAudit() {
      return Object.freeze({
        state,
        prime: prime === null ? null : cloneMetricCaptureReadResult(prime),
        window: firstWindowSample === null ? null : Object.freeze({
          start: firstWindowSample.sample.readStart,
          terminalClosureEnd
        }),
        inWindowSamples: Object.freeze(inWindowSamples.map(cloneMetricCaptureReadResult)),
        terminalSample: terminalSample === null ? null : cloneMetricCaptureReadResult(terminalSample),
        nextSampleTargetAt,
        capture: capture.getAudit()
      });
    }
  });
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
 *   createReader: (context: Readonly<{ adapterId: string, resource: unknown, target: Readonly<{ pid: number, creationIdentity: string, processIdentity: string, counterQuantumSeconds: number }> }>) => Promise<Readonly<{ prime: () => Promise<unknown> | unknown, sample: () => Promise<unknown> | unknown, close: () => Promise<unknown> | unknown }>> | Readonly<{ prime: () => Promise<unknown> | unknown, sample: () => Promise<unknown> | unknown, close: () => Promise<unknown> | unknown }>,
 *   openResource?: (context: Readonly<{ adapterId: string }>) => Promise<unknown> | unknown,
 *   closeResource?: (resource: unknown, context: Readonly<{ adapterId: string }>) => Promise<unknown> | unknown,
 *   abortResource?: (resource: unknown, context: Readonly<{ adapterId: string }>) => Promise<unknown> | unknown,
 *   clock?: () => number
 * }} options
 */
export function createExternalMetricAdapterSession({
  adapterId,
  createReader,
  openResource = () => undefined,
  closeResource = () => undefined,
  abortResource = closeResource,
  clock = () => performance.now() / 1000
} = {}) {
  assertNonemptyString(adapterId, 'metric adapter ID');
  if (typeof createReader !== 'function') failExternalMetric('createReader must be a function');
  if (typeof openResource !== 'function') failExternalMetric('openResource must be a function');
  if (typeof closeResource !== 'function') failExternalMetric('closeResource must be a function');
  if (typeof abortResource !== 'function') failExternalMetric('abortResource must be a function');
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
    if (operation === 'prime' && active.primed) failExternalMetric('metric session target is already primed');
    if (operation === 'sample' && !active.primed) failExternalMetric('metric session target must be primed before sampling');
    if (sampling) failExternalMetric('metric session does not permit overlapping samples');
    sampling = true;
    try {
      const value = await active.reader[operation]();
      if (operation === 'prime') active.primed = true;
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
      if (!reader || typeof reader !== 'object' || typeof reader.prime !== 'function' || typeof reader.sample !== 'function' || typeof reader.close !== 'function') {
        failExternalMetric('createReader must return prime, sample, and close functions');
      }
      targetKeyByPid.set(target.pid, targetKey);
      targetKeyByProcessIdentity.set(target.processIdentity, targetKey);
      seenTargetKeys.add(targetKey);
      active = { target, reader, primed: false };
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

    async abort() {
      requireOpen('abort the metric session');
      if (sampling) failExternalMetric('cannot abort a metric session during a sample');
      const closing = active;
      let detachError = null;
      if (closing !== null) {
        try {
          await closing.reader.close();
          active = null;
          recordTransition('detach-aborted', closing.target);
        } catch (error) {
          detachError = error;
          recordTransition('detach-aborted-failed', closing.target);
        }
      }
      let result;
      try {
        result = await abortResource(resource, Object.freeze({ adapterId }));
      } catch (error) {
        recordTransition('abort-failed');
        throw error;
      }
      active = null;
      state = 'aborted';
      recordTransition('abort');
      if (detachError !== null) throw detachError;
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

function createMetricSessionReader({ target, counterQuantumSeconds, clock, readSnapshot }) {
  if (target.counterQuantumSeconds !== counterQuantumSeconds) {
    failExternalMetric('metric session target counter quantum does not match its adapter');
  }
  const reader = createExternalMetricSampleReader({
    readSnapshot,
    processIdentity: target.processIdentity,
    counterQuantumSeconds,
    clock
  });
  return Object.freeze({
    prime: () => reader.prime(),
    sample: () => reader.sample(),
    close: () => reader.close()
  });
}

function assertAttachedMetricTargetIdentity(identity, target, label) {
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) {
    failExternalMetric(`${label} must return a process identity object`);
  }
  assertPositiveSafeInteger(identity.pid, `${label} PID`);
  assertNonemptyString(identity.creationIdentity, `${label} creation identity`);
  if (identity.pid !== target.pid || identity.creationIdentity !== target.creationIdentity) {
    failExternalMetric(`${label} does not match the attached process creation identity`);
  }
}

/**
 * Creates the Linux procfs implementation of the pair-scoped metric-session
 * interface. The session owns no persistent subprocess: each sample reads the
 * target's stat and statm files through the injected procfs authority.
 *
 * @param {{ procfsRoot?: string, pageSize: number, clockTicks: number, readFile?: (file: string, encoding: 'utf8') => Promise<string> | string, clock?: () => number }} options
 */
export function createLinuxProcfsMetricAdapterSession({
  procfsRoot = '/proc',
  pageSize,
  clockTicks,
  readFile = fs.readFile,
  clock
} = {}) {
  const readSnapshot = createLinuxProcfsSnapshotReader({ procfsRoot, pageSize, clockTicks, readFile });
  const readIdentity = createLinuxProcfsProcessIdentityReader({ procfsRoot, readFile });
  const counterQuantumSeconds = 1 / clockTicks;
  if (!Number.isFinite(counterQuantumSeconds) || counterQuantumSeconds <= 0 || counterQuantumSeconds > 0.01) {
    failExternalMetric('Linux procfs clock ticks must yield a counter quantum at most 0.01 seconds');
  }
  return createExternalMetricAdapterSession({
    adapterId: 'linux-procfs-v1',
    clock,
    async createReader({ target }) {
      assertAttachedMetricTargetIdentity(await readIdentity(target.pid), target, 'Linux procfs process identity');
      return createMetricSessionReader({
        target,
        counterQuantumSeconds,
        clock,
        readSnapshot: async () => {
          const snapshot = await readSnapshot(target.pid);
          assertAttachedMetricTargetIdentity({
            pid: snapshot.raw.pid,
            creationIdentity: String(snapshot.raw.startTicks)
          }, target, 'Linux procfs metric sample');
          return snapshot;
        }
      });
    }
  });
}

/**
 * Creates the macOS ps implementation of the pair-scoped metric-session
 * interface. Each read is intentionally represented by one injected command
 * authority rather than a persistent sampler.
 *
 * @param {{ runCommand?: (command: string, args: string[]) => Promise<string> | string, clock?: () => number }} options
 */
export function createMacosPsMetricAdapterSession({ runCommand = runMacosPs, clock } = {}) {
  const readIdentity = createMacosPsProcessIdentityReader({ runCommand });
  const readSnapshot = createMacosPsMetricIdentitySnapshotReader({ runCommand });
  return createExternalMetricAdapterSession({
    adapterId: 'macos-ps-v1',
    clock,
    async createReader({ target }) {
      assertAttachedMetricTargetIdentity(await readIdentity(target.pid), target, 'macOS ps process identity');
      return createMetricSessionReader({
        target,
        counterQuantumSeconds: 0.01,
        clock,
        readSnapshot: async () => {
          const snapshot = await readSnapshot(target.pid);
          assertAttachedMetricTargetIdentity({
            pid: snapshot.raw.pid,
            creationIdentity: snapshot.raw.creationIdentity
          }, target, 'macOS ps metric sample');
          return snapshot;
        }
      });
    }
  });
}

function assertWindowsMetricSampler(resource) {
  if (!resource || typeof resource !== 'object'
    || typeof resource.attach !== 'function'
    || typeof resource.prime !== 'function'
    || typeof resource.sample !== 'function'
    || typeof resource.detach !== 'function'
    || typeof resource.close !== 'function'
    || typeof resource.abort !== 'function') {
    failExternalMetric('Windows metric sampler does not implement the closed session protocol');
  }
}

function normalizeWindowsMetricSamplerSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !value.snapshot || typeof value.snapshot !== 'object' || Array.isArray(value.snapshot)
    || !value.snapshot.raw || typeof value.snapshot.raw !== 'object' || Array.isArray(value.snapshot.raw)
    || !value.sampler || typeof value.sampler !== 'object' || Array.isArray(value.sampler)) {
    failExternalMetric('Windows metric sampler did not return a sample with its read bracket');
  }
  return Object.freeze({
    ...value.snapshot,
    raw: Object.freeze({
      ...value.snapshot.raw,
      sampler: Object.freeze({ ...value.sampler })
    })
  });
}

/**
 * Creates the Windows implementation of the pair-scoped metric-session
 * interface. It opens exactly one persistent PowerShell sampler per session;
 * targets attach, prime, sample, and detach in that sampler's closed order.
 *
 * @param {{ openSampler?: () => Promise<any> | any, clock?: () => number }} options
 */
export function createWindowsPowerShellMetricAdapterSession({
  openSampler = openWindowsPowerShellMetricSampler,
  clock
} = {}) {
  if (typeof openSampler !== 'function') failExternalMetric('openSampler must be a function');
  return createExternalMetricAdapterSession({
    adapterId: 'windows-powershell-v1',
    clock,
    async openResource() {
      const resource = await openSampler();
      assertWindowsMetricSampler(resource);
      return resource;
    },
    async closeResource(resource) {
      assertWindowsMetricSampler(resource);
      return resource.close();
    },
    async abortResource(resource) {
      assertWindowsMetricSampler(resource);
      return resource.abort();
    },
    async createReader({ resource, target }) {
      assertWindowsMetricSampler(resource);
      if (target.counterQuantumSeconds !== 0.0000001) {
        failExternalMetric('Windows metric session targets must use the 100-nanosecond counter quantum');
      }
      await resource.attach(target);
      const reader = createMetricSessionReader({
        target,
        counterQuantumSeconds: 0.0000001,
        clock,
        readSnapshot: async ({ operation }) => normalizeWindowsMetricSamplerSnapshot(await resource[operation]())
      });
      return Object.freeze({
        prime: () => reader.prime(),
        sample: () => reader.sample(),
        async close() {
          const detached = await resource.detach();
          const closed = reader.close();
          return Object.freeze({ detached, closed });
        }
      });
    }
  });
}

function normalizeResolvedMetricIdentity(identity, pid, processIdentity, counterQuantumSeconds, label) {
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) {
    failExternalMetric(`${label} must return a process identity object`);
  }
  if (identity.pid !== pid) failExternalMetric(`${label} PID does not match the requested process`);
  return normalizeMetricSessionTarget({
    pid,
    creationIdentity: identity.creationIdentity,
    processIdentity,
    counterQuantumSeconds
  });
}

/**
 * Resolves one renderer target through the selected platform authority. A
 * comparison runner uses this once for each launch while retaining exactly one
 * pair-scoped adapter session across its two sides.
 *
 * @param {{
 *   platform?: NodeJS.Platform,
 *   pid: number,
 *   processIdentity: string,
 *   linux?: { procfsRoot?: string, pageSize: number, clockTicks: number, readFile?: (file: string, encoding: 'utf8') => Promise<string> | string, clock?: () => number, readIdentity?: (pid: number) => Promise<{ pid: number, creationIdentity: string }> | { pid: number, creationIdentity: string } },
 *   macos?: { runCommand?: (command: string, args: string[]) => Promise<string> | string, clock?: () => number, readIdentity?: (pid: number) => Promise<{ pid: number, creationIdentity: string }> | { pid: number, creationIdentity: string } },
 *   windows?: { openSampler?: () => Promise<any> | any, clock?: () => number, readIdentity?: (pid: number) => Promise<{ pid: number, creationIdentity: string }> | { pid: number, creationIdentity: string } }
 * }} options
 */
export async function resolvePlatformExternalMetricTarget({
  platform = process.platform,
  pid,
  processIdentity,
  linux = {},
  macos = {},
  windows = {}
} = {}) {
  assertPositiveSafeInteger(pid, 'platform metric process PID');
  assertNonemptyString(processIdentity, 'platform metric process identity');
  if (typeof platform !== 'string' || platform.length === 0) failExternalMetric('platform metric platform must be a nonempty string');
  if (!linux || typeof linux !== 'object' || Array.isArray(linux)) failExternalMetric('platform Linux metric options must be an object');
  if (!macos || typeof macos !== 'object' || Array.isArray(macos)) failExternalMetric('platform macOS metric options must be an object');
  if (!windows || typeof windows !== 'object' || Array.isArray(windows)) failExternalMetric('platform Windows metric options must be an object');

  if (platform === 'linux') {
    const {
      procfsRoot,
      clockTicks,
      readFile,
      readIdentity = createLinuxProcfsProcessIdentityReader({ procfsRoot, readFile })
    } = linux;
    if (typeof readIdentity !== 'function') failExternalMetric('platform Linux process identity reader must be a function');
    const counterQuantumSeconds = 1 / clockTicks;
    const target = normalizeResolvedMetricIdentity(
      await readIdentity(pid),
      pid,
      processIdentity,
      counterQuantumSeconds,
      'platform Linux process identity'
    );
    return Object.freeze({ adapterId: 'linux-procfs-v1', target });
  }

  if (platform === 'darwin') {
    const {
      runCommand,
      readIdentity = createMacosPsProcessIdentityReader({ runCommand })
    } = macos;
    if (typeof readIdentity !== 'function') failExternalMetric('platform macOS process identity reader must be a function');
    const target = normalizeResolvedMetricIdentity(
      await readIdentity(pid),
      pid,
      processIdentity,
      0.01,
      'platform macOS process identity'
    );
    return Object.freeze({ adapterId: 'macos-ps-v1', target });
  }

  if (platform === 'win32') {
    const {
      readIdentity = createWindowsPowerShellProcessIdentityReader()
    } = windows;
    if (typeof readIdentity !== 'function') failExternalMetric('platform Windows process identity reader must be a function');
    const target = normalizeResolvedMetricIdentity(
      await readIdentity(pid),
      pid,
      processIdentity,
      0.0000001,
      'platform Windows process identity'
    );
    return Object.freeze({ adapterId: 'windows-powershell-v1', target });
  }

  failExternalMetric(`unsupported platform metric adapter ${platform}`);
}

/**
 * Resolves one initial renderer target and constructs its unopened pair-scoped
 * metric adapter. Callers reuse the returned session with a separately
 * resolved target for the opposite side of the comparison.
 *
 * @param {{
 *   platform?: NodeJS.Platform,
 *   pid: number,
 *   processIdentity: string,
 *   linux?: { procfsRoot?: string, pageSize: number, clockTicks: number, readFile?: (file: string, encoding: 'utf8') => Promise<string> | string, clock?: () => number, readIdentity?: (pid: number) => Promise<{ pid: number, creationIdentity: string }> | { pid: number, creationIdentity: string } },
 *   macos?: { runCommand?: (command: string, args: string[]) => Promise<string> | string, clock?: () => number, readIdentity?: (pid: number) => Promise<{ pid: number, creationIdentity: string }> | { pid: number, creationIdentity: string } },
 *   windows?: { openSampler?: () => Promise<any> | any, clock?: () => number, readIdentity?: (pid: number) => Promise<{ pid: number, creationIdentity: string }> | { pid: number, creationIdentity: string } }
 * }} options
 */
export async function createPlatformExternalMetricAdapterSession({
  platform = process.platform,
  pid,
  processIdentity,
  linux = {},
  macos = {},
  windows = {}
} = {}) {
  const resolved = await resolvePlatformExternalMetricTarget({
    platform,
    pid,
    processIdentity,
    linux,
    macos,
    windows
  });
  let session;
  if (platform === 'linux') {
    const { procfsRoot, pageSize, clockTicks, readFile, clock } = linux;
    session = createLinuxProcfsMetricAdapterSession({ procfsRoot, pageSize, clockTicks, readFile, clock });
  } else if (platform === 'darwin') {
    const { runCommand, clock } = macos;
    session = createMacosPsMetricAdapterSession({ runCommand, clock });
  } else if (platform === 'win32') {
    const { openSampler, clock } = windows;
    session = createWindowsPowerShellMetricAdapterSession({ openSampler, clock });
  } else {
    failExternalMetric(`unsupported platform metric adapter ${platform}`);
  }
  return Object.freeze({ ...resolved, session });
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
