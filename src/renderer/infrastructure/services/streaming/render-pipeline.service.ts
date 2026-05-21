/**
 * Render Pipeline Service
 *
 * Orchestrates rendering strategy selection and lifecycle.
 * Uses Strategy pattern via IStreamingRenderer interface for GPU/Canvas2D rendering.
 *
 * Responsibilities:
 * - Select appropriate renderer (GPU or Canvas2D) based on capabilities
 * - Manage renderer lifecycle (start/stop/pause/resume)
 * - Handle performance mode transitions
 * - Coordinate canvas lifecycle and stream health
 */

import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@shared/events/event-channels.js';
import { getDefaultNativeResolution } from '@shared/features/devices/device-defaults.js';
import { getErrorMessage } from '@shared/lib/errors/error-guards.js';
import type { TypedEventBusLike } from '@shared/events/event-payloads.js';
import type { LoggerFactoryLike, LoggerLike } from '@shared/interfaces/infrastructure.types.js';
import type {
  Dimensions,
  StreamingCapabilities
} from '@renderer/infrastructure/streaming/streaming-contracts.js';
import { isPerformanceStatePayload } from '@renderer/infrastructure/streaming/streaming-contracts.js';

type RendererType = 'gpu' | 'canvas2d';

type StreamingRendererLike = {
  initialize(canvasElement: HTMLCanvasElement, nativeResolution?: Dimensions): Promise<boolean>;
  renderFrame(videoElement: HTMLVideoElement): Promise<void>;
  resize(width: number, height: number): void;
  isActive(): boolean;
  pause(videoElement: HTMLVideoElement): void;
  resume(videoElement: HTMLVideoElement): void;
  cleanup(): void | Promise<void>;
  handlePipelineStop(): void;
  supportsPresets(): boolean;
  getPresetId(): string | null;
  setPreset(presetId: string): void;
  isCanvasTransferred(): boolean;
  releaseGpuResources(): void;
  terminateAndReset(emitCanvasExpired?: boolean): void;
  setHiddenStateFn(fn: () => boolean): void;
};

type AppStateLike = {
  isStreaming: boolean;
};

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

type StreamingRendererFactoryLike = {
  selectRendererType(
    capabilities: StreamingCapabilities,
    performanceModeEnabled: boolean,
    gpuAvailable: boolean
  ): RendererType;
  createRenderer(type: RendererType, dependencies: Record<string, unknown>): StreamingRendererLike;
};

type CanvasRenderLoopServiceLike = {
  hasContextFor(canvas: HTMLCanvasElement): boolean;
  cleanup(): Promise<void>;
};

type GpuRendererServiceLike = {
  isCanvasTransferred(): boolean;
  terminateAndReset(emitCanvasExpired?: boolean): void;
};

type GpuRenderLoopServiceLike = Record<string, unknown>;

type RenderPipelineDependencies = {
  appState: AppStateLike;
  streamViewService: StreamViewServiceLike;
  canvasLifecycleService: CanvasLifecycleServiceLike;
  streamHealthService: StreamHealthServiceLike;
  streamingRendererFactory: StreamingRendererFactoryLike;
  gpuRendererService: GpuRendererServiceLike;
  gpuRenderLoopService: GpuRenderLoopServiceLike;
  canvasRenderLoopService: CanvasRenderLoopServiceLike;
  eventBus: TypedEventBusLike;
  loggerFactory: LoggerFactoryLike;
};

export class StreamingRenderPipelineService extends BaseService {
  declare protected readonly appState: AppStateLike;
  declare protected readonly streamViewService: StreamViewServiceLike;
  declare protected readonly canvasLifecycleService: CanvasLifecycleServiceLike;
  declare protected readonly streamHealthService: StreamHealthServiceLike;
  declare protected readonly streamingRendererFactory: StreamingRendererFactoryLike;
  declare protected readonly gpuRendererService: GpuRendererServiceLike;
  declare protected readonly gpuRenderLoopService: GpuRenderLoopServiceLike;
  declare protected readonly canvasRenderLoopService: CanvasRenderLoopServiceLike;
  declare protected readonly eventBus: TypedEventBusLike;
  declare protected readonly logger: LoggerLike;

  private _currentCapabilities: StreamingCapabilities | null;
  private _activeRenderer: StreamingRendererLike | null;
  private _activeRendererType: RendererType | null;
  private _isHidden: boolean;
  private _performanceModeEnabled: boolean;
  private _userPresetId: string | null;
  private _canvas2dContextCreated: boolean;

