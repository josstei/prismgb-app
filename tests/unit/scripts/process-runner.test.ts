import { exec } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  createExternalMetricAdapterSession,
  createExternalMetricSampleReader,
  createLinuxProcfsSnapshotReader,
  createMacosPsSnapshotReader,
  createProcessIdentityTracker,
  headlessElectronEnv,
  openWindowsPowerShellMetricSampler,
  parseLinuxProcfsMetricSnapshot,
  parseMacosPsMetricSnapshot,
  parseWindowsPowerShellMetricSnapshot,
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

  it('brackets monotonic raw samples and rejects regression, slow reads, and post-close access', async () => {
    const snapshots = [
      parseMacosPsMetricSnapshot('00:01 1024\n'),
      parseMacosPsMetricSnapshot('00:02 2048\n')
    ];
    const clock = vi.fn()
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(10.01)
      .mockReturnValueOnce(10.5)
      .mockReturnValueOnce(10.52)
      .mockReturnValueOnce(10.53);
    const reader = createExternalMetricSampleReader({
      processIdentity: 'renderer-42',
      counterQuantumSeconds: 0.01,
      clock,
      readSnapshot: vi.fn(() => snapshots.shift())
    });

    await expect(reader.sample()).resolves.toMatchObject({
      sample: { ordinal: 1, readStart: 10, readEnd: 10.01, processIdentity: 'renderer-42', cumulativeCpuSeconds: 1, workingSetMiB: 1 }
    });
    await expect(reader.sample()).resolves.toMatchObject({
      sample: { ordinal: 2, readStart: 10.5, readEnd: 10.52, cumulativeCpuSeconds: 2, workingSetMiB: 2 }
    });
    expect(reader.close()).toEqual({ samplesRead: 2, closedAt: 10.53 });
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
      if (file.endsWith('/stat')) return '42 (Browser) S 0 0 0 0 0 0 0 0 0 0 10 20';
      if (file.endsWith('/statm')) return '500 25 0 0 0 0 0';
      throw new Error(`unexpected file ${file}`);
    });
    const linuxReader = createLinuxProcfsSnapshotReader({
      procfsRoot: '/fixture/proc', pageSize: 4096, clockTicks: 100, readFile
    });
    await expect(linuxReader(42)).resolves.toMatchObject({ cumulativeCpuSeconds: 0.3, workingSetMiB: 25 * 4096 / (1024 * 1024) });
    expect(readFile).toHaveBeenNthCalledWith(1, '/fixture/proc/42/stat', 'utf8');
    expect(readFile).toHaveBeenNthCalledWith(2, '/fixture/proc/42/statm', 'utf8');

    const runCommand = vi.fn(async () => '00:01 1024\n');
    const macosReader = createMacosPsSnapshotReader({ runCommand });
    await expect(macosReader(42)).resolves.toMatchObject({ cumulativeCpuSeconds: 1, workingSetMiB: 1 });
    expect(runCommand).toHaveBeenCalledWith('/bin/ps', ['-o', 'time=', '-o', 'rss=', '-p', '42']);
  });
});

describe('createExternalMetricAdapterSession', () => {
  const target = {
    pid: 42,
    creationIdentity: 'creation-42',
    processIdentity: 'renderer-42',
    counterQuantumSeconds: 0.01
  };

  it('enforces the open, attach, sample, detach, and close lifecycle for distinct targets', async () => {
    const readers = new Map<string, { sample: ReturnType<typeof vi.fn>, close: ReturnType<typeof vi.fn> }>();
    const createReader = vi.fn(({ target: attachedTarget }) => {
      const reader = {
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
    await expect(session.prime()).resolves.toEqual({ target: 'renderer-42' });
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
    expect(readers.get('renderer-42')?.sample).toHaveBeenCalledTimes(2);
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
        sample: () => pendingSample,
        close: () => ({ closed: true })
      })
    });

    await session.open();
    await expect(session.sample()).rejects.toThrow(/without an attached metric target/);
    await session.attach(target);
    await expect(session.close()).rejects.toThrow(/attached target/);
    const firstSample = session.sample();
    await expect(session.sample()).rejects.toThrow(/overlapping samples/);
    resolveSample({ sample: 'complete' });
    await expect(firstSample).resolves.toEqual({ sample: 'complete' });
    await session.detach();
    await expect(session.attach(target)).rejects.toThrow(/reuse a detached target/);
    await expect(session.attach({ ...target, creationIdentity: 'replacement' })).rejects.toThrow(/PID replacement/);
    await expect(session.attach({ ...target, processIdentity: 'replacement' })).rejects.toThrow(/PID replacement/);
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
