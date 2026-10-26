/**
 * Test Factories Index
 *
 * Central export for all test factories.
 * Use these factories instead of inline mocks for consistency.
 */

// EventBus factories
export {
  createEventBus,
} from './event-bus.factory.js';

// UI factories
export {
  createDeviceStatusElementsMock,
  createNotesPanelElementsMock,
  createShaderSelectorElementsMock,
  createSettingsMenuElementsMock,
  createTranscodeToastElementsMock,
  createMockElement,
  createUISetupControllerMock,
  createUIEventBridgeControllerMock,
  createStatusNotificationComponentMock,
  createStreamControlsComponentMock,
  createSettingsMenuComponentMock,
  createShaderSelectorComponentMock,
  createUiComponentHostMock,
  createUIEffectsMock,
  createUIBodyClassManagerMock,
  createUIEffectsElementsMock,
  createStreamingControlsElementsMock,
  createUIControllerElementsMock,
} from './ui.factory.js';

// Logger factories
export {
  createLogger,
  createLoggerFactory,
} from './logger.factory.js';

// Device factories
export {
  createDeviceInfo,
  createRendererDeviceRuntimeMock,
  createDeviceStatusComponentMock,
} from './device.factory.js';

// Stream factories
export {
  createMockCanvas,
  createMockVideo,
  createStreamPayloadMock,
  createMediaTrackMock,
  createMediaStreamMock,
  createCaptureStreamMock,
  createSupportedDevicePayloadMock,
  createStreamStartedPayloadMock,
  createDeviceMediaAcquirerMock,
} from './stream.factory.js';

// Storage factories
export {
  createStorageService,
} from './storage.factory.js';

// AppState factories
export {
  createAppState,
} from './app-state.factory.js';

// System factories
export {
  createCallbackMap,
  createCanvasRenderingContextMock,
  createBitmapMock,
  createPreventDefaultEventMock,
} from './system.factory.js';

// Settings factories
export {
  createSettingsServiceHarness,
  createSettingsServiceMock,
  createNotesServiceMock,
} from './settings.factory.js';

// Update factories
export {
  createUpdateConfigMock,
} from './update.factory.js';

// Window factories
export {
  createWindowServiceMock,
  createWindowServiceElectronMock,
} from './window.factory.js';

// Capture factories
export {
  createRecordingFrameMock,
  createMediaBlobEventMock,
  createMediaRecorderMock,
  createMediaRecorderErrorEventMock,
  createCaptureUIControllerMock,
  createTranscodeServiceMock,
  createCaptureServiceMock,
  createCaptureGpuRecordingServiceMock,
  createCaptureSaveServiceMock,
} from './capture.factory.js';

// Streaming pipeline factories
export {
  createStreamingViewControllerMock,
  createStreamingAudioPipelineServiceMock,
  createStreamingViewServiceMock,
  createStreamingViewElementsMock,
  createGpuRendererServiceMock,
  createStreamingServiceFacadeMock,
  createStreamingRenderServiceMock,
} from './streaming-pipeline.factory.js';
