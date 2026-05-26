import type { AppOrchestrator } from '@renderer/application/orchestrators/app.orchestrator';
import type { CaptureOrchestrator } from '@renderer/application/orchestrators/capture.orchestrator';
import type { DeviceOrchestrator } from '@renderer/application/orchestrators/device.orchestrator';
import type { SettingsDisplayModeOrchestrator } from '@renderer/application/orchestrators/display-mode.orchestrator';
import type { PerformanceAnimationOrchestrator } from '@renderer/application/orchestrators/performance-animation.orchestrator';
import type { PerformanceMetricsOrchestrator } from '@renderer/application/orchestrators/performance-metrics.orchestrator';
import type { PerformanceStateOrchestrator } from '@renderer/application/orchestrators/performance-state.orchestrator';
import type { SettingsPreferencesOrchestrator } from '@renderer/application/orchestrators/preferences.orchestrator';
import type { StreamingAudioOrchestrator } from '@renderer/application/orchestrators/streaming-audio.orchestrator';
import type { StreamingOrchestrator } from '@renderer/application/orchestrators/streaming.orchestrator';
import type { UISetupOrchestrator } from '@renderer/application/orchestrators/ui-setup.orchestrator';
import type { UpdateOrchestrator } from '@renderer/application/orchestrators/update.orchestrator';
import type { AppState } from '@renderer/application/state/app-state';
import type { DeviceChangeDebounceAdapter } from '@renderer/infrastructure/adapters/devices/device-change-debounce.adapter';
import type { DeviceIpcAdapter } from '@renderer/infrastructure/adapters/devices/device-ipc.adapter';
import type { StreamingAdapterFactory } from '@renderer/infrastructure/factories/streaming-adapter.factory';
import type { StreamingRendererFactory } from '@renderer/infrastructure/factories/streaming-renderer.factory';
import type { ReducedMotionAdapter } from '@renderer/infrastructure/adapters/reduced-motion.adapter.js';
import type { UserActivityAdapter } from '@renderer/infrastructure/adapters/user-activity.adapter.js';
import type { VisibilityAdapter } from '@renderer/infrastructure/adapters/visibility.adapter.js';
import type { MetricsAdapter } from '@renderer/infrastructure/adapters/platform/metrics.adapter';
import type { DeviceIpcStatusAdapter } from '@renderer/infrastructure/adapters/devices/device-ipc-status.adapter';
import type { RendererLogger } from '@renderer/infrastructure/logging/logger.factory.js';
import type { CaptureGpuRecordingService, CaptureSaveService, CaptureService } from '@renderer/infrastructure/services/capture';
import type { DeviceConnectionService, DeviceMediaService, DeviceOperationSequencerService, DeviceService, DeviceStorageService } from '@renderer/infrastructure/services/devices';
import type { NotesService } from '@renderer/infrastructure/services/notes';
import type { PerformanceAnimationService } from '@renderer/infrastructure/services/performance/performance-animation.service';
import type { PerformanceMetricsService } from '@renderer/infrastructure/services/performance/performance-metrics.service';
import type { PerformanceStateService } from '@renderer/infrastructure/services/performance/performance-state.service';
import type { PresentationModeService, SettingsCinematicModeService, SettingsFullscreenService, SettingsService } from '@renderer/infrastructure/services/settings';
import type { GpuFrameBuffer, GpuWorkerManager, StreamingAudioPipelineService, StreamingCanvasLifecycleService, StreamingCanvasRenderLoopService, StreamingGpuRendererService, StreamingGpuRenderLoopService, StreamingHealthService, StreamingRenderPipelineService, StreamingService, StreamingViewService, StreamingViewportService } from '@renderer/infrastructure/services/streaming';
import type { TranscodeService } from '@renderer/infrastructure/services/transcode/transcode.service';
import type { UpdateService, UpdateUiService } from '@renderer/infrastructure/services/updates';
import type { UIController } from '@renderer/presentation/controller/ui.controller.js';
import type { UIComponentRegistry } from '@renderer/presentation/controller/component.registry.js';
import type { RendererUiComponentCatalog } from '@renderer/presentation/controller/ui-component.catalog.js';
import type { UIEffects } from '@renderer/presentation/effects/ui-effects.class';
import type { BodyClassManager } from '@renderer/presentation/effects/body-class.class';
import type { UIEventBridge } from '@renderer/presentation/bridges/ui-event.bridge';
import type { CaptureUIBridge } from '@renderer/presentation/bridges/capture-ui.bridge';
import type { TranscodeUIBridge } from '@renderer/presentation/bridges/transcode-ui.bridge';
import type { EventBusLike, LoggerFactoryLike, StorageServiceLike } from '@shared/interfaces/infrastructure.types.js';
import type { DeviceStatusPayload } from '@shared/ipc/preload-api.contract.js';

