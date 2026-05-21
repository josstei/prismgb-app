import {
  createPipeline,
  type IPipeline,
  type IPipelineCapabilities
} from '@prismgb/gpu';
import { getDefaultNativeResolution } from '@shared/features/devices/device-defaults.js';
import type { LoggerLike } from '@shared/interfaces/infrastructure.types.js';

type AnimationCacheLike = {
  cancelAnimation: (name: string) => void;
  cancelAllAnimations: () => void;
};

type NativeResolution = {
  width: number;
  height: number;
};

function createCanvas2DCapabilities(maxTextureSize: number): IPipelineCapabilities {
  return {
    webgpu: false,
    webgl2: false,
    offscreenCanvas: false,
    transferControlToOffscreen: false,
    preferredAPI: 'canvas2d',
    maxTextureSize
  };
}

export class StreamingCanvasRenderLoopService {
  logger: LoggerLike;
  animationCache: AnimationCacheLike;
  _pipeline: IPipeline | null;
  _pipelineCanvas: HTMLCanvasElement | null;
  _isRenderLoopActive: boolean;
  _lastFrameTime: number;
  _rvfcHandle: number | null;
  _loadedDataHandler: (() => void) | null;
  _currentVideoElement: HTMLVideoElement | null;
  _displayWidth: number;
  _displayHeight: number;
  _devicePixelRatio: number;
  _nativeResolution: NativeResolution;

  constructor(logger: LoggerLike, animationCache: AnimationCacheLike) {
    this.logger = logger;
    this.animationCache = animationCache;
    this._pipeline = null;
    this._pipelineCanvas = null;
    this._isRenderLoopActive = false;
    this._lastFrameTime = -1;
    this._rvfcHandle = null;
    this._loadedDataHandler = null;
    this._currentVideoElement = null;
    this._displayWidth = 0;
    this._displayHeight = 0;
    this._devicePixelRatio = 1;
    this._nativeResolution = getDefaultNativeResolution();
  }

  async initialize(
    canvasElement: HTMLCanvasElement,
    nativeResolution: NativeResolution = getDefaultNativeResolution()
  ): Promise<void> {
    const sameNativeResolution = this._nativeResolution.width === nativeResolution.width &&
      this._nativeResolution.height === nativeResolution.height;

    if (this._pipeline && this._pipelineCanvas === canvasElement && sameNativeResolution) {
      return;
    }

    this._nativeResolution = nativeResolution;
    await this._disposePipeline();
    this._pipelineCanvas = canvasElement;
    this._pipeline = await createPipeline({
      canvas: canvasElement,
      nativeWidth: nativeResolution.width,
      nativeHeight: nativeResolution.height,
      preferredAPI: 'canvas2d',
      capabilities: createCanvas2DCapabilities(Math.max(
        canvasElement.width,
        canvasElement.height,
        nativeResolution.width,
        nativeResolution.height
      ))
    });
  }

  startRendering(
    videoElement: HTMLVideoElement,
    canvasElement: HTMLCanvasElement,
    isStreamingFn: () => boolean,
    isHiddenFn: () => boolean
  ): void {
    if (!this._pipeline || this._pipelineCanvas !== canvasElement) {
      this.logger.warn('Canvas render loop cannot start before the package pipeline is initialized');
      return;
    }

    this._isRenderLoopActive = true;
    this._lastFrameTime = -1;
    this._removeLoadedDataListener();
    this._currentVideoElement = videoElement;

    const renderVideoFrame = (now: number, metadata?: VideoFrameCallbackMetadata) => {
      if (!this._isRenderLoopActive || !this._pipeline) return;

      const frameTime = metadata?.mediaTime ?? now;
      if (frameTime !== this._lastFrameTime && videoElement.readyState >= videoElement.HAVE_CURRENT_DATA) {
        this._pipeline.renderFrame(videoElement);
        this._lastFrameTime = frameTime;
      }

      if (isStreamingFn() && !isHiddenFn()) {
        this._rvfcHandle = videoElement.requestVideoFrameCallback(renderVideoFrame);
      }
    };

    this._loadedDataHandler = () => {
      this.logger.debug('Video loaded, starting package Canvas2D render loop');
      this._rvfcHandle = videoElement.requestVideoFrameCallback(renderVideoFrame);
      this._loadedDataHandler = null;
    };
    videoElement.addEventListener('loadeddata', this._loadedDataHandler, { once: true });

    if (videoElement.readyState >= videoElement.HAVE_ENOUGH_DATA) {
      this.logger.debug('Video ready, starting package Canvas2D render loop');
      this._rvfcHandle = videoElement.requestVideoFrameCallback(renderVideoFrame);
    }
  }

