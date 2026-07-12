import { exec } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  createExternalMetricAdapterSession,
  createExternalMetricCadenceCapture,
  createExternalMetricRunCapture,
  createExternalMetricSampleReader,
  createLinuxProcfsMetricAdapterSession,
  createLinuxProcfsProcessIdentityReader,
  createLinuxProcfsSnapshotReader,
  createMacosPsMetricAdapterSession,
  createMacosPsMetricIdentitySnapshotReader,
  createMacosPsProcessIdentityReader,
  createMacosPsSnapshotReader,
  createPlatformExternalMetricSession,
  createPlatformExternalMetricAdapterSession,
  createProcessIdentityTracker,
  createWindowsPowerShellMetricAdapterSession,
  createWindowsPowerShellProcessIdentityReader,
  headlessElectronEnv,
  openWindowsPowerShellMetricSampler,
  parseLinuxProcfsMetricSnapshot,
  parseMacosPsMetricIdentitySnapshot,
  parseMacosPsProcessIdentity,
  parseMacosPsMetricSnapshot,
  parseWindowsPowerShellMetricSnapshot,
  readLinuxProcfsMetricConfiguration,
  resolvePlatformExternalMetricTarget,
  terminateProcessTree,
  waitForProcessClose
} from '../../../scripts/lib/process-runner.js';

class FakeChildProcess extends EventEmitter {
  pid = 4242;
  kill = vi.fn((signal?: string) => {
    setImmediate(() => this.emit('close', null, signal ?? 'SIGTERM'));
    return true;
  });
}

class FakePowerShellSampler extends EventEmitter {
  pid = 8484;
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = {
    write: vi.fn((line: string) => {
      const request = JSON.parse(line);
      this.respond(request);
      return true;
    }),
    end: vi.fn(() => {
      queueMicrotask(() => this.emit('close', 0, null));
    })
  };
  private sequence = 0;
  private cpuTicks = 10_000_000;

  constructor(private readonly responseOverride?: (request: Record<string, unknown>) => Record<string, unknown> | null) {
    super();
    queueMicrotask(() => this.stdout.emit('data', `${JSON.stringify({ type: 'ready', protocolVersion: 1 })}\n`));
  }

  kill = vi.fn(() => {
    queueMicrotask(() => this.emit('close', null, 'SIGKILL'));
    return true;
  });

  private respond(request: Record<string, unknown>) {
    const overridden = this.responseOverride?.(request);
    if (overridden !== undefined && overridden !== null) {
      queueMicrotask(() => this.stdout.emit('data', `${JSON.stringify(overridden)}\n`));
      return;
    }
    this.sequence += 1;
    const operation = request.operation;
    const common = {
      requestId: request.requestId,
      ok: true,
      operation,
      samplerSequence: this.sequence,
      pid: request.pid ?? 42,
      creationIdentity: request.creationIdentity ?? 'creation-42'
    };
    const response = operation === 'prime' || operation === 'sample'
      ? {
          ...common,
          totalProcessorTimeTicks: String(this.cpuTicks += 10_000_000),
          workingSetBytes: '10485760',
          readStartTicks: '1000',
          readEndTicks: '2000',
          stopwatchFrequency: '100000'
        }
      : common;
    queueMicrotask(() => this.stdout.emit('data', `${JSON.stringify(response)}\n`));
  }
}

function linuxProcStat({
  pid = 42,
  name = 'Browser',
  userTicks = 10,
  systemTicks = 20,
  startTicks = 30
}: {
  pid?: number,
  name?: string,
  userTicks?: number,
  systemTicks?: number,
  startTicks?: number
} = {}) {
  const fields = Array.from({ length: 20 }, () => '0');
  fields[0] = 'S';
  fields[11] = String(userTicks);
  fields[12] = String(systemTicks);
  fields[19] = String(startTicks);
  return `${pid} (${name}) ${fields.join(' ')}`;
}

const macosCreationIdentity = 'Fri Jul 11 02:35:00 2026';

function macosPsIdentityRow({
  pid = 42,
  creationIdentity = macosCreationIdentity
}: {
  pid?: number,
  creationIdentity?: string
} = {}) {
  return `${pid} ${creationIdentity}\n`;
}

function macosPsMetricIdentityRow({
  pid = 42,
  creationIdentity = macosCreationIdentity,
  cpuTime = '00:01',
  residentSetKiB = 1024
}: {
  pid?: number,
  creationIdentity?: string,
  cpuTime?: string,
  residentSetKiB?: number
} = {}) {
  return `${pid} ${creationIdentity} ${cpuTime} ${residentSetKiB}\n`;
}

describe('headlessElectronEnv', () => {
  it('overlays the headless electron flags on the base environment', () => {
    expect(headlessElectronEnv({ PATH: '/usr/bin' })).toEqual({
      PATH: '/usr/bin',
      ELECTRON_DISABLE_GPU: '1',
      ELECTRON_NO_ATTACH_CONSOLE: '1'
    });
  });
});

