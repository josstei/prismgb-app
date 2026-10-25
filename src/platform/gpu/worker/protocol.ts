const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isBitmap = (value: unknown): value is ImageBitmap => isRecord(value) && typeof value.close === 'function';

export type WorkerRendererConfig = {
  nativeWidth: number; nativeHeight: number; targetWidth: number; targetHeight: number;
  presetId: string;
};
type InitPayload = { canvas: OffscreenCanvas; config: WorkerRendererConfig };
type FramePayload = { imageBitmap: ImageBitmap };
type ResizePayload = { width: number; height: number };
export type WorkerErrorPayload = { message: string; requestId?: number };
type WorkerCaptureReadyPayload = { bitmap: ImageBitmap; requestId: number };

type Guard<T> = (value: unknown) => value is T;
function payload<T>(guard: (value: unknown) => boolean): Guard<T> { return guard as Guard<T>; }
const empty = payload<undefined>((value) => value === undefined);
const messagePayloads = {
  init: payload<InitPayload>((value) => isRecord(value) && isRecord(value.canvas) && isWorkerRendererConfig(value.config)),
  frame: payload<FramePayload>((value) => isRecord(value) && isBitmap(value.imageBitmap)),
  resize: payload<ResizePayload>((value) => isRecord(value) && isNumber(value.width) && isNumber(value.height)),
  setPreset: payload<{ presetId: string }>((value) => isRecord(value) && typeof value.presetId === 'string'),
  setBrightness: payload<{ brightness: number }>((value) => isRecord(value) && isNumber(value.brightness)),
  capture: payload<{ requestId: number }>((value) => isRecord(value) && isNumber(value.requestId))
};
const responsePayloads = {
  ready: empty,
  frameRendered: empty,
  error: payload<WorkerErrorPayload>((value) => isRecord(value) && typeof value.message === 'string' && (value.requestId === undefined || isNumber(value.requestId))),
  captureReady: payload<WorkerCaptureReadyPayload>((value) => isRecord(value) && isBitmap(value.bitmap) && isNumber(value.requestId))
};
type Payloads<T> = { [K in keyof T]: T[K] extends Guard<infer P> ? P : never };
type WorkerMessagePayloadMap = Payloads<typeof messagePayloads>;
type WorkerResponsePayloadMap = Payloads<typeof responsePayloads>;
type WorkerMessageTypeValue = keyof WorkerMessagePayloadMap;
type WorkerResponseTypeValue = keyof WorkerResponsePayloadMap;
type Envelope<M, K extends keyof M = keyof M> = { [P in K]: M[P] extends undefined ? { type: P; payload?: M[P] } : { type: P; payload: M[P] } }[K];
export type WorkerMessage<K extends WorkerMessageTypeValue = WorkerMessageTypeValue> = Envelope<WorkerMessagePayloadMap, K>;
export type WorkerResponse<K extends WorkerResponseTypeValue = WorkerResponseTypeValue> = Envelope<WorkerResponsePayloadMap, K>;
export function createWorkerMessage<K extends WorkerMessageTypeValue>(type: K, ...args: WorkerMessagePayloadMap[K] extends undefined ? [payload?: WorkerMessagePayloadMap[K]] : [payload: WorkerMessagePayloadMap[K]]): WorkerMessage<K> {
  return { type, payload: args[0] } as WorkerMessage<K>;
}
export function createWorkerResponse<K extends WorkerResponseTypeValue>(type: K, ...args: WorkerResponsePayloadMap[K] extends undefined ? [payload?: WorkerResponsePayloadMap[K]] : [payload: WorkerResponsePayloadMap[K]]): WorkerResponse<K> {
  return { type, payload: args[0] } as WorkerResponse<K>;
}
function isWorkerRendererConfig(value: unknown): value is WorkerRendererConfig {
  return isRecord(value) && ['nativeWidth', 'nativeHeight', 'targetWidth', 'targetHeight'].every((key) => isNumber(value[key]) && (value[key] as number) > 0) && typeof value.presetId === 'string';
}
export function isValidWorkerMessage(value: unknown): value is WorkerMessage {
  return isRecord(value) && typeof value.type === 'string' && Object.hasOwn(messagePayloads, value.type) && messagePayloads[value.type as WorkerMessageTypeValue](value.payload);
}
export function isValidWorkerResponse(value: unknown): value is WorkerResponse {
  return isRecord(value) && typeof value.type === 'string' && Object.hasOwn(responsePayloads, value.type) && responsePayloads[value.type as WorkerResponseTypeValue](value.payload);
}
