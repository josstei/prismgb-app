import type { PipelineUniforms } from '../domain/uniforms';
import type { RenderBackend, RenderCanvas, RenderPipeline, RenderPreset, RenderStats } from '../domain/types';
import { buildUniforms } from '../application/uniform-builder';

export interface BasePipelineConfig {
  canvas: RenderCanvas;
  nativeWidth: number;
  nativeHeight: number;
  preset: RenderPreset;
}

export abstract class BasePipeline implements RenderPipeline {
  abstract readonly backend: RenderBackend;

  protected canvas: RenderCanvas;
  protected nativeWidth: number;
  protected nativeHeight: number;
  protected outputWidth: number;
  protected outputHeight: number;
  protected preset: RenderPreset;
  protected brightness = 1.0;
  protected uniforms: PipelineUniforms;

  protected _isInitialized = false;
  protected _isActive = false;
  protected _framesRendered = 0;
  protected _framesDropped = 0;
  protected _lastFrameTime = 0;
  protected _fps = 0;

  constructor(config: BasePipelineConfig) {
    this.canvas = config.canvas;
    this.nativeWidth = config.nativeWidth;
    this.nativeHeight = config.nativeHeight;
    this.outputWidth = config.canvas.width;
    this.outputHeight = config.canvas.height;
    this.preset = config.preset;
    this.uniforms = this.rebuildUniforms();
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  protected rebuildUniforms(): PipelineUniforms {
    return buildUniforms({
      preset: this.preset,
      nativeWidth: this.nativeWidth,
      nativeHeight: this.nativeHeight,
      outputWidth: this.outputWidth,
      outputHeight: this.outputHeight,
      brightness: this.brightness
    });
  }

  setPreset(preset: RenderPreset): void {
    this.preset = preset;
    this.uniforms = this.rebuildUniforms();
    this.onUniformsChanged();
  }

  getPreset(): RenderPreset {
    return this.preset;
  }

  setBrightness(value: number): void {
    this.brightness = Math.max(0, Math.min(2, value));
    this.uniforms = this.rebuildUniforms();
    this.onUniformsChanged();
  }

  resize(width: number, height: number): void {
    this.outputWidth = width;
    this.outputHeight = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.uniforms = this.rebuildUniforms();
    this.onResize();
  }

  pause(): void {
    this._isActive = false;
  }

  resume(): void {
    if (this._isInitialized) {
      this._isActive = true;
    }
  }

  getStats(): RenderStats {
    return {
      fps: this._fps,
      frameTime: this._lastFrameTime,
      framesRendered: this._framesRendered,
      framesDropped: this._framesDropped
    };
  }

  protected updateStats(frameTime: number): void {
    this._lastFrameTime = frameTime;
    this._framesRendered++;
    this._fps = frameTime > 0 ? 1000 / frameTime : 0;
  }

  abstract initialize(): Promise<void>;
  abstract renderFrame(source: TexImageSource): void;
  abstract captureFrame(): Promise<ImageBitmap>;
  abstract clearFrame(): void;
  abstract releaseResources(): void;
  abstract dispose(): Promise<void>;

  protected abstract onUniformsChanged(): void;
  protected abstract onResize(): void;
}
