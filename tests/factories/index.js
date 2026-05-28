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





export function createRecordingFrameMock(overrides = {}) {
  return {
    width: 640,
    height: 576,
    close: vi.fn(),
    ...overrides
  };
}



export function createMediaBlobEventMock(overrides = {}) {
  return {
    data: { size: 0, ...overrides.data },
    ...overrides,
  };
}

export function createMediaRecorderMock(overrides = {}) {
  const listeners = {};
  let ondataavailable = vi.fn();
  let onerror = vi.fn();
  let onstop = vi.fn();

  const mock = {
    start: vi.fn(),
    stop: vi.fn(() => {
      mock.dispatchEvent({ type: 'stop' });
    }),
    pause: vi.fn(),
    resume: vi.fn(),
    requestData: vi.fn(),
    addEventListener: vi.fn((event, cb) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    }),
    removeEventListener: vi.fn((event, cb) => {
      if (listeners[event]) {
        const index = listeners[event].indexOf(cb);
        if (index > -1) listeners[event].splice(index, 1);
      }
    }),
    dispatchEvent: vi.fn((eventObj) => {
      const type = eventObj.type;
      const list = listeners[type] || [];
      list.forEach(l => l(eventObj));
    }),
    ...overrides,
  };

  Object.defineProperty(mock, 'ondataavailable', {
    get() {
      return (event) => {
        const list = listeners['dataavailable'] || [];
        list.forEach(l => l(event));
        if (ondataavailable) ondataavailable(event);
      };
    },
    set(cb) {
      ondataavailable = cb;
    },
    configurable: true
  });

  Object.defineProperty(mock, 'onerror', {
    get() {
      return (event) => {
        const list = listeners['error'] || [];
        list.forEach(l => l(event));
        if (onerror) onerror(event);
      };
    },
    set(cb) {
      onerror = cb;
    },
    configurable: true
  });

  Object.defineProperty(mock, 'onstop', {
    get() {
      return (event) => {
        const list = listeners['stop'] || [];
        list.forEach(l => l(event));
        if (onstop) onstop(event);
      };
    },
    set(cb) {
      onstop = cb;
    },
    configurable: true
  });

  return mock;
}

export function createMediaRecorderErrorEventMock(overrides = {}) {
  return {
    error: {
      message: 'Recording failed',
      name: 'RecordingError',
      ...overrides.error,
    },
    ...overrides,
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



export function createStreamLifecycleMock(overrides = {}) {
  return {
    acquireStream: vi.fn(() => Promise.resolve({ id: 'mock-stream' })),
    releaseStream: vi.fn(() => Promise.resolve()),
    getStreamInfo: vi.fn(),
    ...overrides
  };
}

export function createWorkerInstanceMock(overrides = {}) {
  return {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null,
    onerror: null,
    ...overrides
  };
}

export function createAcquisitionCoordinatorMock(overrides = {}) {
  return {
    acquire: vi.fn(),
    ...overrides
  };
}

export function createFallbackStrategyMock(overrides = {}) {
  return {
    initialize: vi.fn(),
    hasMore: vi.fn(),
    getNext: vi.fn(),
    ...overrides
  };
}


export function createTranscodeUIControllerMock(overrides = {}) {
  const {
    transcodeToast,
    registry,
    ...componentOverrides
  } = overrides;

  const toast = transcodeToast ?? createCaptureToastMock();

  return {
    registry: registry ?? {
      get: vi.fn((name) => (name === 'transcodeToastComponent' ? toast : null)),
    },
    ...componentOverrides
  };
}

export function createStreamingViewControllerMock(overrides = {}) {
  const {
    streamVideo,
    streamCanvas,
    elements,
    setStreamCanvas,
    ...componentOverrides
  } = overrides;

  const mergedElements = {
    streamVideo: streamVideo ?? createMockVideo(),
    streamCanvas: streamCanvas ?? createMockCanvas(),
    ...elements,
  };

  return {
    elements: mergedElements,
    setStreamCanvas: setStreamCanvas ?? vi.fn((canvas) => {
      mergedElements.streamCanvas = canvas;
    }),
    ...componentOverrides
  };
}

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

export function createCaptureToastMock(overrides = {}) {
  return {
    show: vi.fn(),
    updateProgress: vi.fn(),
    showSuccess: vi.fn(),
    showError: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
    ...overrides
  };
}

export function createCaptureUIControllerMock(overrides = {}) {
  return {
    triggerDownload: vi.fn(),
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

export function createStreamingViewElementsMock(overrides = {}) {
  const {
    streamVideo = {},
    streamCanvas = {},
    ...rest
  } = overrides;
  const baseStreamVideo = createMockElement('video');
  const baseStreamCanvas = createMockElement('canvas');

  return {
    streamVideo: {
      ...baseStreamVideo,
      ...streamVideo
    },
    streamCanvas: {
      ...baseStreamCanvas,
      ...streamCanvas
    },
    ...rest,
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

export function createGpuWorkerManagerMock(overrides = {}) {
  return {
    isReady: vi.fn(() => false),
    isCanvasTransferred: vi.fn(() => false),
    getCapabilities: vi.fn(() => null),
    initialize: vi.fn().mockResolvedValue(true),
    sendCommand: vi.fn(),
    onMessage: vi.fn(() => vi.fn()),
    releaseResources: vi.fn(),
    terminate: vi.fn(),
    ...overrides
  };
}

export function createGpuFrameBufferMock(overrides = {}) {
  return {
    enqueue: vi.fn(() => true),
    dequeue: vi.fn(() => null),
    isFull: vi.fn(() => false),
    flush: vi.fn(),
    getMetrics: vi.fn(() => ({ queued: 0, dropped: 0, avgLatency: 0 })),
    resetMetrics: vi.fn(),
    getCapacity: vi.fn(() => 3),
    getSize: vi.fn(() => 0),
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

export function createWorkerPipelineMock(overrides = {}) {
  return {
    render: vi.fn(),
    resize: vi.fn(),
    captureFrame: vi.fn(async () => ({ id: 'captured-frame', close: vi.fn() })),
    getStats: vi.fn(() => ({
      fps: 60,
      frameTime: 16.0,
      framesRendered: 10,
      framesDropped: 0
    })),
    dispose: vi.fn(async () => {}),
    setPreset: vi.fn(),
    setBrightness: vi.fn(),
    ...overrides
  };
}

export function createCanvasRenderPipelineMock(overrides = {}) {
  return {
    renderFrame: vi.fn(),
    resize: vi.fn(),
    clearFrame: vi.fn(),
    dispose: vi.fn(async () => undefined),
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
