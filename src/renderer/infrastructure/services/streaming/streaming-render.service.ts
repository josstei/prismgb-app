import { injectable, inject } from 'inversify';
import { BaseService } from '@platform/core';
import { EventChannels } from '@platform/events';
import { DeviceCatalog } from '@platform/devices';
import { getErrorMessage } from '@platform/core';
import type { TypedEventBusLike } from '@platform/events';
import type { LoggerFactoryLike } from '@platform/core';
import type { AppState } from '@renderer/application/state/app-state.js';
import type {
  Dimensions,
  StreamingCapabilities
} from '@renderer/infrastructure/services/streaming/streaming.contract.js';
import { createGpuVideoRendererSession, detectBrowserGpuCapabilities } from '@platform/gpu/runtime';
import type { GpuVideoRendererSession, GpuVideoRendererStats } from '@platform/gpu/runtime';
import type { RenderCapabilities } from '@platform/gpu';
import { TOKENS } from '@renderer/application/di/tokens.js';

type VideoFrameCallbackMetadata = {
  mediaTime: number;
};

type VideoFrameRequestCallback = (now: number, metadata: VideoFrameCallbackMetadata) => void;

type RenderableVideoElement = HTMLVideoElement & {
  requestVideoFrameCallback?(callback: VideoFrameRequestCallback): number;
  cancelVideoFrameCallback?(handle: number): void;
};

type AppStateLike = Pick<AppState, 'isStreaming'>;

type StreamViewServiceLike = {
  getVideo(): HTMLVideoElement;
  getCanvas(): HTMLCanvasElement;
};

type CanvasLifecycleServiceLike = {
  initialize(): void;
  handleCanvasExpired(): Promise<void>;
  handleFullscreenChange(): void;
  setupCanvasSize(nativeResolution?: Dimensions, useGpuCanvas?: boolean): void;
  recreateCanvas(): Promise<void>;
  cleanup(): void;
};

type StreamHealthServiceLike = {
  checkStreamHealth(
    videoElement: HTMLVideoElement,
    onHealthy: (frameData: Record<string, unknown>) => void,
    onTimeout: (errorData: { reason: string; [key: string]: unknown }) => void,
    timeoutMs: number
  ): void;
  cleanup(): void;
};

type SettingsServiceLike = {
  getNumberSetting(name: string): number;
  getStringSetting(name: string): string;
};

const BRIGHTNESS_SUBSCRIPTION_LIFECYCLE = Symbol('gpuBrightnessSubscription');

@injectable()
export class StreamingRenderService extends BaseService {
  private _currentCapabilities: StreamingCapabilities | null;
  private _session: GpuVideoRendererSession | null;
  private _isHidden: boolean;
  private _performanceModeEnabled: boolean;
  private _userPresetId: string | null;
  private _canvas2dContextCreated: boolean;
  private _cleanupPromise: Promise<void> | null;
  private _globalBrightness = 1.0;

  private _isRenderLoopActive = false;
  private _lastFrameTime = -1;
  private _videoElement: HTMLVideoElement | null = null;
  private _rvfcHandle: number | null = null;
  private _gpuCapabilities: RenderCapabilities | null = null;

  constructor(
    @inject(TOKENS.appState) private readonly appState: AppStateLike,
    @inject(TOKENS.streamViewService) private readonly streamViewService: StreamViewServiceLike,
    @inject(TOKENS.canvasLifecycleService) private readonly canvasLifecycleService: CanvasLifecycleServiceLike,
    @inject(TOKENS.streamHealthService) private readonly streamHealthService: StreamHealthServiceLike,
    @inject(TOKENS.settingsService) private readonly settingsService: SettingsServiceLike,
    @inject(TOKENS.eventBus) private readonly eventBus: TypedEventBusLike,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactoryLike
  ) {
    super({ loggerFactory, eventBus }, 'StreamingRenderService');

    this._currentCapabilities = null;
    this._session = null;
    this._isHidden = false;
    this._performanceModeEnabled = false;
    this._userPresetId = null;
    this._canvas2dContextCreated = false;
    this._cleanupPromise = null;
  }

