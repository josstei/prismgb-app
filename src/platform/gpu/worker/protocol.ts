import type { FrameDispositionOutcome, RenderBackend, RenderPreset } from '../domain/types';

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

export type FramePayload = { imageBitmap: ImageBitmap; frameToken?: number };
type HarnessFramePayload = { imageBitmap: ImageBitmap; frameToken: number };
export type ResizePayload = { width: number; height: number; scaleFactor: number };
export type PresetPayload = { presetId: string; preset: RenderPreset };
export type WorkerReadyPayload = { backend: WorkerRenderBackend };
export type WorkerStatsPayload = { fps: number; frameTime: number | string; gpuTime?: number; uploadTime?: number };
export type WorkerErrorPayload = { message: string; stack?: string; code?: string; adapterInfo?: object | null };
export type WorkerCaptureReadyPayload = { bitmap: ImageBitmap };

export type EmptyWorkerPayload = undefined | Record<string, never>;
type FrameAcknowledgementPayload = { frameToken: number; outcome: FrameDispositionOutcome };

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
  resize(payload: ResizePayload): Promise<void>;
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

export function isFrameToken(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
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

function isFrameAcknowledgementPayload(value: unknown): value is FrameAcknowledgementPayload {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['frameToken', 'outcome']) &&
    isFrameToken(value.frameToken) &&
    isFrameDispositionOutcome(value.outcome)
  );
}

export function isFramePayload(value: unknown): value is FramePayload {
  return (
    isRecord(value) &&
    isImageBitmapLike(value.imageBitmap) &&
    (!isPerformanceHarnessBuild || isHarnessFramePayload(value))
  );
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
