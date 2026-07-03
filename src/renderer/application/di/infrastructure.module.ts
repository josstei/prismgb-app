import { ContainerModule } from 'inversify';
import { ConsoleLoggerFactory } from '@platform/core';
import { EventBus } from '../../infrastructure/events/event-bus';
import { RendererDeviceRuntime } from '../../infrastructure/services/devices/device-runtime.service';
import { DeviceMediaAcquirer } from '../../infrastructure/services/streaming/device-media-acquirer';
import { StreamingService } from '../../infrastructure/services/streaming/streaming.service';
import { StreamingViewService } from '../../infrastructure/services/streaming/streaming-view.service';
import { StreamingRenderService } from '../../infrastructure/services/streaming/streaming-render.service';
import { CaptureGpuRecordingService } from '../../infrastructure/services/gpu/gpu-recording.service';
import { SettingsService } from '../../infrastructure/services/settings/settings.service';
import { StreamingAudioPipelineService } from '../../infrastructure/services/streaming/audio-pipeline.service';
import { CaptureService } from '../../infrastructure/services/capture/capture.service';
import { TranscodeService } from '../../infrastructure/services/transcode/transcode.service';
import { CaptureSaveService } from '../../infrastructure/services/capture/capture-save.service';
import { SettingsFullscreenService } from '../../infrastructure/services/settings/settings-fullscreen.service';
import { SettingsCinematicModeService } from '../../infrastructure/services/settings/settings-cinematic-mode.service';
import { UpdateService } from '../../infrastructure/services/updates/update.service';
import { UpdateUiService } from '../../infrastructure/services/updates/update-ui.service';
import { PerformanceAnimationService } from '../../infrastructure/services/performance/performance-animation.service';
import { MetricsAdapter } from '../../infrastructure/adapters/platform-metrics.adapter';
import { PerformanceMetricsService } from '../../infrastructure/services/performance/performance-metrics.service';
import { VisibilityAdapter } from '../../infrastructure/adapters/visibility.adapter';
import { UserActivityAdapter } from '../../infrastructure/adapters/user-activity.adapter';
import { ReducedMotionAdapter } from '../../infrastructure/adapters/reduced-motion.adapter';
import { PerformanceStateService } from '../../infrastructure/services/performance/performance-state.service';
import { BrowserMediaAdapter } from '../../infrastructure/adapters/browser-media.adapter';
import { StreamingHealthService } from '../../infrastructure/services/platform/health.service';
import { StreamingViewportService } from '../../infrastructure/services/platform/viewport.service';
import { PresentationModeService } from '../../infrastructure/services/settings/settings-presentation-mode.service';
import { TOKENS } from './tokens.js';

/**
 * Binding module for every renderer infrastructure-layer token: decorated
 * services/adapters bind straight to their class, and the two tokens that
 * cannot use plain `.to(Class)` (the platform-owned logger factory and the
 * device runtime's non-token trailing parameter) bind through a factory.
 * `canvasLifecycleService` is deliberately absent — its circular dependency
 * on `streamingRenderService` is broken in `container.ts`.
 */
export const infrastructureModule = new ContainerModule(({ bind }) => {
  bind(TOKENS.eventBus).to(EventBus).inSingletonScope();

  bind(TOKENS.loggerFactory).toDynamicValue(() => new ConsoleLoggerFactory()).inSingletonScope();

  bind(TOKENS.rendererDeviceRuntime).toDynamicValue((ctx) => new RendererDeviceRuntime(
    ctx.get(TOKENS.deviceStatusPort),
    ctx.get(TOKENS.mediaDevicesPort),
    ctx.get(TOKENS.devicePreferenceStore),
    ctx.get(TOKENS.eventBus),
    ctx.get(TOKENS.loggerFactory)
  )).inSingletonScope();

  bind(TOKENS.deviceMediaAcquirer).to(DeviceMediaAcquirer).inSingletonScope();
  bind(TOKENS.streamingService).to(StreamingService).inSingletonScope();
  bind(TOKENS.streamViewService).to(StreamingViewService).inSingletonScope();
  bind(TOKENS.streamingRenderService).to(StreamingRenderService).inSingletonScope();
  bind(TOKENS.gpuRecordingService).to(CaptureGpuRecordingService).inSingletonScope();
  bind(TOKENS.settingsService).to(SettingsService).inSingletonScope();
  bind(TOKENS.streamingAudioPipelineService).to(StreamingAudioPipelineService).inSingletonScope();
  bind(TOKENS.captureService).to(CaptureService).inSingletonScope();
  bind(TOKENS.transcodeService).to(TranscodeService).inSingletonScope();
  bind(TOKENS.captureSaveService).to(CaptureSaveService).inSingletonScope();
  bind(TOKENS.fullscreenService).to(SettingsFullscreenService).inSingletonScope();
  bind(TOKENS.cinematicModeService).to(SettingsCinematicModeService).inSingletonScope();
  bind(TOKENS.updateService).to(UpdateService).inSingletonScope();
  bind(TOKENS.updateUiService).to(UpdateUiService).inSingletonScope();
  bind(TOKENS.animationPerformanceService).to(PerformanceAnimationService).inSingletonScope();
  bind(TOKENS.metricsAdapter).to(MetricsAdapter).inSingletonScope();
  bind(TOKENS.performanceMetricsService).to(PerformanceMetricsService).inSingletonScope();
  bind(TOKENS.visibilityAdapter).to(VisibilityAdapter).inSingletonScope();
  bind(TOKENS.userActivityAdapter).to(UserActivityAdapter).inSingletonScope();
  bind(TOKENS.reducedMotionAdapter).to(ReducedMotionAdapter).inSingletonScope();
  bind(TOKENS.performanceStateService).to(PerformanceStateService).inSingletonScope();
  bind(TOKENS.browserMediaService).to(BrowserMediaAdapter).inSingletonScope();
  bind(TOKENS.streamHealthService).to(StreamingHealthService).inSingletonScope();
  bind(TOKENS.viewportService).to(StreamingViewportService).inSingletonScope();
  bind(TOKENS.presentationModeService).to(PresentationModeService).inSingletonScope();
});