describe('createProcessIdentityTracker', () => {
  it('tracks adapter-resolved launch ownership across entry and exit boundaries', async () => {
    const identities = [
      [{ pid: 42, creationTime: 10, ownershipIdentity: 'browser-root' }],
      [
        { pid: 42, creationTime: 10, ownershipIdentity: 'browser-root' },
        { pid: 43, creationTime: 11, ownershipIdentity: 'renderer-child' }
      ],
      []
    ];
    const enumerateLaunchOwnedIdentities = vi.fn(async () => identities.shift());
    const tracker = createProcessIdentityTracker({
      enumerateLaunchOwnedIdentities,
      clock: vi.fn(() => enumerateLaunchOwnedIdentities.mock.calls.length)
    });

    await expect(tracker.observe()).resolves.toMatchObject({
      sequence: 1,
      entered: [{ pid: 42, creationTime: 10, ownershipIdentity: 'browser-root' }],
      exited: []
    });
    await expect(tracker.observe()).resolves.toMatchObject({
      sequence: 2,
      entered: [{ pid: 43, creationTime: 11, ownershipIdentity: 'renderer-child' }],
      exited: []
    });
    await expect(tracker.observe()).resolves.toMatchObject({
      sequence: 3,
      live: [],
      entered: [],
      exited: [
        { pid: 42, creationTime: 10, ownershipIdentity: 'browser-root' },
        { pid: 43, creationTime: 11, ownershipIdentity: 'renderer-child' }
      ]
    });
    expect(enumerateLaunchOwnedIdentities).toHaveBeenNthCalledWith(1, { sequence: 1 });
    expect(enumerateLaunchOwnedIdentities).toHaveBeenNthCalledWith(2, { sequence: 2 });
    expect(tracker.getLiveIdentities()).toEqual([]);
  });

  it('treats PID reuse as an exit and a new identity', async () => {
    const identities = [
      [{ pid: 42, creationTime: 10, ownershipIdentity: 'browser-root' }],
      [{ pid: 42, creationTime: 20, ownershipIdentity: 'browser-root' }]
    ];
    const tracker = createProcessIdentityTracker({
      enumerateLaunchOwnedIdentities: async () => identities.shift(),
      clock: vi.fn(() => 1)
    });

    await tracker.observe();
    await expect(tracker.observe()).resolves.toMatchObject({
      entered: [{ pid: 42, creationTime: 20, ownershipIdentity: 'browser-root' }],
      exited: [{ pid: 42, creationTime: 10, ownershipIdentity: 'browser-root' }]
    });
  });

  it('rejects duplicate identities and ownership changes for an existing process', async () => {
    const duplicateTracker = createProcessIdentityTracker({
      enumerateLaunchOwnedIdentities: async () => [
        { pid: 42, creationTime: 10, ownershipIdentity: 'browser-root' },
        { pid: 42, creationTime: 10, ownershipIdentity: 'browser-root' }
      ]
    });
    await expect(duplicateTracker.observe()).rejects.toThrow(/duplicate process identity/);

    const ownershipTracker = createProcessIdentityTracker({
      enumerateLaunchOwnedIdentities: vi.fn()
        .mockResolvedValueOnce([{ pid: 42, creationTime: 10, ownershipIdentity: 'browser-root' }])
        .mockResolvedValueOnce([{ pid: 42, creationTime: 10, ownershipIdentity: 'renderer-child' }])
    });
    await ownershipTracker.observe();
    await expect(ownershipTracker.observe()).rejects.toThrow(/ownership identity changed/);
  });
});

