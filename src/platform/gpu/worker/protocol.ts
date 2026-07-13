import type {
  FrameDispositionOutcome,
  RenderBackend,
  RenderPreset,
  WebGpuBackendExecutionIdentity,
  WebGpuFrameRequestProxy,
  WebGpuLifecycleRequestProxy
} from '../domain/types';

/**
 * Traffic routes by plane, not payload type: frame plane (canvas handoff, FRAME,
 * FRAME_RENDERED, STATS, frame-ERROR) rides raw postMessage; control plane (all
 * `WorkerControlApi` calls, including capture results carrying `Comlink.transfer`red
 * ImageBitmaps) rides the dedicated comlink MessagePort.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isImageBitmapLike(value: unknown): value is ImageBitmap {
  return isRecord(value) && typeof value.close === 'function';
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export const isPerformanceHarnessBuild =
  typeof __PRISMGB_PERF_HARNESS__ !== 'undefined' && __PRISMGB_PERF_HARNESS__;

export const WorkerMessageType = Object.freeze({
  FRAME: 'frame'
} as const);

export const WorkerResponseType = Object.freeze({
  READY: 'ready',
  FRAME_RENDERED: 'frameRendered',
  ERROR: 'error',
  STATS: 'stats',
  CAPTURE_REQUESTED: 'captureRequested',
  CAPTURE_READY: 'captureReady',
  RELEASED: 'released',
  DESTROYED: 'destroyed'
} as const);

export type WorkerResponseTypeValue = typeof WorkerResponseType[keyof typeof WorkerResponseType];

export type WorkerRenderBackend = Extract<RenderBackend, 'webgpu'>;

export type WorkerRendererConfig = {
  nativeWidth: number;
  nativeHeight: number;
  targetWidth: number;
  targetHeight: number;
  scaleFactor: number;
  backend: WorkerRenderBackend;
  presetId: string;
};

export type FramePayload = { imageBitmap: ImageBitmap; frameToken?: number; diagnosticFrameId?: number };
type HarnessFramePayload = { imageBitmap: ImageBitmap; frameToken: number };
type InstrumentedFramePayload = HarnessFramePayload & { diagnosticFrameId: number };
export type ResizePayload = { width: number; height: number; scaleFactor: number };
export type PresetPayload = { presetId: string; preset: RenderPreset };
export type WorkerReadyPayload =
  | Readonly<{ backend: WorkerRenderBackend }>
  | Readonly<{
    backend: WorkerRenderBackend;
    backendExecutionIdentity: WebGpuBackendExecutionIdentity;
  }>
  | Readonly<{
    backend: WorkerRenderBackend;
    backendExecutionIdentity: WebGpuBackendExecutionIdentity;
    lifecycleRequestProxies: readonly WebGpuLifecycleRequestProxy[];
  }>;
export type WorkerLifecycleRequestPayload = Readonly<{
  lifecycleRequestProxies: readonly WebGpuLifecycleRequestProxy[];
}>;
export type WorkerStatsPayload = { fps: number; frameTime: number | string; gpuTime?: number; uploadTime?: number };
export type WorkerErrorPayload = { message: string; stack?: string; code?: string; adapterInfo?: object | null };
export type WorkerCaptureReadyPayload = { bitmap: ImageBitmap };

export type EmptyWorkerPayload = undefined | Record<string, never>;
type FrameAcknowledgementPayload = { frameToken: number; outcome: FrameDispositionOutcome };

export type WorkerPerformanceFrameTimingPayload = Readonly<{
  readonly frameToken: number;
  readonly diagnosticFrameId: number;
  readonly outcome: 'webgpu-queue-submit-completed';
  readonly workerRender: Readonly<{ readonly startedAt: number; readonly endedAt: number }>;
  readonly queueSubmit: Readonly<{ readonly startedAt: number; readonly endedAt: number }>;
  readonly frameRequestProxies: readonly WebGpuFrameRequestProxy[];
}>;

export type WorkerPerformanceFrameTimingResponse = Readonly<{
  readonly type: 'performance-frame-timing';
  readonly payload: WorkerPerformanceFrameTimingPayload;
  readonly timestamp: number;
}>;

export type WorkerResponsePayloadMap = {
  [WorkerResponseType.READY]: WorkerReadyPayload;
  [WorkerResponseType.FRAME_RENDERED]: EmptyWorkerPayload | FrameAcknowledgementPayload;
  [WorkerResponseType.ERROR]: WorkerErrorPayload;
  [WorkerResponseType.STATS]: WorkerStatsPayload;
  [WorkerResponseType.CAPTURE_REQUESTED]: EmptyWorkerPayload;
  [WorkerResponseType.CAPTURE_READY]: WorkerCaptureReadyPayload;
  [WorkerResponseType.RELEASED]: EmptyWorkerPayload;
  [WorkerResponseType.DESTROYED]: EmptyWorkerPayload;
};

/**
 * The comlink-exposed worker control API. Every control-plane operation that used
 * to travel as a discriminated `WorkerMessage`/`WorkerResponse` envelope over raw
 * `postMessage` is now a typed async method on a dedicated control MessagePort.
 * The offscreen canvas is transferred once over the raw main channel before
 * `initialize` runs (transferables ride raw postMessage; pure control RPC rides
 * comlink). The frame path (FRAME/FRAME_RENDERED/STATS) never touches this API.
 */
