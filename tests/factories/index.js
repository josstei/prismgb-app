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
  createAdapterFactory
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

export function createProfileRegistryMock(overrides = {}) {
  return {
    registerProfile: vi.fn(),
    setDefaultProfile: vi.fn(),
    detectDevice: vi.fn(() => ({ matched: false, profile: null })),
    ...overrides
  };
}

export function createDeviceStatusProviderMock(overrides = {}) {
  return {
    getDeviceStatus: vi.fn(),
    ...overrides
  };
}

export function createStreamPayloadMock(overrides = {}) {
  const {
    id = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    getAudioTracks = vi.fn(() => []),
    ...streamOverrides
  } = overrides;

  return {
    id,
    getAudioTracks,
    ...streamOverrides
  };
}

export function createAcquisitionContextMock(overrides = {}) {
  const {
    profile = {
      video: {
        width: 160,
        height: 144
      }
    },
    ...contextOverrides
  } = overrides;

  return {
    deviceId: 'test-device-123',
    profile: {
      ...profile,
      video: {
        width: 160,
        height: 144,
        ...(profile?.video ?? {})
      }
    },
    ...contextOverrides
  };
}

export function createConstraintBuilderContextMock(overrides = {}) {
  const audioProfileDefaults = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    sampleRate: 48000,
  };
  const videoProfileDefaults = {
    width: 1920,
    height: 1080,
    frameRate: 60,
  };
  const {
    deviceId = 'test-device-id',
    audioDeviceId = 'audio-device-id',
    videoDeviceId = 'video-device-id',
    profile = {
      audio: audioProfileDefaults,
      video: videoProfileDefaults,
    },
    getDeviceConstraint = vi.fn(() => ({ exact: videoDeviceId })),
    getAudioDeviceConstraint = vi.fn(() => ({ exact: audioDeviceId })),
    ...contextOverrides
  } = overrides;

  return {
    deviceId,
    getDeviceConstraint,
    getAudioDeviceConstraint,
    profile: {
      ...profile,
      audio: {
        ...audioProfileDefaults,
        ...(profile.audio ?? {}),
      },
      video: {
        ...videoProfileDefaults,
        ...(profile.video ?? {}),
      },
    },
    ...contextOverrides,
  };
}


export function createUpdateConfigMock(overrides = {}) {
  return {
    isDevelopment: false,
    version: '1.0.0',
    ...overrides
  };
}

export function createStreamConstraintsMock(overrides = {}) {
  const {
    deviceId = 'test-device-123',
    audio = {},
    video = {},
    ...constraintOverrides
  } = overrides;
  const normalizedAudio = typeof audio === 'object' && audio !== null
    ? {
      ...audio,
      ...(!('deviceId' in audio) ? { deviceId: { exact: deviceId } } : {})
    }
    : audio;
  const normalizedVideo = typeof video === 'object' && video !== null
    ? {
      width: 160,
      ...video,
      ...(!('deviceId' in video) ? { deviceId: { exact: deviceId } } : {})
    }
    : video;

  return {
    audio: normalizedAudio,
    video: normalizedVideo,
    ...constraintOverrides
  };
}

export function createStreamStartedPayloadMock(overrides = {}) {
  const {
    stream = createCaptureStreamMock(),
    device = createDeviceInfo({
      deviceId: 'test-device-id',
      label: 'Test Device',
      kind: 'videoinput'
    }),
    settings = {
      video: {
        width: 160,
        height: 144,
        frameRate: 60
      }
    },
    capabilities = createStreamCapabilitiesMock({ canvasScale: 4, nativeResolution: { width: 160, height: 144 } }),
    ...payloadOverrides
  } = overrides;

  return {
    stream,
    device,
    settings,
    capabilities,
    ...payloadOverrides
  };
}

export function createSupportedDevicePayloadMock(overrides = {}) {
  const {
    device = createDeviceInfo({
      deviceId: 'test-device-id',
      label: 'Test Device',
      kind: 'videoinput'
    }),
    ...payloadOverrides
  } = overrides;

  return {
    device,
    ...payloadOverrides
  };
}

