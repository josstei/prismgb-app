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
import {
  createMockButton,
  createMockElement,
  createUIController
} from './ui.factory.js';
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




















export function createUISetupControllerMock(overrides = {}) {
  const {
    on,
    elements = {},
    dom = {},
    streamOverlay,
    streamVideo,
    streamCanvas,
    shaderBtn,
    shaderDropdown,
    shaderOptions,
    shaderUnavailableMessage,
    cinematicToggle,
    cinematicPillText,
    streamToolbar,
    brightnessSlider,
    brightnessPercentage,
    brightnessControl,
    volumeSliderVertical,
    volumePercentageVertical,
    streamContainer,
    notesBtn,
    initSettingsMenu,
    initShaderSelector,
    initNotesPanel,
    toggleSettingsMenu,
    toggleShaderSelector,
    ...componentOverrides
  } = overrides;

  const resolvedElements = {
    streamOverlay: streamOverlay ?? createMockElement('div'),
    streamVideo: streamVideo ?? createMockElement('video'),
    streamCanvas: streamCanvas ?? createMockElement('canvas'),
    shaderBtn: shaderBtn ?? createMockElement('button'),
    shaderDropdown: shaderDropdown ?? createMockElement('select'),
    streamToolbar: streamToolbar ?? createMockElement('div'),
    ...elements
  };

  const resolvedDom = {
    streaming: {
      shaderBtn: resolvedElements.shaderBtn,
      shaderDropdown: shaderDropdown ?? resolvedElements.shaderDropdown,
      shaderOptions: shaderOptions ?? createMockElement('div'),
      shaderUnavailableMessage: shaderUnavailableMessage ?? createMockElement('div'),
      cinematicToggle: cinematicToggle ?? createMockElement('input'),
      cinematicPillText: cinematicPillText ?? createMockElement('span'),
      streamToolbar: resolvedElements.streamToolbar,
      brightnessSlider: brightnessSlider ?? createMockElement('input'),
      brightnessPercentage: brightnessPercentage ?? createMockElement('span'),
      brightnessControl: brightnessControl ?? createMockElement('div'),
      volumeSliderVertical: volumeSliderVertical ?? createMockElement('input'),
      volumePercentageVertical: volumePercentageVertical ?? createMockElement('span'),
      streamVideo: resolvedElements.streamVideo,
      streamContainer: streamContainer ?? createMockElement('div'),
      ...dom.streaming
    },
    notes: {
      notesBtn: notesBtn ?? createMockElement('button'),
      ...dom.notes
    },
    ...dom
  };

  return {
    on: on ?? vi.fn(),
    elements: {
      ...resolvedElements,
      ...elements
    },
    dom: resolvedDom,
    initSettingsMenu: initSettingsMenu ?? vi.fn(),
    initShaderSelector: initShaderSelector ?? vi.fn(),
    initNotesPanel: initNotesPanel ?? vi.fn(),
    toggleSettingsMenu: toggleSettingsMenu ?? vi.fn(),
    toggleShaderSelector: toggleShaderSelector ?? vi.fn(),
    ...componentOverrides
  };
}

export function createPresentationModeControllerMock(overrides = {}) {
  return {
    setStreamingMode: vi.fn(),
    updateCinematicMode: vi.fn(),
    updateMinimalistFullscreen: vi.fn(),
    updateFullscreenButton: vi.fn(),
    updateFullscreenMode: vi.fn(),
    enableControlsAutoHide: vi.fn(),
    disableControlsAutoHide: vi.fn(),
    ...overrides
  };
}









export function createOrchestratorMock(overrides = {}) {
  return {
    initialize: vi.fn().mockResolvedValue(),
    onInitialize: vi.fn().mockResolvedValue(),
    onCleanup: vi.fn().mockResolvedValue(),
    cleanup: vi.fn().mockResolvedValue(),
    start: vi.fn(),
    stop: vi.fn(),
    loadPreferences: vi.fn(),
    toggleFullscreen: vi.fn(),
    toggleCinematicMode: vi.fn(),
    initializeSettingsMenu: vi.fn(),
    initializeShaderSelector: vi.fn(),
    initializeNotesPanel: vi.fn(),
    setupOverlayClickHandlers: vi.fn(),
    setupUIEventListeners: vi.fn(),
    ...overrides
  };
}

