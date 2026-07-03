import type { ServiceIdentifier } from 'inversify';
import type { LoggerFactoryLike, StorageServiceLike } from '@platform/core';
import type { NotesService } from '@platform/notes';
import type { EventBus } from '../../infrastructure/events/event-bus.class';
import type { RendererDeviceRuntime } from '../../infrastructure/services/devices/device-runtime.service';
import type { DeviceMediaAcquirer } from '../../infrastructure/services/streaming/device-media-acquirer';
import type { StreamingService } from '../../infrastructure/services/streaming/streaming.service';
import type { AppState } from '../state/app-state';
import type { StreamingViewService } from '../../infrastructure/services/streaming/streaming-view.service';
import type { StreamingRenderService } from '../../infrastructure/services/streaming/streaming-render.service';
import type { CaptureGpuRecordingService } from '../../infrastructure/services/gpu/gpu-recording.service';
import type { SettingsService } from '../../infrastructure/services/settings/settings.service';
import type { StreamingOrchestrator } from '../orchestrators/streaming.orchestrator';
import type { StreamingAudioPipelineService } from '../../infrastructure/services/streaming/audio-pipeline.service';
import type { StreamingAudioOrchestrator } from '../orchestrators/streaming-audio.orchestrator';
import type { CaptureService } from '../../infrastructure/services/capture/capture.service';
import type { TranscodeService } from '../../infrastructure/services/transcode/transcode.service';
import type { CaptureSaveService } from '../../infrastructure/services/capture/capture-save.service';
import type { CaptureOrchestrator } from '../orchestrators/capture.orchestrator';
import type { SettingsFullscreenService } from '../../infrastructure/services/settings/settings-fullscreen.service';
import type { SettingsCinematicModeService } from '../../infrastructure/services/settings/settings-cinematic-mode.service';
import type { SettingsDisplayModeOrchestrator } from '../orchestrators/display-mode.orchestrator';
import type { UpdateService } from '../../infrastructure/services/updates/update.service';
import type { UpdateUiService } from '../../infrastructure/services/updates/update-ui.service';
import type { UISetupOrchestrator } from '../orchestrators/ui-setup.orchestrator';
import type { PerformanceAnimationService } from '../../infrastructure/services/performance/performance-animation.service';
import type { BodyClassManager } from '../../presentation/effects/body-class.class';
import type { PerformanceAnimationOrchestrator } from '../orchestrators/performance/performance-animation.orchestrator';
import type { MetricsAdapter } from '../../infrastructure/adapters/platform-metrics.adapter';
import type { PerformanceMetricsService } from '../../infrastructure/services/performance/performance-metrics.service';
import type { PerformanceMetricsOrchestrator } from '../orchestrators/performance/performance-metrics.orchestrator';
import type { VisibilityAdapter } from '../../infrastructure/adapters/visibility.adapter';
import type { UserActivityAdapter } from '../../infrastructure/adapters/user-activity.adapter';
import type { ReducedMotionAdapter } from '../../infrastructure/adapters/reduced-motion.adapter';
import type { PerformanceStateService } from '../../infrastructure/services/performance/performance-state.service';
import type { PerformanceStateOrchestrator } from '../orchestrators/performance/performance-state.orchestrator';
import type { AppOrchestrator } from '../orchestrators/app.orchestrator';
import type { BrowserMediaAdapter } from '../../infrastructure/browser/browser-media.adapter';
import type { StreamingHealthService } from '../../infrastructure/services/platform/health.service';
import type { StreamingViewportService } from '../../infrastructure/services/platform/viewport.service';
import type { PresentationModeService } from '../../infrastructure/services/settings/settings-presentation-mode.service';
import type { StreamingCanvasLifecycleService } from '../../infrastructure/services/streaming/canvas-lifecycle.service';
import type { CaptureUIBridge } from '../../presentation/bridges/capture-ui.bridge';
import type { TranscodeUIBridge } from '../../presentation/bridges/transcode-ui.bridge';
import type { UIEventBridge } from '../../presentation/bridges/ui-event.bridge';
import type { UIEffects } from '../../presentation/effects/ui-effects.class';
import type {
  TrpcDeviceStatusPort,
  BrowserMediaDevicesPort,
  StorageDevicePreferenceStore
} from '../../infrastructure/services/devices/device-platform.adapters';
import type { PresentationModeStore } from '../../presentation/state/presentation-mode.store';
import type { UIController } from '../../presentation/controller/ui.controller';
import type { UiComponentHost, RendererUiComponentInstanceMap } from '../../presentation/controller/ui-component.host';
import type { DomBindings } from '../../presentation/primitives/dom-bindings.utils';
import type { StatusNotificationComponent } from '../../presentation/shared/status-notification.component';
import type { DeviceStatusComponent } from '../../presentation/shared/device-status.component';
import type { StreamingControlsComponent } from '../../presentation/features/streaming/streaming-controls.component';
import type { TranscodeToastComponent } from '../../presentation/features/transcode/transcode-toast.component';
import type { SettingsMenuComponent } from '../../presentation/features/settings/settings-menu.component';
import type { ShaderSelectorComponent } from '../../presentation/features/toolbar/shader-selector.component';
import type { NotesPanelComponent } from '../../presentation/features/notes/notes-panel.component';

