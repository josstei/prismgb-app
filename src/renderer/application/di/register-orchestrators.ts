import { AppOrchestrator } from '@renderer/application/orchestrators/app.orchestrator';
import { DeviceOrchestrator } from '@renderer/application/orchestrators/device.orchestrator';
import { StreamingAudioOrchestrator } from '@renderer/application/orchestrators/streaming-audio.orchestrator';
import { StreamingOrchestrator } from '@renderer/application/orchestrators/streaming.orchestrator';
import { CaptureOrchestrator } from '@renderer/application/orchestrators/capture.orchestrator';
import { SettingsOrchestrator } from '@renderer/application/orchestrators/settings.orchestrator';
import { UISetupOrchestrator } from '@renderer/application/orchestrators/ui-setup.orchestrator';
import { PerformanceOrchestrator } from '@renderer/application/orchestrators/performance.orchestrator';
import { SettingsFullscreenService } from '@renderer/infrastructure/services/settings/fullscreen.service';
import { PerformanceMetricsService } from '@renderer/infrastructure/services/performance/performance-metrics.service';
import { PerformanceStateService } from '@renderer/infrastructure/services/performance/performance-state.service';
import { PerformanceAnimationService } from '@renderer/infrastructure/services/performance/performance-animation.service';
import type { RegistrableContainer } from './registrable-container.type';
import type { RendererContainerMap } from './renderer-container-map.type';

export function registerOrchestrators(container: RegistrableContainer<RendererContainerMap>): void {
  container.autoRegister('fullscreenService', SettingsFullscreenService);
  container.autoRegister('performanceMetricsService', PerformanceMetricsService);
  container.autoRegister('performanceStateService', PerformanceStateService);
  container.autoRegister('animationPerformanceService', PerformanceAnimationService);

  container.autoRegister('deviceOrchestrator', DeviceOrchestrator);
  container.autoRegister('streamingAudioOrchestrator', StreamingAudioOrchestrator);
  container.autoRegister('streamingOrchestrator', StreamingOrchestrator);
  container.autoRegister('captureOrchestrator', CaptureOrchestrator);
  container.autoRegister('settingsOrchestrator', SettingsOrchestrator);
  container.autoRegister('performanceOrchestrator', PerformanceOrchestrator);
  container.autoRegister('uiSetupOrchestrator', UISetupOrchestrator);
  container.autoRegister('appOrchestrator', AppOrchestrator);
}
