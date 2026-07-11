import type { PipelineUniforms } from '../domain/uniforms';
import type {
  FrameRenderResult,
  RenderBackend,
  RenderCanvas,
  RenderPipeline,
  RenderPreset,
  RenderStats
} from '../domain/types';
import { buildUniforms } from '../application/uniform-builder';

export interface PipelineControllerConfig {
  canvas: RenderCanvas;
  nativeWidth: number;
  nativeHeight: number;
  preset: RenderPreset;
}

/**
 * The shared pipeline state a {@link RenderDriver} reads while producing frames.
 * The controller owns the state; drivers receive it per call and never store it.
 */
export interface PipelineState {
  readonly canvas: RenderCanvas;
  readonly nativeWidth: number;
  readonly nativeHeight: number;
  readonly outputWidth: number;
  readonly outputHeight: number;
  readonly preset: RenderPreset;
  readonly uniforms: PipelineUniforms;
  readonly isActive: boolean;
  recordFrame(frameTime: number): void;
  deactivate(): void;
}

/**
 * A backend-native renderer. Drivers own only GPU/canvas resources; all shared
 * lifecycle state lives on the {@link PipelineController}.
 */
export interface RenderDriver {
  readonly backend: RenderBackend;
  initialize(state: PipelineState): Promise<void>;
  renderFrame(source: TexImageSource, state: PipelineState): FrameRenderResult;
  resize(state: PipelineState): void;
  clearFrame(state: PipelineState): void;
  captureFrame(state: PipelineState): Promise<ImageBitmap>;
  onUniformsChanged(): void;
  releaseResources(): void;
}

/**
 * Owns pipeline lifecycle and shared state (preset, brightness, uniforms,
 * dimensions, stats, active/initialized flags) and delegates backend-native
 * work to an injected {@link RenderDriver}.
 */
export class PipelineController implements RenderPipeline, PipelineState {
  private readonly driver: RenderDriver;

  readonly canvas: RenderCanvas;
  readonly nativeWidth: number;
  readonly nativeHeight: number;
  outputWidth: number;
  outputHeight: number;
  preset: RenderPreset;
  uniforms: PipelineUniforms;

  private brightness = 1.0;
  private _isInitialized = false;
  private _isActive = false;
  private _framesRendered = 0;
  private _framesDropped = 0;
  private _lastFrameTime = 0;
  private _fps = 0;

  constructor(config: PipelineControllerConfig, driver: RenderDriver) {
    this.driver = driver;
    this.canvas = config.canvas;
    this.nativeWidth = config.nativeWidth;
    this.nativeHeight = config.nativeHeight;
    this.outputWidth = config.canvas.width;
    this.outputHeight = config.canvas.height;
    this.preset = config.preset;
    this.uniforms = this.rebuildUniforms();
  }

  get backend(): RenderBackend {
    return this.driver.backend;
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  private rebuildUniforms(): PipelineUniforms {
    return buildUniforms({
      preset: this.preset,
      nativeWidth: this.nativeWidth,
      nativeHeight: this.nativeHeight,
      outputWidth: this.outputWidth,
      outputHeight: this.outputHeight,
      brightness: this.brightness
    });
  }

  async initialize(): Promise<void> {
    if (this._isInitialized) return;

    await this.driver.initialize(this);
    this._isInitialized = true;
    this._isActive = true;
  }

  renderFrame(source: TexImageSource): FrameRenderResult {
    return this.driver.renderFrame(source, this);
  }

  setPreset(preset: RenderPreset): void {
    this.preset = preset;
    this.uniforms = this.rebuildUniforms();
    this.driver.onUniformsChanged();
  }

  getPreset(): RenderPreset {
    return this.preset;
  }

  setBrightness(value: number): void {
    this.brightness = Math.max(0, Math.min(2, value));
    this.uniforms = this.rebuildUniforms();
    this.driver.onUniformsChanged();
  }

  resize(width: number, height: number): void {
    this.outputWidth = width;
    this.outputHeight = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.uniforms = this.rebuildUniforms();
    this.driver.resize(this);
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

  recordFrame(frameTime: number): void {
    this._lastFrameTime = frameTime;
    this._framesRendered++;
    this._fps = frameTime > 0 ? 1000 / frameTime : 0;
  }

  deactivate(): void {
    this._isActive = false;
  }

  async captureFrame(): Promise<ImageBitmap> {
    return this.driver.captureFrame(this);
  }

  clearFrame(): void {
    this.driver.clearFrame(this);
  }

  releaseResources(): void {
    this.driver.releaseResources();
    this._isActive = false;
    this._isInitialized = false;
  }

  async dispose(): Promise<void> {
    this.releaseResources();
  }
}
