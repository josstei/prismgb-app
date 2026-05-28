// @ts-nocheck
/**
 * Test Factories Index
 *
 * Central export for all test factories.
 * Use these factories instead of inline mocks for consistency.
 */

import { createAppState } from './app-state.factory.js';
import {
  createDeviceInfo,
  createDeviceService,
  createAdapterFactory,
  createDeviceServiceMock
} from './device.factory.js';
import { createEventBus } from './event-bus.factory.js';
import { createLoggerFactory } from './logger.factory.js';
import { createMockCanvas, createMockVideo, createStreamingService } from './stream.factory.js';
import { createStorageService } from './storage.factory.js';
import { createUIController } from './ui.factory.js';
import { SettingsService } from '@renderer/infrastructure/services/settings/settings.service.ts';
import { SettingsDefinitions } from '@shared/features/settings/settings.definitions.js';
import { vi } from 'vitest';

// EventBus factories
export {
  createEventBus,
  createContractValidatingEventBus,
} from './event-bus.factory.js';

export {
  createDeviceStatusElementsMock,
  createNotesPanelElementsMock,
  createShaderSelectorElementsMock,
  createSettingsMenuElementsMock,
  createStatusNotificationElementsMock,
  createTranscodeToastElementsMock
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
  createDeviceAdapter,
  createDeviceService,
  createAdapterFactory,
  AdapterState,
  createDeviceServiceMock,
  createProfileRegistryMock,
  createDeviceStatusProviderMock,
  createDeviceStatusMock,
  createDeviceChangeDebounceAdapterMock,
  createDeviceStatusComponentMock,
  createIpcClientMock,
  createDeviceIpcAdapterMock,
  createDeviceOperationSequencerMock,
} from './device.factory.js';

// Stream factories
export {
  createStreamingService,
  createRenderPipeline,
  createMockCanvas,
  createMockVideo,
  StreamingState,
  createStreamPayloadMock,
  createMediaTrackMock,
  createMediaStreamMock,
  createCaptureStreamMock,
  createStreamCapabilitiesMock,
  createStreamConstraintsMock,
  createAcquisitionContextMock,
  createConstraintBuilderContextMock,
  createConstraintBuilderMock,
  createSupportedDevicePayloadMock,
  createStreamStartedPayloadMock,
  createBrowserMediaServiceMock,
  createMediaServiceMock,
  createStreamingAdapterMock,
  createStreamingAdapterRegistryMock,
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









export function createStreamingServiceDependencies(overrides = {}) {
  return {
    deviceService: createDeviceServiceMock(),
    eventBus: createEventBus(),
    loggerFactory: createLoggerFactory(),
    adapterFactory: createAdapterFactory(),
    ipcClient: {},
    ...overrides
  };
}



// AppState factories
export {
  createAppState,
  createStreamingAppState,
  createRecordingAppState,
  DEFAULT_STATE,
} from './app-state.factory.js';

// UI factories
export {
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
  createAnimationCacheMock,
  createUIEffectsElementsMock,
  createStreamingControlsElementsMock,
  createUIControllerElementsMock,
} from './ui.factory.js';

export {
  CHROMATIC_SPECS,
  createMockVideoTrack,
  createMockStream,
  createMockDeviceInfo,
  MockDevice,
  MockDeviceManager,
  DeviceState,
  MockDeviceStateMachine,
  createChromaticWithFSM,
  createMockUIController,
  performanceUtils,
} from './streaming-mocks.factory.js';

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
  createCaptureToastMock,
  createCaptureUIControllerMock,
  createTranscodeServiceMock,
  createCaptureServiceMock,
  createCaptureGpuRecordingServiceMock,
  createCaptureSaveServiceMock,
  createTranscodeUIControllerMock,
} from './capture.factory.js';

// Streaming pipeline factories
export {
  createStreamLifecycleMock,
  createWorkerInstanceMock,
  createAcquisitionCoordinatorMock,
  createFallbackStrategyMock,
  createStreamingViewControllerMock,
  createStreamingAudioPipelineServiceMock,
  createStreamingViewServiceMock,
  createStreamingViewElementsMock,
  createCanvasRenderLoopServiceMock,
  createViewportServiceMock,
  createStreamHealthServiceMock,
  createGpuRenderLoopServiceMock,
  createGpuWorkerManagerMock,
  createGpuFrameBufferMock,
  createStreamingRendererFactoryMock,
  createRendererAdapterMock,
  createGpuRendererServiceMock,
  createStreamViewServiceMock,
  createWorkerPipelineMock,
  createCanvasRenderPipelineMock,
  createStreamingServiceFacadeMock,
  createStreamingRenderPipelineServiceMock,
  createCanvasLifecycleServiceMock,
} from './streaming-pipeline.factory.js';

/**
 * Creates all standard dependencies for testing orchestrators/services
 * @param {Object} overrides - Override specific dependencies
 * @returns {Object} All mock dependencies
 */
export function createMockDependencies(overrides = {}) {
  return {
    eventBus: createEventBus(),
    loggerFactory: createLoggerFactory(),
    appState: createAppState(),
    uiController: createUIController(),
    streamingService: createStreamingService(),
    deviceService: createDeviceService(),
    adapterFactory: createAdapterFactory(),
    ...overrides,
  };
}

/**
 * Creates dependencies suitable for streaming tests
 */
export function createStreamingDependencies(overrides = {}) {
  const deps = createMockDependencies();
  deps.appState._forceSet('deviceConnected', true);
  deps.appState._forceSet('selectedDeviceId', 'mock-chromatic-device');
  return { ...deps, ...overrides };
}

/**
 * Creates dependencies suitable for capture tests
 */
export function createCaptureDependencies(overrides = {}) {
  const deps = createMockDependencies();
  deps.appState._forceSet('isStreaming', true);
  deps.appState._forceSet('deviceConnected', true);
  return { ...deps, ...overrides };
}
