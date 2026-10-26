import type { PipelineState, RenderDriver } from './pipeline-controller';

export class CanvasDriver implements RenderDriver {
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

  async initialize(state: PipelineState): Promise<void> {
    this.ctx = state.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true
    }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

    if (!this.ctx) {
      throw new Error('Canvas 2D context not available');
    }

    this.disableImageSmoothing();
  }

  renderFrame(source: TexImageSource, state: PipelineState): void {
    if (!state.isActive || !this.ctx) return;

    this.ctx.drawImage(
      source as CanvasImageSource,
      0, 0,
      state.nativeWidth, state.nativeHeight,
      0, 0,
      state.outputWidth, state.outputHeight
    );
  }

  async captureFrame(state: PipelineState): Promise<ImageBitmap> {
    return createImageBitmap(state.canvas as ImageBitmapSource);
  }

  onUniformsChanged(): void {
    // Canvas2D has no shader uniform state.
  }

  resize(): void {
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