  initialize(): void {
    this.canvasLifecycleService.initialize();

    this._globalBrightness = this.settingsService.getNumberSetting('globalBrightness') ?? 1.0;
    /**
     * Decision record: the brightness subscription is an `initialize()`-time
     * keyed subscribe, not an `@OnEvent` binding — `initialize()` re-runs per
     * canvas lifecycle and `replace()` swaps the prior subscription instead of
     * accumulating one per run.
     */
    this.disposables.replace(
      BRIGHTNESS_SUBSCRIPTION_LIFECYCLE,
      this.eventBus.subscribe(
        EventChannels.SETTINGS.BRIGHTNESS_CHANGED,
        (brightness) => {
          if (!Number.isFinite(brightness)) {
            this.logger.warn('Ignoring invalid brightness payload from event bus');
            return;
          }
          this._globalBrightness = brightness;
          if (this._session) {
            this._session.setBrightness(brightness);
          }
          this.logger.debug(`Global brightness updated to ${brightness.toFixed(2)}`);
        }
      )
    );
  }

  async handleCanvasExpired(): Promise<void> {
    await this.canvasLifecycleService.handleCanvasExpired();
  }

  handlePerformanceStateChanged(state: unknown): void {
    const hidden = (state as { hidden?: unknown } | null)?.hidden;
    if (typeof hidden !== 'boolean') {
      return;
    }

    if (hidden === this._isHidden) {
      return;
    }

    this._isHidden = hidden;
    if (this._isHidden) {
      this._handleHidden();
    } else {
      this._handleVisible();
    }
  }

  handleRenderPresetChanged(presetId: string): void {
    if (this._performanceModeEnabled) {
      this._userPresetId = presetId;
      this.logger.debug(`User selected ${presetId} preset - cached (performance mode active)`);
      return;
    }

    this._userPresetId = presetId;
    if (this._session) {
      this._session.setPreset(presetId);
    }
  }

  handleFullscreenChange(): void {
    this.canvasLifecycleService.handleFullscreenChange();
  }

  async handlePerformanceModeChanged(enabled: boolean): Promise<void> {
    this._performanceModeEnabled = enabled;

    if (enabled) {
      await this._handlePerformanceModeEnabled();
    } else {
      await this._handlePerformanceModeDisabled();
    }
  }

  async startPipeline(capabilities: StreamingCapabilities): Promise<void> {
    const video = this.streamViewService.getVideo();
    await this._waitForHealthyStream(video);
    await this._startRendering(capabilities);
  }

  stopPipeline(): void {
    this._stopRenderLoop();

    if (this._session) {
      const isGpu = this._session.backend === 'webgpu';

      if (isGpu) {
        this.eventBus.publish(EventChannels.PERFORMANCE.MEMORY_SNAPSHOT_REQUESTED, {
          label: 'before gpu release'
        });
      }

      this._session.terminate({ emitCanvasExpired: true });
      this._session = null;

      if (isGpu) {
        this.eventBus.publish(EventChannels.PERFORMANCE.MEMORY_SNAPSHOT_REQUESTED, {
          label: 'after gpu release',
          delayMs: 1000
        });
      }
    }
  }

  async cleanup(): Promise<void> {
    if (this._cleanupPromise) {
      return this._cleanupPromise;
    }

    this._cleanupPromise = this._cleanup();
    try {
      await this._cleanupPromise;
    } finally {
      this._cleanupPromise = null;
    }
  }

  private async _cleanup(): Promise<void> {
    this._performanceModeEnabled = false;
    this._userPresetId = null;

    this._stopRenderLoop();

    if (this._session) {
      this._session.terminate({ emitCanvasExpired: false });
      this._session = null;
    }

    this.canvasLifecycleService.cleanup();
    this.streamHealthService.cleanup();
  }

  override async dispose(): Promise<void> {
    await this.cleanup();
    await super.dispose();
  }

  private _handleVisible(): void {
    if (!this.appState.isStreaming || !this._session) {
      return;
    }

    const video = this.streamViewService.getVideo();
    if (!video) {
      return;
    }

    this._startRenderLoop(video);
    this.logger.debug(`${this._session.backend} rendering resumed (window visible)`);
  }