export function createMediaTrackMock(overrides = {}) {
  const eventListeners = new Map();

  return {
    id: overrides.id ?? `track-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    stop: vi.fn(),
    clone: vi.fn(() => ({ ...createMediaTrackMock(), id: 'cloned-track' })),
    addEventListener: vi.fn((event, handler) => {
      if (!eventListeners.has(event)) {
        eventListeners.set(event, []);
      }
      eventListeners.get(event).push(handler);
    }),
    removeEventListener: vi.fn((event, handler) => {
      const handlers = eventListeners.get(event);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    }),
    _eventListeners: eventListeners,
    ...overrides
  };
}

export function createRecordingFrameMock(overrides = {}) {
  return {
    width: 640,
    height: 576,
    close: vi.fn(),
    ...overrides
  };
}

export function createMediaStreamMock(overrides = {}) {
  const tracks = Array.isArray(overrides.tracks) ? [...overrides.tracks] : [];
  const { tracks: _tracks, ...streamOverrides } = overrides;

  return {
    addTrack: vi.fn((track) => tracks.push(track)),
    getTracks: vi.fn(() => [...tracks]),
    ...streamOverrides,
    _tracks: tracks,
    _setTracks: (nextTracks) => {
      tracks.splice(0, tracks.length, ...nextTracks);
    },
  };
}

export function createCaptureStreamMock(overrides = {}) {
  const {
    tracks = [],
    videoTracks = [],
    audioTracks = [],
    getVideoTracks = vi.fn(() => [...videoTracks]),
    getAudioTracks = vi.fn(() => [...audioTracks]),
    ...streamOverrides
  } = overrides;

  const baseTracks = tracks.length > 0 ? [...tracks] : [...videoTracks, ...audioTracks];

  return {
    ...createMediaStreamMock({ ...streamOverrides, tracks: baseTracks }),
    getVideoTracks,
    getAudioTracks,
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


export function createStreamCapabilitiesMock(overrides = {}) {
  const {
    frameRate = 60,
    nativeResolution = { width: 160, height: 144 },
    ...capabilityOverrides
  } = overrides;

  return {
    frameRate,
    nativeResolution,
    ...capabilityOverrides
  };
}


export function createDeviceStatusMock(overrides = {}) {
  return {
    connected: false,
    deviceId: null,
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

export function createBrowserWindowMock(overrides = {}) {
  const {
    webContents: webContentsOverrides = {},
    ...windowOverrides
  } = overrides;

  const defaultWebContents = {
    send: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
    isDevToolsOpened: vi.fn().mockReturnValue(false),
    closeDevTools: vi.fn(),
    session: {
      on: vi.fn(),
      off: vi.fn()
    }
  };

  return {
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    focus: vi.fn(),
    restore: vi.fn(),
    destroy: vi.fn(),
    isMinimized: vi.fn().mockReturnValue(false),
    isDestroyed: vi.fn().mockReturnValue(false),
    setSkipTaskbar: vi.fn(),
    removeAllListeners: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    webContents: {
      ...defaultWebContents,
      ...webContentsOverrides,
      session: {
        ...defaultWebContents.session,
        ...(webContentsOverrides.session ?? {})
      }
    },
    ...windowOverrides
  };
}

export function createWindowServiceElectronMock(overrides = {}) {
  const {
    app: appOverrides = {},
    browserWindow: browserWindowOverrides = {}
  } = overrides;

  const BrowserWindow = class MockBrowserWindow {
    constructor() {
      Object.assign(this, createBrowserWindowMock(browserWindowOverrides));
    }
  };

  return {
    BrowserWindow,
    app: {
      isPackaged: false,
      getAppPath: vi.fn(() => '/app/path'),
      getPath: vi.fn(() => '/downloads'),
      isQuitting: false,
      focus: vi.fn(),
      ...appOverrides
    }
  };
}

export function createTrayMock(overrides = {}) {
  return {
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
    ...overrides
  };
}

export function createTrayServiceElectronMock(overrides = {}) {
  const {
    app: appOverrides = {},
    menu: menuOverrides = {},
    tray: trayOverrides = {}
  } = overrides;

  const Tray = class MockTray {
    constructor() {
      Object.assign(this, createTrayMock(trayOverrides));
    }
  };

  return {
    Tray,
    Menu: {
      buildFromTemplate: vi.fn(() => ({})),
      ...menuOverrides
    },
    app: {
      getAppPath: vi.fn(() => '/app/path'),
      quit: vi.fn(),
      isQuitting: false,
      ...appOverrides
    }
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

export function createConstraintBuilderMock(overrides = {}) {
  return {
    build: vi.fn(() => ({ video: { width: 160, height: 144 } })),
    buildWithStrategy: vi.fn(),
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

export function createPerformanceMetricsAdapterMock(overrides = {}) {
  return {
    isAvailable: vi.fn(() => false),
    getProcessMetrics: vi.fn(),
    ...overrides
  };
}

export function createVisibilityAdapterMock(overrides = {}) {
  let callbackRef = null;
  const adapter = {
    isHidden: vi.fn(() => false),
    onVisibilityChange: vi.fn((callback) => {
      callbackRef = callback;
      return vi.fn();
    }),
    dispose: vi.fn(),
    get callbackRef() {
      return callbackRef;
    },
    ...overrides
  };
  return adapter;
}

export function createUserActivityAdapterMock(overrides = {}) {
  let callbackRef = null;
  const adapter = {
    onActivity: vi.fn((callback) => {
      callbackRef = callback;
      return vi.fn();
    }),
    dispose: vi.fn(),
    get callbackRef() {
      return callbackRef;
    },
    ...overrides
  };
  return adapter;
}

export function createReducedMotionAdapterMock(overrides = {}) {
  let callbackRef = null;
  const adapter = {
    prefersReducedMotion: vi.fn(() => false),
    onChange: vi.fn((callback) => {
      callbackRef = callback;
      return vi.fn();
    }),
    get callbackRef() {
      return callbackRef;
    },
    ...overrides
  };
  return adapter;
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


export function createAppMetricsServiceMock(overrides = {}) {
  return {
    getAppMetrics: vi.fn(),
    ...overrides
  };
}

export function createProcessMetricsMock(overrides = {}) {
  return {
    success: false,
    totalMB: '0.0',
    processes: [{ type: 'Renderer', memoryMB: '0.0' }],
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

export function createDeviceIpcAdapterMock(overrides = {}) {
  return {
    subscribe: vi.fn(() => vi.fn()),
    dispose: vi.fn(),
    ...overrides
  };
}

export function createDeviceOperationSequencerMock(overrides = {}) {
  return {
    queueConnected: vi.fn().mockResolvedValue(undefined),
    queueDisconnected: vi.fn().mockImplementation((callback) => {
      if (typeof callback === 'function') {
        callback();
      }
      return Promise.resolve();
    }),
    queueRefresh: vi.fn().mockResolvedValue(undefined),
    flush: vi.fn().mockResolvedValue(undefined),
    getQueueDepth: vi.fn().mockReturnValue(0),
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
