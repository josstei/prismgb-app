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

interface Canvas2DRendererAdapterDependencies {
  canvasRenderLoopService: CanvasRenderLoopServiceLike;
  appState: AppStateLike;
  loggerFactory: {
    create(name: string): LoggerLike;
  };
}

export class StreamingCanvas2DRendererAdapter extends IStreamingRenderer {
  canvasRenderLoopService: CanvasRenderLoopServiceLike;
  appState: AppStateLike;
  logger: LoggerLike;
  _canvasElement: HTMLCanvasElement | null;
  _videoElement: HTMLVideoElement | null;
  _isHiddenFn: () => boolean;
  _isInitialized: boolean;

  constructor({ canvasRenderLoopService, appState, loggerFactory }: Canvas2DRendererAdapterDependencies) {
    super();
    this.canvasRenderLoopService = canvasRenderLoopService;
    this.appState = appState;
    this.logger = loggerFactory.create('StreamingCanvas2DRendererAdapter');

    this._canvasElement = null;
    this._videoElement = null;
    this._isHiddenFn = () => false;
    this._isInitialized = false;
  }

  setHiddenStateFn(isHiddenFn: () => boolean) {
    this._isHiddenFn = isHiddenFn;
  }

  async initialize(
    canvasElement: HTMLCanvasElement,
    nativeResolution?: { width: number; height: number }
  ): Promise<boolean> {
    this.logger.debug('Initializing Canvas2D renderer adapter');

    this._canvasElement = canvasElement;
    await this.canvasRenderLoopService.initialize(canvasElement, nativeResolution);
    this._isInitialized = true;

    this.logger.info('Canvas2D renderer adapter initialized');
    return true;
  }

  async renderFrame(_videoElement: HTMLVideoElement): Promise<void> {
    // Canvas2D handles frame rendering internally via RVFC in startRendering
    // No manual frame-by-frame rendering needed
  }

  resize(width: number, height: number): void {
    if (this._canvasElement) {
      this.canvasRenderLoopService.resize(this._canvasElement, width, height);
    }
  }

  isActive(): boolean {
    return this.canvasRenderLoopService.isActive();
  }

  resume(videoElement: HTMLVideoElement): void {
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

  pause(videoElement?: HTMLVideoElement | null): void {
    this.canvasRenderLoopService.stopRendering(videoElement || this._videoElement);
    this.logger.debug('Canvas2D render loop stopped');
  }

  handlePipelineStop(): void {
    this.clearCanvas();
  }

  /**
   * Cleanup Canvas2D renderer resources
   */
  async cleanup(): Promise<void> {
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
  clearCanvas(): void {
    if (this._canvasElement) {
      this.canvasRenderLoopService.clearCanvas(this._canvasElement);
    }
  }

  /**
   * Reset canvas state (after canvas replacement)
   */
  async resetCanvasState(): Promise<void> {
    await this.canvasRenderLoopService.resetCanvasState();
    this._canvasElement = null;
    this._isInitialized = false;
  }

  // ============================
  // Canvas2D does not support presets
  // ============================

  supportsPresets(): boolean {
    return false;
  }
}
