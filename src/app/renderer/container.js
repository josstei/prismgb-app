/**
 * Renderer DI Container (Updated Architecture)
 *
 * Browser-compatible dependency injection container for renderer process
 * Wires domain services and orchestrators with proper dependency injection
 */

import { ServiceContainer, asValue } from '@infrastructure/di/service-container.js';

// Application layer
import { AppState } from '@app/renderer/application/app.state.js';
import { AppOrchestrator } from '@app/renderer/application/app.orchestrator.js';
import { AnimationPerformanceOrchestrator } from '@app/renderer/application/performance/animation-performance.orchestrator.js';
import { AnimationPerformanceService } from '@app/renderer/application/performance/animation-performance.service.js';
import { PerformanceMetricsOrchestrator } from '@app/renderer/application/performance/performance-metrics.orchestrator.js';
import { PerformanceMetricsService } from '@app/renderer/application/performance/performance-metrics.service.js';
import { PerformanceStateOrchestrator } from '@app/renderer/application/performance/performance-state.orchestrator.js';
import { PerformanceStateService } from '@app/renderer/application/performance/performance-state.service.js';

// UI layer
import { UISetupOrchestrator } from '@ui/orchestration/ui-setup.orchestrator.js';
import { UIComponentFactory } from '@ui/controller/component.factory.js';
import { UIComponentRegistry } from '@ui/controller/component.registry.js';
import { UIEffects } from '@ui/effects/ui-effects.js';
import { UIEventBridge } from '@ui/orchestration/ui-event-bridge.js';
import { CaptureUiBridge } from '@ui/orchestration/capture-ui.bridge.js';

// Features: Devices
import { DeviceService } from '@features/devices/services/device.service.js';
import { DeviceOrchestrator } from '@features/devices/services/device.orchestrator.js';
import { IpcDeviceStatusAdapter } from '@features/devices/services/device-status.adapter.js';

// Features: Streaming
import { StreamingService } from '@features/streaming/services/streaming.service.js';
import { StreamingOrchestrator } from '@features/streaming/services/streaming.orchestrator.js';
import { AdapterFactory } from '@features/streaming/factories/adapter.factory.js';
import { CanvasRenderer } from '@features/streaming/rendering/canvas.renderer.js';
import { RenderPipelineService } from '@features/streaming/rendering/render-pipeline.service.js';
import { CanvasLifecycleService } from '@features/streaming/rendering/canvas-lifecycle.service.js';
import { GpuRenderLoopService } from '@features/streaming/rendering/gpu-render-loop.service.js';
import { ViewportManager } from '@features/streaming/rendering/viewport.manager.js';
import { StreamHealthMonitor } from '@features/streaming/rendering/stream-health.monitor.js';
import { GPURendererService } from '@features/streaming/rendering/gpu/gpu.renderer.service.js';
import { StreamViewService } from '@features/streaming/ui/stream-view.service.js';

// Features: Capture
import { CaptureService } from '@features/capture/services/capture.service.js';
import { CaptureOrchestrator } from '@features/capture/services/capture.orchestrator.js';
import { GpuRecordingService } from '@features/capture/services/gpu-recording.service.js';

// Features: Settings
import { SettingsService } from '@features/settings/services/settings.service.js';
import { PreferencesOrchestrator } from '@features/settings/services/preferences.orchestrator.js';
import { DisplayModeOrchestrator } from '@features/settings/services/display-mode.orchestrator.js';
import { FullscreenService } from '@features/settings/services/fullscreen.service.js';
import { CinematicModeService } from '@features/settings/services/cinematic-mode.service.js';

// Features: Updates
import { UpdateService } from '@features/updates/services/update.service.js';
import { UpdateOrchestrator } from '@features/updates/services/update.orchestrator.js';
import { UpdateUiService } from '@features/updates/ui/update-ui.service.js';

