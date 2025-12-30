/**
 * Renderer DI Container (Updated Architecture)
 *
 * Browser-compatible dependency injection container for renderer process
 * Wires domain services and orchestrators with proper dependency injection
 */

import { ServiceContainer, asValue } from '@renderer/infrastructure/di/service-container.js';

// Application layer
import { AppState } from '@renderer/application/app.state.js';
import { AppOrchestrator } from '@renderer/application/app.orchestrator.js';
import { AnimationPerformanceOrchestrator } from '@renderer/application/performance/animation-performance.orchestrator.js';
import { AnimationPerformanceService } from '@renderer/application/performance/animation-performance.service.js';
import { PerformanceMetricsOrchestrator } from '@renderer/application/performance/performance-metrics.orchestrator.js';
import { PerformanceMetricsService } from '@renderer/application/performance/performance-metrics.service.js';
import { PerformanceStateOrchestrator } from '@renderer/application/performance/performance-state.orchestrator.js';
import { PerformanceStateService } from '@renderer/application/performance/performance-state.service.js';

// UI layer
import { UISetupOrchestrator } from '@renderer/ui/orchestration/ui-setup.orchestrator.js';
import { UIComponentFactory } from '@renderer/ui/controller/component.factory.js';
import { UIComponentRegistry } from '@renderer/ui/controller/component.registry.js';
import { UIEffects } from '@renderer/ui/effects/ui-effects.manager.js';
import { BodyClassManager } from '@renderer/ui/effects/body-class.manager.js';
import { UIEventBridge } from '@renderer/ui/orchestration/ui-event.bridge.js';
import { CaptureUiBridge } from '@renderer/ui/orchestration/capture-ui.bridge.js';

// Features: Devices
import { DeviceService } from '@renderer/features/devices/services/device.service.js';
import { DeviceConnectionService } from '@renderer/features/devices/services/device-connection.service.js';
import { DeviceStorageService } from '@renderer/features/devices/services/device-storage.service.js';
import { DeviceMediaService } from '@renderer/features/devices/services/device-media.service.js';
import { DeviceOrchestrator } from '@renderer/features/devices/services/device.orchestrator.js';
import { IpcDeviceStatusAdapter } from '@renderer/features/devices/adapters/ipc-device-status.adapter.js';
import { DeviceIPCAdapter } from '@renderer/features/devices/adapters/device-ipc.adapter.js';

// Features: Streaming
import { StreamingService } from '@renderer/features/streaming/services/streaming.service.js';
import { StreamingOrchestrator } from '@renderer/features/streaming/services/streaming.orchestrator.js';
import { AdapterFactory } from '@renderer/features/streaming/factories/adapter.factory.js';
import { CanvasRenderer } from '@renderer/features/streaming/rendering/canvas.renderer.js';
import { RenderPipelineService } from '@renderer/features/streaming/rendering/render-pipeline.service.js';
import { CanvasLifecycleService } from '@renderer/features/streaming/rendering/canvas-lifecycle.service.js';
import { GpuRenderLoopService } from '@renderer/features/streaming/rendering/gpu-render-loop.service.js';
import { ViewportService } from '@renderer/features/streaming/rendering/viewport.service.js';
import { StreamHealthService } from '@renderer/features/streaming/rendering/stream-health.service.js';
import { GPURendererService } from '@renderer/features/streaming/rendering/gpu/gpu.renderer.service.js';
import { StreamViewService } from '@renderer/features/streaming/services/stream-view.service.js';
import { AudioWarmupService } from '@renderer/features/streaming/audio/audio-warmup.service.js';

// Features: Capture
import { CaptureService } from '@renderer/features/capture/services/capture.service.js';
import { CaptureOrchestrator } from '@renderer/features/capture/services/capture.orchestrator.js';
import { GpuRecordingService } from '@renderer/features/capture/services/gpu-recording.service.js';

// Features: Settings
import { SettingsService, PROTECTED_STORAGE_KEYS } from '@renderer/features/settings/services/settings.service.js';
import { PreferencesOrchestrator } from '@renderer/features/settings/services/preferences.orchestrator.js';
import { DisplayModeOrchestrator } from '@renderer/features/settings/services/display-mode.orchestrator.js';
import { FullscreenService } from '@renderer/features/settings/services/fullscreen.service.js';
import { CinematicModeService } from '@renderer/features/settings/services/cinematic-mode.service.js';

