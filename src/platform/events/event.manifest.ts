import type { UserNote } from '@platform/notes';
import type { DeviceInfoPayload, DeviceStatus } from '@platform/devices';
import type { UpdateStatusPayload } from '@platform/ipc';
import type * as Payloads from './event-payloads.js';

function event<TPayload>() {
  return <const TDomain extends string, const TName extends string>(domain: TDomain, name: TName) => ({
    domain, name, value: `${domain}:${name}` as const
  }) as { readonly domain: TDomain; readonly name: TName; readonly value: `${TDomain}:${TName}`; readonly payload: TPayload };
}

/** Every event declares its name and payload together; no fallback to unknown. */
export const EventDefinitions = [
  event<Payloads.HandlerErrorPayload>()('system', 'handler-error'),
  event<DeviceStatus>()('device', 'status-changed'),
  event<DeviceInfoPayload>()('device', 'connected'),
  event<DeviceInfoPayload | null | undefined>()('device', 'disconnected'),
  event<Payloads.SupportedDeviceAvailablePayload>()('device', 'supported-device-available'),
  event<Payloads.DeviceEnumerationFailedPayload>()('device', 'enumeration-failed'),
  event<void>()('device', 'disconnected-during-session'),
  event<Payloads.StreamStartedPayload>()('stream', 'started'),
  event<void>()('stream', 'stopped'),
  event<Payloads.StreamErrorPayload>()('stream', 'error'),
  event<Payloads.StreamHealthOkPayload>()('stream', 'health-ok'),
  event<Payloads.StreamHealthTimeoutPayload>()('stream', 'health-timeout'),
  event<void>()('capture', 'screenshot-triggered'),
  event<Payloads.ScreenshotReadyPayload>()('capture', 'screenshot-ready'),
  event<void>()('capture', 'recording-started'),
  event<void>()('capture', 'recording-stopped'),
  event<Payloads.RecordingReadyPayload>()('capture', 'recording-ready'),
  event<Payloads.RecordingErrorPayload>()('capture', 'recording-error'),
  event<Payloads.RecordingDegradedPayload>()('capture', 'recording-degraded'),
  event<number>()('settings', 'volume-changed'),
  event<string>()('settings', 'render-preset-changed'),
  event<number>()('settings', 'brightness-changed'),
  event<boolean>()('settings', 'performance-mode-changed'),
  event<{ enabled: boolean }>()('settings', 'cinematic-mode-changed'),
  event<boolean>()('settings', 'minimalist-fullscreen-changed'),
  event<Record<string, unknown>>()('settings', 'preferences-loaded'),
  event<string>()('settings', 'recording-format-changed'),
  event<Payloads.PerformanceStatePayload>()('performance', 'state-changed'),
  event<Payloads.PerformanceUiModePayload>()('performance', 'ui-mode-changed'),
  event<boolean>()('performance', 'render-mode-changed'),
  event<Payloads.MemorySnapshotRequestPayload>()('performance', 'memory-snapshot-requested'),
  event<Payloads.RenderPipelineReadyPayload>()('render', 'pipeline-ready'),
  event<Payloads.RenderPipelineErrorPayload>()('render', 'pipeline-error'),
  event<Payloads.RenderStatsPayload>()('render', 'stats-update'),
  event<Payloads.CanvasRecreatedPayload>()('render', 'canvas-recreated'),
  event<Payloads.UiStatusMessagePayload>()('ui', 'status-message'),
  event<Payloads.UiDeviceStatusPayload>()('ui', 'device-status'),
  event<Payloads.UiOverlayMessagePayload>()('ui', 'overlay-message'),
  event<Payloads.UiOverlayVisiblePayload>()('ui', 'overlay-visible'),
  event<Payloads.UiOverlayErrorPayload>()('ui', 'overlay-error'),
  event<Payloads.UiStreamingModePayload>()('ui', 'streaming-mode'),
  event<Payloads.UiStreamInfoPayload>()('ui', 'stream-info'),
  event<void>()('ui', 'shutter-flash'),
  event<void>()('ui', 'record-button-pop'),
  event<void>()('ui', 'record-button-press'),
  event<Payloads.UiButtonFeedbackPayload>()('ui', 'button-feedback'),
  event<Payloads.UiRecordingStatePayload>()('ui', 'recording-state'),
  event<void>()('ui', 'record-button-disabled'),
  event<void>()('ui', 'record-button-enabled'),
  event<Payloads.UiFullscreenStatePayload>()('ui', 'fullscreen-state'),
  event<void>()('ui', 'window-resized'),
  event<void>()('ui', 'screenshot-requested'),
  event<void>()('ui', 'recording-toggle-requested'),
  event<void>()('ui', 'fullscreen-toggle-requested'),
  event<void>()('ui', 'cinematic-toggle-requested'),
  event<void>()('ui', 'stream-start-requested'),
  event<void>()('ui', 'stream-stop-requested'),
  event<Payloads.UpdateInfoPayload>()('update', 'available'),
  event<Payloads.UpdateInfoPayload>()('update', 'not-available'),
  event<Payloads.UpdateProgressPayload>()('update', 'progress'),
  event<Payloads.UpdateInfoPayload>()('update', 'downloaded'),
  event<Payloads.UpdateErrorPayload>()('update', 'error'),
  event<UpdateStatusPayload>()('update', 'state-changed'),
  event<void>()('update', 'badge-show'),
  event<void>()('update', 'badge-hide'),
  event<UserNote>()('notes', 'note-created'),
  event<UserNote>()('notes', 'note-updated'),
  event<Payloads.NotesDeletedPayload>()('notes', 'note-deleted'),
  event<Payloads.TranscodeStartedPayload>()('transcode', 'started'),
  event<Payloads.TranscodeProgressPayload>()('transcode', 'progress'),
  event<Payloads.TranscodeCompletedPayload>()('transcode', 'completed'),
  event<Payloads.TranscodeErrorPayload>()('transcode', 'error'),
  event<Payloads.TranscodeCancelledPayload>()('transcode', 'cancelled'),
] as const;

export type EventDefinition = (typeof EventDefinitions)[number];
export type DefinedEventPayloadMap = {
  [TEvent in EventDefinition as TEvent['value']]: TEvent['payload'];
};
