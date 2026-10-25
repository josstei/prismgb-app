import type { RenderPreset } from '../domain/types';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isBitmap = (value: unknown): value is ImageBitmap => isRecord(value) && typeof value.close === 'function';

export const WorkerMessageType = {
  INIT: 'init', FRAME: 'frame', RESIZE: 'resize', SET_PRESET: 'setPreset',
  SET_BRIGHTNESS: 'setBrightness', CAPTURE: 'capture'
} as const;
export const WorkerResponseType = {
  READY: 'ready', FRAME_RENDERED: 'frameRendered', ERROR: 'error', STATS: 'stats', CAPTURE_READY: 'captureReady'
} as const;
export type WorkerRenderBackend = 'webgpu';
export type WorkerRendererConfig = {
  nativeWidth: number; nativeHeight: number; targetWidth: number; targetHeight: number;
  backend: WorkerRenderBackend; presetId: string;
};
export type InitPayload = { canvas: OffscreenCanvas; config: WorkerRendererConfig };
export type FramePayload = { imageBitmap: ImageBitmap };
export type ResizePayload = { width: number; height: number };
export type PresetPayload = { preset: RenderPreset };
export type WorkerStatsPayload = { fps: number; frameTime: number; gpuTime?: number; uploadTime?: number };
export type WorkerErrorPayload = { message: string; stack?: string; code?: string; requestId?: number };
export type WorkerCaptureReadyPayload = { bitmap: ImageBitmap; requestId: number };

type Guard<T> = (value: unknown) => value is T;
function payload<T>(guard: (value: unknown) => boolean): Guard<T> { return guard as Guard<T>; }
const empty = payload<undefined>((value) => value === undefined);
const messagePayloads = {
  init: payload<InitPayload>((value) => isRecord(value) && isRecord(value.canvas) && isWorkerRendererConfig(value.config)),
  frame: payload<FramePayload>((value) => isRecord(value) && isBitmap(value.imageBitmap)),
  resize: payload<ResizePayload>((value) => isRecord(value) && isNumber(value.width) && isNumber(value.height)),
  setPreset: payload<PresetPayload>((value) => isRecord(value) && isRenderPreset(value.preset)),
  setBrightness: payload<{ brightness: number }>((value) => isRecord(value) && isNumber(value.brightness)),
  capture: payload<{ requestId: number }>((value) => isRecord(value) && isNumber(value.requestId))
};
const responsePayloads = {
  ready: payload<{ backend: WorkerRenderBackend }>((value) => isRecord(value) && value.backend === 'webgpu'),
  frameRendered: empty,
  error: payload<WorkerErrorPayload>((value) => isRecord(value) && typeof value.message === 'string' && (value.requestId === undefined || isNumber(value.requestId))),
  stats: payload<WorkerStatsPayload>((value) => isRecord(value) && isNumber(value.fps) && isNumber(value.frameTime)),
  captureReady: payload<WorkerCaptureReadyPayload>((value) => isRecord(value) && isBitmap(value.bitmap) && isNumber(value.requestId))
};
type Payloads<T> = { [K in keyof T]: T[K] extends Guard<infer P> ? P : never };
export type WorkerMessagePayloadMap = Payloads<typeof messagePayloads>;
export type WorkerResponsePayloadMap = Payloads<typeof responsePayloads>;
export type WorkerMessageTypeValue = keyof WorkerMessagePayloadMap;
export type WorkerResponseTypeValue = keyof WorkerResponsePayloadMap;
type Envelope<M, K extends keyof M = keyof M> = { [P in K]: M[P] extends undefined ? { type: P; payload?: M[P] } : { type: P; payload: M[P] } }[K];
export type WorkerMessage<K extends WorkerMessageTypeValue = WorkerMessageTypeValue> = Envelope<WorkerMessagePayloadMap, K>;
export type WorkerResponse<K extends WorkerResponseTypeValue = WorkerResponseTypeValue> = Envelope<WorkerResponsePayloadMap, K>;
export function createWorkerMessage<K extends WorkerMessageTypeValue>(type: K, ...args: WorkerMessagePayloadMap[K] extends undefined ? [payload?: WorkerMessagePayloadMap[K]] : [payload: WorkerMessagePayloadMap[K]]): WorkerMessage<K> {
  return { type, payload: args[0] } as WorkerMessage<K>;
}
export function createWorkerResponse<K extends WorkerResponseTypeValue>(type: K, ...args: WorkerResponsePayloadMap[K] extends undefined ? [payload?: WorkerResponsePayloadMap[K]] : [payload: WorkerResponsePayloadMap[K]]): WorkerResponse<K> {
  return { type, payload: args[0] } as WorkerResponse<K>;
}
export function isWorkerRendererConfig(value: unknown): value is WorkerRendererConfig {
  return isRecord(value) && ['nativeWidth', 'nativeHeight', 'targetWidth', 'targetHeight'].every((key) => isNumber(value[key]) && (value[key] as number) > 0) && value.backend === 'webgpu' && typeof value.presetId === 'string';
}
function isRenderPreset(value: unknown): value is RenderPreset {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.description !== 'string') return false;
  const fields = { upscale: [], unsharp: ['strength'], color: ['gamma', 'saturation', 'greenBias', 'brightness', 'contrast'], crt: ['scanlineStrength', 'pixelMaskStrength', 'bloomStrength', 'curvature', 'vignetteStrength'] };
  return Object.entries(fields).every(([key, numbers]) => {
    const block = value[key];
    return isRecord(block) && typeof block.enabled === 'boolean' && numbers.every((field) => isNumber(block[field]));
  });
}
export function isValidWorkerMessage(value: unknown): value is WorkerMessage {
  return isRecord(value) && typeof value.type === 'string' && Object.hasOwn(messagePayloads, value.type) && messagePayloads[value.type as WorkerMessageTypeValue](value.payload);
}
export function isValidWorkerResponse(value: unknown): value is WorkerResponse {
  return isRecord(value) && typeof value.type === 'string' && Object.hasOwn(responsePayloads, value.type) && responsePayloads[value.type as WorkerResponseTypeValue](value.payload);
}