describe('external process metric snapshots', () => {
  it('decodes Linux procfs CPU ticks and resident pages without losing the process name boundary', () => {
    const fields = Array.from({ length: 50 }, (_, index) => String(index));
    fields[0] = 'S';
    fields[11] = '120';
    fields[12] = '30';
    const snapshot = parseLinuxProcfsMetricSnapshot({
      stat: `42 (Chromium Helper (GPU)) ${fields.join(' ')}`,
      statm: '500 25 0 0 0 0 0',
      clockTicks: 100,
      pageSize: 4096
    });

    expect(snapshot).toEqual({
      cumulativeCpuSeconds: 1.5,
      workingSetMiB: 25 * 4096 / (1024 * 1024),
      counterQuantumSeconds: 0.01,
      raw: {
        pid: 42,
        userTicks: 120,
        systemTicks: 30,
        startTicks: 19,
        residentPages: 25,
        pageSize: 4096,
        clockTicks: 100
      }
    });
    expect(() => parseLinuxProcfsMetricSnapshot({
      stat: '42 (broken) S 1', statm: '500 25 0 0 0 0 0', clockTicks: 100, pageSize: 4096
    })).toThrow(/missing CPU fields/);
    expect(() => parseLinuxProcfsMetricSnapshot({
      stat: `42 (Browser) ${fields.join(' ')}`, statm: '500 25', clockTicks: 100, pageSize: 4096
    })).toThrow(/seven fields/);
    expect(() => parseLinuxProcfsMetricSnapshot({
      stat: linuxProcStat({ startTicks: 30 }).split(' ').slice(0, -1).join(' '),
      statm: '500 25 0 0 0 0 0', clockTicks: 100, pageSize: 4096
    })).toThrow(/creation fields/);
  });

  it('decodes macOS ps and Windows PowerShell raw values with explicit units', () => {
    expect(parseMacosPsMetricSnapshot('1-02:03:04.5 2048\n')).toMatchObject({
      cumulativeCpuSeconds: 93784.5,
      workingSetMiB: 2,
      counterQuantumSeconds: 0.01,
      raw: { cpuTime: '1-02:03:04.5', residentSetKiB: 2048 }
    });
    expect(parseWindowsPowerShellMetricSnapshot({
      totalProcessorTimeTicks: '123456789',
      workingSetBytes: '10485760'
    })).toMatchObject({
      cumulativeCpuSeconds: 12.3456789,
      workingSetMiB: 10,
      counterQuantumSeconds: 0.0000001,
      raw: { totalProcessorTimeTicks: '123456789', workingSetBytes: '10485760' }
    });
    expect(() => parseMacosPsMetricSnapshot('00:01 2\n00:02 3\n')).toThrow(/exactly one process row/);
    expect(() => parseWindowsPowerShellMetricSnapshot({ totalProcessorTimeTicks: '1.5', workingSetBytes: '1' })).toThrow(/decimal integer/);
  });

  it('decodes macOS ps creation identities separately from the metric values', () => {
    expect(parseMacosPsProcessIdentity(macosPsIdentityRow())).toEqual({ pid: 42, creationIdentity: macosCreationIdentity });
    expect(parseMacosPsMetricIdentitySnapshot(macosPsMetricIdentityRow({ cpuTime: '00:02', residentSetKiB: 2048 }))).toMatchObject({
      cumulativeCpuSeconds: 2,
      workingSetMiB: 2,
      raw: {
        pid: 42,
        creationIdentity: macosCreationIdentity,
        cpuTime: '00:02',
        residentSetKiB: 2048
      }
    });
    expect(() => parseMacosPsProcessIdentity('42 only-two-fields\n')).toThrow(/field count/);
    expect(() => parseMacosPsMetricIdentitySnapshot('42 Fri Jul 11 02:35:00 2026 00:01\n')).toThrow(/field count/);
  });

  it('resolves a Windows process creation identity through a one-shot PowerShell authority', async () => {
    const runCommand = vi.fn(async () => '638879157000000000\n');
    const reader = createWindowsPowerShellProcessIdentityReader({ runCommand });

    await expect(reader(42)).resolves.toEqual({ pid: 42, creationIdentity: '638879157000000000' });
    expect(runCommand).toHaveBeenCalledWith('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      expect.stringContaining('Get-Process -Id 42')
    ]);
  });

  it('resolves Linux procfs units through one explicit getconf authority', async () => {
    const runCommand = vi.fn(async (_command: string, args: string[]) => args[0] === 'PAGESIZE' ? '4096\n' : '100\n');

    await expect(readLinuxProcfsMetricConfiguration({ runCommand })).resolves.toEqual({
      pageSize: 4096,
      clockTicks: 100,
      counterQuantumSeconds: 0.01
    });
    expect(runCommand).toHaveBeenCalledWith('getconf', ['PAGESIZE']);
    expect(runCommand).toHaveBeenCalledWith('getconf', ['CLK_TCK']);

    await expect(readLinuxProcfsMetricConfiguration({ runCommand: async () => 'not-a-number\n' })).rejects.toThrow(/unsigned decimal integer/);
  });

  it('brackets monotonic raw samples and rejects regression, slow reads, and post-close access', async () => {
    const snapshots = [
      parseMacosPsMetricSnapshot('00:01 1024\n'),
      parseMacosPsMetricSnapshot('00:02 2048\n'),
      parseMacosPsMetricSnapshot('00:03 3072\n')
    ];
    const clock = vi.fn()
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(10.01)
      .mockReturnValueOnce(10.5)
      .mockReturnValueOnce(10.52)
      .mockReturnValueOnce(11)
      .mockReturnValueOnce(11.02)
      .mockReturnValueOnce(11.03);
    const reader = createExternalMetricSampleReader({
      processIdentity: 'renderer-42',
      counterQuantumSeconds: 0.01,
      clock,
      readSnapshot: vi.fn(() => snapshots.shift())
    });

    await expect(reader.prime()).resolves.toMatchObject({
      sample: { ordinal: 0, readStart: 10, readEnd: 10.01, processIdentity: 'renderer-42', cumulativeCpuSeconds: 1, workingSetMiB: 1 }
    });
    await expect(reader.sample()).resolves.toMatchObject({
      sample: { ordinal: 1, readStart: 10.5, readEnd: 10.52, cumulativeCpuSeconds: 2, workingSetMiB: 2 }
    });
    await expect(reader.sample()).resolves.toMatchObject({
      sample: { ordinal: 2, readStart: 11, readEnd: 11.02, cumulativeCpuSeconds: 3, workingSetMiB: 3 }
    });
    expect(reader.close()).toEqual({ samplesRead: 2, closedAt: 11.03 });
    await expect(reader.sample()).rejects.toThrow(/closed metric reader/);

    const slowReader = createExternalMetricSampleReader({
      processIdentity: 'renderer-42',
      counterQuantumSeconds: 0.01,
      clock: vi.fn().mockReturnValueOnce(1).mockReturnValueOnce(1.051),
      readSnapshot: () => parseMacosPsMetricSnapshot('00:01 1\n')
    });
    await expect(slowReader.sample()).rejects.toThrow(/exceeds its maximum duration/);

    const regressingReader = createExternalMetricSampleReader({
      processIdentity: 'renderer-42',
      counterQuantumSeconds: 0.01,
      clock: vi.fn().mockReturnValueOnce(1).mockReturnValueOnce(1.01).mockReturnValueOnce(2).mockReturnValueOnce(2.01),
      readSnapshot: vi.fn()
        .mockReturnValueOnce(parseMacosPsMetricSnapshot('00:02 1\n'))
        .mockReturnValueOnce(parseMacosPsMetricSnapshot('00:01 1\n'))
    });
    await regressingReader.sample();
    await expect(regressingReader.sample()).rejects.toThrow(/cumulative CPU regressed/);
  });

  it('reads Linux procfs and macOS ps through injectable external readers', async () => {
    const readFile = vi.fn(async (file: string) => {
      if (file.endsWith('/stat')) return linuxProcStat();
      if (file.endsWith('/statm')) return '500 25 0 0 0 0 0';
      throw new Error(`unexpected file ${file}`);
    });
    const linuxReader = createLinuxProcfsSnapshotReader({
      procfsRoot: '/fixture/proc', pageSize: 4096, clockTicks: 100, readFile
    });
    await expect(linuxReader(42)).resolves.toMatchObject({ cumulativeCpuSeconds: 0.3, workingSetMiB: 25 * 4096 / (1024 * 1024) });
    expect(readFile).toHaveBeenNthCalledWith(1, '/fixture/proc/42/stat', 'utf8');
    expect(readFile).toHaveBeenNthCalledWith(2, '/fixture/proc/42/statm', 'utf8');

    const linuxIdentityReader = createLinuxProcfsProcessIdentityReader({ procfsRoot: '/fixture/proc', readFile });
    await expect(linuxIdentityReader(42)).resolves.toEqual({ pid: 42, creationIdentity: '30' });
    expect(readFile).toHaveBeenNthCalledWith(3, '/fixture/proc/42/stat', 'utf8');

    const runCommand = vi.fn(async () => '00:01 1024\n');
    const macosReader = createMacosPsSnapshotReader({ runCommand });
    await expect(macosReader(42)).resolves.toMatchObject({ cumulativeCpuSeconds: 1, workingSetMiB: 1 });
    expect(runCommand).toHaveBeenCalledWith('/bin/ps', ['-o', 'time=', '-o', 'rss=', '-p', '42']);

    runCommand.mockResolvedValueOnce(macosPsIdentityRow());
    const macosIdentityReader = createMacosPsProcessIdentityReader({ runCommand });
    await expect(macosIdentityReader(42)).resolves.toEqual({ pid: 42, creationIdentity: macosCreationIdentity });
    expect(runCommand).toHaveBeenLastCalledWith('/bin/ps', ['-o', 'pid=', '-o', 'lstart=', '-p', '42']);

    runCommand.mockResolvedValueOnce(macosPsMetricIdentityRow());
    const macosMetricReader = createMacosPsMetricIdentitySnapshotReader({ runCommand });
    await expect(macosMetricReader(42)).resolves.toMatchObject({ raw: { pid: 42, creationIdentity: macosCreationIdentity } });
    expect(runCommand).toHaveBeenLastCalledWith('/bin/ps', ['-o', 'pid=', '-o', 'lstart=', '-o', 'time=', '-o', 'rss=', '-p', '42']);
  });
});

