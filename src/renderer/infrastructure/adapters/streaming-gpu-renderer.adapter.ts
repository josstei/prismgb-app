import type { LoggerFactoryLike, LoggerLike } from '@prismgb/core';

import { IStreamingRenderer } from './streaming-renderer.interface';
import type { StreamingRendererCleanupOptions } from './streaming-renderer.interface';

type GpuCleanupOptions = {
  emitCanvasExpired?: boolean;
};

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
  cleanup(options?: GpuCleanupOptions): void | Promise<void>;
}

interface GpuRenderLoopServiceLike {
  start(config: { videoElement: HTMLVideoElement; renderFrame: () => Promise<void>; shouldContinue: () => boolean }): void;
  stop(videoElement: HTMLVideoElement): void;
}

interface AppStateLike {
  readonly isStreaming: boolean;
}

export interface GpuRendererAdapterDependencies {
  gpuRendererService: GpuRendererServiceLike;
  gpuRenderLoopService: GpuRenderLoopServiceLike;
  appState: AppStateLike;
  loggerFactory: LoggerFactoryLike;
}

export class StreamingGpuRendererAdapter extends IStreamingRenderer {
  gpuRendererService: GpuRendererServiceLike;
  gpuRenderLoopService: GpuRenderLoopServiceLike;
  appState: AppStateLike;
  logger: LoggerLike;
  _videoElement: HTMLVideoElement | null;
  _isHiddenFn: () => boolean;
  _renderLoopActive: boolean;

  constructor({ gpuRendererService, gpuRenderLoopService, appState, loggerFactory }: GpuRendererAdapterDependencies) {
    super();
    this.gpuRendererService = gpuRendererService;
    this.gpuRenderLoopService = gpuRenderLoopService;
    this.appState = appState;
    this.logger = loggerFactory.create('StreamingGpuRendererAdapter');

    this._videoElement = null;
    this._isHiddenFn = () => false;
    this._renderLoopActive = false;
  }

  setHiddenStateFn(isHiddenFn: () => boolean) {
    this._isHiddenFn = isHiddenFn;
  }

  async initialize(
    canvasElement: HTMLCanvasElement,
    nativeResolution: { width: number; height: number }
  ): Promise<boolean> {
    this.logger.debug('Initializing GPU renderer adapter');

    const gpuAvailable = await this.gpuRendererService.initialize(canvasElement, nativeResolution);

    if (!gpuAvailable) {
      this.logger.warn('GPU rendering not available');
      return false;
    }

    this.logger.info('GPU renderer adapter initialized');
    return true;
  }

  async renderFrame(videoElement: HTMLVideoElement): Promise<void> {
    return this.gpuRendererService.renderFrame(videoElement);
  }

  resize(width: number, height: number): void {
    this.gpuRendererService.resize(width, height);
  }

  isActive(): boolean {
    return this.gpuRendererService.isActive();
  }

  resume(videoElement: HTMLVideoElement): void {
    if (this._renderLoopActive) {
      return;
    }

    this._videoElement = videoElement;
    this._renderLoopActive = true;

    this.gpuRenderLoopService.start({
      videoElement,
      renderFrame: async () => this.gpuRendererService.renderFrame(videoElement),
      shouldContinue: () => this.appState.isStreaming && !this._isHiddenFn()
    });

    this.logger.debug('GPU render loop started');
  }

  pause(videoElement?: HTMLVideoElement | null): void {
    if (!this._renderLoopActive) {
      return;
    }

    this._renderLoopActive = false;
    const resolvedVideoElement = videoElement ?? this._videoElement;
    if (resolvedVideoElement) {
      this.gpuRenderLoopService.stop(resolvedVideoElement);
    }
    this.logger.debug('GPU render loop stopped');
  }

  async cleanup(options: StreamingRendererCleanupOptions = {}): Promise<void> {
    if (this._videoElement) {
      this.gpuRenderLoopService.stop(this._videoElement);
    }
    this._renderLoopActive = false;
    this._videoElement = null;
    await this.gpuRendererService.cleanup({
      emitCanvasExpired: options.emitCanvasExpired ?? true
    });
    this.logger.info('GPU renderer adapter cleaned up');
  }

  supportsPresets(): boolean {
    return true;
  }

  getPresetId(): string | null {
    return this.gpuRendererService.getPresetId();
  }

  setPreset(presetId: string): void {
    this.gpuRendererService.setPreset(presetId);
  }

  isCanvasTransferred(): boolean {
    return this.gpuRendererService.isCanvasTransferred();
  }

  releaseGpuResources(): void {
    this.gpuRendererService.releaseGpuResources();
  }

  terminateAndReset(emitCanvasExpired = true): void {
    if (this._videoElement) {
      this.gpuRenderLoopService.stop(this._videoElement);
    }
    this._renderLoopActive = false;
    this._videoElement = null;
    this.gpuRendererService.terminateAndReset(emitCanvasExpired);
  }
}
