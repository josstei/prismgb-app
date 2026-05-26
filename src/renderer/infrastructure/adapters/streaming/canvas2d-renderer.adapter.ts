import type { LoggerFactoryLike, LoggerLike } from '@shared/interfaces/infrastructure.types.js';

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

export interface Canvas2DRendererAdapterDependencies {
  canvasRenderLoopService: CanvasRenderLoopServiceLike;
  appState: AppStateLike;
  loggerFactory: LoggerFactoryLike;
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

  clearCanvas(): void {
    if (this._canvasElement) {
      this.canvasRenderLoopService.clearCanvas(this._canvasElement);
    }
  }

  async resetCanvasState(): Promise<void> {
    await this.canvasRenderLoopService.resetCanvasState();
    this._canvasElement = null;
    this._isInitialized = false;
  }

  supportsPresets(): boolean {
    return false;
  }
}
