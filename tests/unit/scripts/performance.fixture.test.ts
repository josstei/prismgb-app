import { describe, expect, it, vi } from 'vitest';
import {
  createPerformanceElectronLaunchOptions,
  openPerformanceRendererMetricPairSession,
  openPerformanceRendererMetricCapture,
  resolvePerformanceRendererMetricTarget
} from '../../e2e/fixtures/performance.fixture.js';

describe('createPerformanceElectronLaunchOptions', () => {
  const inheritedHarnessEnvironment = {
    PATH: '/bin',
    PRISMGB_PERF_MEASUREMENT: '1',
    PRISMGB_PERF_LAUNCH_ID: 'stale-launch',
    PRISMGB_E2E_DIAGNOSTICS: '1',
    PRISMGB_E2E_TEST_CONTROL: '1'
  };

  it('removes inherited harness state from a production sentinel launch', () => {
    const launch = createPerformanceElectronLaunchOptions({
      build: { directory: '/fixture/production', harness: false, instrumentation: false },
      launchId: null,
      userDataDirectory: '/tmp/production-profile',
      baseEnvironment: inheritedHarnessEnvironment,
      performanceDiagnostics: false
    });

    expect(launch.args).toEqual([
      '/fixture/production/main/index.js',
      '--test-mode',
      '--user-data-dir=/tmp/production-profile',
      '--no-sandbox',
      '--disable-dev-shm-usage'
    ]);
    expect(launch.env).toMatchObject({
      PATH: '/bin',
      NODE_ENV: 'test',
      ELECTRON_IS_DEV: '0',
      DISABLE_AUTO_UPDATER: 'true',
      DISABLE_CRASH_REPORTER: 'true',
      DISABLE_TRAY: 'true'
    });
    expect(launch.env).not.toHaveProperty('PRISMGB_PERF_MEASUREMENT');
    expect(launch.env).not.toHaveProperty('PRISMGB_PERF_LAUNCH_ID');
    expect(launch.env).not.toHaveProperty('PRISMGB_E2E_DIAGNOSTICS');
    expect(launch.env).not.toHaveProperty('PRISMGB_E2E_TEST_CONTROL');
  });

  it('adds the marker and harness-only environment for a harness launch', () => {
    const launch = createPerformanceElectronLaunchOptions({
      build: { directory: '/fixture/instrumented', harness: true, instrumentation: true },
      launchId: 'launch-42',
      userDataDirectory: '/tmp/harness-profile',
      baseEnvironment: { PATH: '/bin' },
      performanceDiagnostics: true
    });

    expect(launch.args).toContain('--prismgb-performance-launch-id=launch-42');
    expect(launch.env).toMatchObject({
      PRISMGB_PERF_MEASUREMENT: '1',
      PRISMGB_PERF_LAUNCH_ID: 'launch-42',
      PRISMGB_E2E_DIAGNOSTICS: '1',
      PRISMGB_E2E_TEST_CONTROL: '1'
    });
  });

  it('rejects a launch marker on a production sentinel', () => {
    expect(() => createPerformanceElectronLaunchOptions({
      build: { directory: '/fixture/production', harness: false, instrumentation: false },
      launchId: 'unexpected-marker',
      userDataDirectory: '/tmp/production-profile',
      performanceDiagnostics: false
    })).toThrow(/must not receive a launch ID/);
  });

  it('resolves Linux renderer metrics through external adapter authorities only', async () => {
    const readLinuxConfiguration = async () => ({ pageSize: 4096, clockTicks: 100, counterQuantumSeconds: 0.01 });

    await expect(resolvePerformanceRendererMetricTarget({
      platform: 'linux',
      rendererPid: 4242,
      externalExecutionId: '123e4567-e89b-42d3-a456-426614174000',
      readLinuxConfiguration,
      resolveTarget: async ({ pid, processIdentity }) => ({
        adapterId: 'linux-procfs-v1' as const,
        target: {
          pid,
          creationIdentity: '30',
          processIdentity,
          counterQuantumSeconds: 0.01
        }
      })
    })).resolves.toEqual({
      adapterId: 'linux-procfs-v1',
      target: {
        pid: 4242,
        creationIdentity: '30',
        processIdentity: 'renderer:123e4567-e89b-42d3-a456-426614174000:4242',
        counterQuantumSeconds: 0.01
      }
    });
  });

  it('opens, primes, finalizes, and closes one externally owned renderer metric capture', async () => {
    const target = {
      pid: 4242,
      creationIdentity: '30',
      processIdentity: 'renderer:123e4567-e89b-42d3-a456-426614174000:4242',
      counterQuantumSeconds: 0.01
    };
    const sample = (ordinal: number, readStart: number, readEnd: number, cumulativeCpuSeconds: number) => ({
      sample: {
        ordinal,
        readStart,
        readEnd,
        cumulativeCpuSeconds,
        counterQuantumSeconds: 0.01,
        processIdentity: target.processIdentity,
        workingSetMiB: 32
      },
      raw: { pid: 4242, startTicks: 30, ordinal }
    });
    const session = {
      open: vi.fn(async () => ({ adapterId: 'macos-ps-v1' })),
      attach: vi.fn(async () => target),
      prime: vi.fn(async () => sample(0, 0, 0.01, 1)),
      sample: vi.fn()
        .mockResolvedValueOnce(sample(1, 1, 1.01, 1.1))
        .mockResolvedValueOnce(sample(2, 1.5, 1.51, 1.2))
        .mockResolvedValueOnce(sample(3, 2, 2.01, 1.3)),
      detach: vi.fn(async () => ({ target })),
      close: vi.fn(async () => ({ adapterId: 'macos-ps-v1' })),
      abort: vi.fn(async () => ({ adapterId: 'macos-ps-v1' }))
    };
    const createAdapter = vi.fn(async () => ({ adapterId: 'macos-ps-v1', target, session }));

    const capture = await openPerformanceRendererMetricCapture({
      platform: 'darwin',
      rendererPid: 4242,
      externalExecutionId: '123e4567-e89b-42d3-a456-426614174000',
      createAdapter
    });

    await capture.beginWindow();
    await capture.sampleInWindow();
    capture.markTerminalClosure(1.7);
    await capture.sampleTerminalClosure();
    const transcript = await capture.finalize();

    expect(createAdapter).toHaveBeenCalledWith({
      platform: 'darwin',
      pid: 4242,
      processIdentity: target.processIdentity
    });
    expect(session.open).toHaveBeenCalledTimes(1);
    expect(session.attach).toHaveBeenCalledWith(target);
    expect(session.prime).toHaveBeenCalledTimes(1);
    expect(session.detach).toHaveBeenCalledTimes(1);
    expect(session.close).toHaveBeenCalledTimes(1);
    expect(session.abort).not.toHaveBeenCalled();
    expect(transcript).toMatchObject({
      window: { start: 1, terminalClosureEnd: 1.7 },
      inWindowSamples: [sample(1, 1, 1.01, 1.1), sample(2, 1.5, 1.51, 1.2)],
      terminalSample: sample(3, 2, 2.01, 1.3)
    });
    await expect(capture.abort()).rejects.toThrow(/when it is closed/);
  });

  it('retains one metric adapter session across two detached renderer sides', async () => {
    const externalExecutionIds = [
      '123e4567-e89b-42d3-a456-426614174000',
      '123e4567-e89b-42d3-a456-426614174001'
    ];
    const targets = new Map([
      [4242, {
        pid: 4242,
        creationIdentity: 'first',
        processIdentity: `renderer:${externalExecutionIds[0]}:4242`,
        counterQuantumSeconds: 0.01
      }],
      [4243, {
        pid: 4243,
        creationIdentity: 'second',
        processIdentity: `renderer:${externalExecutionIds[1]}:4243`,
        counterQuantumSeconds: 0.01
      }]
    ]);
    let activeTarget: (typeof targets extends Map<number, infer Value> ? Value : never) | null = null;
    const readings = new Map([
      [4242, [[0, 0, 0.01, 1], [1, 1, 1.01, 1.1], [2, 1.5, 1.51, 1.2], [3, 2, 2.01, 1.3]]],
      [4243, [[0, 3, 3.01, 2], [1, 4, 4.01, 2.1], [2, 4.5, 4.51, 2.2], [3, 5, 5.01, 2.3]]]
    ]);
    const read = () => {
      if (activeTarget === null) throw new Error('missing active fixture target');
      const values = readings.get(activeTarget.pid);
      const next = values?.shift();
      if (!next) throw new Error('missing fixture metric read');
      const [ordinal, readStart, readEnd, cumulativeCpuSeconds] = next;
      return {
        sample: {
          ordinal,
          readStart,
          readEnd,
          cumulativeCpuSeconds,
          counterQuantumSeconds: 0.01,
          processIdentity: activeTarget.processIdentity,
          workingSetMiB: 32
        },
        raw: { pid: activeTarget.pid, creationIdentity: activeTarget.creationIdentity, ordinal }
      };
    };
    const session = {
      open: vi.fn(async () => ({ adapterId: 'macos-ps-v1' })),
      attach: vi.fn(async (target) => {
        activeTarget = target;
        return target;
      }),
      prime: vi.fn(async () => read()),
      sample: vi.fn(async () => read()),
      detach: vi.fn(async () => ({ target: activeTarget })),
      close: vi.fn(async () => ({ adapterId: 'macos-ps-v1' })),
      abort: vi.fn(async () => ({ adapterId: 'macos-ps-v1' }))
    };
    const createSession = vi.fn(async () => ({ adapterId: 'macos-ps-v1', session }));
    const resolveTarget = vi.fn(async ({ pid }) => ({ adapterId: 'macos-ps-v1' as const, target: targets.get(pid) }));

    const pair = await openPerformanceRendererMetricPairSession({
      platform: 'darwin',
      createSession,
      resolveTarget
    });
    const first = await pair.openSide({ rendererPid: 4242, externalExecutionId: externalExecutionIds[0] });
    await expect(pair.openSide({ rendererPid: 4243, externalExecutionId: externalExecutionIds[1] })).rejects.toThrow(/another side is active/);
    await first.beginWindow();
    await first.sampleInWindow();
    first.markTerminalClosure(1.7);
    await first.sampleTerminalClosure();
    await expect(first.finalize()).resolves.toMatchObject({ window: { start: 1, terminalClosureEnd: 1.7 } });

    const second = await pair.openSide({ rendererPid: 4243, externalExecutionId: externalExecutionIds[1] });
    await second.beginWindow();
    await second.sampleInWindow();
    second.markTerminalClosure(4.7);
    await second.sampleTerminalClosure();
    await expect(second.finalize()).resolves.toMatchObject({ window: { start: 4, terminalClosureEnd: 4.7 } });
    await expect(pair.close()).resolves.toEqual({ adapterId: 'macos-ps-v1' });

    expect(createSession).toHaveBeenCalledWith({ platform: 'darwin' });
    expect(resolveTarget).toHaveBeenNthCalledWith(1, {
      platform: 'darwin',
      pid: 4242,
      processIdentity: `renderer:${externalExecutionIds[0]}:4242`
    });
    expect(session.open).toHaveBeenCalledTimes(1);
    expect(session.attach).toHaveBeenNthCalledWith(1, targets.get(4242));
    expect(session.attach).toHaveBeenNthCalledWith(2, targets.get(4243));
    expect(session.detach).toHaveBeenCalledTimes(2);
    expect(session.close).toHaveBeenCalledTimes(1);
    expect(session.abort).not.toHaveBeenCalled();
  });
});
