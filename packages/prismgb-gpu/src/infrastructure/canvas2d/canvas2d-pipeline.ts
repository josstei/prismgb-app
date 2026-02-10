import { BasePipeline } from '../base-pipeline';
import type { FrameSource } from '../../domain/frame';
import type { PipelineUniforms } from '../../domain/shaders';
import type { IPipelineOptions, RenderAPI, IAdapterInfo } from '../../domain/pipeline';

export class Canvas2DPipeline extends BasePipeline {
  readonly api: RenderAPI = 'canvas2d';

  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

  getAdapterInfo(): IAdapterInfo | null {
    return null;
  }

  protected async onInitialize(options: IPipelineOptions): Promise<void> {
    this.ctx = this.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true
    }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

    if (!this.ctx) {
      throw new Error('Canvas 2D context not available');
    }

    (this.ctx as CanvasRenderingContext2D).imageSmoothingEnabled = false;
  }

  protected onRenderFrame(source: FrameSource, uniforms: PipelineUniforms): void {
    if (!this.ctx) return;

    this.ctx.drawImage(
      source as CanvasImageSource,
      0, 0,
      this.nativeWidth, this.nativeHeight,
      0, 0,
      this.targetWidth, this.targetHeight
    );
  }

  protected onResize(width: number, height: number): void {
  }

  protected onSuspend(): void {
  }

  protected async onResume(): Promise<void> {
  }

  protected onDispose(): void {
    this.ctx = null;
  }
}
