/**
 * Bounded, harness-only renderer performance diagnostics.
 *
 * This adapter retains raw observations for later evidence construction. It
 * deliberately does not decide evidence acceptance, hardware qualification,
 * or allocation coverage.
 */

export const PERFORMANCE_DIAGNOSTIC_BACKENDS = ['canvas2d', 'webgpu'] as const;
export type PerformanceDiagnosticBackend = typeof PERFORMANCE_DIAGNOSTIC_BACKENDS[number];

export const PERFORMANCE_BACKEND_SELECTION_REASONS = [
  'requested-canvas2d',
  'performance-mode-canvas2d',
  'webgpu-api-unavailable',
  'webgpu-adapter-unavailable',
  'transfer-api-unavailable',
  'transfer-method-unavailable',
  'transfer-allowlisted-not-supported',
  'webgpu-selected',
  'fatal-detector-reason'
] as const;
export type PerformanceBackendSelectionReason = typeof PERFORMANCE_BACKEND_SELECTION_REASONS[number];

export const PERFORMANCE_BACKEND_UNAVAILABLE_REASONS = [
  'renderer-session-not-observed',
  'renderer-session-failed'
] as const;
export type PerformanceBackendUnavailableReason = typeof PERFORMANCE_BACKEND_UNAVAILABLE_REASONS[number];

export const PERFORMANCE_WINDOW_BOUNDARY_KINDS = [
  'warmup-start',
  'warmup-end',
  'sampling-window-start',
  'sampling-window-end'
] as const;
export type PerformanceWindowBoundaryKind = typeof PERFORMANCE_WINDOW_BOUNDARY_KINDS[number];

export const PERFORMANCE_SHUTDOWN_BOUNDARIES = [
  'before-release',
  'release-dispatched'
] as const;
export type PerformanceShutdownBoundary = typeof PERFORMANCE_SHUTDOWN_BOUNDARIES[number];

export const PERFORMANCE_SOURCE_DISPOSITIONS = [
  'duplicateMediaTime',
  'noCurrentData',
  'backpressure',
  'sessionInactive',
  'workerNotReady',
  'bitmapCreationFailed',
  'enqueueFailed',
  'drawCompleted',
  'driverInactive',
  'driverFailed',
  'workerFrameSubmitted'
] as const;
export type PerformanceSourceDisposition = typeof PERFORMANCE_SOURCE_DISPOSITIONS[number];

export const PERFORMANCE_TIMING_METRIC_IDS = [
  'source-callback',
  'canvas-draw-call',
  'webgpu-bitmap-creation',
  'webgpu-worker-render',
  'webgpu-worker-queue-submit',
  'webgpu-enqueue-to-ack'
] as const;
export type PerformanceTimingMetricId = typeof PERFORMANCE_TIMING_METRIC_IDS[number];

export const PERFORMANCE_TIMING_CLOCKS = [
  'renderer-performance-now-v1',
  'worker-performance-now-v1',
  'external-monotonic-v1'
] as const;
export type PerformanceTimingClock = typeof PERFORMANCE_TIMING_CLOCKS[number];

export const PERFORMANCE_TIMING_OUTCOMES = [
  'source-callback-observed',
  'canvas-draw-completed',
  'bitmap-created',
  'webgpu-worker-rendered',
  'webgpu-queue-submit-completed',
  'enqueue-acknowledged'
] as const;
export type PerformanceTimingOutcome = typeof PERFORMANCE_TIMING_OUTCOMES[number];

export const WEBGPU_ALLOCATION_REQUEST_OPERATION_IDS = [
  'video-frame-image-bitmap-request',
  'uniform-float32-array',
  'gpu-buffer-request',
  'gpu-texture-request',
  'bind-group-create',
  'render-pass-plan-materialization'
] as const;
export type WebGpuAllocationRequestOperationId = typeof WEBGPU_ALLOCATION_REQUEST_OPERATION_IDS[number];

export const WEBGPU_ALLOCATION_REQUEST_SOURCE_LOCATION_IDS = [
  'video-session:create-image-bitmap',
  'webgpu-driver:uniform-float32-array',
  'webgpu-driver:create-buffer',
  'webgpu-driver:create-texture',
  'webgpu-driver:create-bind-group',
  'webgpu-driver:materialize-render-plan'
] as const;
export type WebGpuAllocationRequestSourceLocationId = typeof WEBGPU_ALLOCATION_REQUEST_SOURCE_LOCATION_IDS[number];

export const WEBGPU_ALLOCATION_REQUEST_BYTE_KINDS = [
  'rgba-transfer-footprint',
  'requested-byte-length',
  'descriptor-size',
  'logical-texel-footprint',
  'count-only-unavailable'
] as const;
export type WebGpuAllocationRequestByteKind = typeof WEBGPU_ALLOCATION_REQUEST_BYTE_KINDS[number];

export const RENDERER_HEAP_UNAVAILABLE_REASONS = [
  'not-collected',
  'performance-memory-unavailable',
  'renderer-process-unavailable',
  'measurement-disabled'
] as const;
export type RendererHeapUnavailableReason = typeof RENDERER_HEAP_UNAVAILABLE_REASONS[number];

export interface PerformanceDiagnosticsOptions {
  readonly maxSamplesPerKind?: number;
}

export interface PerformanceDiagnosticsResetOptions {
  readonly lastSourceSequence?: number;
}

export interface PerformanceBackendObservationInput {
  readonly requestedBackend: PerformanceDiagnosticBackend;
  readonly selectedBackend: PerformanceDiagnosticBackend;
  readonly observedBackend: PerformanceDiagnosticBackend | null;
  readonly observedBackendUnavailableReason: PerformanceBackendUnavailableReason | null;
  readonly selectionReason: PerformanceBackendSelectionReason;
  readonly fallbackReason: PerformanceBackendSelectionReason | null;
  readonly adapter?: {
    readonly identity: string | null;
    readonly isFallbackAdapter: boolean;
  };
}

export interface PerformanceWindowBoundaryInput {
  readonly kind: PerformanceWindowBoundaryKind;
  readonly measurementEpochId: string;
  readonly at: number;
}

export interface PerformanceShutdownBoundaryInput {
  readonly launchId: string;
  readonly boundary: PerformanceShutdownBoundary;
}

export interface PerformancePipelineReadyInput {
  readonly backend: PerformanceDiagnosticBackend;
}

export interface PerformancePipelineErrorInput {
  readonly message: string;
  readonly code: string | null;
}

export interface PerformanceRenderStatsInput {
  readonly fps: number | null;
  readonly frameTime: number | null;
  readonly gpuTime: number | null;
  readonly uploadTime: number | null;
}

export interface PerformanceSourceOpportunityInput {
  readonly sourceSequence: number;
  readonly disposition: PerformanceSourceDisposition;
}

