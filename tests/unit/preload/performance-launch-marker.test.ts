import { describe, expect, it, vi } from 'vitest';
import {
  PERFORMANCE_LAUNCH_MARKER_BRIDGE_KEY,
  exposePerformanceLaunchMarker,
  installPreloadPerformanceLaunchMarker,
  parsePreloadPerformanceLaunchMarker,
  readPreloadPerformanceLaunchMarker
} from '../../../src/preload/performance-launch-marker.js';

const LAUNCH_ID = '3b36b7b0-9111-4e8e-8e51-d279d8c26166';
const MARKER_ARGUMENT = `--prismgb-performance-launch-id=${LAUNCH_ID}`;
const MEASUREMENT_ENV = {
  PRISMGB_PERF_MEASUREMENT: '1',
  PRISMGB_PERF_LAUNCH_ID: LAUNCH_ID
};

describe('preload performance launch marker', () => {
  it('parses one UUID carrier and rejects invalid carrier cardinality', () => {
    expect(parsePreloadPerformanceLaunchMarker([MARKER_ARGUMENT])).toBe(LAUNCH_ID);
    expect(() => parsePreloadPerformanceLaunchMarker([])).toThrow();
    expect(() => parsePreloadPerformanceLaunchMarker([MARKER_ARGUMENT, MARKER_ARGUMENT])).toThrow();
    expect(() => parsePreloadPerformanceLaunchMarker(['--prismgb-performance-launch-id=not-a-uuid'])).toThrow();
  });

  it('validates the preload argv marker against the measurement environment', () => {
    expect(readPreloadPerformanceLaunchMarker([MARKER_ARGUMENT], MEASUREMENT_ENV)).toBe(LAUNCH_ID);
    expect(readPreloadPerformanceLaunchMarker([], {})).toBeNull();
    expect(() => readPreloadPerformanceLaunchMarker([MARKER_ARGUMENT], {
      ...MEASUREMENT_ENV,
      PRISMGB_PERF_LAUNCH_ID: '9f03b141-e7aa-4ea7-bd64-aa00a80e3ab3'
    })).toThrow(/must match/);
  });

  it('exposes a frozen read-only marker through the injected bridge', () => {
    const contextBridge = { exposeInMainWorld: vi.fn() };

    expect(installPreloadPerformanceLaunchMarker(contextBridge, [MARKER_ARGUMENT], MEASUREMENT_ENV)).toBe(LAUNCH_ID);
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledTimes(1);

    const [key, exposedMarker] = contextBridge.exposeInMainWorld.mock.calls[0] as [string, { launchId: string }];
    expect(key).toBe(PERFORMANCE_LAUNCH_MARKER_BRIDGE_KEY);
    expect(exposedMarker.launchId).toBe(LAUNCH_ID);
    expect(Object.isFrozen(exposedMarker)).toBe(true);
    expect(Object.getOwnPropertyDescriptor(exposedMarker, 'launchId')?.writable).toBe(false);

    expect(exposePerformanceLaunchMarker(contextBridge, LAUNCH_ID).launchId).toBe(LAUNCH_ID);
  });
});
