/**
 * Canvas2D Render Loop Adapter
 *
 * Adapts the package-backed Canvas2D render loop to the IStreamingRenderer interface
 * for use in the render pipeline.
 *
 * Responsibilities:
 * - Wrap Canvas2D render loop lifecycle
 * - Manage render loop start/stop
 * - Keep canvas context ownership inside @prismgb/gpu
 */

import type { LoggerLike } from '@shared/interfaces/infrastructure.types.js';

import { IStreamingRenderer } from './streaming-renderer.interface';

interface CanvasRenderLoopServiceLike {
  initialize(canvasElement: HTMLCanvasElement, nativeResolution?: { width: number; height: number }): Promise<void>;
  startRendering(videoElement: HTMLVideoElement, canvasElement: HTMLCanvasElement, isStreamingFn: () => boolean, isHiddenFn: () => boolean): void;
  stopRendering(videoElement?: HTMLVideoElement | null): void;
  clearCanvas(canvasElement: HTMLCanvasElement): void;
  resize(canvasElement: HTMLCanvasElement, width: number, height: number): void;
  isActive(): boolean;
  resetCanvasState(): Promise<void>;
  cleanup(): Promise<void>;
}

interface AppStateLike {
  readonly isStreaming: boolean;
}

export class StreamingCanvas2DRendererAdapter extends IStreamingRenderer {
  canvasRenderLoopService: CanvasRenderLoopServiceLike;
  appState: AppStateLike;
  logger: LoggerLike;
  _canvasElement: HTMLCanvasElement | null;
  _videoElement: HTMLVideoElement | null;
  _isHiddenFn: () => boolean;
  _isInitialized: boolean;

  /**
   * @param {Object} dependencies - Injected dependencies
   * @param {Object} dependencies.canvasRenderLoopService - Canvas2D render loop service
   * @param {Object} dependencies.appState - Application state for streaming status
   * @param {Object} dependencies.loggerFactory - Logger factory
   */
  constructor({ canvasRenderLoopService, appState, loggerFactory }) {
    super();
    this.canvasRenderLoopService = canvasRenderLoopService;
    this.appState = appState;
    this.logger = loggerFactory.create('StreamingCanvas2DRendererAdapter');

    this._canvasElement = null;
    this._videoElement = null;
    this._isHiddenFn = () => false;
    this._isInitialized = false;
  }

  /**
   * Set the hidden state function for render loop control
   * @param {Function} isHiddenFn - Returns true if window is hidden
   */
  setHiddenStateFn(isHiddenFn) {
    this._isHiddenFn = isHiddenFn;
  }

  /**
   * Initialize Canvas2D renderer with canvas and resolution
   * Canvas2D is always available, so this always returns true.
   * @param {HTMLCanvasElement} canvasElement - Canvas to render to
   * @param {Object} _nativeResolution - Native device resolution (unused for Canvas2D)
   * @returns {Promise<boolean>} Always true for Canvas2D
   */
  async initialize(canvasElement, nativeResolution) {
    this.logger.debug('Initializing Canvas2D renderer adapter');

    this._canvasElement = canvasElement;
    await this.canvasRenderLoopService.initialize(canvasElement, nativeResolution);
    this._isInitialized = true;

    this.logger.info('Canvas2D renderer adapter initialized');
    return true;
  }

  /**
   * Render a video frame
   * Canvas2D uses RVFC internally via startRendering, so this is a no-op
   * @param {HTMLVideoElement} _videoElement - Video element (handled internally)
   * @returns {Promise<void>}
   */
  async renderFrame(_videoElement) {
    // Canvas2D handles frame rendering internally via RVFC in startRendering
    // No manual frame-by-frame rendering needed
  }

  /**
   * Resize Canvas2D renderer to new dimensions
   * @param {number} width - New width
   * @param {number} height - New height
   */
  resize(width, height) {
    if (this._canvasElement) {
      this.canvasRenderLoopService.resize(this._canvasElement, width, height);
    }
  }

  /**
   * Check if Canvas2D renderer is active
   * @returns {boolean} True if rendering is active
   */
  isActive() {
    return this.canvasRenderLoopService.isActive();
  }

  /**
   * Start the Canvas2D render loop
   * @param {HTMLVideoElement} videoElement - Video element for frame callback
   */
  resume(videoElement) {
    if (!this._isInitialized || !this._canvasElement) {
      this.logger.warn('Cannot resume - not initialized');
      return;
    }

    this._videoElement = videoElement;

    this.canvasRenderLoopService.startRendering(
      videoElement,
      this._canvasElement,
      () => this.appState.isStreaming,
      () => this._isHiddenFn()
    );

    this.logger.debug('Canvas2D render loop started');
  }

  /**
   * Stop the Canvas2D render loop
   * @param {HTMLVideoElement} videoElement - Video element for callback cancellation
   */
  pause(videoElement) {
    this.canvasRenderLoopService.stopRendering(videoElement || this._videoElement);
    this.logger.debug('Canvas2D render loop stopped');
  }

  /**
   * Handle pipeline stop - clear canvas to black for idle state
   * @override
   */
  handlePipelineStop() {
    this.clearCanvas();
  }

  /**
   * Cleanup Canvas2D renderer resources
   */
  async cleanup() {
    if (this._videoElement) {
      this.canvasRenderLoopService.stopRendering(this._videoElement);
    }

    this._canvasElement = null;
    this._videoElement = null;
    this._isInitialized = false;

    await this.canvasRenderLoopService.cleanup();
    this.logger.info('Canvas2D renderer adapter cleaned up');
  }

  /**
   * Clear the canvas with black background
   */
  clearCanvas() {
    if (this._canvasElement) {
      this.canvasRenderLoopService.clearCanvas(this._canvasElement);
    }
  }

  /**
   * Reset canvas state (after canvas replacement)
   */
  async resetCanvasState() {
    await this.canvasRenderLoopService.resetCanvasState();
    this._canvasElement = null;
    this._isInitialized = false;
  }

  // ============================
  // Canvas2D does not support presets
  // ============================

  /**
   * Canvas2D does not support shader presets
   * @returns {boolean} False
   */
  supportsPresets() {
    return false;
  }
}