export interface PerformancePendingCountInput {
  readonly boundary: 'observation-start' | 'observation-end';
  readonly count: number;
}

export interface PerformanceWorkerAcknowledgementInput {
  readonly outcome: 'queueSubmitCompleted' | 'driverInactive' | 'driverFailed';
}

export interface PerformanceTimingSampleInput {
  readonly measurementEpochId: string;
  readonly sourceSequence: number;
  readonly firstSourceSequence: number;
  readonly lastSourceSequence: number;
  readonly frameToken: number | null;
  readonly metricId: PerformanceTimingMetricId;
  readonly unit: 'milliseconds';
  readonly clock: PerformanceTimingClock;
  readonly outcome: PerformanceTimingOutcome;
  readonly startedAt: number;
  readonly endedAt: number;
}

type AllocationRequestValue =
  | {
    readonly byteKind: 'rgba-transfer-footprint';
    readonly byteValue: number;
    readonly sourceWidth: number;
    readonly sourceHeight: number;
  }
  | {
    readonly byteKind: 'requested-byte-length';
    readonly byteValue: number;
    readonly requestedByteLength: number;
  }
  | {
    readonly byteKind: 'descriptor-size';
    readonly byteValue: number;
    readonly descriptorSize: number;
  }
  | {
    readonly byteKind: 'logical-texel-footprint';
    readonly byteValue: number;
    readonly textureDescriptor: {
      readonly width: number;
      readonly height: number;
      readonly depth: number;
      readonly format: string;
      readonly usage: string;
      readonly logicalTexelFootprint: number;
    };
  }
  | {
    readonly byteKind: 'count-only-unavailable';
    readonly byteValue: null;
  };

type AllocationRequestCommon = {
  readonly backend: 'webgpu';
  readonly operationId: WebGpuAllocationRequestOperationId;
  readonly sourceLocationId: WebGpuAllocationRequestSourceLocationId;
  readonly requestOrdinal: number;
  readonly outcome: 'success' | 'failed';
};

export type WebGpuAllocationRequestProxyInput =
  | (AllocationRequestCommon & AllocationRequestValue & {
    readonly carrier: 'frame-request';
    readonly measurementWindowId: string;
    readonly measurementEpochId: string;
    readonly sourceSequence: number;
    readonly diagnosticFrameId: number;
    readonly frameToken: number | null;
  })
  | (AllocationRequestCommon & AllocationRequestValue & {
    readonly carrier: 'lifecycle-request';
    readonly executionId: string;
    readonly lifecyclePhase: 'startup' | 'warmup' | 'resize';
    readonly phaseSequence: number;
  });

export interface RendererHeapObservationInput {
  readonly observationId: string;
  readonly observedAt: number;
  readonly usedBytes: number;
}

export type PerformanceDiagnosticsRejectionReason =
  | 'invalid-input'
  | 'duplicate-sample'
  | 'buffer-full'
  | 'already-recorded'
  | 'out-of-order-boundary'
  | 'non-contiguous-source-sequence'
  | 'heap-state-already-recorded';

export type PerformanceDiagnosticsRecordResult =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly reason: PerformanceDiagnosticsRejectionReason };

export interface PerformanceDistributionSnapshot {
  readonly availability: 'available' | 'unavailable';
  readonly unavailableReason: 'no-raw-samples' | null;
  readonly sampleCount: number;
  readonly p50: number | null;
  readonly p95: number | null;
  readonly p99: number | null;
}

export interface PerformanceDiagnosticsSnapshot {
  readonly maxSamplesPerKind: number;
  readonly backend: {
    readonly availability: 'observed' | 'unavailable';
    readonly unavailableReason: 'backend-not-recorded' | null;
    readonly requestedBackend: PerformanceDiagnosticBackend | null;
    readonly selectedBackend: PerformanceDiagnosticBackend | null;
    readonly observedBackend: PerformanceDiagnosticBackend | null;
    readonly observedBackendUnavailableReason: PerformanceBackendUnavailableReason | null;
    readonly selectionReason: PerformanceBackendSelectionReason | null;
    readonly fallbackReason: PerformanceBackendSelectionReason | null;
    readonly adapter: {
      readonly availability: 'observed' | 'unavailable';
      readonly unavailableReason: 'adapter-not-observed' | null;
      readonly identity: string | null;
      readonly isFallbackAdapter: boolean | null;
    };
  };
  readonly windows: {
    readonly warmup: {
      readonly start: PerformanceWindowBoundarySnapshot;
      readonly end: PerformanceWindowBoundarySnapshot;
    };
    readonly sampling: {
      readonly start: PerformanceWindowBoundarySnapshot;
      readonly end: PerformanceWindowBoundarySnapshot;
    };
  };
  readonly shutdown: {
    readonly beforeRelease: PerformanceShutdownBoundarySnapshot;
    readonly releaseDispatched: PerformanceShutdownBoundarySnapshot;
  };
  readonly pipeline: {
    readonly ready: {
      readonly availability: 'observed' | 'unavailable';
      readonly unavailableReason: 'not-recorded' | null;
      readonly backends: readonly PerformanceDiagnosticBackend[];
    };
    readonly errors: readonly PerformancePipelineErrorInput[];
    readonly renderStats: readonly PerformanceRenderStatsInput[];
    readonly renderStatDistributions: {
      readonly fps: PerformanceDistributionSnapshot;
      readonly frameTime: PerformanceDistributionSnapshot;
      readonly gpuTime: PerformanceDistributionSnapshot;
      readonly uploadTime: PerformanceDistributionSnapshot;
    };
  };
  readonly source: {
    readonly sourceOpportunities: number;
    readonly measuredDrops: {
      readonly duplicateMediaTime: number;
      readonly noCurrentData: number;
      readonly backpressure: number;
      readonly total: number;
    };
    readonly fatalDispositions: {
      readonly sessionInactive: number;
      readonly workerNotReady: number;
      readonly bitmapCreationFailed: number;
      readonly enqueueFailed: number;
      readonly total: number;
    };
    readonly canvas: {
      readonly attempts: number;
      readonly drawCompleted: number;
      readonly driverInactive: number;
      readonly driverFailed: number;
    };
    readonly workerFramesSubmitted: number;
    readonly backendSuccesses: {
      readonly availability: 'available' | 'unavailable';
      readonly unavailableReason: 'observed-backend-not-recorded' | null;
      readonly backend: PerformanceDiagnosticBackend | null;
      readonly count: number | null;
    };
    readonly reconciliation: {
      readonly accountedOpportunities: number;
      readonly isConserved: boolean;
    };
  };
  readonly worker: {
    readonly submissions: number;
    readonly acknowledgements: number;
    readonly terminalErrors: number;
    readonly outcomes: {
      readonly queueSubmitCompleted: number;
      readonly driverInactive: number;
      readonly driverFailed: number;
    };
  };
  readonly pendingCounts: {
    readonly observationStart: PerformancePendingValueSnapshot;
    readonly observationEnd: PerformancePendingValueSnapshot;
    readonly reconciliation: {
      readonly availability: 'available' | 'unavailable';
      readonly unavailableReason: 'pending-boundary-not-recorded' | null;
      readonly expectedEnd: number | null;
      readonly matchesObservedEnd: boolean | null;
    };
  };
  readonly timingSamples: Readonly<Record<PerformanceTimingMetricId, readonly PerformanceTimingSampleInput[]>>;
  readonly timingDistributions: Readonly<Record<PerformanceTimingMetricId, PerformanceDistributionSnapshot>>;
  readonly allocationRequestProxies: {
    readonly availability: 'observed' | 'unavailable';
    readonly unavailableReason: 'no-proxy-rows-recorded' | null;
    readonly frameRequests: readonly WebGpuAllocationRequestProxyInput[];
    readonly lifecycleRequests: readonly WebGpuAllocationRequestProxyInput[];
  };
  readonly rendererHeap: {
    readonly availability: 'available' | 'unavailable';
    readonly unavailableReason: RendererHeapUnavailableReason | null;
    readonly observations: readonly RendererHeapObservationInput[];
    readonly distribution: PerformanceDistributionSnapshot;
  };
}

