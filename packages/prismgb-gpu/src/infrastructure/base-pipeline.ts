import type { IPipeline, IPipelineStats, IPipelineOptions, PipelineState, IPipelineError, IAdapterInfo, RenderAPI } from '../domain/pipeline';
import type { FrameSource } from '../domain/frame';
import type { PipelineUniforms } from '../domain/shaders';
import type { PipelineErrorCode } from '../domain/pipeline/pipeline-error.interface';

export abstract class BasePipeline implements IPipeline {
  protected canvas!: HTMLCanvasElement | OffscreenCanvas;
  protected nativeWidth!: number;
  protected nativeHeight!: number;
  protected targetWidth!: number;
  protected targetHeight!: number;

  private _state: PipelineState = 'uninitialized';
  private _lastError: IPipelineError | null = null;

  protected callbacks = {
    onError: undefined as ((error: IPipelineError) => void) | undefined,
    onStats: undefined as ((stats: IPipelineStats) => void) | undefined,
    onStateChange: undefined as ((state: PipelineState) => void) | undefined
  };

  private _framesRendered = 0;
  private _framesDropped = 0;

  private readonly frameTimeWindow: number[] = [];
  private readonly windowSize = 60;
  private lastStatsEmit = 0;
  private readonly statsEmitInterval = 1000;

  get state(): PipelineState {
    return this._state;
  }

  get lastError(): IPipelineError | null {
    return this._lastError;
  }

  abstract get api(): RenderAPI;
  abstract getAdapterInfo(): IAdapterInfo | null;

  async initialize(options: IPipelineOptions): Promise<void> {
    this.assertState(['uninitialized'], 'initialize');

    this.canvas = options.canvas;
    this.nativeWidth = options.config.nativeWidth;
    this.nativeHeight = options.config.nativeHeight;
    this.targetWidth = options.config.targetWidth;
    this.targetHeight = options.config.targetHeight;

    if (options.callbacks) {
      this.callbacks.onError = options.callbacks.onError;
      this.callbacks.onStats = options.callbacks.onStats;
      this.callbacks.onStateChange = options.callbacks.onStateChange;
    }

    try {
      await this.onInitialize(options);
      this.transitionTo('ready');
    } catch (error) {
      const pipelineError = this.handleError(
        'INIT_FAILED',
        error instanceof Error ? error.message : String(error),
        false
      );
      throw pipelineError;
    }
  }

  suspend(): void {
    this.assertState(['ready'], 'suspend');
    this.onSuspend();
    this.transitionTo('suspended');
  }

  async resume(): Promise<void> {
    this.assertState(['suspended'], 'resume');
    try {
      await this.onResume();
      this.transitionTo('ready');
    } catch (error) {
      this.handleError(
        'GPU_ERROR',
        error instanceof Error ? error.message : String(error),
        false
      );
      throw error;
    }
  }

  dispose(): void {
    if (this._state === 'disposed') return;

    this.onDispose();
    this.transitionTo('disposed');

    this.callbacks.onError = undefined;
    this.callbacks.onStats = undefined;
    this.callbacks.onStateChange = undefined;
  }

  renderFrame(source: FrameSource, uniforms: PipelineUniforms): void {
    if (this._state !== 'ready') return;

    const startTime = performance.now();

    try {
      this.onRenderFrame(source, uniforms);
      const frameTime = performance.now() - startTime;
      this.updateStats(frameTime);
    } catch (error) {
      this._framesDropped++;
      this.handleError(
        'RENDER_FAILED',
        error instanceof Error ? error.message : String(error),
        true
      );
    }
  }

  resize(width: number, height: number): void {
    this.assertState(['ready', 'suspended'], 'resize');

    this.targetWidth = width;
    this.targetHeight = height;
    this.canvas.width = width;
    this.canvas.height = height;

    this.onResize(width, height);
  }

  getStats(): IPipelineStats {
    const avgFrameTime = this.frameTimeWindow.length > 0
      ? this.frameTimeWindow.reduce((a, b) => a + b, 0) / this.frameTimeWindow.length
      : 0;

    const fps = avgFrameTime > 0 ? 1000 / avgFrameTime : 0;

    return {
      fps,
      frameTime: avgFrameTime,
      framesRendered: this._framesRendered,
      framesDropped: this._framesDropped
    };
  }

  protected abstract onInitialize(options: IPipelineOptions): Promise<void>;
  protected abstract onRenderFrame(source: FrameSource, uniforms: PipelineUniforms): void;
  protected abstract onResize(width: number, height: number): void;
  protected abstract onSuspend(): void;
  protected abstract onResume(): Promise<void>;
  protected abstract onDispose(): void;

  protected assertState(allowed: PipelineState[], operation: string): void {
    if (!allowed.includes(this._state)) {
      throw new Error(
        `Cannot ${operation} from state '${this._state}'. Allowed: [${allowed.join(', ')}]`
      );
    }
  }

  protected transitionTo(newState: PipelineState): void {
    if (this._state === newState) return;

    this._state = newState;

    if (this.callbacks.onStateChange) {
      this.callbacks.onStateChange(newState);
    }
  }

  protected handleError(code: PipelineErrorCode, message: string, recoverable: boolean): IPipelineError {
    const error: IPipelineError = {
      code,
      message,
      recoverable,
      adapterInfo: this.getAdapterInfo()
    };

    this._lastError = error;

    if (!recoverable) {
      this.transitionTo('error');
    }

    if (this.callbacks.onError) {
      this.callbacks.onError(error);
    }

    return error;
  }

  private updateStats(frameTime: number): void {
    this._framesRendered++;

    this.frameTimeWindow.push(frameTime);
    if (this.frameTimeWindow.length > this.windowSize) {
      this.frameTimeWindow.shift();
    }

    const now = performance.now();
    if (now - this.lastStatsEmit >= this.statsEmitInterval) {
      this.lastStatsEmit = now;
      if (this.callbacks.onStats) {
        this.callbacks.onStats(this.getStats());
      }
    }
  }
}
