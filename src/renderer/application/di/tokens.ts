import type { ServiceIdentifier } from 'inversify';
import type { LoggerFactory, KeyValueStore } from '@platform/core';
import type { EventBus } from '../../lib/events/event-bus';
import type { RendererDeviceRuntime } from '../../infrastructure/services/devices/device-runtime.service';
import type { NotesService } from '../../infrastructure/services/notes/notes.service';
import type { DeviceMediaAcquirer } from '../../infrastructure/services/streaming/device-media-acquirer.service';
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
import type { BodyClassEffect } from '../../presentation/effects/body-class.effect';
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
import type { BrowserMediaAdapter } from '../../infrastructure/adapters/browser-media.adapter';
import type { StreamingHealthService } from '../../infrastructure/services/platform/health.service';
import type { StreamingViewportService } from '../../infrastructure/services/platform/viewport.service';
import type { StreamingCanvasLifecycleService } from '../../infrastructure/services/streaming/canvas-lifecycle.service';
import type { UiEventBridge } from '../../presentation/bridges/ui-event.bridge';
import type { AutoHideEffect } from '../../presentation/effects/auto-hide.effect';
import type { FeedbackEffect } from '../../presentation/effects/feedback.effect';
import type { TrpcDeviceStatusPort } from '../../infrastructure/services/devices/trpc-device-status.port';
import type { BrowserMediaDevicesPort } from '../../infrastructure/services/devices/browser-media-devices.port';
import type { StorageDevicePreferenceStore } from '../../infrastructure/services/devices/storage-device-preference.store';
import type { UiComponentHost } from '../../presentation/ui-component.host';
import type { DomBindings } from '../../presentation/primitives/dom-bindings.utils';
import type { StatusNotificationComponent } from '../../presentation/shared/status-notification.component';
import type { DeviceStatusComponent } from '../../presentation/shared/device-status.component';
import type { StreamingControlsComponent } from '../../presentation/features/streaming/streaming-controls.component';
import type { TranscodeProgressComponent } from '../../presentation/features/toolbar/transcode-progress.component';
import type { SettingsMenuComponent } from '../../presentation/features/settings/settings-menu.component';
import type { ShaderSelectorComponent } from '../../presentation/features/toolbar/shader-selector.component';
import type { NotesPanelComponent } from '../../presentation/features/notes/notes-panel.component';

function token<T>(name: string): ServiceIdentifier<T> {
  return Symbol.for(name) as ServiceIdentifier<T>;
}

export const TOKENS = {
  eventBus: token<EventBus>('eventBus'),
  loggerFactory: token<LoggerFactory>('loggerFactory'),
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
  bodyClassEffect: token<BodyClassEffect>('bodyClassEffect'),
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
  canvasLifecycleService: token<StreamingCanvasLifecycleService>('canvasLifecycleService'),
  uiEventBridge: token<UiEventBridge>('uiEventBridge'),
  autoHideEffect: token<AutoHideEffect>('autoHideEffect'),
  feedbackEffect: token<FeedbackEffect>('feedbackEffect'),
  storageService: token<KeyValueStore>('storageService'),
  deviceStatusPort: token<TrpcDeviceStatusPort>('deviceStatusPort'),
  mediaDevicesPort: token<BrowserMediaDevicesPort>('mediaDevicesPort'),
  devicePreferenceStore: token<StorageDevicePreferenceStore>('devicePreferenceStore'),
  domBindings: token<DomBindings>('domBindings'),
  statusNotificationComponent: token<StatusNotificationComponent>('statusNotificationComponent'),
  deviceStatusComponent: token<DeviceStatusComponent>('deviceStatusComponent'),
  streamingControlsComponent: token<StreamingControlsComponent>('streamingControlsComponent'),
  transcodeProgressComponent: token<TranscodeProgressComponent>('transcodeProgressComponent'),
  settingsMenuComponent: token<SettingsMenuComponent>('settingsMenuComponent'),
  shaderSelectorComponent: token<ShaderSelectorComponent>('shaderSelectorComponent'),
  notesPanelComponent: token<NotesPanelComponent>('notesPanelComponent'),
  uiComponentHost: token<UiComponentHost>('uiComponentHost')
} as const;

export type TokenKey = keyof typeof TOKENS;
export const TOKEN_KEYS = Object.keys(TOKENS) as readonly TokenKey[];