export interface PerformanceWindowBoundarySnapshot {
  readonly availability: 'observed' | 'unavailable';
  readonly unavailableReason: 'not-recorded' | null;
  readonly measurementEpochId: string | null;
  readonly at: number | null;
}

export interface PerformanceShutdownBoundarySnapshot {
  readonly availability: 'observed' | 'unavailable';
  readonly unavailableReason: 'not-recorded' | null;
  readonly launchId: string | null;
}

export interface PerformancePendingValueSnapshot {
  readonly availability: 'observed' | 'unavailable';
  readonly unavailableReason: 'not-recorded' | null;
  readonly count: number | null;
}

type MutableSourceCounters = {
  sourceOpportunities: number;
  duplicateMediaTime: number;
  noCurrentData: number;
  backpressure: number;
  sessionInactive: number;
  workerNotReady: number;
  bitmapCreationFailed: number;
  enqueueFailed: number;
  drawCompleted: number;
  driverInactive: number;
  driverFailed: number;
  workerFramesSubmitted: number;
};

type MutableWorkerCounters = {
  submissions: number;
  acknowledgements: number;
  terminalErrors: number;
  queueSubmitCompleted: number;
  driverInactive: number;
  driverFailed: number;
};

const DEFAULT_MAX_SAMPLES_PER_KIND = 2_048;
const MAX_SAMPLES_PER_KIND = 10_000;
const ADAPTER_IDENTITY_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,95})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === expectedKeys.length && actualKeys.every((key) => expectedKeys.includes(key));
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function isSafeIntegerAtLeast(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

function isFiniteNumberAtLeast(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum;
}

function isSafeIdentifier(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    !value.includes(String.fromCharCode(0)) &&
    !value.includes('\r') &&
    !value.includes('\n');
}

function isNullablePositiveToken(value: unknown): value is number | null {
  return value === null || isSafeIntegerAtLeast(value, 1);
}

function accepted(): PerformanceDiagnosticsRecordResult {
  return { accepted: true };
}

function rejected(reason: PerformanceDiagnosticsRejectionReason): PerformanceDiagnosticsRecordResult {
  return { accepted: false, reason };
}

function createSourceCounters(): MutableSourceCounters {
  return {
    sourceOpportunities: 0,
    duplicateMediaTime: 0,
    noCurrentData: 0,
    backpressure: 0,
    sessionInactive: 0,
    workerNotReady: 0,
    bitmapCreationFailed: 0,
    enqueueFailed: 0,
    drawCompleted: 0,
    driverInactive: 0,
    driverFailed: 0,
    workerFramesSubmitted: 0
  };
}

function createWorkerCounters(): MutableWorkerCounters {
  return {
    submissions: 0,
    acknowledgements: 0,
    terminalErrors: 0,
    queueSubmitCompleted: 0,
    driverInactive: 0,
    driverFailed: 0
  };
}

function createTimingRecord<T>(createValue: () => T): Record<PerformanceTimingMetricId, T> {
  return {
    'source-callback': createValue(),
    'canvas-draw-call': createValue(),
    'webgpu-bitmap-creation': createValue(),
    'webgpu-worker-render': createValue(),
    'webgpu-worker-queue-submit': createValue(),
    'webgpu-enqueue-to-ack': createValue()
  };
}

function timingSampleKey(sample: PerformanceTimingSampleInput): string {
  return [sample.measurementEpochId, sample.sourceSequence, sample.metricId].join('\u0000');
}

function allocationRequestProxyKey(row: WebGpuAllocationRequestProxyInput): string {
  if (row.carrier === 'frame-request') {
    return [
      row.measurementEpochId,
      row.sourceSequence,
      row.requestOrdinal
    ].join('\u0000');
  }

  return [
    row.executionId,
    row.lifecyclePhase,
    row.phaseSequence,
    row.operationId,
    row.sourceLocationId,
    row.requestOrdinal
  ].join('\u0000');
}

function nearestRank(values: readonly number[], percentile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1);
  return sorted[index];
}

function distribution(values: readonly number[]): PerformanceDistributionSnapshot {
  if (values.length === 0) {
    return {
      availability: 'unavailable',
      unavailableReason: 'no-raw-samples',
      sampleCount: 0,
      p50: null,
      p95: null,
      p99: null
    };
  }

  return {
    availability: 'available',
    unavailableReason: null,
    sampleCount: values.length,
    p50: nearestRank(values, 0.5),
    p95: nearestRank(values, 0.95),
    p99: nearestRank(values, 0.99)
  };
}

function cloneTimingSample(sample: PerformanceTimingSampleInput): PerformanceTimingSampleInput {
  return { ...sample };
}

function cloneAllocationRequestProxy(
  row: WebGpuAllocationRequestProxyInput
): WebGpuAllocationRequestProxyInput {
  if (row.byteKind === 'logical-texel-footprint') {
    return {
      ...row,
      textureDescriptor: { ...row.textureDescriptor }
    };
  }

  return { ...row };
}

function cloneRendererHeapObservation(
  observation: RendererHeapObservationInput
): RendererHeapObservationInput {
  return { ...observation };
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) {
      freezeDeep(child);
    }
    Object.freeze(value);
  }

  return value;
}

