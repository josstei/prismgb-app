export class Canvas2dDriver {
  private ctx: CanvasRenderingContext2D | null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly nativeWidth: number,
    private readonly nativeHeight: number
  ) {
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) {
      throw new Error('Canvas 2D context not available');
    }

    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
  }

  renderFrame(source: CanvasImageSource): void {
    this.ctx?.drawImage(
      source,
      0, 0, this.nativeWidth, this.nativeHeight,
      0, 0, this.canvas.width, this.canvas.height
    );
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;

    // Resizing a canvas resets its 2D context state, smoothing included.
    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = false;
    }
  }

  captureFrame(): Promise<ImageBitmap> {
    return createImageBitmap(this.canvas);
  }

  dispose(): void {
    this.ctx = null;
  }
}
