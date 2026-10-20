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
  createStatusNotificationComponentMock,
  createStreamControlsComponentMock,
  createTranscodeToastComponentMock,
  createSettingsMenuComponentMock,
  createShaderSelectorComponentMock,
  createNotesPanelComponentMock,
  createUiComponentHostMock,
  createAutoHideEffectMock,
  createFeedbackEffectMock,
  createBodyClassEffectMock,
  createStreamingControlsElementsMock,
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
  createStreamCapabilitiesMock,
  createSupportedDevicePayloadMock,
  createStreamStartedPayloadMock,
  createDeviceMediaAcquirerMock,
} from './stream.factory.js';

// Storage factories
export {
  createStorageService,
} from './storage.factory.js';

// Orchestrator factories
export {
  createOrchestratorMock,
  createRendererAppContainerMock,
} from './orchestrator.factory.js';

// AppState factories
export {
  createAppState,
} from './app-state.factory.js';

// System factories
export {
  createCallbackMap,
  createMediaQueryListMock,
  createCanvasRenderingContextMock,
  createBitmapMock,
  createPreventDefaultEventMock,
  createLoginItemServiceMock,
} from './system.factory.js';

// Settings factories
export {
  createSettingsServiceHarness,
  createSettingsServiceMock,
  createNotesServiceMock,
  createSettingsFullscreenServiceMock,
  createSettingsCinematicModeServiceMock,
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

// Performance factories
export {

  createPerformanceMetricsAdapterMock,
  createVisibilityAdapterMock,
  createUserActivityAdapterMock,
  createReducedMotionAdapterMock,
  createPerformanceStateServiceMock,
  createPerformanceMetricsServiceMock,
  createPerformanceAnimationServiceMock,
  createProcessMetricsMock,
} from './performance.factory.js';

// Capture factories
export {
  createRecordingFrameMock,
  createMediaBlobEventMock,
  createMediaRecorderMock,
  createMediaRecorderErrorEventMock,
  createTranscodeServiceMock,
  createCaptureServiceMock,
  createCaptureGpuRecordingServiceMock,
  createCaptureSaveServiceMock,
} from './capture.factory.js';

// Streaming pipeline factories
export {
  createStreamingAudioPipelineServiceMock,
  createStreamingViewServiceMock,
  createStreamingViewElementsMock,
  createViewportServiceMock,
  createStreamHealthServiceMock,
  createGpuRendererServiceMock,
  createStreamingServiceFacadeMock,
  createStreamingRenderServiceMock,
  createCanvasLifecycleServiceMock,
} from './streaming-pipeline.factory.js';
