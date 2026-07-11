import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertPerformanceController,
  installPerformanceControlProbe,
  readPerformanceControlProbe,
  readPerformanceDiagnostics,
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
    await removePerformanceControlProbe(page);
    expect(windowTarget['prismgbPerformanceControlProbe']).toBeUndefined();
    expect(windowTarget[Symbol.for('prismgb.performance.controlProbe')]).toBeUndefined();
  });

  it('passes the marker-bound launch ID into the renderer diagnostics reader', async () => {
    const diagnostics = { source: { sourceOpportunities: 1 } };
    const reader = vi.fn(() => diagnostics);
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
    expect(reader).toHaveBeenCalledWith('launch-id');
  });
});
