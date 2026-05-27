import {
  createPipeline,
  type IPipeline,
  type IPipelineCapabilities
} from '@prismgb/gpu';
import { DisposableBag } from '@shared/base/disposable-bag.js';
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

type VideoFrameCallbackTarget = HTMLVideoElement & {
  requestVideoFrameCallback?: HTMLVideoElement['requestVideoFrameCallback'];
  cancelVideoFrameCallback?: HTMLVideoElement['cancelVideoFrameCallback'];
};

const CANVAS_RENDER_LOOP_LIFECYCLE = Symbol('canvasRenderLoop');
const CANVAS_LOADED_DATA_LIFECYCLE = Symbol('canvasLoadedData');

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
  _currentVideoElement: HTMLVideoElement | null;
  _displayWidth: number;
  _displayHeight: number;
  _devicePixelRatio: number;
  _nativeResolution: NativeResolution;
  private readonly _disposables: DisposableBag;

  constructor(logger: LoggerLike, animationCache: AnimationCacheLike) {
    this.logger = logger;
    this.animationCache = animationCache;
    this._pipeline = null;
    this._pipelineCanvas = null;
    this._isRenderLoopActive = false;
    this._lastFrameTime = -1;
    this._currentVideoElement = null;
    this._displayWidth = 0;
    this._displayHeight = 0;
    this._devicePixelRatio = 1;
    this._nativeResolution = getDefaultNativeResolution();
    this._disposables = new DisposableBag();
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

    this.stopRendering(this._currentVideoElement);
    this._isRenderLoopActive = true;
    this._lastFrameTime = -1;
    this._currentVideoElement = videoElement;
    const frameCallbackTarget = videoElement as VideoFrameCallbackTarget;

    const renderVideoFrame = (now: number, metadata?: VideoFrameCallbackMetadata) => {
      this._disposables.cancel(CANVAS_RENDER_LOOP_LIFECYCLE);
      if (!this._isRenderLoopActive || !this._pipeline) return;

      const frameTime = metadata?.mediaTime ?? now;
      if (frameTime !== this._lastFrameTime && videoElement.readyState >= videoElement.HAVE_CURRENT_DATA) {
        this._pipeline.renderFrame(videoElement);
        this._lastFrameTime = frameTime;
      }

      if (isStreamingFn() && !isHiddenFn()) {
        scheduleRenderFrame();
      } else {
        this.stopRendering(videoElement);
      }
    };

    const scheduleRenderFrame = () => {
      const rvfcHandle = frameCallbackTarget.requestVideoFrameCallback?.(renderVideoFrame);
      if (typeof rvfcHandle !== 'number') {
        this.stopRendering(videoElement);
        return;
      }
      this._disposables.replace(CANVAS_RENDER_LOOP_LIFECYCLE, () => {
        frameCallbackTarget.cancelVideoFrameCallback?.(rvfcHandle);
      });
    };

    const loadedDataHandler = () => {
      this.logger.debug('Video loaded, starting package Canvas2D render loop');
      this._disposables.cancel(CANVAS_LOADED_DATA_LIFECYCLE);
      scheduleRenderFrame();
    };
    videoElement.addEventListener('loadeddata', loadedDataHandler, { once: true });
    this._disposables.replace(CANVAS_LOADED_DATA_LIFECYCLE, () => {
      videoElement.removeEventListener('loadeddata', loadedDataHandler);
    });

    if (videoElement.readyState >= videoElement.HAVE_ENOUGH_DATA) {
      this.logger.debug('Video ready, starting package Canvas2D render loop');
      scheduleRenderFrame();
    }
  }

  stopRendering(_videoElement?: HTMLVideoElement | null): void {
    this._isRenderLoopActive = false;
    this._disposables.cancel(CANVAS_LOADED_DATA_LIFECYCLE);
    this._disposables.cancel(CANVAS_RENDER_LOOP_LIFECYCLE);
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

  async resetCanvasState(): Promise<void> {
    this.stopRendering(this._currentVideoElement);
    await this._disposePipeline();
    this._displayWidth = 0;
    this._displayHeight = 0;
    this._devicePixelRatio = 1;
    this._lastFrameTime = -1;
  }

  hasContextFor(canvasElement: HTMLCanvasElement): boolean {
    return this._pipelineCanvas === canvasElement && this._pipeline !== null;
  }

  async cleanup(): Promise<void> {
    this._isRenderLoopActive = false;
    await this._disposables.clear();

    this.animationCache.cancelAllAnimations();
    this._currentVideoElement = null;
    await this._disposePipeline();
    this._displayWidth = 0;
    this._displayHeight = 0;
    this._devicePixelRatio = 1;
  }

  dispose(): Promise<void> {
    return this.cleanup();
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