describe('createExternalMetricAdapterSession', () => {
  const target = {
    pid: 42,
    creationIdentity: 'creation-42',
    processIdentity: 'renderer-42',
    counterQuantumSeconds: 0.01
  };

  it('enforces the open, attach, prime, sample, detach, and close lifecycle for distinct targets', async () => {
    const readers = new Map<string, { prime: ReturnType<typeof vi.fn>, sample: ReturnType<typeof vi.fn>, close: ReturnType<typeof vi.fn> }>();
    const createReader = vi.fn(({ target: attachedTarget }) => {
      const reader = {
        prime: vi.fn(() => ({ target: attachedTarget.processIdentity })),
        sample: vi.fn(() => ({ target: attachedTarget.processIdentity })),
        close: vi.fn(() => ({ closed: attachedTarget.processIdentity }))
      };
      readers.set(attachedTarget.processIdentity, reader);
      return reader;
    });
    const openResource = vi.fn(() => ({ sampler: 'resource' }));
    const closeResource = vi.fn(() => ({ released: true }));
    let now = 0;
    const session = createExternalMetricAdapterSession({
      adapterId: 'macos-ps-v1',
      createReader,
      openResource,
      closeResource,
      clock: () => ++now
    });

    await expect(session.attach(target)).rejects.toThrow(/session is new/);
    await expect(session.open()).resolves.toEqual({ adapterId: 'macos-ps-v1' });
    await expect(session.attach(target)).resolves.toEqual(target);
    await expect(session.sample()).rejects.toThrow(/primed before sampling/);
    await expect(session.prime()).resolves.toEqual({ target: 'renderer-42' });
    await expect(session.prime()).rejects.toThrow(/already primed/);
    await expect(session.sample()).resolves.toEqual({ target: 'renderer-42' });
    await expect(session.detach()).resolves.toEqual({ closed: 'renderer-42' });

    const secondTarget = {
      pid: 43,
      creationIdentity: 'creation-43',
      processIdentity: 'renderer-43',
      counterQuantumSeconds: 0.01
    };
    await session.attach(secondTarget);
    await session.detach();
    await expect(session.close()).resolves.toMatchObject({
      adapterId: 'macos-ps-v1',
      result: { released: true },
      transitions: [
        { operation: 'open' },
        { operation: 'attach', target },
        { operation: 'prime', target },
        { operation: 'sample', target },
        { operation: 'detach', target },
        { operation: 'attach', target: secondTarget },
        { operation: 'detach', target: secondTarget },
        { operation: 'close' }
      ]
    });
    expect(openResource).toHaveBeenCalledWith({ adapterId: 'macos-ps-v1' });
    expect(closeResource).toHaveBeenCalledWith({ sampler: 'resource' }, { adapterId: 'macos-ps-v1' });
    expect(readers.get('renderer-42')?.prime).toHaveBeenCalledTimes(1);
    expect(readers.get('renderer-42')?.sample).toHaveBeenCalledTimes(1);
    await expect(session.sample()).rejects.toThrow(/session is closed/);
  });

  it('rejects target reuse, PID replacement, active close, and overlapping samples', async () => {
    let resolveSample: (value: unknown) => void = () => {};
    const pendingSample = new Promise((resolve) => { resolveSample = resolve; });
    const session = createExternalMetricAdapterSession({
      adapterId: 'linux-procfs-v1',
      clock: (() => {
        let value = 0;
        return () => ++value;
      })(),
      createReader: () => ({
        prime: () => ({ primed: true }),
        sample: () => pendingSample,
        close: () => ({ closed: true })
      })
    });

    await session.open();
    await expect(session.sample()).rejects.toThrow(/without an attached metric target/);
    await session.attach(target);
    await expect(session.close()).rejects.toThrow(/attached target/);
    await session.prime();
    const firstSample = session.sample();
    await expect(session.sample()).rejects.toThrow(/overlapping samples/);
    resolveSample({ sample: 'complete' });
    await expect(firstSample).resolves.toEqual({ sample: 'complete' });
    await session.detach();
    await expect(session.attach(target)).rejects.toThrow(/reuse a detached target/);
    await expect(session.attach({ ...target, creationIdentity: 'replacement' })).rejects.toThrow(/PID replacement/);
    await expect(session.attach({ ...target, processIdentity: 'replacement' })).rejects.toThrow(/PID replacement/);
  });

  it('aborts an attached target through the adapter cleanup resource', async () => {
    const reader = {
      prime: vi.fn(),
      sample: vi.fn(),
      close: vi.fn(() => ({ detached: true }))
    };
    const abortResource = vi.fn(() => ({ terminated: true }));
    const session = createExternalMetricAdapterSession({
      adapterId: 'linux-procfs-v1',
      createReader: () => reader,
      abortResource,
      clock: (() => {
        let value = 0;
        return () => ++value;
      })()
    });

    await session.open();
    await session.attach(target);
    await expect(session.abort()).resolves.toMatchObject({
      adapterId: 'linux-procfs-v1',
      result: { terminated: true },
      transitions: [
        { operation: 'open' },
        { operation: 'attach', target },
        { operation: 'detach-aborted', target },
        { operation: 'abort' }
      ]
    });
    expect(reader.close).toHaveBeenCalledTimes(1);
    expect(abortResource).toHaveBeenCalledWith(undefined, { adapterId: 'linux-procfs-v1' });
    expect(session.getAudit()).toMatchObject({ state: 'aborted' });
    await expect(session.close()).rejects.toThrow(/session is aborted/);
  });

  it('still terminates the adapter resource when target detachment fails', async () => {
    const abortResource = vi.fn(() => ({ terminated: true }));
    const session = createExternalMetricAdapterSession({
      adapterId: 'linux-procfs-v1',
      createReader: () => ({
        prime: () => undefined,
        sample: () => undefined,
        close: () => { throw new Error('detachment failed'); }
      }),
      abortResource,
      clock: (() => {
        let value = 0;
        return () => ++value;
      })()
    });

    await session.open();
    await session.attach(target);
    await expect(session.abort()).rejects.toThrow('detachment failed');
    expect(abortResource).toHaveBeenCalledWith(undefined, { adapterId: 'linux-procfs-v1' });
    const audit = session.getAudit();
    expect(audit.state).toBe('aborted');
    expect(audit.transitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: 'detach-aborted-failed' }),
      expect.objectContaining({ operation: 'abort' })
    ]));
  });
});