function isBackendObservationInput(value: unknown): value is PerformanceBackendObservationInput {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'requestedBackend',
    'selectedBackend',
    'observedBackend',
    'observedBackendUnavailableReason',
    'selectionReason',
    'fallbackReason',
    'adapter'
  ])) {
    return false;
  }

  if (
    !isOneOf(value.requestedBackend, PERFORMANCE_DIAGNOSTIC_BACKENDS) ||
    !isOneOf(value.selectedBackend, PERFORMANCE_DIAGNOSTIC_BACKENDS) ||
    !(value.observedBackend === null || isOneOf(value.observedBackend, PERFORMANCE_DIAGNOSTIC_BACKENDS)) ||
    !isOneOf(value.selectionReason, PERFORMANCE_BACKEND_SELECTION_REASONS) ||
    !(value.fallbackReason === null || isOneOf(value.fallbackReason, PERFORMANCE_BACKEND_SELECTION_REASONS))
  ) {
    return false;
  }

  if (value.observedBackend === null) {
    if (!isOneOf(value.observedBackendUnavailableReason, PERFORMANCE_BACKEND_UNAVAILABLE_REASONS)) {
      return false;
    }
  } else if (value.observedBackendUnavailableReason !== null) {
    return false;
  }

  if (value.adapter === undefined) {
    return true;
  }

  return isRecord(value.adapter) &&
    hasExactKeys(value.adapter, ['identity', 'isFallbackAdapter']) &&
    (value.adapter.identity === null || (
      typeof value.adapter.identity === 'string' && ADAPTER_IDENTITY_PATTERN.test(value.adapter.identity)
    )) &&
    typeof value.adapter.isFallbackAdapter === 'boolean';
}

function isWindowBoundaryInput(value: unknown): value is PerformanceWindowBoundaryInput {
  return isRecord(value) &&
    hasExactKeys(value, ['kind', 'measurementEpochId', 'at']) &&
    isOneOf(value.kind, PERFORMANCE_WINDOW_BOUNDARY_KINDS) &&
    isSafeIdentifier(value.measurementEpochId) &&
    isFiniteNumberAtLeast(value.at, 0);
}

function isShutdownBoundaryInput(value: unknown): value is PerformanceShutdownBoundaryInput {
  return isRecord(value) &&
    hasExactKeys(value, ['launchId', 'boundary']) &&
    isSafeIdentifier(value.launchId) &&
    isOneOf(value.boundary, PERFORMANCE_SHUTDOWN_BOUNDARIES);
}

function isNullableFiniteNumberAtLeast(value: unknown, minimum: number): value is number | null {
  return value === null || isFiniteNumberAtLeast(value, minimum);
}

function isPipelineReadyInput(value: unknown): value is PerformancePipelineReadyInput {
  return isRecord(value) &&
    hasExactKeys(value, ['backend']) &&
    isOneOf(value.backend, PERFORMANCE_DIAGNOSTIC_BACKENDS);
}

function isPipelineErrorInput(value: unknown): value is PerformancePipelineErrorInput {
  return isRecord(value) &&
    hasExactKeys(value, ['message', 'code']) &&
    typeof value.message === 'string' &&
    value.message.length > 0 &&
    value.message.length <= 512 &&
    !value.message.includes(String.fromCharCode(0)) &&
    !value.message.includes('\r') &&
    !value.message.includes('\n') &&
    (value.code === null || isSafeIdentifier(value.code));
}

function isRenderStatsInput(value: unknown): value is PerformanceRenderStatsInput {
  return isRecord(value) &&
    hasExactKeys(value, ['fps', 'frameTime', 'gpuTime', 'uploadTime']) &&
    isNullableFiniteNumberAtLeast(value.fps, 0) &&
    isNullableFiniteNumberAtLeast(value.frameTime, 0) &&
    isNullableFiniteNumberAtLeast(value.gpuTime, 0) &&
    isNullableFiniteNumberAtLeast(value.uploadTime, 0);
}

function isSourceOpportunityInput(value: unknown): value is PerformanceSourceOpportunityInput {
  return isRecord(value) &&
    hasExactKeys(value, ['sourceSequence', 'disposition']) &&
    isSafeIntegerAtLeast(value.sourceSequence, 1) &&
    isOneOf(value.disposition, PERFORMANCE_SOURCE_DISPOSITIONS);
}

function isPendingCountInput(value: unknown): value is PerformancePendingCountInput {
  return isRecord(value) &&
    hasExactKeys(value, ['boundary', 'count']) &&
    isOneOf(value.boundary, ['observation-start', 'observation-end'] as const) &&
    isSafeIntegerAtLeast(value.count, 0);
}

function isWorkerAcknowledgementInput(value: unknown): value is PerformanceWorkerAcknowledgementInput {
  return isRecord(value) &&
    hasExactKeys(value, ['outcome']) &&
    isOneOf(value.outcome, ['queueSubmitCompleted', 'driverInactive', 'driverFailed'] as const);
}

function isTimingSampleInput(value: unknown): value is PerformanceTimingSampleInput {
  if (!isRecord(value) || !hasExactKeys(value, [
    'measurementEpochId',
    'sourceSequence',
    'firstSourceSequence',
    'lastSourceSequence',
    'frameToken',
    'metricId',
    'unit',
    'clock',
    'outcome',
    'startedAt',
    'endedAt'
  ])) {
    return false;
  }

  return isSafeIdentifier(value.measurementEpochId) &&
    isSafeIntegerAtLeast(value.sourceSequence, 1) &&
    isSafeIntegerAtLeast(value.firstSourceSequence, 1) &&
    isSafeIntegerAtLeast(value.lastSourceSequence, value.firstSourceSequence as number) &&
    value.sourceSequence >= value.firstSourceSequence &&
    value.sourceSequence <= value.lastSourceSequence &&
    isNullablePositiveToken(value.frameToken) &&
    isOneOf(value.metricId, PERFORMANCE_TIMING_METRIC_IDS) &&
    value.unit === 'milliseconds' &&
    isOneOf(value.clock, PERFORMANCE_TIMING_CLOCKS) &&
    isOneOf(value.outcome, PERFORMANCE_TIMING_OUTCOMES) &&
    isFiniteNumberAtLeast(value.startedAt, 0) &&
    isFiniteNumberAtLeast(value.endedAt, value.startedAt as number);
}

function allocationValueKeys(byteKind: unknown): readonly string[] | null {
  switch (byteKind) {
    case 'rgba-transfer-footprint':
      return ['sourceWidth', 'sourceHeight'];
    case 'requested-byte-length':
      return ['requestedByteLength'];
    case 'descriptor-size':
      return ['descriptorSize'];
    case 'logical-texel-footprint':
      return ['textureDescriptor'];
    case 'count-only-unavailable':
      return [];
    default:
      return null;
  }
}

