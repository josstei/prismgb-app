/**
 * Render Pipeline Service
 *
 * Owns GPU/Canvas2D switching, health checks, and render start/stop.
 * Keeps streaming orchestration focused on stream lifecycle and UI events.
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
        'canvasRenderer',
        'canvasLifecycleService',
        'streamHealthService',
        'gpuRendererService',
        'gpuRenderLoopService',
        'eventBus',
        'loggerFactory'
      ],
      'StreamingRenderPipelineService'
    );

    this._currentCapabilities = null;
    this._useGPURenderer = false;
    this._gpuRenderLoopActive = false;
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

    if (this._useGPURenderer && this.gpuRendererService.isActive()) {
      this.gpuRendererService.setPreset(presetId);
    }
  }

  handleFullscreenChange() {
    this.canvasLifecycleService.handleFullscreenChange();
  }

  handlePerformanceModeChanged(enabled) {
    this._performanceModeEnabled = enabled;

    if (enabled) {
      if (this.appState.isStreaming && this._useGPURenderer && this.gpuRendererService.isActive()) {
        const currentPresetId = this.gpuRendererService.getPresetId();
        if (currentPresetId !== 'performance') {
          this._userPresetId = currentPresetId;
        }

        const video = this.streamViewService.getVideo();
        this._stopGPURenderLoop(video);

        this.gpuRendererService.terminateAndReset(false);
        this._useGPURenderer = false;
        this.canvasLifecycleService.recreateCanvas();

        const nativeRes = this._currentCapabilities?.nativeResolution || { width: 160, height: 144 };
        this.canvasLifecycleService.setupCanvasSize(nativeRes, this._useGPURenderer);

        const canvas = this.streamViewService.getCanvas();
        this._canvas2dContextCreated = true;
        this.canvasRenderer.startRendering(
          video,
          canvas,
          () => this.appState.isStreaming,
          () => this._isHidden
        );

        this.logger.info('Performance mode enabled mid-stream - switched to Canvas2D renderer');
        return;
      }

      if (this._useGPURenderer) {
        this.logger.info('Performance mode enabled - terminating GPU worker for Canvas2D on next stream');
        this.gpuRendererService.terminateAndReset();
        this._useGPURenderer = false;
      }
    } else {
      if (this._useGPURenderer && this.gpuRendererService.isActive() && this._userPresetId) {
        this.gpuRendererService.setPreset(this._userPresetId);
        this.logger.info(`Performance mode disabled - restored ${this._userPresetId} preset`);
        this._userPresetId = null;
      }

      if (this.appState.isStreaming && this._canvas2dContextCreated && !this._useGPURenderer) {
        this._switchToGPUMidStream();
        return;
      }

      if (this._canvas2dContextCreated && !this.appState.isStreaming) {
        this.logger.info('Performance mode disabled - recreating canvas for GPU (Canvas2D context was active)');
        this.canvasLifecycleService.recreateCanvas();
        this.canvasLifecycleService.setupCanvasSize();
        this._canvas2dContextCreated = false;
      }
    }
  }

  async startPipeline(capabilities) {
    const video = this.streamViewService.getVideo();
    await this._waitForHealthyStream(video);
    await this._startCanvasRendering(capabilities);
  }

  stopPipeline() {
    const video = this.streamViewService.getVideo();

    if (this._useGPURenderer) {
      this._stopGPURenderLoop(video);
      this.eventBus.publish(EventChannels.PERFORMANCE.MEMORY_SNAPSHOT_REQUESTED, {
        label: 'before gpu release'
      });
      this.gpuRendererService.terminateAndReset();
      this.eventBus.publish(EventChannels.PERFORMANCE.MEMORY_SNAPSHOT_REQUESTED, {
        label: 'after gpu release',
        delayMs: 1000
      });
      this._useGPURenderer = false;
    } else {
      this.canvasRenderer.stopRendering(video);
    }

    if (!this.gpuRendererService.isCanvasTransferred()) {
      const canvas = this.streamViewService.getCanvas();
      this.canvasRenderer.clearCanvas(canvas);
      this._canvas2dContextCreated = true;
    }
  }

  cleanup() {
    this._performanceModeEnabled = false;
    this._userPresetId = null;
    this._canvas2dContextCreated = false;

    if (this._useGPURenderer) {
      const video = this.streamViewService.getVideo();
      this._stopGPURenderLoop(video);
      this.gpuRendererService.cleanup();
      this._useGPURenderer = false;
    }

    this.canvasRenderer.cleanup();
    this.canvasLifecycleService.cleanup();
    this.streamHealthService.cleanup();
  }

  _handleVisible() {
    if (this.appState.isStreaming) {
      if (this._useGPURenderer) {
        const video = this.streamViewService.getVideo();
        this._startGPURenderLoop(video);
        this.logger.debug('GPU rendering resumed (window visible)');
      } else {
        this._startCanvasRendering(this._currentCapabilities);
        this.logger.debug('Canvas rendering resumed (window visible)');
      }
    }
  }

  _handleHidden() {
    if (this.appState.isStreaming) {
      const video = this.streamViewService.getVideo();

      if (this._useGPURenderer) {
        this._stopGPURenderLoop(video);
        this.logger.debug('GPU rendering paused (window hidden)');
      } else {
        this.canvasRenderer.stopRendering(video);
        this.logger.debug('Canvas rendering paused (window hidden)');
      }
    }
  }

  _waitForHealthyStream(videoElement) {
    return new Promise((resolve, reject) => {
      this.streamHealthService.startMonitoring(
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
   * Start the canvas rendering pipeline with the given capabilities.
   * Routes to either Canvas2D or GPU rendering based on performance mode and availability.
   * @param {Object} capabilities - Device capabilities including nativeResolution
   */
  async _startCanvasRendering(capabilities) {
    this._currentCapabilities = capabilities;
    const nativeRes = capabilities?.nativeResolution || { width: 160, height: 144 };

    this.canvasLifecycleService.setupCanvasSize(nativeRes, this._useGPURenderer);

    // Performance mode forces Canvas2D rendering
    if (this._shouldUseCanvas2DOnly()) {
      return this._startCanvas2DRendering();
    }

    // Prepare canvas for GPU rendering if needed
    this._prepareCanvasForGPU(nativeRes);

    return this._startGPURendering(nativeRes);
  }

  /**
   * Check if we should use Canvas2D-only rendering (performance mode active)
   * @returns {boolean} True if Canvas2D should be used exclusively
   * @private
   */
  _shouldUseCanvas2DOnly() {
    return this._performanceModeEnabled && !this.gpuRendererService.isCanvasTransferred();
  }

  /**
   * Prepare canvas for GPU rendering by recreating it if Canvas2D context was active
   * @param {Object} nativeRes - Native resolution { width, height }
   * @private
   */
  _prepareCanvasForGPU(nativeRes) {
    if (!this._performanceModeEnabled && this._canvas2dContextCreated && !this.gpuRendererService.isCanvasTransferred()) {
      this.logger.info('Recreating canvas before GPU init (Canvas2D context was active)');
      this.canvasLifecycleService.recreateCanvas();
      this._canvas2dContextCreated = false;
      this.canvasLifecycleService.setupCanvasSize(nativeRes, this._useGPURenderer);
    }
  }

  /**
   * Start Canvas2D rendering
   * @private
   */
  _startCanvas2DRendering() {
    const canvas = this.streamViewService.getCanvas();
    const video = this.streamViewService.getVideo();

    this.logger.info('Performance mode active - using Canvas2D renderer');
    this._useGPURenderer = false;
    this._canvas2dContextCreated = true;
    this.canvasRenderer.startRendering(
      video,
      canvas,
      () => this.appState.isStreaming,
      () => this._isHidden
    );
  }

  /**
   * Start GPU rendering with fallback to Canvas2D on failure
   * @param {Object} nativeRes - Native resolution { width, height }
   * @private
   */
  async _startGPURendering(nativeRes) {
    const canvas = this.streamViewService.getCanvas();
    const video = this.streamViewService.getVideo();

    // Resume existing GPU renderer if already active
    if (this._useGPURenderer && this.gpuRendererService.isActive()) {
      this._resumeExistingGPURenderer(video);
      return;
    }

    // Try to initialize GPU renderer
    try {
      const gpuAvailable = await this.gpuRendererService.initialize(canvas, nativeRes);

      if (gpuAvailable) {
        this._useGPURenderer = true;
        this.logger.info('Using GPU renderer for HD rendering');
        this._startGPURenderLoop(video);
        this._applyPerformanceModePreset();
        return;
      } else {
        this.logger.warn('GPU renderer not available, attempting Canvas2D fallback');
        this._useGPURenderer = false;
      }
    } catch (error) {
      this.logger.warn('GPU renderer initialization failed, falling back to Canvas2D:', error.message);
      this._useGPURenderer = false;
    }

    // Fallback to Canvas2D if GPU failed
    this._fallbackToCanvas2D();
  }

  /**
   * Resume an existing GPU renderer that was previously initialized
   * @param {HTMLVideoElement} video - Video element
   * @private
   */
  _resumeExistingGPURenderer(video) {
    this.logger.info('Resuming GPU renderer (already initialized)');
    this._startGPURenderLoop(video);
    this._applyPerformanceModePreset();
  }

  /**
   * Apply performance mode preset if enabled, caching the user's preset
   * @private
   */
  _applyPerformanceModePreset() {
    if (this._performanceModeEnabled) {
      if (!this._userPresetId) {
        const currentPresetId = this.gpuRendererService.getPresetId();
        if (currentPresetId && currentPresetId !== 'performance') {
          this._userPresetId = currentPresetId;
        }
      }
      this.gpuRendererService.setPreset('performance');
    }
  }

  /**
   * Fallback to Canvas2D rendering when GPU is not available
   * Handles the case where canvas control was transferred to GPU and cannot be recovered
   * @private
   */
  _fallbackToCanvas2D() {
    const canvas = this.streamViewService.getCanvas();
    const video = this.streamViewService.getVideo();

    if (this.gpuRendererService.isCanvasTransferred()) {
      this.logger.error('Canvas control was transferred to GPU renderer and cannot be recovered for Canvas2D fallback. Video will play but without rendering pipeline.');
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
        message: 'Rendering unavailable - video playing without shader effects',
        type: 'warning'
      });
      this.eventBus.publish(EventChannels.UI.OVERLAY_ERROR, {
        message: 'GPU rendering failed and cannot recover. Video will play without visual effects.'
      });
      return;
    }

    this.logger.info('Using Canvas2D renderer');
    this._canvas2dContextCreated = true;
    this.canvasRenderer.startRendering(
      video,
      canvas,
      () => this.appState.isStreaming,
      () => this._isHidden
    );
  }

  _startGPURenderLoop(videoElement) {
    this._gpuRenderLoopActive = true;
    this.gpuRenderLoopService.start({
      videoElement,
      renderFrame: async () => this.gpuRendererService.renderFrame(videoElement),
      shouldContinue: () => this.appState.isStreaming && !this._isHidden
    });
  }

  _stopGPURenderLoop(videoElement) {
    this._gpuRenderLoopActive = false;
    this.gpuRenderLoopService.stop(videoElement);
  }

  async _switchToGPUMidStream() {
    const video = this.streamViewService.getVideo();

    this.canvasRenderer.stopRendering(video);

    this.canvasLifecycleService.recreateCanvas();
    this._canvas2dContextCreated = false;

    const canvas = this.streamViewService.getCanvas();
    const nativeRes = { width: 160, height: 144 };

    this.canvasLifecycleService.setupCanvasSize(nativeRes, this._useGPURenderer);

    try {
      const gpuAvailable = await this.gpuRendererService.initialize(canvas, nativeRes);

      if (gpuAvailable) {
        this._useGPURenderer = true;
        this._startGPURenderLoop(video);

        if (this._userPresetId) {
          this.gpuRendererService.setPreset(this._userPresetId);
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

    this._canvas2dContextCreated = true;
    this.canvasRenderer.startRendering(
      video,
      canvas,
      () => this.appState.isStreaming,
      () => this._isHidden
    );
    this.logger.warn('Could not switch to GPU mid-stream, continuing with Canvas2D');
  }
}
