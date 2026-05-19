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
    resolver: DeviceOrchestrator
  },
  {
    token: 'streamingAudioOrchestrator',
    kind: 'class',
    resolver: StreamingAudioOrchestrator
  },
  {
    token: 'streamingOrchestrator',
    kind: 'class',
    resolver: StreamingOrchestrator
  },
  {
    token: 'captureOrchestrator',
    kind: 'class',
    resolver: CaptureOrchestrator
  },
  {
    token: 'preferencesOrchestrator',
    kind: 'class',
    resolver: SettingsPreferencesOrchestrator
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
    resolver: SettingsDisplayModeOrchestrator
  },
  {
    token: 'updateOrchestrator',
    kind: 'class',
    resolver: UpdateOrchestrator
  },
  {
    token: 'performanceStateOrchestrator',
    kind: 'class',
    resolver: PerformanceStateOrchestrator
  },
  {
    token: 'animationPerformanceOrchestrator',
    kind: 'class',
    resolver: PerformanceAnimationOrchestrator
  },
  {
    token: 'performanceMetricsService',
    kind: 'class',
    resolver: PerformanceMetricsService
  },
  {
    token: 'performanceStateService',
    kind: 'class',
    resolver: PerformanceStateService
  },
  {
    token: 'animationPerformanceService',
    kind: 'class',
    resolver: PerformanceAnimationService
  },
  {
    token: 'performanceMetricsOrchestrator',
    kind: 'class',
    resolver: PerformanceMetricsOrchestrator
  },
  {
    token: 'uiSetupOrchestrator',
    kind: 'class',
    resolver: UISetupOrchestrator
  },
  {
    token: 'appOrchestrator',
    kind: 'class',
    resolver: AppOrchestrator
  }
]);

export function registerOrchestrators(container: RegistrableContainer<RendererContainerMap>): void {
  registerRendererDescriptors(container, rendererOrchestratorDescriptors);
}
