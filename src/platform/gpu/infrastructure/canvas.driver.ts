import type {
  FrameRenderResult,
  WebGpuFrameInstrumentationObserver,
  WebGpuLifecycleInstrumentationObserver
} from '../domain/types';
import type { PipelineState, RenderDriver } from './pipeline-controller';

export class CanvasDriver implements RenderDriver {
  readonly backend = 'canvas2d' as const;

  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

  async initialize(
    state: PipelineState,
    _lifecycleInstrumentationObserver?: WebGpuLifecycleInstrumentationObserver
  ): Promise<void> {
    this.ctx = state.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true
    }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

    if (!this.ctx) {
      throw new Error('Canvas 2D context not available');
    }

    this.disableImageSmoothing();
  }

  renderFrame(
    source: TexImageSource,
    state: PipelineState,
    _instrumentationObserver?: WebGpuFrameInstrumentationObserver
  ): FrameRenderResult {
    if (!state.isActive || !this.ctx) {
      if (typeof __PRISMGB_PERF_HARNESS__ !== 'undefined' && __PRISMGB_PERF_HARNESS__) {
        return { outcome: 'skipped-inactive' };
      }
      return undefined;
    }

    const startTime = performance.now();

    this.ctx.drawImage(
      source as CanvasImageSource,
      0, 0,
      state.nativeWidth, state.nativeHeight,
      0, 0,
      state.outputWidth, state.outputHeight
    );

    state.recordFrame(performance.now() - startTime);
    if (typeof __PRISMGB_PERF_HARNESS__ !== 'undefined' && __PRISMGB_PERF_HARNESS__) {
      return { outcome: 'canvas-draw-completed' };
    }
    return undefined;
  }

  async captureFrame(state: PipelineState): Promise<ImageBitmap> {
    return createImageBitmap(state.canvas as ImageBitmapSource);
  }

  clearFrame(state: PipelineState): void {
    if (!this.ctx) return;

    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, state.outputWidth, state.outputHeight);
  }

  onUniformsChanged(): void {
    // Canvas2D has no shader uniform state.
  }

  resize(_state: PipelineState, _lifecycleInstrumentationObserver?: WebGpuLifecycleInstrumentationObserver): void {
    this.disableImageSmoothing();
  }

  private disableImageSmoothing(): void {
    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = false;
    }
  }

  releaseResources(): void {
    this.ctx = null;
  }
}