  private _handleHidden(): void {
    if (this.appState.isStreaming && this._session) {
      this._stopRenderLoop();
      this.logger.debug(`${this._session.backend} rendering paused (window hidden)`);
    }
  }

  private async _handlePerformanceModeEnabled(): Promise<void> {
    if (this.appState.isStreaming && this._session && this._session.backend === 'webgpu' && this._session.isActive) {
      const currentPresetId = this._userPresetId;
      if (currentPresetId && currentPresetId !== 'performance') {
        this._userPresetId = currentPresetId;
      }

      await this._switchToCanvas2DMidStream();
      this.logger.info('Performance mode enabled mid-stream - switched to Canvas2D renderer');
      return;
    }

    if (this._session && this._session.backend === 'webgpu') {
      this.logger.info('Performance mode enabled - terminating GPU worker for Canvas2D on next stream');
      this._session.terminate({ emitCanvasExpired: true });
      this._session = null;
    }
  }

  private async _handlePerformanceModeDisabled(): Promise<void> {
    if (this._session && this._session.backend === 'webgpu' && this._session.isActive && this._userPresetId) {
      this._session.setPreset(this._userPresetId);
      this.logger.info(`Performance mode disabled - restored ${this._userPresetId} preset`);
      this._userPresetId = null;
    }

    if (this.appState.isStreaming && this._session && this._session.backend === 'canvas2d') {
      await this._switchToGPUMidStream();
      return;
    }

    if (this._canvas2dContextCreated && !this.appState.isStreaming) {
      this.logger.info('Performance mode disabled - recreating canvas for GPU');
      await this.canvasLifecycleService.recreateCanvas();
      this.canvasLifecycleService.setupCanvasSize();
      this._session = null;
      this._canvas2dContextCreated = false;
    }
  }

