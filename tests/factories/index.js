/**
 * Test Factories Index
 *
 * Central export for all test factories.
 * Use these factories instead of inline mocks for consistency.
 */

import { createAppState } from './app-state.factory.js';
import { createDeviceService, createAdapterFactory } from './device.factory.js';
import { createEventBus } from './event-bus.factory.js';
import { createLoggerFactory } from './logger.factory.js';
import { createStreamingService } from './stream.factory.js';
import { createStorageService } from './storage.factory.js';
import { createMockButton, createMockElement, createUIController } from './ui.factory.js';
import { SettingsService } from '@renderer/infrastructure/services/settings/settings.service.ts';
import { SettingsDefinitions } from '@shared/features/settings/settings.definitions.js';
import { vi } from 'vitest';

// EventBus factories
export {
  createEventBus,
  createContractValidatingEventBus,
} from './event-bus.factory.js';

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
} from './device.factory.js';

// Stream factories
export {
  createStreamingService,
  createRenderPipeline,
  createMockCanvas,
  createMockVideo,
  StreamingState,
} from './stream.factory.js';

// Storage factories
export {
  createStorageService,
} from './storage.factory.js';

export function createSettingsServiceHarness(overrides = {}) {
  const eventBus = overrides.eventBus ?? createEventBus();
  const loggerFactory = overrides.loggerFactory ?? createLoggerFactory();
  const storageService = overrides.storageService ?? createStorageService(overrides.initialValues);
  const service = new SettingsService({ eventBus, loggerFactory, storageService });
  return { service, eventBus, loggerFactory, storageService, storage: storageService, logger: loggerFactory._getLogger('SettingsService') };
}

export function createSettingsServiceMock(overrides = {}) {
  const { values: overrideValues = {}, ...methodOverrides } = overrides;
  const values = {
    ...Object.fromEntries(SettingsDefinitions.definitions.map((definition) => [definition.name, definition.default])),
    ...overrideValues
  };
  const read = (name) => values[name];
  const definitionByName = new Map(SettingsDefinitions.definitions.map((definition) => [definition.name, definition]));
  return {
    getSetting: vi.fn((name) => {
      const definition = definitionByName.get(name);
      if (definition?.externalSource === 'window.loginItemAPI') {
        return Promise.resolve(read(name));
      }
      return read(name);
    }),
    getNumberSetting: vi.fn((name) => Number(read(name))),
    getBooleanSetting: vi.fn((name) => read(name) === true || read(name) === 'true'),
    getStringSetting: vi.fn((name) => String(read(name))),
    setSetting: vi.fn((name, value) => {
      values[name] = value;
      return true;
    }),
    ...methodOverrides
  };
}

export function createNotesServiceMock(overrides = {}) {
  return {
    getAllNotes: vi.fn(() => []),
    getNote: vi.fn(() => null),
    createNote: vi.fn(() => null),
    updateNote: vi.fn(() => null),
    updateNoteWithChangeDetection: vi.fn(() => null),
    deleteNote: vi.fn(() => false),
    searchNotes: vi.fn(() => []),
    getUniqueGames: vi.fn(() => []),
    getNotesGroupedByGame: vi.fn(() => ({})),
    ...overrides
  };
}

export function createDeviceServiceMock(overrides = {}) {
  return {
    getStatus: vi.fn(() => ({ connected: false })),
    ...overrides
  };
}

export function createDeviceStatusProviderMock(overrides = {}) {
  return {
    getDeviceStatus: vi.fn(),
    ...overrides
  };
}

export function createDeviceChangeDebounceAdapterMock(overrides = {}) {
  let callback;
  let suppressedCount = 0;
  let subscribed = false;

  const adapter = {
    subscribe: vi.fn((nextCallback) => {
      callback = nextCallback;
      subscribed = true;
      return vi.fn(() => {
        callback = undefined;
        subscribed = false;
      });
    }),
    unsubscribe: vi.fn(() => {
      callback = undefined;
      subscribed = false;
    }),
    isSubscribed: vi.fn(() => subscribed),
    getSuppressedCount: vi.fn(() => suppressedCount),
    _setSuppressedCount: vi.fn((value) => {
      suppressedCount = value;
    }),
    ...overrides
  };

  Object.defineProperty(adapter, '_callback', {
    enumerable: true,
    get: () => callback,
    set: (value) => {
      callback = value;
    },
  });

  return adapter;
}

export function createUpdateServiceMock(overrides = {}) {
  return {
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    installUpdate: vi.fn(),
    getStatus: vi.fn(),
    ...overrides
  };
}

export function createUpdateUiServiceMock(overrides = {}) {
  return {
    initialize: vi.fn(),
    dispose: vi.fn(),
    ...overrides
  };
}

export function createWindowServiceMock(overrides = {}) {
  return {
    setFullScreen: vi.fn(),
    isFullScreen: vi.fn(),
    ...overrides
  };
}

