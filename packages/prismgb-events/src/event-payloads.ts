import type { LeafValues, AssertNever } from '@prismgb/core';
import type { DeviceInfoPayload } from '@prismgb/devices';
import { EventChannels } from './event-channels.js';
import { getEventManifestScopeValues } from './event.manifest.js';
export interface UpdateInfoPayload {
  version?: string;
  releaseDate?: string;
  releaseNotes?: unknown;
  reason?: string;
}

export interface UpdateProgressPayload {
  percent?: number;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
}

export interface UpdateErrorPayload {
  message?: string;
  code?: string;
}

export interface TranscodeProgressPayload {
  jobId?: string;
  percent: number;
  timeUs?: number;
  elapsedMs?: number;
}

export interface TranscodeCompletedPayload {
  jobId?: string;
  filePath?: string | null;
  outputPath?: string;
}

export interface TranscodeCancelledPayload {
  jobId?: string;
}

export interface TranscodeErrorPayload {
  jobId?: string;
  error?: string;
  message?: string;
}

export type EventChannelValue = LeafValues<typeof EventChannels>;

export type Dimensions = {
  width: number;
  height: number;
};

export type NativeResolution = Dimensions;

export type RenderApi = 'webgpu' | 'webgl2' | 'canvas2d';

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
  preferredAPI?: RenderApi;
  webgpu?: boolean;
  webgl2?: boolean;
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
  [key: string]: unknown;
};

