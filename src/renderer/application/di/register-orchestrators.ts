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
import {
  defineRendererDescriptors,
  registerRendererDescriptors
} from '@renderer/infrastructure/di/renderer-container.factory.js';
import type { RegistrableContainer } from './registrable-container.type';
import type { RendererContainerMap } from './renderer-container-map.type';

const rendererOrchestratorDescriptors = defineRendererDescriptors<RendererContainerMap>([
  {
    token: 'deviceOrchestrator',
    kind: 'class',
    resolver: DeviceOrchestrator,
    dependencies: ['deviceService', 'deviceIpcAdapter', 'deviceOperationSequencer', 'eventBus', 'loggerFactory']
  },
  {
    token: 'streamingAudioOrchestrator',
    kind: 'class',
    resolver: StreamingAudioOrchestrator,
    dependencies: ['streamingAudioPipelineService', 'streamViewService', 'appState', 'eventBus', 'loggerFactory']
  },
  {
    token: 'streamingOrchestrator',
    kind: 'class',
    resolver: StreamingOrchestrator,
    dependencies: ['streamingService', 'appState', 'streamViewService', 'renderPipelineService', 'gpuRecordingService', 'settingsService', 'eventBus', 'loggerFactory']
  },
  {
    token: 'captureOrchestrator',
    kind: 'class',
    resolver: CaptureOrchestrator,
    dependencies: [
      'captureService',
      'appState',
      'streamViewService',
      'gpuRendererService',
      'gpuRecordingService',
      'canvasRenderLoopService',
      'transcodeService',
      'captureSaveService',
      'eventBus',
      'loggerFactory'
    ]
  },
  {
    token: 'preferencesOrchestrator',
    kind: 'class',
    resolver: SettingsPreferencesOrchestrator,
    dependencies: ['settingsService', 'eventBus', 'loggerFactory']
  },
  {
    token: 'fullscreenService',
    kind: 'class',
    resolver: SettingsFullscreenService
  },
  {
    token: 'cinematicModeService',
    kind: 'class',
    resolver: SettingsCinematicModeService
  },
  {
    token: 'displayModeOrchestrator',
    kind: 'class',
    resolver: SettingsDisplayModeOrchestrator,
    dependencies: ['fullscreenService', 'cinematicModeService', 'settingsService', 'eventBus', 'loggerFactory']
  },
  {
    token: 'updateOrchestrator',
    kind: 'class',
    resolver: UpdateOrchestrator,
    dependencies: ['updateService', 'updateUiService', 'loggerFactory']
  },
  {
    token: 'performanceStateOrchestrator',
    kind: 'class',
    resolver: PerformanceStateOrchestrator,
    dependencies: ['eventBus', 'performanceStateService', 'loggerFactory']
  },
  {
    token: 'animationPerformanceOrchestrator',
    kind: 'class',
    resolver: PerformanceAnimationOrchestrator,
    dependencies: ['eventBus', 'animationPerformanceService', 'bodyClassManager', 'loggerFactory']
  },
  {
    token: 'performanceMetricsService',
    kind: 'class',
    resolver: PerformanceMetricsService,
    dependencies: ['loggerFactory', 'metricsAdapter']
  },
  {
    token: 'performanceStateService',
    kind: 'class',
    resolver: PerformanceStateService,
    dependencies: ['loggerFactory', 'visibilityAdapter', 'userActivityAdapter', 'reducedMotionAdapter']
  },
  {
    token: 'animationPerformanceService',
    kind: 'class',
    resolver: PerformanceAnimationService,
    dependencies: ['loggerFactory']
  },
  {
    token: 'performanceMetricsOrchestrator',
    kind: 'class',
    resolver: PerformanceMetricsOrchestrator,
    dependencies: ['eventBus', 'loggerFactory', 'performanceMetricsService']
  },
  {
    token: 'uiSetupOrchestrator',
    kind: 'class',
    resolver: UISetupOrchestrator,
    dependencies: ['appState', 'updateOrchestrator', 'settingsService', 'notesService', 'uiController', 'eventBus', 'loggerFactory']
  },
  {
    token: 'appOrchestrator',
    kind: 'class',
    resolver: AppOrchestrator,
    dependencies: [
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
  }
]);

export function registerOrchestrators(container: RegistrableContainer<RendererContainerMap>): void {
  registerRendererDescriptors(container, rendererOrchestratorDescriptors);
}