function isTextureDescriptor(value: unknown): boolean {
  return isRecord(value) &&
    hasExactKeys(value, ['width', 'height', 'depth', 'format', 'usage', 'logicalTexelFootprint']) &&
    isSafeIntegerAtLeast(value.width, 1) &&
    isSafeIntegerAtLeast(value.height, 1) &&
    isSafeIntegerAtLeast(value.depth, 1) &&
    isSafeIdentifier(value.format) &&
    isSafeIdentifier(value.usage) &&
    isSafeIntegerAtLeast(value.logicalTexelFootprint, 0);
}

function isWebGpuAllocationRequestProxyInput(value: unknown): value is WebGpuAllocationRequestProxyInput {
  if (!isRecord(value) ||
    value.backend !== 'webgpu' ||
    !isOneOf(value.operationId, WEBGPU_ALLOCATION_REQUEST_OPERATION_IDS) ||
    !isOneOf(value.sourceLocationId, WEBGPU_ALLOCATION_REQUEST_SOURCE_LOCATION_IDS) ||
    !isSafeIntegerAtLeast(value.requestOrdinal, 1) ||
    !isOneOf(value.outcome, ['success', 'failed'] as const) ||
    !isOneOf(value.byteKind, WEBGPU_ALLOCATION_REQUEST_BYTE_KINDS)) {
    return false;
  }

  const valueKeys = allocationValueKeys(value.byteKind);
  if (valueKeys === null) {
    return false;
  }

  const frameKeys = [
    'backend',
    'carrier',
    'operationId',
    'sourceLocationId',
    'requestOrdinal',
    'outcome',
    'byteKind',
    'byteValue',
    'measurementWindowId',
    'measurementEpochId',
    'sourceSequence',
    'diagnosticFrameId',
    'frameToken',
    ...valueKeys
  ];
  const lifecycleKeys = [
    'backend',
    'carrier',
    'operationId',
    'sourceLocationId',
    'requestOrdinal',
    'outcome',
    'byteKind',
    'byteValue',
    'executionId',
    'lifecyclePhase',
    'phaseSequence',
    ...valueKeys
  ];

  if (value.carrier === 'frame-request') {
    if (!hasExactKeys(value, frameKeys) ||
      !isSafeIdentifier(value.measurementWindowId) ||
      !isSafeIdentifier(value.measurementEpochId) ||
      !isSafeIntegerAtLeast(value.sourceSequence, 1) ||
      !isSafeIntegerAtLeast(value.diagnosticFrameId, 1) ||
      !isNullablePositiveToken(value.frameToken)) {
      return false;
    }
    const bitmapRequest = value.operationId === 'video-frame-image-bitmap-request';
    if ((bitmapRequest && value.outcome === 'success' && value.frameToken === null) ||
      (bitmapRequest && value.outcome === 'failed' && value.frameToken !== null) ||
      (!bitmapRequest && value.frameToken === null)) {
      return false;
    }
  } else if (value.carrier === 'lifecycle-request') {
    if (!hasExactKeys(value, lifecycleKeys) ||
      !isSafeIdentifier(value.executionId) ||
      !isOneOf(value.lifecyclePhase, ['startup', 'warmup', 'resize'] as const) ||
      !isSafeIntegerAtLeast(value.phaseSequence, 1)) {
      return false;
    }
  } else {
    return false;
  }

  if (value.byteKind === 'count-only-unavailable') {
    return value.byteValue === null;
  }

  if (!isSafeIntegerAtLeast(value.byteValue, 0)) {
    return false;
  }

  switch (value.byteKind) {
    case 'rgba-transfer-footprint':
      return isSafeIntegerAtLeast(value.sourceWidth, 1) && isSafeIntegerAtLeast(value.sourceHeight, 1);
    case 'requested-byte-length':
      return isSafeIntegerAtLeast(value.requestedByteLength, 0);
    case 'descriptor-size':
      return isSafeIntegerAtLeast(value.descriptorSize, 0);
    case 'logical-texel-footprint':
      return isTextureDescriptor(value.textureDescriptor);
    default:
      return false;
  }
}

function isRendererHeapObservationInput(value: unknown): value is RendererHeapObservationInput {
  return isRecord(value) &&
    hasExactKeys(value, ['observationId', 'observedAt', 'usedBytes']) &&
    isSafeIdentifier(value.observationId) &&
    isFiniteNumberAtLeast(value.observedAt, 0) &&
    isSafeIntegerAtLeast(value.usedBytes, 0);
}

/**
 * Stores only bounded raw diagnostic observations. Consumers must use the
 * shared evidence evaluator for acceptance and coverage decisions.
 */
export class PerformanceDiagnostics {
  private readonly maxSamplesPerKind: number;
  private backendObservation: PerformanceBackendObservationInput | null = null;
  private boundaries: Partial<Record<PerformanceWindowBoundaryKind, PerformanceWindowBoundaryInput>> = {};
  private nextBoundaryIndex = 0;
  private shutdownBoundaries: Partial<Record<PerformanceShutdownBoundary, PerformanceShutdownBoundaryInput>> = {};
  private nextShutdownBoundaryIndex = 0;
  private pipelineReadyBackends: PerformanceDiagnosticBackend[] = [];
  private pipelineErrors: PerformancePipelineErrorInput[] = [];
  private renderStats: PerformanceRenderStatsInput[] = [];
  private lastSourceSequence = 0;
  private sourceCounters: MutableSourceCounters = createSourceCounters();
  private workerCounters: MutableWorkerCounters = createWorkerCounters();
  private pendingStart: number | null = null;
  private pendingEnd: number | null = null;
  private timingSamples: Record<PerformanceTimingMetricId, PerformanceTimingSampleInput[]> = createTimingRecord(() => []);
  private timingSampleKeys: Record<PerformanceTimingMetricId, Set<string>> = createTimingRecord(() => new Set<string>());
  private frameAllocationRequestProxies: WebGpuAllocationRequestProxyInput[] = [];
  private lifecycleAllocationRequestProxies: WebGpuAllocationRequestProxyInput[] = [];
  private frameAllocationRequestProxyKeys = new Set<string>();
  private lifecycleAllocationRequestProxyKeys = new Set<string>();
  private rendererHeapObservations: RendererHeapObservationInput[] = [];
  private rendererHeapObservationIds = new Set<string>();
  private rendererHeapUnavailableReason: RendererHeapUnavailableReason = 'not-collected';

  constructor(options: PerformanceDiagnosticsOptions = {}) {
    const requestedCapacity = options.maxSamplesPerKind ?? DEFAULT_MAX_SAMPLES_PER_KIND;
    if (!isSafeIntegerAtLeast(requestedCapacity, 1) || requestedCapacity > MAX_SAMPLES_PER_KIND) {
      throw new RangeError(`maxSamplesPerKind must be a safe integer between 1 and ${MAX_SAMPLES_PER_KIND}`);
    }

    this.maxSamplesPerKind = requestedCapacity;
  }

