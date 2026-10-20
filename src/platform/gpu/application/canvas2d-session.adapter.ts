import { Canvas2dDriver } from '../infrastructure/canvas2d.driver';
import type { GpuVideoRendererSession, GpuVideoRendererSessionOptions } from './video-session.factory';

export class Canvas2dSessionAdapter implements GpuVideoRendererSession {
  readonly backend = 'canvas2d' as const;
  readonly isCanvasTransferred = false;

  private active = true;
  private readonly nativeWidth: number;
  private readonly nativeHeight: number;
  private readonly onCanvasExpired?: () => void;

  private constructor(private readonly driver: Canvas2dDriver, options: GpuVideoRendererSessionOptions) {
    this.nativeWidth = options.nativeResolution.width;
    this.nativeHeight = options.nativeResolution.height;
    this.onCanvasExpired = options.onCanvasExpired;
  }

  static create(options: GpuVideoRendererSessionOptions): Canvas2dSessionAdapter {
    const { width, height } = options.nativeResolution;
    let driver: Canvas2dDriver;

    try {
      driver = new Canvas2dDriver(options.canvas, width, height);
    } catch (error) {
      (options.logger ?? console).error('Failed to initialize local Canvas2D pipeline:', error);
      options.onError?.({
        message: error instanceof Error ? error.message : String(error),
        code: 'INIT_FAILED'
      });
      throw error;
    }

    options.onReady?.({ backend: 'canvas2d' });
    return new Canvas2dSessionAdapter(driver, options);
  }

  get isActive(): boolean {
    return this.active;
  }

  async renderFrame(video: HTMLVideoElement): Promise<void> {
    if (this.active && video.readyState >= video.HAVE_CURRENT_DATA) {
      this.driver.renderFrame(video);
    }
  }

  resize(width: number, height: number): void {
    if (!this.active) return;

    const dpr = window.devicePixelRatio || 1;
    this.driver.resize(Math.round(width * dpr), Math.round(height * dpr));
  }

  // Canvas2D draws native frames unprocessed: presets and brightness apply only to the WebGPU pipeline.
  setPreset(): void {}

  setBrightness(): void {}

  getTargetDimensions(): { width: number; height: number } {
    return { width: this.nativeWidth, height: this.nativeHeight };
  }

  async captureFrame(): Promise<ImageBitmap> {
    if (!this.active) {
      throw new Error('Session is not active');
    }
    return this.driver.captureFrame();
  }

  terminate(options?: { emitCanvasExpired?: boolean }): void {
    this.active = false;
    this.driver.dispose();

    if (options?.emitCanvasExpired) {
      this.onCanvasExpired?.();
    }
  }
}