export interface BrowserMediaServiceLike {
  enumerateDevices(): Promise<MediaDeviceInfo[]>;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  addEventListener(event: 'devicechange', handler: () => void): void;
  removeEventListener(event: 'devicechange', handler: () => void): void;
}

export interface AnimationCacheLike {
  cancelAnimation(name: string): void;
  cancelAllAnimations(): void;
}

export interface RendererDeviceIpcClient {
  getDeviceStatus(): Promise<DeviceStatusPayload>;
}

export interface RendererContainerMap {
  eventBus: EventBusLike;
  loggerFactory: RendererLogger & LoggerFactoryLike;
  storageService: StorageServiceLike;
  browserMediaService: BrowserMediaServiceLike;
  visibilityAdapter: VisibilityAdapter;
  userActivityAdapter: UserActivityAdapter;
  reducedMotionAdapter: ReducedMotionAdapter;
  metricsAdapter: MetricsAdapter;
  deviceIpcAdapter: DeviceIpcAdapter;
  deviceChangeDebounceAdapter: DeviceChangeDebounceAdapter;
  animationCache: AnimationCacheLike;
  canvasRenderLoopService: StreamingCanvasRenderLoopService;
  viewportService: StreamingViewportService;
  canvasLifecycleService: StreamingCanvasLifecycleService;
  gpuRenderLoopService: StreamingGpuRenderLoopService;
  streamHealthService: StreamingHealthService;
  gpuFrameBuffer: GpuFrameBuffer;
  gpuWorkerManager: GpuWorkerManager;
  gpuRendererService: StreamingGpuRendererService;
  streamingRendererFactory: StreamingRendererFactory;
  renderPipelineService: StreamingRenderPipelineService;
  ipcClient: RendererDeviceIpcClient;
  deviceStatusProvider: DeviceIpcStatusAdapter;
  adapterFactory: StreamingAdapterFactory;
  deviceStorageService: DeviceStorageService;
  deviceConnectionService: DeviceConnectionService;
  deviceMediaService: DeviceMediaService;
  deviceService: DeviceService;
  deviceOperationSequencer: DeviceOperationSequencerService;
  streamingService: StreamingService;
  captureService: CaptureService;
  gpuRecordingService: CaptureGpuRecordingService;
  transcodeService: TranscodeService;
  captureSaveService: CaptureSaveService;
  settingsService: SettingsService;
  notesService: NotesService;
  updateService: UpdateService;
  updateUiService: UpdateUiService;
  streamViewService: StreamingViewService;
  streamingAudioPipelineService: StreamingAudioPipelineService;
  appState: AppState;
  uiComponentRegistry: UIComponentRegistry<RendererUiComponentCatalog>;
  uiEffects: UIEffects;
  bodyClassManager: BodyClassManager;
  uiEventBridge: UIEventBridge;
  presentationModeService: PresentationModeService;
  captureUiBridge: CaptureUIBridge;
  transcodeUiBridge: TranscodeUIBridge;
  deviceOrchestrator: DeviceOrchestrator;
  streamingAudioOrchestrator: StreamingAudioOrchestrator;
  streamingOrchestrator: StreamingOrchestrator;
  captureOrchestrator: CaptureOrchestrator;
  preferencesOrchestrator: SettingsPreferencesOrchestrator;
  fullscreenService: SettingsFullscreenService;
  cinematicModeService: SettingsCinematicModeService;
  displayModeOrchestrator: SettingsDisplayModeOrchestrator;
  updateOrchestrator: UpdateOrchestrator;
  performanceStateOrchestrator: PerformanceStateOrchestrator;
  animationPerformanceOrchestrator: PerformanceAnimationOrchestrator;
  performanceMetricsService: PerformanceMetricsService;
  performanceStateService: PerformanceStateService;
  animationPerformanceService: PerformanceAnimationService;
  performanceMetricsOrchestrator: PerformanceMetricsOrchestrator;
  uiSetupOrchestrator: UISetupOrchestrator;
  appOrchestrator: AppOrchestrator;
  uiController: UIController;
}