// Features: Updates
import { UpdateService } from '@renderer/features/updates/services/update.service.js';
import { UpdateOrchestrator } from '@renderer/features/updates/services/update.orchestrator.js';
import { UpdateUiService } from '@renderer/features/updates/services/update-ui.service.js';

// Infrastructure
import { EventBus } from '@renderer/infrastructure/events/event-bus.js';
import { RendererLogger } from '@renderer/infrastructure/logging/logger.js';
import { StorageService } from '@renderer/infrastructure/browser/browser-storage.adapter.js';
import { BrowserMediaService } from '@renderer/infrastructure/browser/browser-media.adapter.js';
import { VisibilityAdapter } from '@renderer/infrastructure/adapters/visibility.adapter.js';
import { UserActivityAdapter } from '@renderer/infrastructure/adapters/user-activity.adapter.js';
import { ReducedMotionAdapter } from '@renderer/infrastructure/adapters/reduced-motion.adapter.js';
import { MetricsAdapter } from '@renderer/application/adapters/metrics.adapter.js';
// Shared
import { AnimationCache } from '@shared/utils/performance-cache.js';

/**
 * Create and configure the renderer DI container
 * @returns {ServiceContainer} Configured container
 */
function createRendererContainer() {
  const container = new ServiceContainer();

  // ============================================
  // Infrastructure / Singletons
  // ============================================

  // Event bus for cross-service communication
  container.registerSingleton(
    'eventBus',
    function (loggerFactory) {
      return new EventBus({ loggerFactory });
    },
    ['loggerFactory']
  );

  // Logger factory
  container.registerSingleton('loggerFactory', function() {
    return new RendererLogger();
  }, []);

  // Browser abstraction services
  container.registerSingleton('storageService', function() {
    return new StorageService({
      protectedKeys: PROTECTED_STORAGE_KEYS
    });
  }, []);

  container.registerSingleton('browserMediaService', function() {
    return new BrowserMediaService();
  }, []);

  // DOM Adapters - wrap browser APIs for testability
  container.registerSingleton('visibilityAdapter', function() {
    return new VisibilityAdapter();
  }, []);

  container.registerSingleton('userActivityAdapter', function() {
    return new UserActivityAdapter();
  }, []);

  container.registerSingleton('reducedMotionAdapter', function() {
    return new ReducedMotionAdapter();
  }, []);

  container.registerSingleton('metricsAdapter', function() {
    return new MetricsAdapter();
  }, []);

  // Device IPC Adapter - wraps window.deviceAPI for testability
  container.registerSingleton('deviceIPCAdapter', function() {
    return new DeviceIPCAdapter();
  }, []);

  // Streaming infrastructure
  container.registerSingleton('animationCache', function() {
    return new AnimationCache();
  }, []);

  container.registerSingleton(
    'canvasRenderer',
    function(loggerFactory, animationCache) {
      return new CanvasRenderer(
        loggerFactory.create('CanvasRenderer'),
        animationCache
      );
    },
    ['loggerFactory', 'animationCache']
  );

  container.registerSingleton(
    'viewportService',
    function(loggerFactory) {
      return new ViewportService(loggerFactory.create('ViewportService'));
    },
    ['loggerFactory']
  );

  container.registerSingleton(
    'canvasLifecycleService',
    function(streamViewService, canvasRenderer, viewportService, gpuRendererService, eventBus, loggerFactory) {
      return new CanvasLifecycleService({
        streamViewService,
        canvasRenderer,
        viewportService,
        gpuRendererService,
        eventBus,
        loggerFactory
      });
    },
    ['streamViewService', 'canvasRenderer', 'viewportService', 'gpuRendererService', 'eventBus', 'loggerFactory']
  );

  container.registerSingleton(
    'gpuRenderLoopService',
    function(loggerFactory) {
      return new GpuRenderLoopService({ loggerFactory });
    },
    ['loggerFactory']
  );

  container.registerSingleton(
    'streamHealthService',
    function(loggerFactory) {
      return new StreamHealthService(loggerFactory.create('StreamHealthService'));
    },
    ['loggerFactory']
  );

  // GPU Renderer Service - HD rendering pipeline
  container.registerSingleton(
    'gpuRendererService',
    function(eventBus, loggerFactory, settingsService) {
      return new GPURendererService({ eventBus, loggerFactory, settingsService });
    },
    ['eventBus', 'loggerFactory', 'settingsService']
  );

  // Render Pipeline Service - GPU/Canvas2D switching and health checks
  container.registerSingleton(
    'renderPipelineService',
    function(appState, streamViewService, canvasRenderer, canvasLifecycleService, streamHealthService, gpuRendererService, gpuRenderLoopService, eventBus, loggerFactory) {
      return new RenderPipelineService({
        appState,
        streamViewService,
        canvasRenderer,
        canvasLifecycleService,
        streamHealthService,
        gpuRendererService,
        gpuRenderLoopService,
        eventBus,
        loggerFactory
      });
    },
    ['appState', 'streamViewService', 'canvasRenderer', 'canvasLifecycleService', 'streamHealthService', 'gpuRendererService', 'gpuRenderLoopService', 'eventBus', 'loggerFactory']
  );

  // IPC client (window.deviceAPI exposed from preload)
  container.registerSingleton('ipcClient', function () {
    if (!window.deviceAPI) {
      throw new Error('deviceAPI is not available in the renderer. The preload script may have failed to load.');
    }
    return window.deviceAPI;
  }, []);

  // Device Status Provider - abstracts IPC communication for testability
  container.registerSingleton(
    'deviceStatusProvider',
    function (ipcClient) {
      return new IpcDeviceStatusAdapter(ipcClient);
    },
    ['ipcClient']
  );

  // ============================================
  // Adapter Factory
  // ============================================

  // Adapter Factory - Creates device adapters based on device type
  // Note: Will be initialized asynchronously in RendererAppOrchestrator
  container.registerSingleton(
    'adapterFactory',
    function (eventBus, loggerFactory, browserMediaService) {
      return new AdapterFactory(eventBus, loggerFactory, browserMediaService);
    },
    ['eventBus', 'loggerFactory', 'browserMediaService']
  );

  // ============================================
  // Application Services (Existing Architecture)
  // ============================================

  // Device Sub-Services (registered for DI, used by DeviceService)
  container.registerSingleton(
    'deviceStorageService',
    function (storageService, loggerFactory) {
      return new DeviceStorageService({ storageService, loggerFactory });
    },
    ['storageService', 'loggerFactory']
  );

  container.registerSingleton(
    'deviceConnectionService',
    function (eventBus, loggerFactory, deviceStatusProvider) {
      return new DeviceConnectionService({ eventBus, loggerFactory, deviceStatusProvider });
    },
    ['eventBus', 'loggerFactory', 'deviceStatusProvider']
  );

  container.registerSingleton(
    'deviceMediaService',
    function (eventBus, loggerFactory, browserMediaService, deviceConnectionService, deviceStorageService) {
      return new DeviceMediaService({ eventBus, loggerFactory, browserMediaService, deviceConnectionService, deviceStorageService });
    },
    ['eventBus', 'loggerFactory', 'browserMediaService', 'deviceConnectionService', 'deviceStorageService']
  );

  // Device Service (facade coordinating device sub-services)
  container.registerSingleton(
    'deviceService',
    function (eventBus, loggerFactory, deviceStatusProvider, deviceConnectionService, deviceStorageService, deviceMediaService) {
      return new DeviceService({ eventBus, loggerFactory, deviceStatusProvider, deviceConnectionService, deviceStorageService, deviceMediaService });
    },
    ['eventBus', 'loggerFactory', 'deviceStatusProvider', 'deviceConnectionService', 'deviceStorageService', 'deviceMediaService']
  );

  // Streaming Service (coordinates stream acquisition)
  container.registerSingleton(
    'streamingService',
    function (deviceService, eventBus, loggerFactory, adapterFactory, ipcClient) {
      return new StreamingService({ deviceService, eventBus, loggerFactory, adapterFactory, ipcClient });
    },
    ['deviceService', 'eventBus', 'loggerFactory', 'adapterFactory', 'ipcClient']
  );

  // Capture Service (screenshots and recording)
  container.registerSingleton(
    'captureService',
    function (eventBus, loggerFactory) {
      return new CaptureService({ eventBus, loggerFactory });
    },
    ['eventBus', 'loggerFactory']
  );

  container.registerSingleton(
    'gpuRecordingService',
    function (gpuRendererService, eventBus, loggerFactory) {
      return new GpuRecordingService({ gpuRendererService, eventBus, loggerFactory });
    },
    ['gpuRendererService', 'eventBus', 'loggerFactory']
  );

  // Settings Service (user preferences)
  container.registerSingleton(
    'settingsService',
    function (eventBus, loggerFactory, storageService) {
      return new SettingsService({ eventBus, loggerFactory, storageService });
    },
    ['eventBus', 'loggerFactory', 'storageService']
  );

  // Update Service (auto-updates)
  container.registerSingleton(
    'updateService',
    function (eventBus, loggerFactory) {
      return new UpdateService({ eventBus, loggerFactory });
    },
    ['eventBus', 'loggerFactory']
  );

  container.registerSingleton(
    'updateUiService',
    function (eventBus, loggerFactory) {
      return new UpdateUiService({ eventBus, loggerFactory });
    },
    ['eventBus', 'loggerFactory']
  );

  container.registerSingleton(
    'streamViewService',
    function (uiController, loggerFactory) {
      return new StreamViewService({ uiController, loggerFactory });
    },
    ['uiController', 'loggerFactory']
  );

  container.registerSingleton(
    'audioWarmupService',
    function (eventBus, loggerFactory, settingsService) {
      return new AudioWarmupService({ eventBus, loggerFactory, settingsService });
    },
    ['eventBus', 'loggerFactory', 'settingsService']
  );

  // State Management - derives state from services (registered after services)
  // EventBus enables state caching via events for decoupled access
  container.registerSingleton('appState', function(streamingService, deviceService, eventBus) {
    return new AppState({ streamingService, deviceService, eventBus });
  }, ['streamingService', 'deviceService', 'eventBus']);

  // ============================================
  // UI Layer (registered by RendererAppOrchestrator after DOM ready)
  // ============================================
  // These will be registered later:
  // - uiController

  // UI Component Factory
  container.registerSingleton(
    'uiComponentFactory',
    function (eventBus) {
      return new UIComponentFactory({ eventBus });
    },
    ['eventBus']
  );

  // UI Component Registry - manages component lifecycle
  container.registerSingleton(
    'uiComponentRegistry',
    function (uiComponentFactory, eventBus, loggerFactory) {
      return new UIComponentRegistry({ uiComponentFactory, eventBus, loggerFactory });
    },
    ['uiComponentFactory', 'eventBus', 'loggerFactory']
  );

  // UI Effects - visual feedback effects
  container.registerSingleton(
    'uiEffects',
    function () {
      // Note: elements are set later when UIController is created
      return new UIEffects({ elements: null });
    },
    []
  );

  // Body Class Manager - manages body CSS classes for app state
  container.registerSingleton(
    'bodyClassManager',
    function () {
      return new BodyClassManager();
    },
    []
  );

  // UI Event Bridge - bridges events to UIController
  // Initialized after uiController is registered
  container.registerSingleton(
    'uiEventBridge',
    function (eventBus, uiController, appState, loggerFactory) {
      return new UIEventBridge({ eventBus, uiController, appState, loggerFactory });
    },
    ['eventBus', 'uiController', 'appState', 'loggerFactory']
  );

  container.registerSingleton(
    'captureUiBridge',
    function (eventBus, uiController, loggerFactory) {
      return new CaptureUiBridge({ eventBus, uiController, loggerFactory });
    },
    ['eventBus', 'uiController', 'loggerFactory']
  );

  // ============================================
  // Orchestrators (NEW ARCHITECTURE)
  // ============================================

  // Device Orchestrator - Coordinates device detection
  container.registerSingleton(
    'deviceOrchestrator',
    function (deviceService, deviceIPCAdapter, eventBus, loggerFactory) {
      return new DeviceOrchestrator({
        deviceService,
        deviceIPCAdapter,
        eventBus,
        loggerFactory
      });
    },
    ['deviceService', 'deviceIPCAdapter', 'eventBus', 'loggerFactory']
  );

  // Streaming Orchestrator - Coordinates stream lifecycle
  // Uses appState instead of deviceOrchestrator for decoupling
  container.registerSingleton(
    'streamingOrchestrator',
    function (streamingService, appState, streamViewService, audioWarmupService, renderPipelineService, eventBus, loggerFactory) {
      return new StreamingOrchestrator({
        streamingService,
        appState,
        streamViewService,
        audioWarmupService,
        renderPipelineService,
        eventBus,
        loggerFactory
      });
    },
    ['streamingService', 'appState', 'streamViewService', 'audioWarmupService', 'renderPipelineService', 'eventBus', 'loggerFactory']
  );

  // Capture Orchestrator - Coordinates screenshot and recording
  // Uses appState instead of streamingOrchestrator for decoupling
  // Requires gpuRendererService and canvasRenderer for screenshot source selection
  container.registerSingleton(
    'captureOrchestrator',
    function (captureService, appState, uiController, gpuRendererService, gpuRecordingService, canvasRenderer, eventBus, loggerFactory) {
      return new CaptureOrchestrator({
        captureService,
        appState,
        uiController,
        gpuRendererService,
        gpuRecordingService,
        canvasRenderer,
        eventBus,
        loggerFactory
      });
    },
    ['captureService', 'appState', 'uiController', 'gpuRendererService', 'gpuRecordingService', 'canvasRenderer', 'eventBus', 'loggerFactory']
  );

  // ============================================
  // Application Orchestrators (Phase 2 - Decomposed)
  // ============================================

  // Preferences Orchestrator - Coordinates preferences loading
  container.registerSingleton(
    'preferencesOrchestrator',
    function (settingsService, appState, eventBus, loggerFactory) {
      return new PreferencesOrchestrator({
        settingsService,
        appState,
        eventBus,
        loggerFactory
      });
    },
    ['settingsService', 'appState', 'eventBus', 'loggerFactory']
  );

  container.registerSingleton(
    'fullscreenService',
    function (uiController, eventBus, loggerFactory) {
      return new FullscreenService({ uiController, eventBus, loggerFactory });
    },
    ['uiController', 'eventBus', 'loggerFactory']
  );

  container.registerSingleton(
    'cinematicModeService',
    function (appState, eventBus, loggerFactory) {
      return new CinematicModeService({ appState, eventBus, loggerFactory });
    },
    ['appState', 'eventBus', 'loggerFactory']
  );

  // Display Mode Orchestrator - Coordinates display modes (fullscreen, volume, cinematic)
  container.registerSingleton(
    'displayModeOrchestrator',
    function (fullscreenService, cinematicModeService, settingsService, eventBus, loggerFactory) {
      return new DisplayModeOrchestrator({
        fullscreenService,
        cinematicModeService,
        settingsService,
        eventBus,
        loggerFactory
      });
    },
    ['fullscreenService', 'cinematicModeService', 'settingsService', 'eventBus', 'loggerFactory']
  );

  // Update Orchestrator - Coordinates auto-updates
  container.registerSingleton(
    'updateOrchestrator',
    function (updateService, updateUiService, loggerFactory) {
      return new UpdateOrchestrator({
        updateService,
        updateUiService,
        loggerFactory
      });
    },
    ['updateService', 'updateUiService', 'loggerFactory']
  );

  // Performance State Orchestrator - fan-out settings/visibility/idle state
  container.registerSingleton(
    'performanceStateOrchestrator',
    function (eventBus, loggerFactory, performanceStateService) {
      return new PerformanceStateOrchestrator({
        eventBus,
        performanceStateService,
        loggerFactory
      });
    },
    ['eventBus', 'loggerFactory', 'performanceStateService']
  );

  // Animation Performance Orchestrator - CSS/idle/visibility controls
  container.registerSingleton(
    'animationPerformanceOrchestrator',
    function (eventBus, loggerFactory, animationPerformanceService, bodyClassManager) {
      return new AnimationPerformanceOrchestrator({
        eventBus,
        animationPerformanceService,
        bodyClassManager,
        loggerFactory
      });
    },
    ['eventBus', 'loggerFactory', 'animationPerformanceService', 'bodyClassManager']
  );

  // Performance Metrics Service - process metrics snapshots
  container.registerSingleton(
    'performanceMetricsService',
    function (loggerFactory, metricsAdapter) {
      return new PerformanceMetricsService({ loggerFactory, metricsAdapter });
    },
    ['loggerFactory', 'metricsAdapter']
  );

  container.registerSingleton(
    'performanceStateService',
    function (loggerFactory, visibilityAdapter, userActivityAdapter, reducedMotionAdapter) {
      return new PerformanceStateService({
        loggerFactory,
        visibilityAdapter,
        userActivityAdapter,
        reducedMotionAdapter
      });
    },
    ['loggerFactory', 'visibilityAdapter', 'userActivityAdapter', 'reducedMotionAdapter']
  );

  container.registerSingleton(
    'animationPerformanceService',
    function (loggerFactory) {
      return new AnimationPerformanceService({ loggerFactory });
    },
    ['loggerFactory']
  );

  // Performance Metrics Orchestrator - process metrics snapshots
  container.registerSingleton(
    'performanceMetricsOrchestrator',
    function (eventBus, loggerFactory, performanceMetricsService) {
      return new PerformanceMetricsOrchestrator({
        eventBus,
        loggerFactory,
        performanceMetricsService
      });
    },
    ['eventBus', 'loggerFactory', 'performanceMetricsService']
  );

  // UI Setup Orchestrator - Coordinates UI initialization and event listeners
  // Uses event-based communication for button handlers instead of direct orchestrator calls
  // displayModeOrchestrator is still passed to shader selector for cinematic mode
  container.registerSingleton(
    'uiSetupOrchestrator',
    function (
      appState,
      displayModeOrchestrator,
      updateOrchestrator,
      settingsService,
      uiController,
      eventBus,
      loggerFactory
    ) {
      return new UISetupOrchestrator({
        appState,
        displayModeOrchestrator,
        updateOrchestrator,
        settingsService,
        uiController,
        eventBus,
        loggerFactory
      });
    },
    [
      'appState',
      'displayModeOrchestrator',
      'updateOrchestrator',
      'settingsService',
      'uiController',
      'eventBus',
      'loggerFactory'
    ]
  );

  // App Orchestrator - Main coordinator
  container.registerSingleton(
    'appOrchestrator',
    function (
      deviceOrchestrator,
      streamingOrchestrator,
      captureOrchestrator,
      preferencesOrchestrator,
      displayModeOrchestrator,
      updateOrchestrator,
      uiSetupOrchestrator,
      animationPerformanceOrchestrator,
      performanceMetricsOrchestrator,
      performanceStateOrchestrator,
      eventBus,
      loggerFactory
    ) {
      return new AppOrchestrator({
        deviceOrchestrator,
        streamingOrchestrator,
        captureOrchestrator,
        preferencesOrchestrator,
        displayModeOrchestrator,
        updateOrchestrator,
        uiSetupOrchestrator,
        animationPerformanceOrchestrator,
        performanceMetricsOrchestrator,
        performanceStateOrchestrator,
        eventBus,
        loggerFactory
      });
    },
    [
      'deviceOrchestrator',
      'streamingOrchestrator',
      'captureOrchestrator',
      'preferencesOrchestrator',
      'displayModeOrchestrator',
      'updateOrchestrator',
      'uiSetupOrchestrator',
      'animationPerformanceOrchestrator',
      'performanceMetricsOrchestrator',
      'performanceStateOrchestrator',
      'eventBus',
      'loggerFactory'
    ]
  );

  return container;
}

/**
 * Global container instance (created by RendererAppOrchestrator)
 */
let container = null;

/**
 * Initialize global container
 * @returns {ServiceContainer} Initialized container
 */
function initializeContainer() {
  if (container) {
    // Use console.warn since logger is not available during container initialization
    console.warn('Container already initialized');
    return container;
  }

  container = createRendererContainer();
  // Use console.log since logger is not available during container initialization
  console.log('DI Container initialized with domain services');
  return container;
}

/**
 * Get global container instance
 * @returns {ServiceContainer} Container instance
 */
function getContainer() {
  if (!container) {
    throw new Error('Container not initialized. Call initializeContainer() first.');
  }
  return container;
}

/**
 * Reset container (for testing)
 */
function resetContainer() {
  if (container) {
    container.dispose();
    container = null;
  }
}

export {
  createRendererContainer,
  initializeContainer,
  getContainer,
  resetContainer,
  asValue
};