function token<T>(name: string): ServiceIdentifier<T> {
  return Symbol.for(name) as ServiceIdentifier<T>;
}

export const TOKENS = {
  eventBus: token<EventBus>('eventBus'),
  loggerFactory: token<LoggerFactoryLike>('loggerFactory'),
  rendererDeviceRuntime: token<RendererDeviceRuntime>('rendererDeviceRuntime'),
  deviceMediaAcquirer: token<DeviceMediaAcquirer>('deviceMediaAcquirer'),
  streamingService: token<StreamingService>('streamingService'),
  appState: token<AppState>('appState'),
  streamViewService: token<StreamingViewService>('streamViewService'),
  streamingRenderService: token<StreamingRenderService>('streamingRenderService'),
  gpuRecordingService: token<CaptureGpuRecordingService>('gpuRecordingService'),
  settingsService: token<SettingsService>('settingsService'),
  streamingOrchestrator: token<StreamingOrchestrator>('streamingOrchestrator'),
  streamingAudioPipelineService: token<StreamingAudioPipelineService>('streamingAudioPipelineService'),
  streamingAudioOrchestrator: token<StreamingAudioOrchestrator>('streamingAudioOrchestrator'),
  captureService: token<CaptureService>('captureService'),
  transcodeService: token<TranscodeService>('transcodeService'),
  captureSaveService: token<CaptureSaveService>('captureSaveService'),
  captureOrchestrator: token<CaptureOrchestrator>('captureOrchestrator'),
  fullscreenService: token<SettingsFullscreenService>('fullscreenService'),
  cinematicModeService: token<SettingsCinematicModeService>('cinematicModeService'),
  displayModeOrchestrator: token<SettingsDisplayModeOrchestrator>('displayModeOrchestrator'),
  updateService: token<UpdateService>('updateService'),
  updateUiService: token<UpdateUiService>('updateUiService'),
  notesService: token<NotesService>('notesService'),
  uiSetupOrchestrator: token<UISetupOrchestrator>('uiSetupOrchestrator'),
  animationPerformanceService: token<PerformanceAnimationService>('animationPerformanceService'),
  bodyClassManager: token<BodyClassManager>('bodyClassManager'),
  animationPerformanceOrchestrator: token<PerformanceAnimationOrchestrator>('animationPerformanceOrchestrator'),
  metricsAdapter: token<MetricsAdapter>('metricsAdapter'),
  performanceMetricsService: token<PerformanceMetricsService>('performanceMetricsService'),
  performanceMetricsOrchestrator: token<PerformanceMetricsOrchestrator>('performanceMetricsOrchestrator'),
  visibilityAdapter: token<VisibilityAdapter>('visibilityAdapter'),
  userActivityAdapter: token<UserActivityAdapter>('userActivityAdapter'),
  reducedMotionAdapter: token<ReducedMotionAdapter>('reducedMotionAdapter'),
  performanceStateService: token<PerformanceStateService>('performanceStateService'),
  performanceStateOrchestrator: token<PerformanceStateOrchestrator>('performanceStateOrchestrator'),
  appOrchestrator: token<AppOrchestrator>('appOrchestrator'),
  browserMediaService: token<BrowserMediaAdapter>('browserMediaService'),
  streamHealthService: token<StreamingHealthService>('streamHealthService'),
  viewportService: token<StreamingViewportService>('viewportService'),
  presentationModeService: token<PresentationModeService>('presentationModeService'),
  canvasLifecycleService: token<StreamingCanvasLifecycleService>('canvasLifecycleService'),
  captureUiBridge: token<CaptureUIBridge>('captureUiBridge'),
  transcodeUiBridge: token<TranscodeUIBridge>('transcodeUiBridge'),
  uiEventBridge: token<UIEventBridge>('uiEventBridge'),
  uiEffects: token<UIEffects>('uiEffects'),
  storageService: token<StorageServiceLike>('storageService'),
  deviceStatusPort: token<TrpcDeviceStatusPort>('deviceStatusPort'),
  mediaDevicesPort: token<BrowserMediaDevicesPort>('mediaDevicesPort'),
  devicePreferenceStore: token<StorageDevicePreferenceStore>('devicePreferenceStore'),
  presentationModeStore: token<PresentationModeStore>('presentationModeStore'),
  domBindings: token<DomBindings>('domBindings'),
  statusNotificationComponent: token<StatusNotificationComponent>('statusNotificationComponent'),
  deviceStatusComponent: token<DeviceStatusComponent>('deviceStatusComponent'),
  streamControlsComponent: token<StreamingControlsComponent>('streamControlsComponent'),
  transcodeToastComponent: token<TranscodeToastComponent>('transcodeToastComponent'),
  settingsMenuComponent: token<SettingsMenuComponent>('settingsMenuComponent'),
  shaderSelectorComponent: token<ShaderSelectorComponent>('shaderSelectorComponent'),
  notesPanelComponent: token<NotesPanelComponent>('notesPanelComponent'),
  uiComponentHost: token<UiComponentHost<RendererUiComponentInstanceMap>>('uiComponentHost'),
  uiController: token<UIController>('uiController')
} as const;

export type TokenKey = keyof typeof TOKENS;
export const TOKEN_KEYS = Object.keys(TOKENS) as readonly TokenKey[];
