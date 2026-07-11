import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertPerformanceController } from '../../e2e/helpers/gpu-performance-baseline.helper.js';

const controllerSymbol = Symbol.for('prismgb.performance.measurementController');
const originalControllerDescriptor = Object.getOwnPropertyDescriptor(globalThis, controllerSymbol);

afterEach(() => {
  if (originalControllerDescriptor) {
    Object.defineProperty(globalThis, controllerSymbol, originalControllerDescriptor);
    return;
  }
  Reflect.deleteProperty(globalThis, controllerSymbol);
});

describe('GPU performance baseline helper', () => {
  it('evaluates the measurement controller in the Electron main global context', async () => {
    const assertLaunchId = vi.fn();
    Object.defineProperty(globalThis, controllerSymbol, {
      configurable: true,
      value: { assertLaunchId }
    });
    const electronApp = {
      evaluate: async (callback: (expectedLaunchId: string) => { mainPid: number }, expectedLaunchId: string) => callback(expectedLaunchId)
    };

    await expect(assertPerformanceController(electronApp, 'launch-id')).resolves.toEqual({ mainPid: process.pid });
    expect(assertLaunchId).toHaveBeenCalledWith('launch-id');
  });
});
