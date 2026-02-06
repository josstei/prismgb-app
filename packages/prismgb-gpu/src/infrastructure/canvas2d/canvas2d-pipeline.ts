import { BasePipeline, type BasePipelineConfig } from '../base-pipeline';

export class Canvas2DPipeline extends BasePipeline {
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

  async initialize(): Promise<void> {
    if (this._isInitialized) return;

    this.ctx = this.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true
    }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

    if (!this.ctx) {
      throw new Error('Canvas 2D context not available');
    }

    (this.ctx as CanvasRenderingContext2D).imageSmoothingEnabled = false;
    this._isInitialized = true;
    this._isActive = true;
  }

  renderFrame(source: TexImageSource): void {
    if (!this._isActive || !this.ctx) return;

    const startTime = performance.now();

    this.ctx.drawImage(
      source as CanvasImageSource,
      0, 0,
      this.nativeWidth, this.nativeHeight,
      0, 0,
      this.outputWidth, this.outputHeight
    );

    this.updateStats(performance.now() - startTime);
  }

  async captureFrame(): Promise<ImageBitmap> {
    return createImageBitmap(this.canvas as ImageBitmapSource);
  }

  protected onUniformsChanged(): void {
    // Canvas2D doesn't support shader uniforms
  }

  protected onResize(): void {
    // Context handles resize automatically
  }

  releaseResources(): void {
    this._isActive = false;
  }

  async dispose(): Promise<void> {
    this.ctx = null;
    this._isInitialized = false;
  }
}
