import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  armPerformanceCallbackWindow,
  assertPerformanceController,
  armExternalPerformanceSentinelWindow,
  createExternalPerformanceExecutionId,
  installExternalPerformanceSentinelGate,
  installPerformanceControlProbe,
  pausePerformanceCallbacks,
  pausePerformanceCallbacksAt,
  pauseExternalPerformanceSentinelCallbacks,
  readPerformanceCallbackGate,
  readElectronRendererProcessId,
  readExternalPerformanceSentinelGate,
  readPerformanceControlProbe,
  readPerformanceDiagnostics,
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
        acknowledgements: [{ kind: 'worker-frame-acknowledged', tagged: false }],
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
