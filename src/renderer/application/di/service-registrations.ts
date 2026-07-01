import { AnimationCache, ConsoleLoggerFactory } from '@prismgb/core';
import { NotesService } from '@prismgb/notes';
import { EventBus } from '../../infrastructure/events/event-bus.class';
import { RendererDeviceRuntime } from '../../infrastructure/services/devices/device-runtime.service';
import { DeviceMediaAcquirer } from '../../infrastructure/services/streaming/device-media-acquirer';
import { StreamingService } from '../../infrastructure/services/streaming/streaming.service';
import { AppState } from '../state/app-state';
import { StreamingViewService } from '../../infrastructure/services/streaming/streaming-view.service';
import { StreamingRenderPipelineService } from '../../infrastructure/services/streaming/render-pipeline.service';
import { CaptureGpuRecordingService } from '../../infrastructure/services/gpu/gpu-recording.service';
import { SettingsService } from '../../infrastructure/services/settings/settings.service';
import { StreamingOrchestrator } from '../orchestrators/streaming.orchestrator';
import { StreamingAudioPipelineService } from '../../infrastructure/services/streaming/audio-pipeline.service';
import { StreamingAudioOrchestrator } from '../orchestrators/streaming-audio.orchestrator';
import { CaptureService } from '../../infrastructure/services/capture/capture.service';
import { StreamingGpuRendererService } from '../../infrastructure/services/gpu/gpu-renderer.service';
import { TranscodeService } from '../../infrastructure/services/transcode/transcode.service';
import { CaptureSaveService } from '../../infrastructure/services/capture/capture-save.service';
import { CaptureOrchestrator } from '../orchestrators/capture.orchestrator';
import { SettingsPreferencesOrchestrator } from '../orchestrators/preferences.orchestrator';
import { SettingsFullscreenService } from '../../infrastructure/services/settings/settings-fullscreen.service';
import { SettingsCinematicModeService } from '../../infrastructure/services/settings/settings-cinematic-mode.service';
import { SettingsDisplayModeOrchestrator } from '../orchestrators/display-mode.orchestrator';
import { UpdateService } from '../../infrastructure/services/updates/update.service';
import { UpdateUiService } from '../../infrastructure/services/updates/update-ui.service';
import { UpdateOrchestrator } from '../orchestrators/update.orchestrator';
import { UISetupOrchestrator } from '../orchestrators/ui-setup.orchestrator';
import { PerformanceAnimationService } from '../../infrastructure/services/performance/performance-animation.service';
import { BodyClassManager } from '../../presentation/effects/body-class.class';
import { PerformanceAnimationOrchestrator } from '../orchestrators/performance/performance-animation.orchestrator';
import { MetricsAdapter } from '../../infrastructure/adapters/platform-metrics.adapter';
import { PerformanceMetricsService } from '../../infrastructure/services/performance/performance-metrics.service';
import { PerformanceMetricsOrchestrator } from '../orchestrators/performance/performance-metrics.orchestrator';
import { VisibilityAdapter } from '../../infrastructure/adapters/visibility.adapter';
import { UserActivityAdapter } from '../../infrastructure/adapters/user-activity.adapter';
import { ReducedMotionAdapter } from '../../infrastructure/adapters/reduced-motion.adapter';
import { PerformanceStateService } from '../../infrastructure/services/performance/performance-state.service';
import { PerformanceStateOrchestrator } from '../orchestrators/performance/performance-state.orchestrator';
import { AppOrchestrator } from '../orchestrators/app.orchestrator';
import { BrowserMediaAdapter } from '../../infrastructure/browser/browser-media.adapter';
import { WorkerRendererClient } from '@prismgb/gpu/worker';
import { StreamingGpuRenderLoopService } from '../../infrastructure/services/gpu/gpu-render-loop.service';
import { StreamingHealthService } from '../../infrastructure/services/platform/health.service';
import { StreamingViewportService } from '../../infrastructure/services/platform/viewport.service';
import { PresentationModeService } from '../../infrastructure/services/settings/settings-presentation-mode.service';
import { StreamingCanvasLifecycleService } from '../../infrastructure/services/streaming/canvas-lifecycle.service';
import { CaptureUIBridge } from '../../presentation/bridges/capture-ui.bridge';
import { TranscodeUIBridge } from '../../presentation/bridges/transcode-ui.bridge';
import { UIEventBridge } from '../../presentation/bridges/ui-event.bridge';
import { UIEffects } from '../../presentation/effects/ui-effects.class';

