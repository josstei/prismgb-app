/**
 * Renderer DI Container (Updated Architecture)
 *
 * Browser-compatible dependency injection container for renderer process
 * Wires domain services and orchestrators with proper dependency injection
 *
 * Naming Convention:
 * - Registration names use camelCase matching the class name
 *   e.g., SettingsMenuComponent → 'settingsMenuComponent'
 *        StreamingService → 'streamingService'
 * - This convention enables consistent dependency injection and IDE autocomplete
 */

import { ServiceContainer, asValue } from '@renderer/infrastructure/di/service-container.factory.js';

// Application layer
import { AppState } from '@renderer/application/app-state.class.js';
import { AppOrchestrator } from '@renderer/application/app.orchestrator.js';
import { PerformanceAnimationOrchestrator } from '@renderer/application/performance/performance-animation.orchestrator.js';
import { PerformanceAnimationService } from '@renderer/application/performance/performance-animation.service.js';
import { PerformanceMetricsOrchestrator } from '@renderer/application/performance/performance-metrics.orchestrator.js';
import { PerformanceMetricsService } from '@renderer/application/performance/performance-metrics.service.js';
import { PerformanceStateOrchestrator } from '@renderer/application/performance/performance-state.orchestrator.js';
import { PerformanceStateService } from '@renderer/application/performance/performance-state.service.js';

// UI layer
import { UISetupOrchestrator } from '@renderer/ui/orchestration/ui-setup.orchestrator.js';
import { UIComponentRegistry } from '@renderer/ui/controller/component.registry.js';
import { UIEffects } from '@renderer/ui/effects/ui-effects.class.js';
import { BodyClassManager } from '@renderer/ui/effects/body-class.class.js';
import { UIEventBridge } from '@renderer/ui/orchestration/ui-event.bridge.js';
import { PresentationModeService } from '@renderer/infrastructure/services/settings/presentation-mode.service.ts';
import { CaptureUIBridge } from '@renderer/ui/orchestration/capture-ui.bridge.js';
import { TranscodeUIBridge } from '@renderer/ui/orchestration/transcode-ui.bridge.js';

// Features: Devices
import { DeviceService } from '@renderer/infrastructure/services/devices/device.service.ts';
import { DeviceConnectionService } from '@renderer/infrastructure/services/devices/device-connection.service.ts';
import { DeviceStorageService } from '@renderer/infrastructure/services/devices/device-storage.service.ts';
import { DeviceMediaService } from '@renderer/infrastructure/services/devices/device-media.service.ts';
import { DeviceOrchestrator } from '@renderer/features/devices/services/device.orchestrator.js';
import { DeviceOperationSequencerService } from '@renderer/infrastructure/services/devices/device-operation-sequencer.service.ts';
import { DeviceIpcStatusAdapter } from '@renderer/features/devices/adapters/device-ipc-status.adapter.js';
import { DeviceIpcAdapter } from '@renderer/features/devices/adapters/device-ipc.adapter.js';
import { DeviceChangeDebounceAdapter } from '@renderer/features/devices/adapters/device-change-debounce.adapter.js';
import { DeviceChromaticAdapter } from '@renderer/features/devices/adapters/chromatic/device-chromatic.adapter.js';

// Features: Streaming
import { StreamingService } from '@renderer/features/streaming/services/streaming.service.js';
import { StreamingOrchestrator } from '@renderer/features/streaming/services/streaming.orchestrator.js';
import { StreamingAudioOrchestrator } from '@renderer/features/streaming/services/streaming-audio.orchestrator.js';
import { StreamingAdapterFactory } from '@renderer/features/streaming/factories/streaming-adapter.factory.js';
import { StreamingRendererFactory } from '@renderer/features/streaming/factories/streaming-renderer.factory.js';
import { StreamingCanvasRenderer } from '@renderer/features/streaming/rendering/streaming-canvas-renderer.class.js';
import { StreamingRenderPipelineService } from '@renderer/features/streaming/rendering/streaming-render-pipeline.service.js';
import { StreamingCanvasLifecycleService } from '@renderer/features/streaming/rendering/streaming-canvas-lifecycle.service.js';
import { StreamingGpuRenderLoopService } from '@renderer/features/streaming/rendering/streaming-gpu-render-loop.service.js';
import { StreamingViewportService } from '@renderer/features/streaming/rendering/streaming-viewport.service.js';
import { StreamingHealthService } from '@renderer/features/streaming/rendering/streaming-health.service.js';
import { StreamingGpuRendererService } from '@renderer/features/streaming/rendering/gpu/streaming-gpu-renderer.service.js';
import { StreamingGpuRendererAdapter } from '@renderer/features/streaming/rendering/adapters/streaming-gpu-renderer.adapter.js';
import { StreamingCanvas2DRendererAdapter } from '@renderer/features/streaming/rendering/adapters/streaming-canvas2d-renderer.adapter.js';

