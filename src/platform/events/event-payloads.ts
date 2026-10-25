import type { DeviceStatus } from '@platform/devices';
import type { DefinedEventPayloadMap } from './event.manifest.js';
export type { UpdateInfoPayload, UpdateProgressPayload, UpdateErrorPayload, TranscodeProgressPayload, TranscodeCompletedPayload, TranscodeCancelledPayload, TranscodeErrorPayload } from '@platform/ipc';

export type Dimensions = {
  width: number;
  height: number;
};

export type NativeResolution = Dimensions;

export type RenderBackend = 'webgpu' | 'canvas2d';

export type HandlerErrorPayload = {
  eventName: string;
  error: {
    name?: string;
    message: string;
    stack?: string;
  };
};

export type StreamingCapabilities = {
  nativeResolution?: NativeResolution;
  frameRate?: number;
  preferredBackend?: RenderBackend;
  webgpu?: boolean;
  transferControlToOffscreen?: boolean;
  offscreenCanvas?: boolean;
  worker?: boolean;
  supportsGPU?: boolean;
};

export type StreamSettingsPayload = {
  video?: Record<string, unknown> | null;
  audio?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type StreamStartedPayload = {
  stream: MediaStream;
  device: MediaDeviceInfo;
  settings: StreamSettingsPayload | null;
  capabilities: StreamingCapabilities;
  strategy?: string;
};

export type StreamErrorPayload = {
  error?: unknown;
  operation?: string;
  deviceId?: string;
  message: string;
};

export type StreamHealthOkPayload = {
  frameCount?: number;
  elapsedMs?: number;
  [key: string]: unknown;
};

export type StreamHealthTimeoutPayload = {
  reason: string;
  elapsedMs?: number;
  [key: string]: unknown;
};

export type PerformanceStatePayload = {
  hidden?: boolean;
  idle?: boolean;
  performanceModeEnabled?: boolean;
  reducedMotion?: boolean;
  weakGpuDetected?: boolean;
  streaming?: boolean;
  [key: string]: unknown;
};

export type PerformanceUiModePayload = {
  enabled: boolean;
  weakGpuDetected: boolean;
};

export type MemorySnapshotRequestPayload = {
  reason?: string;
  label?: string;
  delayMs?: number;
  [key: string]: unknown;
};

export type SupportedDeviceAvailablePayload = {
  device: MediaDeviceInfo;
  videoDevices?: MediaDeviceInfo[];
  [key: string]: unknown;
};

export type DeviceEnumerationFailedPayload = { reason?: string; error?: string };

export type RenderStatsPayload = {
  fps?: number;
  frameTime?: number | string;
  gpuTime?: number;
  uploadTime?: number;
};

export type RenderPipelineReadyPayload = {
  backend: RenderBackend | string;
  [key: string]: unknown;
};

export type RenderPipelineErrorPayload = {
  message: string;
  stack?: string;
  code?: string;
  adapterInfo?: object | null;
};

export type CanvasRecreatedPayload = { oldCanvas: HTMLCanvasElement; newCanvas: HTMLCanvasElement };

export type RecordingReadyPayload = { blob: Blob; filename: string };

export type RecordingErrorPayload = {
  error?: unknown;
  message?: string;
  name?: string;
  filename?: string;
  [key: string]: unknown;
};

export type RecordingDegradedPayload = {
  reason?: string;
  message?: string;
  droppedFrames?: number;
};

export type ScreenshotReadyPayload = { blob: Blob; filename: string };

export type UiStatusMessagePayload = {
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error' | string;
};

export type UiDeviceStatusPayload = { status: DeviceStatus };

export type UiOverlayMessagePayload = {
  deviceConnected?: boolean;
  message?: string;
};

export type UiOverlayVisiblePayload = { visible: boolean };

export type UiOverlayErrorPayload = { message: string };

export type UiStreamingModePayload = { enabled: boolean };

export type UiStreamInfoPayload = { settings?: MediaTrackSettings };

export type UiButtonFeedbackPayload = {
  elementKey: string;
  className?: string;
  duration?: number;
  [key: string]: unknown;
};

export type UiRecordingStatePayload = { active: boolean };

export type UiFullscreenStatePayload = { active: boolean };

export type NotesDeletedPayload = { id: string };

export type TranscodeStartedPayload = { jobId: string; format: string };

export type EventPayloadMap = DefinedEventPayloadMap;

type PublishArgs<K extends keyof EventPayloadMap> = EventPayloadMap[K] extends void
  ? [event: K, data?: EventPayloadMap[K]]
  : [event: K, data: EventPayloadMap[K]];

type EventHandler<K extends keyof EventPayloadMap> = EventPayloadMap[K] extends void
  ? () => void | Promise<void>
  : (payload: EventPayloadMap[K]) => void | Promise<void>;

export interface TypedEventBusLike {
  publish<K extends keyof EventPayloadMap>(...args: PublishArgs<K>): void;
  publishAsync<K extends keyof EventPayloadMap>(...args: PublishArgs<K>): Promise<void>;
  subscribe<K extends keyof EventPayloadMap>(event: K, handler: EventHandler<K>): () => void;
}
