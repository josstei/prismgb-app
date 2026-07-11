export const PERFORMANCE_MEASUREMENT_ENV = 'PRISMGB_PERF_MEASUREMENT';
export const PERFORMANCE_LAUNCH_ID_ENV = 'PRISMGB_PERF_LAUNCH_ID';
export const PERFORMANCE_E2E_DIAGNOSTICS_ENV = 'PRISMGB_E2E_DIAGNOSTICS';
export const PERFORMANCE_LAUNCH_ID_ARGUMENT_PREFIX = '--prismgb-performance-launch-id=';
export const PERFORMANCE_DIAGNOSTICS_QUERY_KEY = 'prismgb-e2e-diagnostics';

export type PerformanceLaunchMarkerEnvironment = Readonly<Record<string, string | undefined>>;
export type PerformanceLaunchMarkerApp = object;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const installedLaunchIds = new WeakMap<PerformanceLaunchMarkerApp, string>();

function normalizeLaunchId(value: string, carrier: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${carrier} must be an RFC 4122 UUID`);
  }

  return value.toLowerCase();
}

export function parsePerformanceLaunchMarker(argv: readonly string[]): string {
  const markerArguments = argv.filter((argument) => argument.startsWith(PERFORMANCE_LAUNCH_ID_ARGUMENT_PREFIX));

  if (markerArguments.length === 0) {
    throw new Error(`Missing ${PERFORMANCE_LAUNCH_ID_ARGUMENT_PREFIX}<uuid> argument`);
  }

  if (markerArguments.length !== 1) {
    throw new Error(`Expected exactly one ${PERFORMANCE_LAUNCH_ID_ARGUMENT_PREFIX}<uuid> argument`);
  }

  return normalizeLaunchId(
    markerArguments[0].slice(PERFORMANCE_LAUNCH_ID_ARGUMENT_PREFIX.length),
    'Performance launch argument'
  );
}

export function parsePerformanceLaunchMarkerEnvironment(
  environment: PerformanceLaunchMarkerEnvironment
): string {
  const launchId = environment[PERFORMANCE_LAUNCH_ID_ENV];

  if (launchId === undefined) {
    throw new Error(`Missing ${PERFORMANCE_LAUNCH_ID_ENV} environment marker`);
  }

  return normalizeLaunchId(launchId, `${PERFORMANCE_LAUNCH_ID_ENV} environment marker`);
}

export function readPerformanceLaunchMarker(
  argv: readonly string[],
  environment: PerformanceLaunchMarkerEnvironment
): string | null {
  if (environment[PERFORMANCE_MEASUREMENT_ENV] !== '1') {
    return null;
  }

  const argvLaunchId = parsePerformanceLaunchMarker(argv);
  const environmentLaunchId = parsePerformanceLaunchMarkerEnvironment(environment);

  if (argvLaunchId !== environmentLaunchId) {
    throw new Error('Performance launch argument and environment marker must match');
  }

  return argvLaunchId;
}

export function installPerformanceLaunchMarker(
  app: PerformanceLaunchMarkerApp,
  argv: readonly string[],
  environment: PerformanceLaunchMarkerEnvironment
): string | null {
  const launchId = readPerformanceLaunchMarker(argv, environment);

  if (launchId === null) {
    installedLaunchIds.delete(app);
    return null;
  }

  const installedLaunchId = installedLaunchIds.get(app);
  if (installedLaunchId !== undefined && installedLaunchId !== launchId) {
    throw new Error('Performance launch marker cannot be replaced for an installed app');
  }

  installedLaunchIds.set(app, launchId);
  return launchId;
}

export function getInstalledPerformanceLaunchMarker(app: PerformanceLaunchMarkerApp): string | null {
  return installedLaunchIds.get(app) ?? null;
}

export function shouldInstallPerformanceDiagnostics(
  launchId: string | null,
  instrumentationEnabled: boolean,
  environment: PerformanceLaunchMarkerEnvironment
): boolean {
  if (typeof instrumentationEnabled !== 'boolean') {
    throw new TypeError('Performance diagnostics instrumentation state must be boolean');
  }

  return instrumentationEnabled && launchId !== null && environment[PERFORMANCE_E2E_DIAGNOSTICS_ENV] === '1';
}