  private _waitForHealthyStream(videoElement: HTMLVideoElement): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.streamHealthService.checkStreamHealth(
        videoElement,
        (frameData) => {
          this.logger.info('Stream verified healthy - first frame received');
          this.eventBus.publish(EventChannels.STREAM.HEALTH_OK, frameData);
          resolve();
        },
        (errorData) => {
          this.logger.warn(`Stream unhealthy: ${errorData.reason}`);
          this.eventBus.publish(EventChannels.STREAM.HEALTH_TIMEOUT, errorData);
          const error = new Error(`No frames received: ${errorData.reason}`) as Error & { reason?: string };
          error.reason = errorData.reason;
          reject(error);
        },
        4000
      );
    });
  }

  private async _resolveGpuCapabilities(): Promise<RenderCapabilities> {
    if (!this._gpuCapabilities) {
      this._gpuCapabilities = await detectBrowserGpuCapabilities();
      this.logger.info(
        `GPU capabilities: webgpu=${this._gpuCapabilities.webgpu}, `
        + `offscreenTransfer=${this._gpuCapabilities.transferControlToOffscreen}, `
        + `backend=${this._gpuCapabilities.preferredBackend}`
      );
    }
    return this._gpuCapabilities;
  }

  private async _startRendering(capabilities: StreamingCapabilities): Promise<void> {
    this._currentCapabilities = capabilities;
    const nativeRes = capabilities?.nativeResolution || DeviceCatalog.nativeResolution();
    const video = this.streamViewService.getVideo();

    const gpuCapabilities = await this._resolveGpuCapabilities();
    const useGpu = gpuCapabilities.webgpu && !this._performanceModeEnabled;

    this.canvasLifecycleService.setupCanvasSize(nativeRes, useGpu);

    const canvasHasContext = this._canvas2dContextCreated;

    if (useGpu && canvasHasContext) {
      this.logger.info('Recreating canvas before GPU init (canvas has 2D context)');
      await this.canvasLifecycleService.recreateCanvas();
      this.canvasLifecycleService.setupCanvasSize(nativeRes, true);
      this._canvas2dContextCreated = false;
    }

    const canvas = this.streamViewService.getCanvas();

    const savedPresetId = this.settingsService.getStringSetting('renderPreset') || 'vibrant';
    this._userPresetId = savedPresetId;

    try {
      const session = await createGpuVideoRendererSession({
        canvas,
        nativeResolution: nativeRes,
        preferredBackend: useGpu ? 'webgpu' : 'canvas2d',
        presetId: this._performanceModeEnabled ? 'performance' : savedPresetId,
        brightness: this._globalBrightness,
        allowCanvas2D: true,
        capabilities: {
          webgpu: gpuCapabilities.webgpu,
          offscreenCanvas: gpuCapabilities.offscreenCanvas,
          transferControlToOffscreen: gpuCapabilities.transferControlToOffscreen,
          preferredBackend: gpuCapabilities.webgpu ? 'webgpu' : 'canvas2d',
          maxTextureSize: gpuCapabilities.maxTextureSize
        },
        onReady: (event) => {
          this.logger.info(`Session ready (backend: ${event.backend})`);
          this.eventBus.publish(EventChannels.RENDER.PIPELINE_READY, event);
        },
        onStats: (payload) => {
          this._publishRenderStats(payload);
        },
        onError: (payload) => {
          this.logger.error('Session error:', payload.message);
          this.eventBus.publish(EventChannels.RENDER.PIPELINE_ERROR, payload);
        },
        onCanvasExpired: () => {
          this.eventBus.publish(EventChannels.RENDER.CANVAS_EXPIRED);
        },
        logger: this.logger
      });

      this._session = session;
      this._canvas2dContextCreated = session.backend === 'canvas2d';

      this._startRenderLoop(video);
    } catch (error) {
      this.logger.error('Failed to initialize session:', getErrorMessage(error));
      throw error;
    }
  }

  private async _switchToCanvas2DMidStream(): Promise<void> {
    const video = this.streamViewService.getVideo();
    this._stopRenderLoop();

    if (this._session) {
      this._session.terminate({ emitCanvasExpired: false });
      this._session = null;
    }

    await this.canvasLifecycleService.recreateCanvas();
    this._canvas2dContextCreated = false;

    const nativeRes = this._currentCapabilities?.nativeResolution || DeviceCatalog.nativeResolution();
    this.canvasLifecycleService.setupCanvasSize(nativeRes, false);

    const canvas = this.streamViewService.getCanvas();
    await this._startCanvas2DRendering(canvas, video, nativeRes);
  }

  private async _switchToGPUMidStream(): Promise<void> {
    const video = this.streamViewService.getVideo();
    this._stopRenderLoop();

    if (this._session) {
      this._session.terminate({ emitCanvasExpired: false });
      this._session = null;
    }

    await this.canvasLifecycleService.recreateCanvas();
    this._canvas2dContextCreated = false;

    const nativeRes = this._currentCapabilities?.nativeResolution || DeviceCatalog.nativeResolution();
    this.canvasLifecycleService.setupCanvasSize(nativeRes, true);

    const canvas = this.streamViewService.getCanvas();

    try {
      const gpuCapabilities = await this._resolveGpuCapabilities();
      const session = await createGpuVideoRendererSession({
        canvas,
        nativeResolution: nativeRes,
        preferredBackend: 'webgpu',
        presetId: this._userPresetId || 'vibrant',
        brightness: this._globalBrightness,
        allowCanvas2D: true,
        capabilities: {
          webgpu: gpuCapabilities.webgpu,
          offscreenCanvas: gpuCapabilities.offscreenCanvas,
          transferControlToOffscreen: gpuCapabilities.transferControlToOffscreen,
          preferredBackend: gpuCapabilities.webgpu ? 'webgpu' : 'canvas2d',
          maxTextureSize: gpuCapabilities.maxTextureSize
        },
        onReady: (event) => {
          this.logger.info(`Session ready (backend: ${event.backend})`);
          this.eventBus.publish(EventChannels.RENDER.PIPELINE_READY, event);
        },
        onStats: (payload) => {
          this._publishRenderStats(payload);
        },
        onError: (payload) => {
          this.logger.error('Session error:', payload.message);
          this.eventBus.publish(EventChannels.RENDER.PIPELINE_ERROR, payload);
        },
        onCanvasExpired: () => {
          this.eventBus.publish(EventChannels.RENDER.CANVAS_EXPIRED);
        },
        logger: this.logger
      });

      this._session = session;
      this._startRenderLoop(video);

      if (this._userPresetId) {
        this._session.setPreset(this._userPresetId);
        this.logger.info(`Performance mode disabled mid-stream - switched to GPU with ${this._userPresetId} preset`);
        this._userPresetId = null;
      }
    } catch (error) {
      this.logger.warn('GPU initialization failed mid-stream, staying on Canvas2D:', getErrorMessage(error));
      await this._startCanvas2DRendering(canvas, video, nativeRes);
    }
  }

  private async _startCanvas2DRendering(
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    nativeRes: Dimensions
  ): Promise<void> {
    try {
      const session = await createGpuVideoRendererSession({
        canvas,
        nativeResolution: nativeRes,
        preferredBackend: 'canvas2d',
        presetId: 'performance',
        brightness: this._globalBrightness,
        allowCanvas2D: true,
        capabilities: {
          webgpu: false,
          offscreenCanvas: false,
          transferControlToOffscreen: false,
          preferredBackend: 'canvas2d',
          maxTextureSize: 4096
        },
        onReady: (event) => {
          this.logger.info(`Session ready (backend: ${event.backend})`);
          this.eventBus.publish(EventChannels.RENDER.PIPELINE_READY, event);
        },
        logger: this.logger
      });

      this._session = session;
      this._canvas2dContextCreated = true;
      this._startRenderLoop(video);
    } catch (error) {
      this.logger.error('Canvas2D fallback initialization failed:', getErrorMessage(error));
      throw error;
    }
  }

  isCanvasTransferred(): boolean {
    return this._session?.isCanvasTransferred ?? false;
  }

  isActive(): boolean {
    return this._session?.isActive ?? false;
  }

  isFallback(): boolean {
    return this._session?.backend === 'canvas2d';
  }

  resize(width: number, height: number): void {
    if (this._session) {
      this._session.resize(width, height);
    }
  }

  async resetCanvasState(): Promise<void> {
    this._stopRenderLoop();
    if (this._session) {
      this._session.terminate({ emitCanvasExpired: false });
      this._session = null;
    }
  }

  captureFrame(): Promise<ImageBitmap> {
    if (!this._session) {
      throw new Error('No active rendering session');
    }
    return this._session.captureFrame();
  }

  getTargetDimensions(): { width: number; height: number } {
    if (!this._session) {
      const native = DeviceCatalog.nativeResolution();
      return { width: native.width, height: native.height };
    }
    return this._session.getTargetDimensions();
  }

  private _publishRenderStats(stats: GpuVideoRendererStats): void {
    this.eventBus.publish(EventChannels.RENDER.STATS_UPDATE, {
      fps: stats.fps,
      frameTime: stats.frameTime,
      gpuTime: stats.gpuTime,
      uploadTime: stats.uploadTime
    });
  }

  private _startRenderLoop(video: HTMLVideoElement): void {
    this._stopRenderLoop();
    this._isRenderLoopActive = true;
    this._lastFrameTime = -1;
    this._videoElement = video;

    const scheduleFrame = () => {
      if (!this._isRenderLoopActive || !this._videoElement) return;
      const target = this._videoElement as RenderableVideoElement;
      if (typeof target.requestVideoFrameCallback === 'function') {
        this._rvfcHandle = target.requestVideoFrameCallback(renderLoop);
      }
    };

    const renderLoop = async (now: number, metadata?: VideoFrameCallbackMetadata) => {
      this._rvfcHandle = null;
      if (!this._isRenderLoopActive || !this._videoElement || !this._session) return;

      const frameTime = metadata?.mediaTime ?? now;
      if (frameTime !== this._lastFrameTime && this._videoElement.readyState >= this._videoElement.HAVE_CURRENT_DATA) {
        await this._session.renderFrame(this._videoElement);
        this._lastFrameTime = frameTime;
      }

      if (this.appState.isStreaming && !this._isHidden) {
        scheduleFrame();
      } else {
        this._stopRenderLoop();
      }
    };

    scheduleFrame();
  }

  private _stopRenderLoop(): void {
    this._isRenderLoopActive = false;
    if (this._videoElement && this._rvfcHandle !== null) {
      const target = this._videoElement as RenderableVideoElement;
      target.cancelVideoFrameCallback?.(this._rvfcHandle);
    }
    this._rvfcHandle = null;
    this._videoElement = null;
  }
}