describe('createExternalMetricRunCapture', () => {
  const target = {
    pid: 42,
    creationIdentity: 'creation-42',
    processIdentity: 'renderer-42',
    counterQuantumSeconds: 0.01
  };

  const metricRead = (
    ordinal: number,
    cumulativeCpuSeconds: number,
    raw: Record<string, unknown>,
    readStart = ordinal * 0.5
  ) => ({
    sample: {
      ordinal,
      readStart,
      readEnd: readStart + 0.01,
      cumulativeCpuSeconds,
      counterQuantumSeconds: 0.01,
      processIdentity: 'renderer-42',
      workingSetMiB: 128
    },
    raw
  });

  it('retains a contiguous immutable prime and sample transcript for one attached target', async () => {
    const session = {
      attach: vi.fn(async (input) => input),
      prime: vi.fn(async () => metricRead(0, 1, { cpuTime: '00:01' })),
      sample: vi.fn()
        .mockResolvedValueOnce(metricRead(1, 2, { cpuTime: '00:02' }))
        .mockResolvedValueOnce(metricRead(2, 3, { cpuTime: '00:03', nested: { source: 'ps' } })),
      detach: vi.fn(async () => ({ detached: true })),
      abort: vi.fn()
    };
    const capture = createExternalMetricRunCapture({ session, target });

    await expect(capture.attachAndPrime()).resolves.toMatchObject({ sample: { ordinal: 0 }, raw: { cpuTime: '00:01' } });
    await expect(capture.sample()).resolves.toMatchObject({ sample: { ordinal: 1 } });
    await expect(capture.sample()).resolves.toMatchObject({ sample: { ordinal: 2 } });
    await expect(capture.detach()).resolves.toMatchObject({
      target,
      prime: { sample: { ordinal: 0 } },
      samples: [
        { sample: { ordinal: 1 } },
        { sample: { ordinal: 2 }, raw: { nested: { source: 'ps' } } }
      ],
      detached: { detached: true }
    });
    expect(capture.getAudit()).toMatchObject({ state: 'closed', samples: [{ sample: { ordinal: 1 } }, { sample: { ordinal: 2 } }] });
    expect(session.attach).toHaveBeenCalledWith(target);
    expect(session.detach).toHaveBeenCalledTimes(1);
  });

  it('fails closed on a malformed sample transcript and delegates cleanup to the pair-scoped session', async () => {
    const abort = vi.fn(async () => ({ aborted: true }));
    const session = {
      attach: vi.fn(async (input) => input),
      prime: vi.fn(async () => metricRead(0, 1, { cpuTime: '00:01' })),
      sample: vi.fn(async () => metricRead(2, 2, { cpuTime: '00:02' })),
      detach: vi.fn(),
      abort
    };
    const capture = createExternalMetricRunCapture({ session, target });

    await capture.attachAndPrime();
    await expect(capture.sample()).rejects.toThrow(/ordinal is not contiguous/);
    expect(capture.getAudit()).toMatchObject({ state: 'failed', samples: [] });
    await expect(capture.detach()).rejects.toThrow(/metric run capture is failed/);
    await expect(capture.abort()).resolves.toEqual({ aborted: true });
    expect(abort).toHaveBeenCalledTimes(1);
  });

  it('binds one run transcript to a continuous cadence and a first post-closure terminal sample', async () => {
    const session = {
      attach: vi.fn(async (input) => input),
      prime: vi.fn(async () => metricRead(0, 1, { cpuTime: '00:01' }, 9.5)),
      sample: vi.fn()
        .mockResolvedValueOnce(metricRead(1, 2, { cpuTime: '00:02' }, 10))
        .mockResolvedValueOnce(metricRead(2, 3, { cpuTime: '00:03' }, 10.5))
        .mockResolvedValueOnce(metricRead(3, 4, { cpuTime: '00:04' }, 11)),
      detach: vi.fn(async () => ({ detached: true })),
      abort: vi.fn()
    };
    const capture = createExternalMetricCadenceCapture({
      capture: createExternalMetricRunCapture({ session, target })
    });

    await expect(capture.attachAndPrime()).resolves.toMatchObject({ sample: { ordinal: 0 } });
    await expect(capture.beginWindow()).resolves.toMatchObject({ windowStart: 10, sample: { sample: { ordinal: 1 } } });
    expect(capture.getNextSampleTargetAt()).toBeCloseTo(10.505);
    await expect(capture.sampleInWindow()).resolves.toMatchObject({ sample: { ordinal: 2 } });
    expect(capture.markTerminalClosure(10.75)).toEqual({ terminalClosureEnd: 10.75 });
    await expect(capture.sampleTerminalClosure()).resolves.toMatchObject({ sample: { ordinal: 3, readStart: 11 } });
    const detached = await capture.detach();
    expect(detached).toMatchObject({
      window: { start: 10, terminalClosureEnd: 10.75 },
      inWindowSamples: [{ sample: { ordinal: 1 } }, { sample: { ordinal: 2 } }],
      terminalSample: { sample: { ordinal: 3 } },
      transcript: { samples: [{ sample: { ordinal: 1 } }, { sample: { ordinal: 2 } }, { sample: { ordinal: 3 } }] }
    });
    expect(detached.nextSampleTargetAt).toBeCloseTo(11.505);
    expect(capture.getAudit()).toMatchObject({ state: 'closed', terminalSample: { sample: { ordinal: 3 } } });
  });

  it('fails closed on out-of-cadence and pre-closure terminal reads', async () => {
    const cadenceSession = {
      attach: vi.fn(async (input) => input),
      prime: vi.fn(async () => metricRead(0, 1, { cpuTime: '00:01' }, 9.5)),
      sample: vi.fn()
        .mockResolvedValueOnce(metricRead(1, 2, { cpuTime: '00:02' }, 10))
        .mockResolvedValueOnce(metricRead(2, 3, { cpuTime: '00:03' }, 10.44)),
      detach: vi.fn(),
      abort: vi.fn(async () => ({ aborted: true }))
    };
    const cadence = createExternalMetricCadenceCapture({
      capture: createExternalMetricRunCapture({ session: cadenceSession, target })
    });
    await cadence.attachAndPrime();
    await cadence.beginWindow();
    await expect(cadence.sampleInWindow()).rejects.toThrow(/cadence is outside/);
    await expect(cadence.abort()).resolves.toEqual({ aborted: true });

    const terminalSession = {
      attach: vi.fn(async (input) => input),
      prime: vi.fn(async () => metricRead(0, 1, { cpuTime: '00:01' }, 9.5)),
      sample: vi.fn()
        .mockResolvedValueOnce(metricRead(1, 2, { cpuTime: '00:02' }, 10))
        .mockResolvedValueOnce(metricRead(2, 3, { cpuTime: '00:03' }, 10.5)),
      detach: vi.fn(),
      abort: vi.fn(async () => ({ aborted: true }))
    };
    const terminal = createExternalMetricCadenceCapture({
      capture: createExternalMetricRunCapture({ session: terminalSession, target })
    });
    await terminal.attachAndPrime();
    await terminal.beginWindow();
    terminal.markTerminalClosure(10.75);
    await expect(terminal.sampleTerminalClosure()).rejects.toThrow(/first sample after workload closure/);
    await expect(terminal.abort()).resolves.toEqual({ aborted: true });
  });
});

