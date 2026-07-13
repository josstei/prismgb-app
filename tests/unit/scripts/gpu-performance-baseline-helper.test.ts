import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  assertProductionBundleIsolation,
  armPerformanceCallbackWindow,
  assertPerformanceController,
  armExternalPerformanceSentinelWindow,
  createExternalPerformanceExecutionId,
  createAbortedPerformanceMetricSessionClose,
  executePerformancePairAttemptSequence,
  installExternalPerformanceSentinelGate,
  installPerformanceControlProbe,
  openPerformanceMeasurementLease,
  performanceBackendSettingValue,
  pausePerformanceCallbacks,
  pausePerformanceCallbacksAt,
  pauseExternalPerformanceSentinelCallbacks,
  readPerformanceCallbackGate,
  readElectronBrowserProcessIdentity,
  readElectronRendererProcessId,
  readExternalPerformanceSentinelGate,
  readPerformanceControlProbe,
  readPerformanceDiagnostics,
  readPerformanceQualificationProbe,
  removeExternalPerformanceSentinelGate,
  removePerformanceCallbackGate,
  resetExternalPerformanceSentinelGate,
  resetPerformanceControlProbe,
  resetPerformanceDiagnostics,
  resumeExternalPerformanceSentinelCallbacks,
  resumePerformanceCallbacks,
  sealExternalPerformanceSentinelGate,
  removePerformanceControlProbe
} from '../../e2e/helpers/gpu-performance-baseline.helper.js';

const controllerSymbol = Symbol.for('prismgb.performance.measurementController');
const originalControllerDescriptor = Object.getOwnPropertyDescriptor(globalThis, controllerSymbol);
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalVideoElementDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'HTMLVideoElement');
const originalCanvasContextDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'CanvasRenderingContext2D');

afterEach(() => {
  if (originalControllerDescriptor) {
    Object.defineProperty(globalThis, controllerSymbol, originalControllerDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, controllerSymbol);
  }

  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, 'window');
  }

  if (originalVideoElementDescriptor) {
    Object.defineProperty(globalThis, 'HTMLVideoElement', originalVideoElementDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, 'HTMLVideoElement');
  }

  if (originalCanvasContextDescriptor) {
    Object.defineProperty(globalThis, 'CanvasRenderingContext2D', originalCanvasContextDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, 'CanvasRenderingContext2D');
  }
});