  reset({ lastSourceSequence = 0 }: PerformanceDiagnosticsResetOptions = {}): void {
    if (!isSafeIntegerAtLeast(lastSourceSequence, 0)) {
      throw new RangeError('lastSourceSequence must be a nonnegative safe integer');
    }
    this.backendObservation = null;
    this.boundaries = {};
    this.nextBoundaryIndex = 0;
    this.shutdownBoundaries = {};
    this.nextShutdownBoundaryIndex = 0;
    this.pipelineReadyBackends = [];
    this.pipelineErrors = [];
    this.renderStats = [];
    this.lastSourceSequence = lastSourceSequence;
    this.sourceCounters = createSourceCounters();
    this.workerCounters = createWorkerCounters();
    this.pendingStart = null;
    this.pendingEnd = null;
    this.timingSamples = createTimingRecord(() => []);
    this.timingSampleKeys = createTimingRecord(() => new Set<string>());
    this.frameAllocationRequestProxies = [];
    this.frameAllocationRequestProxyKeys = new Set();
    this.rendererHeapObservations = [];
    this.rendererHeapObservationIds = new Set();
    this.rendererHeapUnavailableReason = 'not-collected';
  }

  recordBackendObservation(input: unknown): PerformanceDiagnosticsRecordResult {
    if (!isBackendObservationInput(input)) {
      return rejected('invalid-input');
    }
    if (this.backendObservation !== null) {
      return rejected('already-recorded');
    }

    this.backendObservation = input.adapter === undefined
      ? { ...input }
      : { ...input, adapter: { ...input.adapter } };
    return accepted();
  }

  recordWindowBoundary(input: unknown): PerformanceDiagnosticsRecordResult {
    if (!isWindowBoundaryInput(input)) {
      return rejected('invalid-input');
    }

    const expectedKind = PERFORMANCE_WINDOW_BOUNDARY_KINDS[this.nextBoundaryIndex];
    if (input.kind !== expectedKind) {
      return this.boundaries[input.kind] === undefined
        ? rejected('out-of-order-boundary')
        : rejected('already-recorded');
    }

    const previousKind = PERFORMANCE_WINDOW_BOUNDARY_KINDS[this.nextBoundaryIndex - 1];
    const previousBoundary = previousKind === undefined ? undefined : this.boundaries[previousKind];
    if (previousBoundary !== undefined && input.at < previousBoundary.at) {
      return rejected('out-of-order-boundary');
    }

    this.boundaries[input.kind] = { ...input };
    this.nextBoundaryIndex++;
    return accepted();
  }

  recordShutdownBoundary(input: unknown): PerformanceDiagnosticsRecordResult {
    if (!isShutdownBoundaryInput(input)) {
      return rejected('invalid-input');
    }

    const expectedBoundary = PERFORMANCE_SHUTDOWN_BOUNDARIES[this.nextShutdownBoundaryIndex];
    if (input.boundary !== expectedBoundary) {
      return this.shutdownBoundaries[input.boundary] === undefined
        ? rejected('out-of-order-boundary')
        : rejected('already-recorded');
    }

    this.shutdownBoundaries[input.boundary] = { ...input };
    this.nextShutdownBoundaryIndex++;
    return accepted();
  }

  recordPipelineReady(input: unknown): PerformanceDiagnosticsRecordResult {
    if (!isPipelineReadyInput(input)) {
      return rejected('invalid-input');
    }
    if (this.pipelineReadyBackends.length >= this.maxSamplesPerKind) {
      return rejected('buffer-full');
    }

    this.pipelineReadyBackends.push(input.backend);
    return accepted();
  }

  recordPipelineError(input: unknown): PerformanceDiagnosticsRecordResult {
    if (!isPipelineErrorInput(input)) {
      return rejected('invalid-input');
    }
    if (this.pipelineErrors.length >= this.maxSamplesPerKind) {
      return rejected('buffer-full');
    }

    this.pipelineErrors.push({ ...input });
    return accepted();
  }

  recordRenderStats(input: unknown): PerformanceDiagnosticsRecordResult {
    if (!isRenderStatsInput(input)) {
      return rejected('invalid-input');
    }
    if (this.renderStats.length >= this.maxSamplesPerKind) {
      return rejected('buffer-full');
    }

    this.renderStats.push({ ...input });
    return accepted();
  }

  recordSourceOpportunity(input: unknown): PerformanceDiagnosticsRecordResult {
    if (!isSourceOpportunityInput(input)) {
      return rejected('invalid-input');
    }
    if (input.sourceSequence !== this.lastSourceSequence + 1) {
      return rejected('non-contiguous-source-sequence');
    }

    this.lastSourceSequence = input.sourceSequence;
    this.sourceCounters.sourceOpportunities++;

    switch (input.disposition) {
      case 'duplicateMediaTime':
      case 'noCurrentData':
      case 'backpressure':
      case 'sessionInactive':
      case 'workerNotReady':
      case 'bitmapCreationFailed':
      case 'enqueueFailed':
      case 'drawCompleted':
      case 'driverInactive':
      case 'driverFailed':
        this.sourceCounters[input.disposition]++;
        break;
      case 'workerFrameSubmitted':
        this.sourceCounters.workerFramesSubmitted++;
        this.workerCounters.submissions++;
        break;
    }

    return accepted();
  }

  recordPendingCount(input: unknown): PerformanceDiagnosticsRecordResult {
    if (!isPendingCountInput(input)) {
      return rejected('invalid-input');
    }

    if (input.boundary === 'observation-start') {
      if (this.pendingStart !== null) {
        return rejected('already-recorded');
      }
      this.pendingStart = input.count;
      return accepted();
    }

    if (this.pendingStart === null) {
      return rejected('out-of-order-boundary');
    }
    if (this.pendingEnd !== null) {
      return rejected('already-recorded');
    }

    this.pendingEnd = input.count;
    return accepted();
  }

  recordWorkerAcknowledgement(input: unknown): PerformanceDiagnosticsRecordResult {
    if (!isWorkerAcknowledgementInput(input)) {
      return rejected('invalid-input');
    }

    this.workerCounters.acknowledgements++;
    this.workerCounters[input.outcome]++;
    return accepted();
  }

  recordWorkerTerminalError(): void {
    this.workerCounters.terminalErrors++;
  }

  recordTimingSample(input: unknown): PerformanceDiagnosticsRecordResult {
    if (!isTimingSampleInput(input)) {
      return rejected('invalid-input');
    }

    const key = timingSampleKey(input);
    const keys = this.timingSampleKeys[input.metricId];
    const samples = this.timingSamples[input.metricId];
    if (keys.has(key)) {
      return rejected('duplicate-sample');
    }
    if (samples.length >= this.maxSamplesPerKind) {
      return rejected('buffer-full');
    }

    keys.add(key);
    samples.push(cloneTimingSample(input));
    return accepted();
  }