describe('platform external metric adapter sessions', () => {
  const target = {
    pid: 42,
    creationIdentity: 'creation-42',
    processIdentity: 'renderer-42',
    counterQuantumSeconds: 0.01
  };

  const createClock = () => {
    let value = 0;
    return () => {
      value += 0.001;
      return value;
    };
  };

  it('exposes the same prime/sample/detach session contract for procfs, ps, and PowerShell', async () => {
    const linuxReadFile = vi.fn(async (file: string) => {
      if (file.endsWith('/stat')) return linuxProcStat();
      if (file.endsWith('/statm')) return '500 25 0 0 0 0 0';
      throw new Error(`unexpected file ${file}`);
    });
    const linux = createLinuxProcfsMetricAdapterSession({
      procfsRoot: '/fixture/proc', pageSize: 4096, clockTicks: 100, readFile: linuxReadFile, clock: createClock()
    });
    await linux.open();
    await linux.attach({ ...target, creationIdentity: '30' });
    await expect(linux.prime()).resolves.toMatchObject({ sample: { ordinal: 0 }, raw: { pid: 42 } });
    await expect(linux.sample()).resolves.toMatchObject({ sample: { ordinal: 1, processIdentity: 'renderer-42' }, raw: { residentPages: 25 } });
    await linux.detach();
    await expect(linux.close()).resolves.toMatchObject({ adapterId: 'linux-procfs-v1' });
    expect(linuxReadFile).toHaveBeenCalledTimes(5);

    const runCommand = vi.fn(async (_command: string, args: string[]) => (
      args.includes('time=') ? macosPsMetricIdentityRow() : macosPsIdentityRow()
    ));
    const macos = createMacosPsMetricAdapterSession({ runCommand, clock: createClock() });
    const macosTarget = { ...target, creationIdentity: macosCreationIdentity };
    await macos.open();
    await expect(macos.attach({ ...macosTarget, counterQuantumSeconds: 0.001 })).rejects.toThrow(/counter quantum/);
    await macos.attach(macosTarget);
    await expect(macos.prime()).resolves.toMatchObject({ sample: { ordinal: 0 }, raw: { residentSetKiB: 1024 } });
    await expect(macos.sample()).resolves.toMatchObject({ sample: { ordinal: 1 }, raw: { cpuTime: '00:01' } });
    await macos.detach();
    await expect(macos.close()).resolves.toMatchObject({ adapterId: 'macos-ps-v1' });
    expect(runCommand).toHaveBeenCalledTimes(4);

    const child = new FakePowerShellSampler();
    const openSampler = vi.fn(() => openWindowsPowerShellMetricSampler({ spawnProcess: () => child }));
    const windows = createWindowsPowerShellMetricAdapterSession({ openSampler, clock: createClock() });
    const windowsTarget = { ...target, counterQuantumSeconds: 0.0000001 };
    await windows.open();
    await windows.attach(windowsTarget);
    await expect(windows.prime()).resolves.toMatchObject({
      sample: { ordinal: 0, counterQuantumSeconds: 0.0000001 },
      raw: { sampler: { pid: 42, creationIdentity: 'creation-42', bracketSeconds: 0.01 } }
    });
    await expect(windows.sample()).resolves.toMatchObject({ sample: { ordinal: 1, cumulativeCpuSeconds: 3 } });
    await windows.detach();
    await expect(windows.close()).resolves.toMatchObject({ adapterId: 'windows-powershell-v1' });
    expect(openSampler).toHaveBeenCalledTimes(1);
    expect(child.stdin.write.mock.calls.map(([line]) => JSON.parse(line).operation)).toEqual(['attach', 'prime', 'sample', 'detach']);
  });

  it('brackets synchronous macOS ps acquisition without unrelated microtask delay', async () => {
    let now = 0;
    const runCommand = vi.fn((_command: string, args: string[]) => (
      args.includes('time=') ? macosPsMetricIdentityRow() : macosPsIdentityRow()
    ));
    const session = createMacosPsMetricAdapterSession({ runCommand, clock: () => now });

    await session.open();
    await session.attach({ ...target, creationIdentity: macosCreationIdentity });
    now = 0.1;
    await session.prime();
    now = 0.5;
    queueMicrotask(() => { now = 0.56; });
    await expect(session.sample()).resolves.toMatchObject({
      sample: { readStart: 0.5, readEnd: 0.5 }
    });
    await session.abort();

    now = 1;
    const slowCommand = vi.fn((_command: string, args: string[]) => {
      if (args.includes('time=')) now += 0.051;
      return args.includes('time=') ? macosPsMetricIdentityRow() : macosPsIdentityRow();
    });
    const slowSession = createMacosPsMetricAdapterSession({ runCommand: slowCommand, clock: () => now });
    await slowSession.open();
    await slowSession.attach({ ...target, creationIdentity: macosCreationIdentity });
    await expect(slowSession.prime()).rejects.toThrow(/exceeds its maximum duration/);
    await slowSession.abort();
  });

  it('fails closed when Linux or macOS observes a reused PID after attachment', async () => {
    let linuxStartTicks = 30;
    const linuxReadFile = vi.fn(async (file: string) => {
      if (file.endsWith('/stat')) return linuxProcStat({ startTicks: linuxStartTicks });
      if (file.endsWith('/statm')) return '500 25 0 0 0 0 0';
      throw new Error(`unexpected file ${file}`);
    });
    const linux = createLinuxProcfsMetricAdapterSession({
      procfsRoot: '/fixture/proc', pageSize: 4096, clockTicks: 100, readFile: linuxReadFile, clock: createClock()
    });
    await linux.open();
    await linux.attach({ ...target, creationIdentity: '30' });
    await linux.prime();
    linuxStartTicks = 31;
    await expect(linux.sample()).rejects.toThrow(/does not match the attached process creation identity/);
    await linux.abort();

    let macosIdentity = macosCreationIdentity;
    const runCommand = vi.fn(async (_command: string, args: string[]) => (
      args.includes('time=')
        ? macosPsMetricIdentityRow({ creationIdentity: macosIdentity })
        : macosPsIdentityRow({ creationIdentity: macosIdentity })
    ));
    const macos = createMacosPsMetricAdapterSession({ runCommand, clock: createClock() });
    await macos.open();
    await macos.attach({ ...target, creationIdentity: macosCreationIdentity });
    await macos.prime();
    macosIdentity = 'Fri Jul 11 02:36:00 2026';
    await expect(macos.sample()).rejects.toThrow(/does not match the attached process creation identity/);
    await macos.abort();
  });

  it('selects one unopened platform adapter with a resolved target identity', async () => {
    const linuxIdentity = vi.fn(async (pid: number) => ({ pid, creationIdentity: '30' }));
    const linux = await createPlatformExternalMetricAdapterSession({
      platform: 'linux',
      pid: 42,
      processIdentity: 'renderer-42',
      linux: {
        pageSize: 4096,
        clockTicks: 100,
        readIdentity: linuxIdentity,
        readFile: async () => linuxProcStat()
      }
    });
    expect(linux).toMatchObject({
      adapterId: 'linux-procfs-v1',
      target: { pid: 42, creationIdentity: '30', processIdentity: 'renderer-42', counterQuantumSeconds: 0.01 }
    });

    const macos = await createPlatformExternalMetricAdapterSession({
      platform: 'darwin',
      pid: 42,
      processIdentity: 'renderer-42',
      macos: {
        readIdentity: async (pid: number) => ({ pid, creationIdentity: macosCreationIdentity }),
        runCommand: async () => macosPsMetricIdentityRow()
      }
    });
    expect(macos).toMatchObject({
      adapterId: 'macos-ps-v1',
      target: { pid: 42, creationIdentity: macosCreationIdentity, processIdentity: 'renderer-42', counterQuantumSeconds: 0.01 }
    });

    const windows = await createPlatformExternalMetricAdapterSession({
      platform: 'win32',
      pid: 42,
      processIdentity: 'renderer-42',
      windows: {
        readIdentity: async (pid: number) => ({ pid, creationIdentity: '638879157000000000' }),
        openSampler: () => new FakePowerShellSampler()
      }
    });
    expect(windows).toMatchObject({
      adapterId: 'windows-powershell-v1',
      target: { pid: 42, creationIdentity: '638879157000000000', processIdentity: 'renderer-42', counterQuantumSeconds: 0.0000001 }
    });

    await expect(createPlatformExternalMetricAdapterSession({
      platform: 'freebsd', pid: 42, processIdentity: 'renderer-42'
    })).rejects.toThrow(/unsupported platform metric adapter/);
  });

  it('creates a target-free persistent adapter before either pair side launches', async () => {
    const child = new FakePowerShellSampler();
    const openSampler = vi.fn(() => openWindowsPowerShellMetricSampler({ spawnProcess: () => child }));
    const adapter = createPlatformExternalMetricSession({
      platform: 'win32',
      windows: { openSampler, clock: createClock() }
    });

    expect(adapter.adapterId).toBe('windows-powershell-v1');
    await adapter.session.open();
    await adapter.session.attach({ ...target, counterQuantumSeconds: 0.0000001 });
    await adapter.session.prime();
    await adapter.session.detach();
    await adapter.session.close();

    expect(openSampler).toHaveBeenCalledTimes(1);
    expect(child.stdin.write.mock.calls.map(([line]) => JSON.parse(line).operation)).toEqual([
      'attach', 'prime', 'detach'
    ]);
  });

  it('resolves a second side target without creating another pair-scoped adapter', async () => {
    const resolved = await resolvePlatformExternalMetricTarget({
      platform: 'darwin',
      pid: 84,
      processIdentity: 'renderer-84',
      macos: {
        readIdentity: async (pid: number) => ({ pid, creationIdentity: 'Fri Jul 11 02:36:00 2026' })
      }
    });

    expect(resolved).toEqual({
      adapterId: 'macos-ps-v1',
      target: {
        pid: 84,
        creationIdentity: 'Fri Jul 11 02:36:00 2026',
        processIdentity: 'renderer-84',
        counterQuantumSeconds: 0.01
      }
    });
    expect(resolved).not.toHaveProperty('session');
  });
});