export function createTranscodeServiceMock(overrides = {}) {
  return {
    transcode: vi.fn(),
    cancel: vi.fn(),
    getStatus: vi.fn(),
    ...overrides
  };
}

export function createStreamingAudioPipelineServiceMock(overrides = {}) {
  return {
    start: vi.fn().mockResolvedValue(true),
    stop: vi.fn(),
    ...overrides
  };
}

export function createStreamingViewServiceMock(overrides = {}) {
  return {
    setMuted: vi.fn(),
    attachMutedStream: vi.fn(),
    clearStream: vi.fn(),
    getCanvas: vi.fn(),
    getVideo: vi.fn(),
    getCanvasContainer: vi.fn(),
    getCanvasSection: vi.fn(),
    setCanvas: vi.fn(),
    updateOverlayMessage: vi.fn(),
    ...overrides,
  };
}

export function createSettingsFullscreenServiceMock(overrides = {}) {
  return {
    initialize: vi.fn(),
    dispose: vi.fn(),
    toggleFullscreen: vi.fn(),
    enterFullscreen: vi.fn(),
    exitFullscreen: vi.fn(),
    ...overrides
  };
}

export function createSettingsCinematicModeServiceMock(overrides = {}) {
  return {
    toggleCinematicMode: vi.fn(),
    ...overrides
  };
}

export function createPresentationModeServiceMock(overrides = {}) {
  return {
    handleStreamingMode: vi.fn(),
    handleCinematicModeChanged: vi.fn(),
    handleMinimalistFullscreenChanged: vi.fn(),
    handleFullscreenState: vi.fn(),
    ...overrides
  };
}

export function createPerformanceStateServiceMock(overrides = {}) {
  return {
    initialize: vi.fn(),
    setPerformanceModeEnabled: vi.fn(() => true),
    setCapabilities: vi.fn(),
    setStreaming: vi.fn(),
    dispose: vi.fn(),
    ...overrides
  };
}

export function createPerformanceMetricsServiceMock(overrides = {}) {
  return {
    requestSnapshot: vi.fn(),
    startPeriodicSnapshots: vi.fn(),
    stopPeriodicSnapshots: vi.fn(),
    clearPendingRequests: vi.fn(),
    ...overrides
  };
}

export function createPerformanceAnimationServiceMock(overrides = {}) {
  return {
    setPerformanceState: vi.fn(() => ({
      idle: false,
      hidden: false,
      animationsOff: false
    })),
    ...overrides
  };
}

export function createBodyClassManagerMock(overrides = {}) {
  return {
    setIdle: vi.fn(),
    setHidden: vi.fn(),
    setAnimationsOff: vi.fn(),
    ...overrides
  };
}

export function createBrowserMediaServiceMock(overrides = {}) {
  return {
    enumerateDevices: vi.fn(),
    getUserMedia: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    ...overrides
  };
}

export function createCaptureServiceMock(overrides = {}) {
  return {
    takeScreenshot: vi.fn(),
    toggleRecording: vi.fn(),
    startRecording: vi.fn(),
    getRecordingState: vi.fn(),
    stopRecording: vi.fn(),
    isRecording: false,
    ...overrides
  };
}

export function createCaptureGpuRecordingServiceMock(overrides = {}) {
  return {
    start: vi.fn(async () => ({ id: 'gpu-stream' })),
    stop: vi.fn(),
    isActive: vi.fn().mockReturnValue(false),
    ...overrides
  };
}

export function createCaptureSaveServiceMock(overrides = {}) {
  return {
    saveRecording: vi.fn().mockResolvedValue({ success: true, transcoded: false }),
    ...overrides
  };
}

export function createCanvasRenderLoopServiceMock(overrides = {}) {
  return {
    isActive: vi.fn(() => false),
    startRendering: vi.fn(),
    stopRendering: vi.fn(),
    clearCanvas: vi.fn(),
    resize: vi.fn(),
    resetCanvasState: vi.fn(),
    cleanup: vi.fn(),
    hasContextFor: vi.fn().mockReturnValue(false),
    ...overrides
  };
}

export function createViewportServiceMock(overrides = {}) {
  return {
    calculateDimensions: vi.fn(() => ({ width: 640, height: 576 })),
    initialize: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(false),
    forceResize: vi.fn(),
    resetDimensions: vi.fn(),
    cleanup: vi.fn(),
    _resizeObserver: null,
    ...overrides
  };
}

export function createStreamHealthServiceMock(overrides = {}) {
  return {
    checkStreamHealth: vi.fn((videoEl, onHealthy) => {
      onHealthy({ frameTime: 100 });
    }),
    cleanup: vi.fn(),
    ...overrides
  };
}

export function createGpuRenderLoopServiceMock(overrides = {}) {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    ...overrides
  };
}

export function createStreamingRendererFactoryMock(overrides = {}) {
  return {
    selectRendererType: vi.fn(() => 'canvas2d'),
    createRenderer: vi.fn(),
    hasRenderer: vi.fn().mockReturnValue(true),
    getRegisteredTypes: vi.fn(() => ['gpu', 'canvas2d']),
    ...overrides
  };
}

