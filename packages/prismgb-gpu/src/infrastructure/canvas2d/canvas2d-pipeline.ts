import { BasePipeline } from '../pipeline-base';

export class Canvas2DPipeline extends BasePipeline {
  readonly backend = 'canvas2d' as const;

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

    this.disableImageSmoothing();
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

  clearFrame(): void {
    if (!this.ctx) return;

    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.outputWidth, this.outputHeight);
  }

  protected onUniformsChanged(): void {
    // Canvas2D doesn't support shader uniforms
  }

  protected onResize(): void {
    this.disableImageSmoothing();
  }

  private disableImageSmoothing(): void {
    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = false;
    }
  }

  releaseResources(): void {
    this._isActive = false;
    this._isInitialized = false;
    this.ctx = null;
  }

  async dispose(): Promise<void> {
    this.releaseResources();
  }
}