export interface WorkerControlApi {
  initialize(config: WorkerRendererConfig): Promise<WorkerReadyPayload>;
  resize(payload: ResizePayload): Promise<WorkerLifecycleRequestPayload | undefined>;
  setPreset(payload: PresetPayload): Promise<void>;
  setBrightness(brightness: number): Promise<void>;
  requestCapture(): Promise<void>;
  getCapturedFrame(): Promise<WorkerCaptureReadyPayload>;
  release(): Promise<void>;
  destroy(): Promise<void>;
}

export const CONTROL_PORT_MESSAGE = '__gpuWorkerControlPort';
export const CANVAS_HANDOFF_MESSAGE = '__gpuWorkerCanvas';

export type ControlPortMessage = { channel: typeof CONTROL_PORT_MESSAGE; port: MessagePort };
export type CanvasHandoffMessage = { channel: typeof CANVAS_HANDOFF_MESSAGE; canvas: OffscreenCanvas };

export type FrameMessage = { type: typeof WorkerMessageType.FRAME; payload: FramePayload; timestamp: number };
export type FrameRenderedResponse = {
  type: typeof WorkerResponseType.FRAME_RENDERED;
  payload?: FrameAcknowledgementPayload;
  timestamp: number;
};
export type StatsResponse = { type: typeof WorkerResponseType.STATS; payload: WorkerStatsPayload; timestamp: number };
export type FrameErrorResponse = { type: typeof WorkerResponseType.ERROR; payload: WorkerErrorPayload; timestamp: number };

export function createWorkerMessage(type: typeof WorkerMessageType.FRAME, payload: FramePayload): FrameMessage {
  if (isPerformanceHarnessBuild) {
    if (
      typeof __PRISMGB_PERF_INSTRUMENTATION__ !== 'undefined' &&
      __PRISMGB_PERF_INSTRUMENTATION__ &&
      isInstrumentedFramePayload(payload)
    ) {
      return {
        type,
        payload: {
          imageBitmap: payload.imageBitmap,
          frameToken: payload.frameToken,
          diagnosticFrameId: payload.diagnosticFrameId
        },
        timestamp: performance.now()
      };
    }
    if (!isHarnessFramePayload(payload)) {
      throw new TypeError('Harness FRAME payload requires exactly one positive frame token');
    }
    return {
      type,
      payload: { imageBitmap: payload.imageBitmap, frameToken: payload.frameToken },
      timestamp: performance.now()
    };
  }

  return { type, payload: { imageBitmap: payload.imageBitmap }, timestamp: performance.now() };
}

export function createWorkerResponse(
  type: typeof WorkerResponseType.FRAME_RENDERED,
  payload?: FrameAcknowledgementPayload
): FrameRenderedResponse;
export function createWorkerResponse(type: typeof WorkerResponseType.STATS, payload: WorkerStatsPayload): StatsResponse;
export function createWorkerResponse(type: WorkerResponseTypeValue, payload?: unknown): { type: WorkerResponseTypeValue; payload?: unknown; timestamp: number } {
  if (type === WorkerResponseType.FRAME_RENDERED) {
    if (isPerformanceHarnessBuild && !isFrameAcknowledgementPayload(payload)) {
      throw new TypeError('Harness FRAME acknowledgement requires exactly one frame token and outcome');
    }
    return {
      type,
      payload: isPerformanceHarnessBuild ? payload : undefined,
      timestamp: performance.now()
    };
  }

  return { type, payload, timestamp: performance.now() };
}

export function isWorkerRenderBackend(value: unknown): value is WorkerRenderBackend {
  return value === 'webgpu';
}

function isNullableIdentityField(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.length > 0);
}