  _removeLoadedDataListener(): void {
    if (this._loadedDataHandler && this._currentVideoElement) {
      this._currentVideoElement.removeEventListener('loadeddata', this._loadedDataHandler);
      this._loadedDataHandler = null;
    }
  }

  stopRendering(videoElement?: HTMLVideoElement | null): void {
    this._isRenderLoopActive = false;
    this._removeLoadedDataListener();

    const targetVideo = videoElement ?? this._currentVideoElement;
    if (this._rvfcHandle !== null && targetVideo?.cancelVideoFrameCallback) {
      targetVideo.cancelVideoFrameCallback(this._rvfcHandle);
      this._rvfcHandle = null;
    }

    this._currentVideoElement = null;
    this.animationCache.cancelAnimation('canvasRender');
    this.logger.debug('Package Canvas2D render loop stopped');
  }

  clearCanvas(canvasElement: HTMLCanvasElement): void {
    if (canvasElement !== this._pipelineCanvas || !this._pipeline) {
      this.logger.warn('Canvas cannot be cleared before the package pipeline is initialized');
      return;
    }

    this._pipeline.clearFrame();
    this.logger.debug('Canvas cleared by package pipeline');
  }

  resize(canvasElement: HTMLCanvasElement, width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    const backingWidth = Math.round(width * dpr);
    const backingHeight = Math.round(height * dpr);
    const dimensionsChanged = canvasElement.width !== backingWidth ||
      canvasElement.height !== backingHeight ||
      this._devicePixelRatio !== dpr;

    if (!dimensionsChanged) {
      return;
    }

    this._displayWidth = width;
    this._displayHeight = height;
    this._devicePixelRatio = dpr;
    canvasElement.style.width = `${width}px`;
    canvasElement.style.height = `${height}px`;

    if (this._pipeline && this._pipelineCanvas === canvasElement) {
      this._pipeline.resize(backingWidth, backingHeight);
    } else {
      canvasElement.width = backingWidth;
      canvasElement.height = backingHeight;
    }

    this.logger.debug(`Canvas resized to ${width}x${height} (backing: ${backingWidth}x${backingHeight}, DPR: ${dpr})`);
  }

  isActive(): boolean {
    return this._isRenderLoopActive;
  }

  resetCanvasState(): void {
    this.stopRendering(this._currentVideoElement);
    void this._disposePipeline();
    this._displayWidth = 0;
    this._displayHeight = 0;
    this._devicePixelRatio = 1;
    this._lastFrameTime = -1;
  }

  hasContextFor(canvasElement: HTMLCanvasElement): boolean {
    return this._pipelineCanvas === canvasElement && this._pipeline !== null;
  }

  cleanup(): void {
    this._isRenderLoopActive = false;
    this._removeLoadedDataListener();

    if (this._rvfcHandle !== null && this._currentVideoElement?.cancelVideoFrameCallback) {
      this._currentVideoElement.cancelVideoFrameCallback(this._rvfcHandle);
    }

    this.animationCache.cancelAllAnimations();
    this._rvfcHandle = null;
    this._currentVideoElement = null;
    void this._disposePipeline();
    this._displayWidth = 0;
    this._displayHeight = 0;
    this._devicePixelRatio = 1;
  }

  private async _disposePipeline(): Promise<void> {
    const pipeline = this._pipeline;
    this._pipeline = null;
    this._pipelineCanvas = null;

    if (pipeline) {
      await pipeline.dispose();
    }
  }
}