// GPU Managers
import { GpuFrameBuffer } from '@renderer/features/streaming/rendering/gpu/managers/gpu-frame-buffer.class.js';
import { GpuWorkerManager } from '@renderer/features/streaming/rendering/gpu/managers/gpu-worker-manager.class.js';
import { StreamingViewService } from '@renderer/features/streaming/services/streaming-view.service.js';
import { StreamingAudioPipelineService } from '@renderer/features/streaming/audio/streaming-audio-pipeline.service.js';
import { StreamingControlsComponent } from '@renderer/ui/features/streaming/streaming-controls.component.js';
import { ShaderSelectorComponent } from '@renderer/ui/features/toolbar/components/shader-selector.component.js';
import { StatusNotificationComponent } from '@renderer/ui/shared/status-notification.component.js';
import { DeviceStatusComponent } from '@renderer/ui/shared/device-status.component.js';
import { TranscodeToastComponent } from '@renderer/ui/features/transcode/transcode-toast.component.js';

// Features: Capture
import { CaptureService } from '@renderer/infrastructure/services/capture/capture.service.ts';
import { CaptureOrchestrator } from '@renderer/features/capture/services/capture.orchestrator.js';
import { CaptureGpuRecordingService } from '@renderer/infrastructure/services/capture/gpu-recording.service.ts';
import { CaptureSaveService } from '@renderer/infrastructure/services/capture/capture-save.service.ts';

// Features: Transcode
import { TranscodeService } from '@renderer/infrastructure/services/transcode/transcode.service.ts';

// Features: Settings
import { SettingsService } from '@renderer/infrastructure/services/settings/settings.service.ts';
import { PROTECTED_STORAGE_KEYS } from '@shared/config/storage-keys.config.js';
import { SettingsPreferencesOrchestrator } from '@renderer/features/settings/services/settings-preferences.orchestrator.js';
import { SettingsDisplayModeOrchestrator } from '@renderer/features/settings/services/settings-display-mode.orchestrator.js';
import { SettingsFullscreenService } from '@renderer/infrastructure/services/settings/fullscreen.service.ts';
import { SettingsCinematicModeService } from '@renderer/infrastructure/services/settings/cinematic-mode.service.ts';
import { SettingsMenuComponent } from '@renderer/ui/features/settings/settings-menu.component.js';

// Features: Notes
import { NotesService } from '@renderer/infrastructure/services/notes/notes.service.ts';
import { NotesPanelComponent } from '@renderer/ui/features/notes/notes-panel.component.js';

// Features: Updates
import { UpdateService } from '@renderer/infrastructure/services/updates/update.service.ts';
import { UpdateOrchestrator } from '@renderer/features/updates/services/update.orchestrator.js';
import { UpdateUiService } from '@renderer/infrastructure/services/updates/update-ui.service.ts';
import { UpdateSectionComponent } from '@renderer/ui/features/updates/update-section.component.js';