function isBackendExecutionIdentity(value: unknown): value is WebGpuBackendExecutionIdentity {
  return isRecord(value) &&
    hasExactKeys(value, [
      'backend', 'driver', 'workerProtocol', 'adapterIdentity', 'limits',
      'isFallbackAdapter', 'powerPreference'
    ]) &&
    value.backend === 'webgpu' &&
    value.driver === 'webgpu-driver-v1' &&
    value.workerProtocol === 'webgpu-worker-ready-v1' &&
    isRecord(value.adapterIdentity) &&
    hasExactKeys(value.adapterIdentity, ['vendor', 'architecture', 'device', 'description']) &&
    isNullableIdentityField(value.adapterIdentity.vendor) &&
    isNullableIdentityField(value.adapterIdentity.architecture) &&
    isNullableIdentityField(value.adapterIdentity.device) &&
    isNullableIdentityField(value.adapterIdentity.description) &&
    isRecord(value.limits) &&
    hasExactKeys(value.limits, ['maxTextureDimension2D', 'maxBindGroups']) &&
    isPositiveSafeInteger(value.limits.maxTextureDimension2D) &&
    isPositiveSafeInteger(value.limits.maxBindGroups) &&
    typeof value.isFallbackAdapter === 'boolean' &&
    (value.powerPreference === 'low-power' || value.powerPreference === 'high-performance');
}

export function isWorkerReadyPayload(value: unknown): value is Exclude<WorkerReadyPayload, { lifecycleRequestProxies: unknown }> {
  if (!isRecord(value) || !isWorkerRenderBackend(value.backend)) return false;
  return isPerformanceHarnessBuild
    ? hasExactKeys(value, ['backend', 'backendExecutionIdentity']) &&
      isBackendExecutionIdentity(value.backendExecutionIdentity)
    : hasExactKeys(value, ['backend']);
}

export function isFrameToken(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isNonnegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

type WebGpuTextureRequestDescriptor = Readonly<{
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly format: 'rgba8unorm';
  readonly usage: 'texture-binding-copy-dst-render-attachment' | 'texture-binding-render-attachment';
  readonly logicalTexelFootprint: number;
}>;

function isTextureDescriptor(value: unknown): value is WebGpuTextureRequestDescriptor {
  if (!isRecord(value) || !hasExactKeys(value, [
    'width',
    'height',
    'depth',
    'format',
    'usage',
    'logicalTexelFootprint'
  ])) {
    return false;
  }

  if (
    !isPositiveSafeInteger(value.width) ||
    !isPositiveSafeInteger(value.height) ||
    !isPositiveSafeInteger(value.depth) ||
    value.format !== 'rgba8unorm' ||
    (value.usage !== 'texture-binding-copy-dst-render-attachment' && value.usage !== 'texture-binding-render-attachment') ||
    !isPositiveSafeInteger(value.logicalTexelFootprint)
  ) {
    return false;
  }

  const footprint = value.width * value.height * value.depth * 4;
  return Number.isSafeInteger(footprint) && footprint === value.logicalTexelFootprint;
}

function isTextureLifecycleRequestProxy(
  value: unknown,
  lifecyclePhase: 'startup' | 'resize'
): value is WebGpuLifecycleRequestProxy {
  if (!isRecord(value) ||
    !hasExactKeys(value, [
      'lifecyclePhase',
      'operationId',
      'sourceLocationId',
      'outcome',
      'byteKind',
      'byteValue',
      'textureDescriptor'
    ])) {
    return false;
  }

  const textureDescriptor = value.textureDescriptor;
  return (
    value.lifecyclePhase === lifecyclePhase &&
    value.operationId === 'gpu-texture-request' &&
    value.sourceLocationId === 'webgpu-driver:create-texture' &&
    value.outcome === 'success' &&
    value.byteKind === 'logical-texel-footprint' &&
    isPositiveSafeInteger(value.byteValue) &&
    isTextureDescriptor(textureDescriptor) &&
    value.byteValue === textureDescriptor.logicalTexelFootprint
  );
}

function isBufferLifecycleRequestProxy(value: unknown): value is WebGpuLifecycleRequestProxy {
  return isRecord(value) &&
    hasExactKeys(value, [
      'lifecyclePhase',
      'operationId',
      'sourceLocationId',
      'outcome',
      'byteKind',
      'byteValue',
      'descriptorSize'
    ]) &&
    value.lifecyclePhase === 'startup' &&
    value.operationId === 'gpu-buffer-request' &&
    value.sourceLocationId === 'webgpu-driver:create-buffer' &&
    value.outcome === 'success' &&
    value.byteKind === 'descriptor-size' &&
    isPositiveSafeInteger(value.byteValue) &&
    value.descriptorSize === value.byteValue;
}

function isStartupLifecycleRequestProxies(value: unknown): value is readonly WebGpuLifecycleRequestProxy[] {
  return Array.isArray(value) &&
    value.length === 7 &&
    value.slice(0, 3).every((request) => isTextureLifecycleRequestProxy(request, 'startup')) &&
    value.slice(3).every(isBufferLifecycleRequestProxy);
}

function isResizeLifecycleRequestProxies(value: unknown): value is readonly WebGpuLifecycleRequestProxy[] {
  return Array.isArray(value) &&
    value.length === 2 &&
    value.every((request) => isTextureLifecycleRequestProxy(request, 'resize'));
}

export function isInstrumentedWorkerReadyPayload(value: unknown): value is Extract<WorkerReadyPayload, { lifecycleRequestProxies: unknown }> {
  return isRecord(value) &&
    hasExactKeys(value, ['backend', 'backendExecutionIdentity', 'lifecycleRequestProxies']) &&
    isWorkerRenderBackend(value.backend) &&
    isBackendExecutionIdentity(value.backendExecutionIdentity) &&
    isStartupLifecycleRequestProxies(value.lifecycleRequestProxies);
}

export function isWorkerLifecycleRequestPayload(value: unknown): value is WorkerLifecycleRequestPayload {
  return isRecord(value) &&
    hasExactKeys(value, ['lifecycleRequestProxies']) &&
    isResizeLifecycleRequestProxies(value.lifecycleRequestProxies);
}

export function isFrameDispositionOutcome(value: unknown): value is FrameDispositionOutcome {
  return (
    value === 'canvas-draw-completed' ||
    value === 'webgpu-queue-submit-completed' ||
    value === 'skipped-inactive' ||
    value === 'failed'
  );
}

function isHarnessFramePayload(value: unknown): value is HarnessFramePayload {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['imageBitmap', 'frameToken']) &&
    isImageBitmapLike(value.imageBitmap) &&
    isFrameToken(value.frameToken)
  );
}

