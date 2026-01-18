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
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';

export class StreamingRenderPipelineService extends BaseService {
  constructor(dependencies) {
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
        'canvasRenderer',
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

  initialize() {
    this.canvasLifecycleService.initialize();
  }

  handleCanvasExpired() {
    this.canvasLifecycleService.handleCanvasExpired();
  }

  handlePerformanceStateChanged(state) {
    if (!state || typeof state.hidden !== 'boolean') {
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

  handleRenderPresetChanged(presetId) {
    if (this._performanceModeEnabled) {
      this._userPresetId = presetId;
      this.logger.debug(`User selected ${presetId} preset - cached (performance mode active)`);
      return;
    }

    if (this._activeRenderer?.supportsPresets() && this._activeRenderer.isActive()) {
      this._activeRenderer.setPreset(presetId);
    }
  }

  handleFullscreenChange() {
    this.canvasLifecycleService.handleFullscreenChange();
  }

  handlePerformanceModeChanged(enabled) {
    this._performanceModeEnabled = enabled;

    if (enabled) {
      this._handlePerformanceModeEnabled();
    } else {
      this._handlePerformanceModeDisabled();
    }
  }

  async startPipeline(capabilities) {
    const video = this.streamViewService.getVideo();
    await this._waitForHealthyStream(video);
    await this._startRendering(capabilities);
  }

  stopPipeline() {
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

  cleanup() {
    this._performanceModeEnabled = false;
    this._userPresetId = null;

    if (this._activeRenderer) {
      const video = this.streamViewService.getVideo();
      this._activeRenderer.pause(video);
      this._activeRenderer.cleanup();
      this._activeRenderer = null;
      this._activeRendererType = null;
    }

    this.canvasRenderer.cleanup();
    this.canvasLifecycleService.cleanup();
    this.streamHealthService.cleanup();
  }

  // ============================
  // Private methods
  // ============================

  _handleVisible() {
    if (this.appState.isStreaming && this._activeRenderer) {
      const video = this.streamViewService.getVideo();
      this._activeRenderer.resume(video);
      this.logger.debug(`${this._activeRendererType} rendering resumed (window visible)`);
    }
  }

  _handleHidden() {
    if (this.appState.isStreaming && this._activeRenderer) {
      const video = this.streamViewService.getVideo();
      this._activeRenderer.pause(video);
      this.logger.debug(`${this._activeRendererType} rendering paused (window hidden)`);
    }
  }

  _handlePerformanceModeEnabled() {
    // Cache user preset if GPU is active
    if (this.appState.isStreaming && this._activeRendererType === 'gpu' && this._activeRenderer?.isActive()) {
      const currentPresetId = this._activeRenderer.getPresetId();
      if (currentPresetId !== 'performance') {
        this._userPresetId = currentPresetId;
      }

      // Switch to Canvas2D mid-stream
      this._switchToCanvas2DMidStream();
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

  _handlePerformanceModeDisabled() {
    // Restore preset if GPU is already active
    if (this._activeRendererType === 'gpu' && this._activeRenderer?.isActive() && this._userPresetId) {
      this._activeRenderer.setPreset(this._userPresetId);
      this.logger.info(`Performance mode disabled - restored ${this._userPresetId} preset`);
      this._userPresetId = null;
    }

    // Switch to GPU mid-stream if Canvas2D was being used
    if (this.appState.isStreaming && this._activeRendererType === 'canvas2d') {
      this._switchToGPUMidStream();
      return;
    }

    // Recreate canvas for GPU if Canvas2D context was active
    if (this._canvas2dContextCreated && !this.appState.isStreaming) {
      this.logger.info('Performance mode disabled - recreating canvas for GPU');
      this.canvasLifecycleService.recreateCanvas();
      this.canvasLifecycleService.setupCanvasSize();
      this._activeRenderer = null;
      this._activeRendererType = null;
      this._canvas2dContextCreated = false;
    }
  }

  _waitForHealthyStream(videoElement) {
    return new Promise((resolve, reject) => {
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
          const error = new Error(`No frames received: ${errorData.reason}`);
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
  async _startRendering(capabilities) {
    this._currentCapabilities = capabilities;
    const nativeRes = capabilities?.nativeResolution || { width: 160, height: 144 };
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
      this.canvasRenderer.hasContextFor(currentCanvas);

    if (rendererType === 'gpu' && canvasHasContext) {
      this.logger.info('Recreating canvas before GPU init (canvas has 2D context)');
      this.canvasLifecycleService.recreateCanvas();
      this.canvasLifecycleService.setupCanvasSize(nativeRes, true);
      this._canvas2dContextCreated = false;
    }

    // Get canvas AFTER potential recreation to avoid stale reference
    const canvas = this.streamViewService.getCanvas();

    // Create renderer if needed
    if (rendererType === 'gpu') {
      await this._startGPURendering(canvas, video, nativeRes);
    } else {
      await this._startCanvas2DRendering(canvas, video);
    }
  }

  /**
   * Start GPU rendering
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLVideoElement} video
   * @param {Object} nativeRes
   */
  async _startGPURendering(canvas, video, nativeRes) {
    // Try GPU init, with one retry if canvas has stale context (handles HMR edge cases)
    let currentCanvas = canvas;
    let retried = false;

    while (true) {
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
        const isContextError = error.message?.includes('rendering context');

        if (isContextError && !retried) {
          this.logger.warn('GPU init failed due to existing canvas context, recreating canvas and retrying');
          this.canvasLifecycleService.recreateCanvas();
          this.canvasLifecycleService.setupCanvasSize(nativeRes, true);
          currentCanvas = this.streamViewService.getCanvas();
          retried = true;
          continue; // Retry with fresh canvas
        }

        this.logger.warn('GPU renderer initialization failed, falling back to Canvas2D:', error.message);
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
  async _startCanvas2DRendering(canvas, video) {
    const renderer = this.streamingRendererFactory.createRenderer('canvas2d', {
      canvasRenderer: this.canvasRenderer,
      appState: this.appState
    });

    renderer.setHiddenStateFn(() => this._isHidden);

    try {
      await renderer.initialize(canvas);
    } catch (error) {
      // Don't set partial state if initialization fails
      this.logger.error('Canvas2D renderer initialization failed:', error.message);
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
  async _startCanvas2DFallback(canvas, video, nativeRes) {
    let currentCanvas = canvas;

    // Recreate canvas if GPU transferred control
    if (this.gpuRendererService.isCanvasTransferred()) {
      this.logger.warn('Canvas control was transferred to GPU. Recreating canvas for Canvas2D fallback.');
      this.gpuRendererService.terminateAndReset(false);
      this.canvasLifecycleService.recreateCanvas();
      this.canvasLifecycleService.setupCanvasSize(nativeRes, false);
      this._canvas2dContextCreated = false;
      currentCanvas = this.streamViewService.getCanvas();
    }

    await this._startCanvas2DRendering(currentCanvas, video);
  }

  /**
   * Switch from GPU to Canvas2D mid-stream
   */
  _switchToCanvas2DMidStream() {
    const video = this.streamViewService.getVideo();

    // Stop GPU renderer
    if (this._activeRenderer) {
      this._activeRenderer.pause(video);
      this._activeRenderer.terminateAndReset(false);
    }

    // Recreate canvas
    this.canvasLifecycleService.recreateCanvas();
    this._canvas2dContextCreated = false;

    const nativeRes = this._currentCapabilities?.nativeResolution || { width: 160, height: 144 };
    this.canvasLifecycleService.setupCanvasSize(nativeRes, false);

    const canvas = this.streamViewService.getCanvas();

    // Start Canvas2D
    this._startCanvas2DRendering(canvas, video);
  }

  /**
   * Switch from Canvas2D to GPU mid-stream
   */
  async _switchToGPUMidStream() {
    const video = this.streamViewService.getVideo();

    // Stop Canvas2D renderer
    if (this._activeRenderer) {
      this._activeRenderer.pause(video);
    }

    // Recreate canvas for GPU
    this.canvasLifecycleService.recreateCanvas();
    this._canvas2dContextCreated = false;

    const nativeRes = this._currentCapabilities?.nativeResolution || { width: 160, height: 144 };
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
      this.logger.warn('GPU initialization failed mid-stream, staying on Canvas2D:', error.message);
    }

    // Stay on Canvas2D
    await this._startCanvas2DRendering(canvas, video);
    this.logger.warn('Could not switch to GPU mid-stream, continuing with Canvas2D');
  }
}
