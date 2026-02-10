import type { ICaptureProvider } from '../../domain/pipeline/capture-provider.interface';

export class CaptureBuffer implements ICaptureProvider {
  private _pendingCapture = false;
  private _capturedFrame: ImageBitmap | null = null;
  private _canvas: OffscreenCanvas | HTMLCanvasElement | null;

  constructor(canvas: OffscreenCanvas | HTMLCanvasElement) {
    this._canvas = canvas;
  }

  armCapture(): void {
    this._pendingCapture = true;
  }

  hasPendingCapture(): boolean {
    return this._pendingCapture;
  }

  storeCapture(bitmap: ImageBitmap): void {
    if (this._capturedFrame) {
      this._capturedFrame.close();
    }
    this._capturedFrame = bitmap;
    this._pendingCapture = false;
  }

  retrieveCapture(): ImageBitmap | null {
    const frame = this._capturedFrame;
    this._capturedFrame = null;
    return frame;
  }

  hasCapturedFrame(): boolean {
    return this._capturedFrame !== null;
  }

  async onFrameRendered(): Promise<void> {
    if (!this._pendingCapture || !this._canvas) {
      return;
    }

    const bitmap = await createImageBitmap(this._canvas);
    this.storeCapture(bitmap);
  }

  async captureImmediate(): Promise<ImageBitmap> {
    if (!this._canvas) {
      throw new Error('Canvas not available for capture');
    }
    return createImageBitmap(this._canvas);
  }

  reset(): void {
    if (this._capturedFrame) {
      this._capturedFrame.close();
      this._capturedFrame = null;
    }
    this._pendingCapture = false;
  }

  dispose(): void {
    this.reset();
    this._canvas = null;
  }
}
