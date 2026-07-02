// @ts-nocheck
/**
 * Test Factories Index
 *
 * Central export for all test factories.
 * Use these factories instead of inline mocks for consistency.
 */

// EventBus factories
export {
  createEventBus,
  createContractValidatingEventBus,
} from './event-bus.factory.js';

// UI factories
export {
  createDeviceStatusElementsMock,
  createNotesPanelElementsMock,
  createShaderSelectorElementsMock,
  createSettingsMenuElementsMock,
  createStatusNotificationElementsMock,
  createTranscodeToastElementsMock,
  createMockElement,
  createMockButton,
  createMockInput,
  createUIController,
  createCaptureEffects,
  createButtonFeedback,
  createUISetupControllerMock,
  createPresentationModeControllerMock,
  createUIEventBridgeControllerMock,
  createStatusNotificationComponentMock,
  createStreamControlsComponentMock,
  createSettingsMenuComponentMock,
  createUIComponentMock,
  createShaderSelectorComponentMock,
  createUIComponentRegistryMock,
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
  LogLevels,
} from './logger.factory.js';

// Device factories
export {
  createDeviceInfo,
  createVideoTrack,
  createMediaStream,
  createRendererDeviceRuntimeMock,
  createDeviceStatusComponentMock,
} from './device.factory.js';

// Stream factories
export {
  createStreamingService,
  createStreamRenderer,
  createMockCanvas,
  createMockVideo,
  StreamingState,
  createStreamPayloadMock,
  createMediaTrackMock,
  createMediaStreamMock,
  createCaptureStreamMock,
  createStreamCapabilitiesMock,
  createStreamConstraintsMock,
  createSupportedDevicePayloadMock,
  createStreamStartedPayloadMock,
  createBrowserMediaServiceMock,
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
  createStreamingAppState,
  createRecordingAppState,
  DEFAULT_STATE,
} from './app-state.factory.js';

// System factories
export {
  createDisposableMock,
  createContextBridgeMock,
  createProcessMetricsApiMock,
  createOffscreenCanvasElementMock,
  createCallbackMap,
  createPreloadEventApiMock,
  createMediaQueryListMock,
  createCanvasRenderingContextMock,
  createBitmapMock,
  createPreventDefaultEventMock,
  createDomEventMock,
  createWinstonLoggerMock,
  createWinstonRootLoggerMock,
  createShellServiceMock,
  createLoginItemServiceMock,
} from './system.factory.js';

// Settings factories
export {
  createSettingsServiceHarness,
  createSettingsServiceMock,
  createNotesServiceMock,
  createSettingsFullscreenServiceMock,
  createSettingsCinematicModeServiceMock,
  createPresentationModeServiceMock,
} from './settings.factory.js';

// Update factories
export {
  createUpdateConfigMock,
  createUpdateServiceMock,
  createUpdateUiServiceMock,
} from './update.factory.js';

// Window factories
export {
  createWindowServiceMock,
  createBrowserWindowMock,
  createWindowServiceElectronMock,
  createTrayMock,
  createTrayServiceElectronMock,
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
  createBodyClassManagerMock,
  createProcessMetricsMock,
  createAppMetricsServiceMock,
} from './performance.factory.js';

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
  createWorkerInstanceMock,
  createStreamingViewControllerMock,
  createStreamingAudioPipelineServiceMock,
  createStreamingViewServiceMock,
  createStreamingViewElementsMock,
  createViewportServiceMock,
  createStreamHealthServiceMock,
  createGpuRendererServiceMock,
  createStreamViewServiceMock,
  createStreamingServiceFacadeMock,
  createStreamingRenderServiceMock,
  createCanvasLifecycleServiceMock,
} from './streaming-pipeline.factory.js';

// Dependency factories
export {
  createStreamingServiceDependencies,
  createMockDependencies,
  createStreamingDependencies,
  createCaptureDependencies,
} from './dependencies.factory.js';