export function createRendererAppContainerMock(overrides = {}) {
  const {
    appOrchestrator = createOrchestratorMock({
      initialize: vi.fn().mockResolvedValue(),
      start: vi.fn().mockResolvedValue(),
      cleanup: vi.fn().mockResolvedValue()
    }),
    adapterFactory = {
      initialize: vi.fn().mockResolvedValue()
    },
    uiComponentRegistry = {
      initialize: vi.fn(),
      initializeComponent: vi.fn(),
      get: vi.fn(),
      dispose: vi.fn()
    },
    uiEffects = {
      elements: null,
      triggerShutterFlash: vi.fn(),
      triggerButtonFeedback: vi.fn(),
      ...createUIEffectsMock(),
    },
    uiEventBridge = {
      initialize: vi.fn(),
      dispose: vi.fn()
    },
    captureUiBridge = {
      initialize: vi.fn(),
      dispose: vi.fn()
    },
    transcodeUiBridge = {
      initialize: vi.fn(),
      dispose: vi.fn()
    },
    transcodeService = {
      initialize: vi.fn(),
      dispose: vi.fn()
    },
    loggerFactory = createLoggerFactory(),
    services = {},
    register = vi.fn(),
    dispose = vi.fn(),
    resolve,
    ...containerOverrides
  } = overrides;

  const dependencyMap = {
    appOrchestrator,
    adapterFactory,
    uiComponentRegistry,
    uiEffects,
    uiEventBridge,
    captureUiBridge,
    transcodeUiBridge,
    transcodeService,
    loggerFactory,
    ...services,
  };

  return {
    resolve: resolve
      ? vi.fn((name) => resolve(name, dependencyMap))
      : vi.fn((name) => dependencyMap[name] || {}),
    register,
    dispose,
    ...containerOverrides
  };
}







export function createUIEventBridgeControllerMock(overrides = {}) {
  const { deviceStatus, ...componentOverrides } = overrides;

  return {
    updateStatusMessage: vi.fn(),
    updateDeviceStatus: vi.fn(),
    updateOverlayMessage: vi.fn(),
    showErrorOverlay: vi.fn(),
    updateStreamInfo: vi.fn(),
    triggerShutterFlash: vi.fn(),
    triggerRecordButtonPop: vi.fn(),
    triggerRecordButtonPress: vi.fn(),
    triggerButtonFeedback: vi.fn(),
    updateRecordingButtonState: vi.fn(),
    setRecordButtonDisabled: vi.fn(),
    deviceStatus: deviceStatus ?? {
      setOverlayVisible: vi.fn()
    },
    ...componentOverrides
  };
}

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

export function createStatusNotificationComponentMock(overrides = {}) {
  return {
    show: vi.fn(),
    ...overrides
  };
}


export function createStreamControlsComponentMock(overrides = {}) {
  return {
    setCinematicMode: vi.fn(),
    setStreamingMode: vi.fn(),
    updateStreamInfo: vi.fn(),
    ...overrides
  };
}

export function createSettingsMenuComponentMock(overrides = {}) {
  return {
    toggle: vi.fn(),
    initialize: vi.fn(),
    dispose: vi.fn(),
    ...overrides
  };
}

export function createUIComponentMock(overrides = {}) {
  return {
    initialize: vi.fn(),
    dispose: vi.fn(),
    ...overrides
  };
}

export function createShaderSelectorComponentMock(overrides = {}) {
  return {
    hide: vi.fn(),
    ...overrides
  };
}

export function createUIComponentRegistryMock(overrides = {}) {
  const {
    statusNotificationComponent = createStatusNotificationComponentMock(),
    deviceStatusComponent = createDeviceStatusComponentMock(),
    streamControlsComponent = createStreamControlsComponentMock(),
    settingsMenuComponent = createSettingsMenuComponentMock(),
    shaderSelectorComponent = createShaderSelectorComponentMock(),
    initialize = vi.fn(),
    initializeComponent = vi.fn(),
    dispose = vi.fn(),
    get,
    components = {},
    ...registryOverrides
  } = overrides;

  const componentMap = {
    statusNotificationComponent,
    deviceStatusComponent,
    streamControlsComponent,
    settingsMenuComponent,
    shaderSelectorComponent,
    ...components
  };

  const getWithDefaults = get ?? vi.fn((name) => componentMap[name] || null);
  const registry = {
    initialize,
    initializeComponent,
    get: getWithDefaults,
    dispose,
    _components: componentMap,
    _setComponent: (id, component) => {
      componentMap[id] = component;
    },
    ...registryOverrides
  };

  return registry;
}

