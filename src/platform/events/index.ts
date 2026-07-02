export { SharedEventBus } from './event-bus.js';
export type { IEventBus, EventHandler, UnsubscribeFn } from './event-bus.js';
export { EventChannels } from './event-channels.js';
export type {
  TypedEventBusLike,
  Dimensions,
  UpdateInfoPayload,
  UpdateProgressPayload,
  UpdateErrorPayload,
  TranscodeProgressPayload,
  TranscodeCompletedPayload,
  TranscodeCancelledPayload,
  TranscodeErrorPayload,
  UiButtonFeedbackPayload,
  PerformanceUiModePayload,
  PerformanceStatePayload,
  MemorySnapshotRequestPayload,
  StreamingCapabilities,
  RecordingDegradedPayload,
  RecordingErrorPayload,
  RecordingReadyPayload,
  StreamHealthOkPayload,
  StreamHealthTimeoutPayload,
  StreamStartedPayload,
  SupportedDeviceAvailablePayload,
  NativeResolution
} from './event-payloads.js';
export type { DeviceInfoPayload } from '@prismgb/devices';

export { getEventManifestScopeEvents, getEventManifestScopeValues } from './event.manifest.js';
export { EVENT_PAYLOAD_CHANNELS } from './event-payloads.js';
export { MainEventChannels } from './main-event-channels.js';
export type { MainEventChannel } from './main-event-channels.js';