export function isInstrumentedFramePayload(value: unknown): value is InstrumentedFramePayload {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['imageBitmap', 'frameToken', 'diagnosticFrameId']) &&
    isImageBitmapLike(value.imageBitmap) &&
    isFrameToken(value.frameToken) &&
    isFrameToken(value.diagnosticFrameId)
  );
}

function isFrameAcknowledgementPayload(value: unknown): value is FrameAcknowledgementPayload {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['frameToken', 'outcome']) &&
    isFrameToken(value.frameToken) &&
    isFrameDispositionOutcome(value.outcome)
  );
}

export function isFramePayload(value: unknown): value is FramePayload {
  if (!isRecord(value) || !isImageBitmapLike(value.imageBitmap)) {
    return false;
  }
  if (isPerformanceHarnessBuild) {
    if (
      typeof __PRISMGB_PERF_INSTRUMENTATION__ !== 'undefined' &&
      __PRISMGB_PERF_INSTRUMENTATION__
    ) {
      return isHarnessFramePayload(value) || isInstrumentedFramePayload(value);
    }
    return isHarnessFramePayload(value);
  }
  return hasExactKeys(value, ['imageBitmap']);
}

export function isFrameMessage(message: unknown): message is FrameMessage {
  return isRecord(message) && message.type === WorkerMessageType.FRAME && isFramePayload(message.payload);
}

export function isControlPortMessage(message: unknown): message is ControlPortMessage {
  return isRecord(message) && message.channel === CONTROL_PORT_MESSAGE && isRecord(message.port);
}

export function isCanvasHandoffMessage(message: unknown): message is CanvasHandoffMessage {
  return isRecord(message) && message.channel === CANVAS_HANDOFF_MESSAGE;
}

export function isFrameRenderedResponse(value: unknown): value is FrameRenderedResponse {
  if (!isRecord(value) || value.type !== WorkerResponseType.FRAME_RENDERED) return false;
  if (isPerformanceHarnessBuild) return isFrameAcknowledgementPayload(value.payload);
  return value.payload === undefined || (isRecord(value.payload) && Object.keys(value.payload).length === 0);
}

