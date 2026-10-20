import type { DeviceStatus } from '@platform/devices';
import type {
  TranscodeCancelledPayload,
  TranscodeCompletedPayload,
  TranscodeErrorPayload,
  TranscodeProgressPayload,
  UpdateErrorPayload,
  UpdateInfoPayload,
  UpdateProgressPayload
} from '@platform/ipc';
import type {
  DeviceEnumerationFailedPayload,
  MemorySnapshotRequestPayload,
  PerformanceStatePayload,
  RecordingDegradedPayload,
  RecordingErrorPayload,
  RecordingReadyPayload,
  ScreenshotReadyPayload,
  StreamErrorPayload,
  StreamStartedPayload,
  SupportedDeviceAvailablePayload,
  TranscodeStartedPayload,
  UiButtonFeedbackPayload,
  UiDeviceStatusPayload,
  UiFullscreenStatePayload,
  UiOverlayErrorPayload,
  UiOverlayMessagePayload,
  UiOverlayVisiblePayload,
  UiRecordingStatePayload,
  UiStatusMessagePayload,
  UiStreamInfoPayload,
  UiStreamingModePayload
} from './event-payloads';

export const EventChannels = {
  DEVICE: {
    STATUS_CHANGED: 'device:status-changed',
    SUPPORTED_DEVICE_AVAILABLE: 'device:supported-device-available',
    ENUMERATION_FAILED: 'device:enumeration-failed',
    DISCONNECTED_DURING_SESSION: 'device:disconnected-during-session'
  },
  STREAM: {
    STARTED: 'stream:started',
    STOPPED: 'stream:stopped',
    ERROR: 'stream:error'
  },
  CAPTURE: {
    SCREENSHOT_TRIGGERED: 'capture:screenshot-triggered',
    SCREENSHOT_READY: 'capture:screenshot-ready',
    RECORDING_STARTED: 'capture:recording-started',
    RECORDING_STOPPED: 'capture:recording-stopped',
    RECORDING_READY: 'capture:recording-ready',
    RECORDING_ERROR: 'capture:recording-error',
    RECORDING_DEGRADED: 'capture:recording-degraded'
  },
  SETTINGS: {
    VOLUME_CHANGED: 'settings:volume-changed',
    RENDER_PRESET_CHANGED: 'settings:render-preset-changed',
    BRIGHTNESS_CHANGED: 'settings:brightness-changed',
    PERFORMANCE_MODE_CHANGED: 'settings:performance-mode-changed',
    CINEMATIC_MODE_CHANGED: 'settings:cinematic-mode-changed',
    MINIMALIST_FULLSCREEN_CHANGED: 'settings:minimalist-fullscreen-changed',
    PREFERENCES_LOADED: 'settings:preferences-loaded'
  },
  PERFORMANCE: {
    STATE_CHANGED: 'performance:state-changed',
    RENDER_MODE_CHANGED: 'performance:render-mode-changed',
    MEMORY_SNAPSHOT_REQUESTED: 'performance:memory-snapshot-requested'
  },
  RENDER: {
    CANVAS_EXPIRED: 'render:canvas-expired'
  },
  UI: {
    STATUS_MESSAGE: 'ui:status-message',
    DEVICE_STATUS: 'ui:device-status',
    OVERLAY_MESSAGE: 'ui:overlay-message',
    OVERLAY_VISIBLE: 'ui:overlay-visible',
    OVERLAY_ERROR: 'ui:overlay-error',
    STREAMING_MODE: 'ui:streaming-mode',
    STREAM_INFO: 'ui:stream-info',
    SHUTTER_FLASH: 'ui:shutter-flash',
    RECORD_BUTTON_POP: 'ui:record-button-pop',
    RECORD_BUTTON_PRESS: 'ui:record-button-press',
    BUTTON_FEEDBACK: 'ui:button-feedback',
    RECORDING_STATE: 'ui:recording-state',
    RECORD_BUTTON_DISABLED: 'ui:record-button-disabled',
    RECORD_BUTTON_ENABLED: 'ui:record-button-enabled',
    FULLSCREEN_STATE: 'ui:fullscreen-state',
    WINDOW_RESIZED: 'ui:window-resized',
    SCREENSHOT_REQUESTED: 'ui:screenshot-requested',
    RECORDING_TOGGLE_REQUESTED: 'ui:recording-toggle-requested',
    FULLSCREEN_TOGGLE_REQUESTED: 'ui:fullscreen-toggle-requested',
    CINEMATIC_TOGGLE_REQUESTED: 'ui:cinematic-toggle-requested',
    STREAM_START_REQUESTED: 'ui:stream-start-requested',
    STREAM_STOP_REQUESTED: 'ui:stream-stop-requested'
  },
  UPDATE: {
    AVAILABLE: 'update:available',
    NOT_AVAILABLE: 'update:not-available',
    PROGRESS: 'update:progress',
    DOWNLOADED: 'update:downloaded',
    ERROR: 'update:error',
    STATE_CHANGED: 'update:state-changed',
    BADGE_SHOW: 'update:badge-show',
    BADGE_HIDE: 'update:badge-hide'
  },
  TRANSCODE: {
    STARTED: 'transcode:started',
    PROGRESS: 'transcode:progress',
    COMPLETED: 'transcode:completed',
    ERROR: 'transcode:error',
    CANCELLED: 'transcode:cancelled'
  }
} as const;

