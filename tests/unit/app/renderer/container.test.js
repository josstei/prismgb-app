/**
 * Renderer Container Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock all the imported modules before importing the container
vi.mock('@renderer/infrastructure/di/service-container.factory.js', () => {
  const autoDepsByKey = {
    eventBus: ['loggerFactory'],
    deviceIpcAdapter: ['loggerFactory'],
    deviceChangeDebounceAdapter: ['browserMediaService', 'loggerFactory'],
    viewportService: ['loggerFactory'],
    canvasLifecycleService: ['streamViewService', 'canvasRenderer', 'viewportService', 'gpuRendererService', 'eventBus', 'loggerFactory'],
    gpuRenderLoopService: ['loggerFactory'],
    streamHealthService: ['loggerFactory'],
    gpuFrameBuffer: ['loggerFactory'],
    gpuWorkerManager: ['loggerFactory', 'eventBus'],
    gpuRendererService: ['eventBus', 'loggerFactory', 'settingsService', 'gpuFrameBuffer', 'gpuWorkerManager'],
    renderPipelineService: ['appState', 'streamViewService', 'canvasLifecycleService', 'streamHealthService', 'streamingRendererFactory', 'gpuRendererService', 'gpuRenderLoopService', 'canvasRenderer', 'eventBus', 'loggerFactory'],
    deviceStatusProvider: ['ipcClient'],

    deviceStorageService: ['storageService', 'loggerFactory'],
    deviceMediaService: ['eventBus', 'loggerFactory', 'browserMediaService', 'deviceStatusProvider', 'deviceStorageService', 'deviceChangeDebounceAdapter'],
    deviceOperationSequencer: ['deviceMediaService', 'eventBus', 'loggerFactory'],

    streamingService: ['deviceMediaService', 'deviceStorageService', 'eventBus', 'loggerFactory', 'adapterFactory', 'ipcClient'],

    captureService: ['eventBus', 'loggerFactory'],
    gpuRecordingService: ['gpuRendererService', 'eventBus', 'loggerFactory'],
    transcodeService: ['eventBus', 'loggerFactory'],
    captureSaveService: ['streamViewService', 'captureService', 'gpuRendererService', 'gpuRecordingService', 'transcodeService', 'eventBus', 'loggerFactory'],

    settingsService: ['eventBus', 'loggerFactory', 'storageService'],
    notesService: ['eventBus', 'loggerFactory', 'storageService'],
    updateService: ['eventBus', 'loggerFactory'],
    streamViewService: ['uiController', 'loggerFactory'],
    streamingAudioPipelineService: ['eventBus', 'loggerFactory', 'settingsService'],
    appState: ['streamingService', 'deviceMediaService', 'eventBus'],
    uiEventBridge: ['eventBus', 'uiController', 'presentationModeService', 'loggerFactory'],
    presentationModeService: ['uiController', 'appState', 'loggerFactory'],
    captureUiBridge: ['eventBus', 'uiController', 'loggerFactory'],
    updateUiBridge: ['eventBus', 'loggerFactory'],
    transcodeUiBridge: ['eventBus', 'uiController', 'loggerFactory'],

    fullscreenService: ['eventBus', 'loggerFactory'],
    performanceMetricsService: ['loggerFactory', 'metricsAdapter'],
    performanceStateService: ['eventBus', 'visibilityAdapter', 'userActivityAdapter', 'reducedMotionAdapter', 'loggerFactory'],
    animationPerformanceService: ['loggerFactory'],
    deviceOrchestrator: ['deviceMediaService', 'deviceIpcAdapter', 'deviceOperationSequencer', 'eventBus', 'loggerFactory'],
    streamingAudioOrchestrator: ['streamingAudioPipelineService', 'streamViewService', 'appState', 'eventBus', 'loggerFactory'],
    streamingOrchestrator: ['streamingService', 'appState', 'streamViewService', 'renderPipelineService', 'gpuRecordingService', 'settingsService', 'eventBus', 'loggerFactory'],
    captureOrchestrator: ['captureService', 'appState', 'streamViewService', 'gpuRendererService', 'gpuRecordingService', 'canvasRenderer', 'transcodeService', 'captureSaveService', 'eventBus', 'loggerFactory'],
    preferencesOrchestrator: ['settingsService', 'eventBus', 'loggerFactory'],
    displayModeOrchestrator: ['settingsService', 'eventBus', 'loggerFactory'],
    performanceOrchestrator: ['performanceStateService', 'performanceMetricsService', 'animationPerformanceService', 'appState', 'eventBus', 'loggerFactory'],
    uiSetupOrchestrator: ['uiController', 'uiComponentRegistry', 'uiEffects', 'settingsService', 'updateService', 'appState', 'eventBus', 'loggerFactory'],
    appOrchestrator: ['deviceOrchestrator', 'streamingOrchestrator', 'streamingAudioOrchestrator', 'captureOrchestrator', 'preferencesOrchestrator', 'displayModeOrchestrator', 'performanceOrchestrator', 'uiSetupOrchestrator', 'updateUiBridge', 'eventBus', 'loggerFactory']
  };

  return {
    ServiceContainer: class MockServiceContainer {
      constructor() {
        this.registerSingleton = vi.fn();
        this.registerClass = vi.fn((name, ServiceClass, deps = []) => {
          this.registerSingleton(name, ServiceClass, deps);
        });
        this.registerFactory = vi.fn((name, factory, deps = []) => {
          this.registerSingleton(name, factory, deps);
        });
        this.autoRegister = vi.fn((name, ServiceClass) => {
          const deps = autoDepsByKey[name] ?? [...(ServiceClass.dependencies ?? [])];
          this.registerFactory(
            name,
            (...resolvedDeps) => {
              const depsObj = {};
              for (let i = 0; i < deps.length; i++) {
                depsObj[deps[i]] = resolvedDeps[i];
              }
              return new ServiceClass(depsObj);
            },
            deps
          );
        });
        this.resolve = vi.fn();
        this.dispose = vi.fn();
      }
    },
    asValue: vi.fn((val) => ({ __asValue: true, value: val }))
  };
});

// Application layer mocks
vi.mock('@renderer/application/state/app-state.ts', () => ({
  AppState: vi.fn()
}));

vi.mock('@renderer/application/orchestrators/app.orchestrator.ts', () => ({
  AppOrchestrator: vi.fn()
}));

vi.mock('@renderer/application/orchestrators/performance.orchestrator.ts', () => ({
  PerformanceOrchestrator: vi.fn()
}));

vi.mock('@renderer/infrastructure/services/performance/performance-animation.service.ts', () => ({
  PerformanceAnimationService: vi.fn()
}));

vi.mock('@renderer/infrastructure/services/performance/performance-state.service.ts', () => ({
  PerformanceStateService: vi.fn()
}));

vi.mock('@renderer/infrastructure/services/performance/performance-metrics.service.ts', () => ({
  PerformanceMetricsService: vi.fn()
}));

vi.mock('@renderer/infrastructure/adapters/platform/metrics.adapter.ts', () => ({
  MetricsAdapter: vi.fn()
}));

// UI layer mocks
vi.mock('@renderer/application/orchestrators/ui-setup.orchestrator.ts', () => ({
  UISetupOrchestrator: vi.fn()
}));

vi.mock('@renderer/presentation/controller/component.registry.js', () => ({
  UIComponentRegistry: vi.fn()
}));

vi.mock('@renderer/presentation/effects/ui-effects.class.ts', () => ({
  UIEffects: vi.fn()
}));

vi.mock('@renderer/presentation/effects/body-class.class.ts', () => ({
  BodyClassManager: vi.fn()
}));

vi.mock('@renderer/presentation/bridges/ui-event.bridge.ts', () => ({
  UIEventBridge: vi.fn()
}));

vi.mock('@renderer/infrastructure/services/settings/presentation-mode.service.ts', () => ({
  PresentationModeService: vi.fn()
}));

vi.mock('@renderer/presentation/bridges/capture-ui.bridge.ts', () => ({
  CaptureUIBridge: vi.fn()
}));

vi.mock('@renderer/presentation/bridges/transcode-ui.bridge.ts', () => ({
  TranscodeUIBridge: vi.fn()
}));

// Features: Devices mocks
vi.mock('@renderer/infrastructure/services/devices/device-storage.service.ts', () => ({
  DeviceStorageService: vi.fn()
}));

vi.mock('@renderer/infrastructure/services/devices/device-media.service.ts', () => ({
  DeviceMediaService: vi.fn()
}));

vi.mock('@renderer/application/orchestrators/device.orchestrator.ts', () => ({
  DeviceOrchestrator: vi.fn()
}));

vi.mock('@renderer/infrastructure/adapters/devices/device-ipc-status.adapter.ts', () => ({
  DeviceIpcStatusAdapter: vi.fn()
}));

vi.mock('@renderer/infrastructure/adapters/devices/device-ipc.adapter.ts', () => ({
  DeviceIpcAdapter: vi.fn()
}));

vi.mock('@renderer/infrastructure/adapters/devices/chromatic/chromatic.adapter.ts', () => ({
  DeviceChromaticAdapter: vi.fn()
}));

// Features: Streaming mocks
vi.mock('@renderer/infrastructure/services/streaming/streaming.service.ts', () => ({
  StreamingService: vi.fn()
}));

vi.mock('@renderer/application/orchestrators/streaming.orchestrator.ts', () => ({
  StreamingOrchestrator: vi.fn()
}));

vi.mock('@renderer/application/orchestrators/streaming-audio.orchestrator.ts', () => ({
  StreamingAudioOrchestrator: vi.fn()
}));

vi.mock('@renderer/infrastructure/factories/streaming-adapter.factory.ts', () => ({
  StreamingAdapterFactory: vi.fn()
}));

vi.mock('@renderer/infrastructure/services/streaming/canvas-renderer.ts', () => ({
  StreamingCanvasRenderer: vi.fn()
}));

vi.mock('@renderer/infrastructure/services/streaming/render-pipeline.service.ts', () => ({
  StreamingRenderPipelineService: vi.fn()
}));

vi.mock('@renderer/infrastructure/services/streaming/canvas-lifecycle.service.ts', () => ({
  StreamingCanvasLifecycleService: vi.fn()
}));

vi.mock('@renderer/infrastructure/services/streaming/gpu-render-loop.service.ts', () => ({
  StreamingGpuRenderLoopService: vi.fn()
}));

vi.mock('@renderer/infrastructure/services/streaming/viewport.service.ts', () => ({
  StreamingViewportService: vi.fn()
}));

vi.mock('@renderer/infrastructure/services/streaming/health.service.ts', () => ({
  StreamingHealthService: vi.fn()
}));

vi.mock('@renderer/infrastructure/services/streaming/gpu-renderer.service.ts', () => ({
  StreamingGpuRendererService: vi.fn()
}));

vi.mock('@renderer/infrastructure/services/streaming/streaming-view.service.ts', () => ({
  StreamingViewService: vi.fn()
}));

vi.mock('@renderer/infrastructure/services/streaming/audio-pipeline.service.ts', () => ({
  StreamingAudioPipelineService: vi.fn()
}));

vi.mock('@renderer/infrastructure/services/streaming/gpu-frame-buffer.ts', () => ({
  GpuFrameBuffer: vi.fn()
}));

vi.mock('@renderer/infrastructure/services/streaming/gpu-worker-manager.ts', () => ({
  GpuWorkerManager: vi.fn()
}));

vi.mock('@renderer/infrastructure/factories/streaming-renderer.factory.ts', () => ({
  StreamingRendererFactory: vi.fn()
}));

vi.mock('@renderer/infrastructure/adapters/streaming/gpu-renderer.adapter.ts', () => ({
  StreamingGpuRendererAdapter: vi.fn()
}));

vi.mock('@renderer/infrastructure/adapters/streaming/canvas2d-renderer.adapter.ts', () => ({
  StreamingCanvas2DRendererAdapter: vi.fn()
}));

vi.mock('@renderer/infrastructure/adapters/devices/device-change-debounce.adapter.ts', () => ({
  DeviceChangeDebounceAdapter: vi.fn()
}));

vi.mock('@renderer/infrastructure/services/devices/device-operation-sequencer.service.ts', () => ({
  DeviceOperationSequencerService: vi.fn()
}));

vi.mock('@renderer/infrastructure/services/notes/notes.service.ts', () => ({
  NotesService: vi.fn()
}));

vi.mock('@renderer/presentation/features/streaming/streaming-controls.component.js', () => ({
  StreamingControlsComponent: vi.fn()
}));

vi.mock('@renderer/presentation/features/toolbar/components/shader-selector.component.js', () => ({
  ShaderSelectorComponent: vi.fn()
}));

vi.mock('@renderer/presentation/shared/status-notification.component.js', () => ({
  StatusNotificationComponent: vi.fn()
}));

vi.mock('@renderer/presentation/shared/device-status.component.js', () => ({
  DeviceStatusComponent: vi.fn()
}));

vi.mock('@renderer/presentation/features/transcode/transcode-toast.component.js', () => ({
  TranscodeToastComponent: vi.fn()
}));

// Features: Capture mocks
vi.mock('@renderer/infrastructure/services/capture/capture.service.ts', () => ({
  CaptureService: vi.fn()
}));

vi.mock('@renderer/application/orchestrators/capture.orchestrator.ts', () => ({
  CaptureOrchestrator: vi.fn()
}));

vi.mock('@renderer/infrastructure/services/capture/gpu-recording.service.ts', () => ({
  CaptureGpuRecordingService: vi.fn()
}));

vi.mock('@renderer/infrastructure/services/capture/capture-save.service.ts', () => ({
  CaptureSaveService: vi.fn()
}));

// Features: Transcode mocks
vi.mock('@renderer/infrastructure/services/transcode/transcode.service.ts', () => ({
  TranscodeService: vi.fn()
}));

// Features: Settings mocks
vi.mock('@renderer/infrastructure/services/settings/settings.service.ts', () => ({
  SettingsService: vi.fn()
}));

vi.mock('@shared/config/storage-keys.config.ts', () => ({
  PROTECTED_STORAGE_KEYS: []
}));

vi.mock('@renderer/application/orchestrators/preferences.orchestrator.ts', () => ({
  SettingsPreferencesOrchestrator: vi.fn()
}));

vi.mock('@renderer/application/orchestrators/display-mode.orchestrator.ts', () => ({
  SettingsDisplayModeOrchestrator: vi.fn()
}));

vi.mock('@renderer/infrastructure/services/settings/fullscreen.service.ts', () => ({
  SettingsFullscreenService: vi.fn()
}));

vi.mock('@renderer/presentation/features/settings/settings-menu.component.js', () => ({
  SettingsMenuComponent: vi.fn()
}));

vi.mock('@renderer/presentation/features/notes/notes-panel.component.js', () => ({
  NotesPanelComponent: vi.fn()
}));

// Features: Updates mocks
vi.mock('@renderer/infrastructure/services/updates/update.service.ts', () => ({
  UpdateService: vi.fn()
}));

vi.mock('@renderer/presentation/bridges/update-ui.bridge.ts', () => ({
  UpdateUIBridge: vi.fn()
}));

vi.mock('@renderer/presentation/features/updates/update-section.component.js', () => ({
  UpdateSectionComponent: vi.fn()
}));

// Infrastructure mocks
vi.mock('@renderer/infrastructure/events/event-bus.class.js', () => ({
  EventBus: vi.fn()
}));

vi.mock('@renderer/infrastructure/logging/logger.factory.js', () => ({
  RendererLogger: vi.fn()
}));

vi.mock('@renderer/infrastructure/browser/browser-storage.adapter.js', () => ({
  BrowserStorageAdapter: vi.fn()
}));

vi.mock('@renderer/infrastructure/browser/browser-media.adapter.js', () => ({
  BrowserMediaAdapter: vi.fn()
}));

vi.mock('@renderer/infrastructure/adapters/visibility.adapter.js', () => ({
  VisibilityAdapter: vi.fn()
}));

vi.mock('@renderer/infrastructure/adapters/user-activity.adapter.js', () => ({
  UserActivityAdapter: vi.fn()
}));

vi.mock('@renderer/infrastructure/adapters/reduced-motion.adapter.js', () => ({
  ReducedMotionAdapter: vi.fn()
}));

// Shared mocks
vi.mock('@shared/utils/performance-cache.utils.js', () => ({
  AnimationCache: vi.fn()
}));

vi.mock('@prismgb/gpu', () => ({
  PresetRegistry: {
    setDefault: vi.fn(),
    get: vi.fn(),
    getDefault: vi.fn(() => ({ id: 'vibrant', name: 'Vibrant', description: 'Test' })),
    getForUI: vi.fn(() => []),
    getAll: vi.fn(() => [])
  },
  buildUniforms: vi.fn(),
  detectCapabilities: vi.fn()
}));

// Import the container module
import * as containerModuleImport from '@renderer/application/container';

describe('Renderer Container', () => {
  let containerModule;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Setup window.deviceAPI for ipcClient registration
    window.deviceAPI = { test: true };

    containerModule = containerModuleImport;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    containerModule.resetContainer();
  });

  describe('createRendererContainer', () => {
    it('should create a new ServiceContainer', () => {
      const container = containerModule.createRendererContainer();

      expect(container).toBeDefined();
      expect(container.registerSingleton).toBeDefined();
    });

    it('should register eventBus singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'eventBus',
        expect.any(Function),
        ['loggerFactory']
      );
    });

    it('should register loggerFactory singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'loggerFactory',
        expect.any(Function),
        []
      );
    });

    it('should register ipcClient singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'ipcClient',
        expect.any(Function),
        []
      );
    });

    it('should register deviceStatusProvider singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'deviceStatusProvider',
        expect.any(Function),
        ['ipcClient']
      );
    });

    it('should register adapterFactory singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'adapterFactory',
        expect.any(Function),
        ['eventBus', 'loggerFactory', 'browserMediaService']
      );
    });

    it('should register appState singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'appState',
        expect.any(Function),
        ['streamingService', 'deviceMediaService', 'eventBus']
      );
    });

    it('should register uiComponentRegistry singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'uiComponentRegistry',
        expect.any(Function),
        ['loggerFactory']
      );
    });

    it('should register uiEffects singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'uiEffects',
        expect.any(Function),
        ['bodyClassManager']
      );
    });

    it('should register bodyClassManager singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'bodyClassManager',
        expect.any(Function),
        []
      );
    });

    it('should register presentationModeService singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'presentationModeService',
        expect.any(Function),
        ['uiController', 'appState', 'loggerFactory']
      );
    });

    it('should register deviceMediaService singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'deviceMediaService',
        expect.any(Function),
        ['eventBus', 'loggerFactory', 'browserMediaService', 'deviceStatusProvider', 'deviceStorageService', 'deviceChangeDebounceAdapter']
      );
    });

    it('should register streamingService singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'streamingService',
        expect.any(Function),
        ['deviceMediaService', 'deviceStorageService', 'eventBus', 'loggerFactory', 'adapterFactory', 'ipcClient']
      );
    });

    it('should register streamingRendererFactory singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'streamingRendererFactory',
        expect.any(Function),
        ['eventBus', 'loggerFactory']
      );
    });

    it('should register renderPipelineService singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'renderPipelineService',
        expect.any(Function),
        ['appState', 'streamViewService', 'canvasLifecycleService', 'streamHealthService', 'streamingRendererFactory', 'gpuRendererService', 'gpuRenderLoopService', 'canvasRenderer', 'eventBus', 'loggerFactory']
      );
    });

    it('should register captureService singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'captureService',
        expect.any(Function),
        ['eventBus', 'loggerFactory']
      );
    });

    it('should register settingsService singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'settingsService',
        expect.any(Function),
        ['eventBus', 'loggerFactory', 'storageService']
      );
    });

    it('should register deviceOrchestrator singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'deviceOrchestrator',
        expect.any(Function),
        ['deviceMediaService', 'deviceIpcAdapter', 'deviceOperationSequencer', 'eventBus', 'loggerFactory']
      );
    });

    it('should register streamingAudioOrchestrator singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'streamingAudioOrchestrator',
        expect.any(Function),
        ['streamingAudioPipelineService', 'streamViewService', 'appState', 'eventBus', 'loggerFactory']
      );
    });

    it('should register streamingOrchestrator singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'streamingOrchestrator',
        expect.any(Function),
        ['streamingService', 'appState', 'streamViewService', 'renderPipelineService', 'gpuRecordingService', 'settingsService', 'eventBus', 'loggerFactory']
      );
    });

    it('should register captureOrchestrator singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'captureOrchestrator',
        expect.any(Function),
        ['captureService', 'appState', 'streamViewService', 'gpuRendererService', 'gpuRecordingService', 'canvasRenderer', 'transcodeService', 'captureSaveService', 'eventBus', 'loggerFactory']
      );
    });

    it('should register appOrchestrator singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'appOrchestrator',
        expect.any(Function),
        expect.arrayContaining(['deviceOrchestrator', 'streamingOrchestrator', 'streamingAudioOrchestrator', 'captureOrchestrator'])
      );
    });

    it('should preserve container registration key set', () => {
      const container = containerModule.createRendererContainer();

      const keys = new Set(container.registerSingleton.mock.calls.map(([name]) => name));
      const expectedKeys = new Set([
        'eventBus',
        'loggerFactory',
        'storageService',
        'browserMediaService',
        'visibilityAdapter',
        'userActivityAdapter',
        'reducedMotionAdapter',
        'metricsAdapter',
        'deviceIpcAdapter',
        'deviceChangeDebounceAdapter',
        'animationCache',
        'canvasRenderer',
        'viewportService',
        'canvasLifecycleService',
        'gpuRenderLoopService',
        'streamHealthService',
        'gpuFrameBuffer',
        'gpuWorkerManager',
        'gpuRendererService',
        'streamingRendererFactory',
        'renderPipelineService',
        'ipcClient',
        'deviceStatusProvider',
        'adapterFactory',
        'deviceStorageService',
        'deviceMediaService',
        'deviceOperationSequencer',
        'streamingService',
        'captureService',
        'gpuRecordingService',
        'transcodeService',
        'captureSaveService',
        'settingsService',
        'notesService',
        'updateService',
        'streamViewService',
        'streamingAudioPipelineService',
        'appState',
        'uiComponentRegistry',
        'uiEffects',
        'bodyClassManager',
        'uiEventBridge',
        'presentationModeService',
        'captureUiBridge',
        'updateUiBridge',
        'transcodeUiBridge',
        'deviceOrchestrator',
        'streamingAudioOrchestrator',
        'streamingOrchestrator',
        'captureOrchestrator',
        'preferencesOrchestrator',
        'fullscreenService',
        'displayModeOrchestrator',
        'performanceOrchestrator',
        'performanceMetricsService',
        'performanceStateService',
        'animationPerformanceService',
        'uiSetupOrchestrator',
        'appOrchestrator'
      ]);

      expect(keys).toEqual(expectedKeys);
    });

    it('should support resolve smoke checks', () => {
      const container = containerModule.createRendererContainer();

      expect(() => container.resolve('appOrchestrator')).not.toThrow();
      expect(() => container.resolve('deviceMediaService')).not.toThrow();
      expect(() => container.resolve('streamingService')).not.toThrow();
    });
  });

  describe('initializeContainer', () => {
    it('should create and return container', () => {
      const container = containerModule.initializeContainer();

      expect(container).toBeDefined();
    });

    it('should log initialization message', () => {
      containerModule.initializeContainer();

      expect(console.log).toHaveBeenCalledWith('DI Container initialized with domain services');
    });

    it('should warn if already initialized', () => {
      containerModule.initializeContainer();
      containerModule.initializeContainer();

      expect(console.warn).toHaveBeenCalledWith('Container already initialized');
    });

    it('should return existing container on second call', () => {
      const first = containerModule.initializeContainer();
      const second = containerModule.initializeContainer();

      expect(second).toBe(first);
    });
  });

  describe('getContainer', () => {
    it('should throw if container not initialized', () => {
      expect(() => containerModule.getContainer()).toThrow(
        'Container not initialized. Call initializeContainer() first.'
      );
    });

    it('should return container after initialization', () => {
      containerModule.initializeContainer();

      const container = containerModule.getContainer();

      expect(container).toBeDefined();
    });
  });

  describe('resetContainer', () => {
    it('should dispose container', () => {
      const container = containerModule.initializeContainer();

      containerModule.resetContainer();

      expect(container.dispose).toHaveBeenCalled();
    });

    it('should handle reset when not initialized', () => {
      expect(() => containerModule.resetContainer()).not.toThrow();
    });
  });

  describe('exports', () => {
    it('should export asValue', () => {
      expect(containerModule.asValue).toBeDefined();
    });
  });

  describe('ipcClient factory', () => {
    it('should throw when deviceAPI not available', () => {
      const originalAPI = window.deviceAPI;
      window.deviceAPI = undefined;

      const container = containerModule.createRendererContainer();

      // Get the ipcClient factory function that was registered
      const registerCalls = container.registerSingleton.mock.calls;
      const ipcClientCall = registerCalls.find(call => call[0] === 'ipcClient');
      const factoryFn = ipcClientCall[1];

      expect(() => factoryFn()).toThrow('deviceAPI is not available');

      // Restore
      window.deviceAPI = originalAPI;
    });

    it('should return deviceAPI when available', () => {
      const container = containerModule.createRendererContainer();

      // Get the ipcClient factory function that was registered
      const registerCalls = container.registerSingleton.mock.calls;
      const ipcClientCall = registerCalls.find(call => call[0] === 'ipcClient');
      const factoryFn = ipcClientCall[1];

      expect(factoryFn()).toBe(window.deviceAPI);
    });
  });

  describe('factory function invocations', () => {
    let container;

    beforeEach(() => {
      container = containerModule.createRendererContainer();
    });

    function getFactoryFn(name) {
      const registerCalls = container.registerSingleton.mock.calls;
      const call = registerCalls.find(c => c[0] === name);
      return call ? call[1] : null;
    }

    it('should create loggerFactory', () => {
      const factoryFn = getFactoryFn('loggerFactory');
      const result = factoryFn();
      expect(result).toBeDefined();
    });

    it('should create storageService', () => {
      const factoryFn = getFactoryFn('storageService');
      const result = factoryFn();
      expect(result).toBeDefined();
    });

    it('should create browserMediaService', () => {
      const factoryFn = getFactoryFn('browserMediaService');
      const result = factoryFn();
      expect(result).toBeDefined();
    });

    it('should create visibilityAdapter', () => {
      const factoryFn = getFactoryFn('visibilityAdapter');
      const result = factoryFn();
      expect(result).toBeDefined();
    });

    it('should create userActivityAdapter', () => {
      const factoryFn = getFactoryFn('userActivityAdapter');
      const result = factoryFn();
      expect(result).toBeDefined();
    });

    it('should create reducedMotionAdapter', () => {
      const factoryFn = getFactoryFn('reducedMotionAdapter');
      const result = factoryFn();
      expect(result).toBeDefined();
    });

    it('should create metricsAdapter', () => {
      const factoryFn = getFactoryFn('metricsAdapter');
      const result = factoryFn();
      expect(result).toBeDefined();
    });

    it('should create animationCache', () => {
      const factoryFn = getFactoryFn('animationCache');
      const result = factoryFn();
      expect(result).toBeDefined();
    });

    it('should create bodyClassManager', () => {
      const factoryFn = getFactoryFn('bodyClassManager');
      const result = factoryFn();
      expect(result).toBeDefined();
    });

    it('should create eventBus with loggerFactory', () => {
      const mockLoggerFactory = { create: vi.fn() };
      const factoryFn = getFactoryFn('eventBus');
      const result = factoryFn(mockLoggerFactory);
      expect(result).toBeDefined();
    });

    it('should create deviceIpcAdapter with loggerFactory', () => {
      const mockLoggerFactory = { create: vi.fn(() => ({})) };
      const factoryFn = getFactoryFn('deviceIpcAdapter');
      const result = factoryFn(mockLoggerFactory);
      expect(result).toBeDefined();
    });

    it('should create canvasRenderer with dependencies', () => {
      const mockLoggerFactory = { create: vi.fn(() => ({})) };
      const mockAnimationCache = {};
      const factoryFn = getFactoryFn('canvasRenderer');
      const result = factoryFn(mockLoggerFactory, mockAnimationCache);
      expect(result).toBeDefined();
    });

    it('should create viewportService with loggerFactory', () => {
      const mockLoggerFactory = { create: vi.fn(() => ({})) };
      const factoryFn = getFactoryFn('viewportService');
      const result = factoryFn(mockLoggerFactory);
      expect(result).toBeDefined();
    });

    it('should create gpuRenderLoopService with loggerFactory', () => {
      const mockLoggerFactory = { create: vi.fn(() => ({})) };
      const factoryFn = getFactoryFn('gpuRenderLoopService');
      const result = factoryFn(mockLoggerFactory);
      expect(result).toBeDefined();
    });

    it('should create streamHealthService with loggerFactory', () => {
      const mockLoggerFactory = { create: vi.fn(() => ({})) };
      const factoryFn = getFactoryFn('streamHealthService');
      const result = factoryFn(mockLoggerFactory);
      expect(result).toBeDefined();
    });

    it('should create deviceStatusProvider with ipcClient', () => {
      const mockIpcClient = {};
      const factoryFn = getFactoryFn('deviceStatusProvider');
      const result = factoryFn(mockIpcClient);
      expect(result).toBeDefined();
    });

    it('should create deviceStorageService with dependencies', () => {
      const mockStorageService = {};
      const mockLoggerFactory = { create: vi.fn(() => ({})) };
      const factoryFn = getFactoryFn('deviceStorageService');
      const result = factoryFn(mockStorageService, mockLoggerFactory);
      expect(result).toBeDefined();
    });

    it('should create deviceMediaService with dependencies', () => {
      const mockEventBus = {};
      const mockLoggerFactory = { create: vi.fn(() => ({})) };
      const mockBrowserMediaService = {};
      const mockDeviceStatusProvider = {};
      const mockDeviceStorageService = {};
      const mockDeviceChangeDebounceAdapter = {};
      const factoryFn = getFactoryFn('deviceMediaService');
      const result = factoryFn(
        mockEventBus,
        mockLoggerFactory,
        mockBrowserMediaService,
        mockDeviceStatusProvider,
        mockDeviceStorageService,
        mockDeviceChangeDebounceAdapter
      );
      expect(result).toBeDefined();
    });

    it('should create captureService with dependencies', () => {
      const mockEventBus = {};
      const mockLoggerFactory = { create: vi.fn(() => ({})) };
      const factoryFn = getFactoryFn('captureService');
      const result = factoryFn(mockEventBus, mockLoggerFactory);
      expect(result).toBeDefined();
    });

    it('should create transcodeService with dependencies', () => {
      const mockEventBus = {};
      const mockLoggerFactory = { create: vi.fn(() => ({})) };
      const factoryFn = getFactoryFn('transcodeService');
      const result = factoryFn(mockEventBus, mockLoggerFactory);
      expect(result).toBeDefined();
    });

    it('should create settingsService with dependencies', () => {
      const mockEventBus = {};
      const mockLoggerFactory = { create: vi.fn(() => ({})) };
      const mockStorageService = {};
      const factoryFn = getFactoryFn('settingsService');
      const result = factoryFn(mockEventBus, mockLoggerFactory, mockStorageService);
      expect(result).toBeDefined();
    });

    it('should create notesService with dependencies', () => {
      const mockEventBus = {};
      const mockLoggerFactory = { create: vi.fn(() => ({})) };
      const mockStorageService = {};
      const factoryFn = getFactoryFn('notesService');
      const result = factoryFn(mockEventBus, mockLoggerFactory, mockStorageService);
      expect(result).toBeDefined();
    });

    it('should create updateService with dependencies', () => {
      const mockEventBus = {};
      const mockLoggerFactory = { create: vi.fn(() => ({})) };
      const factoryFn = getFactoryFn('updateService');
      const result = factoryFn(mockEventBus, mockLoggerFactory);
      expect(result).toBeDefined();
    });

    it('should create updateUiBridge with dependencies', () => {
      const mockEventBus = {};
      const mockLoggerFactory = { create: vi.fn(() => ({})) };
      const factoryFn = getFactoryFn('updateUiBridge');
      const result = factoryFn(mockEventBus, mockLoggerFactory);
      expect(result).toBeDefined();
    });

    it('should create fullscreenService with dependencies', () => {
      const mockEventBus = {};
      const mockLoggerFactory = { create: vi.fn(() => ({})) };
      const factoryFn = getFactoryFn('fullscreenService');
      const result = factoryFn(mockEventBus, mockLoggerFactory);
      expect(result).toBeDefined();
    });

    it('should create uiEffects with bodyClassManager', () => {
      const mockBodyClassManager = {};
      const factoryFn = getFactoryFn('uiEffects');
      const result = factoryFn(mockBodyClassManager);
      expect(result).toBeDefined();
    });

    it('should create animationPerformanceService with loggerFactory', () => {
      const mockLoggerFactory = { create: vi.fn(() => ({})) };
      const factoryFn = getFactoryFn('animationPerformanceService');
      const result = factoryFn(mockLoggerFactory);
      expect(result).toBeDefined();
    });
  });
});