// Infrastructure
import { EventBus } from '@renderer/infrastructure/events/event-bus.class.js';
import { RendererLogger } from '@renderer/infrastructure/logging/logger.factory.js';
import { BrowserStorageAdapter } from '@renderer/infrastructure/browser/browser-storage.adapter.js';
import { BrowserMediaAdapter } from '@renderer/infrastructure/browser/browser-media.adapter.js';
import { VisibilityAdapter } from '@renderer/infrastructure/adapters/visibility.adapter.js';
import { UserActivityAdapter } from '@renderer/infrastructure/adapters/user-activity.adapter.js';
import { ReducedMotionAdapter } from '@renderer/infrastructure/adapters/reduced-motion.adapter.js';
import { MetricsAdapter } from '@renderer/application/adapters/metrics.adapter.js';
// Shared
import { AnimationCache } from '@shared/utils/performance-cache.utils.js';

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
    return new BrowserStorageAdapter({
      protectedKeys: PROTECTED_STORAGE_KEYS
    });
  }, []);

  container.registerSingleton('browserMediaService', function() {
    return new BrowserMediaAdapter();
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
  container.registerSingleton('deviceIpcAdapter', function(loggerFactory) {
    return new DeviceIpcAdapter({ logger: loggerFactory.create('DeviceIpcAdapter') });
  }, ['loggerFactory']);

  // Device Change Debounce Adapter - prevents event burst races
  container.registerSingleton(
    'deviceChangeDebounceAdapter',
    function(browserMediaService, loggerFactory) {
      return new DeviceChangeDebounceAdapter({
        browserMediaService,
        logger: loggerFactory.create('DeviceChangeDebounceAdapter')
      });
    },
    ['browserMediaService', 'loggerFactory']
  );

  // Streaming infrastructure
  container.registerSingleton('animationCache', function() {
    return new AnimationCache();
  }, []);

  container.registerSingleton(
    'canvasRenderer',
    function(loggerFactory, animationCache) {
      return new StreamingCanvasRenderer(
        loggerFactory.create('StreamingCanvasRenderer'),
        animationCache
      );
    },
    ['loggerFactory', 'animationCache']
  );

  container.registerSingleton(
    'viewportService',
    function(loggerFactory) {
      return new StreamingViewportService({ loggerFactory });
    },
    ['loggerFactory']
  );

  container.registerSingleton(
    'canvasLifecycleService',
    function(streamViewService, canvasRenderer, viewportService, gpuRendererService, eventBus, loggerFactory) {
      return new StreamingCanvasLifecycleService({
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
      return new StreamingGpuRenderLoopService({ loggerFactory });
    },
    ['loggerFactory']
  );

  container.registerSingleton(
    'streamHealthService',
    function(loggerFactory) {
      return new StreamingHealthService({ loggerFactory });
    },
    ['loggerFactory']
  );

  // GPU Managers (new architecture)
  container.registerSingleton(
    'gpuFrameBuffer',
    function(loggerFactory) {
      return new GpuFrameBuffer({ loggerFactory });
    },
    ['loggerFactory']
  );

  container.registerSingleton(
    'gpuWorkerManager',
    function(loggerFactory, eventBus) {
      return new GpuWorkerManager({ loggerFactory, eventBus });
    },
    ['loggerFactory', 'eventBus']
  );

  // GPU Renderer Service - HD rendering pipeline
  container.registerSingleton(
    'gpuRendererService',
    function(eventBus, loggerFactory, settingsService, gpuFrameBuffer, gpuWorkerManager) {
      return new StreamingGpuRendererService({
        eventBus,
        loggerFactory,
        settingsService,
        gpuFrameBuffer,
        gpuWorkerManager
      });
    },
    ['eventBus', 'loggerFactory', 'settingsService', 'gpuFrameBuffer', 'gpuWorkerManager']
  );

  // Streaming Renderer Factory - Creates GPU and Canvas2D renderer adapters
  // Renderer adapter classes are registered here via DI bootstrap for testability
  container.registerSingleton(
    'streamingRendererFactory',
    function(eventBus, loggerFactory) {
      // Register renderer adapter classes via DI (no hardcoded imports in factory)
      const rendererClasses = new Map([
        ['gpu', StreamingGpuRendererAdapter],
        ['canvas2d', StreamingCanvas2DRendererAdapter]
      ]);
      const rendererFactory = new StreamingRendererFactory(eventBus, loggerFactory, rendererClasses);
      rendererFactory.initialize();
      return rendererFactory;
    },
    ['eventBus', 'loggerFactory']
  );

  // Render Pipeline Service - GPU/Canvas2D switching and health checks
  // Uses Strategy pattern via StreamingRendererFactory for renderer selection
  container.registerSingleton(
    'renderPipelineService',
    function(appState, streamViewService, canvasRenderer, canvasLifecycleService, streamHealthService, streamingRendererFactory, gpuRendererService, gpuRenderLoopService, eventBus, loggerFactory) {
      return new StreamingRenderPipelineService({
        appState,
        streamViewService,
        canvasRenderer,
        canvasLifecycleService,
        streamHealthService,
        streamingRendererFactory,
        gpuRendererService,
        gpuRenderLoopService,
        eventBus,
        loggerFactory
      });
    },
    ['appState', 'streamViewService', 'canvasRenderer', 'canvasLifecycleService', 'streamHealthService', 'streamingRendererFactory', 'gpuRendererService', 'gpuRenderLoopService', 'eventBus', 'loggerFactory']
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
      return new DeviceIpcStatusAdapter(ipcClient);
    },
    ['ipcClient']
  );

  // ============================================
  // Adapter Factory
  // ============================================

  // Adapter Factory - Creates device adapters based on device type
  // Adapter classes are registered here via DI bootstrap for testability
  container.registerSingleton(
    'adapterFactory',
    function (eventBus, loggerFactory, browserMediaService) {
      // Register adapter classes via DI (no hardcoded imports in StreamingAdapterFactory)
      const adapterClasses = new Map([
        ['chromatic-mod-retro', DeviceChromaticAdapter]
      ]);
      const adapterFactory = new StreamingAdapterFactory(eventBus, loggerFactory, browserMediaService, adapterClasses);
      adapterFactory.initialize();
      return adapterFactory;
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
    function (eventBus, loggerFactory, browserMediaService, deviceConnectionService, deviceStorageService, deviceChangeDebounceAdapter) {
      return new DeviceMediaService({ eventBus, loggerFactory, browserMediaService, deviceConnectionService, deviceStorageService, deviceChangeDebounceAdapter });
    },
    ['eventBus', 'loggerFactory', 'browserMediaService', 'deviceConnectionService', 'deviceStorageService', 'deviceChangeDebounceAdapter']
  );

  // Device Service (facade coordinating device sub-services)
  container.registerSingleton(
    'deviceService',
    function (eventBus, loggerFactory, deviceStatusProvider, deviceConnectionService, deviceStorageService, deviceMediaService) {
      return new DeviceService({ eventBus, loggerFactory, deviceStatusProvider, deviceConnectionService, deviceStorageService, deviceMediaService });
    },
    ['eventBus', 'loggerFactory', 'deviceStatusProvider', 'deviceConnectionService', 'deviceStorageService', 'deviceMediaService']
  );

  // Device Operation Sequencer - prevents race conditions from concurrent IPC events
  container.registerSingleton(
    'deviceOperationSequencer',
    function(deviceService, eventBus, loggerFactory) {
      return new DeviceOperationSequencerService({
        deviceService,
        eventBus,
        loggerFactory
      });
    },
    ['deviceService', 'eventBus', 'loggerFactory']
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
      return new CaptureGpuRecordingService({ gpuRendererService, eventBus, loggerFactory });
    },
    ['gpuRendererService', 'eventBus', 'loggerFactory']
  );

  // Transcode Service (video format conversion)
  container.registerSingleton(
    'transcodeService',
    function (eventBus, loggerFactory) {
      return new TranscodeService({ eventBus, loggerFactory });
    },
    ['eventBus', 'loggerFactory']
  );

  // Capture Save Service (handles saving recordings with optional transcoding)
  container.registerSingleton(
    'captureSaveService',
    function (eventBus, settingsService, transcodeService, loggerFactory) {
      return new CaptureSaveService({ eventBus, settingsService, transcodeService, loggerFactory });
    },
    ['eventBus', 'settingsService', 'transcodeService', 'loggerFactory']
  );

  // Settings Service (user preferences)
  container.registerSingleton(
    'settingsService',
    function (eventBus, loggerFactory, storageService) {
      return new SettingsService({ eventBus, loggerFactory, storageService });
    },
    ['eventBus', 'loggerFactory', 'storageService']
  );

  // Notes Service (note management)
  container.registerSingleton(
    'notesService',
    function (eventBus, loggerFactory, storageService) {
      return new NotesService({ eventBus, loggerFactory, storageService });
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
      return new StreamingViewService({ uiController, loggerFactory });
    },
    ['uiController', 'loggerFactory']
  );

  container.registerSingleton(
    'streamingAudioPipelineService',
    function (eventBus, loggerFactory, settingsService) {
      return new StreamingAudioPipelineService({ eventBus, loggerFactory, settingsService });
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

  // UI Component Registry - manages component lifecycle
  container.registerSingleton(
    'uiComponentRegistry',
    function (loggerFactory) {
      const componentDefinitions = [
        {
          id: 'statusNotificationComponent',
          stage: 'core',
          create: ({ elements }) => new StatusNotificationComponent({
            statusMessage: elements.statusMessage
          })
        },
        {
          id: 'deviceStatusComponent',
          stage: 'core',
          create: ({ elements }) => new DeviceStatusComponent({
            statusIndicator: elements.statusIndicator,
            statusText: elements.statusText,
            deviceName: elements.deviceName,
            deviceStatusText: elements.deviceStatusText,
            streamOverlay: elements.streamOverlay,
            overlayMessage: elements.overlayMessage
          })
        },
        {
          id: 'streamControlsComponent',
          stage: 'core',
          create: ({ elements, dependencies }) => new StreamingControlsComponent({
            elements: {
              currentResolution: elements.currentResolution,
              currentFPS: elements.currentFPS,
              screenshotBtn: elements.screenshotBtn,
              recordBtn: elements.recordBtn,
              shaderControls: elements.shaderControls,
              streamOverlay: elements.streamOverlay
            },
            bodyClassManager: dependencies.bodyClassManager
          })
        },
        {
          id: 'transcodeToastComponent',
          stage: 'core',
          create: ({ elements }) => new TranscodeToastComponent({
            recordBtn: elements.recordBtn,
            transcodeRing: elements.transcodeRing,
            transcodePercentLabel: elements.transcodePercentLabel
          })
        },
        {
          id: 'settingsMenuComponent',
          stage: 'deferred',
          create: ({ dependencies }) => {
            const updateSectionComponent = dependencies.updateOrchestrator
              ? new UpdateSectionComponent({
                updateOrchestrator: dependencies.updateOrchestrator,
                eventBus: dependencies.eventBus,
                loggerFactory: dependencies.loggerFactory
              })
              : null;

            return new SettingsMenuComponent({
              settingsService: dependencies.settingsService,
              updateSectionComponent,
              eventBus: dependencies.eventBus,
              loggerFactory: dependencies.loggerFactory,
              logger: dependencies.logger
            });
          }
        },
        {
          id: 'shaderSelectorComponent',
          stage: 'deferred',
          create: ({ dependencies }) => new ShaderSelectorComponent({
            settingsService: dependencies.settingsService,
            appState: dependencies.appState,
            eventBus: dependencies.eventBus,
            logger: dependencies.logger
          })
        },
        {
          id: 'notesPanelComponent',
          stage: 'deferred',
          create: ({ dependencies }) => new NotesPanelComponent({
            notesService: dependencies.notesService,
            eventBus: dependencies.eventBus,
            logger: dependencies.logger
          })
        }
      ];

      return new UIComponentRegistry({ componentDefinitions, loggerFactory });
    },
    ['loggerFactory']
  );

  // UI Effects - visual feedback effects
  container.registerSingleton(
    'uiEffects',
    function (bodyClassManager) {
      // Note: elements are set later when UIController is created
      return new UIEffects({ elements: null, bodyClassManager });
    },
    ['bodyClassManager']
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
    function (eventBus, uiController, presentationModeService, loggerFactory) {
      return new UIEventBridge({ eventBus, uiController, presentationModeService, loggerFactory });
    },
    ['eventBus', 'uiController', 'presentationModeService', 'loggerFactory']
  );

  // Presentation Mode Service - derives combined UI display state
  container.registerSingleton(
    'presentationModeService',
    function (uiController, appState, loggerFactory) {
      return new PresentationModeService({ uiController, appState, loggerFactory });
    },
    ['uiController', 'appState', 'loggerFactory']
  );

  container.registerSingleton(
    'captureUiBridge',
    function (eventBus, uiController, loggerFactory) {
      return new CaptureUIBridge({ eventBus, uiController, loggerFactory });
    },
    ['eventBus', 'uiController', 'loggerFactory']
  );

  // Transcode UI Bridge - shows transcode progress and manages record button state
  container.registerSingleton(
    'transcodeUiBridge',
    function (eventBus, uiController, loggerFactory) {
      return new TranscodeUIBridge({ eventBus, uiController, loggerFactory });
    },
    ['eventBus', 'uiController', 'loggerFactory']
  );

  // ============================================
  // Orchestrators (NEW ARCHITECTURE)
  // ============================================

  // Device Orchestrator - Coordinates device detection
  // Uses deviceOperationSequencer to prevent race conditions from concurrent IPC events
  container.registerSingleton(
    'deviceOrchestrator',
    function (deviceService, deviceIpcAdapter, deviceOperationSequencer, eventBus, loggerFactory) {
      return new DeviceOrchestrator({
        deviceService,
        deviceIpcAdapter,
        deviceOperationSequencer,
        eventBus,
        loggerFactory
      });
    },
    ['deviceService', 'deviceIpcAdapter', 'deviceOperationSequencer', 'eventBus', 'loggerFactory']
  );

  // Streaming Audio Orchestrator - Coordinates audio warm-up and fallback
  container.registerSingleton(
    'streamingAudioOrchestrator',
    function (streamingAudioPipelineService, streamViewService, appState, eventBus, loggerFactory) {
      return new StreamingAudioOrchestrator({
        streamingAudioPipelineService,
        streamViewService,
        appState,
        eventBus,
        loggerFactory
      });
    },
    ['streamingAudioPipelineService', 'streamViewService', 'appState', 'eventBus', 'loggerFactory']
  );

  // Streaming Orchestrator - Coordinates stream lifecycle
  // Uses appState instead of deviceOrchestrator for decoupling
  // Requires gpuRecordingService to stop recording before GPU cleanup (avoids Skia race)
  // Requires settingsService for auto-stream on connect feature
  container.registerSingleton(
    'streamingOrchestrator',
    function (streamingService, appState, streamViewService, renderPipelineService, gpuRecordingService, settingsService, eventBus, loggerFactory) {
      return new StreamingOrchestrator({
        streamingService,
        appState,
        streamViewService,
        renderPipelineService,
        gpuRecordingService,
        settingsService,
        eventBus,
        loggerFactory
      });
    },
    ['streamingService', 'appState', 'streamViewService', 'renderPipelineService', 'gpuRecordingService', 'settingsService', 'eventBus', 'loggerFactory']
  );

  // Capture Orchestrator - Coordinates screenshot and recording
  // Uses appState instead of streamingOrchestrator for decoupling
  // Uses streamViewService for DOM element access instead of direct uiController
  // Requires gpuRendererService and canvasRenderer for screenshot source selection
  // Requires transcodeService to check transcode status before allowing new recordings
  // Requires captureSaveService to save recordings (with optional transcoding)
  container.registerSingleton(
    'captureOrchestrator',
    function (captureService, appState, streamViewService, gpuRendererService, gpuRecordingService, canvasRenderer, transcodeService, captureSaveService, eventBus, loggerFactory) {
      return new CaptureOrchestrator({
        captureService,
        appState,
        streamViewService,
        gpuRendererService,
        gpuRecordingService,
        canvasRenderer,
        transcodeService,
        captureSaveService,
        eventBus,
        loggerFactory
      });
    },
    ['captureService', 'appState', 'streamViewService', 'gpuRendererService', 'gpuRecordingService', 'canvasRenderer', 'transcodeService', 'captureSaveService', 'eventBus', 'loggerFactory']
  );

  // ============================================
  // Application Orchestrators (Phase 2 - Decomposed)
  // ============================================

  // Preferences Orchestrator - Coordinates preferences loading
  container.registerSingleton(
    'preferencesOrchestrator',
    function (settingsService, appState, eventBus, loggerFactory) {
      return new SettingsPreferencesOrchestrator({
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
    function (eventBus, loggerFactory) {
      return new SettingsFullscreenService({ eventBus, loggerFactory });
    },
    ['eventBus', 'loggerFactory']
  );

  container.registerSingleton(
    'cinematicModeService',
    function (appState, eventBus, loggerFactory) {
      return new SettingsCinematicModeService({ appState, eventBus, loggerFactory });
    },
    ['appState', 'eventBus', 'loggerFactory']
  );

  // Display Mode Orchestrator - Coordinates display modes (fullscreen, volume, cinematic)
  container.registerSingleton(
    'displayModeOrchestrator',
    function (fullscreenService, cinematicModeService, settingsService, eventBus, loggerFactory) {
      return new SettingsDisplayModeOrchestrator({
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
      return new PerformanceAnimationOrchestrator({
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
      return new PerformanceAnimationService({ loggerFactory });
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
  // Uses event-based communication for button handlers (decoupled from orchestrators)
  container.registerSingleton(
    'uiSetupOrchestrator',
    function (
      appState,
      updateOrchestrator,
      settingsService,
      notesService,
      uiController,
      eventBus,
      loggerFactory
    ) {
      return new UISetupOrchestrator({
        appState,
        updateOrchestrator,
        settingsService,
        notesService,
        uiController,
        eventBus,
        loggerFactory
      });
    },
    [
      'appState',
      'updateOrchestrator',
      'settingsService',
      'notesService',
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
      streamingAudioOrchestrator,
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
        streamingAudioOrchestrator,
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
      'streamingAudioOrchestrator',
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