function isWorkerPerformanceFrameTimingPayload(value: unknown): value is WorkerPerformanceFrameTimingPayload {
  if (!isRecord(value) || !hasExactKeys(value, [
    'frameToken',
    'diagnosticFrameId',
    'outcome',
    'workerRender',
    'queueSubmit',
    'frameRequestProxies'
  ])) {
    return false;
  }
  const isTimingSpan = (span: unknown): span is { startedAt: number; endedAt: number } => (
    isRecord(span) &&
    hasExactKeys(span, ['startedAt', 'endedAt']) &&
    isNonnegativeFiniteNumber(span.startedAt) &&
    isNonnegativeFiniteNumber(span.endedAt) &&
    span.endedAt >= span.startedAt
  );

  if (!isTimingSpan(value.workerRender) || !isTimingSpan(value.queueSubmit)) {
    return false;
  }

  if (!Array.isArray(value.frameRequestProxies) || value.frameRequestProxies.length !== 3) {
    return false;
  }

  const [uniformRequest, renderPassPlanRequest, bindGroupRequest] = value.frameRequestProxies;
  const isExpectedFrameRequestProxy = (
    request: unknown,
    operationId: WebGpuFrameRequestProxy['operationId'],
    sourceLocationId: WebGpuFrameRequestProxy['sourceLocationId']
  ): request is WebGpuFrameRequestProxy => {
    if (!isRecord(request) || request.operationId !== operationId || request.sourceLocationId !== sourceLocationId || request.outcome !== 'success') {
      return false;
    }
    if (operationId === 'uniform-float32-array') {
      return hasExactKeys(request, [
        'operationId',
        'sourceLocationId',
        'outcome',
        'byteKind',
        'byteValue',
        'requestedByteLength'
      ]) &&
        request.byteKind === 'requested-byte-length' &&
        isPositiveSafeInteger(request.byteValue) &&
        request.requestedByteLength === request.byteValue;
    }
    return hasExactKeys(request, ['operationId', 'sourceLocationId', 'outcome', 'byteKind', 'byteValue']) &&
      request.byteKind === 'count-only-unavailable' &&
      request.byteValue === null;
  };

  if (
    !isExpectedFrameRequestProxy(
      uniformRequest,
      'uniform-float32-array',
      'webgpu-driver:uniform-float32-array'
    ) ||
    !isExpectedFrameRequestProxy(
      renderPassPlanRequest,
      'render-pass-plan-materialization',
      'webgpu-driver:materialize-render-plan'
    ) ||
    !isExpectedFrameRequestProxy(
      bindGroupRequest,
      'bind-group-create',
      'webgpu-driver:create-bind-group'
    )
  ) {
    return false;
  }

  return isFrameToken(value.frameToken) &&
    isFrameToken(value.diagnosticFrameId) &&
    value.outcome === 'webgpu-queue-submit-completed' &&
    value.workerRender.startedAt <= value.queueSubmit.startedAt &&
    value.queueSubmit.endedAt <= value.workerRender.endedAt;
}

export function createWorkerPerformanceFrameTimingResponse(
  payload: WorkerPerformanceFrameTimingPayload
): WorkerPerformanceFrameTimingResponse {
  if (!isWorkerPerformanceFrameTimingPayload(payload)) {
    throw new TypeError('Instrumented worker timing requires one valid diagnostic frame payload');
  }
  return {
    type: 'performance-frame-timing',
    payload: {
      frameToken: payload.frameToken,
      diagnosticFrameId: payload.diagnosticFrameId,
      outcome: payload.outcome,
      workerRender: { ...payload.workerRender },
      queueSubmit: { ...payload.queueSubmit },
      frameRequestProxies: payload.frameRequestProxies.map((request) => ({ ...request }))
    },
    timestamp: performance.now()
  };
}

export function isWorkerPerformanceFrameTimingResponse(
  value: unknown
): value is WorkerPerformanceFrameTimingResponse {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['type', 'payload', 'timestamp']) &&
    value.type === 'performance-frame-timing' &&
    isWorkerPerformanceFrameTimingPayload(value.payload) &&
    isNonnegativeFiniteNumber(value.timestamp)
  );
}

export function isStatsResponse(value: unknown): value is StatsResponse {
  return (
    isRecord(value) &&
    value.type === WorkerResponseType.STATS &&
    isRecord(value.payload) &&
    isNumber((value.payload as WorkerStatsPayload).fps) &&
    (isNumber((value.payload as WorkerStatsPayload).frameTime) || isString((value.payload as WorkerStatsPayload).frameTime))
  );
}

export function isFrameErrorResponse(value: unknown): value is FrameErrorResponse {
  return (
    isRecord(value) &&
    value.type === WorkerResponseType.ERROR &&
    isRecord(value.payload) &&
    isString((value.payload as WorkerErrorPayload).message)
  );
}