describe('openWindowsPowerShellMetricSampler', () => {
  const target = {
    pid: 42,
    creationIdentity: 'creation-42',
    processIdentity: 'renderer-42',
    counterQuantumSeconds: 0.0000001
  };

  it('uses one ready persistent sampler with a closed attach/prime/sample/detach protocol', async () => {
    const child = new FakePowerShellSampler();
    const spawnProcess = vi.fn(() => child);
    const sampler = await openWindowsPowerShellMetricSampler({ spawnProcess });

    await expect(sampler.attach(target)).resolves.toEqual(target);
    await expect(sampler.prime()).resolves.toMatchObject({
      snapshot: { cumulativeCpuSeconds: 2, workingSetMiB: 10, counterQuantumSeconds: 0.0000001 },
      sampler: { pid: 42, creationIdentity: 'creation-42', bracketSeconds: 0.01 }
    });
    await expect(sampler.sample()).resolves.toMatchObject({ snapshot: { cumulativeCpuSeconds: 3 } });
    await expect(sampler.detach()).resolves.toEqual({ target });
    await expect(sampler.close()).resolves.toMatchObject({ pid: 8484, exit: { code: 0, signal: null }, stderr: '' });
    expect(spawnProcess).toHaveBeenCalledWith('powershell.exe', expect.arrayContaining(['-NoProfile', '-NonInteractive', '-Command']), {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });
    expect(child.stdin.write).toHaveBeenCalledTimes(4);
    expect(child.stdin.write.mock.calls.map(([line]) => JSON.parse(line).operation)).toEqual(['attach', 'prime', 'sample', 'detach']);
  });

  it('fails closed on response target/sequence corruption and leaves an attached sampler uncloseable', async () => {
    const mismatchedChild = new FakePowerShellSampler((request) => ({
      requestId: request.requestId,
      ok: true,
      operation: request.operation,
      samplerSequence: 1,
      pid: 99,
      creationIdentity: 'creation-42'
    }));
    const sampler = await openWindowsPowerShellMetricSampler({ spawnProcess: () => mismatchedChild });
    await expect(sampler.attach(target)).rejects.toThrow(/target identity/);

    const attachedChild = new FakePowerShellSampler();
    const attachedSampler = await openWindowsPowerShellMetricSampler({ spawnProcess: () => attachedChild });
    await attachedSampler.attach(target);
    await expect(attachedSampler.close()).rejects.toThrow(/attached target/);
    await expect(attachedSampler.abort()).resolves.toMatchObject({ aborted: true, exit: { code: 0, signal: null } });
  });
});

