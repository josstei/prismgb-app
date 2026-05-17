import type { IPreset, PipelineUniforms, RenderAPI } from '@prismgb/gpu';

export const WorkerMessageType = Object.freeze({
  INIT: 'init',
  FRAME: 'frame',
  RESIZE: 'resize',
  SET_PRESET: 'setPreset',
  REQUEST_CAPTURE: 'requestCapture',
  CAPTURE: 'capture',
  RELEASE: 'release',
  DESTROY: 'destroy'
} as const);

// eslint-disable-next-line @typescript-eslint/no-redeclare
export type WorkerMessageType = typeof WorkerMessageType[keyof typeof WorkerMessageType];

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

// eslint-disable-next-line @typescript-eslint/no-redeclare
export type WorkerResponseType = typeof WorkerResponseType[keyof typeof WorkerResponseType];

export type WorkerRenderAPI = Extract<RenderAPI, 'webgpu' | 'webgl2'>;

export type WorkerRendererConfig = {
  nativeWidth: number;
  nativeHeight: number;
  targetWidth: number;
  targetHeight: number;
  scaleFactor: number;
  api: WorkerRenderAPI;
  presetId: string;
};

export type InitPayload = {
  canvas?: OffscreenCanvas;
  config: WorkerRendererConfig;
};

export type FramePayload = {
  imageBitmap: ImageBitmap;
  uniforms: PipelineUniforms;
};

export type ResizePayload = {
  width: number;
  height: number;
  scaleFactor: number;
};

export type PresetPayload = {
  presetId: string;
  preset: IPreset;
};

export type EmptyWorkerPayload = undefined | Record<string, never>;

export type WorkerMessagePayloadMap = {
  [WorkerMessageType.INIT]: InitPayload;
  [WorkerMessageType.FRAME]: FramePayload;
  [WorkerMessageType.RESIZE]: ResizePayload;
  [WorkerMessageType.SET_PRESET]: PresetPayload;
  [WorkerMessageType.REQUEST_CAPTURE]: EmptyWorkerPayload;
  [WorkerMessageType.CAPTURE]: EmptyWorkerPayload;
  [WorkerMessageType.RELEASE]: EmptyWorkerPayload;
  [WorkerMessageType.DESTROY]: EmptyWorkerPayload;
};

export type WorkerMessage<K extends WorkerMessageType = WorkerMessageType> = {
  [Type in WorkerMessageType]: WorkerMessagePayloadMap[Type] extends EmptyWorkerPayload
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
  api: WorkerRenderAPI;
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

export type WorkerResponse<K extends WorkerResponseType = WorkerResponseType> = {
  [Type in WorkerResponseType]: WorkerResponsePayloadMap[Type] extends EmptyWorkerPayload
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
  [Type in WorkerMessageType]: WorkerMessagePayloadMap[Type] extends EmptyWorkerPayload
    ? never
    : Type;
}[WorkerMessageType];

type WorkerMessageTypesWithOptionalPayload = Exclude<
  WorkerMessageType,
  WorkerMessageTypesWithRequiredPayload
>;

type WorkerResponseTypesWithRequiredPayload = {
  [Type in WorkerResponseType]: WorkerResponsePayloadMap[Type] extends EmptyWorkerPayload
    ? never
    : Type;
}[WorkerResponseType];

type WorkerResponseTypesWithOptionalPayload = Exclude<
  WorkerResponseType,
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
export function createWorkerMessage<K extends WorkerMessageType>(
  type: K,
  payload?: WorkerMessagePayloadMap[K]
): WorkerMessage<K>;
export function createWorkerMessage(
  type: WorkerMessageType,
  payload?: WorkerMessagePayloadMap[WorkerMessageType]
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
export function createWorkerResponse<K extends WorkerResponseType>(
  type: K,
  payload?: WorkerResponsePayloadMap[K]
): WorkerResponse<K>;
export function createWorkerResponse(
  type: WorkerResponseType,
  payload?: WorkerResponsePayloadMap[WorkerResponseType]
): WorkerResponse {
  return {
    type,
    payload,
    timestamp: performance.now()
  } as WorkerResponse;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isWorkerRenderAPI(value: unknown): value is WorkerRenderAPI {
  return value === 'webgpu' || value === 'webgl2';
}

function isImageBitmapLike(value: unknown): value is ImageBitmap {
  return isRecord(value) && typeof value.close === 'function';
}

function isEmptyWorkerPayload(value: unknown): value is EmptyWorkerPayload {
  return value === undefined || isRecord(value);
}

const WORKER_MESSAGE_TYPES: readonly string[] = Object.values(WorkerMessageType);
const WORKER_RESPONSE_TYPES: readonly string[] = Object.values(WorkerResponseType);

export function isWorkerMessageType(value: unknown): value is WorkerMessageType {
  return isString(value) && WORKER_MESSAGE_TYPES.includes(value);
}

export function isWorkerResponseType(value: unknown): value is WorkerResponseType {
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
    isWorkerRenderAPI(value.api) &&
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
    isImageBitmapLike(value.imageBitmap) &&
    isRecord(value.uniforms)
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

export function isWorkerMessagePayload<K extends WorkerMessageType>(
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
    case WorkerMessageType.REQUEST_CAPTURE:
    case WorkerMessageType.CAPTURE:
    case WorkerMessageType.RELEASE:
    case WorkerMessageType.DESTROY:
      return isEmptyWorkerPayload(payload);
  }
}

export function isWorkerReadyPayload(value: unknown): value is WorkerReadyPayload {
  return isRecord(value) && isWorkerRenderAPI(value.api);
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

export function isWorkerResponsePayload<K extends WorkerResponseType>(
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
