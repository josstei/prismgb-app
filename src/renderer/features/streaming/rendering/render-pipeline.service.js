/**
 * Render Pipeline Service
 *
 * Owns GPU/Canvas2D switching, health checks, and render start/stop.
 * Keeps streaming orchestration focused on stream lifecycle and UI events.
 */

import { BaseService } from '@shared/base/service.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

export class RenderPipelineService extends BaseService {
  constructor(dependencies) {
    super(
      dependencies,
      [
        'appState',
        'uiController',
        'canvasRenderer',
        'canvasLifecycleService',
        'streamHealthMonitor',
        'gpuRendererService',
        'gpuRenderLoopService',
        'eventBus',
        'loggerFactory'
      ],
      'RenderPipelineService'
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

  handlePerformanceModeChanged(enabled) {
    this._performanceModeEnabled = enabled;

    if (enabled) {
      if (this.appState.isStreaming && this._useGPURenderer && this.gpuRendererService.isActive()) {
        const currentPresetId = this.gpuRendererService.getPresetId();
        if (currentPresetId !== 'performance') {
          this._userPresetId = currentPresetId;
        }

        const video = this.uiController.elements.streamVideo;
        this._stopGPURenderLoop(video);

        this.gpuRendererService.terminateAndReset(false);
        this._useGPURenderer = false;
        this.canvasLifecycleService.recreateCanvas();

        const nativeRes = this._currentCapabilities?.nativeResolution || { width: 160, height: 144 };
        this.canvasLifecycleService.setupCanvasSize(nativeRes, this._useGPURenderer);

        const canvas = this.uiController.elements.streamCanvas;
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
    const video = this.uiController.elements.streamVideo;
    await this._waitForHealthyStream(video);
    await this._startCanvasRendering(capabilities);
  }

  stopPipeline() {
    const video = this.uiController.elements.streamVideo;

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
      const canvas = this.uiController.elements.streamCanvas;
      this.canvasRenderer.clearCanvas(canvas);
      this._canvas2dContextCreated = true;
    }
  }

  cleanup() {
    this._performanceModeEnabled = false;
    this._userPresetId = null;
    this._canvas2dContextCreated = false;

    if (this._useGPURenderer) {
      const video = this.uiController.elements.streamVideo;
      this._stopGPURenderLoop(video);
      this.gpuRendererService.cleanup();
      this._useGPURenderer = false;
    }

    this.canvasRenderer.cleanup();
    this.canvasLifecycleService.cleanup();
    this.streamHealthMonitor.cleanup();
  }

  _handleVisible() {
    if (this.appState.isStreaming) {
      if (this._useGPURenderer) {
        const video = this.uiController.elements.streamVideo;
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
      const video = this.uiController.elements.streamVideo;

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
      this.streamHealthMonitor.startMonitoring(
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

  async _startCanvasRendering(capabilities) {
    this._currentCapabilities = capabilities;

    let canvas = this.uiController.elements.streamCanvas;
    const video = this.uiController.elements.streamVideo;

    const nativeRes = capabilities?.nativeResolution || { width: 160, height: 144 };

    this.canvasLifecycleService.setupCanvasSize(nativeRes, this._useGPURenderer);

    if (this._performanceModeEnabled && !this.gpuRendererService.isCanvasTransferred()) {
      this.logger.info('Performance mode active - using Canvas2D renderer');
      this._useGPURenderer = false;
      this._canvas2dContextCreated = true;
      this.canvasRenderer.startRendering(
        video,
        canvas,
        () => this.appState.isStreaming,
        () => this._isHidden
      );
      return;
    }

    if (!this._performanceModeEnabled && this._canvas2dContextCreated && !this.gpuRendererService.isCanvasTransferred()) {
      this.logger.info('Recreating canvas before GPU init (Canvas2D context was active)');
      this.canvasLifecycleService.recreateCanvas();
      this._canvas2dContextCreated = false;
      this.canvasLifecycleService.setupCanvasSize(nativeRes, this._useGPURenderer);
      canvas = this.uiController.elements.streamCanvas;
    }

    if (this._useGPURenderer && this.gpuRendererService.isActive()) {
      this.logger.info('Resuming GPU renderer (already initialized)');
      this._startGPURenderLoop(video);

      if (this._performanceModeEnabled) {
        if (!this._userPresetId) {
          const currentPresetId = this.gpuRendererService.getPresetId();
          if (currentPresetId && currentPresetId !== 'performance') {
            this._userPresetId = currentPresetId;
          }
        }
        this.gpuRendererService.setPreset('performance');
      }
      return;
    }

    try {
      const gpuAvailable = await this.gpuRendererService.initialize(canvas, nativeRes);

      if (gpuAvailable) {
        this._useGPURenderer = true;
        this.logger.info('Using GPU renderer for HD rendering');
        this._startGPURenderLoop(video);

        if (this._performanceModeEnabled) {
          if (!this._userPresetId) {
            const currentPresetId = this.gpuRendererService.getPresetId();
            if (currentPresetId && currentPresetId !== 'performance') {
              this._userPresetId = currentPresetId;
            }
          }
          this.gpuRendererService.setPreset('performance');
        }
        return;
      } else {
        this.logger.warn('GPU renderer not available, attempting Canvas2D fallback');
        this._useGPURenderer = false;
      }
    } catch (error) {
      this.logger.warn('GPU renderer initialization failed, falling back to Canvas2D:', error.message);
      this._useGPURenderer = false;
    }

    if (!this._useGPURenderer) {
      canvas = this.uiController.elements.streamCanvas;

      if (this.gpuRendererService.isCanvasTransferred()) {
        this.logger.error('Canvas control was transferred to GPU renderer and cannot be recovered for Canvas2D fallback. Video will play but without rendering pipeline.');
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
    const video = this.uiController.elements.streamVideo;

    this.canvasRenderer.stopRendering(video);

    this.canvasLifecycleService.recreateCanvas();
    this._canvas2dContextCreated = false;

    const canvas = this.uiController.elements.streamCanvas;
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