export function createUIEffectsMock(overrides = {}) {
  return {
    setElements: vi.fn(),
    triggerShutterFlash: vi.fn(),
    triggerRecordButtonPop: vi.fn(),
    triggerRecordButtonPress: vi.fn(),
    triggerButtonFeedback: vi.fn(),
    enableCursorAutoHide: vi.fn(),
    disableCursorAutoHide: vi.fn(),
    enableToolbarAutoHide: vi.fn(),
    disableToolbarAutoHide: vi.fn(),
    setRecordingButtonState: vi.fn(),
    setCinematicMode: vi.fn(),
    setStreamingMode: vi.fn(),
    setMinimalistFullscreen: vi.fn(),
    setFullscreenMode: vi.fn(),
    enableControlsAutoHide: vi.fn(),
    disableControlsAutoHide: vi.fn(),
    dispose: vi.fn(),
    ...overrides
  };
}

export function createUIBodyClassManagerMock(overrides = {}) {
  return {
    setStreamingMode: vi.fn(),
    setCinematicMode: vi.fn(),
    setMinimalistFullscreen: vi.fn(),
    setFullscreenMode: vi.fn(),
    areAnimationsOff: vi.fn(),
    ...overrides
  };
}

export function createAnimationCacheMock(overrides = {}) {
  return {
    cancelAnimation: vi.fn(),
    cancelAllAnimations: vi.fn(),
    ...overrides
  };
}

export function createUIEffectsElementsMock(overrides = {}) {
  const recordBtn = createMockElement('button', { className: 'record-btn' });
  recordBtn.offsetWidth = 100;

  const flashElement = createMockElement('div', { className: '' });
  flashElement.parentNode = {};
  flashElement.addEventListener = vi.fn();
  flashElement.remove = vi.fn();

  return {
    recordBtn,
    flashElement,
    ...overrides
  };
}

export function createStreamingControlsElementsMock(overrides = {}) {
  const streamOverlay = createMockElement('div', { className: 'stream-overlay' });
  const screenshotBtn = createMockButton({ className: 'screenshot-btn' });
  screenshotBtn.disabled = true;
  const recordBtn = createMockButton({ className: 'record-btn' });
  recordBtn.disabled = true;
  const shaderControls = createMockElement('div', { className: 'shader-controls' });
  const currentResolution = createMockElement('span', { className: 'current-resolution' });
  const currentFPS = createMockElement('span', { className: 'current-fps' });

  return {
    streamOverlay,
    screenshotBtn,
    recordBtn,
    shaderControls,
    currentResolution,
    currentFPS,
    ...overrides,
  };
}

export function createUIControllerElementsMock(overrides = {}) {
  const statusIndicator = createMockElement('div', { className: 'status-indicator' });
  const statusText = createMockElement('span', { className: 'status-text' });
  const statusMessage = createMockElement('span', { className: 'status-message' });
  const streamVideo = createMockElement('video', { className: 'stream-video' });
  streamVideo.volume = 1;
  const streamCanvas = createMockElement('canvas', { className: 'stream-canvas' });
  const streamOverlay = createMockElement('div', { className: 'stream-overlay' });
  const overlayMessage = createMockElement('div', { className: 'overlay-message' });
  const screenshotBtn = createMockButton({ className: 'screenshot-btn' });
  screenshotBtn.disabled = false;
  const recordBtn = createMockButton({ className: 'record-btn' });
  recordBtn.disabled = false;
  const fullscreenBtn = createMockButton({ className: 'fullscreen-btn' });
  const settingsBtn = createMockButton({ className: 'settings-btn' });

  return {
    statusIndicator,
    statusText,
    statusMessage,
    streamVideo,
    streamCanvas,
    streamOverlay,
    overlayMessage,
    screenshotBtn,
    recordBtn,
    fullscreenBtn,
    settingsBtn,
    deviceName: createMockElement('span', { className: 'device-name' }),
    deviceStatusText: createMockElement('span', { className: 'device-status-text' }),
    currentResolution: createMockElement('span', { className: 'current-resolution' }),
    currentFPS: createMockElement('span', { className: 'current-fps' }),
    streamToolbar: createMockElement('div', { className: 'stream-toolbar' }),
    fullscreenControls: createMockElement('div', { className: 'fullscreen-controls' }),
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