  recordWebGpuAllocationRequestProxy(input: unknown): PerformanceDiagnosticsRecordResult {
    if (!isWebGpuAllocationRequestProxyInput(input)) {
      return rejected('invalid-input');
    }

    const key = allocationRequestProxyKey(input);
    const isFrameRequest = input.carrier === 'frame-request';
    const keys = isFrameRequest ? this.frameAllocationRequestProxyKeys : this.lifecycleAllocationRequestProxyKeys;
    const rows = isFrameRequest ? this.frameAllocationRequestProxies : this.lifecycleAllocationRequestProxies;
    if (keys.has(key)) {
      return rejected('duplicate-sample');
    }
    if (input.carrier === 'frame-request') {
      const precedingFrameRequests = this.frameAllocationRequestProxies.filter((row) =>
        row.carrier === 'frame-request' &&
        row.measurementEpochId === input.measurementEpochId &&
        row.sourceSequence === input.sourceSequence
      );
      if (input.requestOrdinal !== precedingFrameRequests.length + 1) {
        return rejected('invalid-input');
      }
    } else {
      const precedingPhaseRequests = this.lifecycleAllocationRequestProxies.filter((row) =>
        row.carrier === 'lifecycle-request' &&
        row.executionId === input.executionId &&
        row.lifecyclePhase === input.lifecyclePhase
      );
      const precedingOperationRequests = precedingPhaseRequests.filter((row) =>
        row.operationId === input.operationId &&
        row.sourceLocationId === input.sourceLocationId
      );
      if (input.phaseSequence !== precedingPhaseRequests.length + 1 ||
        input.requestOrdinal !== precedingOperationRequests.length + 1) {
        return rejected('invalid-input');
      }
    }
    if (rows.length >= this.maxSamplesPerKind) {
      return rejected('buffer-full');
    }

    keys.add(key);
    rows.push(cloneAllocationRequestProxy(input));
    return accepted();
  }

  recordRendererHeapObservation(input: unknown): PerformanceDiagnosticsRecordResult {
    if (!isRendererHeapObservationInput(input)) {
      return rejected('invalid-input');
    }
    if (this.rendererHeapUnavailableReason !== 'not-collected') {
      return rejected('heap-state-already-recorded');
    }
    if (this.rendererHeapObservationIds.has(input.observationId)) {
      return rejected('duplicate-sample');
    }
    if (this.rendererHeapObservations.length >= this.maxSamplesPerKind) {
      return rejected('buffer-full');
    }

    this.rendererHeapObservationIds.add(input.observationId);
    this.rendererHeapObservations.push(cloneRendererHeapObservation(input));
    return accepted();
  }

  recordRendererHeapUnavailable(reason: unknown): PerformanceDiagnosticsRecordResult {
    if (!isOneOf(reason, RENDERER_HEAP_UNAVAILABLE_REASONS) || reason === 'not-collected') {
      return rejected('invalid-input');
    }
    if (this.rendererHeapObservations.length > 0 || this.rendererHeapUnavailableReason !== 'not-collected') {
      return rejected('heap-state-already-recorded');
    }

    this.rendererHeapUnavailableReason = reason;
    return accepted();
  }

  getSnapshot(): PerformanceDiagnosticsSnapshot {
    const measuredDropTotal = this.sourceCounters.duplicateMediaTime +
      this.sourceCounters.noCurrentData +
      this.sourceCounters.backpressure;
    const fatalDispositionTotal = this.sourceCounters.sessionInactive +
      this.sourceCounters.workerNotReady +
      this.sourceCounters.bitmapCreationFailed +
      this.sourceCounters.enqueueFailed;
    const canvasAttempts = this.sourceCounters.drawCompleted +
      this.sourceCounters.driverInactive +
      this.sourceCounters.driverFailed;
    const accountedOpportunities = measuredDropTotal + fatalDispositionTotal +
      canvasAttempts + this.sourceCounters.workerFramesSubmitted;
    const observedBackend = this.backendObservation?.observedBackend ?? null;
    const backendSuccessCount = observedBackend === 'canvas2d'
      ? this.sourceCounters.drawCompleted
      : observedBackend === 'webgpu'
        ? this.workerCounters.queueSubmitCompleted
        : null;
    const pendingStart = this.pendingStart;
    const pendingEnd = this.pendingEnd;
    const pendingIsAvailable = pendingStart !== null && pendingEnd !== null;
    const expectedPendingEnd = pendingIsAvailable
      ? pendingStart + this.workerCounters.submissions - this.workerCounters.acknowledgements - this.workerCounters.terminalErrors
      : null;
    const heapIsAvailable = this.rendererHeapObservations.length > 0;

    const snapshot: PerformanceDiagnosticsSnapshot = {
      maxSamplesPerKind: this.maxSamplesPerKind,
      backend: this.createBackendSnapshot(),
      windows: {
        warmup: {
          start: this.createBoundarySnapshot('warmup-start'),
          end: this.createBoundarySnapshot('warmup-end')
        },
        sampling: {
          start: this.createBoundarySnapshot('sampling-window-start'),
          end: this.createBoundarySnapshot('sampling-window-end')
        }
      },
      shutdown: {
        beforeRelease: this.createShutdownBoundarySnapshot('before-release'),
        releaseDispatched: this.createShutdownBoundarySnapshot('release-dispatched')
      },
      pipeline: {
        ready: {
          availability: this.pipelineReadyBackends.length > 0 ? 'observed' : 'unavailable',
          unavailableReason: this.pipelineReadyBackends.length > 0 ? null : 'not-recorded',
          backends: [...this.pipelineReadyBackends]
        },
        errors: this.pipelineErrors.map((error) => ({ ...error })),
        renderStats: this.renderStats.map((stats) => ({ ...stats })),
        renderStatDistributions: {
          fps: distribution(this.renderStats.flatMap((stats) => stats.fps === null ? [] : [stats.fps])),
          frameTime: distribution(this.renderStats.flatMap((stats) => stats.frameTime === null ? [] : [stats.frameTime])),
          gpuTime: distribution(this.renderStats.flatMap((stats) => stats.gpuTime === null ? [] : [stats.gpuTime])),
          uploadTime: distribution(this.renderStats.flatMap((stats) => stats.uploadTime === null ? [] : [stats.uploadTime]))
        }
      },
      source: {
        sourceOpportunities: this.sourceCounters.sourceOpportunities,
        measuredDrops: {
          duplicateMediaTime: this.sourceCounters.duplicateMediaTime,
          noCurrentData: this.sourceCounters.noCurrentData,
          backpressure: this.sourceCounters.backpressure,
          total: measuredDropTotal
        },
        fatalDispositions: {
          sessionInactive: this.sourceCounters.sessionInactive,
          workerNotReady: this.sourceCounters.workerNotReady,
          bitmapCreationFailed: this.sourceCounters.bitmapCreationFailed,
          enqueueFailed: this.sourceCounters.enqueueFailed,
          total: fatalDispositionTotal
        },
        canvas: {
          attempts: canvasAttempts,
          drawCompleted: this.sourceCounters.drawCompleted,
          driverInactive: this.sourceCounters.driverInactive,
          driverFailed: this.sourceCounters.driverFailed
        },
        workerFramesSubmitted: this.sourceCounters.workerFramesSubmitted,
        backendSuccesses: {
          availability: backendSuccessCount === null ? 'unavailable' : 'available',
          unavailableReason: backendSuccessCount === null ? 'observed-backend-not-recorded' : null,
          backend: observedBackend,
          count: backendSuccessCount
        },
        reconciliation: {
          accountedOpportunities,
          isConserved: this.sourceCounters.sourceOpportunities === accountedOpportunities
        }
      },
      worker: {
        submissions: this.workerCounters.submissions,
        acknowledgements: this.workerCounters.acknowledgements,
        terminalErrors: this.workerCounters.terminalErrors,
        outcomes: {
          queueSubmitCompleted: this.workerCounters.queueSubmitCompleted,
          driverInactive: this.workerCounters.driverInactive,
          driverFailed: this.workerCounters.driverFailed
        }
      },
      pendingCounts: {
        observationStart: this.createPendingValueSnapshot(this.pendingStart),
        observationEnd: this.createPendingValueSnapshot(this.pendingEnd),
        reconciliation: {
          availability: pendingIsAvailable ? 'available' : 'unavailable',
          unavailableReason: pendingIsAvailable ? null : 'pending-boundary-not-recorded',
          expectedEnd: expectedPendingEnd,
          matchesObservedEnd: pendingIsAvailable ? expectedPendingEnd === pendingEnd : null
        }
      },
      timingSamples: this.createTimingSamplesSnapshot(),
      timingDistributions: this.createTimingDistributionsSnapshot(),
      allocationRequestProxies: {
        availability: this.frameAllocationRequestProxies.length + this.lifecycleAllocationRequestProxies.length > 0
          ? 'observed'
          : 'unavailable',
        unavailableReason: this.frameAllocationRequestProxies.length + this.lifecycleAllocationRequestProxies.length > 0
          ? null
          : 'no-proxy-rows-recorded',
        frameRequests: this.frameAllocationRequestProxies.map(cloneAllocationRequestProxy),
        lifecycleRequests: this.lifecycleAllocationRequestProxies.map(cloneAllocationRequestProxy)
      },
      rendererHeap: {
        availability: heapIsAvailable ? 'available' : 'unavailable',
        unavailableReason: heapIsAvailable ? null : this.rendererHeapUnavailableReason,
        observations: this.rendererHeapObservations.map(cloneRendererHeapObservation),
        distribution: distribution(this.rendererHeapObservations.map((observation) => observation.usedBytes))
      }
    };

    return freezeDeep(snapshot);
  }

