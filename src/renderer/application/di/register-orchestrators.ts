import { AppOrchestrator } from '@renderer/application/orchestrators/app.orchestrator';
import { DeviceOrchestrator } from '@renderer/application/orchestrators/device.orchestrator';
import { StreamingAudioOrchestrator } from '@renderer/application/orchestrators/streaming-audio.orchestrator';
import { StreamingOrchestrator } from '@renderer/application/orchestrators/streaming.orchestrator';
import { CaptureOrchestrator } from '@renderer/application/orchestrators/capture.orchestrator';
import { SettingsPreferencesOrchestrator } from '@renderer/application/orchestrators/preferences.orchestrator';
import { SettingsDisplayModeOrchestrator } from '@renderer/application/orchestrators/display-mode.orchestrator';
import { UpdateOrchestrator } from '@renderer/application/orchestrators/update.orchestrator';
import { UISetupOrchestrator } from '@renderer/application/orchestrators/ui-setup.orchestrator';
import { PerformanceStateOrchestrator } from '@renderer/application/orchestrators/performance-state.orchestrator';
import { PerformanceAnimationOrchestrator } from '@renderer/application/orchestrators/performance-animation.orchestrator';
import { PerformanceMetricsOrchestrator } from '@renderer/application/orchestrators/performance-metrics.orchestrator';
import { SettingsFullscreenService } from '@renderer/infrastructure/services/settings/fullscreen.service';
import { SettingsCinematicModeService } from '@renderer/infrastructure/services/settings/cinematic-mode.service';
import { PerformanceMetricsService } from '@renderer/infrastructure/services/performance/performance-metrics.service';
import { PerformanceStateService } from '@renderer/infrastructure/services/performance/performance-state.service';
import { PerformanceAnimationService } from '@renderer/infrastructure/services/performance/performance-animation.service';
import type { RegistrableContainer } from './registrable-container.type';

export function registerOrchestrators(container: RegistrableContainer): void {
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
}
