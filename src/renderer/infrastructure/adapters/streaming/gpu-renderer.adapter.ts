/**
 * GPU Renderer Adapter
 *
 * Adapts StreamingGpuRendererService and StreamingGpuRenderLoopService
 * to the IStreamingRenderer interface for use in the render pipeline.
 *
 * Responsibilities:
 * - Coordinate GPU renderer service and render loop service
 * - Manage GPU render loop lifecycle (start/stop)
 * - Handle shader preset switching
 * - Track active state
 */

import type { LoggerLike } from '@prismgb/core';

import { IStreamingRenderer } from './streaming-renderer.interface';

interface GpuRendererServiceLike {
  initialize(canvasElement: HTMLCanvasElement, nativeResolution: { width: number; height: number }): Promise<boolean>;
  renderFrame(videoElement: HTMLVideoElement): Promise<void>;
  resize(width: number, height: number): void;
  isActive(): boolean;
  getPresetId(): string | null;
  setPreset(presetId: string): void;
  isCanvasTransferred(): boolean;
  releaseGpuResources(): void;
  terminateAndReset(emitCanvasExpired: boolean): void;
  cleanup(): void;
}

interface AppStateLike {
  readonly isStreaming: boolean;
}

export class StreamingGpuRendererAdapter extends IStreamingRenderer {
  gpuRendererService: GpuRendererServiceLike;
  appState: AppStateLike;
  logger: LoggerLike;
  _videoElement: HTMLVideoElement | null;
  _isHiddenFn: () => boolean;
  _renderLoopActive: boolean;

  /**
   * @param {Object} dependencies - Injected dependencies
   * @param {Object} dependencies.gpuRendererService - GPU renderer service
   * @param {Object} dependencies.appState - Application state for streaming status
   * @param {Object} dependencies.loggerFactory - Logger factory
   */
  constructor({ gpuRendererService, appState, loggerFactory }) {
    super();
    this.gpuRendererService = gpuRendererService;
    this.appState = appState;
    this.logger = loggerFactory.create('StreamingGpuRendererAdapter');

    this._videoElement = null;
    this._isHiddenFn = () => false;
    this._renderLoopActive = false;
  }

  /**
   * Set the hidden state function for render loop control
   * @param {Function} isHiddenFn - Returns true if window is hidden
   */
  setHiddenStateFn(isHiddenFn) {
    this._isHiddenFn = isHiddenFn;
  }

  /**
   * Initialize GPU renderer with canvas and resolution
   * @param {HTMLCanvasElement} canvasElement - Canvas to render to
   * @param {Object} nativeResolution - Native device resolution { width, height }
   * @returns {Promise<boolean>} True if GPU rendering is available
   */
  async initialize(canvasElement, nativeResolution) {
    this.logger.debug('Initializing GPU renderer adapter');

    const gpuAvailable = await this.gpuRendererService.initialize(canvasElement, nativeResolution);

    if (!gpuAvailable) {
      this.logger.warn('GPU rendering not available');
      return false;
    }

    this.logger.info('GPU renderer adapter initialized');
    return true;
  }

  /**
   * Render a video frame through the GPU pipeline
   * @param {HTMLVideoElement} videoElement - Video element to capture frame from
   * @returns {Promise<void>}
   */
  async renderFrame(videoElement) {
    return this.gpuRendererService.renderFrame(videoElement);
  }

  /**
   * Resize GPU renderer to new dimensions
   * @param {number} width - New width
   * @param {number} height - New height
   */
  resize(width, height) {
    this.gpuRendererService.resize(width, height);
  }

  /**
   * Check if GPU renderer is active
   * @returns {boolean} True if GPU rendering is active
   */
  isActive() {
    return this.gpuRendererService.isActive();
  }

  /**
   * Start the GPU render loop
   * @param {HTMLVideoElement} videoElement - Video element for frame callback
   */
  resume(videoElement) {
    if (this._renderLoopActive) {
      return;
    }

    this._videoElement = videoElement;
    this._renderLoopActive = true;

    this.gpuRendererService.startRenderLoop({
      videoElement,
      renderFrame: async () => this.gpuRendererService.renderFrame(videoElement),
      shouldContinue: () => this.appState.isStreaming && !this._isHiddenFn()
    });

    this.logger.debug('GPU render loop started');
  }

  /**
   * Stop the GPU render loop
   * @param {HTMLVideoElement} videoElement - Video element for callback cancellation
   */
  pause(videoElement) {
    if (!this._renderLoopActive) {
      return;
    }

    this._renderLoopActive = false;
    this.gpuRendererService.stopRenderLoop(videoElement || this._videoElement);
    this.logger.debug('GPU render loop stopped');
  }

  /**
   * Cleanup GPU renderer resources
   */
  cleanup() {
    if (this._videoElement) {
      this.gpuRendererService.stopRenderLoop(this._videoElement);
    }
    this._renderLoopActive = false;
    this._videoElement = null;
    this.gpuRendererService.cleanup();
    this.logger.info('GPU renderer adapter cleaned up');
  }

  // ============================
  // GPU-specific methods
  // ============================

  /**
   * GPU renderer supports shader presets
   * @returns {boolean} True
   */
  supportsPresets() {
    return true;
  }

  /**
   * Get current preset ID
   * @returns {string|null} Current preset ID
   */
  getPresetId() {
    return this.gpuRendererService.getPresetId();
  }

  /**
   * Set the active render preset
   * @param {string} presetId - Preset ID to apply
   */
  setPreset(presetId) {
    this.gpuRendererService.setPreset(presetId);
  }

  /**
   * Check if canvas control was transferred to GPU
   * @returns {boolean} True if canvas was transferred
   */
  isCanvasTransferred() {
    return this.gpuRendererService.isCanvasTransferred();
  }

  /**
   * Release GPU resources while keeping worker alive
   * Note: Only GPU resources are released; the worker stays alive.
   */
  releaseGpuResources() {
    this.gpuRendererService.releaseGpuResources();
  }

  /**
   * Terminate GPU worker and reset canvas state
   * @param {boolean} emitCanvasExpired - Whether to emit canvas expired event
   */
  terminateAndReset(emitCanvasExpired = true) {
    if (this._videoElement) {
      this.gpuRendererService.stopRenderLoop(this._videoElement);
    }
    this._renderLoopActive = false;
    this._videoElement = null;
    this.gpuRendererService.terminateAndReset(emitCanvasExpired);
  }
}