// Infrastructure
import EventBus from '@infrastructure/events/event-bus.js';
import { BrowserLogger } from '@infrastructure/logging/logger.js';
import { StorageService } from '@infrastructure/browser/storage.service.js';
import { MediaDevicesService } from '@infrastructure/browser/media-devices.service.js';
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
    return new BrowserLogger();
  }, []);

  // Browser abstraction services
  container.registerSingleton('storageService', function() {
    return new StorageService();
  }, []);

  container.registerSingleton('mediaDevicesService', function() {
    return new MediaDevicesService();
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
    'viewportManager',
    function(loggerFactory) {
      return new ViewportManager(loggerFactory.create('ViewportManager'));
    },
    ['loggerFactory']
  );

  container.registerSingleton(
    'canvasLifecycleService',
    function(uiController, canvasRenderer, viewportManager, gpuRendererService, eventBus, loggerFactory) {
      return new CanvasLifecycleService({
        uiController,
        canvasRenderer,
        viewportManager,
        gpuRendererService,
        eventBus,
        loggerFactory
      });
    },
    ['uiController', 'canvasRenderer', 'viewportManager', 'gpuRendererService', 'eventBus', 'loggerFactory']
  );

  container.registerSingleton(
    'gpuRenderLoopService',
    function(loggerFactory) {
      return new GpuRenderLoopService({ loggerFactory });
    },
    ['loggerFactory']
  );

  container.registerSingleton(
    'streamHealthMonitor',
    function(loggerFactory) {
      return new StreamHealthMonitor(loggerFactory.create('StreamHealthMonitor'));
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
    function(appState, uiController, canvasRenderer, canvasLifecycleService, streamHealthMonitor, gpuRendererService, gpuRenderLoopService, eventBus, loggerFactory) {
      return new RenderPipelineService({
        appState,
        uiController,
        canvasRenderer,
        canvasLifecycleService,
        streamHealthMonitor,
        gpuRendererService,
        gpuRenderLoopService,
        eventBus,
        loggerFactory
      });
    },
    ['appState', 'uiController', 'canvasRenderer', 'canvasLifecycleService', 'streamHealthMonitor', 'gpuRendererService', 'gpuRenderLoopService', 'eventBus', 'loggerFactory']
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
    function (eventBus, loggerFactory) {
      return new AdapterFactory(eventBus, loggerFactory);
    },
    ['eventBus', 'loggerFactory']
  );

  // ============================================
  // Application Services (Existing Architecture)
  // ============================================

  // Device Service (coordinates device detection)
  container.registerSingleton(
    'deviceService',
    function (eventBus, loggerFactory, deviceStatusProvider, storageService, mediaDevicesService) {
      return new DeviceService({ eventBus, loggerFactory, deviceStatusProvider, storageService, mediaDevicesService });
    },
    ['eventBus', 'loggerFactory', 'deviceStatusProvider', 'storageService', 'mediaDevicesService']
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
    function (eventBus, loggerFactory) {
      return new CaptureUiBridge({ eventBus, loggerFactory });
    },
    ['eventBus', 'loggerFactory']
  );

  // ============================================
  // Orchestrators (NEW ARCHITECTURE)
  // ============================================

  // Device Orchestrator - Coordinates device detection
  container.registerSingleton(
    'deviceOrchestrator',
    function (deviceService, eventBus, loggerFactory) {
      return new DeviceOrchestrator({
        deviceService,
        eventBus,
        loggerFactory
      });
    },
    ['deviceService', 'eventBus', 'loggerFactory']
  );

  // Streaming Orchestrator - Coordinates stream lifecycle
  // Uses appState instead of deviceOrchestrator for decoupling
  container.registerSingleton(
    'streamingOrchestrator',
    function (streamingService, appState, streamViewService, renderPipelineService, eventBus, loggerFactory) {
      return new StreamingOrchestrator({
        streamingService,
        appState,
        streamViewService,
        renderPipelineService,
        eventBus,
        loggerFactory
      });
    },
    ['streamingService', 'appState', 'streamViewService', 'renderPipelineService', 'eventBus', 'loggerFactory']
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
    function (fullscreenService, cinematicModeService, loggerFactory) {
      return new DisplayModeOrchestrator({
        fullscreenService,
        cinematicModeService,
        loggerFactory
      });
    },
    ['fullscreenService', 'cinematicModeService', 'loggerFactory']
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
    function (eventBus, loggerFactory, animationPerformanceService) {
      return new AnimationPerformanceOrchestrator({
        eventBus,
        animationPerformanceService,
        loggerFactory
      });
    },
    ['eventBus', 'loggerFactory', 'animationPerformanceService']
  );

  // Performance Metrics Service - process metrics snapshots
  container.registerSingleton(
    'performanceMetricsService',
    function (loggerFactory) {
      return new PerformanceMetricsService({ loggerFactory });
    },
    ['loggerFactory']
  );

  container.registerSingleton(
    'performanceStateService',
    function (loggerFactory) {
      return new PerformanceStateService({ loggerFactory });
    },
    ['loggerFactory']
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
  container.registerSingleton(
    'uiSetupOrchestrator',
    function (
      appState,
      streamingOrchestrator,
      captureOrchestrator,
      displayModeOrchestrator,
      updateOrchestrator,
      settingsService,
      uiController,
      eventBus,
      loggerFactory
    ) {
      return new UISetupOrchestrator({
        appState,
        streamingOrchestrator,
        captureOrchestrator,
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
      'streamingOrchestrator',
      'captureOrchestrator',
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
  EventBus,
  BrowserLogger,
  asValue
};