describe('GPU performance baseline helper', () => {
  it('maps the sealed backend authority to the real animation-saver setting', () => {
    expect(performanceBackendSettingValue('canvas2d')).toBe(true);
    expect(performanceBackendSettingValue('webgpu')).toBe(false);
    expect(() => performanceBackendSettingValue('unknown')).toThrow(/unsupported performance backend authority/);
  });

  it.each([
    ['reset-b', 'none', 'reset-failure', 'side-a'],
    ['close', 'none', 'metric-adapter-close-failure', 'side-b']
  ])('seals a %s abort with the exact last completed boundary', (phase, backend, reason, lastBoundary) => {
    const entry = createAbortedPerformanceMetricSessionClose({
      sequence: 6,
      metricSessionId: 'metric-session',
      phase,
      backend,
      reason,
      abortEvidence: {
        adapterId: 'macos-ps-v1',
        startedAt: 10,
        endedAt: 11,
        closure: { adapterId: 'macos-ps-v1', transitions: [{ operation: 'abort', status: 'completed' }] }
      },
      resourcesClosed: true
    });
    expect(entry).toMatchObject({
      outcome: 'aborted',
      abortReason: { phase, backend, reason },
      lastBoundary,
      closure: { zeroSurvivors: true },
      closureEnd: 11
    });
  });

  it('preserves adapter-owned abort timestamps byte-for-byte after application cleanup', () => {
    const abortEvidence = Object.freeze({
      adapterId: 'macos-ps-v1',
      startedAt: 10.25,
      endedAt: 10.75,
      closure: Object.freeze({
        adapterId: 'macos-ps-v1',
        transitions: Object.freeze([{ operation: 'abort', status: 'completed' }])
      })
    });
    const encodedEvidence = JSON.stringify(abortEvidence);
    const entry = createAbortedPerformanceMetricSessionClose({
      sequence: 6,
      metricSessionId: 'metric-session',
      phase: 'side-b',
      backend: 'webgpu',
      reason: 'worker-error',
      abortEvidence,
      resourcesClosed: true,
      applicationDescendantClosureEnd: 10
    });

    expect(JSON.stringify(abortEvidence)).toBe(encodedEvidence);
    expect(entry).toMatchObject({
      start: 10.25,
      end: 10.75,
      closure: { exit: { durationMs: 500 } },
      closureEnd: 10.75
    });
    expect(() => createAbortedPerformanceMetricSessionClose({
      sequence: 6,
      metricSessionId: 'metric-session',
      phase: 'side-b',
      backend: 'webgpu',
      reason: 'worker-error',
      abortEvidence,
      resourcesClosed: true,
      applicationDescendantClosureEnd: 10.5
    })).toThrow(/application cleanup must precede the adapter abort close/);
  });

  it('rejects production bundles containing the backend readiness identity path', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prismgb-bundle-sentinel-'));
    const productionDirectory = path.join(root, 'production');
    await fs.mkdir(productionDirectory, { recursive: true });
    await fs.writeFile(path.join(productionDirectory, 'renderer.js'), 'const backendExecutionIdentity = true;');
    try {
      await expect(assertProductionBundleIsolation({
        buildsDirectory: root,
        manifest: { variants: [{ id: 'production', harness: false, instrumentation: false }] }
      })).rejects.toThrow(/contains backendExecutionIdentity/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('advances evaluator-authorized retries and stops when accepted', async () => {
    const pair = { attempts: [1, 2, 3].map((attemptIndex) => ({ attemptIndex })) };
    const executeAttempt = vi.fn(async ({ attempt, retryReason }) => ({ attemptIndex: attempt.attemptIndex, retryReason }));
    const assessCompletedAttempt = vi.fn(async ({ attempt }) => attempt.attemptIndex < 3
      ? { disposition: 'retryable', reason: attempt.attemptIndex === 1 ? 'sample-floor' : 'cadence-insufficient', retryAllowed: true, nextAttemptIndex: attempt.attemptIndex + 1 }
      : { disposition: 'accepted', reason: null, retryAllowed: false, nextAttemptIndex: null });
    await expect(executePerformancePairAttemptSequence({ pair, executeAttempt, assessCompletedAttempt }))
      .resolves.toMatchObject({
        terminal: { disposition: 'accepted' },
        completed: [
          { attemptIndex: 1, retryReason: null },
          { attemptIndex: 2, retryReason: 'sample-floor' },
          { attemptIndex: 3, retryReason: 'cadence-insufficient' }
        ]
      });
  });

  it.each(['accepted', 'rejected-regression', 'fatal'])('stops after a terminal %s assessment', async (disposition) => {
    const pair = { attempts: [1, 2, 3].map((attemptIndex) => ({ attemptIndex })) };
    const executeAttempt = vi.fn(async ({ attempt }) => ({ attemptIndex: attempt.attemptIndex }));
    const assessCompletedAttempt = vi.fn(async () => ({ disposition, reason: null, retryAllowed: false, nextAttemptIndex: null }));
    await expect(executePerformancePairAttemptSequence({ pair, executeAttempt, assessCompletedAttempt }))
      .resolves.toMatchObject({ terminal: { disposition }, completed: [{ attemptIndex: 1 }] });
    expect(executeAttempt).toHaveBeenCalledTimes(1);
  });

  it('does not assess or retry a partial attempt', async () => {
    const pair = { attempts: [1, 2, 3].map((attemptIndex) => ({ attemptIndex })) };
    const failure = new Error('side B aborted');
    const executeAttempt = vi.fn(async () => { throw failure; });
    const assessCompletedAttempt = vi.fn();
    await expect(executePerformancePairAttemptSequence({ pair, executeAttempt, assessCompletedAttempt })).rejects.toBe(failure);
    expect(assessCompletedAttempt).not.toHaveBeenCalled();
  });

  it('enforces the original-plus-two attempt cap', async () => {
    const pair = { attempts: [1, 2, 3].map((attemptIndex) => ({ attemptIndex })) };
    const executeAttempt = vi.fn(async ({ attempt }) => ({ attemptIndex: attempt.attemptIndex }));
    const assessCompletedAttempt = vi.fn(async ({ attempt }) => ({ disposition: 'retryable', reason: 'host-noise', retryAllowed: true, nextAttemptIndex: attempt.attemptIndex + 1 }));
    await expect(executePerformancePairAttemptSequence({ pair, executeAttempt, assessCompletedAttempt }))
      .rejects.toThrow(/original-plus-two attempt cap/);
    expect(executeAttempt).toHaveBeenCalledTimes(3);
  });

  it('passes isolated projections and immutable completed history', async () => {
    const pair = { attempts: [1, 2, 3].map((attemptIndex) => ({ attemptIndex })) };
    const executeAttempt = vi.fn(async ({ attempt }) => ({ attemptIndex: attempt.attemptIndex, rows: [`attempt-${attempt.attemptIndex}`] }));
    const assessCompletedAttempt = vi.fn(async ({ attempt, projection, completed }) => {
      expect(projection.attemptIndex).toBe(attempt.attemptIndex);
      expect(completed).toHaveLength(attempt.attemptIndex - 1);
      return attempt.attemptIndex === 1
        ? { disposition: 'retryable', reason: 'cpu-boundary-overlap', retryAllowed: true, nextAttemptIndex: 2 }
        : { disposition: 'accepted', reason: null, retryAllowed: false, nextAttemptIndex: null };
    });
    await expect(executePerformancePairAttemptSequence({ pair, executeAttempt, assessCompletedAttempt }))
      .resolves.toMatchObject({ completed: [{ attemptIndex: 1 }, { attemptIndex: 2 }] });
  });

  it("uses Electron evaluation's module and argument callback positions", async () => {
    const assertLaunchId = vi.fn();
    Object.defineProperty(globalThis, controllerSymbol, {
      configurable: true,
      value: { assertLaunchId }
    });
    const electronApp = {
      evaluate: async (
        callback: (electronModule: object, expectedLaunchId: string) => { mainPid: number },
        expectedLaunchId: string
      ) => callback({}, expectedLaunchId)
    };

    await expect(assertPerformanceController(electronApp, 'launch-id')).resolves.toEqual({ mainPid: process.pid });
    expect(assertLaunchId).toHaveBeenCalledWith('launch-id');
  });

  it('owns the fixture-visible lifecycle through application descendant closure before root exit', async () => {
    const launchId = '123e4567-e89b-42d3-a456-426614174000';
    const phases: string[] = [];
    const samples: Array<{ phase: string; purpose: string }> = [];
    const controller = {
      assertLaunchId: vi.fn(),
      beginOperation: vi.fn(() => ({ operationToken: { nonce: 'operation' } })),
      beginPhase: vi.fn((_operationToken: unknown, phase: string) => {
        phases.push(phase);
        return { phaseToken: { nonce: `phase:${phase}` } };
      }),
      sample: vi.fn((token: { nonce: string }, purpose: string) => {
        samples.push({ phase: token.nonce.replace('phase:', '').replace('epoch:', ''), purpose });
        return { rawAppMetrics: [] };
      }),
      sampleEnvironment: vi.fn(async () => ({ currentState: {} })),
      openNumericEpoch: vi.fn(() => ({ epochToken: { nonce: 'epoch:measurement' } })),
      closeNumericEpoch: vi.fn(() => ({ closedAt: 1, callSequence: 1 })),
      recordReleaseDispatched: vi.fn(() => ({ notBeforeFixtureAt: 1_000 })),
      samplePostReleaseSettle: vi.fn(() => ({ rawAppMetrics: [] }))
    };
    Object.defineProperty(globalThis, controllerSymbol, {
      configurable: true,
      value: controller
    });
    const electronApp = {
      evaluate: async (callback: (electronModule: object, argument: any) => unknown, argument: any) => callback({}, argument)
    };

    const lease = await openPerformanceMeasurementLease(electronApp, launchId);
    await lease.recordStartupEnvironment();
    await lease.advance('qualification-probe');
    await lease.advance('warmup');
    await lease.recordWarmupIdentity();
    await lease.recordPrime();
    await lease.beginMeasurement(launchId);
    await lease.closeNumericEpoch();
    await lease.advance('submission-seal');
    await lease.advance('drain');
    await lease.advance('shutdown');
    await expect(lease.recordReleaseDispatched(0)).resolves.toEqual({ notBeforeFixtureAt: 1_000 });
    await lease.samplePostReleaseSettle(1_000);
    await lease.advance('application-descendant-closure');
    expect(lease.prepareRootExit()).toEqual({ ready: true });
    expect(controller.assertLaunchId).toHaveBeenCalledWith(launchId);
    expect(phases).toEqual([
      'startup',
      'qualification-probe',
      'warmup',
      'measurement',
      'submission-seal',
      'drain',
      'shutdown',
      'application-descendant-closure'
    ]);
    expect(samples.map(({ purpose }) => purpose)).toEqual([
      'startup-identity',
      'qualification',
      'warmup',
      'prime',
      'measurement',
      'submission-seal',
      'drain',
      'shutdown',
      'application-descendant-closure'
    ]);
    expect(controller.openNumericEpoch).toHaveBeenCalledWith({ nonce: 'phase:measurement' }, launchId);
    expect(controller.closeNumericEpoch).toHaveBeenCalledWith({ nonce: 'epoch:measurement' });
    expect(controller.recordReleaseDispatched).toHaveBeenCalledWith({ nonce: 'phase:shutdown' }, 0);
    expect(controller.samplePostReleaseSettle).toHaveBeenCalledWith({ nonce: 'phase:shutdown' }, 1_000);
    expect(controller.sampleEnvironment).toHaveBeenCalledTimes(1);
  });

  it('reads a live renderer OS process ID through Electron main-process evaluation', async () => {
    const electronApp = {
      evaluate: async (callback: (electronModule: { BrowserWindow: { getAllWindows: () => unknown[] } }) => number) => callback({
        BrowserWindow: {
          getAllWindows: () => [
            { isDestroyed: () => true, webContents: { getOSProcessId: () => 1 } },
            { isDestroyed: () => false, webContents: { getOSProcessId: () => 4242 } }
          ]
        }
      })
    };

    await expect(readElectronRendererProcessId(electronApp)).resolves.toBe(4242);
  });

  it('reads the unique Browser PID and creation identity from raw Electron app metrics', async () => {
    const electronApp = {
      evaluate: async (callback: (electronModule: { app: { getAppMetrics: () => unknown[] } }) => unknown) => callback({
        app: {
          getAppMetrics: () => [
            { type: 'Browser', pid: 42, creationTime: 123.5 },
            { type: 'Tab', pid: 43, creationTime: 124 }
          ]
        }
      })
    };

    await expect(readElectronBrowserProcessIdentity(electronApp)).resolves.toEqual({
      pid: 42,
      creationTime: '123.5'
    });
  });

  it('passes the control-probe symbol into the renderer evaluation', async () => {
    const windowTarget: Record<PropertyKey, unknown> = {
      prismgbPerformanceLaunchMarker: { launchId: 'launch-id' }
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: windowTarget
    });
    const page = {
      evaluate: async <T>(callback: (argument: T) => unknown, argument: T) => callback(argument)
    };

    await installPerformanceControlProbe(page, 'launch-id');
    await expect(readPerformanceControlProbe(page)).resolves.toEqual([]);
    await expect(resetPerformanceControlProbe(page)).resolves.toEqual({ reset: true });
    await expect(readPerformanceControlProbe(page)).resolves.toEqual([]);
    await removePerformanceControlProbe(page);
    expect(windowTarget['prismgbPerformanceControlProbe']).toBeUndefined();
    expect(windowTarget[Symbol.for('prismgb.performance.controlProbe')]).toBeUndefined();
  });

  it('accepts only the exact actual WebGPU backend execution identity carrier', async () => {
    const windowTarget: Record<PropertyKey, unknown> = {
      prismgbPerformanceLaunchMarker: { launchId: 'launch-id' }
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: windowTarget
    });
    const page = {
      evaluate: async <T>(callback: (argument: T) => unknown, argument: T) => callback(argument)
    };
    await installPerformanceControlProbe(page, 'launch-id');
    const probe = windowTarget.prismgbPerformanceControlProbe as {
      write(message: Record<string, unknown>): void;
    };
    const message = {
      kind: 'backend-ready',
      launchId: 'launch-id',
      observedAt: 1,
      requestedBackend: 'webgpu',
      selectedBackend: 'webgpu',
      selectionReason: 'webgpu-selected',
      backendExecutionIdentity: {
        backend: 'webgpu',
        driver: 'webgpu-driver-v1',
        workerProtocol: 'webgpu-worker-ready-v1',
        adapterIdentity: {
          vendor: 'vendor',
          architecture: null,
          device: 'device',
          description: 'description'
        },
        limits: { maxTextureDimension2D: 8192, maxBindGroups: 4 },
        isFallbackAdapter: false,
        powerPreference: 'low-power'
      }
    };

    expect(() => probe.write(message)).not.toThrow();
    await expect(readPerformanceControlProbe(page)).resolves.toEqual([message]);
    expect(() => probe.write({ ...message, invented: true })).toThrow(/invalid backend readiness evidence/);
    expect(() => probe.write({
      ...message,
      backendExecutionIdentity: {
        ...message.backendExecutionIdentity,
        adapterIdentity: { ...message.backendExecutionIdentity.adapterIdentity, invented: true }
      }
    })).toThrow(/invalid backend readiness evidence/);
  });

  it('passes the marker-bound launch ID into the renderer diagnostics commands', async () => {
    const diagnostics = { source: { sourceOpportunities: 1 } };
    const reader = vi.fn((_launchId: string, command = 'snapshot') => command === 'snapshot' ? diagnostics : { reset: true });
    const windowTarget: Record<PropertyKey, unknown> = {
      [Symbol.for('prismgb.performance.rendererDiagnostics')]: reader
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: windowTarget
    });
    const page = {
      evaluate: async <T>(callback: (argument: T) => unknown, argument: T) => callback(argument)
    };

    await expect(readPerformanceDiagnostics(page, 'launch-id')).resolves.toEqual(diagnostics);
    await expect(resetPerformanceDiagnostics(page, 'launch-id')).resolves.toEqual({ reset: true });
    expect(reader).toHaveBeenCalledWith('launch-id');
    expect(reader).toHaveBeenLastCalledWith('launch-id', 'reset');
  });

  it('passes the marker-bound launch ID into the renderer qualification probe', async () => {
    const qualification = {
      webgpu: { status: 'available' },
      transferControlToOffscreen: { status: 'available' }
    };
    const probe = vi.fn(async () => qualification);
    const windowTarget: Record<PropertyKey, unknown> = {
      [Symbol.for('prismgb.performance.qualificationProbe')]: probe
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: windowTarget
    });
    const page = {
      evaluate: async <T>(callback: (argument: T) => unknown, argument: T) => callback(argument)
    };

    await expect(readPerformanceQualificationProbe(page, 'launch-id')).resolves.toEqual(qualification);
    expect(probe).toHaveBeenCalledWith('launch-id');
  });

  it('routes callback-gate commands through the marker-bound fixture control', async () => {
    const calls: string[] = [];
    const gate = {
      pause: vi.fn(() => {
        calls.push('pause');
        return { paused: true, heldCallbackCount: 0, interceptedCallbackCount: 0 };
      }),
      pauseAt: vi.fn((_launchId: string, callbackCount: number) => ({
        paused: false,
        heldCallbackCount: 0,
        interceptedCallbackCount: 1,
        pauseAtCallbackCount: callbackCount
      })),
      armWindow: vi.fn((_launchId: string, limits: Record<string, number>) => ({
        paused: true,
        heldCallbackCount: 1,
        interceptedCallbackCount: 1,
        measurementWindow: { status: 'armed', ...limits }
      })),
      resume: vi.fn(() => {
        calls.push('resume');
        return { paused: false, heldCallbackCount: 0, interceptedCallbackCount: 1 };
      }),
      snapshot: vi.fn(() => ({ paused: false, heldCallbackCount: 1, interceptedCallbackCount: 1 })),
      dispose: vi.fn(() => {
        calls.push('dispose');
        return { paused: false, heldCallbackCount: 0, interceptedCallbackCount: 1 };
      })
    };
    const windowTarget: Record<PropertyKey, unknown> = {
      [Symbol.for('prismgb.performance.callbackGate')]: gate
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: windowTarget
    });
    const page = {
      evaluate: async <T>(callback: (argument: T) => unknown, argument: T) => callback(argument)
    };

    await expect(pausePerformanceCallbacks(page, 'launch-id')).resolves.toMatchObject({ paused: true });
    await expect(pausePerformanceCallbacksAt(page, 'launch-id', 2)).resolves.toMatchObject({ pauseAtCallbackCount: 2 });
    const limits = { minimumCallbacks: 1800, minimumDurationMs: 30000, maximumCallbacks: 2048, maximumDurationMs: 45000 };
    await expect(armPerformanceCallbackWindow(page, 'launch-id', limits)).resolves.toMatchObject({
      measurementWindow: { status: 'armed', ...limits }
    });
    await expect(readPerformanceCallbackGate(page, 'launch-id')).resolves.toMatchObject({ heldCallbackCount: 1 });
    await expect(resumePerformanceCallbacks(page, 'launch-id')).resolves.toMatchObject({ paused: false });
    await expect(removePerformanceCallbackGate(page, 'launch-id')).resolves.toBeUndefined();
    expect(calls).toEqual(['pause', 'resume', 'dispose']);
    expect(gate.pauseAt).toHaveBeenCalledWith('launch-id', 2);
    expect(gate.armWindow).toHaveBeenCalledWith('launch-id', limits);
  });

  it('routes production sentinel observation commands through an external execution identity', async () => {
    const externalExecutionId = createExternalPerformanceExecutionId();
    const gate = {
      pause: vi.fn(() => ({ paused: true, heldCallbackCount: 1 })),
      reset: vi.fn(() => ({ paused: true, heldCallbackCount: 1, observations: { callbacks: [] } })),
      armWindow: vi.fn((_executionId: string, limits: Record<string, number>) => ({
        paused: true,
        heldCallbackCount: 1,
        measurementWindow: { status: 'armed', ...limits }
      })),
      seal: vi.fn(() => ({ paused: true, heldCallbackCount: 1 })),
      resume: vi.fn(() => ({ paused: false, heldCallbackCount: 0 })),
      snapshot: vi.fn(() => ({ paused: false, observations: { callbacks: [] } })),
      dispose: vi.fn(() => ({ paused: false, heldCallbackCount: 0 }))
    };
    const windowTarget: Record<PropertyKey, unknown> = {
      [Symbol.for('prismgb.performance.externalSentinelGate')]: gate
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: windowTarget
    });
    const page = {
      evaluate: async <T>(callback: (argument: T) => unknown, argument: T) => callback(argument)
    };
    const limits = { minimumCallbacks: 1800, minimumDurationMs: 30000, maximumCallbacks: 2048, maximumDurationMs: 45000 };

    expect(externalExecutionId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(pauseExternalPerformanceSentinelCallbacks(page, externalExecutionId)).resolves.toMatchObject({
      paused: true
    });
    await expect(resetExternalPerformanceSentinelGate(page, externalExecutionId)).resolves.toMatchObject({
      observations: { callbacks: [] }
    });
    await expect(armExternalPerformanceSentinelWindow(page, externalExecutionId, limits)).resolves.toMatchObject({
      measurementWindow: { status: 'armed', ...limits }
    });
    await expect(sealExternalPerformanceSentinelGate(page, externalExecutionId)).resolves.toMatchObject({
      paused: true
    });
    await expect(resumeExternalPerformanceSentinelCallbacks(page, externalExecutionId)).resolves.toMatchObject({
      paused: false
    });
    await expect(readExternalPerformanceSentinelGate(page, externalExecutionId)).resolves.toMatchObject({
      observations: { callbacks: [] }
    });
    await expect(removeExternalPerformanceSentinelGate(page, externalExecutionId)).resolves.toBeUndefined();
    expect(gate.pause).toHaveBeenCalledWith(externalExecutionId);
    expect(gate.reset).toHaveBeenCalledWith(externalExecutionId);
    expect(gate.armWindow).toHaveBeenCalledWith(externalExecutionId, limits);
    expect(gate.seal).toHaveBeenCalledWith(externalExecutionId);
    expect(gate.resume).toHaveBeenCalledWith(externalExecutionId);
    expect(gate.snapshot).toHaveBeenCalledWith(externalExecutionId);
    expect(gate.dispose).toHaveBeenCalledWith(externalExecutionId);
  });

  it('records external production-sentinel observations and restores every patched browser surface', async () => {
    class FakeVideo {
      private readonly callbacks = new Map<number, (now: number, metadata: { mediaTime: number }) => unknown>();
      private nextHandle = 0;

      requestVideoFrameCallback(callback: (now: number, metadata: { mediaTime: number }) => unknown): number {
        const handle = ++this.nextHandle;
        this.callbacks.set(handle, callback);
        return handle;
      }

      cancelVideoFrameCallback(handle: number): void {
        this.callbacks.delete(handle);
      }

      flushNext(mediaTime: number): void {
        const entry = this.callbacks.entries().next().value as
          | [number, (now: number, metadata: { mediaTime: number }) => unknown]
          | undefined;
        if (!entry) throw new Error('expected one scheduled video callback');
        this.callbacks.delete(entry[0]);
        entry[1](performance.now(), { mediaTime });
      }
    }

    class FakeCanvasRenderingContext2D {
      readonly canvas = { id: 'streamCanvas' };
      draws = 0;

      drawImage(): void {
        this.draws += 1;
      }
    }

    class FakeWorker {
      readonly messages: unknown[] = [];
      private readonly listeners = new Map<string, Set<(event: { data?: unknown }) => void>>();

      addEventListener(type: string, listener: (event: { data?: unknown }) => void): void {
        const listeners = this.listeners.get(type) ?? new Set();
        listeners.add(listener);
        this.listeners.set(type, listeners);
      }

      removeEventListener(type: string, listener: (event: { data?: unknown }) => void): void {
        this.listeners.get(type)?.delete(listener);
      }

      postMessage(message: unknown): void {
        this.messages.push(message);
      }

      emitMessage(data: unknown): void {
        this.listeners.get('message')?.forEach((listener) => listener({ data }));
      }
    }

    const originalVideoRequest = FakeVideo.prototype.requestVideoFrameCallback;
    const originalCanvasDrawImage = FakeCanvasRenderingContext2D.prototype.drawImage;
    const windowTarget = { Worker: FakeWorker };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: windowTarget
    });
    Object.defineProperty(globalThis, 'HTMLVideoElement', {
      configurable: true,
      value: FakeVideo
    });
    Object.defineProperty(globalThis, 'CanvasRenderingContext2D', {
      configurable: true,
      value: FakeCanvasRenderingContext2D
    });
    const page = {
      evaluate: async <T>(callback: (argument: T) => unknown, argument: T) => callback(argument)
    };
    const externalExecutionId = createExternalPerformanceExecutionId();
    const video = new FakeVideo();
    const context = new FakeCanvasRenderingContext2D();

    await installExternalPerformanceSentinelGate(page, externalExecutionId);
    const worker = new windowTarget.Worker();
    const applicationCallback = () => {
      context.drawImage();
      worker.postMessage({ type: 'frame' });
      video.requestVideoFrameCallback(applicationCallback);
    };

    video.requestVideoFrameCallback(applicationCallback);
    video.flushNext(1);
    await pauseExternalPerformanceSentinelCallbacks(page, externalExecutionId);
    video.flushNext(2);
    await expect(readExternalPerformanceSentinelGate(page, externalExecutionId)).resolves.toMatchObject({
      paused: true,
      heldCallbackCount: 1
    });
    await resetExternalPerformanceSentinelGate(page, externalExecutionId);
    await armExternalPerformanceSentinelWindow(page, externalExecutionId, {
      minimumCallbacks: 1,
      minimumDurationMs: 1,
      maximumCallbacks: 2,
      maximumDurationMs: 20
    });
    await resumeExternalPerformanceSentinelCallbacks(page, externalExecutionId);
    worker.emitMessage({ type: 'frameRendered', payload: {} });
    await new Promise((resolve) => setTimeout(resolve, 2));
    video.flushNext(3);
    await sealExternalPerformanceSentinelGate(page, externalExecutionId);

    await expect(readExternalPerformanceSentinelGate(page, externalExecutionId)).resolves.toMatchObject({
      paused: true,
      heldCallbackCount: 1,
      measurementWindow: {
        status: 'closed',
        closureReason: 'minimum-reached',
        deliveredCallbackCount: 1,
        terminalClosureEnd: expect.any(Number)
      },
      observations: {
        callbacks: [{ kind: 'renderer-callback', callbackOrdinal: 1, mediaTime: 2 }],
        canvasDraws: [{
          kind: 'canvas-draw-completed',
          callbackOrdinal: 1,
          startedAt: expect.any(Number),
          endedAt: expect.any(Number)
        }],
        workerFramePosts: [{
          kind: 'worker-frame-posted',
          callbackOrdinal: 1,
          startedAt: expect.any(Number),
          endedAt: expect.any(Number)
        }],
        acknowledgements: [{ kind: 'worker-frame-acknowledged', tagged: false, frameToken: null }],
        errors: [],
        postPauseCanvasDrawCount: 0,
        callbackOverlapCount: 0,
        outstandingWorkerFrames: 0
      }
    });

    await removeExternalPerformanceSentinelGate(page, externalExecutionId);
    expect(windowTarget.Worker).toBe(FakeWorker);
    expect(FakeVideo.prototype.requestVideoFrameCallback).toBe(originalVideoRequest);
    expect(FakeCanvasRenderingContext2D.prototype.drawImage).toBe(originalCanvasDrawImage);
  });
});