export interface EventPayloadMap {
  'device:status-changed': DeviceStatus;
  'device:supported-device-available': SupportedDeviceAvailablePayload;
  'device:enumeration-failed': DeviceEnumerationFailedPayload;
  'device:disconnected-during-session': void;
  'stream:started': StreamStartedPayload;
  'stream:stopped': void;
  'stream:error': StreamErrorPayload;
  'capture:screenshot-triggered': void;
  'capture:screenshot-ready': ScreenshotReadyPayload;
  'capture:recording-started': void;
  'capture:recording-stopped': void;
  'capture:recording-ready': RecordingReadyPayload;
  'capture:recording-error': RecordingErrorPayload;
  'capture:recording-degraded': RecordingDegradedPayload;
  'settings:volume-changed': number;
  'settings:render-preset-changed': string;
  'settings:brightness-changed': number;
  'settings:performance-mode-changed': boolean;
  'settings:cinematic-mode-changed': { enabled: boolean };
  'settings:minimalist-fullscreen-changed': boolean;
  'settings:preferences-loaded': Record<string, unknown>;
  'performance:state-changed': PerformanceStatePayload;
  'performance:render-mode-changed': boolean;
  'performance:memory-snapshot-requested': MemorySnapshotRequestPayload;
  'render:canvas-expired': void;
  'ui:status-message': UiStatusMessagePayload;
  'ui:device-status': UiDeviceStatusPayload;
  'ui:overlay-message': UiOverlayMessagePayload;
  'ui:overlay-visible': UiOverlayVisiblePayload;
  'ui:overlay-error': UiOverlayErrorPayload;
  'ui:streaming-mode': UiStreamingModePayload;
  'ui:stream-info': UiStreamInfoPayload;
  'ui:shutter-flash': void;
  'ui:record-button-pop': void;
  'ui:record-button-press': void;
  'ui:button-feedback': UiButtonFeedbackPayload;
  'ui:recording-state': UiRecordingStatePayload;
  'ui:record-button-disabled': void;
  'ui:record-button-enabled': void;
  'ui:fullscreen-state': UiFullscreenStatePayload;
  'ui:window-resized': void;
  'ui:screenshot-requested': void;
  'ui:recording-toggle-requested': void;
  'ui:fullscreen-toggle-requested': void;
  'ui:cinematic-toggle-requested': void;
  'ui:stream-start-requested': void;
  'ui:stream-stop-requested': void;
  'update:available': UpdateInfoPayload;
  'update:not-available': UpdateInfoPayload;
  'update:progress': UpdateProgressPayload;
  'update:downloaded': UpdateInfoPayload;
  'update:error': UpdateErrorPayload;
  'update:state-changed': unknown;
  'update:badge-show': void;
  'update:badge-hide': void;
  'transcode:started': TranscodeStartedPayload;
  'transcode:progress': TranscodeProgressPayload;
  'transcode:completed': TranscodeCompletedPayload;
  'transcode:error': TranscodeErrorPayload;
  'transcode:cancelled': TranscodeCancelledPayload;
}

type LeafValues<T> = T extends string
  ? T
  : T extends Record<string, unknown>
    ? LeafValues<T[keyof T]>
    : never;

type AssertNever<T extends never> = T;

type ChannelValue = LeafValues<typeof EventChannels>;

// The AssertNever member fails compilation whenever EventChannels and EventPayloadMap list different channels.
export type EventChannel =
  | ChannelValue
  | AssertNever<Exclude<ChannelValue, keyof EventPayloadMap> | Exclude<keyof EventPayloadMap, ChannelValue>>;
