import { describe, expect, it } from 'vitest';
import {
  getInstalledPerformanceLaunchMarker,
  installPerformanceLaunchMarker,
  parsePerformanceLaunchMarker,
  readPerformanceLaunchMarker,
  shouldInstallPerformanceDiagnostics
} from '@main/infrastructure/diagnostics/performance-launch-marker.js';

const LAUNCH_ID = '3b36b7b0-9111-4e8e-8e51-d279d8c26166';
const MARKER_ARGUMENT = `--prismgb-performance-launch-id=${LAUNCH_ID}`;
const MEASUREMENT_ENV = {
  PRISMGB_PERF_MEASUREMENT: '1',
  PRISMGB_PERF_LAUNCH_ID: LAUNCH_ID
};

describe('performance launch marker', () => {
  it('does not read or install a marker outside measurement mode', () => {
    const app = {};

    expect(readPerformanceLaunchMarker(['--prismgb-performance-launch-id=not-a-uuid'], {})).toBeNull();
    expect(installPerformanceLaunchMarker(app, ['--prismgb-performance-launch-id=not-a-uuid'], {})).toBeNull();
    expect(getInstalledPerformanceLaunchMarker(app)).toBeNull();
  });

  it('parses, validates, and installs one matching UUID marker', () => {
    const app = {};

    expect(parsePerformanceLaunchMarker([MARKER_ARGUMENT])).toBe(LAUNCH_ID);
    expect(installPerformanceLaunchMarker(app, [MARKER_ARGUMENT], MEASUREMENT_ENV)).toBe(LAUNCH_ID);
    expect(getInstalledPerformanceLaunchMarker(app)).toBe(LAUNCH_ID);
  });

  it.each([
    ['missing', []],
    ['duplicate', [MARKER_ARGUMENT, MARKER_ARGUMENT]],
    ['malformed', ['--prismgb-performance-launch-id=not-a-uuid']]
  ])('rejects a %s marker argument in measurement mode', (_label, argv) => {
    expect(() => readPerformanceLaunchMarker(argv, MEASUREMENT_ENV)).toThrow();
  });

  it('rejects an argv and environment marker mismatch', () => {
    expect(() => readPerformanceLaunchMarker([MARKER_ARGUMENT], {
      ...MEASUREMENT_ENV,
      PRISMGB_PERF_LAUNCH_ID: '9f03b141-e7aa-4ea7-bd64-aa00a80e3ab3'
    })).toThrow(/must match/);
  });

  it('requires an instrumented measurement launch and explicit diagnostics environment marker', () => {
    expect(shouldInstallPerformanceDiagnostics(LAUNCH_ID, true, {
      ...MEASUREMENT_ENV,
      PRISMGB_E2E_DIAGNOSTICS: '1'
    })).toBe(true);
    expect(shouldInstallPerformanceDiagnostics(LAUNCH_ID, true, MEASUREMENT_ENV)).toBe(false);
    expect(shouldInstallPerformanceDiagnostics(LAUNCH_ID, false, {
      ...MEASUREMENT_ENV,
      PRISMGB_E2E_DIAGNOSTICS: '1'
    })).toBe(false);
    expect(shouldInstallPerformanceDiagnostics(null, true, {
      ...MEASUREMENT_ENV,
      PRISMGB_E2E_DIAGNOSTICS: '1'
    })).toBe(false);
  });
});
