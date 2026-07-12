import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  armPerformanceCallbackWindow,
  assertPerformanceController,
  installPerformanceControlProbe,
  pausePerformanceCallbacks,
  pausePerformanceCallbacksAt,
  readPerformanceCallbackGate,
  readPerformanceControlProbe,
  readPerformanceDiagnostics,
  removePerformanceCallbackGate,
  resetPerformanceControlProbe,
  resetPerformanceDiagnostics,
  resumePerformanceCallbacks,
  removePerformanceControlProbe
} from '../../e2e/helpers/gpu-performance-baseline.helper.js';

const controllerSymbol = Symbol.for('prismgb.performance.measurementController');
const originalControllerDescriptor = Object.getOwnPropertyDescriptor(globalThis, controllerSymbol);
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');

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
});