/**
 * Constructs a standard-shape service from the lazily-resolving DI cradle.
 */
export type StandardServiceFactory = (cradle: any) => unknown;

/**
 * Explicit registration map for every standard-construction service (`new X(cradle)`
 * or zero-arg). This is the single source of truth that replaces the former
 * generated container switch; non-standard wiring lives in `manual-providers.ts`.
 */
export const standardServiceRegistrations: Record<string, StandardServiceFactory> = {
  eventBus: (cradle) => new EventBus(cradle),
  loggerFactory: () => new ConsoleLoggerFactory(),
  rendererDeviceRuntime: (cradle) => new RendererDeviceRuntime(cradle),
  deviceMediaAcquirer: (cradle) => new DeviceMediaAcquirer(cradle),
  streamingService: (cradle) => new StreamingService(cradle),
  appState: (cradle) => new AppState(cradle),
  streamViewService: (cradle) => new StreamingViewService(cradle),
  renderPipelineService: (cradle) => new StreamingRenderPipelineService(cradle),
  gpuRecordingService: (cradle) => new CaptureGpuRecordingService(cradle),
  settingsService: (cradle) => new SettingsService(cradle),
  streamingOrchestrator: (cradle) => new StreamingOrchestrator(cradle),
  streamingAudioPipelineService: (cradle) => new StreamingAudioPipelineService(cradle),
  streamingAudioOrchestrator: (cradle) => new StreamingAudioOrchestrator(cradle),
  captureService: (cradle) => new CaptureService(cradle),
  gpuRendererService: (cradle) => new StreamingGpuRendererService(cradle),
  transcodeService: (cradle) => new TranscodeService(cradle),
  captureSaveService: (cradle) => new CaptureSaveService(cradle),
  captureOrchestrator: (cradle) => new CaptureOrchestrator(cradle),
  preferencesOrchestrator: (cradle) => new SettingsPreferencesOrchestrator(cradle),
  fullscreenService: (cradle) => new SettingsFullscreenService(cradle),
  cinematicModeService: (cradle) => new SettingsCinematicModeService(cradle),
  displayModeOrchestrator: (cradle) => new SettingsDisplayModeOrchestrator(cradle),
  updateService: (cradle) => new UpdateService(cradle),
  updateUiService: (cradle) => new UpdateUiService(cradle),
  updateOrchestrator: (cradle) => new UpdateOrchestrator(cradle),
  notesService: (cradle) => new NotesService(cradle),
  uiSetupOrchestrator: (cradle) => new UISetupOrchestrator(cradle),
  animationPerformanceService: (cradle) => new PerformanceAnimationService(cradle),
  bodyClassManager: () => new BodyClassManager(),
  animationPerformanceOrchestrator: (cradle) => new PerformanceAnimationOrchestrator(cradle),
  metricsAdapter: () => new MetricsAdapter(),
  performanceMetricsService: (cradle) => new PerformanceMetricsService(cradle),
  performanceMetricsOrchestrator: (cradle) => new PerformanceMetricsOrchestrator(cradle),
  visibilityAdapter: () => new VisibilityAdapter(),
  userActivityAdapter: () => new UserActivityAdapter(),
  reducedMotionAdapter: () => new ReducedMotionAdapter(),
  performanceStateService: (cradle) => new PerformanceStateService(cradle),
  performanceStateOrchestrator: (cradle) => new PerformanceStateOrchestrator(cradle),
  appOrchestrator: (cradle) => new AppOrchestrator(cradle),
  browserMediaService: () => new BrowserMediaAdapter(),
  gpuRenderLoopService: (cradle) => new StreamingGpuRenderLoopService(cradle),
  workerRendererClient: (cradle) => new WorkerRendererClient({
    createWorker: () => new Worker(new URL('@prismgb/gpu/worker-entry', import.meta.url), { type: 'module' }),
    logger: cradle.loggerFactory.create('WorkerRendererClient')
  }),
  streamHealthService: (cradle) => new StreamingHealthService(cradle),
  viewportService: (cradle) => new StreamingViewportService(cradle),
  presentationModeService: (cradle) => new PresentationModeService(cradle),
  canvasLifecycleService: (cradle) => new StreamingCanvasLifecycleService(cradle),
  captureUiBridge: (cradle) => new CaptureUIBridge(cradle),
  transcodeUiBridge: (cradle) => new TranscodeUIBridge(cradle),
  uiEventBridge: (cradle) => new UIEventBridge(cradle),
  uiEffects: (cradle) => new UIEffects(cradle),
  animationCache: () => new AnimationCache()
};