describe('waitForProcessClose', () => {
  it('resolves with the close code and signal', async () => {
    const child = new FakeChildProcess();
    const pending = waitForProcessClose(child, 1000);
    child.emit('close', 0, null);
    await expect(pending).resolves.toEqual({ closed: true, code: 0, signal: null });
  });

  it('resolves with a timeout marker when the process stays open', async () => {
    const child = new FakeChildProcess();
    await expect(waitForProcessClose(child, 10)).resolves.toEqual({
      closed: false,
      code: null,
      signal: 'timeout'
    });
  });
});

describe('terminateProcessTree', () => {
  it('signals the process group when configured', async () => {
    const child = new FakeChildProcess();
    const signalGroup = vi.fn((pid: number, signal: string): true => {
      setImmediate(() => child.emit('close', null, 'SIGTERM'));
      return true;
    });
    await terminateProcessTree(child, { gracefulMs: 100, killProcessGroup: true, platform: 'linux', signalGroup });
    expect(signalGroup).toHaveBeenCalledWith(4242, 'SIGTERM');
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('terminates the child directly by default', async () => {
    const child = new FakeChildProcess();
    await terminateProcessTree(child, { gracefulMs: 100, platform: 'linux' });
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('uses taskkill on windows', async () => {
    const child = new FakeChildProcess();
    const execCommand = vi.fn(() => {
      setImmediate(() => child.emit('close', null, null));
      return child as unknown as ReturnType<typeof exec>;
    }) as unknown as typeof exec;
    await terminateProcessTree(child, { gracefulMs: 100, platform: 'win32', execCommand });
    expect(execCommand).toHaveBeenCalledWith('taskkill /pid 4242 /t /f');
    expect(child.kill).not.toHaveBeenCalled();
  });
});
