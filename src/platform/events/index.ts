export { PlatformEventBus } from './event-bus';
export type { IEventBus, EventBusLike, EventPublisherLike } from './event-bus';
export { EventChannels } from './event-channels';
export { OnEvent } from './on-event';
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
} from './event-payloads';
export type { DeviceInfoPayload, DeviceStatus } from '@platform/devices';

export { getEventManifestScopeEvents, getEventManifestScopeValues } from './event.manifest';
export { MainEventChannels } from './main-event-channels';
export type { MainEventChannel } from './main-event-channels';
