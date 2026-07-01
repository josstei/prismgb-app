import type { RenderBackend, RenderPreset } from '../domain/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export const WorkerMessageType = Object.freeze({
  INIT: 'init',
  FRAME: 'frame',
  RESIZE: 'resize',
  SET_PRESET: 'setPreset',
  SET_BRIGHTNESS: 'setBrightness',
  REQUEST_CAPTURE: 'requestCapture',
  CAPTURE: 'capture',
  RELEASE: 'release',
  DESTROY: 'destroy'
} as const);

export type WorkerMessageTypeValue = typeof WorkerMessageType[keyof typeof WorkerMessageType];

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

export type InitPayload = {
  canvas?: OffscreenCanvas;
  config: WorkerRendererConfig;
};

export type FramePayload = {
  imageBitmap: ImageBitmap;
};

export type BrightnessPayload = {
  brightness: number;
};

export type ResizePayload = {
  width: number;
  height: number;
  scaleFactor: number;
};

export type PresetPayload = {
  presetId: string;
  preset: RenderPreset;
};

export type EmptyWorkerPayload = undefined | Record<string, never>;

export type WorkerMessagePayloadMap = {
  [WorkerMessageType.INIT]: InitPayload;
  [WorkerMessageType.FRAME]: FramePayload;
  [WorkerMessageType.RESIZE]: ResizePayload;
  [WorkerMessageType.SET_PRESET]: PresetPayload;
  [WorkerMessageType.SET_BRIGHTNESS]: BrightnessPayload;
  [WorkerMessageType.REQUEST_CAPTURE]: EmptyWorkerPayload;
  [WorkerMessageType.CAPTURE]: EmptyWorkerPayload;
  [WorkerMessageType.RELEASE]: EmptyWorkerPayload;
  [WorkerMessageType.DESTROY]: EmptyWorkerPayload;
};

export type WorkerMessage<K extends WorkerMessageTypeValue = WorkerMessageTypeValue> = {
  [Type in WorkerMessageTypeValue]: WorkerMessagePayloadMap[Type] extends EmptyWorkerPayload
    ? {
        type: Type;
        payload?: WorkerMessagePayloadMap[Type];
        timestamp: number;
      }
    : {
        type: Type;
        payload: WorkerMessagePayloadMap[Type];
        timestamp: number;
      };
}[K];

export type WorkerReadyPayload = {
  backend: WorkerRenderBackend;
};

export type WorkerStatsPayload = {
  fps: number;
  frameTime: number | string;
  gpuTime?: number;
  uploadTime?: number;
};

export type WorkerErrorPayload = {
  message: string;
  stack?: string;
  code?: string;
  adapterInfo?: object | null;
};

export type WorkerCaptureReadyPayload = {
  bitmap: ImageBitmap;
};

export type WorkerResponsePayloadMap = {
  [WorkerResponseType.READY]: WorkerReadyPayload;
  [WorkerResponseType.FRAME_RENDERED]: EmptyWorkerPayload;
  [WorkerResponseType.ERROR]: WorkerErrorPayload;
  [WorkerResponseType.STATS]: WorkerStatsPayload;
  [WorkerResponseType.CAPTURE_REQUESTED]: EmptyWorkerPayload;
  [WorkerResponseType.CAPTURE_READY]: WorkerCaptureReadyPayload;
  [WorkerResponseType.RELEASED]: EmptyWorkerPayload;
  [WorkerResponseType.DESTROYED]: EmptyWorkerPayload;
};

export type WorkerResponse<K extends WorkerResponseTypeValue = WorkerResponseTypeValue> = {
  [Type in WorkerResponseTypeValue]: WorkerResponsePayloadMap[Type] extends EmptyWorkerPayload
    ? {
        type: Type;
        payload?: WorkerResponsePayloadMap[Type];
        timestamp: number;
      }
    : {
        type: Type;
        payload: WorkerResponsePayloadMap[Type];
        timestamp: number;
      };
}[K];

type WorkerMessageTypesWithRequiredPayload = {
  [Type in WorkerMessageTypeValue]: WorkerMessagePayloadMap[Type] extends EmptyWorkerPayload
    ? never
    : Type;
}[WorkerMessageTypeValue];

type WorkerMessageTypesWithOptionalPayload = Exclude<
  WorkerMessageTypeValue,
  WorkerMessageTypesWithRequiredPayload
>;

type WorkerResponseTypesWithRequiredPayload = {
  [Type in WorkerResponseTypeValue]: WorkerResponsePayloadMap[Type] extends EmptyWorkerPayload
    ? never
    : Type;
}[WorkerResponseTypeValue];

type WorkerResponseTypesWithOptionalPayload = Exclude<
  WorkerResponseTypeValue,
  WorkerResponseTypesWithRequiredPayload
>;

export function createWorkerMessage<K extends WorkerMessageTypesWithRequiredPayload>(
  type: K,
  payload: WorkerMessagePayloadMap[K]
): WorkerMessage<K>;
export function createWorkerMessage<K extends WorkerMessageTypesWithOptionalPayload>(
  type: K,
  payload?: WorkerMessagePayloadMap[K]
): WorkerMessage<K>;
export function createWorkerMessage<K extends WorkerMessageTypeValue>(
  type: K,
  payload?: WorkerMessagePayloadMap[K]
): WorkerMessage<K>;
export function createWorkerMessage(
  type: WorkerMessageTypeValue,
  payload?: WorkerMessagePayloadMap[WorkerMessageTypeValue]
): WorkerMessage {
  return {
    type,
    payload,
    timestamp: performance.now()
  } as WorkerMessage;
}