  constructor(dependencies: RenderPipelineDependencies) {
    super(
      dependencies,
      [
        'appState',
        'streamViewService',
        'canvasLifecycleService',
        'streamHealthService',
        'streamingRendererFactory',
        'gpuRendererService',
        'gpuRenderLoopService',
        'canvasRenderLoopService',
        'eventBus',
        'loggerFactory'
      ],
      'StreamingRenderPipelineService'
    );

    // Current capabilities for renderer selection
    this._currentCapabilities = null;

    // Active renderer strategy (IStreamingRenderer)
    this._activeRenderer = null;
    this._activeRendererType = null;

    // State tracking
    this._isHidden = false;
    this._performanceModeEnabled = false;
    this._userPresetId = null;
    this._canvas2dContextCreated = false;
  }

  initialize(): void {
    this.canvasLifecycleService.initialize();
  }

  async handleCanvasExpired(): Promise<void> {
    await this.canvasLifecycleService.handleCanvasExpired();
  }

  handlePerformanceStateChanged(state: unknown): void {
    if (!isPerformanceStatePayload(state) || typeof state.hidden !== 'boolean') {
      return;
    }

    if (state.hidden === this._isHidden) {
      return;
    }

    this._isHidden = state.hidden;
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

    if (this._activeRenderer?.supportsPresets() && this._activeRenderer.isActive()) {
      this._activeRenderer.setPreset(presetId);
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
    const video = this.streamViewService.getVideo();

    if (this._activeRenderer) {
      this._activeRenderer.pause(video);

      // Renderer-specific stop handling (Canvas2D clears, GPU is no-op)
      this._activeRenderer.handlePipelineStop();

      // GPU-specific cleanup - terminates worker and recreates canvas
      if (this._activeRendererType === 'gpu') {
        this.eventBus.publish(EventChannels.PERFORMANCE.MEMORY_SNAPSHOT_REQUESTED, {
          label: 'before gpu release'
        });
        this._activeRenderer.terminateAndReset();
        this.eventBus.publish(EventChannels.PERFORMANCE.MEMORY_SNAPSHOT_REQUESTED, {
          label: 'after gpu release',
          delayMs: 1000
        });
      }
    }

    this._activeRenderer = null;
    this._activeRendererType = null;
  }

  async cleanup(): Promise<void> {
    this._performanceModeEnabled = false;
    this._userPresetId = null;
    const activeRendererType = this._activeRendererType;

    if (this._activeRenderer) {
      const video = this.streamViewService.getVideo();
      this._activeRenderer.pause(video);
      await this._activeRenderer.cleanup();
      this._activeRenderer = null;
      this._activeRendererType = null;
    }

    if (activeRendererType !== 'canvas2d') {
      await this.canvasRenderLoopService.cleanup();
    }
    this.canvasLifecycleService.cleanup();
    this.streamHealthService.cleanup();
  }

  // ============================
  // Private methods
  // ============================

  private _handleVisible(): void {
    if (this.appState.isStreaming && this._activeRenderer) {
      const video = this.streamViewService.getVideo();
      this._activeRenderer.resume(video);
      this.logger.debug(`${this._activeRendererType} rendering resumed (window visible)`);
    }
  }

  private _handleHidden(): void {
    if (this.appState.isStreaming && this._activeRenderer) {
      const video = this.streamViewService.getVideo();
      this._activeRenderer.pause(video);
      this.logger.debug(`${this._activeRendererType} rendering paused (window hidden)`);
    }
  }

  private async _handlePerformanceModeEnabled(): Promise<void> {
    // Cache user preset if GPU is active
    if (this.appState.isStreaming && this._activeRendererType === 'gpu' && this._activeRenderer?.isActive()) {
      const currentPresetId = this._activeRenderer.getPresetId();
      if (currentPresetId !== 'performance') {
        this._userPresetId = currentPresetId;
      }

      // Switch to Canvas2D mid-stream
      await this._switchToCanvas2DMidStream();
      this.logger.info('Performance mode enabled mid-stream - switched to Canvas2D renderer');
      return;
    }

    // Terminate GPU worker if not streaming but GPU was initialized
    if (this._activeRendererType === 'gpu') {
      this.logger.info('Performance mode enabled - terminating GPU worker for Canvas2D on next stream');
      this._activeRenderer?.terminateAndReset();
      this._activeRenderer = null;
      this._activeRendererType = null;
    }
  }

  private async _handlePerformanceModeDisabled(): Promise<void> {
    // Restore preset if GPU is already active
    if (this._activeRendererType === 'gpu' && this._activeRenderer?.isActive() && this._userPresetId) {
      this._activeRenderer.setPreset(this._userPresetId);
      this.logger.info(`Performance mode disabled - restored ${this._userPresetId} preset`);
      this._userPresetId = null;
    }

    // Switch to GPU mid-stream if Canvas2D was being used
    if (this.appState.isStreaming && this._activeRendererType === 'canvas2d') {
      await this._switchToGPUMidStream();
      return;
    }

    // Recreate canvas for GPU if Canvas2D context was active
    if (this._canvas2dContextCreated && !this.appState.isStreaming) {
      this.logger.info('Performance mode disabled - recreating canvas for GPU');
      await this.canvasLifecycleService.recreateCanvas();
      this.canvasLifecycleService.setupCanvasSize();
      this._activeRenderer = null;
      this._activeRendererType = null;
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

  /**
   * Start rendering with the appropriate renderer strategy
   * @param {Object} capabilities - Device capabilities
   */
  private async _startRendering(capabilities: StreamingCapabilities): Promise<void> {
    this._currentCapabilities = capabilities;
    const nativeRes = capabilities?.nativeResolution || getDefaultNativeResolution();
    const video = this.streamViewService.getVideo();

    // Determine renderer type
    const gpuAvailable = !this._performanceModeEnabled;
    const rendererType = this.streamingRendererFactory.selectRendererType(
      capabilities,
      this._performanceModeEnabled,
      gpuAvailable
    );

    // Setup canvas size
    this.canvasLifecycleService.setupCanvasSize(nativeRes, rendererType === 'gpu');

    // Check if canvas needs recreation before GPU init
    // This handles both: 1) explicit Canvas2D usage, 2) HMR scenarios where canvas persists with context
    const currentCanvas = this.streamViewService.getCanvas();
    const canvasHasContext = this._canvas2dContextCreated ||
      this.canvasRenderLoopService.hasContextFor(currentCanvas);

    if (rendererType === 'gpu' && canvasHasContext) {
      this.logger.info('Recreating canvas before GPU init (canvas has 2D context)');
      await this.canvasLifecycleService.recreateCanvas();
      this.canvasLifecycleService.setupCanvasSize(nativeRes, true);
      this._canvas2dContextCreated = false;
    }

    // Get canvas AFTER potential recreation to avoid stale reference
    const canvas = this.streamViewService.getCanvas();

    // Create renderer if needed
    if (rendererType === 'gpu') {
      await this._startGPURendering(canvas, video, nativeRes);
    } else {
      await this._startCanvas2DRendering(canvas, video, nativeRes);
    }
  }

  /**
   * Start GPU rendering
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLVideoElement} video
   * @param {Object} nativeRes
   */
  private async _startGPURendering(
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    nativeRes: Dimensions
  ): Promise<void> {
    // Try GPU init with at most one retry for canvas context errors (handles HMR edge cases)
    const MAX_RETRIES = 1;
    let currentCanvas = canvas;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const renderer = this.streamingRendererFactory.createRenderer('gpu', {
        gpuRendererService: this.gpuRendererService,
        gpuRenderLoopService: this.gpuRenderLoopService,
        appState: this.appState
      });

      renderer.setHiddenStateFn(() => this._isHidden);

      try {
        const gpuAvailable = await renderer.initialize(currentCanvas, nativeRes);

        if (gpuAvailable) {
          this._activeRenderer = renderer;
          this._activeRendererType = 'gpu';
          this.logger.info('Using GPU renderer for HD rendering');

          renderer.resume(video);

          // Apply performance preset if needed
          if (this._performanceModeEnabled) {
            if (!this._userPresetId) {
              const currentPresetId = renderer.getPresetId();
              if (currentPresetId && currentPresetId !== 'performance') {
                this._userPresetId = currentPresetId;
              }
            }
            renderer.setPreset('performance');
          }
          return;
        }

        this.logger.warn('GPU renderer not available, falling back to Canvas2D');
        break;
      } catch (error) {
        // Check if failure is due to canvas having a rendering context (e.g., from HMR)
        const errorMessage = getErrorMessage(error);
        const isContextError = errorMessage.includes('rendering context');
        const canRetry = attempt < MAX_RETRIES;

        if (isContextError && canRetry) {
          this.logger.warn('GPU init failed due to existing canvas context, recreating canvas and retrying');
          await this.canvasLifecycleService.recreateCanvas();
          this.canvasLifecycleService.setupCanvasSize(nativeRes, true);
          currentCanvas = this.streamViewService.getCanvas();
          continue; // Retry with fresh canvas
        }

        this.logger.warn('GPU renderer initialization failed, falling back to Canvas2D:', errorMessage);
        break;
      }
    }

    // Fallback to Canvas2D
    await this._startCanvas2DFallback(currentCanvas, video, nativeRes);
  }

  /**
   * Start Canvas2D rendering
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLVideoElement} video
   */
  private async _startCanvas2DRendering(
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    nativeRes: Dimensions
  ): Promise<void> {
    const renderer = this.streamingRendererFactory.createRenderer('canvas2d', {
      canvasRenderLoopService: this.canvasRenderLoopService,
      appState: this.appState
    });

    renderer.setHiddenStateFn(() => this._isHidden);

    try {
      await renderer.initialize(canvas, nativeRes);
    } catch (error) {
      // Don't set partial state if initialization fails
      this.logger.error('Canvas2D renderer initialization failed:', getErrorMessage(error));
      throw error;
    }

    // Only set state after successful initialization to avoid partial state
    this._canvas2dContextCreated = true;
    this._activeRenderer = renderer;
    this._activeRendererType = 'canvas2d';
    this.logger.info('Using Canvas2D renderer');

    renderer.resume(video);
  }

  /**
   * Fallback to Canvas2D when GPU fails
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLVideoElement} video
   * @param {Object} nativeRes
   */
  private async _startCanvas2DFallback(
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    nativeRes: Dimensions
  ): Promise<void> {
    let currentCanvas = canvas;

    // Recreate canvas if GPU transferred control
    if (this.gpuRendererService.isCanvasTransferred()) {
      this.logger.warn('Canvas control was transferred to GPU. Recreating canvas for Canvas2D fallback.');
      this.gpuRendererService.terminateAndReset(false);
      await this.canvasLifecycleService.recreateCanvas();
      this.canvasLifecycleService.setupCanvasSize(nativeRes, false);
      this._canvas2dContextCreated = false;
      currentCanvas = this.streamViewService.getCanvas();
    }

    await this._startCanvas2DRendering(currentCanvas, video, nativeRes);
  }

  /**
   * Switch from GPU to Canvas2D mid-stream
   */
  private async _switchToCanvas2DMidStream(): Promise<void> {
    const video = this.streamViewService.getVideo();

    // Stop GPU renderer
    if (this._activeRenderer) {
      this._activeRenderer.pause(video);
      this._activeRenderer.terminateAndReset(false);
    }

    // Recreate canvas
    await this.canvasLifecycleService.recreateCanvas();
    this._canvas2dContextCreated = false;

    const nativeRes = this._currentCapabilities?.nativeResolution || getDefaultNativeResolution();
    this.canvasLifecycleService.setupCanvasSize(nativeRes, false);

    const canvas = this.streamViewService.getCanvas();

    // Start Canvas2D
    await this._startCanvas2DRendering(canvas, video, nativeRes);
  }

  /**
   * Switch from Canvas2D to GPU mid-stream
   */
  private async _switchToGPUMidStream(): Promise<void> {
    const video = this.streamViewService.getVideo();

    // Stop Canvas2D renderer
    if (this._activeRenderer) {
      this._activeRenderer.pause(video);
    }

    // Recreate canvas for GPU
    await this.canvasLifecycleService.recreateCanvas();
    this._canvas2dContextCreated = false;

    const nativeRes = this._currentCapabilities?.nativeResolution || getDefaultNativeResolution();
    this.canvasLifecycleService.setupCanvasSize(nativeRes, true);

    const canvas = this.streamViewService.getCanvas();

    // Try to initialize GPU
    const renderer = this.streamingRendererFactory.createRenderer('gpu', {
      gpuRendererService: this.gpuRendererService,
      gpuRenderLoopService: this.gpuRenderLoopService,
      appState: this.appState
    });

    renderer.setHiddenStateFn(() => this._isHidden);

    try {
      const gpuAvailable = await renderer.initialize(canvas, nativeRes);

      if (gpuAvailable) {
        this._activeRenderer = renderer;
        this._activeRendererType = 'gpu';

        renderer.resume(video);

        if (this._userPresetId) {
          renderer.setPreset(this._userPresetId);
          this.logger.info(`Performance mode disabled mid-stream - switched to GPU with ${this._userPresetId} preset`);
          this._userPresetId = null;
        } else {
          this.logger.info('Performance mode disabled mid-stream - switched to GPU renderer');
        }
        return;
      }
    } catch (error) {
      this.logger.warn(
        'GPU initialization failed mid-stream, staying on Canvas2D:',
        getErrorMessage(error)
      );
    }

    // Stay on Canvas2D
    await this._startCanvas2DRendering(canvas, video, nativeRes);
    this.logger.warn('Could not switch to GPU mid-stream, continuing with Canvas2D');
  }
}
