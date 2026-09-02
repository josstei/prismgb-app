import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BrowserCapabilityProbeResult } from '@platform/gpu';

const measurementModule = vi.hoisted(() => ({
  imports: vi.fn(),
  probeBrowserGpuCapabilities: vi.fn()
}));

vi.mock('../../../../src/platform/gpu/infrastructure/capabilities.measurement.browser', () => {
  measurementModule.imports();
  return {
    probeBrowserGpuCapabilities: measurementModule.probeBrowserGpuCapabilities
  };
});

function installMeasurementLaunchMarker(): void {
  Object.defineProperty(window, 'prismgbPerformanceLaunchMarker', {
    configurable: true,
    value: Object.freeze({ launchId: '3b36b7b0-9111-4e8e-8e51-d279d8c26166' })
  });
}

afterEach(() => {
  Reflect.deleteProperty(window, 'prismgbPerformanceLaunchMarker');
  measurementModule.imports.mockReset();
  measurementModule.probeBrowserGpuCapabilities.mockReset();
  vi.resetModules();
});

describe('GPU runtime measurement capability probe', () => {
  it('does not import or probe when the validated preload marker is absent', async () => {
    const runtime = await import('@platform/gpu/runtime');

    await expect(runtime.probeBrowserGpuCapabilitiesForMeasurement()).resolves.toBeNull();
    expect(measurementModule.imports).not.toHaveBeenCalled();
    expect(measurementModule.probeBrowserGpuCapabilities).not.toHaveBeenCalled();
  });

  it('probes once behind the marker and preserves explicit capability discriminants', async () => {
    const probeResult: BrowserCapabilityProbeResult = {
      webgpu: {
        status: 'adapter-error',
        error: { name: 'Error', message: 'adapter failed' }
      },
      transferControlToOffscreen: {
        status: 'unexpected-error',
        error: { name: 'Error', message: 'transfer failed' }
      }
    };
    measurementModule.probeBrowserGpuCapabilities.mockResolvedValue(probeResult);
    installMeasurementLaunchMarker();

    const runtime = await import('@platform/gpu/runtime');

    await expect(runtime.probeBrowserGpuCapabilitiesForMeasurement()).resolves.toEqual(probeResult);
    expect(measurementModule.imports).toHaveBeenCalledTimes(1);
    expect(measurementModule.probeBrowserGpuCapabilities).toHaveBeenCalledTimes(1);
  });
});
