export const PERFORMANCE_MEASUREMENT_ENV = 'PRISMGB_PERF_MEASUREMENT';
export const PERFORMANCE_LAUNCH_ID_ENV = 'PRISMGB_PERF_LAUNCH_ID';
export const PERFORMANCE_LAUNCH_ID_ARGUMENT_PREFIX = '--prismgb-performance-launch-id=';
export const PERFORMANCE_LAUNCH_MARKER_BRIDGE_KEY = 'prismgbPerformanceLaunchMarker';

export type PerformanceLaunchMarkerEnvironment = Readonly<Record<string, string | undefined>>;

export interface ContextBridgeLike {
  exposeInMainWorld(key: string, api: unknown): void;
}

export type RendererPerformanceLaunchMarker = Readonly<{
  launchId: string;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeLaunchId(value: string, carrier: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${carrier} must be an RFC 4122 UUID`);
  }

  return value.toLowerCase();
}

export function parsePreloadPerformanceLaunchMarker(argv: readonly string[]): string {
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

export function readPreloadPerformanceLaunchMarker(
  argv: readonly string[],
  environment: PerformanceLaunchMarkerEnvironment
): string | null {
  if (environment[PERFORMANCE_MEASUREMENT_ENV] !== '1') {
    return null;
  }

  const argvLaunchId = parsePreloadPerformanceLaunchMarker(argv);
  const environmentLaunchId = environment[PERFORMANCE_LAUNCH_ID_ENV];

  if (environmentLaunchId === undefined) {
    throw new Error(`Missing ${PERFORMANCE_LAUNCH_ID_ENV} environment marker`);
  }

  if (argvLaunchId !== normalizeLaunchId(environmentLaunchId, `${PERFORMANCE_LAUNCH_ID_ENV} environment marker`)) {
    throw new Error('Performance launch argument and environment marker must match');
  }

  return argvLaunchId;
}

export function exposePerformanceLaunchMarker(
  contextBridge: ContextBridgeLike,
  launchId: string
): RendererPerformanceLaunchMarker {
  const marker = Object.freeze({
    launchId: normalizeLaunchId(launchId, 'Performance launch marker')
  });

  contextBridge.exposeInMainWorld(PERFORMANCE_LAUNCH_MARKER_BRIDGE_KEY, marker);
  return marker;
}

export function installPreloadPerformanceLaunchMarker(
  contextBridge: ContextBridgeLike,
  argv: readonly string[],
  environment: PerformanceLaunchMarkerEnvironment
): string | null {
  const launchId = readPreloadPerformanceLaunchMarker(argv, environment);

  if (launchId !== null) {
    exposePerformanceLaunchMarker(contextBridge, launchId);
  }

  return launchId;
}
