/**
 * Renderer Container Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock all the imported modules before importing the container
vi.mock('@renderer/infrastructure/di/service-container.factory.js', () => {
  return {
    ServiceContainer: class MockServiceContainer {
      constructor() {
        this.registerSingleton = vi.fn();
        this.resolve = vi.fn();
        this.dispose = vi.fn();
      }
    },
    asValue: vi.fn((val) => ({ __asValue: true, value: val }))
  };
});

// Application layer mocks
vi.mock('@renderer/application/app.state.js', () => ({
  AppState: vi.fn()
}));

vi.mock('@renderer/application/app.orchestrator.js', () => ({
  AppOrchestrator: vi.fn()
}));

vi.mock('@renderer/application/performance/performance-animation.orchestrator.js', () => ({
  PerformanceAnimationOrchestrator: vi.fn()
}));

vi.mock('@renderer/application/performance/performance-animation.service.js', () => ({
  PerformanceAnimationService: vi.fn()
}));

vi.mock('@renderer/application/performance/performance-state.orchestrator.js', () => ({
  PerformanceStateOrchestrator: vi.fn()
}));

vi.mock('@renderer/application/performance/performance-state.service.js', () => ({
  PerformanceStateService: vi.fn()
}));

vi.mock('@renderer/application/performance/performance-metrics.orchestrator.js', () => ({
  PerformanceMetricsOrchestrator: vi.fn()
}));

vi.mock('@renderer/application/performance/performance-metrics.service.js', () => ({
  PerformanceMetricsService: vi.fn()
}));

vi.mock('@renderer/application/adapters/metrics.adapter.js', () => ({
  MetricsAdapter: vi.fn()
}));

// UI layer mocks
vi.mock('@renderer/ui/orchestration/ui-setup.orchestrator.js', () => ({
  UISetupOrchestrator: vi.fn()
}));

vi.mock('@renderer/ui/controller/component.registry.js', () => ({
  UIComponentRegistry: vi.fn()
}));

vi.mock('@renderer/ui/effects/ui-effects.class.js', () => ({
  UIEffects: vi.fn()
}));

vi.mock('@renderer/ui/effects/body-class.class.js', () => ({
  BodyClassManager: vi.fn()
}));

vi.mock('@renderer/ui/orchestration/ui-event.bridge.js', () => ({
  UIEventBridge: vi.fn()
}));

vi.mock('@renderer/ui/orchestration/presentation-mode.coordinator.js', () => ({
  PresentationModeCoordinator: vi.fn()
}));

vi.mock('@renderer/ui/orchestration/capture-ui.bridge.js', () => ({
  CaptureUIBridge: vi.fn()
}));

vi.mock('@renderer/ui/orchestration/transcode-ui.bridge.js', () => ({
  TranscodeUIBridge: vi.fn()
}));

// Features: Devices mocks
vi.mock('@renderer/features/devices/services/device.service.js', () => ({
  DeviceService: vi.fn()
}));

vi.mock('@renderer/features/devices/services/device-connection.service.js', () => ({
  DeviceConnectionService: vi.fn()
}));

vi.mock('@renderer/features/devices/services/device-storage.service.js', () => ({
  DeviceStorageService: vi.fn()
}));

vi.mock('@renderer/features/devices/services/device-media.service.js', () => ({
  DeviceMediaService: vi.fn()
}));

vi.mock('@renderer/features/devices/services/device.orchestrator.js', () => ({
  DeviceOrchestrator: vi.fn()
}));

vi.mock('@renderer/features/devices/adapters/device-ipc-status.adapter.js', () => ({
  DeviceIpcStatusAdapter: vi.fn()
}));

vi.mock('@renderer/features/devices/adapters/device-ipc.adapter.js', () => ({
  DeviceIpcAdapter: vi.fn()
}));

vi.mock('@renderer/features/devices/adapters/chromatic/device-chromatic.adapter.js', () => ({
  DeviceChromaticAdapter: vi.fn()
}));

// Features: Streaming mocks
vi.mock('@renderer/features/streaming/services/streaming.service.js', () => ({
  StreamingService: vi.fn()
}));

vi.mock('@renderer/features/streaming/services/streaming.orchestrator.js', () => ({
  StreamingOrchestrator: vi.fn()
}));

vi.mock('@renderer/features/streaming/factories/streaming-adapter.factory.js', () => ({
  StreamingAdapterFactory: vi.fn()
}));

vi.mock('@renderer/features/streaming/rendering/streaming-canvas-renderer.class.js', () => ({
  StreamingCanvasRenderer: vi.fn()
}));

vi.mock('@renderer/features/streaming/rendering/streaming-render-pipeline.service.js', () => ({
  StreamingRenderPipelineService: vi.fn()
}));

vi.mock('@renderer/features/streaming/rendering/streaming-canvas-lifecycle.service.js', () => ({
  StreamingCanvasLifecycleService: vi.fn()
}));

vi.mock('@renderer/features/streaming/rendering/streaming-gpu-render-loop.service.js', () => ({
  StreamingGpuRenderLoopService: vi.fn()
}));

vi.mock('@renderer/features/streaming/rendering/streaming-viewport.service.js', () => ({
  StreamingViewportService: vi.fn()
}));

vi.mock('@renderer/features/streaming/rendering/streaming-health.service.js', () => ({
  StreamingHealthService: vi.fn()
}));

vi.mock('@renderer/features/streaming/rendering/gpu/streaming-gpu-renderer.service.js', () => ({
  StreamingGpuRendererService: vi.fn()
}));

vi.mock('@renderer/features/streaming/services/streaming-view.service.js', () => ({
  StreamingViewService: vi.fn()
}));

vi.mock('@renderer/features/streaming/audio/streaming-audio-warmup.service.js', () => ({
  StreamingAudioWarmupService: vi.fn()
}));

vi.mock('@renderer/ui/features/streaming/streaming-controls.component.js', () => ({
  StreamingControlsComponent: vi.fn()
}));

vi.mock('@renderer/ui/features/toolbar/components/shader-selector.component.js', () => ({
  ShaderSelectorComponent: vi.fn()
}));

vi.mock('@renderer/ui/shared/status-notification.component.js', () => ({
  StatusNotificationComponent: vi.fn()
}));

vi.mock('@renderer/ui/shared/device-status.component.js', () => ({
  DeviceStatusComponent: vi.fn()
}));

vi.mock('@renderer/ui/features/transcode/transcode-toast.component.js', () => ({
  TranscodeToastComponent: vi.fn()
}));

// Features: Capture mocks
vi.mock('@renderer/features/capture/services/capture.service.js', () => ({
  CaptureService: vi.fn()
}));

vi.mock('@renderer/features/capture/services/capture.orchestrator.js', () => ({
  CaptureOrchestrator: vi.fn()
}));

vi.mock('@renderer/features/capture/services/capture-gpu-recording.service.js', () => ({
  CaptureGpuRecordingService: vi.fn()
}));

vi.mock('@renderer/features/capture/services/capture-save.service.js', () => ({
  CaptureSaveService: vi.fn()
}));

// Features: Transcode mocks
vi.mock('@renderer/features/transcode/services/transcode.service.js', () => ({
  TranscodeService: vi.fn()
}));

// Features: Settings mocks
vi.mock('@renderer/features/settings/services/settings.service.js', () => ({
  SettingsService: vi.fn()
}));

vi.mock('@renderer/features/settings/services/settings-preferences.orchestrator.js', () => ({
  SettingsPreferencesOrchestrator: vi.fn()
}));

vi.mock('@renderer/features/settings/services/settings-display-mode.orchestrator.js', () => ({
  SettingsDisplayModeOrchestrator: vi.fn()
}));

vi.mock('@renderer/features/settings/services/settings-fullscreen.service.js', () => ({
  SettingsFullscreenService: vi.fn()
}));

vi.mock('@renderer/features/settings/services/settings-cinematic-mode.service.js', () => ({
  SettingsCinematicModeService: vi.fn()
}));

vi.mock('@renderer/ui/features/settings/settings-menu.component.js', () => ({
  SettingsMenuComponent: vi.fn()
}));

vi.mock('@renderer/ui/features/notes/notes-panel.component.js', () => ({
  NotesPanelComponent: vi.fn()
}));

// Features: Updates mocks
vi.mock('@renderer/features/updates/services/update.service.js', () => ({
  UpdateService: vi.fn()
}));

vi.mock('@renderer/features/updates/services/update.orchestrator.js', () => ({
  UpdateOrchestrator: vi.fn()
}));

vi.mock('@renderer/features/updates/ui/update-ui.service.js', () => ({
  UpdateUiService: vi.fn()
}));

vi.mock('@renderer/ui/features/updates/update-section.component.js', () => ({
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

// Import the container module
import * as containerModuleImport from '@renderer/container.js';

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
        ['streamingService', 'deviceService', 'eventBus']
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

    it('should register presentationModeCoordinator singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'presentationModeCoordinator',
        expect.any(Function),
        ['uiController', 'appState', 'loggerFactory']
      );
    });

    it('should register deviceService singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'deviceService',
        expect.any(Function),
        ['eventBus', 'loggerFactory', 'deviceStatusProvider', 'deviceConnectionService', 'deviceStorageService', 'deviceMediaService']
      );
    });

    it('should register streamingService singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'streamingService',
        expect.any(Function),
        ['deviceService', 'eventBus', 'loggerFactory', 'adapterFactory', 'ipcClient']
      );
    });

    it('should register renderPipelineService singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'renderPipelineService',
        expect.any(Function),
        ['appState', 'streamViewService', 'canvasRenderer', 'canvasLifecycleService', 'streamHealthService', 'gpuRendererService', 'gpuRenderLoopService', 'eventBus', 'loggerFactory']
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
        ['deviceService', 'deviceIpcAdapter', 'eventBus', 'loggerFactory']
      );
    });

    it('should register streamingOrchestrator singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'streamingOrchestrator',
        expect.any(Function),
        ['streamingService', 'appState', 'streamViewService', 'audioWarmupService', 'renderPipelineService', 'gpuRecordingService', 'settingsService', 'eventBus', 'loggerFactory']
      );
    });

    it('should register captureOrchestrator singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'captureOrchestrator',
        expect.any(Function),
        ['captureService', 'appState', 'streamViewService', 'gpuRendererService', 'gpuRecordingService', 'canvasRenderer', 'transcodeService', 'eventBus', 'loggerFactory']
      );
    });

    it('should register appOrchestrator singleton', () => {
      const container = containerModule.createRendererContainer();

      expect(container.registerSingleton).toHaveBeenCalledWith(
        'appOrchestrator',
        expect.any(Function),
        expect.arrayContaining(['deviceOrchestrator', 'streamingOrchestrator', 'captureOrchestrator'])
      );
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
});