export function createRendererAdapterMock(overrides = {}) {
  return {
    initialize: vi.fn().mockResolvedValue(true),
    renderFrame: vi.fn().mockResolvedValue(undefined),
    resize: vi.fn(),
    isActive: vi.fn().mockReturnValue(true),
    pause: vi.fn(),
    resume: vi.fn(),
    cleanup: vi.fn(),
    supportsPresets: vi.fn().mockReturnValue(false),
    getPresetId: vi.fn(() => null),
    setPreset: vi.fn(),
    setHiddenStateFn: vi.fn(),
    isCanvasTransferred: vi.fn().mockReturnValue(false),
    terminateAndReset: vi.fn(),
    releaseGpuResources: vi.fn(),
    clearCanvas: vi.fn(),
    resetCanvasState: vi.fn(),
    handlePipelineStop: vi.fn(),
    ...overrides
  };
}

export function createGpuRendererServiceMock(overrides = {}) {
  return {
    initialize: vi.fn().mockResolvedValue(false),
    renderFrame: vi.fn().mockResolvedValue(undefined),
    setPreset: vi.fn(),
    getPresetId: vi.fn(() => 'vibrant'),
    isActive: vi.fn().mockReturnValue(false),
    isCanvasTransferred: vi.fn().mockReturnValue(false),
    terminateAndReset: vi.fn(),
    releaseGpuResources: vi.fn(),
    resize: vi.fn(),
    cleanup: vi.fn(),
    captureFrame: vi.fn(),
    getTargetDimensions: vi.fn(() => ({ width: 640, height: 576 })),
    ...overrides
  };
}

export function createStreamViewServiceMock(overrides = {}) {
  return {
    getCanvas: vi.fn(),
    getVideo: vi.fn(),
    getCanvasContainer: vi.fn(),
    getCanvasSection: vi.fn(),
    setCanvas: vi.fn(),
    attachMutedStream: vi.fn(),
    clearStream: vi.fn(),
    setMuted: vi.fn(),
    ...overrides
  };
}

export function createStreamingServiceFacadeMock(overrides = {}) {
  return {
    start: vi.fn().mockResolvedValue({}),
    stop: vi.fn().mockResolvedValue(),
    getStream: vi.fn(),
    isActive: vi.fn(),
    ...overrides
  };
}

export function createStreamingRenderPipelineServiceMock(overrides = {}) {
  return {
    initialize: vi.fn(),
    handleCanvasExpired: vi.fn(),
    handlePerformanceStateChanged: vi.fn(),
    handleRenderPresetChanged: vi.fn(),
    handlePerformanceModeChanged: vi.fn(),
    handleFullscreenChange: vi.fn(),
    startPipeline: vi.fn().mockResolvedValue(undefined),
    stopPipeline: vi.fn(),
    cleanup: vi.fn(),
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

export function createCanvasLifecycleServiceMock(overrides = {}) {
  return {
    initialize: vi.fn(),
    handleCanvasExpired: vi.fn(),
    handleFullscreenChange: vi.fn(),
    setupCanvasSize: vi.fn(),
    recreateCanvas: vi.fn(),
    cleanup: vi.fn(),
    ...overrides
  };
}

export function createLoginItemServiceMock(overrides = {}) {
  return {
    isEnabled: vi.fn(() => false),
    setEnabled: vi.fn(),
    ...overrides
  };
}

export function createMediaServiceMock(overrides = {}) {
  return {
    getUserMedia: vi.fn().mockResolvedValue({
      id: 'mock-media-stream',
      active: true,
      getTracks: vi.fn(() => [{ kind: 'video', label: 'Mock Video' }])
    }),
    ...overrides,
  };
}

export function createStreamingAdapterMock(overrides = {}) {
  return {
    getStream: vi.fn(),
    releaseStream: vi.fn().mockResolvedValue(undefined),
    getCapabilities: vi.fn(),
    ...overrides
  };
}

export function createStreamingAdapterRegistryMock(overrides = {}) {
  const { defaultAdapter, ...methodOverrides } = overrides;
  const state = {
    adapter: defaultAdapter ?? createStreamingAdapterMock()
  };

  const registry = {
    _setAdapter: (nextAdapter) => {
      state.adapter = nextAdapter;
    },
    _getAdapter: () => state.adapter,
    ...methodOverrides
  };

  if (!('getAdapterForDevice' in methodOverrides)) {
    registry.getAdapterForDevice = vi.fn((..._) => state.adapter);
  }

  return registry;
}

export function createIpcClientMock(overrides = {}) {
  return {
    getDeviceStatus: vi.fn(),
    ...overrides
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

export function createDeviceStatusComponentMock(overrides = {}) {
  return {
    updateStatus: vi.fn(),
    updateOverlayMessage: vi.fn(),
    showError: vi.fn(),
    setOverlayVisible: vi.fn(),
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
