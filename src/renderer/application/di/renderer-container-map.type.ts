import type { AppOrchestrator } from '@renderer/application/orchestrators/app.orchestrator';
import type { AppState } from '@renderer/application/state/app-state';
import type { RendererLogger } from '@renderer/infrastructure/logging/logger.factory.js';
import type { TranscodeService } from '@renderer/infrastructure/services/transcode/transcode.service';
import type { UIController } from '@renderer/presentation/controller/ui.controller.js';
import type { UIComponentRegistry } from '@renderer/presentation/controller/component.registry.js';
import type { UIEffects } from '@renderer/presentation/effects/ui-effects.class';
import type { BodyClassManager } from '@renderer/presentation/effects/body-class.class';
import type { UIEventBridge } from '@renderer/presentation/bridges/ui-event.bridge';
import type { CaptureUIBridge } from '@renderer/presentation/bridges/capture-ui.bridge';
import type { TranscodeUIBridge } from '@renderer/presentation/bridges/transcode-ui.bridge';
import type { EventBusLike, LoggerFactoryLike } from '@shared/interfaces/infrastructure.types.js';
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
  storageService: unknown;
  browserMediaService: BrowserMediaServiceLike;
  visibilityAdapter: unknown;
  userActivityAdapter: unknown;
  reducedMotionAdapter: unknown;
  metricsAdapter: unknown;
  deviceIpcAdapter: unknown;
  deviceChangeDebounceAdapter: unknown;
  animationCache: AnimationCacheLike;
  canvasRenderer: unknown;
  viewportService: unknown;
  canvasLifecycleService: unknown;
  gpuRenderLoopService: unknown;
  streamHealthService: unknown;
  gpuFrameBuffer: unknown;
  gpuWorkerManager: unknown;
  gpuRendererService: unknown;
  streamingRendererFactory: unknown;
  renderPipelineService: unknown;
  ipcClient: RendererDeviceIpcClient;
  deviceStatusProvider: unknown;
  adapterFactory: unknown;
  deviceStorageService: unknown;
  deviceConnectionService: unknown;
  deviceMediaService: unknown;
  deviceService: unknown;
  deviceOperationSequencer: unknown;
  streamingService: unknown;
  captureService: unknown;
  gpuRecordingService: unknown;
  transcodeService: TranscodeService;
  captureSaveService: unknown;
  settingsService: unknown;
  notesService: unknown;
  updateService: unknown;
  updateUiService: unknown;
  streamViewService: unknown;
  streamingAudioPipelineService: unknown;
  appState: AppState;
  uiComponentRegistry: UIComponentRegistry;
  uiEffects: UIEffects;
  bodyClassManager: BodyClassManager;
  uiEventBridge: UIEventBridge;
  presentationModeService: unknown;
  captureUiBridge: CaptureUIBridge;
  transcodeUiBridge: TranscodeUIBridge;
  deviceOrchestrator: unknown;
  streamingAudioOrchestrator: unknown;
  streamingOrchestrator: unknown;
  captureOrchestrator: unknown;
  preferencesOrchestrator: unknown;
  fullscreenService: unknown;
  cinematicModeService: unknown;
  displayModeOrchestrator: unknown;
  updateOrchestrator: unknown;
  performanceStateOrchestrator: unknown;
  animationPerformanceOrchestrator: unknown;
  performanceMetricsService: unknown;
  performanceStateService: unknown;
  animationPerformanceService: unknown;
  performanceMetricsOrchestrator: unknown;
  uiSetupOrchestrator: unknown;
  appOrchestrator: AppOrchestrator;
  uiController: UIController;
}