export type RenderPipelineReadyPayload = {
  api: RenderApi | string;
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

export type UiDeviceStatusPayload = { status: unknown };

export type UiOverlayMessagePayload = {
  deviceConnected?: boolean;
  message?: string;
};

export type UiOverlayVisiblePayload = { visible: boolean };

export type UiOverlayErrorPayload = { message: string };

export type UiStreamingModePayload = { enabled: boolean };

export type UiStreamInfoPayload = { settings?: Record<string, unknown> };

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

// CODEBASE_EVENT_PAYLOAD_MAP:START
type VoidEventChannel = typeof EventChannels.DEVICE.DISCONNECTED_DURING_SESSION | typeof EventChannels.STREAM.STOPPED | typeof EventChannels.CAPTURE.SCREENSHOT_TRIGGERED | typeof EventChannels.CAPTURE.RECORDING_STARTED | typeof EventChannels.CAPTURE.RECORDING_STOPPED | typeof EventChannels.RENDER.CANVAS_EXPIRED | typeof EventChannels.UI.SHUTTER_FLASH | typeof EventChannels.UI.RECORD_BUTTON_POP | typeof EventChannels.UI.RECORD_BUTTON_PRESS | typeof EventChannels.UI.RECORD_BUTTON_DISABLED | typeof EventChannels.UI.RECORD_BUTTON_ENABLED | typeof EventChannels.UI.WINDOW_RESIZED | typeof EventChannels.UI.SCREENSHOT_REQUESTED | typeof EventChannels.UI.RECORDING_TOGGLE_REQUESTED | typeof EventChannels.UI.FULLSCREEN_TOGGLE_REQUESTED | typeof EventChannels.UI.CINEMATIC_TOGGLE_REQUESTED | typeof EventChannels.UI.STREAM_START_REQUESTED | typeof EventChannels.UI.STREAM_STOP_REQUESTED | typeof EventChannels.UPDATE.BADGE_SHOW | typeof EventChannels.UPDATE.BADGE_HIDE;

type EventPayloadOverrides = {
  [EventChannels.SYSTEM.HANDLER_ERROR]: HandlerErrorPayload;
  [EventChannels.DEVICE.CONNECTED]: DeviceInfoPayload;
  [EventChannels.DEVICE.DISCONNECTED]: DeviceInfoPayload | null | undefined;
  [EventChannels.DEVICE.SUPPORTED_DEVICE_AVAILABLE]: SupportedDeviceAvailablePayload;
  [EventChannels.DEVICE.ENUMERATION_FAILED]: DeviceEnumerationFailedPayload;
  [EventChannels.STREAM.STARTED]: StreamStartedPayload;
  [EventChannels.STREAM.ERROR]: StreamErrorPayload;
  [EventChannels.STREAM.HEALTH_OK]: StreamHealthOkPayload;
  [EventChannels.STREAM.HEALTH_TIMEOUT]: StreamHealthTimeoutPayload;
  [EventChannels.CAPTURE.SCREENSHOT_READY]: ScreenshotReadyPayload;
  [EventChannels.CAPTURE.RECORDING_READY]: RecordingReadyPayload;
  [EventChannels.CAPTURE.RECORDING_ERROR]: RecordingErrorPayload;
  [EventChannels.CAPTURE.RECORDING_DEGRADED]: RecordingDegradedPayload;
  [EventChannels.SETTINGS.VOLUME_CHANGED]: number;
  [EventChannels.SETTINGS.RENDER_PRESET_CHANGED]: string;
  [EventChannels.SETTINGS.BRIGHTNESS_CHANGED]: number;
  [EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED]: boolean;
  [EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED]: { enabled: boolean };
  [EventChannels.SETTINGS.MINIMALIST_FULLSCREEN_CHANGED]: boolean;
  [EventChannels.SETTINGS.PREFERENCES_LOADED]: Record<string, unknown>;
  [EventChannels.SETTINGS.RECORDING_FORMAT_CHANGED]: string;
  [EventChannels.PERFORMANCE.STATE_CHANGED]: PerformanceStatePayload;
  [EventChannels.PERFORMANCE.UI_MODE_CHANGED]: PerformanceUiModePayload;
  [EventChannels.PERFORMANCE.RENDER_MODE_CHANGED]: boolean;
  [EventChannels.PERFORMANCE.MEMORY_SNAPSHOT_REQUESTED]: MemorySnapshotRequestPayload;
  [EventChannels.RENDER.CAPABILITY_DETECTED]: StreamingCapabilities;
  [EventChannels.RENDER.PIPELINE_READY]: RenderPipelineReadyPayload;
  [EventChannels.RENDER.PIPELINE_ERROR]: RenderPipelineErrorPayload;
  [EventChannels.RENDER.STATS_UPDATE]: RenderStatsPayload;
  [EventChannels.RENDER.CANVAS_RECREATED]: CanvasRecreatedPayload;
  [EventChannels.UI.STATUS_MESSAGE]: UiStatusMessagePayload;
  [EventChannels.UI.DEVICE_STATUS]: UiDeviceStatusPayload;
  [EventChannels.UI.OVERLAY_MESSAGE]: UiOverlayMessagePayload;
  [EventChannels.UI.OVERLAY_VISIBLE]: UiOverlayVisiblePayload;
  [EventChannels.UI.OVERLAY_ERROR]: UiOverlayErrorPayload;
  [EventChannels.UI.STREAMING_MODE]: UiStreamingModePayload;
  [EventChannels.UI.STREAM_INFO]: UiStreamInfoPayload;
  [EventChannels.UI.BUTTON_FEEDBACK]: UiButtonFeedbackPayload;
  [EventChannels.UI.RECORDING_STATE]: UiRecordingStatePayload;
  [EventChannels.UI.FULLSCREEN_STATE]: UiFullscreenStatePayload;
  [EventChannels.UPDATE.AVAILABLE]: UpdateInfoPayload;
  [EventChannels.UPDATE.NOT_AVAILABLE]: UpdateInfoPayload;
  [EventChannels.UPDATE.PROGRESS]: UpdateProgressPayload;
  [EventChannels.UPDATE.DOWNLOADED]: UpdateInfoPayload;
  [EventChannels.UPDATE.ERROR]: UpdateErrorPayload;
  [EventChannels.NOTES.NOTE_DELETED]: NotesDeletedPayload;
  [EventChannels.TRANSCODE.STARTED]: TranscodeStartedPayload;
  [EventChannels.TRANSCODE.PROGRESS]: TranscodeProgressPayload;
  [EventChannels.TRANSCODE.COMPLETED]: TranscodeCompletedPayload;
  [EventChannels.TRANSCODE.ERROR]: TranscodeErrorPayload;
  [EventChannels.TRANSCODE.CANCELLED]: TranscodeCancelledPayload;
};
// CODEBASE_EVENT_PAYLOAD_MAP:END

export type EventPayloadMap = {
  [K in EventChannelValue]: K extends keyof EventPayloadOverrides
    ? EventPayloadOverrides[K]
    : K extends VoidEventChannel
      ? void
      : unknown;
};

export type MissingEventPayloads = Exclude<EventChannelValue, keyof EventPayloadMap>;
export type ExtraEventPayloads = Exclude<keyof EventPayloadMap, EventChannelValue>;

function collectLeafChannels(node: unknown): string[] {
  if (typeof node === 'string') {
    return [node];
  }

  if (!node || typeof node !== 'object') {
    return [];
  }

  return Object.values(node).flatMap((value) => collectLeafChannels(value));
}

const rendererManifestChannels = getEventManifestScopeValues('renderer');
const runtimeEventChannels = collectLeafChannels(EventChannels);
const rendererManifestChannelSet = new Set(rendererManifestChannels);
const runtimeEventChannelSet = new Set(runtimeEventChannels);

const manifestOnlyChannels = rendererManifestChannels.filter((channel) => !runtimeEventChannelSet.has(channel));
const runtimeOnlyChannels = runtimeEventChannels.filter((channel) => !rendererManifestChannelSet.has(channel));

if (manifestOnlyChannels.length > 0 || runtimeOnlyChannels.length > 0) {
  throw new Error(
    `Renderer event payload channel drift detected. Manifest-only: [${manifestOnlyChannels.join(', ')}], ` +
      `runtime-only: [${runtimeOnlyChannels.join(', ')}]`
  );
}

export const EVENT_PAYLOAD_CHANNELS = rendererManifestChannels as readonly EventChannelValue[];

export type MissingRuntimeEventPayloadChannels = Exclude<
  EventChannelValue,
  (typeof EVENT_PAYLOAD_CHANNELS)[number]
>;
export type ExtraRuntimeEventPayloadChannels = Exclude<
  (typeof EVENT_PAYLOAD_CHANNELS)[number],
  EventChannelValue
>;

export type EventPayloadExhaustivenessCheck = AssertNever<
  | MissingEventPayloads
  | ExtraEventPayloads
  | MissingRuntimeEventPayloadChannels
  | ExtraRuntimeEventPayloadChannels
>;

export type EventPayload<K extends keyof EventPayloadMap> = EventPayloadMap[K];

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
