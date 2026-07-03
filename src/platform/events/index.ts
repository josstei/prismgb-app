export { SharedEventBus } from './event-bus.js';
export type { IEventBus } from './event-bus.js';
export { EventChannels } from './event-channels.js';
export { OnEvent } from './on-event.js';
export type {
  EventPayloadMap,
  TypedEventBusLike,
  Dimensions,
  DeviceEnumerationFailedPayload,
  UpdateInfoPayload,
  UpdateProgressPayload,
  UpdateErrorPayload,
  TranscodeProgressPayload,
  TranscodeCompletedPayload,
  TranscodeCancelledPayload,
  TranscodeErrorPayload,
  TranscodeStartedPayload,
  UiButtonFeedbackPayload,
  UiStreamingModePayload,
  PerformanceUiModePayload,
  PerformanceStatePayload,
  MemorySnapshotRequestPayload,
  StreamingCapabilities,
  RecordingDegradedPayload,
  RecordingErrorPayload,
  RecordingReadyPayload,
  ScreenshotReadyPayload,
  StreamErrorPayload,
  StreamHealthOkPayload,
  StreamHealthTimeoutPayload,
  StreamStartedPayload,
  SupportedDeviceAvailablePayload,
  NativeResolution
} from './event-payloads.js';
export type { DeviceInfoPayload, DeviceStatus } from '@platform/devices';

export { getEventManifestScopeEvents, getEventManifestScopeValues } from './event.manifest.js';
export { MainEventChannels } from './main-event-channels.js';
export type { MainEventChannel } from './main-event-channels.js';
