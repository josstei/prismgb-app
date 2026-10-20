import { ContainerModule } from 'inversify';
import { ConsoleLoggerFactory } from '@platform/core';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import { PROTECTED_STORAGE_KEYS } from '@renderer/lib/storage-keys.config';
import { EventBus } from '../../lib/events/event-bus';
import { BrowserStorageAdapter } from '../../infrastructure/adapters/browser-storage.adapter';
import { BrowserMediaDevicesPort } from '../../infrastructure/services/devices/browser-media-devices.port';
import { StorageDevicePreferenceStore } from '../../infrastructure/services/devices/storage-device-preference.store';
import { TrpcDeviceStatusPort } from '../../infrastructure/services/devices/trpc-device-status.port';
import { RendererDeviceRuntime } from '../../infrastructure/services/devices/device-runtime.service';
import { NotesService } from '../../infrastructure/services/notes/notes.service';
import { DeviceMediaAcquirer } from '../../infrastructure/services/streaming/device-media-acquirer.service';
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
import { AppState } from '../state/app-state';
import { StreamingOrchestrator } from '../orchestrators/streaming.orchestrator';
import { StreamingAudioOrchestrator } from '../orchestrators/streaming-audio.orchestrator';
import { CaptureOrchestrator } from '../orchestrators/capture.orchestrator';
import { SettingsDisplayModeOrchestrator } from '../orchestrators/display-mode.orchestrator';
import { UISetupOrchestrator } from '../orchestrators/ui-setup.orchestrator';
import { PerformanceAnimationOrchestrator } from '../orchestrators/performance/performance-animation.orchestrator';
import { PerformanceMetricsOrchestrator } from '../orchestrators/performance/performance-metrics.orchestrator';
import { PerformanceStateOrchestrator } from '../orchestrators/performance/performance-state.orchestrator';
import { AppOrchestrator } from '../orchestrators/app.orchestrator';
import { TOKENS } from './tokens';

/**
 * Platform, infrastructure and application bindings. `canvasLifecycleService`
 * binds in container.ts, where its lazy read of `streamingRenderService` breaks
 * their circular dependency.
 */
export const servicesModule = new ContainerModule(({ bind }) => {
  bind(TOKENS.loggerFactory).toDynamicValue(() => new ConsoleLoggerFactory());
  bind(TOKENS.eventBus).toDynamicValue((ctx) => new EventBus(ctx.get(TOKENS.loggerFactory).create('EventBus')));

  bind(TOKENS.storageService).toDynamicValue(() => new BrowserStorageAdapter({ protectedKeys: PROTECTED_STORAGE_KEYS }));
  bind(TOKENS.deviceStatusPort).toDynamicValue((ctx) => new TrpcDeviceStatusPort(
    trpcClient,
    ctx.get(TOKENS.loggerFactory).create('TrpcDeviceStatusPort')
  ));
  bind(TOKENS.mediaDevicesPort).toDynamicValue((ctx) => new BrowserMediaDevicesPort(
    ctx.get(TOKENS.browserMediaService),
    ctx.get(TOKENS.loggerFactory).create('BrowserMediaDevicesPort')
  ));
  bind(TOKENS.devicePreferenceStore).toDynamicValue((ctx) => new StorageDevicePreferenceStore(
    ctx.get(TOKENS.storageService),
    ctx.get(TOKENS.loggerFactory).create('StorageDevicePreferenceStore')
  ));
  bind(TOKENS.rendererDeviceRuntime).toDynamicValue((ctx) => new RendererDeviceRuntime(
    ctx.get(TOKENS.deviceStatusPort),
    ctx.get(TOKENS.mediaDevicesPort),
    ctx.get(TOKENS.devicePreferenceStore),
    ctx.get(TOKENS.eventBus),
    ctx.get(TOKENS.loggerFactory)
  ));
  bind(TOKENS.notesService).to(NotesService);
  bind(TOKENS.deviceMediaAcquirer).to(DeviceMediaAcquirer);
  bind(TOKENS.streamingService).to(StreamingService);
  bind(TOKENS.streamViewService).to(StreamingViewService);
  bind(TOKENS.streamingRenderService).to(StreamingRenderService);
  bind(TOKENS.gpuRecordingService).to(CaptureGpuRecordingService);
  bind(TOKENS.settingsService).to(SettingsService);
  bind(TOKENS.streamingAudioPipelineService).to(StreamingAudioPipelineService);
  bind(TOKENS.captureService).to(CaptureService);
  bind(TOKENS.transcodeService).to(TranscodeService);
  bind(TOKENS.captureSaveService).to(CaptureSaveService);
  bind(TOKENS.fullscreenService).to(SettingsFullscreenService);
  bind(TOKENS.cinematicModeService).to(SettingsCinematicModeService);
  bind(TOKENS.updateService).to(UpdateService);
  bind(TOKENS.updateUiService).to(UpdateUiService);
  bind(TOKENS.animationPerformanceService).to(PerformanceAnimationService);
  bind(TOKENS.metricsAdapter).to(MetricsAdapter);
  bind(TOKENS.performanceMetricsService).to(PerformanceMetricsService);
  bind(TOKENS.visibilityAdapter).to(VisibilityAdapter);
  bind(TOKENS.userActivityAdapter).to(UserActivityAdapter);
  bind(TOKENS.reducedMotionAdapter).to(ReducedMotionAdapter);
  bind(TOKENS.performanceStateService).to(PerformanceStateService);
  bind(TOKENS.browserMediaService).to(BrowserMediaAdapter);
  bind(TOKENS.streamHealthService).to(StreamingHealthService);
  bind(TOKENS.viewportService).to(StreamingViewportService);

  bind(TOKENS.appState).toDynamicValue((ctx) => new AppState({
    streamingService: ctx.get(TOKENS.streamingService),
    rendererDeviceRuntime: ctx.get(TOKENS.rendererDeviceRuntime),
    eventBus: ctx.get(TOKENS.eventBus)
  }));
  bind(TOKENS.streamingOrchestrator).to(StreamingOrchestrator);
  bind(TOKENS.streamingAudioOrchestrator).to(StreamingAudioOrchestrator);
  bind(TOKENS.captureOrchestrator).to(CaptureOrchestrator);
  bind(TOKENS.displayModeOrchestrator).to(SettingsDisplayModeOrchestrator);
  bind(TOKENS.uiSetupOrchestrator).to(UISetupOrchestrator);
  bind(TOKENS.animationPerformanceOrchestrator).to(PerformanceAnimationOrchestrator);
  bind(TOKENS.performanceMetricsOrchestrator).to(PerformanceMetricsOrchestrator);
  bind(TOKENS.performanceStateOrchestrator).to(PerformanceStateOrchestrator);
  bind(TOKENS.appOrchestrator).to(AppOrchestrator);
});