export function createWorkerResponse<K extends WorkerResponseTypesWithRequiredPayload>(
  type: K,
  payload: WorkerResponsePayloadMap[K]
): WorkerResponse<K>;
export function createWorkerResponse<K extends WorkerResponseTypesWithOptionalPayload>(
  type: K,
  payload?: WorkerResponsePayloadMap[K]
): WorkerResponse<K>;
export function createWorkerResponse<K extends WorkerResponseTypeValue>(
  type: K,
  payload?: WorkerResponsePayloadMap[K]
): WorkerResponse<K>;
export function createWorkerResponse(
  type: WorkerResponseTypeValue,
  payload?: WorkerResponsePayloadMap[WorkerResponseTypeValue]
): WorkerResponse {
  return {
    type,
    payload,
    timestamp: performance.now()
  } as WorkerResponse;
}

export function isWorkerRenderBackend(value: unknown): value is WorkerRenderBackend {
  return value === 'webgpu';
}

function isImageBitmapLike(value: unknown): value is ImageBitmap {
  return isRecord(value) && typeof value.close === 'function';
}

function isEmptyWorkerPayload(value: unknown): value is EmptyWorkerPayload {
  return value === undefined || isRecord(value);
}

const WORKER_MESSAGE_TYPES: readonly string[] = Object.values(WorkerMessageType);
const WORKER_RESPONSE_TYPES: readonly string[] = Object.values(WorkerResponseType);

export function isWorkerMessageType(value: unknown): value is WorkerMessageTypeValue {
  return isString(value) && WORKER_MESSAGE_TYPES.includes(value);
}

export function isWorkerResponseType(value: unknown): value is WorkerResponseTypeValue {
  return isString(value) && WORKER_RESPONSE_TYPES.includes(value);
}

export function isWorkerRendererConfig(value: unknown): value is WorkerRendererConfig {
  return (
    isRecord(value) &&
    isNumber(value.nativeWidth) &&
    isNumber(value.nativeHeight) &&
    isNumber(value.targetWidth) &&
    isNumber(value.targetHeight) &&
    isNumber(value.scaleFactor) &&
    isWorkerRenderBackend(value.backend) &&
    isString(value.presetId)
  );
}

export function isInitPayload(value: unknown): value is InitPayload {
  return (
    isRecord(value) &&
    isWorkerRendererConfig(value.config) &&
    (value.canvas === undefined || isRecord(value.canvas))
  );
}

export function isFramePayload(value: unknown): value is FramePayload {
  return (
    isRecord(value) &&
    isImageBitmapLike(value.imageBitmap)
  );
}

export function isResizePayload(value: unknown): value is ResizePayload {
  return (
    isRecord(value) &&
    isNumber(value.width) &&
    isNumber(value.height) &&
    isNumber(value.scaleFactor)
  );
}

export function isPresetPayload(value: unknown): value is PresetPayload {
  return isRecord(value) && isString(value.presetId) && isRecord(value.preset);
}

export function isWorkerMessagePayload<K extends WorkerMessageTypeValue>(
  type: K,
  payload: unknown
): payload is WorkerMessagePayloadMap[K] {
  switch (type) {
    case WorkerMessageType.INIT:
      return isInitPayload(payload);
    case WorkerMessageType.FRAME:
      return isFramePayload(payload);
    case WorkerMessageType.RESIZE:
      return isResizePayload(payload);
    case WorkerMessageType.SET_PRESET:
      return isPresetPayload(payload);
    case WorkerMessageType.SET_BRIGHTNESS:
      return isRecord(payload) && isNumber(payload.brightness);
    case WorkerMessageType.REQUEST_CAPTURE:
    case WorkerMessageType.CAPTURE:
    case WorkerMessageType.RELEASE:
    case WorkerMessageType.DESTROY:
      return isEmptyWorkerPayload(payload);
  }
}

export function isWorkerReadyPayload(value: unknown): value is WorkerReadyPayload {
  return isRecord(value) && isWorkerRenderBackend(value.backend);
}

export function isWorkerStatsPayload(value: unknown): value is WorkerStatsPayload {
  return (
    isRecord(value) &&
    isNumber(value.fps) &&
    (isNumber(value.frameTime) || isString(value.frameTime))
  );
}

export function isWorkerErrorPayload(value: unknown): value is WorkerErrorPayload {
  return isRecord(value) && isString(value.message);
}

export function isWorkerCaptureReadyPayload(value: unknown): value is WorkerCaptureReadyPayload {
  return isRecord(value) && isImageBitmapLike(value.bitmap);
}

export function isWorkerResponsePayload<K extends WorkerResponseTypeValue>(
  type: K,
  payload: unknown
): payload is WorkerResponsePayloadMap[K] {
  switch (type) {
    case WorkerResponseType.READY:
      return isWorkerReadyPayload(payload);
    case WorkerResponseType.FRAME_RENDERED:
    case WorkerResponseType.CAPTURE_REQUESTED:
    case WorkerResponseType.RELEASED:
    case WorkerResponseType.DESTROYED:
      return isEmptyWorkerPayload(payload);
    case WorkerResponseType.ERROR:
      return isWorkerErrorPayload(payload);
    case WorkerResponseType.STATS:
      return isWorkerStatsPayload(payload);
    case WorkerResponseType.CAPTURE_READY:
      return isWorkerCaptureReadyPayload(payload);
  }
}

export function isValidWorkerMessage(message: unknown): message is WorkerMessage {
  if (!isRecord(message) || !isWorkerMessageType(message.type)) {
    return false;
  }

  return isWorkerMessagePayload(message.type, message.payload);
}

export function isValidWorkerResponse(response: unknown): response is WorkerResponse {
  if (!isRecord(response) || !isWorkerResponseType(response.type)) {
    return false;
  }

  return isWorkerResponsePayload(response.type, response.payload);
}
