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
        'viewportManager',
        'streamHealthMonitor',
        'gpuRendererService',
        'eventBus',
        'loggerFactory'
      ],
      'RenderPipelineService'
    );

    this._currentCapabilities = null;
    this._useGPURenderer = false;
    this._gpuRenderLoopActive = false;
    this._rvfcHandle = null;
    this._isHidden = false;

    this._idleReleaseTimeout = null;
    this._idleReleaseDelay = 15000;

    this._performanceModeEnabled = false;
    this._userPresetId = null;
    this._canvas2dContextCreated = false;
  }

  initialize() {
    this._setupCanvasSize();
  }

  handleCanvasExpired() {
    this._recreateCanvas();
    this._setupCanvasSize();
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
        this._recreateCanvas();

        const nativeRes = this._currentCapabilities?.nativeResolution || { width: 160, height: 144 };
        this._setupCanvasSize(nativeRes);

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
        this._recreateCanvas();
        this._setupCanvasSize();
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
      this.gpuRendererService.releaseResources();
      this.eventBus.publish(EventChannels.PERFORMANCE.MEMORY_SNAPSHOT_REQUESTED, {
        label: 'after gpu release',
        delayMs: 1000
      });
      this._startIdleReleaseTimer();
    } else {
      this.canvasRenderer.stopRendering(video);
    }

    if (!this.gpuRendererService.isCanvasTransferred()) {
      const canvas = this.uiController.elements.streamCanvas;
      this.canvasRenderer.clearCanvas(canvas);
    }
  }

  cleanup() {
    this._clearIdleReleaseTimer();

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
    this.viewportManager.cleanup();
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

  _setupCanvasSize(nativeRes = null) {
    const canvas = this.uiController.elements.streamCanvas;
    const container = canvas?.parentElement;
    const section = container?.parentElement;
    if (!canvas || !container || !section) return;

    const resolution = nativeRes ||
      this._currentCapabilities?.nativeResolution ||
      { width: 160, height: 144 };

    const dimensions = this.viewportManager.calculateDimensions(canvas, resolution);
    if (!dimensions) return;

    if (this.gpuRendererService.isCanvasTransferred()) {
      this.gpuRendererService.resize(dimensions.width, dimensions.height);
      canvas.style.width = dimensions.width + 'px';
      canvas.style.height = dimensions.height + 'px';
    } else {
      this.canvasRenderer.resize(canvas, dimensions.width, dimensions.height);
    }

    if (!this.viewportManager._resizeObserver) {
      this.viewportManager.initialize(section, () => this._setupCanvasSize());
    }
  }

  _recreateCanvas() {
    const oldCanvas = this.uiController.elements.streamCanvas;
    if (!oldCanvas) return;

    const parent = oldCanvas.parentElement;
    if (!parent) return;

    const newCanvas = document.createElement('canvas');
    newCanvas.id = oldCanvas.id;
    newCanvas.className = oldCanvas.className;

    const computedStyle = window.getComputedStyle(oldCanvas);
    newCanvas.style.position = computedStyle.position;
    newCanvas.style.top = computedStyle.top;
    newCanvas.style.left = computedStyle.left;
    newCanvas.style.transform = computedStyle.transform;

    parent.replaceChild(newCanvas, oldCanvas);

    this.uiController.elements.streamCanvas = newCanvas;

    this.canvasRenderer.resetCanvasState();
    this.viewportManager.resetDimensions();

    this.eventBus.publish(EventChannels.RENDER.CANVAS_RECREATED, { oldCanvas, newCanvas });

    this.logger.info('Canvas element recreated for next GPU session');
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
    this._clearIdleReleaseTimer();

    this._currentCapabilities = capabilities;

    const canvas = this.uiController.elements.streamCanvas;
    const video = this.uiController.elements.streamVideo;

    const nativeRes = capabilities?.nativeResolution || { width: 160, height: 144 };

    this._setupCanvasSize(nativeRes);

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
    let lastFrameTime = -1;

    const renderFrame = async (now, metadata) => {
      if (!this._gpuRenderLoopActive) return;

      const frameTime = metadata?.mediaTime ?? now;
      if (frameTime !== lastFrameTime && videoElement.readyState >= videoElement.HAVE_CURRENT_DATA) {
        await this.gpuRendererService.renderFrame(videoElement);
        lastFrameTime = frameTime;
      }

      if (this.appState.isStreaming && !this._isHidden) {
        this._rvfcHandle = videoElement.requestVideoFrameCallback(renderFrame);
      }
    };

    this._rvfcHandle = videoElement.requestVideoFrameCallback(renderFrame);
  }

  _stopGPURenderLoop(videoElement) {
    this._gpuRenderLoopActive = false;

    if (this._rvfcHandle !== null && videoElement?.cancelVideoFrameCallback) {
      videoElement.cancelVideoFrameCallback(this._rvfcHandle);
      this._rvfcHandle = null;
    }
  }

  _startIdleReleaseTimer() {
    this._clearIdleReleaseTimer();

    this._idleReleaseTimeout = setTimeout(() => {
      if (this._useGPURenderer && !this.appState.isStreaming) {
        this.logger.info('GPU idle timeout - terminating worker to flush GPU caches');
        this.gpuRendererService.terminateAndReset();
        this._useGPURenderer = false;
      }
    }, this._idleReleaseDelay);
  }

  _clearIdleReleaseTimer() {
    if (this._idleReleaseTimeout) {
      clearTimeout(this._idleReleaseTimeout);
      this._idleReleaseTimeout = null;
    }
  }

  async _switchToGPUMidStream() {
    const video = this.uiController.elements.streamVideo;

    this.canvasRenderer.stopRendering(video);

    this._recreateCanvas();
    this._canvas2dContextCreated = false;

    const canvas = this.uiController.elements.streamCanvas;
    const nativeRes = { width: 160, height: 144 };

    this._setupCanvasSize(nativeRes);

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