  private createBackendSnapshot(): PerformanceDiagnosticsSnapshot['backend'] {
    if (this.backendObservation === null) {
      return {
        availability: 'unavailable',
        unavailableReason: 'backend-not-recorded',
        requestedBackend: null,
        selectedBackend: null,
        observedBackend: null,
        observedBackendUnavailableReason: null,
        selectionReason: null,
        fallbackReason: null,
        adapter: {
          availability: 'unavailable',
          unavailableReason: 'adapter-not-observed',
          identity: null,
          isFallbackAdapter: null
        }
      };
    }

    const adapter = this.backendObservation.adapter;
    return {
      availability: 'observed',
      unavailableReason: null,
      requestedBackend: this.backendObservation.requestedBackend,
      selectedBackend: this.backendObservation.selectedBackend,
      observedBackend: this.backendObservation.observedBackend,
      observedBackendUnavailableReason: this.backendObservation.observedBackendUnavailableReason,
      selectionReason: this.backendObservation.selectionReason,
      fallbackReason: this.backendObservation.fallbackReason,
      adapter: adapter === undefined
        ? {
          availability: 'unavailable',
          unavailableReason: 'adapter-not-observed',
          identity: null,
          isFallbackAdapter: null
        }
        : {
          availability: 'observed',
          unavailableReason: null,
          identity: adapter.identity,
          isFallbackAdapter: adapter.isFallbackAdapter
        }
    };
  }

  private createBoundarySnapshot(kind: PerformanceWindowBoundaryKind): PerformanceWindowBoundarySnapshot {
    const boundary = this.boundaries[kind];
    if (boundary === undefined) {
      return {
        availability: 'unavailable',
        unavailableReason: 'not-recorded',
        measurementEpochId: null,
        at: null
      };
    }

    return {
      availability: 'observed',
      unavailableReason: null,
      measurementEpochId: boundary.measurementEpochId,
      at: boundary.at
    };
  }

  private createShutdownBoundarySnapshot(
    boundary: PerformanceShutdownBoundary
  ): PerformanceShutdownBoundarySnapshot {
    const observation = this.shutdownBoundaries[boundary];
    if (observation === undefined) {
      return {
        availability: 'unavailable',
        unavailableReason: 'not-recorded',
        launchId: null
      };
    }

    return {
      availability: 'observed',
      unavailableReason: null,
      launchId: observation.launchId
    };
  }

  private createPendingValueSnapshot(count: number | null): PerformancePendingValueSnapshot {
    return count === null
      ? { availability: 'unavailable', unavailableReason: 'not-recorded', count: null }
      : { availability: 'observed', unavailableReason: null, count };
  }

  private createTimingSamplesSnapshot(): PerformanceDiagnosticsSnapshot['timingSamples'] {
    const snapshot = createTimingRecord<PerformanceTimingSampleInput[]>(() => []);
    for (const metricId of PERFORMANCE_TIMING_METRIC_IDS) {
      snapshot[metricId] = this.timingSamples[metricId].map(cloneTimingSample);
    }
    return snapshot;
  }

  private createTimingDistributionsSnapshot(): PerformanceDiagnosticsSnapshot['timingDistributions'] {
    const snapshot = createTimingRecord<PerformanceDistributionSnapshot>(() => distribution([]));
    for (const metricId of PERFORMANCE_TIMING_METRIC_IDS) {
      snapshot[metricId] = distribution(this.timingSamples[metricId].map((sample) => sample.endedAt - sample.startedAt));
    }
    return snapshot;
  }
}

export function createPerformanceDiagnostics(
  options: PerformanceDiagnosticsOptions = {}
): PerformanceDiagnostics {
  return new PerformanceDiagnostics(options);
}
